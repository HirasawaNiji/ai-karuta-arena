import {
  CatalogSchema,
  PlayerMusicProfileSchema,
  ScoringConfigSchema,
  UtcTimestampSchema,
  EvidenceContextSchema,
  ProfileMatrixContextSchema,
  FamiliarityMatrixSchema,
  StableIdSchema,
  type Catalog,
  type PlayerMusicProfile,
  type ScoringConfig,
  type FamiliarityMatrix,
} from '@amp/core';
import { scoreValidated } from './score-familiarity.js';
import { compare } from './util.js';
export function buildFamiliarityMatrix(input: {
  readonly catalog: Catalog;
  readonly profiles: readonly PlayerMusicProfile[];
  readonly scoringConfig: ScoringConfig;
  readonly referenceTime: string;
  readonly matrixVersion: string;
}): FamiliarityMatrix {
  const catalog = CatalogSchema.parse(input.catalog);
  const scoringConfig = ScoringConfigSchema.parse(input.scoringConfig);
  const referenceTime = UtcTimestampSchema.parse(input.referenceTime);
  StableIdSchema.parse(input.matrixVersion);
  const profiles = input.profiles
    .map((p) => PlayerMusicProfileSchema.parse(p))
    .sort((a, b) => compare(a.playerId, b.playerId));
  if (new Set(profiles.map((p) => p.playerId)).size !== profiles.length)
    throw new Error('Duplicate matrix player');
  EvidenceContextSchema.parse({
    catalog,
    referenceTime,
    evidence: profiles.flatMap((p) => [
      ...Object.values(p.songEvidence).flat(),
      ...Object.values(p.artistEvidence).flat(),
    ]),
  });
  if (profiles.some((p) => Date.parse(p.updatedAt) > Date.parse(referenceTime)))
    throw new Error('Future matrix profile');
  const songs = [...catalog.songs].sort((a, b) => compare(a.id, b.id));
  const matrix = FamiliarityMatrixSchema.parse({
    schemaVersion: 1,
    matrixVersion: input.matrixVersion,
    catalogVersion: catalog.catalogVersion,
    referenceTime,
    scoringConfigVersion: scoringConfig.version,
    scoringConfig,
    playerIds: profiles.map((p) => p.playerId),
    songIds: songs.map((s) => s.id),
    profileVersions: Object.fromEntries(
      profiles.map((p) => [p.playerId, p.profileVersion]),
    ),
    cells: Object.fromEntries(
      profiles.map((p) => [
        p.playerId,
        Object.fromEntries(
          songs.map((s) => [
            s.id,
            scoreValidated(
              p,
              s,
              scoringConfig,
              referenceTime,
              catalog.taxonomy,
            ),
          ]),
        ),
      ]),
    ),
  });
  return ProfileMatrixContextSchema.parse({
    catalog,
    profiles,
    scoringConfig,
    referenceTime,
    matrix,
  }).matrix;
}
