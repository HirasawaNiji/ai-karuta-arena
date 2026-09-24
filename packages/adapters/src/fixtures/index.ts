import {
  CatalogSchema,
  MusicPreferencesSchema,
  RawUserMusicDataSchema,
  type Catalog,
  type RawUserMusicData,
  type SongId,
} from '@amp/core';
export const MOCK_REFERENCE_TIME = '2026-09-24T00:00:00.000Z';
export const MOCK_SOURCE_ID = 'synthetic-music-v1';
const groups = [
  ['mandarin-pop', 'zh', 'pop', 'east-asia', 'mainstream'],
  ['mandarin-rock', 'zh', 'rock', 'east-asia', 'live'],
  ['mandarin-rap', 'zh', 'rap', 'east-asia', 'urban'],
  ['english-pop', 'en', 'pop', 'global', 'mainstream'],
  ['english-rock', 'en', 'rock', 'global', 'live'],
  ['english-rnb', 'en', 'rnb', 'global', 'urban'],
  ['english-electronic', 'en', 'electronic', 'global', 'dance'],
  ['english-indie', 'en', 'indie', 'global', 'independent'],
  ['japanese', 'ja', 'pop', 'east-asia', 'animation'],
  ['korean', 'ko', 'pop', 'east-asia', 'dance'],
  ['cantonese', 'yue', 'pop', 'east-asia', 'live'],
  ['classical', 'instrumental', 'classical', 'global', 'concert'],
  ['jazz', 'instrumental', 'jazz', 'global', 'live'],
  ['latin-world', 'other', 'world', 'latin', 'festival'],
] as const;
const emptyPreferences = () =>
  MusicPreferencesSchema.parse({
    genres: {},
    artists: {},
    languages: {},
    regions: {},
    eras: {},
    cultures: {},
    franchises: {},
    scenes: {},
  });
