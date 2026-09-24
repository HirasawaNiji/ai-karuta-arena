import { CatalogSchema, type Catalog } from '@amp/core';
import { catalogInput } from './catalog.js';
export function duelCatalog(verified = true, count = 40): Catalog {
  const raw = catalogInput();
  const first = raw.songs[0]!;
  const catalog = CatalogSchema.parse({
    ...raw,
    players: [],
    songs: Array.from({ length: count }, (_, i) => ({
      ...first,
      id: 'song:' + i,
    })),
    audioAssets: [
      {
        ...raw.audioAssets[0],
        available: true,
        usage: {
          status: verified ? 'verified' : 'pending',
          source: 'test',
          ...(verified
            ? { reference: 'test-only', allowedUse: 'test-only' }
            : {}),
        },
      },
    ],
    recordings: Array.from({ length: count }, (_, i) => ({
      ...raw.recordings[0],
      songId: 'song:' + i,
      recordingId: 'recording:' + i,
    })),
    cards: Array.from({ length: count }, (_, i) => ({
      ...raw.cards[0],
      cardId: 'card:' + i,
    })),
    questions: Array.from({ length: count }, (_, i) => ({
      ...raw.questions[0],
      questionId: 'q:' + i,
      songId: 'song:' + i,
      recordingId: 'recording:' + i,
      answerCardId: 'card:' + i,
    })),
  });
  return catalog;
}
