import { z } from 'zod';
import {
  ActionIdSchema,
  SongIdSchema,
  SafeCountSchema,
  uniqueValues,
  type SongId,
  type PlayerId,
  type CardId,
} from './ids.js';
import { type DuelView } from './duel.js';
import { type DuelPresetId } from './onboarding.js';
import { type FairnessAssessment } from './selection.js';
const envelope = { actionId: ActionIdSchema, expectedVersion: SafeCountSchema };
export const DuelPreparationCommandSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...envelope, type: z.literal('begin') }),
  z.strictObject({
    ...envelope,
    type: z.literal('select'),
    songIds: uniqueValues(SongIdSchema),
  }),
  z.strictObject({
    ...envelope,
    type: z.literal('ban'),
    songIds: uniqueValues(SongIdSchema),
  }),
  z.strictObject({ ...envelope, type: z.literal('acknowledge') }),
  z.strictObject({
    ...envelope,
    type: z.literal('match_ready'),
    cardsLoaded: z.literal(true),
    audioReady: z.boolean(),
  }),
  z.strictObject({ ...envelope, type: z.literal('start') }),
  z.strictObject({ ...envelope, type: z.literal('reset') }),
  z.strictObject({ ...envelope, type: z.literal('interrupt') }),
]);
export type DuelPreparationCommand = z.infer<
  typeof DuelPreparationCommandSchema
>;
export interface DuelPreparationView {
  readonly version: number;
  readonly preset: DuelPresetId;
  readonly phase: 'idle' | 'selecting' | 'banning' | 'confirming' | 'match';
  readonly ownPool: readonly SongId[];
  readonly ownSelection: readonly SongId[] | null;
  readonly banChoices: readonly SongId[];
  readonly ownBans: readonly SongId[] | null;
  readonly readyPlayerIds: readonly PlayerId[];
  readonly selectionComplete: readonly PlayerId[];
  readonly banComplete: readonly PlayerId[];
  readonly finalHands: Readonly<Record<string, readonly CardId[]>>;
  readonly cards: readonly {
    readonly cardId: CardId;
    readonly title: string;
  }[];
  readonly assessment: FairnessAssessment | null;
  readonly acknowledged: boolean;
  readonly canStart: boolean;
  readonly blockers: readonly string[];
  readonly game: DuelView | null;
  readonly message: string;
}

export const HeartbeatReplySchema = z.strictObject({
  token: z.string().min(1).max(128),
  visible: z.boolean(),
});