/** Regenerated on demand, so consumers never share mutable fixture objects. */
export function createMixedFixture(): {
  catalog: Catalog;
  rawData: readonly RawUserMusicData[];
  manifest: ReturnType<typeof coverageManifest>;
} {
  const tagMap = new Map<
    string,
    { id: string; dimension: string; label: string; parentId?: string }
  >();
  function tag(dimension: string, id: string, label = id, parentId?: string) {
    tagMap.set(id, { id, dimension, label, ...(parentId ? { parentId } : {}) });
    return id;
  }
  tag('genres', 'genre:music');
  const songs = groups.flatMap(
    ([name, language, genre, region, scene], groupIndex) =>
      Array.from({ length: 6 }, (_, i) => ({
        id: 'song:' + String(groupIndex * 6 + i + 1).padStart(3, '0'),
        title: 'Synthetic ' + name + ' study ' + (i + 1),
        artistIds: ['artist:' + groupIndex],
        genres: [tag('genres', 'genre:' + genre, genre, 'genre:music')],
        languages: [tag('languages', 'lang:' + language)],
        regions: [tag('regions', 'region:' + region)],
        cultures: [tag('cultures', 'culture:' + name)],
        scenes: [tag('scenes', 'scene:' + scene)],
        ...(scene === 'animation'
          ? { franchises: [tag('franchises', 'franchise:synthetic-animation')] }
          : {}),
        releaseYear: genre === 'classical' ? 1896 : 1985 + (i % 4) * 10,
        popularity: (i + 1) / 7,
        source: 'synthetic-metadata-no-audio',
      })),
  );
  for (const era of ['1890s', '1980s', '1990s', '2000s', '2010s'])
    tag('eras', 'era:' + era);
  const players = Array.from({ length: 6 }, (_, i) => ({
    player: {
      id: 'player:mixed-' + (i + 1),
      displayName: 'Synthetic participant ' + (i + 1),
    },
    preferences: {
      ...emptyPreferences(),
      genres: {
        ['genre:' + groups[i * 2]![2]]: {
          weight: 0.55 + i * 0.06,
          confidence: 0.8,
        },
      },
      languages: {
        ['lang:' + groups[i * 2]![1]]: {
          weight: 0.4 + i * 0.08,
          confidence: 0.75,
        },
      },
    },
    explorationScore: 0.15 + i * 0.12,
  }));
  const catalog = CatalogSchema.parse({
    schemaVersion: 1,
    catalogVersion: 'synthetic-84-v1',
    taxonomyVersion: 'open-taxonomy-v1',
    taxonomy: [...tagMap.values()],
    artists: groups.map(([name, , , region], i) => ({
      id: 'artist:' + i,
      name: 'Synthetic ensemble ' + name,
      originRegionIds: ['region:' + region],
    })),
    songs,
    players,
    audioAssets: [],
    recordings: [],
    questions: [],
    cards: [],
  });
  const rawData = catalog.players.map(({ player, preferences }, i) =>
    RawUserMusicDataSchema.parse({
      schemaVersion: 1,
      sourceId: MOCK_SOURCE_ID,
      userId: player.id,
      snapshotId: 'snapshot:mixed-' + i,
      observedAt: MOCK_REFERENCE_TIME,
      declaredPreferences: preferences,
      evidence: catalog.songs
        .filter(
          (_, j) =>
            Math.floor(j / 6) === i * 2 ||
            Math.floor(j / 6) === i * 2 + 1 ||
            j === (i * 13 + 77) % 84,
        )
        .flatMap((song, j) => [
          {
            type: 'favorite',
            active: true,
            evidenceId: 'mixed:' + i + ':' + j + ':favorite',
            playerId: player.id,
            songId: song.id,
            sourceId: MOCK_SOURCE_ID,
            observedAt: MOCK_REFERENCE_TIME,
          },
          {
            type: 'play_count',
            count: 10 + j * 3,
            countKind: 'cumulative',
            periodStart: '2025-01-01T00:00:00.000Z',
            periodEnd: MOCK_REFERENCE_TIME,
            evidenceId: 'mixed:' + i + ':' + j + ':count',
            playerId: player.id,
            songId: song.id,
            sourceId: MOCK_SOURCE_ID,
            observedAt: MOCK_REFERENCE_TIME,
          },
          {
            type: 'recent_play',
            occurredAt: '2026-09-20T00:00:00.000Z',
            evidenceId: 'mixed:' + i + ':' + j + ':recent',
            playerId: player.id,
            songId: song.id,
            sourceId: MOCK_SOURCE_ID,
            observedAt: MOCK_REFERENCE_TIME,
          },
        ]),
    }),
  );
  return { catalog, rawData, manifest: coverageManifest(catalog) };
}
export function coverageManifest(catalog: Catalog) {
  const distribution = Object.fromEntries(
    [
      'genres',
      'languages',
      'regions',
      'cultures',
      'scenes',
      'franchises',
      'artists',
      'eras',
    ].map((dimension) => {
      const counts = new Map<string, number>();
      for (const song of catalog.songs) {
        const ids =
          dimension === 'artists'
            ? song.artistIds
            : dimension === 'eras'
              ? song.releaseYear === undefined
                ? []
                : ['era:' + Math.floor(song.releaseYear / 10) * 10 + 's']
              : (song[
                  dimension as
                    | 'genres'
                    | 'languages'
                    | 'regions'
                    | 'cultures'
                    | 'scenes'
                    | 'franchises'
                ] ?? []);
        for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      return [
        dimension,
        Object.fromEntries(
          [...counts].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        ),
      ];
    }),
  );
  return {
    datasetVersion: catalog.catalogVersion,
    synthetic: true,
    audioIncluded: false,
    songCount: catalog.songs.length,
    playerCount: catalog.players.length,
    ecosystems: groups
      .filter(([name]) =>
        catalog.songs.some((song) =>
          song.cultures?.some((id) => id === 'culture:' + name),
        ),
      )
      .map(([name]) => name),
    distribution,
  };
}
/** Independent 6 rhythm + 1 classical evidence scenario; never hardcodes a matrix. */
export function createStressFixture(
  variant: 'feasible' | 'missing-catalog' = 'feasible',
): {
  catalog: Catalog;
  rawData: readonly RawUserMusicData[];
  groups: { common: SongId[]; rhythm: SongId[]; classical: SongId[] };
  variant: 'feasible' | 'missing-catalog';
} {
  const mixed = createMixedFixture();
  const players = Array.from({ length: 7 }, (_, i) => ({
    player: {
      id: 'player:stress-' + (i + 1),
      displayName:
        i < 6
          ? 'Synthetic rhythm participant ' + (i + 1)
          : 'Synthetic classical participant',
    },
    preferences: {
      ...emptyPreferences(),
      genres: {
        [i < 6 ? 'genre:electronic' : 'genre:classical']: {
          weight: 0.9,
          confidence: 0.8,
        },
      },
    },
  }));
  const songs = [
    ...mixed.catalog.songs.slice(0, 6),
    ...mixed.catalog.songs
      .slice(36, 39)
      .map((song) => ({ ...song, scenes: ['scene:rhythm-game'] })),
    ...mixed.catalog.songs.slice(66, 69),
  ];
  const common = songs.slice(0, 6).map((s) => s.id),
    rhythm = songs.slice(6, 9).map((s) => s.id),
    classical = songs.slice(9).map((s) => s.id);
  const selectedSongs =
    variant === 'missing-catalog'
      ? songs.filter((s) => rhythm.includes(s.id))
      : songs;
  const catalog = CatalogSchema.parse({
    ...mixed.catalog,
    catalogVersion: 'stress-' + variant + '-v1',
    taxonomy: [
      ...mixed.catalog.taxonomy,
      {
        id: 'scene:rhythm-game',
        dimension: 'scenes',
        label: 'Synthetic rhythm game',
      },
    ],
    players,
    songs: selectedSongs,
  });
  const rawData = catalog.players.map(({ player, preferences }, i) =>
    RawUserMusicDataSchema.parse({
      schemaVersion: 1,
      sourceId: MOCK_SOURCE_ID,
      userId: player.id,
      snapshotId: 'snapshot:stress-' + i,
      observedAt: MOCK_REFERENCE_TIME,
      declaredPreferences: preferences,
      evidence: selectedSongs
        .filter(
          (s) =>
            common.includes(s.id) ||
            (i < 6 ? rhythm : classical).includes(s.id),
        )
        .map((song) => ({
          type: 'warmup_correct',
          evidenceId: 'stress:' + i + ':' + song.id,
          eventId: 'stress-event:' + i + ':' + song.id,
          playerId: player.id,
          songId: song.id,
          sourceId: MOCK_SOURCE_ID,
          observedAt: MOCK_REFERENCE_TIME,
          occurredAt: MOCK_REFERENCE_TIME,
        })),
    }),
  );
  return { catalog, rawData, groups: { common, rhythm, classical }, variant };
}

type Fixture = { catalog: Catalog; rawData: readonly RawUserMusicData[] };
/** Explicit zero reports keep unfamiliar songs supported, independently of simulated answers. */
export function createNoCommonFixture(): Fixture {
  const base = createStressFixture();
  const rawData = base.rawData.map((raw, i) =>
    RawUserMusicDataSchema.parse({
      ...raw,
      evidence: base.catalog.songs.map((song) => {
        const known = (
          i < 6 ? base.groups.common : base.groups.classical
        ).includes(song.id);
        const envelope = {
          evidenceId: 'isolated:' + i + ':' + song.id,
          playerId: raw.userId,
          songId: song.id,
          sourceId: MOCK_SOURCE_ID,
          observedAt: MOCK_REFERENCE_TIME,
        };
        return known
          ? {
              ...envelope,
              type: 'warmup_correct',
              eventId: 'isolated-event:' + i + ':' + song.id,
              occurredAt: MOCK_REFERENCE_TIME,
            }
          : { ...envelope, type: 'self_report', familiarity: 0 };
      }),
    }),
  );
  return {
    catalog: CatalogSchema.parse({
      ...base.catalog,
      catalogVersion: 'stress-no-common-v1',
    }),
    rawData,
  };
}
export function expandNoCommonFixture(
  fixture: Fixture,
  forMinority: boolean,
): Fixture {
  const template = fixture.catalog.songs.find((s) =>
    s.genres.some((g) => g === 'genre:classical'),
  )!;
  const catalog = CatalogSchema.parse({
    ...fixture.catalog,
    catalogVersion: forMinority ? 'minority-expanded' : 'majority-expanded',
    songs: [
      ...fixture.catalog.songs,
      ...Array.from({ length: 3 }, (_, i) => ({
        ...template,
        id: 'new-song:' + i,
        title: 'Synthetic expansion ' + i,
      })),
    ],
  });
  const rawData = fixture.rawData.map((raw, i) =>
    RawUserMusicDataSchema.parse({
      ...raw,
      snapshotId: 'expanded:' + raw.snapshotId,
      evidence: [
        ...raw.evidence,
        ...catalog.songs
          .filter((s) => s.id.startsWith('new-song:'))
          .map((song) => {
            const known = forMinority ? i === 6 : i < 6;
            const envelope = {
              evidenceId: 'expanded:' + i + ':' + song.id,
              playerId: raw.userId,
              songId: song.id,
              sourceId: MOCK_SOURCE_ID,
              observedAt: MOCK_REFERENCE_TIME,
            };
            return known
              ? {
                  ...envelope,
                  type: 'warmup_correct',
                  eventId: 'expanded-event:' + i + ':' + song.id,
                  occurredAt: MOCK_REFERENCE_TIME,
                }
              : { ...envelope, type: 'self_report', familiarity: 0 };
          }),
      ],
    }),
  );
  return { catalog, rawData };
}
