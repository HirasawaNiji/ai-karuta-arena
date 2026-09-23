import { z } from 'zod';
import { StableIdSchema } from './ids.js';
import { ArtistProfileSchema, SongProfileSchema } from './song.js';
import { DeclaredPlayerPreferencesSchema } from './player.js';
import {
  AudioAssetSchema,
  CardSchema,
  QuestionSchema,
  RecordingSchema,
} from './question.js';
import { TaxonomySchema, type TaxonomyDimension } from './taxonomy.js';

export const CatalogSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    catalogVersion: StableIdSchema,
    taxonomyVersion: StableIdSchema,
    taxonomy: TaxonomySchema,
    artists: z.array(ArtistProfileSchema).readonly(),
    songs: z.array(SongProfileSchema).readonly(),
    players: z.array(DeclaredPlayerPreferencesSchema).readonly(),
    audioAssets: z.array(AudioAssetSchema).readonly(),
    recordings: z.array(RecordingSchema).readonly(),
    questions: z.array(QuestionSchema).readonly(),
    cards: z.array(CardSchema).readonly(),
  })
  .superRefine((catalog, context) => {
    function error(path: (string | number)[], message: string) {
      context.addIssue({ code: 'custom', path, message });
    }
    function index<T>(
      values: readonly T[],
      id: (value: T) => string,
      field: string,
    ) {
      const result = new Map<string, T>();
      for (const [i, value] of values.entries()) {
        const key = id(value);
        if (result.has(key)) error([field, i], `Duplicate ID: ${key}`);
        result.set(key, value);
      }
      return result;
    }
    const tags = new Map(
      catalog.taxonomy.map((tag) => [tag.id as string, tag]),
    );
    const artists = index(catalog.artists, (value) => value.id, 'artists');
    const songs = index(catalog.songs, (value) => value.id, 'songs');
    index(catalog.players, (value) => value.player.id, 'players');
    const assets = index(
      catalog.audioAssets,
      (value) => value.assetId,
      'audioAssets',
    );
    const recordings = index(
      catalog.recordings,
      (value) => value.recordingId,
      'recordings',
    );
    const cards = index(catalog.cards, (value) => value.cardId, 'cards');
    index(catalog.questions, (value) => value.questionId, 'questions');
    function tagReferences(
      ids: readonly string[],
      dimension: TaxonomyDimension,
      path: (string | number)[],
    ) {
      for (const id of ids) {
        if (tags.get(id)?.dimension !== dimension)
          error(path, `Unknown or wrong-dimension tag: ${id}`);
      }
    }
    for (const [i, artist] of catalog.artists.entries()) {
      tagReferences(artist.originRegionIds ?? [], 'regions', [
        'artists',
        i,
        'originRegionIds',
      ]);
    }
    for (const [i, song] of catalog.songs.entries()) {
      for (const id of song.artistIds) {
        if (!artists.has(id))
          error(['songs', i, 'artistIds'], `Unknown artist: ${id}`);
      }
      for (const dimension of [
        'genres',
        'languages',
        'regions',
        'cultures',
        'franchises',
        'scenes',
      ] as const) {
        tagReferences(song[dimension] ?? [], dimension, [
          'songs',
          i,
          dimension,
        ]);
      }
    }
    for (const [i, player] of catalog.players.entries()) {
      for (const dimension of [
        'genres',
        'languages',
        'regions',
        'eras',
        'cultures',
        'franchises',
        'scenes',
      ] as const) {
        tagReferences(Object.keys(player.preferences[dimension]), dimension, [
          'players',
          i,
          'preferences',
          dimension,
        ]);
      }
      for (const id of Object.keys(player.preferences.artists)) {
        if (!artists.has(id))
          error(
            ['players', i, 'preferences', 'artists'],
            `Unknown artist: ${id}`,
          );
      }
    }
    for (const [i, recording] of catalog.recordings.entries()) {
      if (!songs.has(recording.songId))
        error(['recordings', i, 'songId'], 'Unknown song');
      if (!assets.has(recording.audioAssetId))
        error(['recordings', i, 'audioAssetId'], 'Unknown audio asset');
    }
    const cardSongs = new Map<string, string>();
    for (const [i, question] of catalog.questions.entries()) {
      const recording = recordings.get(question.recordingId);
      const asset = recording && assets.get(recording.audioAssetId);
      if (!songs.has(question.songId))
        error(['questions', i, 'songId'], 'Unknown song');
      if (!recording || recording.songId !== question.songId) {
        error(
          ['questions', i, 'recordingId'],
          'Recording must belong to this song',
        );
      }
      // Subtraction avoids overflowing a safe integer when adding start and duration.
      if (
        !asset ||
        question.startMs > asset.durationMs ||
        question.durationMs > asset.durationMs - question.startMs
      ) {
        error(
          ['questions', i, 'durationMs'],
          'Question segment exceeds its audio asset',
        );
      }
      if (!cards.has(question.answerCardId))
        error(['questions', i, 'answerCardId'], 'Unknown card');
      const previousSong = cardSongs.get(question.answerCardId);
      if (
        cards.get(question.answerCardId)?.answerKind === 'song-title' &&
        previousSong !== undefined &&
        previousSong !== question.songId
      ) {
        error(
          ['questions', i, 'answerCardId'],
          'Answer card maps to multiple songs',
        );
      }
      cardSongs.set(question.answerCardId, question.songId);
    }
  })
  .readonly();
export type Catalog = z.infer<typeof CatalogSchema>;
