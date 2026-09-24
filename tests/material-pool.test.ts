import { it, expect } from 'vitest';
import { CatalogSchema } from '@amp/core';
import { supplementCatalog, reviewedQuestions } from '@amp/party-runtime';
import { duelCatalog } from './fixtures/duel.js';
it('activates previously pending songs and preserves every published recording and answer', () => {
  const fresh = duelCatalog(true, 45);
  const old = CatalogSchema.parse({
    ...fresh,
    questions: fresh.questions.slice(0, 40),
    songs: fresh.songs.map((s, i) => ({
      ...s,
      title: i < 40 ? 'Frozen ' + i : 'Pending',
    })),
  });
  const merged = supplementCatalog(old, fresh);
  expect(merged.songs[0]!.title).toBe('Frozen 0');
  expect(merged.songs[40]!.title).toBe(fresh.songs[40]!.title);
  expect(merged.questions).toHaveLength(45);
  expect(merged.questions.slice(0, 40)).toEqual(old.questions);
  expect(
    Object.keys(
      reviewedQuestions(
        merged,
        fresh.questions.map((q) => q.questionId),
      ),
    ),
  ).toHaveLength(45);
  const pending = CatalogSchema.parse({ ...duelCatalog(false), questions: [] });
  expect(
    Object.keys(
      reviewedQuestions(
        supplementCatalog(pending, fresh),
        fresh.questions.map((q) => q.questionId),
      ),
    ),
  ).toHaveLength(45);
});
