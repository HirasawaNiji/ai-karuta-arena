import {
  MatchResultSchema,
  type MatchResult,
  type TournamentState,
  type TournamentMatch,
  type TournamentSessionBinding,
  type PlayerId,
  type SongId,
  type DuelPresetId,
} from '@amp/core';

/** Owns bracket and advancement only. Scores always come from the bound engine. */
export function createTournament(input: {
  tournamentId: string;
  entrants: TournamentState['entrants'];
  preset: DuelPresetId;
  seed: number;
  now: () => string;
}) {
  if (
    ![4, 8].includes(input.entrants.length) ||
    new Set(input.entrants.map((p) => p.id)).size !== input.entrants.length
  )
    throw new Error('赛事需要 4 或 8 位不同选手');
  let seed = input.seed >>> 0;
  const players = structuredClone([...input.entrants]);
  for (let i = players.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = Math.floor((seed / 4294967296) * (i + 1));
    [players[i], players[j]] = [players[j]!, players[i]!];
  }
  const matches: TournamentMatch[] = [];
  let previous: string[] = [];
  for (
    let count = players.length / 2, round = 1;
    count >= 1;
    count /= 2, round++
  ) {
    const next: string[] = [];
    for (let i = 0; i < count; i++) {
      const matchId = input.tournamentId + ':r' + round + ':m' + (i + 1);
      matches.push({
        matchId,
        round,
        sources: round === 1 ? [] : previous.slice(i * 2, i * 2 + 2),
        playerIds:
          round === 1 ? players.slice(i * 2, i * 2 + 2).map((p) => p.id) : [],
        status: round === 1 ? 'ready' : 'pending',
        attempt: 0,
        sessionId: null,
        winnerId: null,
        scores: null,
      });
      next.push(matchId);
    }
    previous = next;
  }
  let state: TournamentState = {
    tournamentId: input.tournamentId,
    version: 1,
    poolVersion: 1,
    status: 'active',
    preset: input.preset,
    entrants: structuredClone(input.entrants),
    matches,
    currentMatchId: null,
    championId: null,
    allowRepeats: false,
    exposedSongIds: [],
    audit: [],
  };
  const bindings = new Map<string, TournamentSessionBinding>();
  const results = new Map<string, string>();
  const snapshot = () => structuredClone(state);
  const match = (id: string) => {
    const m = state.matches.find((m) => m.matchId === id);
    if (!m) throw new Error('场次不存在');
    return m;
  };
  function active() {
    if (state.status !== 'active') throw new Error('赛事已结束');
  }
  function update(id: string, patch: Partial<TournamentMatch>) {
    state = {
      ...state,
      version: state.version + 1,
      matches: state.matches.map((m) =>
        m.matchId === id ? { ...m, ...patch } : m,
      ),
    };
  }
  function advance(id: string, winnerId: PlayerId) {
    update(id, { status: 'completed', winnerId });
    for (const m of state.matches) {
      if (m.status !== 'pending') continue;
      const parents = m.sources.map(match);
      if (parents.every((p) => p.status === 'completed' && p.winnerId))
        update(m.matchId, {
          status: 'ready',
          playerIds: parents.map((p) => p.winnerId!),
        });
    }
    const final = state.matches.at(-1)!;
    if (final.status === 'completed')
      state = { ...state, status: 'completed', championId: final.winnerId };
  }
  function open(matchId: string) {
    active();
    const m = match(matchId);
    if (
      state.matches.some(
        (m) =>
          m.status === 'playing' ||
          (m.status === 'preparing' && m.matchId !== matchId),
      )
    )
      throw new Error('请先结束当前场次');
    if (
      !['ready', 'preparing', 'awaiting_tiebreak', 'aborted'].includes(
        m.status,
      ) ||
      m.playerIds.length !== 2
    )
      throw new Error('前置比赛未完成或本场已结束');
    update(matchId, {
      status: 'preparing',
      attempt: m.attempt + 1,
      sessionId: null,
      scores: null,
    });
    state = { ...state, currentMatchId: matchId };
  }
  function bind(binding: TournamentSessionBinding) {
    active();
    const m = match(binding.matchId);
    if (
      m.status !== 'preparing' ||
      state.currentMatchId !== m.matchId ||
      JSON.stringify(m.playerIds) !==
        JSON.stringify(binding.session.playerIds) ||
      bindings.has(binding.session.gameSessionId)
    )
      throw new Error('单场会话与对阵不匹配');
    bindings.set(binding.session.gameSessionId, structuredClone(binding));
    update(m.matchId, {
      status: 'playing',
      sessionId: binding.session.gameSessionId,
    });
  }
  function record(inputResult: MatchResult) {
    const r = MatchResultSchema.parse(inputResult);
    const sessionId = r.game.session.gameSessionId;
    const binding = bindings.get(sessionId);
    if (
      !binding ||
      binding.matchId !== r.matchId ||
      binding.rulesVersion !== r.rulesVersion ||
      JSON.stringify(binding.session) !== JSON.stringify(r.game.session)
    )
      throw new Error('比赛结果未绑定当前会话');
    const key = sessionId + ':' + r.resultVersion;
    const data = JSON.stringify(r);
    if (results.has(key)) {
      if (results.get(key) !== data)
        throw new Error('结果冲突，保留原晋级记录');
      return;
    }
    active();
    const m = match(r.matchId);
    if (m.status !== 'playing' || m.sessionId !== sessionId)
      throw new Error('场次已处理或会话过期');
    results.set(key, data);
    expose(r.game.playedSongIds);
    update(m.matchId, { scores: r.game.scores });
    if (r.game.status === 'aborted') update(m.matchId, { status: 'aborted' });
    else if (!r.winnerId) update(m.matchId, { status: 'awaiting_tiebreak' });
    else advance(m.matchId, r.winnerId);
  }
  function expose(ids: readonly SongId[]) {
    const songs = [...new Set([...state.exposedSongIds, ...ids])];
    if (songs.length !== state.exposedSongIds.length)
      state = { ...state, exposedSongIds: songs };
  }
  function cancelPreparation() {
    const m = state.matches.find((m) => m.status === 'preparing');
    if (m) update(m.matchId, { status: 'ready' });
  }
  function audit(
    actorId: PlayerId,
    kind: TournamentState['audit'][number]['kind'],
    reason: string,
    matchId: string | null = null,
    loserId: PlayerId | null = null,
  ) {
    state = {
      ...state,
      version: state.version + 1,
      audit: [
        ...state.audit,
        { at: input.now(), actorId, kind, reason, matchId, loserId },
      ],
    };
  }
  return {
    snapshot,
    open,
    bind,
    record,
    expose,
    changePool(actorId: PlayerId, allowRepeats: boolean) {
      active();
      if (state.matches.some((m) => m.status === 'playing'))
        throw new Error('请先结束当前比赛');
      const enablingRepeats = allowRepeats && !state.allowRepeats;
      cancelPreparation();
      state = { ...state, poolVersion: state.poolVersion + 1, allowRepeats };
      audit(
        actorId,
        enablingRepeats ? 'repeat_allowed' : 'pool_refreshed',
        enablingRepeats
          ? '组织者明确允许跨场重复；重新评估并确认'
          : '公共题库版本更新；旧准备失效',
      );
    },
    forfeit(
      actorId: PlayerId,
      matchId: string,
      loserId: PlayerId,
      reason: string,
    ) {
      active();
      const m = match(matchId);
      if (
        !reason.trim() ||
        m.playerIds.length !== 2 ||
        !m.playerIds.includes(loserId) ||
        ['pending', 'playing', 'completed'].includes(m.status)
      )
        throw new Error('请先中断比赛并确认有效弃权选手');
      audit(actorId, 'forfeit', reason, matchId, loserId);
      advance(
        matchId,
        m.playerIds.find((p) => p !== loserId)!,
      );
    },
    end(actorId: PlayerId) {
      active();
      if (state.matches.some((m) => m.status === 'playing'))
        throw new Error('请先中断当前比赛');
      audit(actorId, 'ended', '组织者主动结束赛事');
      state = { ...state, status: 'ended' };
    },
  };
}
export type TournamentController = ReturnType<typeof createTournament>;
