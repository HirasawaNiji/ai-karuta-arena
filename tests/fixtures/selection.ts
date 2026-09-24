import {
  CatalogSchema,
  PlayerMusicProfileSchema,
  FamiliarityMatrixSchema,
  SelectionRequestSchema,
  type SelectionRequest,
  type AssessmentInput,
} from '@amp/core';
import { DEFAULT_SCORING_CONFIG } from '@amp/music-profile';
import {
  DEFAULT_FAIRNESS_CONFIG,
  DEFAULT_SELECTION_CONFIG,
} from '@amp/playlist-engine';
export const selectionTime = '2026-09-24T00:00:00.000Z';
const preferences = () => ({
  genres: {},
  artists: {},
  languages: {},
  regions: {},
  eras: {},
  cultures: {},
  franchises: {},
  scenes: {},
});
/** Direct controlled matrices for selector tests only, never Demo scoring output. */
export function selectionFixture(
  values: readonly (readonly number[])[] = [
    [0.9, 0.9, 0.1, 0.1],
    [0.9, 0.9, 0.1, 0.1],
    [0.1, 0.1, 0.9, 0.1],
  ],
  options: {
    confidence?: readonly (readonly number[])[];
    requestedCount?: number;
    songCount?: number;
  } = {},
): SelectionRequest {
  const count = options.songCount ?? values[0]?.length ?? 4;
  const songs = Array.from({ length: count }, (_, i) => ({
    id: 's' + (i + 1),
    title: 'Synthetic selection ' + (i + 1),
    artistIds: ['artist'],
    genres: ['genre'],
    languages: ['language'],
    popularity: 0.5,
  }));
  const players = values.map((_, i) => ({
    player: {
      id: 'p' + (i + 1),
      displayName: 'Synthetic participant ' + (i + 1),
    },
    preferences: preferences(),
  }));
  const catalog = CatalogSchema.parse({
    schemaVersion: 1,
    catalogVersion: 'direct-selector-v1',
    taxonomyVersion: 'direct-tags-v1',
    taxonomy: [
      { id: 'genre', dimension: 'genres', label: 'Synthetic genre' },
      { id: 'language', dimension: 'languages', label: 'Synthetic language' },
    ],
    artists: [{ id: 'artist', name: 'Synthetic artist' }],
    songs,
    players,
    audioAssets: [],
    recordings: [],
    questions: [],
    cards: [],
  });
  const profiles = catalog.players.map((p) =>
    PlayerMusicProfileSchema.parse({
      playerId: p.player.id,
      profileVersion: 1,
      preferences: p.preferences,
      songEvidence: {},
      artistEvidence: {},
      confidence: 0,
      provenance: [],
      updatedAt: selectionTime,
      inputFingerprint: 'direct-fixture',
    }),
  );
  const matrix = FamiliarityMatrixSchema.parse({
    schemaVersion: 1,
    matrixVersion: 'direct-matrix-v1',
    catalogVersion: catalog.catalogVersion,
    referenceTime: selectionTime,
    scoringConfigVersion: DEFAULT_SCORING_CONFIG.version,
    scoringConfig: DEFAULT_SCORING_CONFIG,
    profileVersions: Object.fromEntries(
      profiles.map((p) => [p.playerId, p.profileVersion]),
    ),
    playerIds: profiles.map((p) => p.playerId).sort(),
    songIds: catalog.songs.map((s) => s.id).sort(),
    cells: Object.fromEntries(
      profiles.map((p, i) => [
        p.playerId,
        Object.fromEntries(
          catalog.songs.map((s, j) => {
            const score = values[i]![j]!,
              confidence = options.confidence?.[i]?.[j] ?? 0.9;
            return [
              s.id,
              {
                familiarityScore: score,
                confidence,
                evidenceStatus: confidence >= 0.5 ? 'known' : 'insufficient',
                reasons: [
                  {
                    feature: 'direct-selector-test',
                    evidenceIds: [],
                    transformedValue: score,
                    weight: 1,
                    contribution: score,
                  },
                ],
                adjustments: [],
                confidenceBasis: {
                  feature: 'direct-selector-test',
                  evidenceIds: [],
                  value: confidence,
                },
              },
            ];
          }),
        ),
      ]),
    ),
  });
  return SelectionRequestSchema.parse({
    profileContext: {
      catalog,
      profiles,
      matrix,
      scoringConfig: DEFAULT_SCORING_CONFIG,
      referenceTime: selectionTime,
    },
    candidateSongIds: catalog.songs.map((s) => s.id),
    requestedCount: options.requestedCount ?? Math.max(1, count),
    bannedSongIds: [],
    excludedHistorySongIds: [],
    availability: Object.fromEntries(
      catalog.songs.map((s) => [s.id, { available: true }]),
    ),
    selectionConfig: DEFAULT_SELECTION_CONFIG,
    fairnessConfig: DEFAULT_FAIRNESS_CONFIG,
    selectionVersion: 1,
    gameType: 'mock-karuta',
    roundNumber: 1,
  });
}
export function assessmentFixture(
  request: SelectionRequest,
  selectedSongIds = request.candidateSongIds,
): AssessmentInput {
  return {
    playerIds: request.profileContext.matrix.playerIds,
    selectedSongIds,
    matrix: request.profileContext.matrix,
    requestedCount: request.requestedCount,
    fairnessConfig: request.fairnessConfig,
    selectionVersion: request.selectionVersion,
  };
}
