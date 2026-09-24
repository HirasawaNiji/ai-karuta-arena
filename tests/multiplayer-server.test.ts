import { it, expect } from 'vitest';
import { type AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { createApp } from '@amp/server';
import { type MultiplayerPreparationView, type LobbySnapshot } from '@amp/core';
import { duelCatalog } from './fixtures/duel.js';

it('runs three authenticated participants, enforces mode/audio authority and freezes late admission', async () => {
  const catalog = duelCatalog();
  const app = createApp({
    catalog,
    verifiedQuestionIds: catalog.questions.map((q) => q.questionId),
  });
  await new Promise<void>((r) => app.server.listen(0, '127.0.0.1', r));
  const origin =
    'http://127.0.0.1:' + (app.server.address() as AddressInfo).port;
  const streams: AbortController[] = [];
  const request = (path: string, cookie = '', data?: unknown) =>
    fetch(origin + path, {
      method: data === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
  try {
    const h = await request('/api/rooms', '', { nickname: 'Host' }),
      host = h.headers.get('set-cookie')!.split(';')[0]!;
    const entry = (await h.json()) as { room: LobbySnapshot };
    const join = async (nickname: string) => {
      const r = await request('/api/rooms/' + entry.room.roomId + '/join', '', {
        nickname,
      });
      expect(r.status).toBe(201);
      return r.headers.get('set-cookie')!.split(';')[0]!;
    };
    const guest = await join('Guest'),
      third = await join('Third'),
      cookies = [host, guest, third];
    for (const cookie of cookies) {
      const abort = new AbortController();
      streams.push(abort);
      const response = await fetch(origin + '/api/events', {
        headers: { Cookie: cookie },
        signal: abort.signal,
      });
      const reader = response.body!.getReader();
      const first = new TextDecoder().decode((await reader.read()).value);
      const challenge = JSON.parse(
        first.split('event: heartbeat\ndata: ')[1]!.split('\n')[0]!,
      ) as { token: string };
      expect(
        (
          await request('/api/heartbeat', cookie, {
            ...challenge,
            visible: true,
          })
        ).status,
      ).toBe(200);
      void (async () => {
        try {
          while (!(await reader.read()).done) {
            /* Drain test stream. */
          }
        } catch {
          /* Closed in cleanup. */
        }
      })();
    }
    const view = async (cookie = host) =>
      (await (
        await request('/api/multiplayer', cookie)
      ).json()) as MultiplayerPreparationView;
    const cmd = async (cookie: string, body: Record<string, unknown>) =>
      request('/api/multiplayer/prepare', cookie, {
        actionId: randomUUID(),
        expectedVersion: (await view(cookie)).version,
        ...body,
      });
    expect((await cmd(host, { type: 'begin' })).status).toBe(400);
    expect(
      (
        await request('/api/commands', guest, {
          type: 'mode',
          mode: 'multiplayer',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request('/api/commands', host, {
          type: 'mode',
          mode: 'multiplayer',
        })
      ).status,
    ).toBe(200);
    for (const cookie of cookies)
      expect(
        (await request('/api/commands', cookie, { type: 'ready', ready: true }))
          .status,
      ).toBe(200);
    expect((await cmd(host, { type: 'begin' })).status).toBe(200);
    for (const cookie of cookies)
      expect((await cmd(cookie, { type: 'ban', songIds: [] })).status).toBe(
        200,
      );
    expect((await cmd(host, { type: 'acknowledge' })).status).toBe(200);
    for (const cookie of cookies)
      expect(
        (
          await cmd(cookie, {
            type: 'match_ready',
            cardsLoaded: true,
            audioReady: cookie === host,
          })
        ).status,
      ).toBe(200);
    expect((await cmd(host, { type: 'start' })).status).toBe(200);
    const game = (await view()).game!;
    expect(game.phase).toBe('loading');
    expect(JSON.stringify(await view())).not.toMatch(
      /seed|questionId|recordingId/,
    );
    expect(
      (await request('/api/multiplayer/audio/' + game.round!.token, guest))
        .status,
    ).toBe(403);
    expect((await request('/api/multiplayer/audio/future', host)).status).toBe(
      404,
    );
    const action = (
      cookie: string,
      type: string,
      extra: Record<string, unknown> = {},
    ) =>
      request('/api/multiplayer/action', cookie, {
        type,
        actionId: randomUUID(),
        gameSessionId: game.gameSessionId,
        selectionVersion: game.selectionVersion,
        roundToken: game.round!.token,
        ...extra,
      });
    expect((await action(guest, 'audio_started')).status).toBe(400);
    expect((await action(host, 'audio_started', { score: 99 })).status).toBe(
      400,
    );
    const late = await join('Late');
    expect((await view()).game?.phase).toBe('loading');
    expect((await cmd(late, { type: 'interrupt' })).status).toBe(400);
    expect(
      (await request('/api/commands', host, { type: 'mode', mode: 'duel' }))
        .status,
    ).toBe(400);
    expect((await action(host, 'audio_failed')).status).toBe(200);
    expect((await view(third)).game?.phase).toBe('aborted');
    expect((await cmd(host, { type: 'reset' })).status).toBe(200);
    const state = (await (await request('/api/state', late)).json()) as {
      room: LobbySnapshot;
    };
    expect(state.room.members.every((m) => !m.waitingForNextMatch)).toBe(true);
  } finally {
    streams.forEach((s) => s.abort());
    await app.close();
  }
});
