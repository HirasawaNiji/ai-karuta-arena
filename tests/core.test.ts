import { describe, expect, it } from 'vitest';
import {
  CatalogSchema,
  StableIdSchema,
  TaxonomySchema,
  UnitIntervalSchema,
  MusicPreferencesSchema,
  ResourcePathSchema,
  SongProfileSchema,
  eraForYear,
} from '@amp/core';
import { catalogInput } from './fixtures/catalog.js';

describe('open music contracts (AC-01 and M1.3)', () => {
  it('accepts a new genre hierarchy and pre-1960 music without an IP or culture', () => {
    const catalog = CatalogSchema.parse(catalogInput());
    expect(catalog.songs[0]?.releaseYear).toBe(1896);
    expect(eraForYear(1896)).toBe('1890s');
    expect(catalog.songs[0]?.franchises).toBeUndefined();
    expect(catalog.songs[0]?.cultures).toBeUndefined();
    expect(catalog.taxonomy.some((tag) => tag.id === 'genre:child')).toBe(true);
  });
  it('keeps an artist region independent of song language and supports instrumental music', () => {
    const input = catalogInput();
    input.songs[0]!.languages = ['lang:instrumental'];
    const result = CatalogSchema.parse(input);
    expect(result.songs[0]?.languages).toEqual(['lang:instrumental']);
    expect(result.songs[0]?.regions).toBeUndefined();
    expect(result.artists[0]?.originRegionIds).toEqual(['region:jp']);
  });
  it('preserves unknown metadata and empty genre lists without creating negative preferences', () => {
    const input = catalogInput();
    input.songs[0]!.genres = [];
    const result = CatalogSchema.parse(input);
    expect(result.songs[0]?.genres).toEqual([]);
    expect(result.songs[0]?.popularity).toBeUndefined();
    expect(result.players[0]?.preferences.languages).toEqual({});
    expect(result.players[0]?.explorationScore).toBeUndefined();
  });
  it('returns isolated readonly nested structures', () => {
    const input = catalogInput();
    const result = CatalogSchema.parse(input);
    input.songs[0]!.title = 'Changed';
    input.songs[0]!.genres.push('another');
    expect(result.songs[0]?.title).toBe('Synthetic study');
    expect(result.songs[0]?.genres).toEqual(['genre:child']);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.songs[0])).toBe(true);
    expect(Object.isFrozen(result.songs[0]?.genres)).toBe(true);
    expect(
      Object.isFrozen(
        Object.values(result.players[0]?.preferences.genres ?? {})[0],
      ),
    ).toBe(true);
  });
  it.each(['', ' leading', 'trailing ', 'bad\nvalue'])(
    'rejects invalid stable ID %j',
    (value) => {
      expect(StableIdSchema.safeParse(value).success).toBe(false);
    },
  );
  it.each([NaN, Infinity, -Infinity, -0.001, 1.001])(
    'rejects invalid unit value %s',
    (value) => {
      expect(UnitIntervalSchema.safeParse(value).success).toBe(false);
    },
  );
  it('accepts preference endpoints, rejects unknown fields and out-of-range confidence', () => {
    const preferences = catalogInput().players[0]!.preferences;
    preferences.genres['genre:child'] = { weight: 0, confidence: 1 };
    expect(MusicPreferencesSchema.safeParse(preferences).success).toBe(true);
    preferences.genres['genre:child'].confidence = -1;
    expect(MusicPreferencesSchema.safeParse(preferences).success).toBe(false);
    expect(
      SongProfileSchema.safeParse({
        ...catalogInput().songs[0],
        fixedCultureType: 'x',
      }).success,
    ).toBe(false);
  });
  it.each(['missing', 'cross-dimension', 'cycle', 'duplicate'])(
    'rejects %s taxonomy parents',
    (kind) => {
      const tags = catalogInput().taxonomy;
      if (kind === 'missing') tags[1]!.parentId = 'unknown';
      if (kind === 'cross-dimension') tags[1]!.parentId = 'lang:en';
      if (kind === 'cycle') tags[0]!.parentId = 'genre:child';
      if (kind === 'duplicate') tags.push({ ...tags[0]! });
      expect(TaxonomySchema.safeParse(tags).success).toBe(false);
    },
  );
  it.each([
    'songs',
    'artists',
    'players',
    'audioAssets',
    'recordings',
    'cards',
    'questions',
  ] as const)(
    'rejects duplicate %s IDs even for identical content',
    (field) => {
      const input = catalogInput();
      const values = input[field];
      Object.assign(input, { [field]: [...values, ...values] });
      expect(CatalogSchema.safeParse(input).success).toBe(false);
    },
  );
  it('rejects unknown artists, dimensions, preference references, and repeated tags', () => {
    const missingArtist = catalogInput();
    missingArtist.songs[0]!.artistIds = ['not-registered'];
    expect(CatalogSchema.safeParse(missingArtist).success).toBe(false);
    const wrongDimension = catalogInput();
    wrongDimension.songs[0]!.languages = ['region:jp'];
    expect(CatalogSchema.safeParse(wrongDimension).success).toBe(false);
    const preferences = catalogInput();
    preferences.taxonomy = preferences.taxonomy.filter(
      (tag) => tag.id !== 'genre:child',
    );
    preferences.songs[0]!.genres = [];
    expect(CatalogSchema.safeParse(preferences).success).toBe(false);
    const repeated = catalogInput();
    repeated.songs[0]!.languages = ['lang:en', 'lang:en'];
    expect(CatalogSchema.safeParse(repeated).success).toBe(false);
  });
});

