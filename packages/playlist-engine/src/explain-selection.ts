import {
  AssessmentInputSchema,
  SelectionRequestSchema,
  type AssessmentInput,
  type FairnessAssessment,
  type PlayerId,
  type SongId,
  type SelectionRequest,
  type SelectionResult,
} from '@amp/core';
import { assessPlaylist } from './assess-playlist.js';
import { createObjective, type SongClassification } from './objective.js';
import { filterValidated } from './filter-candidates.js';
import { quantize, compareIds } from './numeric.js';
import { selectPlaylist } from './select-playlist.js';
export interface CellComparison {
  readonly playerId: PlayerId;
  readonly songId: SongId;
  readonly familiarityScore: number;
  readonly confidence: number;
  readonly familiarityInt: number;
  readonly confidenceInt: number;
  readonly familiarityThresholdInt: number;
  readonly confidenceThresholdInt: number;
  readonly isFamiliar: boolean;
  readonly isLowConfidence: boolean;
}
export interface AssessmentReport {
  readonly assessment: FairnessAssessment;
  readonly comparisons: readonly CellComparison[];
}
export interface SelectionReport extends AssessmentReport {
  readonly result: SelectionResult;
  readonly songs: readonly SongClassification[];
  readonly message: string;
}
function comparisons(input: AssessmentInput): CellComparison[] {
  const familiarityThresholdInt = quantize(
      input.fairnessConfig.familiarityThreshold,
    ),
    confidenceThresholdInt = quantize(input.fairnessConfig.confidenceThreshold);
  return [...input.playerIds].sort(compareIds).flatMap((playerId) =>
    input.selectedSongIds.map((songId) => {
      const cell = input.matrix.cells[playerId]![songId]!;
      const familiarityInt = quantize(cell.familiarityScore),
        confidenceInt = quantize(cell.confidence);
      return {
        playerId,
        songId,
        familiarityScore: cell.familiarityScore,
        confidence: cell.confidence,
        familiarityInt,
        confidenceInt,
        familiarityThresholdInt,
        confidenceThresholdInt,
        isFamiliar: familiarityInt >= familiarityThresholdInt,
        isLowConfidence: confidenceInt < confidenceThresholdInt,
      };
    }),
  );
}
/** A report of the exact current playlist, independent of old selection history. */
export function explainAssessment(raw: AssessmentInput): AssessmentReport {
  const input = AssessmentInputSchema.parse(raw);
  return { assessment: assessPlaylist(input), comparisons: comparisons(input) };
}
/** Calculates its own result so callers cannot attach an unrelated result to this explanation. */
export function explainSelection(raw: SelectionRequest): SelectionReport {
  const input = SelectionRequestSchema.parse(raw);
  const result = selectPlaylist(input),
    objective = createObjective(input, filterValidated(input).songIds);
  const assessmentInput = {
    playerIds: input.profileContext.matrix.playerIds,
    selectedSongIds: result.selectedSongIds,
    matrix: input.profileContext.matrix,
    requestedCount: input.requestedCount,
    fairnessConfig: input.fairnessConfig,
    selectionVersion: input.selectionVersion,
  };
  return {
    result,
    assessment: result.fairnessAssessment,
    comparisons: comparisons(assessmentInput),
    songs: result.selectedSongIds.map((id) => objective.classify(id)),
    message: result.fairnessAssessment.passed
      ? '已找到满足当前规则的题组。'
      : '本次未找到达标题组，请查看当前评估原因。',
  };
}
