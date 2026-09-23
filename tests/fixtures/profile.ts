import { catalogInput } from './catalog.js';

export const referenceTime = '2026-09-24T00:00:00.000Z';
export const observedAt = '2026-09-23T00:00:00.000Z';
export function scoringConfigInput() {
  return {
    schemaVersion: 1,
    version: 'score-v1',
    weights: {
      prior: 0.05,
      favorite: 0.15,
      playlist: 0.05,
      playCount: 0.3,
      recency: 0.15,
      topSong: 0.1,
      selfReport: 0.35,
      artistAffinity: 0.1,
      genreAffinity: 0.05,
      languageAffinity: 0.05,
    },
    playCountCap: 50,
    recencyHalfLifeDays: 180,
    correctHalfLifeDays: 365,
    wrongHalfLifeDays: 90,
    correctFloor: 0.9,
    wrongPenalty: 0.15,
    confidence: {
      favorite: 0.5,
      playlist: 0.3,
      topSong: 0.6,
      selfReport: 0.6,
      playCount: { base: 0.4, gain: 0.4 },
      recency: { base: 0.4, gain: 0.4 },
      recognition: { base: 0.5, gain: 0.45 },
      recognitionHalfLifeDays: 365,
      affinityMultiplier: 0.25,
      sufficientThreshold: 0.5,
    },
    profile: {
      favoriteStrength: 1,
      playlistStrength: 0.4,
      topSongStrength: 0.8,
      inferredWeightDivisor: 3,
      confidenceSongDivisor: 10,
      inferredConfidenceCap: 0.7,
      topArtistWeight: 0.8,
      topArtistConfidence: 0.6,
    },
  };
}
export function selectionConfigInput() {
  return {
    schemaVersion: 1,
    version: 'selection-v1',
    objectiveWeights: {
      fairness: 0.4,
      diversity: 0.2,
      competition: 0.3,
      exploration: 0.1,
    },
    diversityWeights: {
      genres: 1,
      languages: 1,
      regions: 1,
      artists: 1,
      eras: 1,
      cultures: 1,
      franchises: 1,
    },
    softRatioWeight: 0.02,
    targetRatios: { common: 0.5, home: 0.3, exploration: 0.2 },
    defaultExplorationScore: 0.5,
  };
}
export function fairnessConfigInput() {
  return {
    schemaVersion: 1,
    version: 'fairness-v1',
    familiarityThreshold: 0.6,
    minCoverageRatio: 0.25,
    maxCoverageGap: 0.4,
    confidenceThreshold: 0.5,
    maxLowConfidenceRatio: 0.5,
  };
}
export function evidenceInput() {
  return {
    evidenceId: 'evidence:1',
    playerId: 'player:1',
    sourceId: 'synthetic',
    observedAt,
    type: 'favorite',
    songId: 'song:1',
    active: true,
  };
}
export function rawInput() {
  return {
    schemaVersion: 1,
    sourceId: 'synthetic',
    userId: 'player:1',
    snapshotId: 'snapshot:1',
    observedAt,
    evidence: [evidenceInput()],
    declaredPreferences: catalogInput().players[0]!.preferences,
  };
}
export function profileInput() {
  return {
    playerId: 'player:1',
    profileVersion: 1,
    preferences: catalogInput().players[0]!.preferences,
    songEvidence: { 'song:1': [evidenceInput()] },
    artistEvidence: {},
    confidence: 0.4,
    provenance: [
      {
        source: 'declared',
        dimension: 'genres',
        id: 'genre:child',
        evidenceIds: [] as string[],
      },
    ],
    updatedAt: observedAt,
    inputFingerprint: 'synthetic-input-1',
  };
}
export function cellInput() {
  return {
    familiarityScore: 0.2,
    confidence: 0.5,
    evidenceStatus: 'known',
    reasons: [
      {
        feature: 'prior',
        evidenceIds: [] as string[],
        transformedValue: 1,
        weight: 0.05,
        contribution: 0.05,
      },
      {
        feature: 'favorite',
        evidenceIds: ['evidence:1'],
        transformedValue: 1,
        weight: 0.15,
        contribution: 0.15,
      },
    ],
    adjustments: [] as {
      kind: string;
      before: number;
      after: number;
      evidenceIds: string[];
    }[],
    confidenceBasis: {
      feature: 'favorite',
      evidenceIds: ['evidence:1'],
      value: 0.5,
    },
  };
}
export function matrixInput() {
  return {
    schemaVersion: 1,
    matrixVersion: 'matrix:1',
    catalogVersion: 'catalog-test-1',
    referenceTime,
    scoringConfigVersion: 'score-v1',
    scoringConfig: scoringConfigInput(),
    profileVersions: { 'player:1': 1 },
    playerIds: ['player:1'],
    songIds: ['song:1'],
    cells: { 'player:1': { 'song:1': cellInput() } },
  };
}
export function matrixContextInput() {
  return {
    catalog: catalogInput(),
    referenceTime,
    scoringConfig: scoringConfigInput(),
    profiles: [profileInput()],
    matrix: matrixInput(),
  };
}
