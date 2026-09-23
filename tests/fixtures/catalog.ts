export function catalogInput() {
  return {
    schemaVersion: 1,
    catalogVersion: 'catalog-test-1',
    taxonomyVersion: 'tags-test-1',
    taxonomy: [
      { id: 'genre:new', dimension: 'genres', label: 'New genre' },
      {
        id: 'genre:child',
        dimension: 'genres',
        label: 'Child',
        parentId: 'genre:new',
      },
      {
        id: 'lang:instrumental',
        dimension: 'languages',
        label: 'Instrumental',
      },
      { id: 'lang:en', dimension: 'languages', label: 'English' },
      { id: 'region:jp', dimension: 'regions', label: 'Japan' },
      { id: 'era:1890s', dimension: 'eras', label: '1890s' },
    ],
    artists: [
      {
        id: 'artist:1',
        name: 'Synthetic artist',
        originRegionIds: ['region:jp'],
      },
    ],
    songs: [
      {
        id: 'song:1',
        title: 'Synthetic study',
        artistIds: ['artist:1'],
        genres: ['genre:child'],
        languages: ['lang:en'],
        releaseYear: 1896,
      },
    ],
    players: [
      {
        player: { id: 'player:1', displayName: 'Synthetic player' },
        preferences: {
          genres: { 'genre:child': { weight: 0.8, confidence: 0.4 } },
          artists: {},
          languages: {},
          regions: {},
          eras: {},
          cultures: {},
          franchises: {},
          scenes: {},
        },
      },
    ],
    audioAssets: [
      {
        assetId: 'asset:1',
        resourcePath: 'synthetic/test.wav',
        durationMs: 1000,
        available: false,
        usage: {
          status: 'pending',
          source: 'Metadata fixture, no actual audio',
        },
      },
    ],
    recordings: [
      {
        recordingId: 'recording:1',
        songId: 'song:1',
        versionLabel: 'Synthetic original',
        audioAssetId: 'asset:1',
      },
    ],
    cards: [
      { cardId: 'card:1', answerKind: 'song-title', text: 'Synthetic study' },
    ],
    questions: [
      {
        questionId: 'question:1',
        songId: 'song:1',
        recordingId: 'recording:1',
        startMs: 0,
        durationMs: 1000,
        segmentKind: 'intro',
        answerCardId: 'card:1',
      },
    ],
  };
}
