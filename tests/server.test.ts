import { afterEach, expect, it } from 'vitest';
import { mkdtemp, writeFile, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type AddressInfo } from 'node:net';
import { CatalogSchema, type LobbySnapshot } from '@amp/core';
import { createApp } from '@amp/server';
import { catalogInput } from './fixtures/catalog.js';
const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});
async function fixture(mediaFiles?: ReadonlyMap<string, string>) {
  const app = createApp({
    catalog: CatalogSchema.parse(catalogInput()),
    ...(mediaFiles ? { mediaFiles } : {}),
  });
  await new Promise<void>((resolve) =>
    app.server.listen(0, '127.0.0.1', resolve),
  );
  closers.push(app.close);
  const base = 'http://127.0.0.1:' + (app.server.address() as AddressInfo).port;
  const request = async (
    path: string,
    data?: unknown,
    cookie = '',
    headers: Record<string, string> = {},
  ) =>
    fetch(base + path, {
      method: data === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
  const create = await request('/api/rooms', { nickname: 'Host' });
  const host = create.headers.get('set-cookie')!.split(';')[0]!;
  const entry = (await create.json()) as {
    playerId: string;
    room: LobbySnapshot;
  };
  const join = await request('/api/rooms/' + entry.room.roomId + '/join', {
    nickname: 'Guest',
  });
  const guest = join.headers.get('set-cookie')!.split(';')[0]!;
  return { request, host, guest, entry, base };
}
it('creates random HttpOnly sessions and rejects client role/player spoofing', async () => {
  const { request, host, guest, entry } = await fixture();
  expect(host).toMatch(/^amp_session=[a-f0-9]{48}$/);
  expect(host).not.toBe(guest);
  expect(
    (
      await request(
        '/api/commands',
        { type: 'preset', preset: 'standard' },
        guest,
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await request(
        '/api/commands',
        { type: 'ready', ready: true, playerId: entry.playerId, role: 'host' },
        guest,
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await request(
        '/api/commands',
        { type: 'ready', ready: true },
        'amp_session=fake',
      )
    ).status,
  ).toBe(401);
  expect(
    (
      await request('/api/commands', { type: 'ready', ready: true }, host, {
        Origin: 'https://attacker.example',
      })
    ).status,
  ).toBe(403);
  expect(
    (await request('/api/commands', { type: 'preset', preset: '25v25' }, host))
      .status,
  ).toBe(400);
  expect(
    (
      await request(
        '/api/commands',
        { type: 'preset', preset: 'standard' },
        host,
      )
    ).status,
  ).toBe(200);
  expect((await request('/api/materials', undefined, guest)).status).toBe(403);
});
it('keeps two sessions consistent, profile is own-only, and members cannot silently replace session', async () => {
  const { request, host, guest } = await fixture();
  expect(
    (await request('/api/rooms', { nickname: 'Other' }, host)).status,
  ).toBe(409);
  await request('/api/commands', { type: 'ready', ready: true }, host);
  await request('/api/commands', { type: 'ready', ready: true }, guest);
  const before = (await (
    await request('/api/state', undefined, host)
  ).json()) as { room: LobbySnapshot };
  expect(before.room.members.every((m) => m.lobbyReady)).toBe(true);
  await request(
    '/api/commands',
    {
      type: 'profile',
      preferences: {
        tagIds: [],
        reports: [{ songId: 'song:1', recognitionLevel: 'familiar' }],
      },
    },
    guest,
  );
  const a = (await (await request('/api/state', undefined, host)).json()) as {
    room: LobbySnapshot;
  };
  const b = (await (await request('/api/state', undefined, guest)).json()) as {
    room: LobbySnapshot;
  };
  expect(a.room).toEqual(b.room);
  expect(a.room.members.every((m) => !m.lobbyReady)).toBe(true);
  expect(JSON.stringify(a.room)).not.toContain('songEvidence');
  expect(
    (await request('/api/commands', { type: 'start', role: 'host' }, host))
      .status,
  ).toBe(400);
});
it('streams real state and marks disconnect offline with readiness cleared', async () => {
  const { request, host, guest, base } = await fixture();
  const controller = new AbortController();
  const events = await fetch(base + '/api/events', {
    headers: { Cookie: guest },
    signal: controller.signal,
  });
  const reader = events.body!.getReader();
  expect(new TextDecoder().decode((await reader.read()).value)).toContain(
    'data:',
  );
  await request('/api/commands', { type: 'ready', ready: true }, host);
  await request('/api/commands', { type: 'ready', ready: true }, guest);
  controller.abort();
  await expect
    .poll(async () => {
      const state = (await (
        await request('/api/state', undefined, host)
      ).json()) as { room: LobbySnapshot };
      return state.room.members.filter((m) => !m.online).length;
    })
    .toBe(1);
  const state = (await (
    await request('/api/state', undefined, host)
  ).json()) as { room: LobbySnapshot };
  expect(state.room.members.every((m) => !m.lobbyReady)).toBe(true);
});
it('host ending a room revokes every session', async () => {
  const { request, host, guest } = await fixture();
  expect((await request('/api/commands', { type: 'leave' }, host)).status).toBe(
    200,
  );
  expect((await request('/api/state', undefined, host)).status).toBe(401);
  expect((await request('/api/state', undefined, guest)).status).toBe(401);
});

it('serves only host-authorized mapped audio and validates byte ranges', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'amp-preview-'));
  const file = join(directory, 'audio.mp3');
  await writeFile(file, Buffer.from('0123456789'));
  try {
    const { request, host, guest } = await fixture(
      new Map([['preview', file]]),
    );
    expect(
      (await request('/api/materials/preview/audio', undefined, guest)).status,
    ).toBe(403);
    const response = await request(
      '/api/materials/preview/audio',
      undefined,
      host,
      { Range: 'bytes=2-5' },
    );
    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe('bytes 2-5/10');
    expect(await response.text()).toBe('2345');
    for (const range of [
      'bytes=8-3',
      'bytes=99-',
      'bytes=0-99',
      'bytes=0-1,3-4',
    ])
      expect(
        (
          await request('/api/materials/preview/audio', undefined, host, {
            Range: range,
          })
        ).status,
      ).toBe(416);
    expect(
      (await request('/api/materials/unknown/audio', undefined, host)).status,
    ).toBe(404);
  } finally {
    await rm(file, { force: true });
    await rmdir(directory);
  }
});
