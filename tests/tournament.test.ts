import { it, expect } from 'vitest';
import {
  PlayerIdSchema,
  GameSessionInputSchema,
  MatchResultSchema,
  DUEL_RULES,
} from '@amp/core';
import { createTournament } from '@amp/party-runtime';
const entrants = Array.from({ length: 8 }, (_, i) => ({
  id: PlayerIdSchema.parse('p:' + i),
  nickname: 'Player ' + i,
  profileVersion: 1,
}));
function fixture(size = 4, seed = 42) {
  return createTournament({
    tournamentId: 'cup',
    entrants: entrants.slice(0, size),
    preset: 'quick',
    seed,
    now: () => '2026-09-25T00:00:00Z',
  });
}
function bound(t: ReturnType<typeof fixture>, matchId: string, suffix = '') {
  t.open(matchId);
  const m = t.snapshot().matches.find((m) => m.matchId === matchId)!;
  const session = GameSessionInputSchema.parse({
    schemaVersion: 1,
    partyId: 'room',
    gameSessionId: matchId + ':session:' + m.attempt + suffix,
    selectionVersion: 1,
    gameType: 'karuta',
    roundNumber: 1,
    playerIds: m.playerIds,
    songIds: ['s:1'],
    referenceTime: '2026-09-25T00:00:00Z',
  });
  t.bind({ matchId, session, rulesVersion: DUEL_RULES.version });
  return MatchResultSchema.parse({
    matchId,
    rulesVersion: DUEL_RULES.version,
    resultVersion: 1,
    winnerId: m.playerIds[0],
    game: {
      session,
      status: 'completed',
      startedAt: session.referenceTime,
      endedAt: session.referenceTime,
      playedSongIds: ['s:1'],
      judgements: [],
      scores: Object.fromEntries(m.playerIds.map((p) => [p, 0])),
    },
  });
}
it('uses a fixed deterministic bracket and advances all seven 8-player matches once', () => {
  const t = fixture(8);
  expect(t.snapshot()).toEqual(fixture(8).snapshot());
  expect(t.snapshot().matches).not.toEqual(fixture(8, 43).snapshot().matches);
  expect(() => t.open(t.snapshot().matches.at(-1)!.matchId)).toThrow(/前置/);
  for (let i = 0; i < 7; i++) {
    const next = t.snapshot().matches.find((m) => m.status === 'ready')!;
    const result = bound(t, next.matchId);
    expect(() =>
      t.open(
        t.snapshot().matches.find((m) => m.matchId !== next.matchId)!.matchId,
      ),
    ).toThrow();
    t.record(result);
    const once = t.snapshot();
    t.record(result);
    expect(t.snapshot()).toEqual(once);
    expect(() =>
      t.record({ ...result, winnerId: result.game.session.playerIds[1]! }),
    ).toThrow(/冲突/);
  }
  expect(t.snapshot().status).toBe('completed');
  expect(t.snapshot().championId).toBeTruthy();
  expect(t.snapshot().matches.every((m) => m.status === 'completed')).toBe(
    true,
  );
});
it('binds result to match, full session, participants, rules and version', () => {
  const t = fixture(),
    result = bound(t, t.snapshot().matches[0]!.matchId);
  expect(() => t.record({ ...result, matchId: 'other' })).toThrow(/绑定/);
  expect(() => t.record({ ...result, rulesVersion: 'other' })).toThrow(/绑定/);
  expect(() =>
    t.record({
      ...result,
      game: {
        ...result.game,
        session: { ...result.game.session, selectionVersion: 2 },
      },
    }),
  ).toThrow(/绑定/);
  expect(t.snapshot().matches[0]!.status).toBe('playing');
});
it('requires a new bound session after draw or interruption; never promotes a disconnect', () => {
  const t = fixture(),
    id = t.snapshot().matches[0]!.matchId;
  const first = bound(t, id);
  t.record({ ...first, winnerId: null });
  expect(t.snapshot().matches[0]!.status).toBe('awaiting_tiebreak');
  const second = bound(t, id);
  t.record({
    ...second,
    winnerId: null,
    game: { ...second.game, status: 'aborted' },
  });
  expect(t.snapshot().matches[0]!.status).toBe('aborted');
  expect(t.snapshot().matches.at(-1)!.playerIds).toEqual([]);
  const third = bound(t, id);
  t.record(third);
  expect(t.snapshot().matches[0]!.attempt).toBe(3);
});
it('records explicit forfeits without fabricated scores and invalidates preparation on pool changes', () => {
  const t = fixture(),
    id = t.snapshot().matches[0]!.matchId;
  t.open(id);
  t.changePool(entrants[0]!.id, true);
  expect(t.snapshot().poolVersion).toBe(2);
  expect(t.snapshot().matches[0]!.status).toBe('ready');
  expect(t.snapshot().allowRepeats).toBe(true);
  const loser = t.snapshot().matches[0]!.playerIds[0]!;
  expect(() => t.forfeit(loser, id, loser, '')).toThrow();
  t.forfeit(loser, id, loser, '本人确认离场');
  expect(t.snapshot().matches[0]!.winnerId).not.toBe(loser);
  expect(t.snapshot().matches[0]!.scores).toBeNull();
  expect(t.snapshot().audit.at(-1)?.kind).toBe('forfeit');
});
