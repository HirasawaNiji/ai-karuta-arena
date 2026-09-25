import { z } from 'zod';
import {
  ActionIdSchema,
  CardIdSchema,
  GameSessionIdSchema,
  PositiveCountSchema,
  StableIdSchema,
  SongIdSchema,
  SafeCountSchema,
  uniqueValues,
  type PlayerId,
  type CardId,
  type SongId,
} from './ids.js';
import { GameSessionInputSchema, type GameResult } from './game.js';
import { QuestionSchema, type Question } from './question.js';
import { type DuelEngineDependencies } from './duel.js';
import { type FairnessAssessment, type SelectionResult } from './selection.js';

export const MULTIPLAYER_RULES = Object.freeze({
  version: 'party-grab-v1',
  questionCount: 12,
  banPerPlayer: 1,
  minPlayers: 2,
  maxPlayers: 8,
  roundMs: 10000,
  loadingMs: 15000,
  restMs: 2000,
});
export const MultiplayerInputSchema = z
  .strictObject({
    session: GameSessionInputSchema,
    seed: z.number().int().min(0).max(0xffffffff),
    questions: z.array(QuestionSchema).readonly(),
  })
  .superRefine(({ session, questions }, ctx) => {
    if (
      session.gameType !== 'party-grab' ||
      session.playerIds.length < 2 ||
      session.playerIds.length > 8 ||
      questions.length !== MULTIPLAYER_RULES.questionCount ||
      session.songIds.length !== questions.length ||
      new Set(questions.map((q) => q.songId)).size !== questions.length ||
      new Set(questions.map((q) => q.answerCardId)).size !== questions.length ||
      new Set(questions.map((q) => q.questionId)).size !== questions.length ||
      questions.some((q) => !session.songIds.includes(q.songId))
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Invalid frozen multiplayer session',
      });
  })
  .readonly();
export type MultiplayerInput = z.infer<typeof MultiplayerInputSchema>;
const actionEnvelope = {
  actionId: ActionIdSchema,
  gameSessionId: GameSessionIdSchema,
  selectionVersion: PositiveCountSchema,
  roundToken: StableIdSchema,
};
export const MultiplayerActionSchema = z.discriminatedUnion('type', [
  z.strictObject({
    ...actionEnvelope,
    type: z.literal('claim'),
    cardId: CardIdSchema,
  }),
  z.strictObject({ ...actionEnvelope, type: z.literal('audio_started') }),
  z.strictObject({ ...actionEnvelope, type: z.literal('audio_failed') }),
]);
export type MultiplayerAction = z.infer<typeof MultiplayerActionSchema>;
export interface MultiplayerStanding {
  readonly playerId: PlayerId;
  readonly score: number;
  readonly rank: number;
}
export interface MultiplayerView {
  readonly gameSessionId: MultiplayerInput['session']['gameSessionId'];
  readonly selectionVersion: number;
  readonly rulesVersion: string;
  readonly phase:
    'created' | 'loading' | 'playing' | 'rest' | 'completed' | 'aborted';
  readonly round: {
    readonly number: number;
    readonly token: string;
    readonly deadline: number;
    readonly revealedCardId: CardId | null;
  } | null;
  readonly remainingCards: readonly CardId[];
  readonly lockedPlayerIds: readonly PlayerId[];
  readonly scores: Readonly<Record<string, number>>;
  readonly standings: readonly MultiplayerStanding[];
  readonly sequence: number;
  readonly message: string;
}
export interface MultiplayerEngine {
  start(): void;
  action(id: PlayerId, action: MultiplayerAction): MultiplayerView;
  tick(): void;
  abort(reason: string): void;
  snapshot(): MultiplayerView;
  result(): GameResult | null;
  currentQuestion(token: string): Question | null;
}
export interface MultiplayerEngineFactory {
  create(
    input: MultiplayerInput,
    deps: DuelEngineDependencies,
  ): MultiplayerEngine;
}
const envelope = { actionId: ActionIdSchema, expectedVersion: SafeCountSchema };
export const MultiplayerPreparationCommandSchema = z.discriminatedUnion(
  'type',
  [
    z.strictObject({ ...envelope, type: z.literal('begin') }),
    z.strictObject({
      ...envelope,
      type: z.literal('ban'),
      songIds: uniqueValues(SongIdSchema).refine((ids) => ids.length <= 1),
    }),
    z.strictObject({ ...envelope, type: z.literal('acknowledge') }),
    z.strictObject({
      ...envelope,
      type: z.literal('match_ready'),
      cardsLoaded: z.literal(true),
      audioReady: z.boolean(),
    }),
    z.strictObject({ ...envelope, type: z.literal('start') }),
    z.strictObject({ ...envelope, type: z.literal('interrupt') }),
    z.strictObject({ ...envelope, type: z.literal('reset') }),
  ],
);
export type MultiplayerPreparationCommand = z.infer<
  typeof MultiplayerPreparationCommandSchema
>;
/** Aggregate selection history, never the randomized playback order or player evidence. */
export interface MultiplayerSelectionExplanation {
  readonly stage: 'proposal' | 'final';
  readonly selectionVersion: number;
  readonly selectionConfigVersion: string;
  readonly scoringConfigVersion: string;
  readonly fairnessConfigVersion: string;
  readonly requestedCount: number;
  readonly actualCount: number;
  readonly steps: readonly (Pick<
    SelectionResult['steps'][number],
    | 'songId'
    | 'deficitGain'
    | 'objectiveGains'
    | 'softRatioContribution'
    | 'totalGain'
  > & {
    readonly tieBreakRule: SelectionResult['steps'][number]['tieBreak']['rule'];
  })[];
}
export interface MultiplayerPreparationView {
  readonly version: number;
  readonly phase: 'idle' | 'banning' | 'confirming' | 'match';
  readonly playerIds: readonly PlayerId[];
  readonly proposedSongIds: readonly SongId[];
  readonly ownBans: readonly SongId[] | null;
  readonly banComplete: readonly PlayerId[];
  readonly cards: readonly {
    readonly cardId: CardId;
    readonly title: string;
  }[];
  readonly readyPlayerIds: readonly PlayerId[];
  readonly assessment: FairnessAssessment | null;
  readonly selectionExplanation: MultiplayerSelectionExplanation | null;
  readonly acknowledged: boolean;
  readonly blockers: readonly string[];
  readonly canStart: boolean;
  readonly game: MultiplayerView | null;
  readonly message: string;
}
