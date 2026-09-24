import { z } from 'zod';
import {
  CommandIdSchema,
  DisplayTextSchema,
  GameTypeSchema,
  PartyIdSchema,
  PlayerIdSchema,
  PositiveCountSchema,
  SafeCountSchema,
  SongIdSchema,
  StableIdSchema,
  uniqueValues,
} from './ids.js';
import { CatalogSchema } from './catalog.js';
import {
  FairnessConfigSchema,
  ScoringConfigSchema,
  SelectionConfigSchema,
} from './config.js';
import {
  EvidenceCollectionSchema,
  EventIdSchema,
  UtcTimestampSchema,
} from './evidence.js';
import { FamiliarityMatrixSchema } from './familiarity.js';
import { GameResultSchema, GameSessionInputSchema } from './game.js';
import { PlayerSchema } from './player.js';
import { PlayerMusicProfileSchema, ProfileVersionSchema } from './profile.js';
import { ProfileMatrixContextSchema } from './profile-input.js';
import {
  AvailabilitySchema,
  FairnessAssessmentSchema,
  FairnessReasonSchema,
  SelectionResultSchema,
} from './selection.js';
import {
  contractIssue,
  sameData,
  sameIds,
  sameOrder,
} from './contract-validation.js';

export const PartyConfigSchema = z
  .strictObject({
    scoring: ScoringConfigSchema,
    selection: SelectionConfigSchema,
    fairness: FairnessConfigSchema,
  })
  .readonly();
export const PartyPreferencesSchema = z
  .strictObject({ excludePlayedSongs: z.boolean() })
  .readonly();
export const PartyActorSchema = z
  .discriminatedUnion('role', [
    z.strictObject({ role: z.literal('host'), playerId: PlayerIdSchema }),
    z.strictObject({ role: z.literal('player'), playerId: PlayerIdSchema }),
    z.strictObject({ role: z.literal('system') }),
  ])
  .readonly();
const PlayersSchema = z
  .array(PlayerSchema)
  .refine(
    (players) =>
      new Set(players.map((player) => player.id)).size === players.length,
    'Duplicate member ID',
  )
  .readonly();
const command = {
  partyId: PartyIdSchema,
  commandId: CommandIdSchema,
  expectedVersion: SafeCountSchema,
};
const simple = <T extends string>(type: T) =>
  z.strictObject({ ...command, type: z.literal(type) });
const timed = <T extends string>(type: T) =>
  z.strictObject({
    ...command,
    type: z.literal(type),
    referenceTime: UtcTimestampSchema,
  });
export const PartyCommandSchema = z
  .discriminatedUnion('type', [
    z.strictObject({
      ...command,
      type: z.literal('INITIALIZE'),
      expectedVersion: z.literal(0),
      referenceTime: UtcTimestampSchema,
    }),
    timed('GENERATE'),
    timed('REGENERATE'),
    timed('START_NEXT_ROUND'),
    timed('REGENERATE_FROM_ERROR'),
    timed('REFRESH_PROFILES'),
    simple('BEGIN_BAN'),
    simple('FINISH_BAN'),
    simple('ACKNOWLEDGE_CONTINUE'),
    simple('START_GAME'),
    z.strictObject({
      ...command,
      type: z.literal('BAN_SONG'),
      songId: SongIdSchema,
    }),
    z.strictObject({
      ...command,
      type: z.literal('REPLACE_SONG'),
      oldSongId: SongIdSchema,
      newSongId: SongIdSchema,
    }),
    z.strictObject({
      ...command,
      type: z.literal('UPDATE_MEMBERS'),
      players: PlayersSchema,
      referenceTime: UtcTimestampSchema,
    }),
    z.strictObject({
      ...command,
      type: z.literal('UPDATE_CATALOG'),
      catalog: CatalogSchema,
      candidateSongIds: uniqueValues(SongIdSchema),
      availability: AvailabilitySchema,
      referenceTime: UtcTimestampSchema,
    }),
    z.strictObject({
      ...command,
      type: z.literal('UPDATE_CONFIG'),
      config: PartyConfigSchema,
      requestedCount: PositiveCountSchema,
      partyPreferences: PartyPreferencesSchema,
      referenceTime: UtcTimestampSchema,
    }),
    z.strictObject({
      ...command,
      type: z.literal('CHANGE_GAME'),
      gameType: GameTypeSchema,
    }),
    z.strictObject({
      ...command,
      type: z.literal('END_PARTY'),
      reason: DisplayTextSchema.optional(),
    }),
  ])
  .superRefine((value, context) => {
    if (value.type === 'UPDATE_CATALOG') {
      const songs = new Set(value.catalog.songs.map((song) => song.id));
      if (
        value.candidateSongIds.some((id) => !songs.has(id)) ||
        !sameIds(value.candidateSongIds, Object.keys(value.availability))
      )
        contractIssue(
          context,
          ['candidateSongIds'],
          'Catalog update has invalid candidates or availability',
        );
    }
  })
  .readonly();

