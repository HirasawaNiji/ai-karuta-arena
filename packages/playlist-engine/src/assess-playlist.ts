import {
  AssessmentInputSchema,
  FairnessAssessmentSchema,
  type AssessmentInput,
  type FairnessAssessment,
  type FairnessReason,
  type PlayerId,
} from '@amp/core';
import {
  compareIds,
  product,
  quantize,
  requiredCoverage,
  SCALE,
} from './numeric.js';
/** Independent final assessment: never reads selector steps or a host acknowledgement. */
export function assessPlaylist(raw: AssessmentInput): FairnessAssessment {
  const input = AssessmentInputSchema.parse(raw);
  const {
    matrix,
    fairnessConfig: config,
    selectedSongIds,
    requestedCount,
    selectionVersion,
  } = input;
  const playerIds = [...input.playerIds].sort(compareIds);
  const count = selectedSongIds.length;
  product(count, SCALE);
  product(requestedCount, SCALE);
  const familiarThreshold = quantize(config.familiarityThreshold),
    confidenceThreshold = quantize(config.confidenceThreshold);
  const target = requiredCoverage(count, config.minCoverageRatio);
  const metrics: Record<string, FairnessAssessment['playerMetrics'][PlayerId]> =
    Object.create(null) as Record<
      string,
      FairnessAssessment['playerMetrics'][PlayerId]
    >;
  const reasons: FairnessReason[] = [];
  if (!playerIds.length) reasons.push({ code: 'NO_PLAYERS' });
  if (!count) reasons.push({ code: 'EMPTY_PLAYLIST' });
  for (const playerId of playerIds) {
    let familiarCount = 0,
      lowConfidenceCount = 0,
      familiaritySum = 0;
    // Sum by ID, independently of presentation/playback order.
    for (const songId of [...selectedSongIds].sort(compareIds)) {
      const cell = matrix.cells[playerId]![songId]!;
      familiarCount += Number(
        quantize(cell.familiarityScore) >= familiarThreshold,
      );
      lowConfidenceCount += Number(
        quantize(cell.confidence) < confidenceThreshold,
      );
      familiaritySum += cell.familiarityScore;
    }
    metrics[playerId] = {
      familiarCount,
      coverageRatio: count ? familiarCount / count : null,
      familiaritySum,
      lowConfidenceCount,
      lowConfidenceRatio: count ? lowConfidenceCount / count : null,
    };
    if (count && product(familiarCount, SCALE) < product(target, SCALE))
      reasons.push({
        code: 'LOW_COVERAGE',
        playerId,
        observed: familiarCount / count,
        threshold: config.minCoverageRatio,
      });
    if (
      count &&
      product(lowConfidenceCount, SCALE) >
        product(count, quantize(config.maxLowConfidenceRatio))
    )
      reasons.push({
        code: 'LOW_CONFIDENCE',
        playerId,
        observed: lowConfidenceCount / count,
        threshold: config.maxLowConfidenceRatio,
      });
  }
  const validity = count > 0 && playerIds.length > 0;
  const counts = Object.values(metrics).map((m) => m.familiarCount);
  const gapCount = validity ? Math.max(...counts) - Math.min(...counts) : 0;
  const maxCoverageGap = validity ? gapCount / count : null;
  if (
    validity &&
    product(gapCount, SCALE) > product(count, quantize(config.maxCoverageGap))
  )
    reasons.push({
      code: 'COVERAGE_GAP',
      observed: maxCoverageGap!,
      threshold: config.maxCoverageGap,
    });
  if (count < requestedCount)
    reasons.push({
      code: 'SHORT_PLAYLIST',
      observed: count,
      threshold: requestedCount,
    });
  return FairnessAssessmentSchema.parse({
    selectionVersion,
    matrixVersion: matrix.matrixVersion,
    fairnessConfigVersion: config.version,
    fairnessConfig: config,
    playerIds,
    selectedSongIds,
    requestedCount,
    actualCount: count,
    validity,
    passed: validity && !reasons.length,
    playerMetrics: metrics,
    maxCoverageGap,
    reasons,
  });
}
