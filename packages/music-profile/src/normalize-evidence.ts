import {
  EvidenceSchema,
  EvidenceContextSchema,
  type Catalog,
  type Evidence,
  type EvidenceId,
} from '@amp/core';
import { byObservation, canonical, compare } from './util.js';
export interface NormalizedEvidence {
  readonly evidence: readonly Evidence[];
  readonly duplicateCount: number;
  readonly diagnostics: readonly {
    readonly code: 'UNSUPPORTED_WINDOW_COUNT';
    readonly evidenceId: EvidenceId;
  }[];
}
/** Full-history input, not a stateful incremental merge. Retractions remain per source. */
export function normalizeEvidence(
  input: readonly Evidence[],
  catalog: Catalog,
  referenceTime: string,
): NormalizedEvidence {
  const ids = new Map<string, Evidence>();
  let duplicateCount = 0;
  for (const raw of input) {
    const item = EvidenceSchema.parse(raw);
    const previous = ids.get(item.evidenceId);
    if (previous) {
      if (canonical(previous) !== canonical(item))
        throw new Error('Conflicting evidence ID: ' + item.evidenceId);
      duplicateCount++;
    } else ids.set(item.evidenceId, item);
  }
  // Validate every unique raw observation before eliminating obsolete snapshots.
  const events = new Map<string, Evidence>();
  const unique: Evidence[] = [];
  for (const item of [...ids.values()].sort((a, b) =>
    compare(a.evidenceId, b.evidenceId),
  )) {
    if ('eventId' in item) {
      const previous = events.get(item.eventId);
      if (previous) {
        const payload = (e: Evidence) => {
          const {
            evidenceId: _id,
            sourceId: _source,
            observedAt: _time,
            ...rest
          } = e;
          void _id;
          void _source;
          void _time;
          return canonical(rest);
        };
        if (payload(previous) !== payload(item))
          throw new Error('Conflicting recognition event: ' + item.eventId);
        // Still validate the duplicate envelope, including a future observation.
        EvidenceContextSchema.parse({
          catalog,
          referenceTime,
          evidence: [item],
        });
        duplicateCount++;
        continue;
      }
      events.set(item.eventId, item);
    }
    unique.push(item);
  }
  EvidenceContextSchema.parse({ catalog, referenceTime, evidence: unique });
  const diagnostics: {
    code: 'UNSUPPORTED_WINDOW_COUNT';
    evidenceId: EvidenceId;
  }[] = [];
  const snapshots = new Map<string, Evidence>();
  const history: Evidence[] = [];
  for (const item of unique.sort(byObservation)) {
    if (item.type === 'play_count' && item.countKind === 'window') {
      diagnostics.push({
        code: 'UNSUPPORTED_WINDOW_COUNT',
        evidenceId: item.evidenceId,
      });
      continue;
    }
    if ('eventId' in item) {
      history.push(item);
      continue;
    }
    const target = 'songId' in item ? item.songId : item.artistId;
    const key = canonical([
      item.playerId,
      item.type,
      target,
      item.type === 'self_report' || item.type === 'recent_play'
        ? ''
        : item.sourceId,
    ]);
    const previous = snapshots.get(key);
    if (
      item.type === 'recent_play' &&
      previous?.type === 'recent_play' &&
      (Date.parse(previous.occurredAt) > Date.parse(item.occurredAt) ||
        (Date.parse(previous.occurredAt) === Date.parse(item.occurredAt) &&
          compare(previous.evidenceId, item.evidenceId) > 0))
    )
      continue;
    snapshots.set(key, item);
  }
  const counts = new Map<string, Extract<Evidence, { type: 'play_count' }>>();
  for (const item of snapshots.values()) {
    if (item.type !== 'play_count') {
      history.push(item);
      continue;
    }
    const key = canonical([item.playerId, item.songId]);
    const previous = counts.get(key);
    if (
      !previous ||
      item.count > previous.count ||
      (item.count === previous.count && byObservation(item, previous) > 0)
    )
      counts.set(key, item);
  }
  history.push(...counts.values());
  const evidence = history.sort((a, b) => compare(a.evidenceId, b.evidenceId));
  return {
    evidence,
    duplicateCount,
    diagnostics: diagnostics.sort((a, b) =>
      compare(a.evidenceId, b.evidenceId),
    ),
  };
}
