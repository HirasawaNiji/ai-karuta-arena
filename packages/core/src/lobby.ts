import { z } from 'zod';
import {
  DuelPresetIdSchema,
  ManualPreferencesSchema,
  type DuelPresetId,
} from './onboarding.js';
import { type PlayerId, type SongId } from './ids.js';
import { type PlayerMusicProfile } from './profile.js';
import { type FairnessAssessment } from './selection.js';
import { type FamiliarityEstimate } from './familiarity.js';

export const LobbyEntrySchema = z.strictObject({
  nickname: z.string().trim().min(1).max(24),
});
export const LobbyCommandSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('profile'),
    preferences: ManualPreferencesSchema,
  }),
  z.strictObject({ type: z.literal('preset'), preset: DuelPresetIdSchema }),
  z.strictObject({
    type: z.literal('mode'),
    mode: z.enum(['duel', 'multiplayer', 'tournament']),
  }),
  z.strictObject({ type: z.literal('ready'), ready: z.boolean() }),
  z.strictObject({ type: z.literal('assess') }),
  z.strictObject({ type: z.literal('leave') }),
]);
export type LobbyCommand = z.infer<typeof LobbyCommandSchema>;
export interface LobbySnapshot {
  readonly roomId: string;
  readonly revision: number;
  readonly hostId: PlayerId;
  readonly preset: DuelPresetId;
  readonly mode: 'duel' | 'multiplayer' | 'tournament';
  readonly members: readonly {
    readonly id: PlayerId;
    readonly nickname: string;
    readonly online: boolean;
    readonly waitingForNextMatch: boolean;
    readonly lobbyReady: boolean;
    readonly matchReady: null;
    readonly profileVersion: number;
  }[];
  readonly assessment: FairnessAssessment | null;
  readonly selectedSongIds: readonly SongId[];
  readonly playableCount: number;
  readonly pendingCount: number;
  readonly stage: 'lobby' | 'assessed';
  readonly canStart: false;
  readonly startBlocker: string;
}
export interface LobbySelf {
  readonly playerId: PlayerId;
  readonly profile: PlayerMusicProfile;
  readonly estimates: Readonly<Record<string, FamiliarityEstimate>>;
}
