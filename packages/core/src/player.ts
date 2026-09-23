import { z } from 'zod';
import {
  ArtistIdSchema,
  DisplayTextSchema,
  PlayerIdSchema,
  TagIdSchema,
  UnitIntervalSchema,
} from './ids.js';

export const PlayerSchema = z
  .strictObject({
    id: PlayerIdSchema,
    displayName: DisplayTextSchema,
  })
  .readonly();
export const PreferenceValueSchema = z
  .strictObject({
    weight: UnitIntervalSchema,
    confidence: UnitIntervalSchema,
  })
  .readonly();
export const PreferenceDimensionSchema = z
  .record(TagIdSchema, PreferenceValueSchema)
  .readonly();
export const MusicPreferencesSchema = z
  .strictObject({
    genres: PreferenceDimensionSchema,
    artists: z.record(ArtistIdSchema, PreferenceValueSchema).readonly(),
    languages: PreferenceDimensionSchema,
    regions: PreferenceDimensionSchema,
    eras: PreferenceDimensionSchema,
    cultures: PreferenceDimensionSchema,
    franchises: PreferenceDimensionSchema,
    scenes: PreferenceDimensionSchema,
  })
  .readonly();
export const DeclaredPlayerPreferencesSchema = z
  .strictObject({
    player: PlayerSchema,
    preferences: MusicPreferencesSchema,
    explorationScore: UnitIntervalSchema.optional(),
    mainstreamScore: UnitIntervalSchema.optional(),
  })
  .readonly();
export type Player = z.infer<typeof PlayerSchema>;
export type MusicPreferences = z.infer<typeof MusicPreferencesSchema>;
export type DeclaredPlayerPreferences = z.infer<
  typeof DeclaredPlayerPreferencesSchema
>;
