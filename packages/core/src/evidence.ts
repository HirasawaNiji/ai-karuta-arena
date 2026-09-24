import { z } from 'zod';
import {
  ArtistIdSchema,
  PlayerIdSchema,
  SafeCountSchema,
  SongIdSchema,
  StableIdSchema,
  UnitIntervalSchema,
} from './ids.js';
import { MusicPreferencesSchema } from './player.js';
import { RecognitionScopeSchema } from './recognition.js';

// UTC, seconds or milliseconds; no local timezone or sub-millisecond truncation.
export const UtcTimestampSchema = z.iso
  .datetime()
  .refine(
    (value) =>
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) &&
      Number.isFinite(Date.parse(value)),
    'Expected a UTC timestamp with at most millisecond precision',
  );
export const EvidenceIdSchema = StableIdSchema.brand<'EvidenceId'>();
export const EventIdSchema = StableIdSchema.brand<'EventId'>();
export type EvidenceId = z.infer<typeof EvidenceIdSchema>;
export type EventId = z.infer<typeof EventIdSchema>;

const envelope = {
  evidenceId: EvidenceIdSchema,
  playerId: PlayerIdSchema,
  sourceId: StableIdSchema,
  observedAt: UtcTimestampSchema,
};
const song = { ...envelope, songId: SongIdSchema };
const snapshot = (type: 'favorite' | 'playlist' | 'top_song') =>
  z.strictObject({ ...song, type: z.literal(type), active: z.boolean() });
const recognition = (
  type: 'warmup_correct' | 'warmup_wrong' | 'game_correct' | 'game_wrong',
) =>
  z.strictObject({
    ...song,
    type: z.literal(type),
    eventId: EventIdSchema,
    occurredAt: UtcTimestampSchema,
    recognitionScope: RecognitionScopeSchema.optional(),
  });
const songEvidence = z.discriminatedUnion('type', [
  snapshot('favorite'),
  snapshot('playlist'),
  snapshot('top_song'),
  z.strictObject({
    ...song,
    type: z.literal('play_count'),
    count: SafeCountSchema,
    countKind: z.enum(['cumulative', 'window']),
    periodStart: UtcTimestampSchema,
    periodEnd: UtcTimestampSchema,
  }),
  z.strictObject({
    ...song,
    type: z.literal('recent_play'),
    occurredAt: UtcTimestampSchema,
  }),
  z.strictObject({
    ...song,
    type: z.literal('self_report'),
    familiarity: UnitIntervalSchema,
  }),
  z.strictObject({
    ...song,
    type: z.literal('recognition_report'),
    recognitionLevel: z.enum(['heard', 'familiar', 'intro']),
    recognitionScope: RecognitionScopeSchema.optional(),
  }),
  recognition('warmup_correct'),
  recognition('warmup_wrong'),
  recognition('game_correct'),
  recognition('game_wrong'),
]);
const artistEvidence = z.strictObject({
  ...envelope,
  type: z.literal('top_artist'),
  artistId: ArtistIdSchema,
  active: z.boolean(),
});
const evidence = z.union([songEvidence, artistEvidence]);
function checkTime(value: z.infer<typeof evidence>, context: z.RefinementCtx) {
  if (
    'occurredAt' in value &&
    Date.parse(value.occurredAt) > Date.parse(value.observedAt)
  )
    context.addIssue({
      code: 'custom',
      path: ['occurredAt'],
      message: 'Event occurs after observation',
    });
  if (
    value.type === 'play_count' &&
    (Date.parse(value.periodStart) > Date.parse(value.periodEnd) ||
      Date.parse(value.periodEnd) > Date.parse(value.observedAt))
  )
    context.addIssue({
      code: 'custom',
      path: ['periodEnd'],
      message: 'Expected periodStart <= periodEnd <= observedAt',
    });
}
export const SongEvidenceSchema = songEvidence
  .superRefine(checkTime)
  .readonly();
export const ArtistEvidenceSchema = artistEvidence.readonly();
export const EvidenceSchema = evidence.superRefine(checkTime).readonly();
export type SongEvidence = z.infer<typeof SongEvidenceSchema>;
export type ArtistEvidence = z.infer<typeof ArtistEvidenceSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;

export const RawUserMusicDataSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    sourceId: StableIdSchema,
    userId: PlayerIdSchema,
    snapshotId: StableIdSchema,
    observedAt: UtcTimestampSchema,
    evidence: z.array(EvidenceSchema).readonly(),
    declaredPreferences: MusicPreferencesSchema,
    explorationScore: UnitIntervalSchema.optional(),
    mainstreamScore: UnitIntervalSchema.optional(),
  })
  .superRefine((value, context) => {
    for (const [i, item] of value.evidence.entries()) {
      if (item.playerId !== value.userId || item.sourceId !== value.sourceId)
        context.addIssue({
          code: 'custom',
          path: ['evidence', i],
          message: 'Evidence must belong to snapshot player and source',
        });
      if (Date.parse(item.observedAt) > Date.parse(value.observedAt))
        context.addIssue({
          code: 'custom',
          path: ['evidence', i, 'observedAt'],
          message: 'Evidence is newer than snapshot',
        });
    }
  })
  .readonly();
export type RawUserMusicData = z.infer<typeof RawUserMusicDataSchema>;

// Raw imports may repeat records. M2 owns deduplication; normalized collections cannot.
export const EvidenceCollectionSchema = z
  .array(EvidenceSchema)
  .superRefine((items, context) => {
    const ids = new Set<string>();
    const events = new Set<string>();
    for (const [i, item] of items.entries()) {
      if (ids.has(item.evidenceId))
        context.addIssue({
          code: 'custom',
          path: [i, 'evidenceId'],
          message: 'Duplicate evidence ID',
        });
      ids.add(item.evidenceId);
      if ('eventId' in item) {
        if (events.has(item.eventId))
          context.addIssue({
            code: 'custom',
            path: [i, 'eventId'],
            message: 'Duplicate recognition event ID',
          });
        events.add(item.eventId);
      }
    }
  })
  .readonly();
