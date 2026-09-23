import type { Catalog, PlayerId, SongId } from '@amp/core';

export function compileTimeBoundary(
  catalog: Catalog,
  song: SongId,
  player: PlayerId,
) {
  // @ts-expect-error Player IDs must not be usable as Song IDs.
  const invalidSong: SongId = player;
  // @ts-expect-error Catalog outputs are readonly.
  catalog.songs = [];
  if (catalog.songs[0]) {
    // @ts-expect-error Nested lists are readonly too.
    catalog.songs[0].languages = [];
  }
  return { invalidSong, song };
}