export const EvaluationContextSchema = z
  .strictObject({
    selectionVersion: PositiveCountSchema,
    hostPlayerId: PlayerIdSchema,
    playerIds: uniqueValues(PlayerIdSchema),
    profileVersions: z.record(PlayerIdSchema, ProfileVersionSchema).readonly(),
    profiles: z.array(PlayerMusicProfileSchema).readonly(),
    catalogVersion: StableIdSchema,
    candidateSongIds: uniqueValues(SongIdSchema),
    selectedSongIds: uniqueValues(SongIdSchema),
    requestedCount: PositiveCountSchema,
    gameType: GameTypeSchema,
    roundNumber: PositiveCountSchema,
    bannedSongIds: uniqueValues(SongIdSchema),
    excludedHistorySongIds: uniqueValues(SongIdSchema),
    availability: AvailabilitySchema,
    referenceTime: UtcTimestampSchema,
    matrixVersion: StableIdSchema,
    config: PartyConfigSchema,
    partyPreferences: PartyPreferencesSchema,
  })
  .superRefine((value, context) => {
    if (
      !value.playerIds.includes(value.hostPlayerId) ||
      !sameIds(value.playerIds, Object.keys(value.profileVersions)) ||
      !sameIds(
        value.playerIds,
        value.profiles.map((profile) => profile.playerId),
      ) ||
      value.profiles.some(
        (profile) =>
          value.profileVersions[profile.playerId] !== profile.profileVersion,
      )
    )
      contractIssue(
        context,
        ['profileVersions'],
        'Context must retain current host, players and profile versions',
      );
    for (const field of [
      'playerIds',
      'candidateSongIds',
      'bannedSongIds',
      'excludedHistorySongIds',
    ] as const)
      if (!sameOrder(value[field], [...value[field]].sort()))
        contractIssue(
          context,
          [field],
          'Context ID sets must use code-unit order',
        );
    if (
      !sameIds(value.candidateSongIds, Object.keys(value.availability)) ||
      value.selectedSongIds.length > value.requestedCount ||
      value.selectedSongIds.some(
        (id) =>
          !value.candidateSongIds.includes(id) ||
          !value.availability[id]?.available ||
          value.bannedSongIds.includes(id) ||
          value.excludedHistorySongIds.includes(id),
      )
    )
      contractIssue(
        context,
        ['selectedSongIds'],
        'Context playlist violates its frozen candidate rules',
      );
  })
  .readonly();
export const HostAcknowledgementSchema = z
  .strictObject({
    action: z.literal('continue'),
    playerId: PlayerIdSchema,
    selectionVersion: PositiveCountSchema,
    acknowledgedAt: UtcTimestampSchema,
    reasons: z.array(FairnessReasonSchema).min(1).readonly(),
  })
  .readonly();
