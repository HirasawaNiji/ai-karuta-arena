import { z } from 'zod';
import { SongIdSchema, TagIdSchema, uniqueValues } from './ids.js';
import { RecognitionScopeSchema } from './recognition.js';

export const ONBOARDING_DEFAULTS = Object.freeze({
  version: 'onboarding-v1',
  weight: 0.8,
  confidence: 0.4,
});
export const emptyPreferences = () => ({
  genres: {},
  artists: {},
  languages: {},
  regions: {},
  eras: {},
  cultures: {},
  franchises: {},
  scenes: {},
});
export const ManualPreferencesSchema = z.strictObject({
  tagIds: uniqueValues(TagIdSchema).refine((ids) => ids.length <= 30),
  reports: z
    .array(
      z.strictObject({
        songId: SongIdSchema,
        recognitionLevel: z.enum(['heard', 'familiar', 'intro']),
        recognitionScope: RecognitionScopeSchema.optional(),
      }),
    )
    .max(200),
});
export type ManualPreferences = z.infer<typeof ManualPreferencesSchema>;
export const DuelPresetIdSchema = z.enum(['quick', 'standard']);
export type DuelPresetId = z.infer<typeof DuelPresetIdSchema>;
export const DUEL_PRESETS = Object.freeze({
  quick: Object.freeze({
    id: 'quick',
    label: '快速局',
    selectPerPlayer: 12,
    banPerPlayer: 2,
    handSize: 10,
    minimumCandidates: 24,
    extraEmptySongs: 0,
  }),
  standard: Object.freeze({
    id: 'standard',
    label: '标准局',
    selectPerPlayer: 18,
    banPerPlayer: 3,
    handSize: 15,
    minimumCandidates: 36,
    extraEmptySongs: 0,
  }),
});
