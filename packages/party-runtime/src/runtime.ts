import {
  PartyActorSchema,
  PartyCommandSchema,
  PartySetupInputSchema,
  PartyStateSchema,
  GameSessionInputSchema,
  GameEventSchema,
  GameResultSchema,
  HostDecisionSchema,
  RawUserMusicDataSchema,
  type PartyState,
  type PartySetupInput,
  type PartyRuntime,
  type PartyCommand,
  type PartyActor,
  type MusicProfileSource,
  type GameFactory,
  type PartyHostAgent,
  type MusicGame,
  type RawUserMusicData,
  type Result,
  type HostDecision,
  type DomainError,
} from '@amp/core';
import {
  buildPlayerProfile,
  buildFamiliarityMatrix,
  gameplayEvidence,
  normalizeEvidence,
  type NormalizedEvidence,
} from '@amp/music-profile';
import { selectPlaylist, assessPlaylist } from '@amp/playlist-engine';
import { canStart } from './can-start.js';
import {
  initialProgress,
  advanceProgress,
  type EventProgress,
} from './events.js';
import {
  canonical,
  copy,
  freeze,
  failure,
  RuntimeFailure,
  requireCondition as check,
} from './util.js';

export interface RuntimeDependencies {
  readonly sources: readonly MusicProfileSource[];
  readonly gameFactory: GameFactory;
  readonly hostAgent: PartyHostAgent;
  readonly now: () => string;
  readonly nextId: () => string;
  /** Trusted in-process orchestration only; never derive this from a browser field. */
  readonly allowSystem?: () => boolean;
  readonly hasHostEndIntent?: () => boolean;
}
export interface RuntimeController extends PartyRuntime {
  suggest(): Promise<Result<HostDecision>>;
  getDiagnostics(): readonly NormalizedEvidence['diagnostics'][number][];
}
export function createPartyRuntime(
  dependencies: RuntimeDependencies,
  initialInput: PartySetupInput,
): RuntimeController {
  const input = PartySetupInputSchema.parse(initialInput);
  check(
    new Set(dependencies.sources.map((s) => s.sourceId)).size ===
      dependencies.sources.length &&
      !dependencies.sources.some((s) => s.sourceId === 'runtime:gameplay'),
    'INVALID_INPUT',
    'Sources must have unique nonreserved IDs',
  );
  let state: PartyState = PartyStateSchema.parse({
    ...input,
    playerProfiles: [],
    currentRound: 1,
    difficulty: null,
    catalogVersion: input.catalog.catalogVersion,
    matrix: null,
    currentPlaylist: [],
    selectionResult: null,
    bannedSongIds: [],
    excludedHistorySongIds: [],
    banPhase: 'closed',
    phase: 'setup',
    hostState: 'awaiting_host_choice',
    selectionVersion: 0,
    evaluationContext: null,
    fairnessAssessment: null,
    hostAcknowledgement: null,
    activeGameSession: null,
    gameHistory: [],
    processedEventIds: [],
    pendingGameplayEvidence: [],
  });
  let rawHistory: readonly RawUserMusicData[] = [];
  let diagnostics: NormalizedEvidence['diagnostics'] = [];
  let busy = false,
    initialized = false,
    game: MusicGame | null = null,
    progress: EventProgress | null = null;
  let minimumTime = input.referenceTime;
  const queue: unknown[] = [];
  const commands = new Map<
    string,
    { key: string; result: Result<PartyState> }
  >();
  const events = new Map<string, string>();
  const sessionIds = new Set<string>();
  const snapshot = () => freeze(copy(state));
  const success = (): Result<PartyState> => ({ ok: true, value: snapshot() });
  const commit = (next: PartyState) => {
    state = PartyStateSchema.parse(next);
  };
  function invalidate(s: PartyState, increment = true): PartyState {
    return {
      ...s,
      selectionVersion: s.selectionVersion + Number(increment),
      evaluationContext: null,
      fairnessAssessment: null,
      hostAcknowledgement: null,
      hostState: 'awaiting_host_choice',
    };
  }
  function time(value: string) {
    check(
      Date.parse(value) >= Date.parse(minimumTime) &&
        Date.parse(value) >= Date.parse(state.referenceTime),
      'INVALID_INPUT',
      'Reference time cannot precede accepted data or events',
    );
  }
  function allowedSong(
    s: PartyState,
    id: PartyState['currentPlaylist'][number],
  ) {
    return (
      s.candidateSongIds.includes(id) &&
      s.availability[id]?.available &&
      !s.bannedSongIds.includes(id) &&
      !s.excludedHistorySongIds.includes(id)
    );
  }
  function withHistory(s: PartyState): PartyState {
    return {
      ...s,
      excludedHistorySongIds: s.partyPreferences.excludePlayedSongs
        ? [...new Set(s.gameHistory.flatMap((r) => r.playedSongIds))].sort()
        : [],
    };
  }
  function matrix(s: PartyState): PartyState {
    const full = buildFamiliarityMatrix({
      catalog: s.catalog,
      profiles: s.playerProfiles,
      scoringConfig: s.config.scoring,
      referenceTime: s.referenceTime,
      matrixVersion: 'matrix:' + s.selectionVersion,
    });
    const ids = [...s.candidateSongIds].sort();
    return {
      ...s,
      matrix: {
        ...full,
        songIds: ids,
        cells: Object.fromEntries(
          full.playerIds.map((id) => [
            id,
            Object.fromEntries(
              ids.map((song) => [song, full.cells[id]![song]!]),
            ),
          ]),
        ),
      },
    };
  }
  function assess(s: PartyState): PartyState {
    check(s.matrix, 'NOT_EVALUATED', 'Matrix is missing');
    const assessment = assessPlaylist({
      playerIds: s.players.map((p) => p.id),
      selectedSongIds: s.currentPlaylist,
      matrix: s.matrix,
      requestedCount: s.requestedCount,
      fairnessConfig: s.config.fairness,
      selectionVersion: s.selectionVersion,
    });
    const evaluated: PartyState = {
      ...s,
      phase: 'prepared',
      fairnessAssessment: assessment,
      evaluationContext: {
        selectionVersion: s.selectionVersion,
        hostPlayerId: s.hostPlayerId,
        playerIds: s.players.map((p) => p.id).sort(),
        profileVersions: Object.fromEntries(
          s.playerProfiles.map((p) => [p.playerId, p.profileVersion]),
        ),
        profiles: [...s.playerProfiles].sort((a, b) =>
          a.playerId < b.playerId ? -1 : 1,
        ),
        catalogVersion: s.catalogVersion,
        candidateSongIds: [...s.candidateSongIds].sort(),
        selectedSongIds: s.currentPlaylist,
        requestedCount: s.requestedCount,
        gameType: s.currentGame,
        roundNumber: s.currentRound,
        bannedSongIds: [...s.bannedSongIds].sort(),
        excludedHistorySongIds: [...s.excludedHistorySongIds].sort(),
        availability: s.availability,
        referenceTime: s.referenceTime,
        matrixVersion: s.matrix.matrixVersion,
        config: s.config,
        partyPreferences: s.partyPreferences,
      },
    };
    return {
      ...evaluated,
      hostState: canStart(evaluated, dependencies.gameFactory.capabilities)
        .allowed
        ? 'ready'
        : 'awaiting_host_choice',
    };
  }
  function buildProfiles(
    s: PartyState,
    raw: readonly RawUserMusicData[],
  ): PartyState {
    return {
      ...s,
      playerProfiles: s.players.map((p) =>
        buildPlayerProfile(
          {
            catalog: s.catalog,
            rawData: raw.filter((r) => r.userId === p.id),
            referenceTime: s.referenceTime,
            scoringConfig: s.config.scoring,
          },
          p.id,
          s.playerProfiles.find((old) => old.playerId === p.id),
        ),
      ),
    };
  }
  async function load(s: PartyState): Promise<readonly RawUserMusicData[]> {
    const additions: RawUserMusicData[] = [];
    for (const player of s.players)
      for (const source of dependencies.sources) {
        let raw: RawUserMusicData;
        try {
          raw = RawUserMusicDataSchema.parse(
            await source.getUserMusicData(player.id),
          );
        } catch {
          throw new RuntimeFailure(
            'SOURCE_FAILED',
            'Music source failed or returned invalid data',
          );
        }
        check(
          raw.sourceId === source.sourceId && raw.userId === player.id,
          'SOURCE_FAILED',
          'Source identity mismatch',
        );
        additions.push(raw);
      }
    // Preserve full history for retractions and count updates, deduplicate exact snapshots.
    return [
      ...new Map(
        [...rawHistory, ...additions].map((r) => [canonical(r), r]),
      ).values(),
    ];
  }
  function importDiagnostics(s: PartyState, raw: readonly RawUserMusicData[]) {
    return normalizeEvidence(
      raw
        .filter((r) => s.players.some((p) => p.id === r.userId))
        .flatMap((r) => r.evidence),
      s.catalog,
      s.referenceTime,
    ).diagnostics;
  }
  function prepare(s: PartyState, referenceTime: string): PartyState {
    check(initialized, 'NOT_EVALUATED', 'Initialize profiles first');
    time(referenceTime);
    let next = matrix(
      invalidate(withHistory({ ...s, referenceTime, phase: 'selecting' })),
    );
    check(next.matrix, 'NOT_EVALUATED', 'Matrix is missing');
    const result = selectPlaylist({
      profileContext: {
        catalog: next.catalog,
        profiles: next.playerProfiles,
        referenceTime: next.referenceTime,
        scoringConfig: next.config.scoring,
        matrix: next.matrix,
      },
      candidateSongIds: next.candidateSongIds,
      requestedCount: next.requestedCount,
      bannedSongIds: next.bannedSongIds,
      excludedHistorySongIds: next.excludedHistorySongIds,
      availability: next.availability,
      selectionConfig: next.config.selection,
      fairnessConfig: next.config.fairness,
      selectionVersion: next.selectionVersion,
      gameType: next.currentGame,
      roundNumber: next.currentRound,
    });
    next = {
      ...next,
      currentPlaylist: result.selectedSongIds,
      selectionResult: result,
    };
    return assess(next);
  }
  async function stop(): Promise<boolean> {
    if (!game) return true;
    try {
      await game.stop();
      game = null;
      return true;
    } catch {
      return false;
    }
  }
  async function failGame(
    code: DomainError['code'],
    message: string,
  ): Promise<Result<PartyState>> {
    if (state.phase === 'ended') return failure(code, message);
    const stopped = await stop();
    commit({
      ...invalidate(state, false),
      phase: 'error',
      pendingGameplayEvidence: [],
      ...(stopped ? { activeGameSession: null } : {}),
    });
    queue.length = 0;
    return stopped
      ? failure(code, message)
      : {
          ok: false,
          error: {
            code: 'STOP_FAILED',
            message: 'Game failed and could not be stopped',
            details: { cause: code },
          },
        };
  }
  async function start(): Promise<Result<PartyState>> {
    const guard = canStart(state, dependencies.gameFactory.capabilities);
    if (!guard.allowed) {
      const code = guard.blockers[0] as DomainError['code'];
      return failure(code, 'Start blocked: ' + guard.blockers.join(', '));
    }
    const id = dependencies.nextId();
    check(
      !sessionIds.has(id),
      'INVALID_INPUT',
      'Game session IDs must be unique',
    );
    const session = GameSessionInputSchema.parse({
      schemaVersion: 1,
      partyId: state.partyId,
      gameSessionId: id,
      selectionVersion: state.selectionVersion,
      gameType: state.currentGame,
      roundNumber: state.currentRound,
      playerIds: state.players.map((p) => p.id),
      songIds: state.currentPlaylist,
      referenceTime: state.referenceTime,
    });
    sessionIds.add(id);
    progress = initialProgress(session);
    commit({
      ...state,
      phase: 'starting',
      hostState: 'awaiting_host_choice',
      activeGameSession: session,
      pendingGameplayEvidence: [],
    });
    try {
      game = await dependencies.gameFactory.create(
        freeze(copy(session)),
        (event) => queue.push(copy(event)),
      );
      await game.start();
      commit({ ...state, phase: 'playing' });
      return success();
    } catch {
      return failGame('GAME_FAILED', 'Game creation or start failed');
    }
  }
  function host(actor: PartyActor) {
    check(
      actor.role === 'host',
      'FORBIDDEN',
      'Only the host can perform this action',
    );
  }
  function controller(actor: PartyActor) {
    check(
      actor.role === 'host' || actor.role === 'system',
      'FORBIDDEN',
      'Host or trusted system required',
    );
  }
  function notStarted() {
    check(
      ['setup', 'prepared', 'finished'].includes(state.phase),
      'INVALID_PHASE',
      'Party has already started or failed',
    );
    check(
      state.banPhase === 'closed',
      'BAN_OPEN',
      'Finish the ban phase first',
    );
  }
  async function execute(
    command: PartyCommand,
    actor: PartyActor,
  ): Promise<Result<PartyState>> {
    check(state.phase !== 'ended', 'INVALID_PHASE', 'Party has ended');
    switch (command.type) {
      case 'INITIALIZE': {
        check(
          actor.role === 'system',
          'FORBIDDEN',
          'Only trusted initialization is allowed',
        );
        check(
          state.phase === 'setup' && !initialized,
          'INVALID_PHASE',
          'Party is already initialized',
        );
        time(command.referenceTime);
        let next = { ...state, referenceTime: command.referenceTime };
        const raw = await load(next);
        next = matrix(invalidate(buildProfiles(next, raw)));
        const notes = importDiagnostics(next, raw);
        commit(next);
        rawHistory = raw;
        diagnostics = notes;
        initialized = true;
        break;
      }
      case 'GENERATE':
      case 'REGENERATE':
        controller(actor);
        notStarted();
        commit(prepare(state, command.referenceTime));
        break;
      case 'BEGIN_BAN':
        host(actor);
        check(
          state.phase === 'prepared' && state.banPhase === 'closed',
          'INVALID_PHASE',
          'Ban requires a prepared closed party',
        );
        commit({ ...invalidate(state), banPhase: 'open' });
        break;
      case 'BAN_SONG': {
        check(
          actor.role === 'host' || actor.role === 'player',
          'FORBIDDEN',
          'A current member must ban',
        );
        check(
          state.phase === 'prepared' && state.banPhase === 'open',
          'INVALID_PHASE',
          'Ban phase is not open',
        );
        if (state.bannedSongIds.includes(command.songId)) break;
        check(
          state.candidateSongIds.includes(command.songId),
          'INVALID_INPUT',
          'Unknown candidate song',
        );
        commit({
          ...invalidate(state),
          bannedSongIds: [...state.bannedSongIds, command.songId].sort(),
          currentPlaylist: state.currentPlaylist.filter(
            (id) => id !== command.songId,
          ),
        });
        break;
      }
      case 'FINISH_BAN':
        host(actor);
        check(
          state.phase === 'prepared' && state.banPhase === 'open',
          'INVALID_PHASE',
          'Ban phase is not open',
        );
        commit(assess({ ...state, banPhase: 'closed' }));
        break;
      case 'REPLACE_SONG': {
        host(actor);
        notStarted();
        check(
          state.phase === 'prepared',
          'INVALID_PHASE',
          'Replacement requires prepared party',
        );
        check(
          state.currentPlaylist.includes(command.oldSongId) &&
            !state.currentPlaylist.includes(command.newSongId) &&
            allowedSong(state, command.newSongId),
          'INVALID_INPUT',
          'Replacement must be a new available candidate',
        );
        commit(
          assess(
            invalidate({
              ...state,
              currentPlaylist: state.currentPlaylist.map((id) =>
                id === command.oldSongId ? command.newSongId : id,
              ),
            }),
          ),
        );
        break;
      }
      case 'UPDATE_MEMBERS':
      case 'UPDATE_CATALOG':
      case 'UPDATE_CONFIG':
      case 'REFRESH_PROFILES': {
        if (command.type === 'UPDATE_MEMBERS') host(actor);
        else controller(actor);
        notStarted();
        check(initialized, 'NOT_EVALUATED', 'Initialize first');
        time(command.referenceTime);
        let next: PartyState = {
          ...state,
          referenceTime: command.referenceTime,
        };
        if (command.type === 'UPDATE_MEMBERS')
          next = { ...next, players: command.players };
        if (command.type === 'UPDATE_CATALOG')
          next = {
            ...next,
            catalog: command.catalog,
            catalogVersion: command.catalog.catalogVersion,
            candidateSongIds: command.candidateSongIds,
            availability: command.availability,
          };
        if (command.type === 'UPDATE_CONFIG')
          next = {
            ...next,
            config: command.config,
            requestedCount: command.requestedCount,
            partyPreferences: command.partyPreferences,
          };
        PartySetupInputSchema.parse({
          partyId: next.partyId,
          hostPlayerId: next.hostPlayerId,
          players: next.players,
          catalog: next.catalog,
          candidateSongIds: next.candidateSongIds,
          availability: next.availability,
          requestedCount: next.requestedCount,
          currentGame: next.currentGame,
          config: next.config,
          partyPreferences: next.partyPreferences,
          referenceTime: next.referenceTime,
        });
        const raw =
          command.type === 'REFRESH_PROFILES' ||
          command.type === 'UPDATE_MEMBERS'
            ? await load(next)
            : rawHistory;
        next = buildProfiles(withHistory(next), raw);
        next = {
          ...next,
          currentPlaylist: next.currentPlaylist
            .filter((id) => allowedSong(next, id))
            .slice(0, next.requestedCount),
        };
        const notes = importDiagnostics(next, raw);
        if (canonical(next) !== canonical(state)) {
          next = matrix(invalidate(next));
          if (state.phase === 'prepared') next = assess(next);
          commit(next);
        }
        rawHistory = raw;
        diagnostics = notes;
        break;
      }
      case 'CHANGE_GAME': {
        host(actor);
        notStarted();
        if (command.gameType !== state.currentGame) {
          let next = invalidate({ ...state, currentGame: command.gameType });
          if (state.phase === 'prepared') next = assess(next);
          commit(next);
        }
        check(
          dependencies.gameFactory.capabilities.includes(command.gameType),
          'UNSUPPORTED_GAME',
          'Selected game has no adapter',
        );
        break;
      }
      case 'ACKNOWLEDGE_CONTINUE': {
        host(actor);
        check(
          state.phase === 'prepared' && state.banPhase === 'closed',
          'INVALID_PHASE',
          'Acknowledgement needs a closed prepared party',
        );
        check(
          state.fairnessAssessment?.validity &&
            !state.fairnessAssessment.passed,
          'INVALID_INPUT',
          'Only valid warning assessments can be acknowledged',
        );
        check(
          dependencies.gameFactory.capabilities.includes(state.currentGame),
          'UNSUPPORTED_GAME',
          'Cannot acknowledge an unsupported game',
        );
        if (!state.hostAcknowledgement)
          commit({
            ...state,
            hostAcknowledgement: {
              action: 'continue',
              playerId: state.hostPlayerId,
              selectionVersion: state.selectionVersion,
              acknowledgedAt: dependencies.now(),
              reasons: state.fairnessAssessment.reasons,
            },
            hostState: 'ready',
          });
        break;
      }
      case 'START_GAME':
        controller(actor);
        return start();
      case 'START_NEXT_ROUND':
        controller(actor);
        check(
          state.phase === 'finished',
          'INVALID_PHASE',
          'Finish the current game first',
        );
        commit(
          prepare(
            { ...state, currentRound: state.currentRound + 1 },
            command.referenceTime,
          ),
        );
        return start();
      case 'REGENERATE_FROM_ERROR':
        host(actor);
        check(
          state.phase === 'error' && !game,
          'INVALID_PHASE',
          'Failed game must be stopped before recovery',
        );
        queue.length = 0;
        progress = null;
        commit(
          prepare(
            {
              ...state,
              activeGameSession: null,
              pendingGameplayEvidence: [],
              banPhase: 'closed',
              phase: 'setup',
            },
            command.referenceTime,
          ),
        );
        break;
      case 'END_PARTY': {
        // Trusted orchestration may replay a host command through the command cache; AI cannot invent host intent.
        check(
          actor.role === 'host' ||
            (actor.role === 'system' && dependencies.hasHostEndIntent?.()),
          'FORBIDDEN',
          'Ending requires explicit host intent',
        );
        const stopped = await stop();
        let history = state.gameHistory;
        if (state.activeGameSession && progress) {
          const endedAt = dependencies.now();
          const result = GameResultSchema.parse({
            session: state.activeGameSession,
            status: 'aborted',
            startedAt:
              progress.startedAt ?? state.activeGameSession.referenceTime,
            endedAt,
            playedSongIds: progress.songs,
            judgements: progress.judgements,
            scores: Object.fromEntries(
              state.activeGameSession.playerIds.map((id) => [
                id,
                progress!.judgements.filter(
                  (j) => j.playerId === id && j.outcome === 'correct',
                ).length,
              ]),
            ),
          });
          history = [...history, result];
        }
        commit({
          ...invalidate(state, false),
          phase: 'ended',
          hostState: 'ended',
          banPhase: 'closed',
          activeGameSession: null,
          pendingGameplayEvidence: [],
          gameHistory: history,
        });
        queue.length = 0;
        if (!stopped)
          return failure('STOP_FAILED', 'Party ended but adapter stop failed');
        break;
      }
    }
    return success();
  }
  async function dispatch(
    rawCommand: PartyCommand,
    rawActor: PartyActor,
  ): Promise<Result<PartyState>> {
    const actor = PartyActorSchema.safeParse(rawActor);
    if (
      !actor.success ||
      (actor.data.role === 'host' &&
        actor.data.playerId !== state.hostPlayerId) ||
      (actor.data.role === 'player' &&
        !state.players.map((p) => p.id).includes(actor.data.playerId)) ||
      (actor.data.role === 'system' && !dependencies.allowSystem?.())
    )
      return failure('INVALID_ACTOR', 'Actor identity is not authorized');
    const parsed = PartyCommandSchema.safeParse(rawCommand);
    if (!parsed.success)
      return failure('INVALID_INPUT', 'Invalid party command');
    const command = parsed.data;
    if (command.partyId !== state.partyId)
      return failure('INVALID_INPUT', 'Command belongs to another party');
    const key = canonical({ actor: actor.data, command });
    const cached = commands.get(command.commandId);
    if (cached)
      return cached.key === key
        ? freeze(copy(cached.result))
        : failure(
            'COMMAND_CONFLICT',
            'Command ID was used with a different actor or payload',
          );
    if (busy)
      return failure('BUSY', 'Another command or event drain is running');
    if (command.expectedVersion !== state.selectionVersion)
      return failure('STALE_VERSION', 'Command version is stale');
    busy = true;
    let result: Result<PartyState>;
    try {
      result = await execute(command, actor.data);
    } catch (error) {
      const code =
        error instanceof RuntimeFailure ? error.code : 'INVALID_INPUT';
      // Failed recomputation cannot restore a previously usable ready state.
      if (
        ['SOURCE_FAILED', 'INVALID_INPUT', 'NOT_EVALUATED'].includes(code) &&
        [
          'INITIALIZE',
          'GENERATE',
          'REGENERATE',
          'START_NEXT_ROUND',
          'REGENERATE_FROM_ERROR',
          'UPDATE_MEMBERS',
          'UPDATE_CATALOG',
          'UPDATE_CONFIG',
          'REFRESH_PROFILES',
        ].includes(command.type)
      )
        commit({
          ...invalidate(state, false),
          phase: state.phase === 'error' ? 'error' : 'setup',
          banPhase: 'closed',
        });
      result = failure(
        code,
        error instanceof RuntimeFailure
          ? error.message
          : 'Invalid computation or dependency data',
      );
    } finally {
      busy = false;
    }
    commands.set(command.commandId, { key, result: copy(result) });
    return freeze(copy(result));
  }
  async function consume(raw: unknown): Promise<Result<PartyState>> {
    // Inspect event ID before phase validation so a finish replay remains idempotent.
    if (
      raw !== null &&
      typeof raw === 'object' &&
      'eventId' in raw &&
      typeof raw.eventId === 'string'
    ) {
      const prior = events.get(raw.eventId);
      if (prior !== undefined)
        return prior === canonical(raw)
          ? success()
          : failGame('EVENT_CONFLICT', 'Event ID payload changed');
    }
    if (state.phase === 'ended')
      return failure('EVENT_INVALID', 'Ended parties do not accept new events');
    const parsed = GameEventSchema.safeParse(raw);
    if (!parsed.success)
      return failGame('EVENT_INVALID', 'Malformed game event');
    const event = parsed.data;
    if (state.phase !== 'playing' || !state.activeGameSession || !progress)
      return failGame('EVENT_INVALID', 'No active game accepts this event');
    try {
      const nextProgress = advanceProgress(
        progress,
        state.activeGameSession,
        event,
      );
      const evidence = gameplayEvidence({
        catalog: state.catalog,
        session: state.activeGameSession,
        event,
        sourceId: 'runtime:gameplay',
        observedAt: event.occurredAt,
      });
      let next: PartyState = {
        ...state,
        processedEventIds: [...state.processedEventIds, event.eventId],
        pendingGameplayEvidence: evidence
          ? [...state.pendingGameplayEvidence, evidence]
          : state.pendingGameplayEvidence,
      };
      if (event.type === 'GAME_FINISHED') {
        commit({ ...state, phase: 'settling' });
        check(game, 'RESULT_MISMATCH', 'No game result provider');
        const adapterResult = game.getResult();
        check(
          adapterResult.status === 'finished' &&
            canonical(adapterResult.result) === canonical(event.result),
          'RESULT_MISMATCH',
          'Adapter result differs from finish event',
        );
        const raw = [
          ...rawHistory,
          ...state.players.map((p) =>
            RawUserMusicDataSchema.parse({
              schemaVersion: 1,
              sourceId: 'runtime:gameplay',
              userId: p.id,
              snapshotId: 'feedback:' + event.gameSessionId + ':' + p.id,
              observedAt: event.occurredAt,
              evidence: next.pendingGameplayEvidence.filter(
                (e) => e.playerId === p.id,
              ),
              declaredPreferences: {
                genres: {},
                artists: {},
                languages: {},
                regions: {},
                eras: {},
                cultures: {},
                franchises: {},
                scenes: {},
              },
            }),
          ),
        ];
        const profiles = buildProfiles(
          { ...next, referenceTime: event.occurredAt },
          raw,
        ).playerProfiles;
        next = {
          ...invalidate(next),
          referenceTime: event.occurredAt,
          playerProfiles: profiles,
          matrix: null,
          activeGameSession: null,
          pendingGameplayEvidence: [],
          gameHistory: [...state.gameHistory, event.result],
          phase: 'finished',
        };
        // All validation/build work precedes the atomic settlement commit.
        PartyStateSchema.parse(next);
        check(
          await stop(),
          'STOP_FAILED',
          'Completed adapter could not be stopped',
        );
        commit(next);
        rawHistory = raw;
      } else commit(next);
      progress = nextProgress;
      minimumTime = event.occurredAt;
      events.set(event.eventId, canonical(event));
      return success();
    } catch (error) {
      return failGame(
        error instanceof RuntimeFailure ? error.code : 'EVENT_INVALID',
        error instanceof RuntimeFailure
          ? error.message
          : 'Invalid event or settlement data',
      );
    }
  }
  async function drainEvents(): Promise<Result<PartyState>> {
    if (busy) return failure('BUSY', 'Another operation is running');
    busy = true;
    try {
      while (queue.length) {
        const result = await consume(queue.shift());
        if (!result.ok) return result;
      }
      return success();
    } finally {
      busy = false;
    }
  }
  async function suggest(): Promise<Result<HostDecision>> {
    const current = snapshot(),
      version = state.selectionVersion;
    try {
      const decision = HostDecisionSchema.parse(
        await dependencies.hostAgent.decide({
          snapshot: current,
          assessment: current.fairnessAssessment,
          gameResult: current.gameHistory.at(-1) ?? null,
        }),
      );
      if (
        state.selectionVersion !== version ||
        canonical(state) !== canonical(current)
      )
        return failure('STALE_VERSION', 'Host suggestion used stale context');
      if (
        decision.action === 'START_WARMUP' ||
        decision.action === 'CHANGE_DIFFICULTY'
      )
        return failure('UNSUPPORTED_ACTION', 'Host action is not implemented');
      return { ok: true, value: freeze(copy(decision)) };
    } catch {
      return failure('UNSUPPORTED_ACTION', 'Host returned an invalid action');
    }
  }
  return {
    dispatch,
    getSnapshot: snapshot,
    drainEvents,
    suggest,
    getDiagnostics: () => freeze(copy(diagnostics)),
  };
}