const setup = {
  partyId: PartyIdSchema,
  hostPlayerId: PlayerIdSchema,
  players: PlayersSchema,
  catalog: CatalogSchema,
  candidateSongIds: uniqueValues(SongIdSchema),
  availability: AvailabilitySchema,
  requestedCount: PositiveCountSchema,
  currentGame: GameTypeSchema,
  config: PartyConfigSchema,
  partyPreferences: PartyPreferencesSchema,
  referenceTime: UtcTimestampSchema,
};
const PartySetupBaseSchema = z.strictObject(setup);
function checkSetup(
  value: z.infer<typeof PartySetupBaseSchema>,
  context: z.RefinementCtx,
) {
  const players = value.players.map((player) => player.id);
  const catalogPlayers = new Set(
    value.catalog.players.map((entry) => entry.player.id),
  );
  const songs = new Set(value.catalog.songs.map((song) => song.id));
  if (
    !players.includes(value.hostPlayerId) ||
    players.some((id) => !catalogPlayers.has(id))
  )
    contractIssue(
      context,
      ['players'],
      'The host and all members must exist in the catalog',
    );
  if (
    !sameIds(value.candidateSongIds, Object.keys(value.availability)) ||
    value.candidateSongIds.some((id) => !songs.has(id))
  )
    contractIssue(
      context,
      ['candidateSongIds'],
      'Candidates must have catalog entries and explicit availability',
    );
}
export const PartySetupInputSchema =
  PartySetupBaseSchema.superRefine(checkSetup).readonly();
