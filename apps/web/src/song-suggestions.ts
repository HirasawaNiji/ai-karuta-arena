import type { Catalog } from '@amp/core';

type Song = Catalog['songs'][number];

export function matchingSongs(songs: readonly Song[], tags: readonly string[]) {
  const selected = new Set(tags);
  return songs.filter(
    (song) =>
      !selected.size ||
      [
        ...song.languages,
        ...song.genres,
        ...(song.cultures ?? []),
        ...(song.regions ?? []),
        ...(song.franchises ?? []),
        ...(song.scenes ?? []),
      ].some((tag) => selected.has(tag)),
  );
}

export function sampleSongs(
  songs: readonly Song[],
  previous: readonly Song[] = [],
): Song[] {
  function shuffle(pool: Song[]) {
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    return pool;
  }
  const previousIds = new Set(previous.map((song) => song.id));
  // Prefer unseen songs, then fill from the previous batch for small pools.
  return [
    ...shuffle(songs.filter((song) => !previousIds.has(song.id))),
    ...shuffle(songs.filter((song) => previousIds.has(song.id))),
  ].slice(0, 5);
}
