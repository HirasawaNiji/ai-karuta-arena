import { z } from 'zod';
import {
  PlayerIdSchema,
  SongIdSchema,
  StableIdSchema,
  UnitIntervalSchema,
  uniqueValues,
} from './ids.js';
import { EvidenceIdSchema, UtcTimestampSchema } from './evidence.js';
import { ProfileVersionSchema } from './profile.js';
import { ScoringConfigSchema } from './config.js';

export const FamiliarityReasonSchema = z
  .strictObject({
    feature: StableIdSchema,
    evidenceIds: uniqueValues(EvidenceIdSchema),
    transformedValue: UnitIntervalSchema,
    weight: z.number().finite().min(0),
    contribution: z.number().finite().min(0),
  })
  .refine(
    (reason) =>
      Math.abs(reason.contribution - reason.transformedValue * reason.weight) <=
      1e-12,
    'Contribution must match transformedValue * weight',
  )
  .readonly();
export const FamiliarityAdjustmentSchema = z
  .strictObject({
    kind: z.enum(['clamp', 'selfReportFloor', 'correctFloor', 'wrongPenalty']),
    before: z.number().finite(),
    after: z.number().finite(),
    evidenceIds: uniqueValues(EvidenceIdSchema),
  })
  .refine((value) => {
    if (value.kind === 'clamp')
      return value.after === Math.max(0, Math.min(1, value.before));
    if (value.before < 0 || value.before > 1) return false;
    return value.kind === 'correctFloor' || value.kind === 'selfReportFloor'
      ? value.after >= value.before && value.after <= 1
      : value.after <= value.before && value.before - value.after <= 1;
  }, 'Adjustment contradicts its declared operation')
  .readonly();
export const FamiliarityEstimateSchema = z
  .strictObject({
    familiarityScore: UnitIntervalSchema,
    confidence: UnitIntervalSchema,
    evidenceStatus: z.enum(['known', 'insufficient']),
    reasons: z.array(FamiliarityReasonSchema).readonly(),
    adjustments: z.array(FamiliarityAdjustmentSchema).readonly(),
    confidenceBasis: z
      .strictObject({
        feature: StableIdSchema,
        evidenceIds: uniqueValues(EvidenceIdSchema),
        value: UnitIntervalSchema,
      })
      .readonly(),
  })
  .superRefine((estimate, context) => {
    if (
      new Set(estimate.reasons.map((reason) => reason.feature)).size !==
      estimate.reasons.length
    )
      context.addIssue({
        code: 'custom',
        path: ['reasons'],
        message: 'Duplicate contribution feature',
      });
    if (estimate.confidenceBasis.value !== estimate.confidence)
      context.addIssue({
        code: 'custom',
        path: ['confidenceBasis'],
        message: 'Confidence basis differs from confidence',
      });
    let value = estimate.reasons.reduce(
      (sum, reason) => sum + reason.contribution,
      0,
    );
    for (const [i, adjustment] of estimate.adjustments.entries()) {
      if (
        !Number.isFinite(value) ||
        Math.abs(value - adjustment.before) > 1e-12
      )
        context.addIssue({
          code: 'custom',
          path: ['adjustments', i],
          message: 'Discontinuous score explanation',
        });
      value = adjustment.after;
    }
    if (
      !Number.isFinite(value) ||
      Math.abs(value - estimate.familiarityScore) > 1e-12
    )
      context.addIssue({
        code: 'custom',
        path: ['familiarityScore'],
        message: 'Score differs from explanation',
      });
  })
  .readonly();
export const FamiliarityMatrixSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    matrixVersion: StableIdSchema,
    catalogVersion: StableIdSchema,
    referenceTime: UtcTimestampSchema,
    scoringConfigVersion: StableIdSchema,
    scoringConfig: ScoringConfigSchema,
    profileVersions: z.record(PlayerIdSchema, ProfileVersionSchema).readonly(),
    playerIds: uniqueValues(PlayerIdSchema),
    songIds: uniqueValues(SongIdSchema),
    cells: z
      .record(
        PlayerIdSchema,
        z.record(SongIdSchema, FamiliarityEstimateSchema).readonly(),
      )
      .readonly(),
  })
  .superRefine((matrix, context) => {
    if (matrix.scoringConfigVersion !== matrix.scoringConfig.version)
      context.addIssue({
        code: 'custom',
        path: ['scoringConfigVersion'],
        message: 'Scoring version must match configuration snapshot',
      });
    function exactKeys(
      expected: readonly string[],
      actual: readonly string[],
      path: (string | number)[],
    ) {
      if (
        actual.length !== expected.length ||
        actual.some((id) => !expected.includes(id))
      )
        context.addIssue({
          code: 'custom',
          path,
          message: 'Matrix IDs and keys must match exactly',
        });
    }
    for (const field of ['playerIds', 'songIds'] as const) {
      const ids = matrix[field];
      if (ids.some((id, i) => i > 0 && id <= ids[i - 1]!))
        context.addIssue({
          code: 'custom',
          path: [field],
          message: 'Matrix IDs must use ascending code-unit order',
        });
    }
    exactKeys(matrix.playerIds, Object.keys(matrix.profileVersions), [
      'profileVersions',
    ]);
    exactKeys(matrix.playerIds, Object.keys(matrix.cells), ['cells']);
    for (const id of matrix.playerIds)
      exactKeys(matrix.songIds, Object.keys(matrix.cells[id] ?? {}), [
        'cells',
        id,
      ]);
  })
  .readonly();
export type FamiliarityEstimate = z.infer<typeof FamiliarityEstimateSchema>;
export type FamiliarityMatrix = z.infer<typeof FamiliarityMatrixSchema>;
