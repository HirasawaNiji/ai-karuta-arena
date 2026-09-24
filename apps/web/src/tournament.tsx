import { useState } from 'react';
import {
  DUEL_PRESETS,
  type Catalog,
  type LobbySnapshot,
  type TournamentCommand,
  type TournamentView,
  type PlayerId,
} from '@amp/core';
import { DuelPanel } from './duel.js';
import { newActionId } from './platform.js';
type Intent = TournamentCommand extends infer C
  ? C extends TournamentCommand
    ? Omit<C, 'actionId' | 'expectedVersion'>
    : never
  : never;
const labels = {
  pending: '等待上游',
  ready: '待开始',
  preparing: '选歌与准备',
  playing: '比赛中',
  awaiting_tiebreak: '等待加赛',
  aborted: '中断待重赛',
  completed: '已结束',
};
export function TournamentPanel({
  room,
  playerId,
  songs,
  view,
  onView,
}: {
  room: LobbySnapshot;
  playerId: PlayerId;
  songs: Catalog['songs'];
  view: TournamentView;
  onView: (v: TournamentView) => void;
}) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<Intent | null>(null),
    [reason, setReason] = useState('');
  const state = view.state,
    host = room.hostId === playerId;
  const name = (id: string) =>
    state?.entrants.find((p) => p.id === id)?.nickname ?? '选手';
  const current = state?.matches.find(
    (m) => m.matchId === state.currentMatchId,
  );
  const participant = current?.playerIds.includes(playerId) ?? false;
  const playing = state?.matches.some((m) => m.status === 'playing');
  async function command(intent: Intent) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/tournament/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...intent,
          actionId: newActionId(),
          expectedVersion: view.version,
        }),
      });
      const body = (await response.json()) as TournamentView & {
        error?: string;
      };
      if (!response.ok) throw new Error(body.error ?? '操作失败');
      onView(body);
      setConfirmation(null);
      setReason('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="panel tournament-panel">
        <div className="section-heading">
          <div>
            <div className="eyebrow">好友音乐杯</div>
            <h2>一路听到决赛</h2>
          </div>
          <span className="pill">单淘汰</span>
        </div>
        <p role="status">{view.message}</p>
        {error && (
          <p className="message error" role="alert">
            {error}
          </p>
        )}
        {(!state || state.status !== 'active') && (
          <>
            {state?.championId && (
              <div className="duel-result">
                <h3>本届冠军 · {name(state.championId)}</h3>
                <p>感谢每一位同场听歌的好友。</p>
              </div>
            )}
            <p className="muted">
              4 人或 8 人全员准备后，固定对阵和赛前画像。每场{' '}
              {DUEL_PRESETS[room.preset].handSize} 对{' '}
              {DUEL_PRESETS[room.preset].handSize}，第一位选手负责共享音箱。
            </p>
            {host && (
              <div className="preset-list">
                {([4, 8] as const).map((size) => (
                  <button
                    key={size}
                    disabled={
                      busy ||
                      room.members.length !== size ||
                      room.members.some((m) => !m.online || !m.lobbyReady)
                    }
                    onClick={() => void command({ type: 'create', size })}
                  >
                    创建 {size} 人淘汰赛
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        {state && (
          <>
            <p className="muted small">
              赛前画像已固定 · 题库版本 {state.poolVersion} · 已曝光{' '}
              {state.exposedSongIds.length} 首 · 可选 {view.availableCount} 首
              {state.allowRepeats
                ? ' · 已明确允许跨场重复'
                : ' · 默认不重复播放'}
            </p>
            <details key={playing ? 'playing' : 'between'} open={!playing}>
              <summary>
                查看完整对阵（
                {state.matches.filter((m) => m.status === 'completed').length}/
                {state.matches.length} 场已完成）
              </summary>
              <div className="bracket">
                {[...new Set(state.matches.map((m) => m.round))].map(
                  (round) => (
                    <section key={round}>
                      <h3>
                        {round === Math.log2(state.entrants.length)
                          ? '决赛'
                          : round === Math.log2(state.entrants.length) - 1
                            ? '半决赛'
                            : '八强赛'}
                      </h3>
                      {state.matches
                        .filter((m) => m.round === round)
                        .map((m) => (
                          <article className="bracket-match" key={m.matchId}>
                            <strong>
                              {m.playerIds.length
                                ? m.playerIds.map(name).join(' vs ')
                                : '等待前置比赛胜者'}
                            </strong>
                            <p>
                              {labels[m.status]}
                              {m.attempt > 1
                                ? ' · 第 ' + m.attempt + ' 次对局'
                                : ''}
                              {m.winnerId
                                ? ' · ' + name(m.winnerId) + ' 晋级'
                                : ''}
                            </p>
                            {m.scores && (
                              <p className="muted small">
                                抢牌得分{' '}
                                {m.playerIds
                                  .map(
                                    (p) => name(p) + ' ' + (m.scores?.[p] ?? 0),
                                  )
                                  .join(' / ')}
                                ；胜负按清空手牌判定
                              </p>
                            )}
                            {state.status === 'active' && (
                              <>
                                {host &&
                                  [
                                    'ready',
                                    'preparing',
                                    'awaiting_tiebreak',
                                    'aborted',
                                  ].includes(m.status) && (
                                    <button
                                      disabled={
                                        busy ||
                                        playing ||
                                        state.matches.some(
                                          (other) =>
                                            other.status === 'preparing' &&
                                            other.matchId !== m.matchId,
                                        )
                                      }
                                      onClick={() =>
                                        void command({
                                          type: 'open_match',
                                          matchId: m.matchId,
                                        })
                                      }
                                    >
                                      {m.status === 'preparing'
                                        ? '重新选歌'
                                        : m.status === 'awaiting_tiebreak'
                                          ? '安排加赛'
                                          : '安排本场'}
                                    </button>
                                  )}
                                {!['pending', 'playing', 'completed'].includes(
                                  m.status,
                                ) &&
                                  m.playerIds
                                    .filter((p) => host || p === playerId)
                                    .map((p) => (
                                      <button
                                        className="text-button"
                                        key={p}
                                        disabled={busy}
                                        onClick={() => {
                                          setReason('');
                                          setConfirmation({
                                            type: 'forfeit',
                                            matchId: m.matchId,
                                            loserId: p,
                                            reason: '',
                                            confirmed: true,
                                          });
                                        }}
                                      >
                                        {p === playerId
                                          ? '本人弃权'
                                          : '记录 ' + name(p) + ' 弃权'}
                                      </button>
                                    ))}
                              </>
                            )}
                          </article>
                        ))}
                    </section>
                  ),
                )}
              </div>
            </details>
            {state.status === 'active' && host && !playing && (
              <div className="tournament-controls">
                {view.availableCount <
                  DUEL_PRESETS[state.preset].minimumCandidates && (
                  <p className="message">
                    可用前奏不足，赛事暂停安排下一场。补充已核验内容，或明确允许跨场重复后重评。
                  </p>
                )}
                <button
                  disabled={busy}
                  onClick={() => void command({ type: 'refresh_pool' })}
                >
                  刷新已核验题库
                </button>
                {!state.allowRepeats && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      setConfirmation({
                        type: 'allow_repeats',
                        confirmed: true,
                      })
                    }
                  >
                    允许跨场重复…
                  </button>
                )}
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    setConfirmation({ type: 'end', confirmed: true })
                  }
                >
                  结束赛事…
                </button>
              </div>
            )}
            {confirmation && (
              <div className="message" role="group" aria-label="赛事决定确认">
                <p>
                  {confirmation.type === 'forfeit'
                    ? '请确认弃权。该决定将直接晋级对手，不产生识曲反馈，并保留处理记录。'
                    : confirmation.type === 'allow_repeats'
                      ? '允许后，选手可能听到之前场次播过的歌。当前未开始的选歌和准备将失效，必须重新评估确认。'
                      : '结束后不再推进本届赛事；需要重新创建才能继续。'}
                </p>
                {confirmation.type === 'forfeit' && (
                  <label>
                    弃权原因
                    <input
                      maxLength={200}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="本人确认 / 组织者处理说明"
                    />
                  </label>
                )}
                <button
                  disabled={
                    busy || (confirmation.type === 'forfeit' && !reason.trim())
                  }
                  onClick={() =>
                    void command(
                      confirmation.type === 'forfeit'
                        ? { ...confirmation, reason }
                        : confirmation,
                    )
                  }
                >
                  确认执行
                </button>
                <button disabled={busy} onClick={() => setConfirmation(null)}>
                  取消
                </button>
              </div>
            )}
            {state.audit.length > 0 && (
              <details>
                <summary>赛事处理记录（{state.audit.length}）</summary>
                {state.audit.map((a, i) => (
                  <p className="small" key={i}>
                    {name(a.actorId)} ·{' '}
                    {a.loserId ? name(a.loserId) + ' 弃权 · ' : ''}
                    {a.reason} · {a.at}
                  </p>
                ))}
              </details>
            )}
          </>
        )}
      </section>
      {view.preparation && view.matchRoom && current && (
        <>
          <p className="message">
            本场共享音箱：{name(view.matchRoom.hostId)}{' '}
            的设备。其他人通过现场音箱听歌。
          </p>
          {participant ? (
            <DuelPanel
              key={current.matchId + ':' + current.attempt}
              room={view.matchRoom}
              playerId={playerId}
              songs={songs}
              view={view.preparation}
              onView={() => {
                void fetch('/api/tournament')
                  .then((r) => r.json())
                  .then((next: TournamentView) => onView(next))
                  .catch(() => setError('同步赛事失败，请刷新'));
              }}
              endpoint="/api/tournament"
              match={{ matchId: current.matchId, attempt: current.attempt }}
              tournament
            />
          ) : (
            <section className="panel">
              <h3>正在旁观</h3>
              <p>
                {current.playerIds.map(name).join(' vs ')} ·{' '}
                {labels[current.status]}
              </p>
              <p>
                {view.preparation.game?.message ?? '等待双方完成选歌与准备'}
              </p>
              <p className="muted">
                本场选手负责操作；旁观者无需开启音频，也不会进入抢牌计分。
              </p>
            </section>
          )}
        </>
      )}
    </>
  );
}
