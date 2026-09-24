import { describe, it, expect } from 'vitest';
import { createMultiplayer } from '@amp/adapters';
import {
  MultiplayerInputSchema,
  MultiplayerActionSchema,
  MULTIPLAYER_RULES,
  GameEventContextSchema,
  PlayerIdSchema,
  type MultiplayerAction,
  type GameEvent,
  type PlayerId,
} from '@amp/core';
import { duelCatalog } from './fixtures/duel.js';
const players = ['player:A', 'player:B', 'player:C'].map((p) =>
  PlayerIdSchema.parse(p),
);
const [A, B, C] = players as [PlayerId, PlayerId, PlayerId];
function fixture() {
  let now = Date.parse('2026-09-25T00:00:00Z'),
    nonce = 0;
  const questions = duelCatalog().questions.slice(0, 12);
  const input = MultiplayerInputSchema.parse({
    session: {
      schemaVersion: 1,
      partyId: 'party',
      gameSessionId: 'multi',
      selectionVersion: 4,
      gameType: 'party-grab',
      roundNumber: 1,
      playerIds: players,
      songIds: questions.map((q) => q.songId),
      referenceTime: new Date(now).toISOString(),
    },
    questions,
    seed: 881,
  });
  const events: GameEvent[] = [];
  const engine = createMultiplayer(input, {
    now: () => now++,
    nextToken: () => 'token:' + ++nonce,
    audioPlayerId: A,
    onChange: () => {},
    onEvent: (e) => {
      GameEventContextSchema.parse({ session: input.session, event: e });
      events.push(e);
    },
  });
  const request = (
    type: MultiplayerAction['type'],
    cardId?: string,
    extra: Record<string, unknown> = {},
  ) =>
    MultiplayerActionSchema.parse({
      type,
      actionId: 'action:' + ++nonce,
      gameSessionId: 'multi',
      selectionVersion: 4,
      roundToken: engine.snapshot().round!.token,
      ...(cardId ? { cardId } : {}),
      ...extra,
    });
  const action = (
    id: PlayerId,
    type: MultiplayerAction['type'],
    cardId?: string,
  ) => engine.action(id, request(type, cardId));
  const advance = (ms: number) => {
    now += ms;
    engine.tick();
  };
  const answer = () =>
    engine.currentQuestion(engine.snapshot().round!.token)!.answerCardId;
  engine.start();
  return { engine, input, events, request, action, advance, answer };
}
describe('multiplayer authoritative rules', () => {
  it('awards only the first correct claim and deduplicates replay', () => {
    const f = fixture();
    f.action(A, 'audio_started');
    const answer = f.answer();
    const a = f.request('claim', answer);
    f.engine.action(B, a);
    const before = f.events.length;
    expect(() => f.action(C, 'claim', answer)).toThrow(/已结束/);
    f.engine.action(B, a);
    expect(f.events).toHaveLength(before);
    expect(f.engine.snapshot().scores).toEqual({ [A]: 0, [B]: 1, [C]: 0 });
    expect(() => f.engine.action(C, a)).toThrow(/冲突/);
  });
  it('locks only the wrong claimant and keeps other players eligible', () => {
    const f = fixture();
    f.action(A, 'audio_started');
    const q = f.answer(),
      wrong = f.engine.snapshot().remainingCards.find((c) => c !== q)!;
    f.action(B, 'claim', wrong);
    expect(f.engine.snapshot().phase).toBe('playing');
    expect(f.engine.snapshot().lockedPlayerIds).toEqual([B]);
    expect(() => f.action(B, 'claim', q)).toThrow();
    f.action(C, 'claim', q);
    expect(f.engine.snapshot().scores[C]).toBe(1);
    expect(f.events.filter((e) => e.type === 'ANSWER_WRONG')).toHaveLength(1);
    f.advance(MULTIPLAYER_RULES.restMs);
    expect(f.engine.snapshot().lockedPlayerIds).toEqual([]);
  });
  it('finishes all frozen questions once with 1,1,3 ranking and scoped evidence', () => {
    const f = fixture(),
      seen = new Set<string>();
    let n = 0;
    while (f.engine.snapshot().phase !== 'completed') {
      f.action(A, 'audio_started');
      const answer = f.answer();
      expect(seen.has(answer)).toBe(false);
      seen.add(answer);
      if (n < 4) f.action(n % 2 === 0 ? A : B, 'claim', answer);
      else f.advance(MULTIPLAYER_RULES.roundMs);
      f.advance(MULTIPLAYER_RULES.restMs);
      n++;
    }
    expect(seen.size).toBe(12);
    expect(f.engine.snapshot().standings.map((s) => s.rank)).toEqual([1, 1, 3]);
    expect(f.engine.result()!.judgements).toHaveLength(4);
    expect(
      f.engine
        .result()!
        .judgements.every((j) => j.recognitionScope?.questionId),
    ).toBe(true);
    expect(f.events.filter((e) => e.type === 'GAME_FINISHED')).toHaveLength(1);
    expect(f.engine.result()!.startedAt).toBe(f.events[0]!.occurredAt);
  });
  it('rejects guest playback, stale round/session/version and injected score/identity', () => {
    const f = fixture();
    expect(() => f.action(B, 'audio_started')).toThrow();
    f.action(A, 'audio_started');
    for (const extra of [
      { gameSessionId: 'old' },
      { roundToken: 'old' },
      { selectionVersion: 3 },
      { playerId: A },
      { score: 99 },
    ])
      expect(() =>
        f.engine.action(B, f.request('claim', f.answer(), extra)),
      ).toThrow();
    expect(f.events.filter((e) => e.type.startsWith('ANSWER'))).toHaveLength(0);
  });
  it('expires late claims and aborts unavailable playback without formal results', () => {
    const f = fixture();
    f.advance(MULTIPLAYER_RULES.loadingMs);
    expect(f.engine.result()!.status).toBe('aborted');
    expect(f.events.some((e) => e.type === 'GAME_FINISHED')).toBe(false);
    const g = fixture();
    g.action(A, 'audio_started');
    const req = g.request('claim', g.answer());
    g.advance(MULTIPLAYER_RULES.roundMs);
    expect(() => g.engine.action(B, req)).toThrow();
    g.advance(MULTIPLAYER_RULES.restMs);
    g.action(A, 'audio_failed');
    expect(g.engine.result()!.judgements).toEqual([]);
  });
  it('keeps future answers and seed private and rejects inconsistent frozen input', () => {
    const f = fixture(),
      view = JSON.stringify(f.engine.snapshot());
    for (const key of ['seed', 'questionId', 'answerCardId'])
      expect(view).not.toContain(key);
    expect(() =>
      MultiplayerInputSchema.parse({
        ...f.input,
        questions: [...f.input.questions.slice(1), f.input.questions[1]],
      }),
    ).toThrow();
  });
});