describe('recording, question and card boundaries', () => {
  it('allows a segment ending exactly at the asset boundary', () => {
    const input = catalogInput();
    input.questions[0]!.startMs = 700;
    input.questions[0]!.durationMs = 300;
    expect(CatalogSchema.safeParse(input).success).toBe(true);
    input.questions[0]!.durationMs = 301;
    expect(CatalogSchema.safeParse(input).success).toBe(false);
  });
  it.each([-1, 0, 0.5, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid duration %s',
    (duration) => {
      const input = catalogInput();
      input.questions[0]!.durationMs = duration;
      expect(CatalogSchema.safeParse(input).success).toBe(false);
    },
  );
  it('rejects overflow-sized segments without relying on unsafe addition', () => {
    const input = catalogInput();
    input.audioAssets[0]!.durationMs = Number.MAX_SAFE_INTEGER;
    input.questions[0]!.startMs = Number.MAX_SAFE_INTEGER - 1;
    input.questions[0]!.durationMs = 2;
    expect(CatalogSchema.safeParse(input).success).toBe(false);
  });
  it.each(['songId', 'recordingId', 'answerCardId'] as const)(
    'rejects broken question %s reference',
    (key) => {
      const input = catalogInput();
      input.questions[0]![key] = 'unknown';
      expect(CatalogSchema.safeParse(input).success).toBe(false);
    },
  );
  it('does not allow a recording from another song', () => {
    const input = catalogInput();
    input.songs.push({ ...input.songs[0]!, id: 'song:2' });
    input.recordings[0]!.songId = 'song:2';
    expect(CatalogSchema.safeParse(input).success).toBe(false);
  });
  it('rejects one answer card shared by different songs', () => {
    const input = catalogInput();
    input.songs.push({ ...input.songs[0]!, id: 'song:2' });
    input.recordings.push({
      ...input.recordings[0]!,
      recordingId: 'recording:2',
      songId: 'song:2',
    });
    input.questions.push({
      ...input.questions[0]!,
      questionId: 'question:2',
      songId: 'song:2',
      recordingId: 'recording:2',
    });
    expect(CatalogSchema.safeParse(input).success).toBe(false);
    input.cards[0]!.answerKind = 'work';
    expect(CatalogSchema.safeParse(input).success).toBe(true);
  });
  it('permits distinct recordings/questions for a song without conflating their IDs', () => {
    const input = catalogInput();
    input.recordings.push({
      ...input.recordings[0]!,
      recordingId: 'recording:live',
      versionLabel: 'Live',
    });
    input.questions.push({
      ...input.questions[0]!,
      questionId: 'question:live',
      recordingId: 'recording:live',
    });
    const output = CatalogSchema.parse(input);
    expect(output.questions).toHaveLength(2);
    expect(output.questions[1]?.recordingId).toBe('recording:live');
    expect(output.audioAssets[0]?.usage.status).toBe('pending');
    expect(output.audioAssets[0]?.available).toBe(false);
  });
  it.each([
    '/absolute.wav',
    '../secret.wav',
    'a/../b.wav',
    'https://example.test/a',
    'C:\\music.wav',
    'a\\b.wav',
    'a//b.wav',
    'a/%2e%2e/b.wav',
    'a?token=x',
  ])('rejects unsafe resource %s', (path) => {
    expect(ResourcePathSchema.safeParse(path).success).toBe(false);
  });
});
