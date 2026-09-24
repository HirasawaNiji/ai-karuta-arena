import {
  SelectionRequestSchema,
  SelectionResultSchema,
  type SelectionRequest,
  type SelectionResult,
  type SongId,
  type PlayerId,
} from '@amp/core';
import { assessPlaylist } from './assess-playlist.js';
import { filterValidated } from './filter-candidates.js';
import { createObjective, emptyObjective } from './objective.js';
import {
  compareIds,
  gainKey,
  product,
  requiredCoverage,
  safeInteger,
} from './numeric.js';
export function selectPlaylist(raw: SelectionRequest): SelectionResult {
  const input = SelectionRequestSchema.parse(raw);
  const { matrix, catalog, scoringConfig } = input.profileContext;
  const playerIds = matrix.playerIds;
  const { songIds: candidates, excludedCounts } = filterValidated(input);
  const objective = createObjective(input, candidates);
  const target = requiredCoverage(
    input.requestedCount,
    input.fairnessConfig.minCoverageRatio,
  );
  const selected: SongId[] = [],
    steps: SelectionResult['steps'][number][] = [];
  let coverage: Record<PlayerId, number> = Object.fromEntries(
    playerIds.map((id) => [id, 0]),
  );
  let before = emptyObjective();
  const remaining = new Set(candidates);
  // Reject unsafe squared deficits even if there are fewer available candidates than requested.
  if (playerIds.length) product(playerIds.length, product(target, target));
  while (
    playerIds.length &&
    selected.length < input.requestedCount &&
    remaining.size
  ) {
    const options = [...remaining]
      .map((songId) => {
        const familiar = new Set(objective.classify(songId).familiarPlayerIds);
        const afterCoverage: Record<PlayerId, number> = Object.fromEntries(
          playerIds.map((id) => [id, coverage[id]! + Number(familiar.has(id))]),
        );
        let deficitGain = 0;
        for (const id of playerIds) {
          const a = Math.max(0, target - coverage[id]!),
            b = Math.max(0, target - afterCoverage[id]!);
          deficitGain = safeInteger(
            deficitGain + product(a, a) - product(b, b),
          );
        }
        const after = objective.evaluate([...selected, songId]),
          totalGain = after.total - before.total;
        return {
          songId,
          afterCoverage,
          deficitGain,
          after,
          totalGain,
          gainKey: gainKey(totalGain),
        };
      })
      .sort(
        (a, b) =>
          b.deficitGain - a.deficitGain ||
          b.gainKey - a.gainKey ||
          compareIds(a.songId, b.songId),
      );
    const winner = options[0]!;
    const deficitTies = options.filter(
      (o) => o.deficitGain === winner.deficitGain,
    );
    const objectiveTies = deficitTies.filter(
      (o) => o.gainKey === winner.gainKey,
    );
    const rule =
      deficitTies.length === 1
        ? 'deficit'
        : objectiveTies.length === 1
          ? 'objective'
          : 'song_id';
    const tiedSongIds = (
      rule === 'deficit'
        ? [winner]
        : rule === 'objective'
          ? deficitTies
          : objectiveTies
    )
      .map((o) => o.songId)
      .sort(compareIds);
    const gains = {
      fairness: winner.after.fairness - before.fairness,
      diversity: winner.after.diversity - before.diversity,
      competition: winner.after.competition - before.competition,
      exploration: winner.after.exploration - before.exploration,
      softRatio: winner.after.softRatio - before.softRatio,
    };
    steps.push({
      songId: winner.songId,
      coverageBefore: coverage,
      coverageAfter: winner.afterCoverage,
      deficitGain: winner.deficitGain,
      objectiveBefore: before,
      objectiveAfter: winner.after,
      objectiveGains: gains,
      softRatioContribution:
        gains.softRatio * input.selectionConfig.softRatioWeight,
      totalGain: winner.totalGain,
      gainKey: winner.gainKey,
      tieBreak: { rule, tiedSongIds },
    });
    selected.push(winner.songId);
    remaining.delete(winner.songId);
    coverage = winner.afterCoverage;
    before = winner.after;
  }
  const fairnessAssessment = assessPlaylist({
    playerIds,
    selectedSongIds: selected,
    matrix,
    requestedCount: input.requestedCount,
    fairnessConfig: input.fairnessConfig,
    selectionVersion: input.selectionVersion,
  });
  return SelectionResultSchema.parse({
    selectedSongIds: selected,
    steps,
    requestedCount: input.requestedCount,
    actualCount: selected.length,
    excludedCounts,
    unfilledCoverage: Object.fromEntries(
      playerIds.map((id) => [id, Math.max(0, target - coverage[id]!)]),
    ),
    objectiveSummary: before,
    fairnessAssessment,
    inputVersions: {
      selectionVersion: input.selectionVersion,
      matrixVersion: matrix.matrixVersion,
      catalogVersion: catalog.catalogVersion,
      profileVersions: matrix.profileVersions,
      scoringConfig,
      selectionConfig: input.selectionConfig,
      fairnessConfig: input.fairnessConfig,
    },
  });
}
