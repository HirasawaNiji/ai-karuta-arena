import { z } from 'zod';
import {
  ArtistIdSchema,
  DisplayTextSchema,
  SongIdSchema,
  StableIdSchema,
  TagIdSchema,
  UnitIntervalSchema,
  uniqueValues,
} from './ids.js';

export const ReleaseYearSchema = z.number().int().min(1).max(9999);
export function eraForYear(year: number): string {
  return `${Math.floor(ReleaseYearSchema.parse(year) / 10) * 10}s`;
}
export const ArtistProfileSchema = z
  .strictObject({
    id: ArtistIdSchema,
    name: DisplayTextSchema,
    originRegionIds: uniqueValues(TagIdSchema).optional(),
  })
  .readonly();
export const SongProfileSchema = z
  .strictObject({
    id: SongIdSchema,
    title: DisplayTextSchema,
    artistIds: uniqueValues(ArtistIdSchema).refine(
      (ids) => ids.length > 0,
      'Artist required',
    ),
    genres: uniqueValues(TagIdSchema),
    languages: uniqueValues(TagIdSchema).refine(
      (ids) => ids.length > 0,
      'Language required',
    ),
    regions: uniqueValues(TagIdSchema).optional(),
    cultures: uniqueValues(TagIdSchema).optional(),
    scenes: uniqueValues(TagIdSchema).optional(),
    franchises: uniqueValues(TagIdSchema).optional(),
    releaseYear: ReleaseYearSchema.optional(),
    popularity: UnitIntervalSchema.optional(),
    source: StableIdSchema.optional(),
  })
  .readonly();
export type ArtistProfile = z.infer<typeof ArtistProfileSchema>;
export type SongProfile = z.infer<typeof SongProfileSchema>;
