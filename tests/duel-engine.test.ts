import { describe, expect, it } from 'vitest';
import {
  DuelInputSchema,
  DuelActionSchema,
  DUEL_RULES,
  GameEventContextSchema,
  PlayerIdSchema,
  type DuelAction,
  type DuelPresetId,
  type GameEvent,
  type PlayerId,
} from '@amp/core';
import { createKarutaDuel, shuffledQuestions } from '@amp/adapters';
const A = PlayerIdSchema.parse('player:A'),
  B = PlayerIdSchema.parse('player:B');
const origin = Date.parse('2026-09-24T00:00:00Z');
function fixture(preset: DuelPresetId = 'quick', movingClock = false) {
  const n = preset === 'quick' ? 10 : 15;
  const input = DuelInputSchema.parse({
    session: {
      schemaVersion: 1,
      partyId: 'party',
      gameSessionId: 'match',
      selectionVersion: 7,
      gameType: 'karuta',
      roundNumber: 1,
      playerIds: [A, B],
      songIds: Array.from({ length: n * 2 }, (_, i) => 'song:' + i),
      referenceTime: new Date(origin).toISOString(),
    },
    preset,
    seed: 71234,
    questions: Array.from({ length: n * 2 }, (_, i) => ({
      questionId: 'question:' + i,
      songId: 'song:' + i,
      recordingId: 'recording:' + i,
      startMs: 0,
      durationMs: 10000,
      segmentKind: 'intro',
      answerCardId: 'card:' + i,
    })),
    hands: {
      [A]: Array.from({ length: n }, (_, i) => 'card:' + i),
      [B]: Array.from({ length: n }, (_, i) => 'card:' + (i + n)),
    },
  });
  let now = origin,
    nonce = 0,
    actionNo = 0;
  const events: GameEvent[] = [];
  const game = createKarutaDuel(input, {
    now: () => (movingClock ? now++ : now),
    nextToken: () => 'opaque-' + ++nonce,
    audioPlayerId: A,
    onEvent: (e) => {
      GameEventContextSchema.parse({ session: input.session, event: e });
      events.push(e);
    },
    onChange: () => {},
  });
  const advance = (ms: number) => {
    now += ms;
    game.tick();
  };
  const action = (
    id: PlayerId,
    type: DuelAction['type'],
    cardId?: string,
    extra: Record<string, unknown> = {},
  ) => {
    const a = DuelActionSchema.parse({
      type,
      gameSessionId: 'match',
      selectionVersion: 7,
      roundToken: game.snapshot().round!.token,
      actionId: 'action:' + ++actionNo,
      ...(cardId ? { cardId } : {}),
      ...extra,
    });
    return { request: a, response: game.action(id, a, 0) };
  };
  const audio = () => {
    action(A, 'audio_started');
    advance(100);
  };
  game.start();
  return {
    game,
    input,
    events,
    advance,
    action,
    audio,
    elapse: (ms: number) => {
      now += ms;
    },
  };
}
describe('ported classic duel rules', () => {
  it('keeps result/event timestamps identical when the wall clock advances between reads', () => {
    const f = fixture('quick', true);
    while (f.game.snapshot().phase !== 'completed') {
      f.audio();
      f.advance(DUEL_RULES.roundMs + 100);
      if (f.game.snapshot().phase === 'rest') f.advance(DUEL_RULES.restMs);
    }
    const started = f.events.find((e) => e.type === 'GAME_STARTED')!;
    expect(f.game.result()!.game.startedAt).toBe(started.occurredAt);
  });
  it('fixes opponent-card transfer timeout and makes transfer direction explicit', () => {
    const f = fixture();
    f.audio();
    const q = f.game.currentQuestion(f.game.snapshot().round!.token)!;
    const owner = f.game.snapshot().hands[A]!.includes(q.answerCardId) ? A : B;
    const winner = owner === A ? B : A;
    f.action(winner, 'claim', q.answerCardId);
    f.advance(DUEL_RULES.settleMs);
    expect(f.game.snapshot().transfer).toMatchObject({
      giverId: winner,
      recipientId: owner,
      reason: 'opponent_card',
    });
    expect(f.game.snapshot().hands[owner]).toHaveLength(9);
    f.advance(DUEL_RULES.transferMs + 1);
    expect(f.game.snapshot().transfer).toBeNull();
    expect(f.game.snapshot().phase).toBe('rest');
    expect(f.game.snapshot().hands[winner]).toHaveLength(9);
    expect(f.game.snapshot().hands[owner]).toHaveLength(10);
    f.advance(DUEL_RULES.restMs);
    expect(f.game.snapshot().round?.number).toBe(2);
    expect(f.game.snapshot().phase).toBe('loading');
  });
  it('wrong claim rewards the opponent and transfers from opponent to wrong claimant', () => {
    const f = fixture();
    f.audio();
    const q = f.game.currentQuestion(f.game.snapshot().round!.token)!;
    const wrong = f.game
      .snapshot()
      .hands[A]!.find((c) => c !== q.answerCardId)!;
    f.action(A, 'claim', wrong);
    expect(f.game.snapshot().scores[B]).toBe(1);
    expect(f.game.snapshot().transfer).toMatchObject({
      giverId: B,
      recipientId: A,
      reason: 'wrong_claim',
    });
    expect(() => f.action(A, 'transfer', wrong)).toThrow();
    const transferred = f.game.snapshot().hands[B]![0]!;
    f.action(B, 'transfer', transferred);
    expect(f.game.snapshot().hands[A]).toHaveLength(11);
    expect(f.game.snapshot().hands[B]).toHaveLength(9);
    expect(f.game.snapshot().hands[A]).toContain(
      q.answerCardId === transferred ? transferred : wrong,
    );
    expect(f.events.filter((e) => e.type === 'ANSWER_WRONG')).toHaveLength(1);
  });
  it.each(['quick', 'standard'] as const)(
    'finishes %s by empty hand, with scoped feedback and no repeated questions',
    (preset) => {
      const f = fixture(preset);
      const seen = new Set<string>();
      while (f.game.snapshot().phase !== 'completed') {
        f.audio();
        const q = f.game.currentQuestion(f.game.snapshot().round!.token)!;
        expect(seen.has(q.questionId)).toBe(false);
        seen.add(q.questionId);
        f.action(A, 'claim', q.answerCardId);
        f.advance(DUEL_RULES.settleMs);
        const transfer = f.game.snapshot().transfer;
        if (transfer)
          f.action(
            transfer.giverId,
            'transfer',
            f.game.snapshot().hands[transfer.giverId]![0],
          );
        if (f.game.snapshot().phase === 'rest') f.advance(DUEL_RULES.restMs);
      }
      const result = f.game.result()!;
      expect(result.winnerId).toBe(A);
      expect(result.reason).toBe('empty_hand');
      expect(f.game.snapshot().hands[A]).toHaveLength(0);
      expect(result.game.judgements).toHaveLength(preset === 'quick' ? 10 : 15);
      expect(
        result.game.judgements.every(
          (j) =>
            j.recognitionScope?.questionId &&
            j.recognitionScope.recordingId &&
            j.recognitionScope.segment?.kind === 'intro',
        ),
      ).toBe(true);
      expect(f.events.filter((e) => e.type === 'GAME_FINISHED')).toHaveLength(
        1,
      );
      const seq = f.events.map((e) => e.sequence);
      expect(seq).toEqual(Array.from({ length: seq.length }, (_, i) => i + 1));
    },
  );
  it('settles competing correct claims once and deduplicates action replay', () => {
    const f = fixture();
    f.audio();
    const q = f.game.currentQuestion(f.game.snapshot().round!.token)!;
    const first = f.action(A, 'claim', q.answerCardId);
    f.action(B, 'claim', q.answerCardId);
    const count = f.events.length;
    f.game.action(A, first.request, 0);
    expect(f.events).toHaveLength(count);
    expect(() => f.game.action(B, first.request, 0)).toThrow(/冲突/);
    f.advance(DUEL_RULES.settleMs);
    expect(f.game.snapshot().scores[A]).toBe(1);
    expect(f.game.snapshot().scores[B]).toBe(0);
    expect(f.events.filter((e) => e.type === 'ANSWER_CORRECT')).toHaveLength(2);
  });
  it('uses rule winner rather than maximum score; timeouts never fabricate wrong answers', () => {
    const f = fixture();
    while (f.game.snapshot().phase !== 'completed') {
      f.audio();
      f.advance(DUEL_RULES.roundMs + 100);
      if (f.game.snapshot().phase === 'rest') f.advance(DUEL_RULES.restMs);
    }
    expect(f.game.result()?.winnerId).not.toBeNull();
    expect(f.game.result()?.game.scores).toEqual({ [A]: 0, [B]: 0 });
    expect(f.game.result()?.game.judgements).toEqual([]);
  });
  it('rejects old session/version/round, forged fields, off-board cards and guest audio', () => {
    const f = fixture();
    expect(() => f.action(B, 'audio_started')).toThrow();
    f.audio();
    const q = f.game.currentQuestion(f.game.snapshot().round!.token)!;
    for (const extra of [
      { gameSessionId: 'other' },
      { selectionVersion: 6 },
      { roundToken: 'old' },
      { role: 'host' },
      { playerId: B },
    ])
      expect(() => f.action(A, 'claim', q.answerCardId, extra)).toThrow();
    expect(() => f.action(A, 'claim', 'not-on-board')).toThrow();
    expect(f.events.filter((e) => e.type.startsWith('ANSWER'))).toEqual([]);
  });
  it('aborts failed/loading audio without inventing a winner, recognition or a completed event', () => {
    const f = fixture();
    f.advance(DUEL_RULES.loadingMs + 1);
    expect(f.game.result()).toMatchObject({
      winnerId: null,
      reason: 'aborted',
      game: { status: 'aborted', playedSongIds: [], judgements: [] },
    });
    expect(f.events.filter((e) => e.type === 'GAME_FINISHED')).toEqual([]);
    const next = fixture();
    next.audio();
    next.action(A, 'audio_failed');
    expect(next.game.result()?.game.status).toBe('aborted');
    expect(next.game.result()?.winnerId).toBeNull();
  });
  it('rejects a transfer arriving beyond its deadline even before a scheduler tick', () => {
    const f = fixture();
    f.audio();
    const q = f.game.currentQuestion(f.game.snapshot().round!.token)!;
    const owner = f.game.snapshot().hands[A]!.includes(q.answerCardId) ? A : B;
    const winner = owner === A ? B : A;
    f.action(winner, 'claim', q.answerCardId);
    f.advance(DUEL_RULES.settleMs);
    f.elapse(DUEL_RULES.transferMs + 1);
    expect(f.game.snapshot().phase).toBe('transfer');
    expect(() =>
      f.action(winner, 'transfer', f.game.snapshot().hands[winner]![0]),
    ).toThrow();
  });
  it('rejects duplicate final cards and keeps seed/answer plan out of public views', () => {
    const f = fixture();
    const bad = structuredClone(f.input);
    expect(() =>
      DuelInputSchema.parse({
        ...bad,
        hands: { ...bad.hands, [B]: bad.hands[A] },
      }),
    ).toThrow();
    const publicJson = JSON.stringify(f.game.snapshot());
    expect(publicJson).not.toContain('seed');
    expect(publicJson).not.toContain('questionId');
    expect(publicJson).not.toContain('songId');
    expect(publicJson).not.toContain('answerCardId');
    expect(shuffledQuestions([1, 2, 3, 4, 5], 77)).toEqual(
      shuffledQuestions([1, 2, 3, 4, 5], 77),
    );
    expect(new Set(shuffledQuestions([1, 2, 3, 4, 5], 77)).size).toBe(5);
  });
});
