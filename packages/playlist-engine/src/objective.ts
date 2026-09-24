import {
  SelectionRequestSchema,
  eraForYear,
  type SelectionRequest,
  type SelectionResult,
  type SongId,
  type PlayerId,
  type SongProfile,
} from '@amp/core';
import { compareIds, product, quantize, SCALE, unit } from './numeric.js';
import { filterValidated } from './filter-candidates.js';
export type ObjectiveValues = SelectionResult['objectiveSummary'];
export const emptyObjective = (): ObjectiveValues => ({
  fairness: 0,
  diversity: 0,
  competition: 0,
  exploration: 0,
  softRatio: 0,
  total: 0,
});
const dimensions = [
  'genres',
  'languages',
  'regions',
  'artists',
  'eras',
  'cultures',
  'franchises',
] as const;
type Dimension = (typeof dimensions)[number];
export type SongCategory = 'common' | 'home' | 'exploration';
export interface SongClassification {
  readonly songId: SongId;
  readonly familiarPlayerIds: readonly PlayerId[];
  readonly category: SongCategory;
}
export interface ObjectiveContext {
  readonly classify: (id: SongId) => SongClassification;
  readonly evaluate: (selected: readonly SongId[]) => ObjectiveValues;
}
/** All callers share a fixed filtered candidate universe A, never shrinking it per step. */
export function createObjective(
  input: SelectionRequest,
  candidateIds: readonly SongId[],
): ObjectiveContext {
  const { matrix, catalog, profiles } = input.profileContext;
  const playerIds = matrix.playerIds;
  const sortedProfiles = [...profiles].sort((a, b) =>
    compareIds(a.playerId, b.playerId),
  );
  const config = input.selectionConfig,
    N = input.requestedCount;
  product(N, SCALE);
  const songs = new Map(catalog.songs.map((s) => [s.id, s]));
  const knownEras = new Set(
    catalog.taxonomy
      .filter((t) => t.dimension === 'eras')
      .map((t) => t.id as string),
  );
  const tags = (song: SongProfile, dimension: Dimension): readonly string[] => {
    if (dimension === 'artists') return song.artistIds;
    if (dimension === 'eras') {
      const id =
        song.releaseYear === undefined
          ? undefined
          : 'era:' + eraForYear(song.releaseYear);
      return id !== undefined && knownEras.has(id) ? [id] : [];
    }
    return song[dimension] ?? [];
  };
  const threshold = quantize(input.fairnessConfig.familiarityThreshold);
  const classifications = new Map<SongId, SongClassification>();
  const relevance = new Map<SongId, number>(),
    competition = new Map<SongId, number>(),
    exploration = new Map<SongId, number>();
  const explorationMean = sortedProfiles.length
    ? sortedProfiles.reduce(
        (sum, p) =>
          sum + (p.explorationScore ?? config.defaultExplorationScore),
        0,
      ) / sortedProfiles.length
    : 0;
  for (const id of candidateIds) {
    const familiarPlayerIds = playerIds.filter(
      (p) => quantize(matrix.cells[p]![id]!.familiarityScore) >= threshold,
    );
    classifications.set(id, {
      songId: id,
      familiarPlayerIds,
      category:
        familiarPlayerIds.length >= 2
          ? 'common'
          : familiarPlayerIds.length === 1
            ? 'home'
            : 'exploration',
    });
    const values = playerIds.map((p) => matrix.cells[p]![id]!.familiarityScore);
    const maximum = Math.max(0, ...values);
    relevance.set(id, maximum);
    let pairs = 0,
      sum = 0;
    for (let i = 0; i < values.length; i++)
      for (let j = i + 1; j < values.length; j++) {
        pairs++;
        sum += Math.min(values[i]!, values[j]!);
      }
    competition.set(id, pairs ? sum / pairs : 0);
    exploration.set(
      id,
      (songs.get(id)!.popularity ?? 0) * (1 - maximum) * explorationMean,
    );
  }
  const diversity = dimensions.map((dimension) => {
    const weights = new Map<string, number>();
    for (const id of candidateIds)
      for (const tag of tags(songs.get(id)!, dimension))
        weights.set(tag, Math.max(weights.get(tag) ?? 0, relevance.get(id)!));
    for (const [tag, value] of weights) {
      const mean = sortedProfiles.length
        ? sortedProfiles.reduce(
            (sum, p) =>
              sum +
              (Object.entries(p.preferences[dimension]).find(
                ([id]) => id === tag,
              )?.[1].weight ?? 0),
            0,
          ) / sortedProfiles.length
        : 0;
      weights.set(tag, Math.max(value, mean));
    }
    const entries = [...weights].sort(([a], [b]) => compareIds(a, b));
    return {
      dimension,
      entries,
      denominator: entries.reduce((sum, [, value]) => sum + value, 0),
      weight: config.diversityWeights[dimension],
    };
  });
  const usable = diversity.filter((d) => d.denominator > 0 && d.weight > 0);
  // Normalize weights before multiplying contributions to avoid unnecessary intermediate overflow.
  const diversityWeight = usable.reduce((sum, d) => sum + d.weight, 0);
  const allowed = new Set(candidateIds);
  function classify(id: SongId): SongClassification {
    const classification = classifications.get(id);
    if (!classification)
      throw new Error('INVALID_INPUT: song outside filtered candidates');
    return classification;
  }
  function evaluate(selected: readonly SongId[]): ObjectiveValues {
    if (
      new Set(selected).size !== selected.length ||
      selected.length > N ||
      selected.some((id) => !allowed.has(id))
    )
      throw new Error('INVALID_INPUT: invalid objective playlist');
    if (!selected.length || !playerIds.length) return emptyObjective();
    const ordered = [...selected].sort(compareIds);
    const counts = playerIds.map(
      (p) =>
        ordered.reduce(
          (sum, id) => sum + Number(classify(id).familiarPlayerIds.includes(p)),
          0,
        ) / N,
    );
    const mean = counts.reduce((sum, value) => sum + value, 0) / counts.length;
    const fairness = unit(
      1 -
        counts.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
          counts.length,
    );
    let diversityValue = 0;
    for (const d of usable) {
      const covered = new Set(
        ordered.flatMap((id) => [...tags(songs.get(id)!, d.dimension)]),
      );
      const matched = d.entries.reduce(
        (sum, [tag, value]) => sum + (covered.has(tag) ? value : 0),
        0,
      );
      diversityValue +=
        (d.weight / diversityWeight) * (matched / d.denominator);
    }
    const competitionValue = unit(
      ordered.reduce((sum, id) => sum + competition.get(id)!, 0) / N,
    );
    const explorationValue = unit(
      ordered.reduce((sum, id) => sum + exploration.get(id)!, 0) / N,
    );
    const categoryCounts = { common: 0, home: 0, exploration: 0 };
    for (const id of ordered) categoryCounts[classify(id).category]++;
    const softRatio = unit(
      1 -
        0.5 *
          (['common', 'home', 'exploration'] as const).reduce(
            (sum, c) =>
              sum +
              Math.abs(
                categoryCounts[c] / ordered.length - config.targetRatios[c],
              ),
            0,
          ),
    );
    const values = {
      fairness,
      diversity: unit(diversityValue),
      competition: competitionValue,
      exploration: explorationValue,
      softRatio,
    };
    const total =
      values.fairness * config.objectiveWeights.fairness +
      values.diversity * config.objectiveWeights.diversity +
      values.competition * config.objectiveWeights.competition +
      values.exploration * config.objectiveWeights.exploration +
      softRatio * config.softRatioWeight;
    if (!Number.isFinite(total))
      throw new RangeError('INVALID_INPUT: objective overflow');
    return { ...values, total };
  }
  return { classify, evaluate };
}
/** Public pure calculator, also useful for independently checking every marginal gain. */
export function evaluateObjective(
  raw: SelectionRequest,
  selected: readonly SongId[],
): ObjectiveValues {
  const input = SelectionRequestSchema.parse(raw);
  return createObjective(input, filterValidated(input).songIds).evaluate(
    selected,
  );
}
