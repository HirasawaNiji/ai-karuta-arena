import { z } from 'zod';
import {
  DisplayTextSchema,
  GameTypeSchema,
  PlayerIdSchema,
  PositiveCountSchema,
  SafeCountSchema,
  SongIdSchema,
  StableIdSchema,
  UnitIntervalSchema,
  uniqueValues,
} from './ids.js';
import {
  FairnessConfigSchema,
  ScoringConfigSchema,
  SelectionConfigSchema,
} from './config.js';
import { FamiliarityMatrixSchema } from './familiarity.js';
import { ProfileMatrixContextSchema } from './profile-input.js';
import { ProfileVersionSchema } from './profile.js';
import {
  contractIssue,
  sameData,
  sameIds,
  sameOrder,
} from './contract-validation.js';

export const AvailabilitySchema = z
  .record(
    SongIdSchema,
    z.discriminatedUnion('available', [
      z.strictObject({ available: z.literal(true) }).readonly(),
      z
        .strictObject({
          available: z.literal(false),
          reason: DisplayTextSchema,
        })
        .readonly(),
    ]),
  )
  .readonly();
export const SelectionRequestSchema = z
  .strictObject({
    profileContext: ProfileMatrixContextSchema,
    candidateSongIds: uniqueValues(SongIdSchema),
    requestedCount: PositiveCountSchema,
    bannedSongIds: uniqueValues(SongIdSchema),
    excludedHistorySongIds: uniqueValues(SongIdSchema),
    availability: AvailabilitySchema,
    selectionConfig: SelectionConfigSchema,
    fairnessConfig: FairnessConfigSchema,
    selectionVersion: PositiveCountSchema,
    gameType: GameTypeSchema,
    roundNumber: PositiveCountSchema,
  })
  .superRefine((request, context) => {
    if (
      !sameIds(
        request.candidateSongIds,
        request.profileContext.matrix.songIds,
      ) ||
      !sameIds(request.candidateSongIds, Object.keys(request.availability))
    )
      contractIssue(
        context,
        ['candidateSongIds'],
        'Candidates, matrix columns and availability must match exactly',
      );
  })
  .readonly();
export const AssessmentInputSchema = z
  .strictObject({
    playerIds: uniqueValues(PlayerIdSchema),
    selectedSongIds: uniqueValues(SongIdSchema),
    matrix: FamiliarityMatrixSchema,
    requestedCount: PositiveCountSchema,
    fairnessConfig: FairnessConfigSchema,
    selectionVersion: PositiveCountSchema,
  })
  .superRefine((input, context) => {
    if (
      !sameIds(input.playerIds, input.matrix.playerIds) ||
      input.selectedSongIds.some((id) => !input.matrix.songIds.includes(id))
    )
      contractIssue(
        context,
        ['matrix'],
        'Assessment identities must be present in the complete matrix',
      );
    if (input.selectedSongIds.length > input.requestedCount)
      contractIssue(
        context,
        ['selectedSongIds'],
        'Actual playlist exceeds requested length',
      );
  })
  .readonly();

export const FairnessReasonSchema = z
  .discriminatedUnion('code', [
    z.strictObject({ code: z.literal('NO_PLAYERS') }),
    z.strictObject({ code: z.literal('EMPTY_PLAYLIST') }),
    z.strictObject({
      code: z.literal('LOW_COVERAGE'),
      playerId: PlayerIdSchema,
      observed: UnitIntervalSchema,
      threshold: UnitIntervalSchema,
    }),
    z.strictObject({
      code: z.literal('COVERAGE_GAP'),
      observed: UnitIntervalSchema,
      threshold: UnitIntervalSchema,
    }),
    z.strictObject({
      code: z.literal('LOW_CONFIDENCE'),
      playerId: PlayerIdSchema,
      observed: UnitIntervalSchema,
      threshold: UnitIntervalSchema,
    }),
    z.strictObject({
      code: z.literal('SHORT_PLAYLIST'),
      observed: SafeCountSchema,
      threshold: PositiveCountSchema,
    }),
  ])
  .readonly();
