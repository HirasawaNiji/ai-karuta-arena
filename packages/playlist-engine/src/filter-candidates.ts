import {
  SelectionRequestSchema,
  type SelectionRequest,
  type SongId,
  type SelectionResult,
} from '@amp/core';
import { compareIds } from './numeric.js';
export interface FilteredCandidates {
  readonly songIds: readonly SongId[];
  readonly excludedCounts: SelectionResult['excludedCounts'];
}
export function filterCandidates(input: SelectionRequest): FilteredCandidates {
  return filterValidated(SelectionRequestSchema.parse(input));
}
export function filterValidated(input: SelectionRequest): FilteredCandidates {
  const banned = new Set(input.bannedSongIds),
    history = new Set(input.excludedHistorySongIds);
  const songIds: SongId[] = [],
    excludedCounts = { unavailable: 0, banned: 0, history: 0 };
  for (const id of [...input.candidateSongIds].sort(compareIds)) {
    if (!input.availability[id]!.available) excludedCounts.unavailable++;
    else if (banned.has(id)) excludedCounts.banned++;
    else if (history.has(id)) excludedCounts.history++;
    else songIds.push(id);
  }
  return { songIds, excludedCounts };
}
