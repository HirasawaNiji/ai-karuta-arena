import { CatalogSchema, type Catalog, type Question } from '@amp/core';

/** Append reviewed material without replacing any published recording or answer. */
export function supplementCatalog(old: Catalog, fresh: Catalog): Catalog {
  const songs = new Set(old.questions.map((q) => q.songId));
  const recordings = new Set(old.questions.map((q) => q.recordingId));
  const assets = new Set(
    old.recordings
      .filter((r) => recordings.has(r.recordingId))
      .map((r) => r.audioAssetId),
  );
  const cards = new Set(old.questions.map((q) => q.answerCardId));
  const merge = <T>(
    previous: readonly T[],
    next: readonly T[],
    key: (v: T) => string,
    fixed: ReadonlySet<string>,
  ) => {
    const values = new Map(previous.map((v) => [key(v), v]));
    for (const value of next)
      if (!fixed.has(key(value))) values.set(key(value), value);
    return [...values.values()];
  };
  return CatalogSchema.parse({
    ...old,
    catalogVersion: fresh.catalogVersion + ':supplement',
    songs: merge(old.songs, fresh.songs, (s) => s.id, songs),
    recordings: merge(
      old.recordings,
      fresh.recordings,
      (r) => r.recordingId,
      recordings,
    ),
    audioAssets: merge(
      old.audioAssets,
      fresh.audioAssets,
      (a) => a.assetId,
      assets,
    ),
    cards: merge(old.cards, fresh.cards, (c) => c.cardId, cards),
    questions: merge(
      old.questions,
      fresh.questions.filter((q) => !songs.has(q.songId)),
      (q) => q.questionId,
      new Set(old.questions.map((q) => q.questionId)),
    ),
    artists: merge(
      old.artists,
      fresh.artists,
      (a) => a.id,
      new Set(old.artists.map((a) => a.id)),
    ),
    taxonomy: merge(
      old.taxonomy,
      fresh.taxonomy,
      (t) => t.id,
      new Set(old.taxonomy.map((t) => t.id)),
    ),
  });
}
export function reviewedQuestions(
  catalog: Catalog,
  verifiedIds: readonly string[],
): Record<string, Question> {
  const questions: Record<string, Question> = {};
  for (const q of catalog.questions) {
    const recording = catalog.recordings.find(
      (r) => r.recordingId === q.recordingId,
    );
    const asset = catalog.audioAssets.find(
      (a) => a.assetId === recording?.audioAssetId,
    );
    if (
      verifiedIds.includes(q.questionId) &&
      asset?.available &&
      asset.usage.status === 'verified' &&
      q.segmentKind === 'intro' &&
      !questions[q.songId]
    )
      questions[q.songId] = q;
  }
  return questions;
}