export const PlayerMetricsSchema = z
  .strictObject({
    familiarCount: SafeCountSchema,
    coverageRatio: UnitIntervalSchema.nullable(),
    familiaritySum: z.number().finite().min(0),
    lowConfidenceCount: SafeCountSchema,
    lowConfidenceRatio: UnitIntervalSchema.nullable(),
  })
  .readonly();
export const FairnessAssessmentSchema = z
  .strictObject({
    selectionVersion: PositiveCountSchema,
    matrixVersion: StableIdSchema,
    fairnessConfigVersion: StableIdSchema,
    fairnessConfig: FairnessConfigSchema,
    playerIds: uniqueValues(PlayerIdSchema),
    selectedSongIds: uniqueValues(SongIdSchema),
    requestedCount: PositiveCountSchema,
    actualCount: SafeCountSchema,
    validity: z.boolean(),
    passed: z.boolean(),
    playerMetrics: z.record(PlayerIdSchema, PlayerMetricsSchema).readonly(),
    maxCoverageGap: UnitIntervalSchema.nullable(),
    reasons: z.array(FairnessReasonSchema).readonly(),
  })
  .superRefine((assessment, context) => {
    const count = assessment.actualCount;
    const valid = count > 0 && assessment.playerIds.length > 0;
    if (
      count !== assessment.selectedSongIds.length ||
      count > assessment.requestedCount ||
      assessment.fairnessConfigVersion !== assessment.fairnessConfig.version
    )
      contractIssue(
        context,
        ['actualCount'],
        'Assessment length or configuration version mismatch',
      );
    if (!sameIds(assessment.playerIds, Object.keys(assessment.playerMetrics)))
      contractIssue(
        context,
        ['playerMetrics'],
        'Metrics must cover exactly the assessed players',
      );
    if (
      assessment.validity !== valid ||
      assessment.passed !== (valid && assessment.reasons.length === 0)
    )
      contractIssue(
        context,
        ['passed'],
        'Assessment flags contradict validity or warnings',
      );
    if ((assessment.maxCoverageGap === null) === valid)
      contractIssue(
        context,
        ['maxCoverageGap'],
        'Empty assessments need null ratios; valid ones need numbers',
      );
    for (const [id, metrics] of Object.entries(assessment.playerMetrics)) {
      if (
        metrics.familiarCount > count ||
        metrics.familiaritySum > count ||
        metrics.lowConfidenceCount > count ||
        (count === 0
          ? metrics.coverageRatio !== null ||
            metrics.lowConfidenceRatio !== null
          : metrics.coverageRatio !== metrics.familiarCount / count ||
            metrics.lowConfidenceRatio !== metrics.lowConfidenceCount / count)
      )
        contractIssue(
          context,
          ['playerMetrics', id],
          'Metrics contradict actual playlist length',
        );
    }
    const keys = new Set<string>();
    for (const [i, reason] of assessment.reasons.entries()) {
      const key = JSON.stringify([
        reason.code,
        'playerId' in reason ? reason.playerId : null,
      ]);
      if (
        keys.has(key) ||
        ('playerId' in reason &&
          !assessment.playerIds.includes(reason.playerId))
      )
        contractIssue(
          context,
          ['reasons', i],
          'Duplicate reason or unknown player',
        );
      keys.add(key);
    }
    for (const [code, expected] of [
      ['NO_PLAYERS', assessment.playerIds.length === 0],
      ['EMPTY_PLAYLIST', count === 0],
      ['SHORT_PLAYLIST', count < assessment.requestedCount],
    ] as const) {
      if (
        assessment.reasons.some((reason) => reason.code === code) !== expected
      )
        contractIssue(
          context,
          ['reasons'],
          'Structural warning does not match assessment input',
        );
    }
    for (const reason of assessment.reasons) {
      if (reason.code === 'LOW_COVERAGE' || reason.code === 'LOW_CONFIDENCE') {
        const metrics = assessment.playerMetrics[reason.playerId];
        const observed =
          reason.code === 'LOW_COVERAGE'
            ? metrics?.coverageRatio
            : metrics?.lowConfidenceRatio;
        const threshold =
          reason.code === 'LOW_COVERAGE'
            ? assessment.fairnessConfig.minCoverageRatio
            : assessment.fairnessConfig.maxLowConfidenceRatio;
        if (reason.observed !== observed || reason.threshold !== threshold)
          contractIssue(
            context,
            ['reasons'],
            'Player warning differs from metrics or configuration',
          );
      }
      if (
        reason.code === 'COVERAGE_GAP' &&
        (reason.observed !== assessment.maxCoverageGap ||
          reason.threshold !== assessment.fairnessConfig.maxCoverageGap)
      )
        contractIssue(
          context,
          ['reasons'],
          'Gap warning differs from metrics or configuration',
        );
      if (
        reason.code === 'SHORT_PLAYLIST' &&
        (reason.observed !== count ||
          reason.threshold !== assessment.requestedCount)
      )
        contractIssue(
          context,
          ['reasons'],
          'Short playlist warning must retain original requested count',
        );
    }
  })
  .readonly();

