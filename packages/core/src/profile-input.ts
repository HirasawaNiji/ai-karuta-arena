import { z } from 'zod';
import { CatalogSchema, type Catalog } from './catalog.js';
import { ScoringConfigSchema } from './config.js';
import {
  EvidenceCollectionSchema,
  RawUserMusicDataSchema,
  UtcTimestampSchema,
  type Evidence,
} from './evidence.js';
import { FamiliarityMatrixSchema } from './familiarity.js';
import { PlayerMusicProfileSchema } from './profile.js';
import { type MusicPreferences } from './player.js';
import { type RecognitionScope } from './recognition.js';
import { GameEventContextSchema } from './game.js';

function checkScope(
  catalog: Catalog,
  songId: string,
  scope: RecognitionScope | undefined,
  context: z.RefinementCtx,
  path: (string | number)[],
) {
  if (!scope) return;
  const question =
    scope.questionId === undefined
      ? undefined
      : catalog.questions.find((q) => q.questionId === scope.questionId);
  const recordingId = scope.recordingId ?? question?.recordingId;
  const recording = catalog.recordings.find(
    (r) => r.recordingId === recordingId,
  );
  const asset = catalog.audioAssets.find(
    (a) => a.assetId === recording?.audioAssetId,
  );
  const segment = scope.segment;
  if (
    (scope.questionId !== undefined &&
      (!question || question.songId !== songId)) ||
    !recording ||
    recording.songId !== songId ||
    (question && question.recordingId !== recordingId) ||
    (segment &&
      (!asset ||
        segment.startMs > asset.durationMs ||
        segment.durationMs > asset.durationMs - segment.startMs ||
        (question &&
          (question.startMs !== segment.startMs ||
            question.durationMs !== segment.durationMs ||
            question.segmentKind !== segment.kind))))
  )
    context.addIssue({
      code: 'custom',
      path,
      message:
        'Recognition scope does not match catalog song, recording or segment',
    });
}

export const GameRecognitionContextSchema = z
  .strictObject({
    catalog: CatalogSchema,
    context: GameEventContextSchema,
  })
  .superRefine(({ catalog, context: { event } }, ctx) => {
    if ('recognitionScope' in event)
      checkScope(catalog, event.songId, event.recognitionScope, ctx, [
        'context',
        'event',
        'recognitionScope',
      ]);
    if (event.type === 'GAME_FINISHED')
      for (const [i, judgement] of event.result.judgements.entries())
        checkScope(catalog, judgement.songId, judgement.recognitionScope, ctx, [
          'context',
          'event',
          'result',
          'judgements',
          i,
          'recognitionScope',
        ]);
  })
  .readonly();

function checkReferences(
  catalog: Catalog,
  items: readonly Evidence[],
  referenceTime: string,
  context: z.RefinementCtx,
  path: (string | number)[],
) {
  const players = new Set<string>(
    catalog.players.map((entry) => entry.player.id),
  );
  const songs = new Set<string>(catalog.songs.map((entry) => entry.id));
  const artists = new Set<string>(catalog.artists.map((entry) => entry.id));
  for (const [i, item] of items.entries()) {
    if ('recognitionScope' in item)
      checkScope(catalog, item.songId, item.recognitionScope, context, [
        ...path,
        i,
        'recognitionScope',
      ]);
    if (
      !players.has(item.playerId) ||
      ('songId' in item ? !songs.has(item.songId) : !artists.has(item.artistId))
    )
      context.addIssue({
        code: 'custom',
        path: [...path, i],
        message: 'Unknown evidence player or target',
      });
    if (Date.parse(item.observedAt) > Date.parse(referenceTime))
      context.addIssue({
        code: 'custom',
        path: [...path, i, 'observedAt'],
        message: 'Observation is after referenceTime',
      });
  }
}
function checkPreferences(
  catalog: Catalog,
  preferences: MusicPreferences,
  context: z.RefinementCtx,
  path: (string | number)[],
) {
  const tags = new Map<string, string>(
    catalog.taxonomy.map((tag) => [tag.id, tag.dimension]),
  );
  const artists = new Set<string>(catalog.artists.map((artist) => artist.id));
  for (const [dimension, values] of Object.entries(preferences)) {
    for (const id of Object.keys(values)) {
      if (
        dimension === 'artists' ? !artists.has(id) : tags.get(id) !== dimension
      )
        context.addIssue({
          code: 'custom',
          path: [...path, dimension, id],
          message: 'Unknown or wrong-dimension preference',
        });
    }
  }
}
export const EvidenceContextSchema = z
  .strictObject({
    catalog: CatalogSchema,
    referenceTime: UtcTimestampSchema,
    evidence: EvidenceCollectionSchema,
  })
  .superRefine((input, context) =>
    checkReferences(
      input.catalog,
      input.evidence,
      input.referenceTime,
      context,
      ['evidence'],
    ),
  )
  .readonly();

