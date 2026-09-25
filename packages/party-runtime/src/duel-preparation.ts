import {
  DUEL_PRESETS,
  DUEL_RULES,
  DuelPreparationCommandSchema,
  PartyStateSchema,
  PartyIdSchema,
  GameSessionInputSchema,
  type DuelPreparationCommand,
  type DuelPreparationView,
  type DuelEngine,
  type DuelEngineFactory,
  type GameEvent,
  type DuelView,
  type Question,
  type PlayerId,
  type SongId,
  type CardId,
  type PartyState,
  type DuelAction,
  type DuelResult,
} from '@amp/core';
import {
  buildFamiliarityMatrix,
  MANUAL_SCORING_CONFIG,
} from '@amp/music-profile';
import {
  assessPlaylist,
  DEFAULT_SELECTION_CONFIG,
  DEFAULT_FAIRNESS_CONFIG,
} from '@amp/playlist-engine';
import { type LobbyController } from './lobby.js';
import {
  initialProgress,
  advanceProgress,
  type EventProgress,
} from './events.js';
import { canStart } from './can-start.js';

type Context = ReturnType<LobbyController['preparationContext']>;
export interface DuelPreparationDependencies {
  readonly onResult?: (result: DuelResult) => void;
  readonly context: () => Context;
  readonly factory: DuelEngineFactory;
  readonly now: () => number;
  readonly nextId: () => string;
  readonly seed: () => number;
  readonly onChange: () => void;
  /** Called once after a completed match; aborted matches never enter feedback/competition. */
  readonly onCompleted: (
    result: DuelResult,
    events: readonly GameEvent[],
  ) => void;
}
export function createDuelPreparation(deps: DuelPreparationDependencies) {
  let frozen: Context | null = null,
    sourceRevision = -1,
    version = 0;
  let phase: DuelPreparationView['phase'] = 'idle',
    message = '双方准备后，由房主发起选歌';
  let pools: Record<string, SongId[]> = {},
    selections: Record<string, readonly SongId[]> = {},
    bans: Record<string, readonly SongId[]> = {};
  let hands: Record<string, CardId[]> = {},
    state: PartyState | null = null,
    game: DuelEngine | null = null;
  const ready = new Set<PlayerId>();
  let events: GameEvent[] = [],
    progress: EventProgress | null = null;
  let faultMessage: string | null = null;
  let audioReady = false,
    completed = false;
  const actions = new Map<string, string>();
  const time = () => new Date(deps.now()).toISOString();
  function clear(reason: string) {
    version++;
    phase = 'idle';
    message = reason;
    frozen = null;
    sourceRevision = -1;
    pools = {};
    selections = {};
    bans = {};
    hands = {};
    state = null;
    ready.clear();
    audioReady = false;
    game = null;
    faultMessage = null;
    completed = false;
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
      sourceRevision = deps.context().room.revision;
    } else clear('房间状态已变化，请双方重新准备并选歌');
  }
  function guard(): string[] {
    if (!state) return ['FINAL_SELECTION_REQUIRED'];
    const blockers = [...canStart(state, ['karuta']).blockers];
    const current = deps.context().room;
    if (
      current.revision !== sourceRevision ||
      current.members.length !== 2 ||
      current.members.some((m) => !m.online || !m.lobbyReady)
    )
      blockers.push('MEMBERS_NOT_READY');
    if (state.players.some((p) => !ready.has(p.id)))
      blockers.push('CARDS_NOT_READY');
    if (!audioReady) blockers.push('HOST_AUDIO_NOT_READY');
    return blockers;
  }
  function snapshot(id: PlayerId): DuelPreparationView {
    sync();
    const c = frozen ?? deps.context();
    const opponent = c.room.members.find((m) => m.id !== id)?.id;
    const blockers = guard();
    return structuredClone({
      version,
      preset: c.room.preset,
      phase,
      ownPool: pools[id] ?? [],
      ownSelection: selections[id] ?? null,
      banChoices: opponent ? (selections[opponent] ?? []) : [],
      ownBans: bans[id] ?? null,
      readyPlayerIds: [...ready],
      selectionComplete: Object.keys(selections) as PlayerId[],
      banComplete: Object.keys(bans) as PlayerId[],
      finalHands: hands,
      cards: c.catalog.cards
        .filter((card) => Object.values(hands).flat().includes(card.cardId))
        .map((card) => ({ cardId: card.cardId, title: card.text })),
      assessment: state?.fairnessAssessment ?? null,
      acknowledged: !!state?.hostAcknowledgement,
      canStart: phase === 'confirming' && blockers.length === 0,
      blockers,
      game: game
        ? faultMessage
          ? {
              ...game.snapshot(),
              phase: 'aborted' as const,
              winnerId: null,
              outcome: 'aborted' as const,
              message: faultMessage,
            }
          : game.snapshot()
        : null,
      message,
    });
  }
  function evaluate() {
    const c = frozen!;
    const playerIds = c.room.members.map((m) => m.id);
    const finalSongs = playerIds.flatMap((id) => {
      const other = playerIds.find((p) => p !== id)!;
      const songs = selections[id]!.filter((s) => !bans[other]!.includes(s));
      hands[id] = songs.map((s) => c.questions[s]!.answerCardId);
      return songs;
    });
    const at = time();
    const matrix = buildFamiliarityMatrix({
      catalog: c.catalog,
      profiles: c.profiles,
      scoringConfig: MANUAL_SCORING_CONFIG,
      referenceTime: at,
      matrixVersion: c.room.roomId + ':final:' + version,
      questionBySongId: c.questions,
    });
    const candidateSongIds = c.catalog.songs.map((s) => s.id).sort();
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
    const assessment = assessPlaylist({
      playerIds,
      selectedSongIds: finalSongs,
      matrix,
      requestedCount: DUEL_PRESETS[c.room.preset].handSize * 2,
      fairnessConfig: config.fairness,
      selectionVersion: version,
    });
    const common = {
      selectionVersion: version,
      hostPlayerId: c.room.hostId,
      catalogVersion: c.catalog.catalogVersion,
      candidateSongIds,
      requestedCount: DUEL_PRESETS[c.room.preset].handSize * 2,
      bannedSongIds: Object.values(bans).flat().sort(),
      excludedHistorySongIds: [],
      availability,
      referenceTime: at,
      config,
      partyPreferences: { excludePlayedSongs: false },
    };
    state = PartyStateSchema.parse({
      ...common,
      partyId: PartyIdSchema.parse(c.room.roomId),
      players: c.room.members.map((m) => ({
        id: m.id,
        displayName: m.nickname,
      })),
      catalog: c.catalog,
      playerProfiles: c.profiles,
      currentGame: 'karuta',
      currentRound: 1,
      difficulty: DUEL_RULES.version,
      matrix,
      currentPlaylist: finalSongs,
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
        selectedSongIds: finalSongs,
        gameType: 'karuta',
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
    message = '最终题组已重评，请确认歌牌与共享音箱';
  }
  function settle() {
    const result = game?.result();
    if (result && !completed) {
      if (result.game.status === 'completed') deps.onCompleted(result, events);
      deps.onResult?.(result);
      completed = true;
    }
  }
  function dispatch(
    id: PlayerId,
    input: DuelPreparationCommand,
  ): DuelPreparationView {
    sync();
    const cmd = DuelPreparationCommandSchema.parse(input);
    const current = deps.context();
    if (!current.room.members.some((m) => m.id === id && m.online))
      throw new Error('成员不在线');
    const key = JSON.stringify([id, cmd]);
    const old = actions.get(cmd.actionId);
    if (old) {
      if (old !== key) throw new Error('动作 ID 冲突');
      return snapshot(id);
    }
    if (cmd.expectedVersion !== version)
      throw new Error('准备版本已变化，请刷新后确认');
    if (actions.size >= 4000) throw new Error('本房间操作过多，请重新创建房间');
    if (
      ['begin', 'reset', 'acknowledge', 'start'].includes(cmd.type) &&
      id !== current.room.hostId
    )
      throw new Error('仅房主可执行此操作');
    if (frozen && !frozen.room.members.some((m) => m.id === id))
      throw new Error('请等待下一局');
    switch (cmd.type) {
      case 'begin': {
        if (phase !== 'idle') throw new Error('请先结束或重置当前准备');
        if (
          current.room.members.length !== 2 ||
          current.room.members.some((m) => !m.online || !m.lobbyReady)
        )
          throw new Error('需要两位在线玩家完成入场准备');
        const songs = Object.values(current.questions)
          .map((q) => q.songId)
          .sort();
        if (songs.length < DUEL_PRESETS[current.room.preset].minimumCandidates)
          throw new Error('已核验前奏素材不足');
        frozen = current;
        sourceRevision = current.room.revision;
        version = Math.max(version + 1, sourceRevision + 1);
        // Disjoint pools prevent concurrent selection collisions. Include all reviewed candidates.
        current.room.members.forEach(
          (m, i) => (pools[m.id] = songs.filter((_, j) => j % 2 === i)),
        );
        phase = 'selecting';
        message = '从自己的候选中选歌，随后为对方禁歌';
        break;
      }
      case 'select': {
        if (phase !== 'selecting' || selections[id])
          throw new Error('选歌已提交或阶段已结束');
        if (
          cmd.songIds.length !==
            DUEL_PRESETS[frozen!.room.preset].selectPerPlayer ||
          cmd.songIds.some((s) => !pools[id]?.includes(s))
        )
          throw new Error('选歌数量或候选范围不正确');
        selections[id] = [...cmd.songIds];
        if (Object.keys(selections).length === 2) {
          phase = 'banning';
          version++;
          message = '为对方禁歌，剩余歌曲组成对方手牌';
        }
        break;
      }
      case 'ban': {
        if (phase !== 'banning' || bans[id])
          throw new Error('禁歌已提交或阶段已结束');
        const other = frozen!.room.members.find((m) => m.id !== id)!.id;
        if (
          cmd.songIds.length !==
            DUEL_PRESETS[frozen!.room.preset].banPerPlayer ||
          cmd.songIds.some((s) => !selections[other]!.includes(s))
        )
          throw new Error('只能按本局数量禁用对方已选歌曲');
        bans[id] = [...cmd.songIds];
        if (Object.keys(bans).length === 2) {
          version++;
          evaluate();
        }
        break;
      }
      case 'acknowledge': {
        if (
          phase !== 'confirming' ||
          !state?.fairnessAssessment?.validity ||
          state.fairnessAssessment.passed
        )
          throw new Error('当前没有可知情继续的告警');
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
      }
      case 'match_ready': {
        if (phase !== 'confirming' || !state)
          throw new Error('请先完成最终题组');
        if (id !== current.room.hostId && cmd.audioReady)
          throw new Error('共享音箱由房主设备确认');
        if (id === current.room.hostId) audioReady = cmd.audioReady;
        ready.add(id);
        break;
      }
      case 'start': {
        if (phase !== 'confirming' || guard().length)
          throw new Error('开局条件未满足：' + guard().join(', '));
        const s = state!;
        const session = GameSessionInputSchema.parse({
          schemaVersion: 1,
          partyId: s.partyId,
          gameSessionId: deps.nextId(),
          selectionVersion: version,
          gameType: 'karuta',
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
            preset: frozen!.room.preset,
            seed: deps.seed(),
            questions: s.currentPlaylist.map((id) => frozen!.questions[id]!),
            hands,
          },
          {
            now: deps.now,
            nextToken: deps.nextId,
            audioPlayerId: current.room.hostId,
            onEvent: (event) => {
              progress = advanceProgress(progress!, session, event);
              events.push(event);
            },
            onChange: deps.onChange,
          },
        );
        phase = 'match';
        game.start();
        break;
      }
      case 'reset':
        if (game && !game.result() && !faultMessage)
          throw new Error('请先中断或结束当前对局');
        clear('双方可重新选歌，开始下一局');
        break;
      case 'interrupt':
        if (!game || game.result()) throw new Error('当前没有进行中的对局');
        game.abort('玩家离开前台或主动中断，本局不计胜负');
        break;
    }
    actions.set(cmd.actionId, key);
    settle();
    deps.onChange();
    return snapshot(id);
  }
  function action(id: PlayerId, input: DuelAction, rtt: number): DuelView {
    sync();
    if (faultMessage) throw new Error(faultMessage);
    if (!game) throw new Error('对局尚未开始');
    const result = game.action(id, input, rtt);
    settle();
    return result;
  }
  function tick() {
    if (faultMessage) return;
    try {
      sync();
      game?.tick();
      settle();
    } catch {
      faultMessage = '对局状态校验失败，本局中断，请重新选歌';
      state = null;
      ready.clear();
      audioReady = false;
      try {
        game?.abort(faultMessage);
      } catch {
        /* Keep a failed projection even if the adapter cannot abort. */
      }
      deps.onChange();
    }
  }
  return {
    snapshot,
    dispatch,
    action,
    tick,
    currentQuestion: (token: string): Question | null =>
      game?.currentQuestion(token) ?? null,
  };
}
export type DuelPreparationController = ReturnType<
  typeof createDuelPreparation
>;
