import { z } from 'zod';
import {
  ActionIdSchema,
  CardIdSchema,
  GameSessionIdSchema,
  PlayerIdSchema,
  PositiveCountSchema,
  StableIdSchema,
  uniqueValues,
  type PlayerId,
  type CardId,
} from './ids.js';
import {
  GameSessionInputSchema,
  type GameEvent,
  type GameResult,
} from './game.js';
import { QuestionSchema, type Question } from './question.js';
import { DUEL_PRESETS, DuelPresetIdSchema } from './onboarding.js';

export const DUEL_RULES = Object.freeze({
  version: 'karuta-duel-v1',
  roundMs: 10000,
  transferMs: 12000,
  restMs: 2000,
  loadingMs: 15000,
  settleMs: 125,
  compensationCapMs: 60,
  shuffleVersion: 'mulberry32-fisher-yates-v1',
});
/** Trusted server-only input. Neither seed nor the answer sequence is a client DTO. */
export const DuelInputSchema = z
  .strictObject({
    session: GameSessionInputSchema,
    preset: DuelPresetIdSchema,
    seed: z.number().int().min(0).max(0xffffffff),
    questions: z.array(QuestionSchema).readonly(),
    hands: z.record(PlayerIdSchema, uniqueValues(CardIdSchema)).readonly(),
  })
  .superRefine((value, ctx) => {
    const { session, questions, hands } = value;
    const ids = session.playerIds;
    const cards = Object.values(hands).flat();
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (
      session.gameType !== 'karuta' ||
      ids.length !== 2 ||
      Object.keys(hands).length !== 2 ||
      ids.some(
        (id) => hands[id]?.length !== DUEL_PRESETS[value.preset].handSize,
      )
    )
      fail('Duel needs exactly two preset-sized hands');
    if (
      new Set(cards).size !== cards.length ||
      questions.length !== cards.length ||
      new Set(questions.map((q) => q.answerCardId)).size !== cards.length ||
      questions.some((q) => !cards.includes(q.answerCardId))
    )
      fail('Every final card needs exactly one frozen question');
    if (
      session.songIds.length !== questions.length ||
      new Set(questions.map((q) => q.songId)).size !== questions.length ||
      new Set(questions.map((q) => q.questionId)).size !== questions.length ||
      questions.some((q) => !session.songIds.includes(q.songId))
    )
      fail('Frozen songs and questions must map one to one');
  })
  .readonly();
export type DuelInput = z.infer<typeof DuelInputSchema>;
const actionEnvelope = {
  actionId: ActionIdSchema,
  gameSessionId: GameSessionIdSchema,
  selectionVersion: PositiveCountSchema,
  roundToken: StableIdSchema,
};
export const DuelActionSchema = z.discriminatedUnion('type', [
  z.strictObject({
    ...actionEnvelope,
    type: z.literal('claim'),
    cardId: CardIdSchema,
  }),
  z.strictObject({
    ...actionEnvelope,
    type: z.literal('transfer'),
    cardId: CardIdSchema,
  }),
  z.strictObject({ ...actionEnvelope, type: z.literal('audio_started') }),
  z.strictObject({ ...actionEnvelope, type: z.literal('audio_failed') }),
]);
export type DuelAction = z.infer<typeof DuelActionSchema>;
export interface DuelResult {
  readonly game: GameResult;
  readonly rulesVersion: typeof DUEL_RULES.version;
  readonly winnerId: PlayerId | null;
  readonly reason: 'empty_hand' | 'exhausted' | 'aborted';
  readonly resultVersion: 1;
}
export interface DuelView {
  readonly gameSessionId: DuelInput['session']['gameSessionId'];
  readonly selectionVersion: number;
  readonly rulesVersion: string;
  readonly phase:
    | 'created'
    | 'loading'
    | 'playing'
    | 'transfer'
    | 'rest'
    | 'completed'
    | 'aborted';
  readonly round: {
    readonly number: number;
    readonly token: string;
    readonly deadline: number;
    readonly revealedCardId: CardId | null;
  } | null;
  readonly hands: Readonly<Record<string, readonly CardId[]>>;
  readonly scores: Readonly<Record<string, number>>;
  readonly transfer: {
    readonly giverId: PlayerId;
    readonly recipientId: PlayerId;
    readonly reason: 'wrong_claim' | 'opponent_card';
    readonly expiresAt: number;
  } | null;
  readonly sequence: number;
  readonly winnerId: PlayerId | null;
  readonly outcome: 'empty_hand' | 'exhausted' | 'aborted' | null;
  readonly message: string;
}
export interface DuelEngine {
  start(): void;
  action(playerId: PlayerId, action: DuelAction, rttMs: number): DuelView;
  tick(): void;
  abort(reason: string): void;
  snapshot(): DuelView;
  result(): DuelResult | null;
  /** Trusted host audio route only; never project this mapping into a browser state. */
  currentQuestion(token: string): Question | null;
}
export interface DuelEngineDependencies {
  readonly now: () => number;
  readonly nextToken: () => string;
  readonly audioPlayerId: PlayerId;
  readonly onEvent: (event: GameEvent) => void;
  readonly onChange: () => void;
}
export interface DuelEngineFactory {
  create(input: DuelInput, dependencies: DuelEngineDependencies): DuelEngine;
}