export const ProfileBuildInputSchema = z
  .strictObject({
    catalog: CatalogSchema,
    referenceTime: UtcTimestampSchema,
    scoringConfig: ScoringConfigSchema,
    rawData: z.array(RawUserMusicDataSchema).readonly(),
  })
  .superRefine((input, context) => {
    for (const [i, raw] of input.rawData.entries()) {
      if (
        !input.catalog.players.some(
          (entry) => entry.player.id === raw.userId,
        ) ||
        Date.parse(raw.observedAt) > Date.parse(input.referenceTime)
      )
        context.addIssue({
          code: 'custom',
          path: ['rawData', i],
          message: 'Unknown snapshot player or future snapshot',
        });
      checkPreferences(input.catalog, raw.declaredPreferences, context, [
        'rawData',
        i,
        'declaredPreferences',
      ]);
      checkReferences(
        input.catalog,
        raw.evidence,
        input.referenceTime,
        context,
        ['rawData', i, 'evidence'],
      );
    }
  })
  .readonly();

export const ProfileMatrixContextSchema = z
  .strictObject({
    catalog: CatalogSchema,
    referenceTime: UtcTimestampSchema,
    scoringConfig: ScoringConfigSchema,
    profiles: z.array(PlayerMusicProfileSchema).readonly(),
    matrix: FamiliarityMatrixSchema,
  })
  .superRefine((input, context) => {
    const profiles = new Map(
      input.profiles.map((profile) => [profile.playerId, profile]),
    );
    const matrix = input.matrix;
    if (
      profiles.size !== input.profiles.length ||
      profiles.size !== matrix.playerIds.length ||
      matrix.playerIds.some((id) => !profiles.has(id))
    )
      context.addIssue({
        code: 'custom',
        path: ['profiles'],
        message: 'Profiles must match unique matrix players',
      });
    if (
      matrix.catalogVersion !== input.catalog.catalogVersion ||
      matrix.scoringConfigVersion !== input.scoringConfig.version ||
      Date.parse(matrix.referenceTime) !== Date.parse(input.referenceTime) ||
      JSON.stringify(matrix.scoringConfig) !==
        JSON.stringify(input.scoringConfig)
    )
      context.addIssue({
        code: 'custom',
        path: ['matrix'],
        message: 'Matrix context version or time mismatch',
      });
    const catalogSongs = new Set<string>(
      input.catalog.songs.map((song) => song.id),
    );
    if (matrix.songIds.some((id) => !catalogSongs.has(id)))
      context.addIssue({
        code: 'custom',
        path: ['matrix', 'songIds'],
        message: 'Unknown matrix song',
      });
    const allEvidence: Evidence[] = [];
    for (const [i, profile] of input.profiles.entries()) {
      const evidence = [
        ...Object.values(profile.songEvidence).flat(),
        ...Object.values(profile.artistEvidence).flat(),
      ];
      allEvidence.push(...evidence);
      if (
        !input.catalog.players.some(
          (entry) => entry.player.id === profile.playerId,
        ) ||
        Date.parse(profile.updatedAt) > Date.parse(input.referenceTime) ||
        matrix.profileVersions[profile.playerId] !== profile.profileVersion
      )
        context.addIssue({
          code: 'custom',
          path: ['profiles', i],
          message: 'Profile player, version or time mismatch',
        });
      const artists = new Set<string>(
        input.catalog.artists.map((artist) => artist.id),
      );
      if (
        Object.keys(profile.songEvidence).some((id) => !catalogSongs.has(id)) ||
        Object.keys(profile.artistEvidence).some((id) => !artists.has(id))
      )
        context.addIssue({
          code: 'custom',
          path: ['profiles', i],
          message: 'Unknown evidence map target',
        });
      checkReferences(input.catalog, evidence, input.referenceTime, context, [
        'profiles',
        i,
      ]);
      checkPreferences(input.catalog, profile.preferences, context, [
        'profiles',
        i,
        'preferences',
      ]);
      const ids = new Set(evidence.map((item) => item.evidenceId));
      for (const [songId, cell] of Object.entries(
        matrix.cells[profile.playerId] ?? {},
      )) {
        const referenced = [
          ...cell.reasons.flatMap((reason) => reason.evidenceIds),
          ...cell.adjustments.flatMap((item) => item.evidenceIds),
          ...cell.confidenceBasis.evidenceIds,
        ];
        if (referenced.some((id) => !ids.has(id)))
          context.addIssue({
            code: 'custom',
            path: ['matrix', 'cells', profile.playerId, songId],
            message: 'Unknown or cross-player explanation evidence',
          });
        if (
          (cell.confidence <
            input.scoringConfig.confidence.sufficientThreshold ||
            cell.confidence === 0) &&
          cell.evidenceStatus === 'known'
        )
          context.addIssue({
            code: 'custom',
            path: ['matrix', 'cells', profile.playerId, songId],
            message: 'Low-confidence evidence cannot be marked known',
          });
      }
    }
    if (!EvidenceCollectionSchema.safeParse(allEvidence).success)
      context.addIssue({
        code: 'custom',
        path: ['profiles'],
        message: 'Duplicate evidence or event across profiles',
      });
  })
  .readonly();
export type ProfileBuildInput = z.infer<typeof ProfileBuildInputSchema>;
export type ProfileMatrixContext = z.infer<typeof ProfileMatrixContextSchema>;
