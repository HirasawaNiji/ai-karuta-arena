import { FamiliarityMatrixSchema, type FamiliarityMatrix } from '@amp/core';
import { DEFAULT_SCORING_CONFIG } from '@amp/music-profile';
/** Deliberately direct selector input. Never use as evidence-driven Demo output. */
export function directSmallMatrix(): FamiliarityMatrix {
  const values = [
    [0.9, 0.8, 0.1],
    [0.1, 0.1, 0.9],
  ];
  const playerIds = ['p1', 'p2'],
    songIds = ['s1', 's2', 's3'];
  return FamiliarityMatrixSchema.parse({
    schemaVersion: 1,
    matrixVersion: 'direct-small-v1',
    catalogVersion: 'direct-selector-only-v1',
    referenceTime: '2026-09-24T00:00:00Z',
    scoringConfigVersion: DEFAULT_SCORING_CONFIG.version,
    scoringConfig: DEFAULT_SCORING_CONFIG,
    profileVersions: { p1: 1, p2: 1 },
    playerIds,
    songIds,
    cells: Object.fromEntries(
      playerIds.map((p, i) => [
        p,
        Object.fromEntries(
          songIds.map((s, j) => {
            const value = values[i]![j]!;
            return [
              s,
              {
                familiarityScore: value,
                confidence: 0.8,
                evidenceStatus: 'known',
                reasons: [
                  {
                    feature: 'direct-test-input',
                    evidenceIds: [],
                    transformedValue: value,
                    weight: 1,
                    contribution: value,
                  },
                ],
                adjustments: [],
                confidenceBasis: {
                  feature: 'direct-test-input',
                  evidenceIds: [],
                  value: 0.8,
                },
              },
            ];
          }),
        ),
      ]),
    ),
  });
}
