import { it, expect } from 'vitest';
import {
  PlayerIdSchema,
  DUEL_PRESETS,
  type DuelInput,
  type PlayerId,
} from '@amp/core';
import { ManualPreferenceSource, KarutaDuelFactory } from '@amp/adapters';
import { MANUAL_SCORING_CONFIG } from '@amp/music-profile';
import { createLobby, createTournamentPreparation } from '@amp/party-runtime';
import { duelCatalog } from './fixtures/duel.js';
function fixture(size = 4, count = 180) {
  const catalog = duelCatalog(true, count),
    players = Array.from({ length: size }, (_, i) =>
      PlayerIdSchema.parse('player:' + i),
    );
  let clock = Date.parse('2026-09-25T00:00:00Z'),
    seq = 0;
  const source = new ManualPreferenceSource();
  const lobby = createLobby('ROOM', players[0]!, 'Host', {
    catalog,
    verifiedQuestionIds: catalog.questions.map((q) => q.questionId),
    now: () => new Date(clock).toISOString(),
    submitProfile: (id, input, c, at) =>
      source.submit(id, input, c, MANUAL_SCORING_CONFIG, at, 'source:' + ++seq),
  });
  players.slice(1).forEach((p) => lobby.join(p, p));
  lobby.dispatch(players[0]!, { type: 'mode', mode: 'tournament' });
  players.forEach((p) => lobby.dispatch(p, { type: 'ready', ready: true }));
  const inputs: DuelInput[] = [];
  const t = createTournamentPreparation({
    context: lobby.preparationContext,
    room: lobby.snapshot,
    now: () => clock,
    nextId: () => 'id:' + ++seq,
    seed: () => 42,
    onChange: () => {},
    onCompleted: (r, e) => lobby.settleGame(r.game, e, true),
    factory: {
      create(input, deps) {
        inputs.push(structuredClone(input));
        return new KarutaDuelFactory().create(input, deps);
      },
    },
  });
  const view = (id = players[0]!) => t.snapshot(id);
  const cmd = (body: Record<string, unknown>, id = players[0]!) =>
    t.dispatch(id, {
      ...body,
      expectedVersion: view(id).version,
      actionId: 'a:' + ++seq,
    } as Parameters<typeof t.dispatch>[1]);
  const prep = (id: PlayerId, body: Record<string, unknown>) =>
    t.prepare(
      id,
      {
        ...body,
        expectedVersion: view(id).preparation!.version,
        actionId: 'a:' + ++seq,
      } as Parameters<typeof t.prepare>[1],
      {
        matchId: view().state!.currentMatchId!,
        attempt: view().state!.matches.find(
          (m) => m.matchId === view().state!.currentMatchId,
        )!.attempt,
      },
    );
  const action = (id: PlayerId, body: Record<string, unknown>) => {
    const g = view(id).preparation!.game!;
    return t.action(
      id,
      {
        ...body,
        gameSessionId: g.gameSessionId,
        selectionVersion: g.selectionVersion,
        roundToken: g.round!.token,
        actionId: 'a:' + ++seq,
      } as Parameters<typeof t.action>[1],
      0,
    );
  };
  const advance = (ms: number) => {
    clock += ms;
    t.tick();
  };
  function prepare() {
    const pair = view().matchRoom!.members.map((p) => p.id);
    prep(pair[0]!, { type: 'begin' });
    for (const id of pair)
      prep(id, {
        type: 'select',
        songIds: view(id).preparation!.ownPool.slice(
          0,
          DUEL_PRESETS.quick.selectPerPlayer,
        ),
      });
    for (const id of pair)
      prep(id, {
        type: 'ban',
        songIds: view(id).preparation!.banChoices.slice(
          0,
          DUEL_PRESETS.quick.banPerPlayer,
        ),
      });
    prep(pair[0]!, { type: 'acknowledge' });
    for (const id of pair)
      prep(id, {
        type: 'match_ready',
        cardsLoaded: true,
        audioReady: id === pair[0],
      });
    prep(pair[0]!, { type: 'start' });
    return pair;
  }
  function finish(winner?: PlayerId) {
    const audio = view().matchRoom!.hostId;
    for (let guard = 0; guard < 150; guard++) {
      const g = view().preparation!.game!;
      if (['completed', 'aborted'].includes(g.phase)) return g;
      if (g.phase === 'loading') {
        const q = t.currentQuestion(audio, g.round!.token)!;
        action(audio, { type: 'audio_started' });
        if (winner) action(winner, { type: 'claim', cardId: q.answerCardId });
        advance(winner ? 126 : 10001);
      } else if (g.phase === 'transfer') {
        action(g.transfer!.giverId, {
          type: 'transfer',
          cardId: g.hands[g.transfer!.giverId]![0],
        });
      } else advance(2001);
    }
    throw new Error('Match did not terminate');
  }
  cmd({ type: 'create', size });
  return {
    t,
    lobby,
    players,
    view,
    cmd,
    prep,
    action,
    advance,
    prepare,
    finish,
    inputs,
  };
}
it('completes eight entrants through seven real-engine matches with frozen profiles and exposure exclusion', () => {
  const f = fixture(8);
  const versions = f.view().state!.entrants.map((p) => p.profileVersion);
  for (let i = 0; i < 7; i++) {
    const next = f.view().state!.matches.find((m) => m.status === 'ready')!;
    const exposed = f.view().state!.exposedSongIds;
    f.cmd({ type: 'open_match', matchId: next.matchId });
    const pair = f.prepare();
    expect(f.inputs.at(-1)!.session.playerIds).toEqual(pair);
    expect(
      f.inputs.at(-1)!.session.songIds.some((s) => exposed.includes(s)),
    ).toBe(false);
    expect(f.finish(pair[0])).toMatchObject({
      phase: 'completed',
      winnerId: pair[0],
    });
  }
  expect(f.view().state?.status).toBe('completed');
  expect(f.view().state!.entrants.map((p) => p.profileVersion)).toEqual(
    versions,
  );
  expect(
    f.lobby.self(f.view().state!.championId!).profile.profileVersion,
  ).toBeGreaterThan(1);
}, 120000);
it('stops on short unexposed pool, requires explicit repeat consent, and discards old confirmations', () => {
  const f = fixture(4, 40),
    first = f.view().state!.matches[0]!;
  f.cmd({ type: 'open_match', matchId: first.matchId });
  f.prepare();
  f.finish(); // Timed-out cards are removed by the classic engine.
  const next = f.view().state!.matches.find((m) => m.status === 'ready')!;
  expect(() => f.cmd({ type: 'open_match', matchId: next.matchId })).toThrow(
    /不足/,
  );
  expect(() => f.cmd({ type: 'allow_repeats', confirmed: false })).toThrow();
  f.cmd({ type: 'allow_repeats', confirmed: true });
  f.cmd({ type: 'open_match', matchId: next.matchId });
  const audio = f.view().matchRoom!.hostId;
  f.prep(audio, { type: 'begin' });
  const oldVersion = f.view().preparation!.version;
  f.cmd({ type: 'refresh_pool' });
  expect(f.view().preparation).toBeNull();
  expect(() =>
    f.t.prepare(
      audio,
      {
        type: 'start',
        expectedVersion: oldVersion,
        actionId: 'stale' as never,
      },
      { matchId: first.matchId, attempt: 1 },
    ),
  ).toThrow();
  expect(f.view().state!.poolVersion).toBe(3);
});
it('keeps spectators out, isolates unrelated connectivity, and aborts only a missing current player', () => {
  const f = fixture(),
    m = f.view().state!.matches[0]!;
  f.cmd({ type: 'open_match', matchId: m.matchId });
  const pair = f.prepare(),
    spectator = f.players.find((p) => !pair.includes(p))!;
  expect(() => f.prep(spectator, { type: 'interrupt' })).toThrow(/本场/);
  expect(() =>
    f.t.currentQuestion(spectator, f.view().preparation!.game!.round!.token),
  ).toThrow(/音箱/);
  f.lobby.setOnline(spectator, false);
  f.advance(1);
  expect(f.view().preparation!.game!.phase).toBe('loading');
  f.lobby.setOnline(pair[1]!, false);
  f.advance(1);
  expect(f.view().state!.matches[0]!.status).toBe('aborted');
  expect(f.view().state!.matches[0]!.winnerId).toBeNull();
  expect(f.view().state!.exposedSongIds).toEqual([]);
});
it('records interrupted audio exposure and denies a non-host deciding another player forfeits', () => {
  const f = fixture(),
    m = f.view().state!.matches[0]!;
  f.cmd({ type: 'open_match', matchId: m.matchId });
  const pair = f.prepare();
  f.action(pair[0]!, { type: 'audio_started' });
  f.prep(pair[1]!, { type: 'interrupt' });
  expect(f.view().state!.exposedSongIds).toHaveLength(1);
  const other = f.players.find((p) => p !== f.players[0] && p !== pair[0])!;
  expect(() =>
    f.cmd(
      {
        type: 'forfeit',
        matchId: m.matchId,
        loserId: pair[0],
        confirmed: true,
        reason: 'not mine',
      },
      other,
    ),
  ).toThrow(/仅房主/);
  f.cmd(
    {
      type: 'forfeit',
      matchId: m.matchId,
      loserId: pair[0],
      confirmed: true,
      reason: '本人确认退出',
    },
    pair[0],
  );
  expect(f.view().state!.matches[0]!.winnerId).toBe(pair[1]);
});
