import { afterEach, expect, it, vi } from 'vitest';
import { type AddressInfo } from 'node:net';
import { createApp } from '@amp/server';
import { CatalogSchema, type LobbySnapshot } from '@amp/core';
import { catalogInput } from './fixtures/catalog.js';

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  try {
    for (const close of closers.splice(0)) await close();
  } finally {
    vi.useRealTimers();
  }
});
async function fixture() {
  // Only the application intervals are controlled; HTTP and SSE are real.
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  let clock = Date.parse('2026-09-25T00:00:00Z');
  const app = createApp({
    catalog: CatalogSchema.parse(catalogInput()),
    now: () => clock,
  });
  await new Promise<void>((resolve) =>
    app.server.listen(0, '127.0.0.1', resolve),
  );
  closers.push(app.close);
  const base = 'http://127.0.0.1:' + (app.server.address() as AddressInfo).port;
  const created = await fetch(base + '/api/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname: 'Host' }),
  });
  const cookie = created.headers.get('set-cookie')!.split(';')[0]!;
  const request = (path: string, data?: unknown) =>
    fetch(base + path, {
      method: data === undefined ? 'GET' : 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
  const abort = new AbortController();
  closers.unshift(() => {
    abort.abort();
    return Promise.resolve();
  });
  const events = await fetch(base + '/api/events', {
    headers: { Cookie: cookie },
    signal: abort.signal,
  });
  const tokens: string[] = [];
  const reader = events.body!.getReader();
  void (async () => {
    let buffer = '';
    const decoder = new TextDecoder();
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        let end;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const event = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          if (event.startsWith('event: heartbeat\ndata: '))
            tokens.push(
              (JSON.parse(event.split('\ndata: ')[1]!) as { token: string })
                .token,
            );
        }
      }
    } catch {
      /* Fixture closes the stream. */
    }
  })();
  await expect.poll(() => tokens.length).toBe(1);
  const reply = (token: string, visible = true) =>
    request('/api/heartbeat', { token, visible });
  const state = async () =>
    ((await (await request('/api/state')).json()) as { room: LobbySnapshot })
      .room;
  return {
    tokens,
    reply,
    request,
    state,
    advance: async (ms: number) => {
      clock += ms;
      await vi.advanceTimersByTimeAsync(5000);
    },
  };
}

it('renews an unanswered expired challenge, rejects old/replayed replies and keeps readiness cleared', async () => {
  const f = await fixture(),
    old = f.tokens[0]!;
  expect(
    (await f.request('/api/commands', { type: 'ready', ready: true })).status,
  ).toBe(200);
  expect((await f.state()).members[0]!.lobbyReady).toBe(true);
  await f.advance(15_001);
  await expect.poll(() => f.tokens.length).toBe(2);
  expect((await f.state()).members[0]).toMatchObject({
    online: false,
    lobbyReady: false,
  });
  expect((await f.reply(old)).status).toBe(409);
  expect((await f.reply('forged')).status).toBe(409);
  expect((await f.state()).members[0]!.online).toBe(false);
  expect((await f.reply(f.tokens[1]!)).status).toBe(200);
  expect((await f.reply(f.tokens[1]!)).status).toBe(409);
  expect((await f.state()).members[0]).toMatchObject({
    online: true,
    lobbyReady: false,
  });
});

it('preserves an unexpired challenge and requires a visible fresh reply to restore online state', async () => {
  const f = await fixture();
  await f.advance(15_000);
  // The boundary remains inclusive, matching the HTTP validation rule.
  expect((await f.reply(f.tokens[0]!, false)).status).toBe(200);
  expect((await f.state()).members[0]!.online).toBe(false);
  await f.advance(5000);
  await expect.poll(() => f.tokens.length).toBe(2);
  expect((await f.state()).members[0]!.online).toBe(false);
  expect((await f.reply(f.tokens[1]!)).status).toBe(200);
  expect((await f.state()).members[0]).toMatchObject({
    online: true,
    lobbyReady: false,
  });
});
