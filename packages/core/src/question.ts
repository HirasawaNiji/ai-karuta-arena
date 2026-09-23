import { z } from 'zod';
import {
  AssetIdSchema,
  CardIdSchema,
  DisplayTextSchema,
  QuestionIdSchema,
  RecordingIdSchema,
  SafeCountSchema,
  SongIdSchema,
  StableIdSchema,
} from './ids.js';

// A relative resource identifier, never a local absolute path or remote URL.
export const ResourcePathSchema = StableIdSchema.refine(
  (value) =>
    value === value.trim() &&
    !/[:\\?#%]/u.test(value) &&
    value
      .split('/')
      .every((part) => part !== '' && part !== '.' && part !== '..'),
  'Expected a controlled relative resource path',
);
export const UsageRecordSchema = z.discriminatedUnion('status', [
  z
    .strictObject({ status: z.literal('pending'), source: DisplayTextSchema })
    .readonly(),
  z
    .strictObject({
      status: z.literal('verified'),
      source: DisplayTextSchema,
      reference: DisplayTextSchema,
      allowedUse: DisplayTextSchema,
    })
    .readonly(),
]);
export const AudioAssetSchema = z
  .strictObject({
    assetId: AssetIdSchema,
    resourcePath: ResourcePathSchema,
    durationMs: SafeCountSchema.refine(
      (value) => value > 0,
      'Duration must be positive',
    ),
    available: z.boolean(),
    usage: UsageRecordSchema,
  })
  .readonly();
export const RecordingSchema = z
  .strictObject({
    recordingId: RecordingIdSchema,
    songId: SongIdSchema,
    versionLabel: DisplayTextSchema,
    audioAssetId: AssetIdSchema,
  })
  .readonly();
export const CardSchema = z
  .strictObject({
    cardId: CardIdSchema,
    answerKind: StableIdSchema,
    text: DisplayTextSchema,
    imagePath: ResourcePathSchema.optional(),
  })
  .readonly();
export const QuestionSchema = z
  .strictObject({
    questionId: QuestionIdSchema,
    songId: SongIdSchema,
    recordingId: RecordingIdSchema,
    startMs: SafeCountSchema,
    durationMs: SafeCountSchema.refine(
      (value) => value > 0,
      'Duration must be positive',
    ),
    segmentKind: z.enum(['intro', 'chorus', 'other']),
    answerCardId: CardIdSchema,
  })
  .readonly();
export type AudioAsset = z.infer<typeof AudioAssetSchema>;
export type Recording = z.infer<typeof RecordingSchema>;
export type Card = z.infer<typeof CardSchema>;
export type Question = z.infer<typeof QuestionSchema>;
