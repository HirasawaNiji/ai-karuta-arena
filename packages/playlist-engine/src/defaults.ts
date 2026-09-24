import {
  FairnessConfigSchema,
  SelectionConfigSchema,
  type FairnessConfig,
  type SelectionConfig,
} from '@amp/core';
export const DEFAULT_FAIRNESS_CONFIG: FairnessConfig =
  FairnessConfigSchema.parse({
    schemaVersion: 1,
    version: 'fairness-v1',
    familiarityThreshold: 0.6,
    minCoverageRatio: 0.25,
    maxCoverageGap: 0.4,
    confidenceThreshold: 0.5,
    maxLowConfidenceRatio: 0.5,
  });
export const DEFAULT_SELECTION_CONFIG: SelectionConfig =
  SelectionConfigSchema.parse({
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
  });
