import { z } from 'zod';
import { DisplayTextSchema, PlayerIdSchema, StableIdSchema } from './ids.js';
import { RawUserMusicDataSchema } from './evidence.js';
import { GameResultSchema } from './game.js';
import {
  PartyStateSchema,
  type PartyActor,
  type PartyCommand,
  type PartyState,
} from './party.js';
import { FairnessAssessmentSchema } from './selection.js';
import { type Result } from './result.js';
import { contractIssue, sameData } from './contract-validation.js';

export const HostActionSchema = z.enum([
  'GENERATE_PLAYLIST',
  'REGENERATE_PLAYLIST',
  'REQUEST_HOST_CHOICE',
  'START_GAME',
  'START_NEXT_ROUND',
  'SHOW_RESULT',
  'END_PARTY',
  'START_WARMUP',
  'CHANGE_DIFFICULTY',
]);
export const HostDecisionSchema = z
  .strictObject({
    action: HostActionSchema,
    reason: DisplayTextSchema,
    message: DisplayTextSchema,
    reasonCodes: z.array(StableIdSchema).readonly(),
  })
  .readonly();
export const HostContextSchema = z
  .strictObject({
    snapshot: PartyStateSchema,
    assessment: FairnessAssessmentSchema.nullable(),
    gameResult: GameResultSchema.nullable(),
  })
  .superRefine((value, context) => {
    if (!sameData(value.assessment, value.snapshot.fairnessAssessment))
      contractIssue(
        context,
        ['assessment'],
        'Host explanation must use the current assessment',
      );
    if (
      value.gameResult !== null &&
      !value.snapshot.gameHistory.some((result) =>
        sameData(result, value.gameResult),
      )
    )
      contractIssue(
        context,
        ['gameResult'],
        'Host result must come from settled history',
      );
  })
  .readonly();
export type HostDecision = z.infer<typeof HostDecisionSchema>;
export type HostContext = z.infer<typeof HostContextSchema>;
export interface MusicProfileSource {
  readonly sourceId: string;
  getUserMusicData(
    userId: z.infer<typeof PlayerIdSchema>,
  ): Promise<z.infer<typeof RawUserMusicDataSchema>>;
}
export interface PartyHostAgent {
  decide(context: HostContext): Promise<HostDecision>;
}
export interface PartyRuntime {
  dispatch(
    command: PartyCommand,
    actor: PartyActor,
  ): Promise<Result<PartyState>>;
  getSnapshot(): PartyState;
  // Event callbacks enqueue only. Tests/demo await this before observing a new snapshot.
  drainEvents(): Promise<Result<PartyState>>;
}