const CountByPlayerSchema = z
  .record(PlayerIdSchema, SafeCountSchema)
  .readonly();
export const ObjectiveValuesSchema = z
  .strictObject({
    fairness: UnitIntervalSchema,
    diversity: UnitIntervalSchema,
    competition: UnitIntervalSchema,
    exploration: UnitIntervalSchema,
    softRatio: UnitIntervalSchema,
    total: z.number().finite(),
  })
  .readonly();
const SignedGainSchema = z.number().finite().min(-1).max(1);
export const SelectionStepSchema = z
  .strictObject({
    songId: SongIdSchema,
    coverageBefore: CountByPlayerSchema,
    coverageAfter: CountByPlayerSchema,
    deficitGain: SafeCountSchema,
    objectiveBefore: ObjectiveValuesSchema,
    objectiveAfter: ObjectiveValuesSchema,
    objectiveGains: z
      .strictObject({
        fairness: SignedGainSchema,
        diversity: SignedGainSchema,
        competition: SignedGainSchema,
        exploration: SignedGainSchema,
        softRatio: SignedGainSchema,
      })
      .readonly(),
    softRatioContribution: z.number().finite(),
    totalGain: z.number().finite(),
    gainKey: z
      .number()
      .int()
      .min(-Number.MAX_SAFE_INTEGER)
      .max(Number.MAX_SAFE_INTEGER),
    tieBreak: z
      .strictObject({
        rule: z.enum(['deficit', 'objective', 'song_id']),
        tiedSongIds: uniqueValues(SongIdSchema).refine(
          (ids) => ids.length > 0,
          'Tie-break candidates required',
        ),
      })
      .readonly(),
  })
  .superRefine((step, context) => {
    if (
      !sameIds(
        Object.keys(step.coverageBefore),
        Object.keys(step.coverageAfter),
      ) ||
      !step.tieBreak.tiedSongIds.includes(step.songId)
    )
      contractIssue(
        context,
        ['coverageAfter'],
        'Step player IDs or tie-break winner mismatch',
      );
    for (const [id, before] of Object.entries(step.coverageBefore)) {
      const after = Object.entries(step.coverageAfter).find(
        ([key]) => key === id,
      )?.[1];
      if (after === undefined || after < before || after - before > 1)
        contractIssue(
          context,
          ['coverageAfter', id],
          'One selection may add at most one familiar song',
        );
    }
  })
  .readonly();
