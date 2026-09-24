import { it, expect } from 'vitest';
import { type AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { createApp } from '@amp/server';
import {
  type TournamentView,
  type LobbySnapshot,
  type PlayerId,
} from '@amp/core';
import { duelCatalog } from './fixtures/duel.js';

it('authenticates tournament scheduling, binds preparation to a match, and protects spectator/audio authority', async () => {
  const catalog = duelCatalog();
  let reloads = 0;
  let failReload = false;
  let finishReload: (() => void) | undefined;
  let pauseReload = false;
  const fresh = duelCatalog(true, 45);
  const app = createApp({
    reloadTournamentMaterials: async () => {
      reloads++;
      if (failReload) throw new Error('核验文件哈希已变化');
      if (pauseReload)
        await new Promise<void>((r) => {
          finishReload = r;
        });
      return {
        catalog: fresh,
        verifiedQuestionIds: fresh.questions.map((q) => q.questionId),
        questionAudioFiles: new Map(
          fresh.questions.map((q) => [q.questionId, 'test-only.mp3']),
        ),
      };
    },
    catalog,
    verifiedQuestionIds: catalog.questions.map((q) => q.questionId),
  });
  await new Promise<void>((r) => app.server.listen(0, '127.0.0.1', r));
  const origin =
    'http://127.0.0.1:' + (app.server.address() as AddressInfo).port;
  const streams: AbortController[] = [],
    cookies = new Map<PlayerId, string>();
  const request = (path: string, cookie = '', data?: unknown) =>
    fetch(origin + path, {
      method: data === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
  try {
    const created = await request('/api/rooms', '', { nickname: 'Host' });
    const entry = (await created.json()) as {
      playerId: PlayerId;
      room: LobbySnapshot;
    };
    const host = entry.playerId;
    cookies.set(host, created.headers.get('set-cookie')!.split(';')[0]!);
    for (let i = 1; i < 4; i++) {
      const joined = await request(
        '/api/rooms/' + entry.room.roomId + '/join',
        '',
        { nickname: 'Player ' + i },
      );
      const body = (await joined.json()) as { playerId: PlayerId };
      cookies.set(
        body.playerId,
        joined.headers.get('set-cookie')!.split(';')[0]!,
      );
    }
    for (const cookie of cookies.values()) {
      const controller = new AbortController();
      streams.push(controller);
      const response = await fetch(origin + '/api/events', {
        headers: { Cookie: cookie },
        signal: controller.signal,
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
            /* Drain SSE. */
          }
        } catch {
          /* Cleanup. */
        }
      })();
    }
    const view = async (id = host) =>
      (await (
        await request('/api/tournament', cookies.get(id))
      ).json()) as TournamentView;
    const cmd = async (data: Record<string, unknown>, id = host) =>
      request('/api/tournament/command', cookies.get(id), {
        ...data,
        actionId: randomUUID(),
        expectedVersion: (await view(id)).version,
      });
    const prepare = async (
      id: PlayerId,
      data: Record<string, unknown>,
      attempt?: number,
    ) => {
      const v = await view(id),
        m = v.state!.matches.find(
          (m) => m.matchId === v.state!.currentMatchId,
        )!;
      return request('/api/tournament/prepare', cookies.get(id), {
        matchId: m.matchId,
        attempt: attempt ?? m.attempt,
        command: {
          ...data,
          actionId: randomUUID(),
          expectedVersion: v.preparation!.version,
        },
      });
    };
    expect((await cmd({ type: 'create', size: 4 })).status).toBe(400);
    await request('/api/commands', cookies.get(host), {
      type: 'mode',
      mode: 'tournament',
    });
    for (const cookie of cookies.values())
      await request('/api/commands', cookie, { type: 'ready', ready: true });
    const guest = [...cookies.keys()].find((p) => p !== host)!;
    expect((await cmd({ type: 'create', size: 4 }, guest)).status).toBe(400);
    expect((await cmd({ type: 'create', size: 4 })).status).toBe(200);
    expect((await cmd({ type: 'refresh_pool' }, guest)).status).toBe(400);
    expect(reloads).toBe(0);
    const before = await view();
    failReload = true;
    expect((await cmd({ type: 'refresh_pool' })).status).toBe(400);
    expect(await view()).toEqual(before);
    failReload = false;
    const refreshCommand = {
      type: 'refresh_pool',
      actionId: randomUUID(),
      expectedVersion: before.version,
    };
    expect(
      (
        await request(
          '/api/tournament/command',
          cookies.get(host),
          refreshCommand,
        )
      ).status,
    ).toBe(200);
    expect((await view()).availableCount).toBe(45);
    expect((await view()).state!.entrants).toEqual(before.state!.entrants);
    expect(
      (
        (await request('/api/catalog', cookies.get(host)).then((r) =>
          r.json(),
        )) as { playableSongIds: string[] }
      ).playableSongIds,
    ).toHaveLength(45);
    expect(
      (
        (await request('/api/catalog').then((r) => r.json())) as {
          playableSongIds: string[];
        }
      ).playableSongIds,
    ).toHaveLength(40);
    expect(
      (
        await request(
          '/api/tournament/command',
          cookies.get(host),
          refreshCommand,
        )
      ).status,
    ).toBe(200);
    expect(reloads).toBe(2);
    pauseReload = true;
    const delayed = cmd({ type: 'refresh_pool' });
    while (!finishReload) await new Promise((r) => setTimeout(r, 5));
    expect((await cmd({ type: 'allow_repeats', confirmed: true })).status).toBe(
      200,
    );
    const changed = await view();
    finishReload();
    expect((await delayed).status).toBe(400);
    expect(await view()).toEqual(changed);
    pauseReload = false;
    const match = (await view()).state!.matches[0]!;
    expect(
      (await cmd({ type: 'open_match', matchId: match.matchId })).status,
    ).toBe(200);
    const [audio, opponent] = match.playerIds as readonly [PlayerId, PlayerId];
    const spectator = [...cookies.keys()].find(
      (p) => !match.playerIds.includes(p),
    )!;
    expect((await prepare(spectator, { type: 'begin' })).status).toBe(400);
    expect((await prepare(audio, { type: 'begin' }, 99)).status).toBe(400);
    expect((await prepare(audio, { type: 'begin' })).status).toBe(200);
    for (const id of match.playerIds)
      expect(
        (
          await prepare(id, {
            type: 'select',
            songIds: (await view(id)).preparation!.ownPool.slice(0, 12),
          })
        ).status,
      ).toBe(200);
    for (const id of match.playerIds)
      expect(
        (
          await prepare(id, {
            type: 'ban',
            songIds: (await view(id)).preparation!.banChoices.slice(0, 2),
          })
        ).status,
      ).toBe(200);
    expect((await prepare(audio, { type: 'acknowledge' })).status).toBe(200);
    for (const id of match.playerIds)
      expect(
        (
          await prepare(id, {
            type: 'match_ready',
            cardsLoaded: true,
            audioReady: id === audio,
          })
        ).status,
      ).toBe(200);
    expect((await prepare(audio, { type: 'start' })).status).toBe(200);
    const game = (await view()).preparation!.game!;
    expect(game.phase).toBe('loading');
    expect((await cmd({ type: 'refresh_pool' })).status).toBe(400);
    expect(reloads).toBe(3);
    expect(JSON.stringify(await view())).not.toMatch(
      /seed|questionId|recordingId/,
    );
    expect(
      (
        await request(
          '/api/tournament/audio/' + game.round!.token,
          cookies.get(spectator),
        )
      ).status,
    ).toBe(400);
    expect(
      (await request('/api/tournament/audio/future', cookies.get(audio)))
        .status,
    ).toBe(404);
    const action = (id: PlayerId, type: string, extra = {}) =>
      request('/api/tournament/action', cookies.get(id), {
        type,
        actionId: randomUUID(),
        gameSessionId: game.gameSessionId,
        selectionVersion: game.selectionVersion,
        roundToken: game.round!.token,
        ...extra,
      });
    expect((await action(opponent, 'audio_started')).status).toBe(400);
    expect((await action(audio, 'audio_started', { score: 99 })).status).toBe(
      400,
    );
    expect((await prepare(spectator, { type: 'interrupt' })).status).toBe(400);
    expect(
      (
        await request('/api/commands', cookies.get(host), {
          type: 'mode',
          mode: 'duel',
        })
      ).status,
    ).toBe(400);
    expect((await action(audio, 'audio_failed')).status).toBe(200);
    expect((await view()).state!.matches[0]!.status).toBe('aborted');
    expect(
      (await cmd({ type: 'open_match', matchId: match.matchId })).status,
    ).toBe(200);
    expect((await prepare(audio, { type: 'begin' }, 1)).status).toBe(400);
    expect((await prepare(audio, { type: 'begin' })).status).toBe(200);
  } finally {
    streams.forEach((c) => c.abort());
    await app.close();
  }
}, 30000);
