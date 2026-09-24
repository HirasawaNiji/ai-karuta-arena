import {
  MULTIPLAYER_RULES,
  GameTypeSchema,
  MultiplayerPreparationCommandSchema,
  PartyStateSchema,
  GameSessionInputSchema,
  type MultiplayerPreparationCommand,
  type MultiplayerPreparationView,
  type MultiplayerEngine,
  type MultiplayerEngineFactory,
  type MultiplayerAction,
  type PlayerId,
  type SongId,
  type PartyState,
  type GameEvent,
  type GameResult,
  type Question,
} from '@amp/core';
import {
  buildFamiliarityMatrix,
  MANUAL_SCORING_CONFIG,
} from '@amp/music-profile';
import {
  selectPlaylist,
  assessPlaylist,
  DEFAULT_SELECTION_CONFIG,
  DEFAULT_FAIRNESS_CONFIG,
} from '@amp/playlist-engine';
import { type LobbyPreparationContext } from './lobby.js';
import {
  initialProgress,
  advanceProgress,
  type EventProgress,
} from './events.js';
import { canStart } from './can-start.js';

export interface MultiplayerPreparationDependencies {
  readonly context: () => LobbyPreparationContext;
  readonly factory: MultiplayerEngineFactory;
  readonly now: () => number;
  readonly nextId: () => string;
  readonly seed: () => number;
  readonly onChange: () => void;
  readonly onCompleted: (
    result: GameResult,
    events: readonly GameEvent[],
  ) => void;
}
export function createMultiplayerPreparation(
  deps: MultiplayerPreparationDependencies,
) {
  let frozen: LobbyPreparationContext | null = null,
    sourceRevision = -1,
    version = 0,
    phase: MultiplayerPreparationView['phase'] = 'idle',
    message = '全员准备后，由房主发起多人选曲';
  let proposed: readonly SongId[] = [],
    selected: readonly SongId[] = [],
    bans: Record<string, readonly SongId[]> = {},
    state: PartyState | null = null,
    game: MultiplayerEngine | null = null;
  const ready = new Set<PlayerId>(),
    actions = new Map<string, string>();
  let audioReady = false,
    completed = false,
    fault: string | null = null,
    events: GameEvent[] = [],
    progress: EventProgress | null = null;
  const time = () => new Date(deps.now()).toISOString();
  function clear(reason: string) {
    version++;
    frozen = null;
    sourceRevision = -1;
    phase = 'idle';
    message = reason;
    proposed = [];
    selected = [];
    bans = {};
    state = null;
    game = null;
    ready.clear();
    audioReady = false;
    completed = false;
    fault = null;
    events = [];
    progress = null;
  }
  function sync() {
    if (!frozen || deps.context().room.revision === sourceRevision) return;
    if (game) {
      sourceRevision = deps.context().room.revision;
      game.abort('成员、画像或准备状态变化，本局中断');
      ready.clear();
      audioReady = false;
      state = null;
    } else clear('房间状态已变化，请重新准备并选曲');
  }
  function guard() {
    if (!state) return ['FINAL_SELECTION_REQUIRED'];
    const blockers = [...canStart(state, ['party-grab']).blockers];
    if (selected.length !== MULTIPLAYER_RULES.questionCount)
      blockers.push('MATERIAL_SHORT');
    const current = deps.context().room;
    if (
      current.revision !== sourceRevision ||
      state.players.some(
        (p) =>
          !current.members.some(
            (m) => m.id === p.id && m.online && m.lobbyReady,
          ),
      )
    )
      blockers.push('MEMBERS_NOT_READY');
    if (state.players.some((p) => !ready.has(p.id)))
      blockers.push('CARDS_NOT_READY');
    if (!audioReady) blockers.push('HOST_AUDIO_NOT_READY');
    return blockers;
  }
  function snapshot(id: PlayerId): MultiplayerPreparationView {
    sync();
    const c = frozen ?? deps.context(),
      blockers = guard();
    return structuredClone({
      version,
      phase,
      playerIds: frozen?.room.members.map((m) => m.id) ?? [],
      proposedSongIds: proposed,
      ownBans: bans[id] ?? null,
      banComplete: Object.keys(bans) as PlayerId[],
      cards: c.catalog.cards
        .filter((card) =>
          selected.some((s) => c.questions[s]?.answerCardId === card.cardId),
        )
        .map((card) => ({ cardId: card.cardId, title: card.text })),
      readyPlayerIds: [...ready],
      assessment: state?.fairnessAssessment ?? null,
      acknowledged: !!state?.hostAcknowledgement,
      blockers,
      canStart: phase === 'confirming' && blockers.length === 0,
      game: game
        ? fault
          ? { ...game.snapshot(), phase: 'aborted' as const, message: fault }
          : game.snapshot()
        : null,
      message,
    });
  }
  function evaluate(final: boolean) {
    const c = frozen!,
      playerIds = c.room.members.map((m) => m.id),
      at = time();
    const matrix = buildFamiliarityMatrix({
      catalog: c.catalog,
      profiles: c.profiles,
      scoringConfig: MANUAL_SCORING_CONFIG,
      referenceTime: at,
      matrixVersion: c.room.roomId + ':multi:' + version,
      questionBySongId: c.questions,
    });
    const candidateSongIds = c.catalog.songs.map((s) => s.id).sort(),
      bannedSongIds = [...new Set(Object.values(bans).flat())].sort();
    const availability = Object.fromEntries(
      candidateSongIds.map((id) => [
        id,
        c.questions[id]
          ? { available: true as const }
          : { available: false as const, reason: 'MATERIAL_PENDING' },
      ]),
    );
    const config = {
      scoring: MANUAL_SCORING_CONFIG,
      selection: DEFAULT_SELECTION_CONFIG,
      fairness: DEFAULT_FAIRNESS_CONFIG,
    };
    const selection = selectPlaylist({
      profileContext: {
        catalog: c.catalog,
        profiles: c.profiles,
        scoringConfig: config.scoring,
        referenceTime: at,
        matrix,
      },
      candidateSongIds,
      requestedCount: MULTIPLAYER_RULES.questionCount,
      bannedSongIds,
      excludedHistorySongIds: [],
      availability,
      selectionConfig: config.selection,
      fairnessConfig: config.fairness,
      selectionVersion: version,
      gameType: GameTypeSchema.parse('party-grab'),
      roundNumber: 1,
    });
    selected = selection.selectedSongIds;
    if (!final) {
      proposed = selected;
      return;
    }
    const assessment = assessPlaylist({
      playerIds,
      selectedSongIds: selected,
      matrix,
      requestedCount: MULTIPLAYER_RULES.questionCount,
      fairnessConfig: config.fairness,
      selectionVersion: version,
    });
    const common = {
      selectionVersion: version,
      hostPlayerId: c.room.hostId,
      catalogVersion: c.catalog.catalogVersion,
      candidateSongIds,
      requestedCount: MULTIPLAYER_RULES.questionCount,
      bannedSongIds,
      excludedHistorySongIds: [],
      availability,
      referenceTime: at,
      config,
      partyPreferences: { excludePlayedSongs: false },
    };
    state = PartyStateSchema.parse({
      ...common,
      partyId: c.room.roomId,
      players: c.room.members.map((m) => ({
        id: m.id,
        displayName: m.nickname,
      })),
      catalog: c.catalog,
      playerProfiles: c.profiles,
      currentGame: 'party-grab',
      currentRound: 1,
      difficulty: MULTIPLAYER_RULES.version,
      matrix,
      currentPlaylist: selected,
      selectionResult: null,
      banPhase: 'closed',
      phase: 'prepared',
      hostState: assessment.passed ? 'ready' : 'awaiting_host_choice',
      evaluationContext: {
        ...common,
        playerIds: [...playerIds].sort(),
        profileVersions: Object.fromEntries(
          c.profiles.map((p) => [p.playerId, p.profileVersion]),
        ),
        profiles: [...c.profiles].sort((a, b) =>
          a.playerId < b.playerId ? -1 : 1,
        ),
        selectedSongIds: selected,
        gameType: 'party-grab',
        roundNumber: 1,
        matrixVersion: matrix.matrixVersion,
      },
      fairnessAssessment: assessment,
      hostAcknowledgement: null,
      activeGameSession: null,
      gameHistory: [],
      processedEventIds: [],
      pendingGameplayEvidence: [],
    });
    phase = 'confirming';
    message = '禁歌后已补齐并重新评估，请确认最终歌牌';
  }
  function settle() {
    const result = game?.result();
    if (result && !completed) {
      if (result.status === 'completed') deps.onCompleted(result, events);
      completed = true;
    }
  }
  function dispatch(
    id: PlayerId,
    raw: MultiplayerPreparationCommand,
  ): MultiplayerPreparationView {
    sync();
    const cmd = MultiplayerPreparationCommandSchema.parse(raw),
      c = deps.context();
    if (!c.room.members.some((m) => m.id === id && m.online))
      throw new Error('成员不在线');
    const key = JSON.stringify([id, cmd]),
      old = actions.get(cmd.actionId);
    if (old) {
      if (old !== key) throw new Error('动作 ID 冲突');
      return snapshot(id);
    }
    if (cmd.expectedVersion !== version) throw new Error('准备版本已变化');
    if (actions.size >= 4000) throw new Error('本房间操作过多');
    if (
      ['begin', 'reset', 'acknowledge', 'start'].includes(cmd.type) &&
      id !== c.room.hostId
    )
      throw new Error('仅房主可执行');
    if (frozen && !frozen.room.members.some((m) => m.id === id))
      throw new Error('请等待下一局');
    switch (cmd.type) {
      case 'begin':
        if (phase !== 'idle') throw new Error('请先结束或重置当前准备');
        if (
          c.room.members.length < 2 ||
          c.room.members.length > 8 ||
          c.room.members.some((m) => !m.online || !m.lobbyReady)
        )
          throw new Error('需要 2 至 8 位玩家全部准备');
        if (Object.keys(c.questions).length < MULTIPLAYER_RULES.questionCount)
          throw new Error('已核验素材不足');
        frozen = c;
        sourceRevision = c.room.revision;
        version = Math.max(version + 1, sourceRevision + 1);
        evaluate(false);
        phase = 'banning';
        message = '每人可禁掉一首不想听的歌，也可以跳过';
        break;
      case 'ban':
        if (
          phase !== 'banning' ||
          bans[id] ||
          cmd.songIds.some((s) => !proposed.includes(s))
        )
          throw new Error('禁歌阶段或范围无效');
        bans[id] = [...cmd.songIds];
        if (Object.keys(bans).length === frozen!.room.members.length) {
          version++;
          evaluate(true);
        }
        break;
      case 'acknowledge':
        if (
          phase !== 'confirming' ||
          selected.length !== MULTIPLAYER_RULES.questionCount ||
          !state?.fairnessAssessment?.validity ||
          state.fairnessAssessment.passed
        )
          throw new Error('没有可确认的告警');
        state = PartyStateSchema.parse({
          ...state,
          hostState: 'ready',
          hostAcknowledgement: {
            action: 'continue',
            playerId: id,
            selectionVersion: version,
            acknowledgedAt: time(),
            reasons: state.fairnessAssessment.reasons,
          },
        });
        break;
      case 'match_ready':
        if (phase !== 'confirming' || !state)
          throw new Error('请先完成最终题组');
        if (id !== c.room.hostId && cmd.audioReady)
          throw new Error('音箱由房主确认');
        if (id === c.room.hostId) audioReady = cmd.audioReady;
        ready.add(id);
        break;
      case 'start': {
        if (phase !== 'confirming' || guard().length)
          throw new Error('开局条件未满足：' + guard().join(', '));
        const s = state!,
          session = GameSessionInputSchema.parse({
            schemaVersion: 1,
            partyId: s.partyId,
            gameSessionId: deps.nextId(),
            selectionVersion: version,
            gameType: 'party-grab',
            roundNumber: 1,
            playerIds: s.players.map((p) => p.id),
            songIds: s.currentPlaylist,
            referenceTime: s.referenceTime,
          });
        progress = initialProgress(session);
        events = [];
        game = deps.factory.create(
          {
            session,
            seed: deps.seed(),
            questions: selected.map((id) => frozen!.questions[id]!),
          },
          {
            now: deps.now,
            nextToken: deps.nextId,
            audioPlayerId: c.room.hostId,
            onChange: deps.onChange,
            onEvent: (event) => {
              progress = advanceProgress(progress!, session, event);
              events.push(event);
            },
          },
        );
        phase = 'match';
        game.start();
        break;
      }
      case 'interrupt':
        if (!game || game.result()) throw new Error('当前没有进行中的对局');
        game.abort('玩家离开前台或主动中断，本局不计正式排名');
        break;
      case 'reset':
        if (game && !game.result() && !fault)
          throw new Error('请先结束当前对局');
        clear('可以重新准备，开始下一局');
        break;
    }
    actions.set(cmd.actionId, key);
    settle();
    deps.onChange();
    return snapshot(id);
  }
  function tick() {
    if (fault) return;
    try {
      sync();
      game?.tick();
      settle();
    } catch {
      fault = '对局状态校验失败，请重新准备';
      state = null;
      ready.clear();
      audioReady = false;
      try {
        game?.abort(fault);
      } catch {
        /* Failed projection remains aborted. */
      }
      deps.onChange();
    }
  }
  return {
    snapshot,
    dispatch,
    tick,
    action(id: PlayerId, a: MultiplayerAction) {
      sync();
      if (!game || fault) throw new Error('当前无法抢牌');
      const view = game.action(id, a);
      settle();
      return view;
    },
    currentQuestion: (token: string): Question | null =>
      fault ? null : (game?.currentQuestion(token) ?? null),
  };
}
export type MultiplayerPreparationController = ReturnType<
  typeof createMultiplayerPreparation
>;
