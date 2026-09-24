import {
  DUEL_PRESETS,
  DUEL_RULES,
  TournamentCommandSchema,
  type Question,
  type LobbySnapshot,
  type TournamentCommand,
  type TournamentView,
  type PlayerId,
  type DuelAction,
  type DuelPreparationCommand,
  type DuelEngineFactory,
  type DuelResult,
  type GameEvent,
} from '@amp/core';
import { createTournament, type TournamentController } from './tournament.js';
import {
  createDuelPreparation,
  type DuelPreparationController,
} from './duel-preparation.js';
import { type LobbyPreparationContext } from './lobby.js';
import { supplementCatalog } from './material-pool.js';

export function createTournamentPreparation(deps: {
  context: () => LobbyPreparationContext;
  room?: () => LobbySnapshot;
  factory: DuelEngineFactory;
  now: () => number;
  nextId: () => string;
  seed: () => number;
  onChange: () => void;
  onCompleted: (result: DuelResult, events: readonly GameEvent[]) => void;
}) {
  let tournament: TournamentController | null = null;
  let frozen: LobbyPreparationContext | null = null;
  let duel: DuelPreparationController | null = null;
  let matchId: string | null = null;
  let revision = 0,
    signature = '',
    generation = 0;
  let message = '全员准备后，房主创建 4 人或 8 人单淘汰赛';
  const actions = new Map<string, string>();
  const active = () => tournament?.snapshot().status === 'active';
  const currentMatch = () =>
    tournament?.snapshot().matches.find((m) => m.matchId === matchId);
  function eligibleQuestions() {
    if (!frozen || !tournament) return {};
    const state = tournament.snapshot();
    return Object.fromEntries(
      Object.entries(frozen.questions).filter(
        ([song]) =>
          state.allowRepeats || !state.exposedSongIds.some((s) => s === song),
      ),
    );
  }
  // Only live availability of the two competitors can invalidate a frozen single match.
  // Personal feedback, spectators, and another entrant's connectivity cannot change its profiles.
  function context(): LobbyPreparationContext {
    const state = tournament!.snapshot(),
      m = currentMatch()!;
    const live = deps.room?.() ?? deps.context().room;
    const members = m.playerIds.map((id) => {
      const original = frozen!.room.members.find((p) => p.id === id)!;
      const online = live.members.find((p) => p.id === id)?.online ?? false;
      return {
        ...original,
        online,
        lobbyReady: online,
        waitingForNextMatch: false,
      };
    });
    const sig = JSON.stringify([
      generation,
      state.poolVersion,
      members.map((p) => [p.id, p.online]),
    ]);
    if (sig !== signature) {
      revision++;
      signature = sig;
    }
    return {
      ...frozen!,
      room: {
        ...frozen!.room,
        mode: 'duel',
        revision,
        hostId: m.playerIds[0]!,
        members,
        playableCount: Object.keys(eligibleQuestions()).length,
      },
      catalog: {
        ...frozen!.catalog,
        players: frozen!.catalog.players.filter((p) =>
          m.playerIds.includes(p.player.id),
        ),
      },
      profiles: frozen!.profiles.filter((p) =>
        m.playerIds.includes(p.playerId),
      ),
      questions: eligibleQuestions(),
    };
  }
  function snapshot(id: PlayerId): TournamentView {
    // The single-match snapshot can synchronously settle connectivity changes.
    const preparation = duel?.snapshot(id) ?? null;
    return structuredClone({
      version: generation + (tournament?.snapshot().version ?? 0),
      state: tournament?.snapshot() ?? null,
      preparation,
      matchRoom: matchId ? context().room : null,
      availableCount: Object.keys(eligibleQuestions()).length,
      message,
    });
  }
  function makeDuel(openedMatchId: string) {
    matchId = openedMatchId;
    signature = '';
    duel = createDuelPreparation({
      context,
      now: deps.now,
      nextId: deps.nextId,
      seed: deps.seed,
      onChange: deps.onChange,
      onCompleted: deps.onCompleted,
      onResult: (result) => {
        tournament!.record({
          matchId: openedMatchId,
          game: result.game,
          rulesVersion: result.rulesVersion,
          resultVersion: result.resultVersion,
          winnerId: result.winnerId,
        });
        message =
          result.game.status === 'aborted'
            ? '本场中断，没有选手晋级；可重新准备或明确处理弃权'
            : result.winnerId
              ? '比赛结果已记录，对阵已更新'
              : '本场平局，等待房主安排双方加赛';
        deps.onChange();
      },
      factory: {
        create(input, engineDeps) {
          const engine = deps.factory.create(input, {
            ...engineDeps,
            onEvent: (event) => {
              engineDeps.onEvent(event);
              if (event.type === 'SONG_STARTED')
                tournament!.expose([event.songId]);
            },
          });
          tournament!.bind({
            matchId: openedMatchId,
            session: input.session,
            rulesVersion: DUEL_RULES.version,
          });
          return engine;
        },
      },
    });
  }
  function dispatch(id: PlayerId, input: TournamentCommand) {
    const cmd = TournamentCommandSchema.parse(input);
    const live = deps.context();
    if (!live.room.members.some((m) => m.id === id && m.online))
      throw new Error('成员不在线');
    const key = JSON.stringify([id, cmd]),
      old = actions.get(cmd.actionId);
    if (old) {
      if (old !== key) throw new Error('动作 ID 冲突');
      return snapshot(id);
    }
    if (cmd.expectedVersion !== snapshot(id).version)
      throw new Error('赛事版本已变化，请刷新');
    if (actions.size >= 4000) throw new Error('操作过多，请重新创建房间');
    if (
      id !== live.room.hostId &&
      !(cmd.type === 'forfeit' && cmd.loserId === id)
    )
      throw new Error('仅房主可调度赛事；选手只能确认本人弃权');
    if (cmd.type === 'create') {
      if (active()) throw new Error('请先结束当前赛事');
      if (
        live.room.members.length !== cmd.size ||
        live.room.members.some(
          (m) => !m.online || !m.lobbyReady || m.waitingForNextMatch,
        )
      )
        throw new Error('需要对应人数全员在线并完成入场准备');
      frozen = structuredClone(live);
      tournament = createTournament({
        tournamentId: deps.nextId(),
        seed: deps.seed(),
        preset: live.room.preset,
        now: () => new Date(deps.now()).toISOString(),
        entrants: live.room.members.map((m) => ({
          id: m.id,
          nickname: m.nickname,
          profileVersion: m.profileVersion,
        })),
      });
      duel = null;
      matchId = null;
      generation += 10000;
      message = '赛前画像与规则已固定；房主选择待开始的场次';
    } else {
      if (!tournament || !active()) throw new Error('没有进行中的赛事');
      if (cmd.type === 'open_match') {
        if (
          Object.keys(eligibleQuestions()).length <
          DUEL_PRESETS[frozen!.room.preset].minimumCandidates
        )
          throw new Error(
            '未曝光前奏不足；请补库，或明确允许跨场重复后重新评估',
          );
        tournament.open(cmd.matchId);
        makeDuel(cmd.matchId);
        message = '本场第一位选手负责共享音箱和最终开局确认';
      } else if (cmd.type === 'allow_repeats' || cmd.type === 'refresh_pool') {
        let refreshed = frozen!;
        if (cmd.type === 'refresh_pool') {
          // Existing recordings remain fixed. Only newly reviewed songs may supplement the pool.
          const catalog = supplementCatalog(frozen!.catalog, live.catalog);
          const questions = { ...frozen!.questions };
          for (const [song, q] of Object.entries(live.questions)) {
            if (
              !questions[song] &&
              catalog.questions.some(
                (old) => JSON.stringify(old) === JSON.stringify(q),
              )
            )
              questions[song] = q;
          }
          refreshed = { ...frozen!, catalog, questions };
        }
        tournament.changePool(
          id,
          cmd.type === 'allow_repeats' || tournament.snapshot().allowRepeats,
        );
        frozen = refreshed;
        duel = null;
        matchId = null;
        message = '题库版本已更新，旧选歌与准备失效，请重新安排本场';
      } else if (cmd.type === 'forfeit') {
        tournament.forfeit(id, cmd.matchId, cmd.loserId, cmd.reason);
        if (matchId === cmd.matchId) {
          duel = null;
          matchId = null;
        }
        message = '明确弃权已记录并晋级；没有生成识曲反馈';
      } else if (cmd.type === 'end') {
        tournament.end(id);
        duel = null;
        matchId = null;
        message = '赛事已结束，可创建新赛事';
      }
    }
    actions.set(cmd.actionId, key);
    deps.onChange();
    return snapshot(id);
  }
  const participant = (id: PlayerId) => {
    if (!duel || !active() || !currentMatch()?.playerIds.includes(id))
      throw new Error('仅本场选手可操作');
    return duel;
  };
  return {
    snapshot,
    dispatch,
    active,
    checkRefresh(id: PlayerId, cmd: TournamentCommand) {
      const old = actions.get(cmd.actionId);
      if (old) {
        if (old !== JSON.stringify([id, cmd])) throw new Error('动作 ID 冲突');
        return false;
      }
      if (actions.size >= 4000) throw new Error('操作过多，请重新创建房间');
      const room = deps.room?.() ?? deps.context().room;
      const view = snapshot(id);
      if (
        cmd.type !== 'refresh_pool' ||
        room.hostId !== id ||
        !room.members.some((m) => m.id === id && m.online) ||
        view.version !== cmd.expectedVersion ||
        view.state?.status !== 'active' ||
        view.state.matches.some((m) => m.status === 'playing')
      )
        throw new Error('仅在线房主可在比赛间隙刷新当前版本题库');
      return true;
    },
    prepare(
      id: PlayerId,
      command: DuelPreparationCommand,
      binding: { matchId: string; attempt: number },
    ) {
      if (
        binding.matchId !== currentMatch()?.matchId ||
        binding.attempt !== currentMatch()?.attempt
      )
        throw new Error('场次已变化，请使用当前对局');
      if (command.type === 'reset') throw new Error('请由赛事房主重新安排本场');
      return participant(id).dispatch(id, command);
    },
    action(id: PlayerId, command: DuelAction, rtt: number) {
      return participant(id).action(id, command, rtt);
    },
    tick: () => duel?.tick(),
    currentQuestion(id: PlayerId, token: string): Question | null {
      if (id !== currentMatch()?.playerIds[0])
        throw new Error('音频仅由本场共享音箱播放');
      return duel?.currentQuestion(token) ?? null;
    },
  };
}
export type TournamentPreparationController = ReturnType<
  typeof createTournamentPreparation
>;
