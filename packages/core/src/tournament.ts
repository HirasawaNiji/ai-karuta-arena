import { z } from 'zod';
import {
  ActionIdSchema,
  PlayerIdSchema,
  SafeCountSchema,
  StableIdSchema,
  type PlayerId,
  type SongId,
} from './ids.js';
import { GameResultSchema, type GameSessionInput } from './game.js';
import { type DuelPresetId } from './onboarding.js';
import {
  DuelPreparationCommandSchema,
  type DuelPreparationView,
} from './duel-preparation.js';
import { type LobbySnapshot } from './lobby.js';

export const MatchResultSchema = z
  .strictObject({
    matchId: StableIdSchema,
    game: GameResultSchema,
    rulesVersion: StableIdSchema,
    resultVersion: z.literal(1),
    winnerId: PlayerIdSchema.nullable(),
  })
  .superRefine((r, ctx) => {
    if (
      (r.winnerId && !r.game.session.playerIds.includes(r.winnerId)) ||
      (r.game.status === 'aborted' && r.winnerId !== null)
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Winner must belong to a completed match',
      });
  });
export type MatchResult = z.infer<typeof MatchResultSchema>;
export interface TournamentMatch {
  readonly matchId: string;
  readonly round: number;
  readonly sources: readonly string[];
  readonly playerIds: readonly PlayerId[];
  readonly status:
    | 'pending'
    | 'ready'
    | 'preparing'
    | 'playing'
    | 'awaiting_tiebreak'
    | 'aborted'
    | 'completed';
  readonly attempt: number;
  readonly sessionId: string | null;
  readonly winnerId: PlayerId | null;
  readonly scores: Readonly<Record<string, number>> | null;
}
export interface TournamentAudit {
  readonly at: string;
  readonly actorId: PlayerId;
  readonly kind: 'forfeit' | 'repeat_allowed' | 'pool_refreshed' | 'ended';
  readonly matchId: string | null;
  readonly reason: string;
  readonly loserId: PlayerId | null;
}
export interface TournamentState {
  readonly tournamentId: string;
  readonly version: number;
  readonly poolVersion: number;
  readonly status: 'active' | 'completed' | 'ended';
  readonly preset: DuelPresetId;
  readonly entrants: readonly {
    readonly id: PlayerId;
    readonly nickname: string;
    readonly profileVersion: number;
  }[];
  readonly matches: readonly TournamentMatch[];
  readonly currentMatchId: string | null;
  readonly championId: PlayerId | null;
  readonly allowRepeats: boolean;
  readonly exposedSongIds: readonly SongId[];
  readonly audit: readonly TournamentAudit[];
}
export interface TournamentView {
  readonly version: number;
  readonly state: TournamentState | null;
  readonly preparation: DuelPreparationView | null;
  readonly matchRoom: LobbySnapshot | null;
  readonly availableCount: number;
  readonly message: string;
}
const envelope = { actionId: ActionIdSchema, expectedVersion: SafeCountSchema };
export const TournamentCommandSchema = z.discriminatedUnion('type', [
  z.strictObject({
    ...envelope,
    type: z.literal('create'),
    size: z.union([z.literal(4), z.literal(8)]),
  }),
  z.strictObject({
    ...envelope,
    type: z.literal('open_match'),
    matchId: StableIdSchema,
  }),
  z.strictObject({
    ...envelope,
    type: z.literal('allow_repeats'),
    confirmed: z.literal(true),
  }),
  z.strictObject({ ...envelope, type: z.literal('refresh_pool') }),
  z.strictObject({
    ...envelope,
    type: z.literal('forfeit'),
    matchId: StableIdSchema,
    loserId: PlayerIdSchema,
    confirmed: z.literal(true),
    reason: z.string().trim().min(1).max(200),
  }),
  z.strictObject({
    ...envelope,
    type: z.literal('end'),
    confirmed: z.literal(true),
  }),
]);
export type TournamentCommand = z.infer<typeof TournamentCommandSchema>;
export const TournamentPrepareSchema = z.strictObject({
  matchId: StableIdSchema,
  attempt: z.number().int().positive(),
  command: DuelPreparationCommandSchema,
});
/** Server-only binding; never accept a client-supplied result or session. */
export interface TournamentSessionBinding {
  readonly matchId: string;
  readonly session: GameSessionInput;
  readonly rulesVersion: string;
}
