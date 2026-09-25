import { afterEach, expect, it } from 'vitest';
import { type AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { createApp } from '@amp/server';
import {
  type DuelPreparationView,
  type LobbySnapshot,
  DUEL_PRESETS,
} from '@amp/core';
import { duelCatalog } from './fixtures/duel.js';
const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});
async function fixture() {
  let clock = Date.parse('2026-09-24T00:00:00Z');
  const catalog = duelCatalog();
  const app = createApp({
    catalog,
    verifiedQuestionIds: catalog.questions.map((q) => q.questionId),
    now: () => clock,
  });
  await new Promise<void>((r) => app.server.listen(0, '127.0.0.1', r));
  closers.push(app.close);
  const base = 'http://127.0.0.1:' + (app.server.address() as AddressInfo).port;
  const request = (path: string, cookie = '', data?: unknown) =>
    fetch(base + path, {
      method: data === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
  const h = await request('/api/rooms', '', { nickname: 'Host' });
  const host = h.headers.get('set-cookie')!.split(';')[0]!;
  const entry = (await h.json()) as { playerId: string; room: LobbySnapshot };
  const g = await request('/api/rooms/' + entry.room.roomId + '/join', '', {
    nickname: 'Guest',
  });
  const guest = g.headers.get('set-cookie')!.split(';')[0]!;
  const streams: AbortController[] = [];
  async function connect(cookie: string) {
    const abort = new AbortController();
    streams.push(abort);
    const response = await fetch(base + '/api/events', {
      headers: { Cookie: cookie },
      signal: abort.signal,
    });
    const reader = response.body!.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    const token = JSON.parse(
      first.split('event: heartbeat\ndata: ')[1]!.split('\n')[0]!,
    ) as { token: string };
    expect(
      (await request('/api/heartbeat', cookie, { ...token, visible: true }))
        .status,
    ).toBe(200);
    void (async () => {
      try {
        while (!(await reader.read()).done) {
          /* Drain without acknowledging future challenges: blackhole scenario. */
        }
      } catch {
        /* Disconnected. */
      }
    })();
  }
  closers.unshift(() => {
    for (const s of streams) s.abort();
    return Promise.resolve();
  });
  const view = async (cookie = host) =>
    (await (await request('/api/duel', cookie)).json()) as DuelPreparationView;
  const cmd = async (cookie: string, input: Record<string, unknown>) =>
    request('/api/duel/prepare', cookie, {
      actionId: randomUUID(),
      expectedVersion: (await view(cookie)).version,
      ...input,
    });
  async function draft(preset: 'quick' | 'standard') {
    await connect(host);
    await connect(guest);
    await request('/api/commands', host, { type: 'preset', preset });
    for (const c of [host, guest])
      await request('/api/commands', c, { type: 'ready', ready: true });
    expect((await cmd(host, { type: 'begin' })).status).toBe(200);
    for (const c of [host, guest])
      expect(
        (
          await cmd(c, {
            type: 'select',
            songIds: (await view(c)).ownPool.slice(
              0,
              DUEL_PRESETS[preset].selectPerPlayer,
            ),
          })
        ).status,
      ).toBe(200);
    for (const c of [host, guest])
      expect(
        (
          await cmd(c, {
            type: 'ban',
            songIds: (await view(c)).banChoices.slice(
              0,
              DUEL_PRESETS[preset].banPerPlayer,
            ),
          })
        ).status,
      ).toBe(200);
    await cmd(host, { type: 'acknowledge' });
    await cmd(host, {
      type: 'match_ready',
      cardsLoaded: true,
      audioReady: true,
    });
    await cmd(guest, {
      type: 'match_ready',
      cardsLoaded: true,
      audioReady: false,
    });
    expect((await cmd(host, { type: 'start' })).status).toBe(200);
  }
  const action = async (
    cookie: string,
    type: string,
    extra: Record<string, unknown> = {},
  ) => {
    const game = (await view()).game!;
    return request('/api/duel/action', cookie, {
      type,
      actionId: randomUUID(),
      gameSessionId: game.gameSessionId,
      selectionVersion: game.selectionVersion,
      roundToken: game.round!.token,
      ...extra,
    });
  };
  return {
    request,
    host,
    guest,
    view,
    cmd,
    draft,
    action,
    advance: (ms: number) => {
      clock += ms;
    },
    connect,
  };
}
it.each(['quick', 'standard'] as const)(
  'runs %s preparation over authenticated HTTP and rejects client authority',
  async (preset) => {
    const f = await fixture();
    await f.draft(preset);
    const view = await f.view();
    expect(view.game?.phase).toBe('loading');
    expect(view.cards).toHaveLength(DUEL_PRESETS[preset].handSize * 2);
    expect(JSON.stringify(view)).not.toMatch(
      /questionId|recordingId|seed|questionBySongId/,
    );
    expect((await f.action(f.guest, 'audio_started')).status).toBe(400);
    expect(
      (await f.action(f.host, 'audio_started', { playerId: 'forged' })).status,
    ).toBe(400);
    expect(
      (await f.request('/api/duel/audio/' + view.game!.round!.token, f.guest))
        .status,
    ).toBe(403);
    expect((await f.request('/api/duel/audio/future', f.host)).status).toBe(
      404,
    );
    expect((await f.action(f.host, 'audio_failed')).status).toBe(200);
    expect((await f.view()).game?.outcome).toBe('aborted');
  },
);
it.each(['quick', 'standard'] as const)(
  'rejects a late session interrupting the %s duel but permits entry next match',
  async (preset) => {
    const f = await fixture();
    await f.draft(preset);
    const before = await f.view();
    const { room } = (await (await f.request('/api/state', f.host)).json()) as {
      room: LobbySnapshot;
    };
    const joined = await f.request('/api/rooms/' + room.roomId + '/join', '', {
      nickname: 'Late',
    });
    expect(joined.status).toBe(201);
    const late = joined.headers.get('set-cookie')!.split(';')[0]!;
    const entry = (await joined.json()) as {
      playerId: string;
      room: LobbySnapshot;
    };
    expect(
      entry.room.members.find((m) => m.id === entry.playerId)
        ?.waitingForNextMatch,
    ).toBe(true);
    await f.connect(late);
    expect((await f.view()).game).toEqual(before.game);
    const afterJoin = await f.view();
    const denied = await f.cmd(late, { type: 'interrupt' });
    expect(denied.status).toBe(400);
    expect(await denied.json()).toEqual({ error: '请等待下一局' });
    expect(await f.view()).toEqual(afterJoin);
    expect((await f.action(f.host, 'audio_started')).status).toBe(200);
    const playing = await f.view();
    expect(playing.game?.phase).toBe('playing');
    expect((await f.cmd(late, { type: 'interrupt' })).status).toBe(400);
    expect(await f.view()).toEqual(playing);
    expect((await f.cmd(f.guest, { type: 'interrupt' })).status).toBe(200);
    expect((await f.view()).game?.phase).toBe('aborted');
    expect((await f.view()).game?.winnerId).toBeNull();
    expect((await f.cmd(f.host, { type: 'reset' })).status).toBe(200);
    const after = (await (await f.request('/api/state', late)).json()) as {
      room: LobbySnapshot;
    };
    expect(
      after.room.members.every((m) => !m.waitingForNextMatch && !m.lobbyReady),
    ).toBe(true);
    expect(
      (await f.request('/api/commands', f.guest, { type: 'leave' })).status,
    ).toBe(200);
    for (const cookie of [f.host, late])
      expect(
        (
          await f.request('/api/commands', cookie, {
            type: 'ready',
            ready: true,
          })
        ).status,
      ).toBe(200);
    expect((await f.cmd(f.host, { type: 'begin' })).status).toBe(200);
    const choices = (await f.view(late)).ownPool.slice(
      0,
      DUEL_PRESETS[preset].selectPerPlayer,
    );
    expect(
      (await f.cmd(late, { type: 'select', songIds: choices })).status,
    ).toBe(200);
  },
);
it('detects a blackhole connection even while its SSE remains open', async () => {
  const f = await fixture();
  await f.draft('quick');
  f.advance(16000);
  // Real 5-second server heartbeat, with injected elapsed wall clock. The SSE stays open.
  await expect
    .poll(
      async () => {
        const state = (await (
          await f.request('/api/state', f.host)
        ).json()) as { room: LobbySnapshot };
        return state.room.members.every((m) => !m.online);
      },
      { timeout: 7000 },
    )
    .toBe(true);
  expect((await f.view()).game?.outcome).toBe('aborted');
  expect((await f.view()).game?.winnerId).toBeNull();
}, 10000);
it('rejects stale heartbeats and invalidates final readiness on background response', async () => {
  const f = await fixture();
  await f.draft('quick');
  expect(
    (
      await f.request('/api/heartbeat', f.guest, {
        token: 'forged',
        visible: true,
      })
    ).status,
  ).toBe(409);
  // A real session leave invalidates the running game before another claim is accepted.
  await f.request('/api/commands', f.guest, { type: 'leave' });
  expect((await f.view()).game?.outcome).toBe('aborted');
});