export const SelectionInputVersionsSchema = z
  .strictObject({
    selectionVersion: PositiveCountSchema,
    matrixVersion: StableIdSchema,
    catalogVersion: StableIdSchema,
    profileVersions: z.record(PlayerIdSchema, ProfileVersionSchema).readonly(),
    scoringConfig: ScoringConfigSchema,
    selectionConfig: SelectionConfigSchema,
    fairnessConfig: FairnessConfigSchema,
  })
  .readonly();
export const SelectionResultSchema = z
  .strictObject({
    selectedSongIds: uniqueValues(SongIdSchema),
    steps: z.array(SelectionStepSchema).readonly(),
    requestedCount: PositiveCountSchema,
    actualCount: SafeCountSchema,
    excludedCounts: z
      .strictObject({
        unavailable: SafeCountSchema,
        banned: SafeCountSchema,
        history: SafeCountSchema,
      })
      .readonly(),
    unfilledCoverage: CountByPlayerSchema,
    objectiveSummary: ObjectiveValuesSchema,
    fairnessAssessment: FairnessAssessmentSchema,
    inputVersions: SelectionInputVersionsSchema,
  })
  .superRefine((result, context) => {
    const assessment = result.fairnessAssessment;
    let previousCoverage: Readonly<Record<string, number>> = Object.fromEntries(
      assessment.playerIds.map((id) => [id, 0]),
    );
    let previousObjective = {
      fairness: 0,
      diversity: 0,
      competition: 0,
      exploration: 0,
      softRatio: 0,
      total: 0,
    };
    for (const [i, step] of result.steps.entries()) {
      if (
        !sameData(step.coverageBefore, previousCoverage) ||
        !sameData(step.objectiveBefore, previousObjective) ||
        Object.values(step.coverageAfter).some((count) => count > i + 1)
      )
        contractIssue(
          context,
          ['steps', i],
          'Selection explanation is not continuous from an empty playlist',
        );
      previousCoverage = step.coverageAfter;
      previousObjective = step.objectiveAfter;
    }
    if (!sameData(previousObjective, result.objectiveSummary))
      contractIssue(
        context,
        ['objectiveSummary'],
        'Objective summary must match the final selection step',
      );
    if (
      result.actualCount !== result.selectedSongIds.length ||
      result.actualCount > result.requestedCount ||
      !sameOrder(
        result.steps.map((step) => step.songId),
        result.selectedSongIds,
      ) ||
      !sameOrder(assessment.selectedSongIds, result.selectedSongIds) ||
      assessment.requestedCount !== result.requestedCount ||
      assessment.actualCount !== result.actualCount
    )
      contractIssue(
        context,
        ['steps'],
        'Result, steps and assessment must describe the same ordered playlist',
      );
    if (
      assessment.selectionVersion !== result.inputVersions.selectionVersion ||
      assessment.matrixVersion !== result.inputVersions.matrixVersion ||
      !sameData(assessment.fairnessConfig, result.inputVersions.fairnessConfig)
    )
      contractIssue(
        context,
        ['inputVersions'],
        'Assessment version or configuration mismatch',
      );
    if (
      !sameIds(
        assessment.playerIds,
        Object.keys(result.inputVersions.profileVersions),
      ) ||
      !sameIds(assessment.playerIds, Object.keys(result.unfilledCoverage)) ||
      result.steps.some(
        (step) =>
          !sameIds(assessment.playerIds, Object.keys(step.coverageBefore)),
      )
    )
      contractIssue(
        context,
        ['steps'],
        'Result player keys must match assessed players',
      );
  })
  .readonly();
export type SelectionRequest = z.infer<typeof SelectionRequestSchema>;
export type AssessmentInput = z.infer<typeof AssessmentInputSchema>;
export type FairnessReason = z.infer<typeof FairnessReasonSchema>;
export type FairnessAssessment = z.infer<typeof FairnessAssessmentSchema>;
export type SelectionResult = z.infer<typeof SelectionResultSchema>;
