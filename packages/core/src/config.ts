import { z } from 'zod';
import { StableIdSchema, UnitIntervalSchema } from './ids.js';

const NonnegativeSchema = z.number().finite().min(0);
const PositiveSchema = z.number().finite().positive();
export const FixedRatioSchema = UnitIntervalSchema.refine(
  (value) => value === Math.round(value * 1_000_000) / 1_000_000,
  'Thresholds must be expressible with six decimal places',
);
const version = { schemaVersion: z.literal(1), version: StableIdSchema };
export const FamiliarityWeightsSchema = z
  .strictObject({
    prior: NonnegativeSchema,
    favorite: NonnegativeSchema,
    playlist: NonnegativeSchema,
    playCount: NonnegativeSchema,
    recency: NonnegativeSchema,
    topSong: NonnegativeSchema,
    selfReport: NonnegativeSchema,
    artistAffinity: NonnegativeSchema,
    genreAffinity: NonnegativeSchema,
    languageAffinity: NonnegativeSchema,
  })
  .readonly();
const ConfidenceCurveSchema = z
  .strictObject({
    base: UnitIntervalSchema,
    gain: UnitIntervalSchema,
  })
  .refine(
    (value) => value.base + value.gain <= 1,
    'Confidence curve exceeds one',
  )
  .readonly();
export const ScoringConfigSchema = z
  .strictObject({
    ...version,
    manual: z
      .strictObject({
        heard: UnitIntervalSchema,
        familiar: UnitIntervalSchema,
        intro: UnitIntervalSchema,
        confidence: UnitIntervalSchema,
      })
      .readonly()
      .optional(),
    weights: FamiliarityWeightsSchema,
    playCountCap: PositiveSchema,
    recencyHalfLifeDays: PositiveSchema,
    correctHalfLifeDays: PositiveSchema,
    wrongHalfLifeDays: PositiveSchema,
    correctFloor: UnitIntervalSchema,
    wrongPenalty: UnitIntervalSchema,
    confidence: z
      .strictObject({
        favorite: UnitIntervalSchema,
        playlist: UnitIntervalSchema,
        topSong: UnitIntervalSchema,
        selfReport: UnitIntervalSchema,
        playCount: ConfidenceCurveSchema,
        recency: ConfidenceCurveSchema,
        recognition: ConfidenceCurveSchema,
        recognitionHalfLifeDays: PositiveSchema,
        affinityMultiplier: UnitIntervalSchema,
        sufficientThreshold: FixedRatioSchema,
      })
      .readonly(),
    profile: z
      .strictObject({
        favoriteStrength: UnitIntervalSchema,
        playlistStrength: UnitIntervalSchema,
        topSongStrength: UnitIntervalSchema,
        inferredWeightDivisor: PositiveSchema,
        confidenceSongDivisor: PositiveSchema,
        inferredConfidenceCap: UnitIntervalSchema,
        topArtistWeight: UnitIntervalSchema,
        topArtistConfidence: UnitIntervalSchema,
      })
      .readonly(),
  })
  .refine(
    (value) =>
      value.version === 'score-v2-manual'
        ? value.manual !== undefined
        : value.manual === undefined,
    'Manual floors require the explicit score-v2-manual configuration',
  )
  .readonly();
const unitSum = (values: readonly number[]) =>
  Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) <= 1e-12;
export const SelectionConfigSchema = z
  .strictObject({
    ...version,
    objectiveWeights: z
      .strictObject({
        fairness: UnitIntervalSchema,
        diversity: UnitIntervalSchema,
        competition: UnitIntervalSchema,
        exploration: UnitIntervalSchema,
      })
      .refine(
        (value) => unitSum(Object.values(value)),
        'Objective weights must sum to one',
      )
      .readonly(),
    diversityWeights: z
      .strictObject({
        genres: NonnegativeSchema,
        languages: NonnegativeSchema,
        regions: NonnegativeSchema,
        artists: NonnegativeSchema,
        eras: NonnegativeSchema,
        cultures: NonnegativeSchema,
        franchises: NonnegativeSchema,
      })
      .refine(
        (value) =>
          Object.values(value).some((weight) => weight > 0) &&
          Number.isFinite(Object.values(value).reduce((a, b) => a + b, 0)),
        'Diversity needs a finite positive total weight',
      )
      .readonly(),
    softRatioWeight: NonnegativeSchema,
    targetRatios: z
      .strictObject({
        common: UnitIntervalSchema,
        home: UnitIntervalSchema,
        exploration: UnitIntervalSchema,
      })
      .refine(
        (value) => unitSum(Object.values(value)),
        'Target ratios must sum to one',
      )
      .readonly(),
    defaultExplorationScore: UnitIntervalSchema,
  })
  .readonly();
export const FairnessConfigSchema = z
  .strictObject({
    ...version,
    familiarityThreshold: FixedRatioSchema,
    minCoverageRatio: FixedRatioSchema,
    maxCoverageGap: FixedRatioSchema,
    confidenceThreshold: FixedRatioSchema,
    maxLowConfidenceRatio: FixedRatioSchema,
  })
  .readonly();
export type ScoringConfig = z.infer<typeof ScoringConfigSchema>;
export type SelectionConfig = z.infer<typeof SelectionConfigSchema>;
export type FairnessConfig = z.infer<typeof FairnessConfigSchema>;
