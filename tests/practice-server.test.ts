import { afterEach, expect, it } from 'vitest';
import { type AddressInfo } from 'node:net';
import { createApp } from '@amp/server';
import { type LobbySnapshot } from '@amp/core';
import { duelCatalog } from './fixtures/duel.js';

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});
async function fixture(practice: boolean) {
  const catalog = duelCatalog();
  const app = createApp({
    practice,
    catalog,
    verifiedQuestionIds: catalog.questions.map((q) => q.questionId),
  });
  await new Promise<void>((r) => app.server.listen(0, '127.0.0.1', r));
  closers.push(app.close);
  const base = 'http://127.0.0.1:' + (app.server.address() as AddressInfo).port;
  let cookie = '';
  const request = (path: string, data?: unknown, authenticated = true) =>
    fetch(base + path, {
      method: data === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: authenticated ? cookie : '',
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
  const response = await request('/api/rooms', { nickname: '测试玩家' });
  expect(response.status).toBe(201);
  cookie = response.headers.get('set-cookie')!.split(';')[0]!;
  const entry = (await response.json()) as { room: LobbySnapshot };
  return { request, entry };
}
it('creates an isolated computer opponent and rejects other players/modes even without UI', async () => {
  const f = await fixture(true);
  expect(f.entry.room.members).toHaveLength(2);
  expect(f.entry.room.members[1]!.nickname).toBe('电脑陪练（规则）');
  expect(await (await f.request('/api/health')).json()).toMatchObject({
    practice: true,
  });
  expect(
    (
      await f.request(
        '/api/rooms/' + f.entry.room.roomId + '/join',
        { nickname: '第三人' },
        false,
      )
    ).status,
  ).toBe(403);
  expect(
    (await f.request('/api/commands', { type: 'mode', mode: 'multiplayer' }))
      .status,
  ).toBe(403);
  expect((await f.request('/api/tournament/command', {})).status).toBe(403);
  expect((await f.request('/api/multiplayer/prepare', {})).status).toBe(403);
  await expect
    .poll(async () => {
      const state = (await (await f.request('/api/state')).json()) as {
        room: LobbySnapshot;
      };
      return state.room.members[1]!.lobbyReady;
    })
    .toBe(true);
  expect((await f.request('/api/commands', { type: 'leave' })).status).toBe(
    200,
  );
  expect((await f.request('/api/duel')).status).toBe(401);
});
it('leaves normal two-human room admission unchanged', async () => {
  const f = await fixture(false);
  expect(f.entry.room.members).toHaveLength(1);
  expect(
    (
      await f.request(
        '/api/rooms/' + f.entry.room.roomId + '/join',
        { nickname: '真人' },
        false,
      )
    ).status,
  ).toBe(201);
  expect(await (await f.request('/api/health')).json()).toMatchObject({
    practice: false,
  });
});