export const PartyStateSchema = z
  .strictObject({
    ...setup,
    playerProfiles: z.array(PlayerMusicProfileSchema).readonly(),
    currentRound: PositiveCountSchema,
    difficulty: StableIdSchema.nullable(),
    catalogVersion: StableIdSchema,
    matrix: FamiliarityMatrixSchema.nullable(),
    currentPlaylist: uniqueValues(SongIdSchema),
    selectionResult: SelectionResultSchema.nullable(),
    bannedSongIds: uniqueValues(SongIdSchema),
    excludedHistorySongIds: uniqueValues(SongIdSchema),
    banPhase: z.enum(['closed', 'open']),
    phase: z.enum([
      'setup',
      'selecting',
      'prepared',
      'starting',
      'playing',
      'settling',
      'finished',
      'ended',
      'error',
    ]),
    hostState: z.enum(['awaiting_host_choice', 'ready', 'ended']),
    selectionVersion: SafeCountSchema,
    evaluationContext: EvaluationContextSchema.nullable(),
    fairnessAssessment: FairnessAssessmentSchema.nullable(),
    hostAcknowledgement: HostAcknowledgementSchema.nullable(),
    activeGameSession: GameSessionInputSchema.nullable(),
    gameHistory: z.array(GameResultSchema).readonly(),
    processedEventIds: uniqueValues(EventIdSchema),
    pendingGameplayEvidence: EvidenceCollectionSchema,
  })
  .superRefine((state, context) => {
    checkSetup(state, context);
    const playerIds = state.players.map((player) => player.id);
    if (
      state.catalogVersion !== state.catalog.catalogVersion ||
      (state.selectionVersion === 0 && state.currentPlaylist.length > 0) ||
      state.currentPlaylist.length > state.requestedCount ||
      state.currentPlaylist.some(
        (id) =>
          !state.candidateSongIds.includes(id) ||
          state.bannedSongIds.includes(id) ||
          state.excludedHistorySongIds.includes(id) ||
          !state.availability[id]?.available,
      )
    )
      contractIssue(
        context,
        ['currentPlaylist'],
        'State catalog version or current playlist is invalid',
      );
    if (
      new Set(state.playerProfiles.map((profile) => profile.playerId)).size !==
        state.playerProfiles.length ||
      state.playerProfiles.some(
        (profile) => !playerIds.includes(profile.playerId),
      )
    )
      contractIssue(
        context,
        ['playerProfiles'],
        'Duplicate or nonmember profile',
      );
    if (state.matrix !== null) {
      const checked = ProfileMatrixContextSchema.safeParse({
        catalog: state.catalog,
        referenceTime: state.referenceTime,
        scoringConfig: state.config.scoring,
        profiles: state.playerProfiles,
        matrix: state.matrix,
      });
      if (
        !checked.success ||
        !sameIds(playerIds, state.matrix.playerIds) ||
        !sameIds(state.candidateSongIds, state.matrix.songIds)
      )
        contractIssue(
          context,
          ['matrix'],
          'State matrix is stale or does not cover current members and candidates',
        );
    }
    const evaluation = state.evaluationContext;
    if (evaluation !== null) {
      if (
        state.matrix === null ||
        evaluation.selectionVersion !== state.selectionVersion ||
        evaluation.hostPlayerId !== state.hostPlayerId ||
        !sameIds(evaluation.playerIds, playerIds) ||
        !sameData(
          [...evaluation.profiles].sort((a, b) =>
            a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0,
          ),
          [...state.playerProfiles].sort((a, b) =>
            a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0,
          ),
        ) ||
        evaluation.catalogVersion !== state.catalogVersion ||
        !sameIds(evaluation.candidateSongIds, state.candidateSongIds) ||
        !sameOrder(evaluation.selectedSongIds, state.currentPlaylist) ||
        evaluation.requestedCount !== state.requestedCount ||
        evaluation.gameType !== state.currentGame ||
        evaluation.roundNumber !== state.currentRound ||
        !sameIds(evaluation.bannedSongIds, state.bannedSongIds) ||
        !sameIds(
          evaluation.excludedHistorySongIds,
          state.excludedHistorySongIds,
        ) ||
        !sameData(evaluation.availability, state.availability) ||
        Date.parse(evaluation.referenceTime) !==
          Date.parse(state.referenceTime) ||
        evaluation.matrixVersion !== state.matrix?.matrixVersion ||
        !sameData(evaluation.config, state.config) ||
        !sameData(evaluation.partyPreferences, state.partyPreferences)
      )
        contractIssue(
          context,
          ['evaluationContext'],
          'Evaluation context differs from current state',
        );
    }
    const assessment = state.fairnessAssessment;
    if (
      assessment !== null &&
      (evaluation === null ||
        assessment.selectionVersion !== state.selectionVersion ||
        assessment.matrixVersion !== state.matrix?.matrixVersion ||
        !sameData(assessment.fairnessConfig, state.config.fairness) ||
        !sameIds(assessment.playerIds, playerIds) ||
        !sameOrder(assessment.selectedSongIds, state.currentPlaylist) ||
        assessment.requestedCount !== state.requestedCount)
    )
      contractIssue(
        context,
        ['fairnessAssessment'],
        'Assessment is not for the current context',
      );
    const ack = state.hostAcknowledgement;
    if (
      ack !== null &&
      (assessment === null ||
        !assessment.validity ||
        assessment.passed ||
        ack.playerId !== state.hostPlayerId ||
        ack.selectionVersion !== state.selectionVersion ||
        Date.parse(ack.acknowledgedAt) < Date.parse(state.referenceTime) ||
        !sameData(ack.reasons, assessment.reasons))
    )
      contractIssue(
        context,
        ['hostAcknowledgement'],
        'Acknowledgement must bind current warnings, version and host',
      );
    if (
      state.banPhase === 'open' &&
      (state.phase !== 'prepared' || assessment !== null || ack !== null)
    )
      contractIssue(
        context,
        ['banPhase'],
        'Ban phase must block assessment and acknowledgement',
      );
    if (
      state.hostState === 'ready' &&
      (state.phase !== 'prepared' ||
        state.banPhase !== 'closed' ||
        !assessment?.validity ||
        (!assessment.passed && ack === null) ||
        state.activeGameSession !== null)
    )
      contractIssue(
        context,
        ['hostState'],
        'Display readiness cannot contradict basic start prerequisites',
      );
    if ((state.phase === 'ended') !== (state.hostState === 'ended'))
      contractIssue(
        context,
        ['hostState'],
        'Ended party requires ended host state',
      );
    if (
      ['setup', 'selecting', 'error', 'ended', 'finished'].includes(
        state.phase,
      ) &&
      (assessment !== null || ack !== null)
    )
      contractIssue(
        context,
        ['fairnessAssessment'],
        'Nonprepared state cannot keep a usable assessment or acknowledgement',
      );
    const active = ['starting', 'playing', 'settling'].includes(state.phase);
    if (active && state.activeGameSession === null)
      contractIssue(
        context,
        ['activeGameSession'],
        'Active phase needs a frozen game session',
      );
    if (state.activeGameSession !== null) {
      const session = state.activeGameSession;
      if (!active && state.phase !== 'error' && state.phase !== 'ended')
        contractIssue(
          context,
          ['activeGameSession'],
          'Inactive state cannot carry an active game',
        );
      if (
        state.gameHistory.some(
          (result) => result.session.gameSessionId === session.gameSessionId,
        ) ||
        session.partyId !== state.partyId ||
        session.selectionVersion !== state.selectionVersion ||
        !sameIds(session.playerIds, playerIds) ||
        !sameOrder(session.songIds, state.currentPlaylist) ||
        session.gameType !== state.currentGame ||
        session.roundNumber !== state.currentRound ||
        Date.parse(session.referenceTime) !== Date.parse(state.referenceTime)
      )
        contractIssue(
          context,
          ['activeGameSession'],
          'Active game differs from frozen party input',
        );
    }
    if (
      state.pendingGameplayEvidence.length > 0 &&
      !active &&
      state.phase !== 'error'
    )
      contractIssue(
        context,
        ['pendingGameplayEvidence'],
        'Unsettled evidence requires an active or failed game',
      );
    for (const item of state.pendingGameplayEvidence) {
      if (
        (item.type !== 'game_correct' && item.type !== 'game_wrong') ||
        !playerIds.includes(item.playerId) ||
        !('songId' in item) ||
        !state.currentPlaylist.includes(item.songId) ||
        !('eventId' in item) ||
        !state.processedEventIds.includes(item.eventId)
      )
        contractIssue(
          context,
          ['pendingGameplayEvidence'],
          'Pending evidence must come from processed game answers for frozen players/songs',
        );
    }
    if (
      new Set(state.gameHistory.map((result) => result.session.gameSessionId))
        .size !== state.gameHistory.length ||
      state.gameHistory.some(
        (result) =>
          result.session.partyId !== state.partyId ||
          result.session.selectionVersion > state.selectionVersion ||
          result.session.roundNumber > state.currentRound,
      )
    )
      contractIssue(
        context,
        ['gameHistory'],
        'History must contain unique sessions belonging to this party',
      );
  })
  .readonly();
export const StartCheckSchema = z
  .strictObject({
    allowed: z.boolean(),
    blockers: uniqueValues(StableIdSchema),
    acknowledgedWarnings: z.array(FairnessReasonSchema).readonly(),
  })
  .refine(
    (value) => value.allowed === (value.blockers.length === 0),
    'Start decision contradicts blockers',
  )
  .readonly();
export type PartyConfig = z.infer<typeof PartyConfigSchema>;
export type PartyPreferences = z.infer<typeof PartyPreferencesSchema>;
export type PartyActor = z.infer<typeof PartyActorSchema>;
export type PartyCommand = z.infer<typeof PartyCommandSchema>;
export type PartySetupInput = z.infer<typeof PartySetupInputSchema>;
export type PartyState = z.infer<typeof PartyStateSchema>;
export type EvaluationContext = z.infer<typeof EvaluationContextSchema>;
export type HostAcknowledgement = z.infer<typeof HostAcknowledgementSchema>;
export type StartCheck = z.infer<typeof StartCheckSchema>;
