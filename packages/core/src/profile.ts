import { z } from 'zod';
import {
  ArtistIdSchema,
  PlayerIdSchema,
  SafeCountSchema,
  SongIdSchema,
  StableIdSchema,
  TagIdSchema,
  UnitIntervalSchema,
  uniqueValues,
} from './ids.js';
import {
  ArtistEvidenceSchema,
  EvidenceCollectionSchema,
  EvidenceIdSchema,
  SongEvidenceSchema,
  UtcTimestampSchema,
} from './evidence.js';
import { MusicPreferencesSchema } from './player.js';
import { TaxonomyDimensionSchema } from './taxonomy.js';

export const ProfileVersionSchema = SafeCountSchema.min(1);
const origin = {
  source: z.enum(['declared', 'inferred']),
  evidenceIds: uniqueValues(EvidenceIdSchema),
};
export const PreferenceProvenanceSchema = z
  .discriminatedUnion('dimension', [
    z.strictObject({
      ...origin,
      dimension: z.literal('artists'),
      id: ArtistIdSchema,
    }),
    z.strictObject({
      ...origin,
      dimension: TaxonomyDimensionSchema,
      id: TagIdSchema,
    }),
  ])
  .readonly();
export const PlayerMusicProfileSchema = z
  .strictObject({
    playerId: PlayerIdSchema,
    profileVersion: ProfileVersionSchema,
    preferences: MusicPreferencesSchema,
    songEvidence: z
      .record(SongIdSchema, z.array(SongEvidenceSchema).readonly())
      .readonly(),
    artistEvidence: z
      .record(ArtistIdSchema, z.array(ArtistEvidenceSchema).readonly())
      .readonly(),
    confidence: UnitIntervalSchema,
    explorationScore: UnitIntervalSchema.optional(),
    mainstreamScore: UnitIntervalSchema.optional(),
    provenance: z.array(PreferenceProvenanceSchema).readonly(),
    updatedAt: UtcTimestampSchema,
    inputFingerprint: StableIdSchema,
  })
  .superRefine((profile, context) => {
    const allEvidence = [
      ...Object.values(profile.songEvidence).flat(),
      ...Object.values(profile.artistEvidence).flat(),
    ];
    const parsed = EvidenceCollectionSchema.safeParse(allEvidence);
    if (!parsed.success)
      context.addIssue({
        code: 'custom',
        path: ['songEvidence'],
        message: 'Profile contains duplicate evidence or events',
      });
    const evidenceIds = new Set(allEvidence.map((item) => item.evidenceId));
    const maps = [
      ['songEvidence', Object.entries(profile.songEvidence)],
      ['artistEvidence', Object.entries(profile.artistEvidence)],
    ] as const;
    for (const [field, entries] of maps) {
      for (const [id, items] of entries) {
        for (const item of items) {
          const target = 'songId' in item ? item.songId : item.artistId;
          if (
            target !== id ||
            item.playerId !== profile.playerId ||
            Date.parse(item.observedAt) > Date.parse(profile.updatedAt)
          )
            context.addIssue({
              code: 'custom',
              path: [field, id],
              message: 'Evidence target, player or time does not match profile',
            });
        }
      }
    }
    const targets = new Set<string>();
    for (const [i, item] of profile.provenance.entries()) {
      const target = JSON.stringify([item.dimension, item.id]);
      if (
        targets.has(target) ||
        !Object.hasOwn(profile.preferences[item.dimension], item.id) ||
        item.evidenceIds.some((id) => !evidenceIds.has(id)) ||
        (item.source === 'inferred' && item.evidenceIds.length === 0)
      )
        context.addIssue({
          code: 'custom',
          path: ['provenance', i],
          message: 'Invalid or duplicate preference provenance',
        });
      targets.add(target);
    }
    for (const [dimension, values] of Object.entries(profile.preferences)) {
      for (const id of Object.keys(values)) {
        if (!targets.has(JSON.stringify([dimension, id])))
          context.addIssue({
            code: 'custom',
            path: ['provenance'],
            message: 'Missing preference provenance',
          });
      }
    }
  })
  .readonly();
export type PlayerMusicProfile = z.infer<typeof PlayerMusicProfileSchema>;
