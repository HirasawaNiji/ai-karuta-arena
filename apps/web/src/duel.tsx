import { useEffect, useRef, useState } from 'react';
import { newActionId } from './platform.js';
import {
  DUEL_PRESETS,
  type DuelPreparationView,
  type DuelPreparationCommand,
  type DuelAction,
  type LobbySnapshot,
  type SongId,
  type Catalog,
} from '@amp/core';
async function api<T>(path: string, data?: unknown): Promise<T> {
  const r = await fetch(
    path,
    data === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        },
  );
  const value = (await r.json()) as T & { error?: string };
  if (!r.ok) throw new Error(value.error ?? '操作失败');
  return value;
}
type Intent = DistributiveOmit<
  DuelPreparationCommand,
  'actionId' | 'expectedVersion'
>;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;
export function DuelPanel({
  room,
  playerId,
  songs,
  view,
  onView,
}: {
  room: LobbySnapshot;
  playerId: string;
  songs: Catalog['songs'];
  view: DuelPreparationView;
  onView: (v: DuelPreparationView) => void;
}) {
  const [selected, setSelected] = useState<SongId[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [clock, setClock] = useState(Date.now());
  const audio = useRef<AudioContext | null>(null),
    source = useRef<AudioBufferSourceNode | null>(null),
    current = useRef(view);
  current.current = view;
  const host = playerId === room.hostId,
    preset = DUEL_PRESETS[view.preset],
    game = view.game;
  useEffect(() => {
    if (!game) return;
    setClock(Date.now());
    const timer = setInterval(() => setClock(Date.now()), 250);
    return () => clearInterval(timer);
  }, [game?.gameSessionId]);
  const done = game?.phase === 'completed' || game?.phase === 'aborted';
  const title = (id: string) => songs.find((s) => s.id === id)?.title ?? id;
  const cardTitle = (id: string) =>
    view.cards.find((c) => c.cardId === id)?.title ?? id;
  async function command(intent: Intent) {
    setBusy(true);
    setError('');
    try {
      onView(
        await api<DuelPreparationView>('/api/duel/prepare', {
          ...intent,
          actionId: newActionId(),
          expectedVersion: current.current.version,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败');
    } finally {
      setBusy(false);
    }
  }
  async function gameAction(
    intent: DistributiveOmit<
      DuelAction,
      'actionId' | 'gameSessionId' | 'selectionVersion' | 'roundToken'
    >,
    snapshot = current.current.game,
  ) {
    if (!snapshot?.round) return;
    try {
      await api('/api/duel/action', {
        ...intent,
        actionId: newActionId(),
        gameSessionId: snapshot.gameSessionId,
        selectionVersion: snapshot.selectionVersion,
        roundToken: snapshot.round.token,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败');
    }
  }
  useEffect(() => {
    setSelected([]);
    setError('');
  }, [view.phase, view.version, view.game?.round?.token]);
  useEffect(() => {
    const interrupt = () => {
      if (!document.hidden) return;
      source.current?.stop();
      source.current = null;
      const v = current.current;
      if (v.game && !['completed', 'aborted'].includes(v.game.phase))
        void api('/api/duel/prepare', {
          type: 'interrupt',
          actionId: newActionId(),
          expectedVersion: v.version,
        }).catch(() => {});
    };
    document.addEventListener('visibilitychange', interrupt);
    return () => {
      document.removeEventListener('visibilitychange', interrupt);
      source.current?.stop();
      source.current = null;
      if (audio.current) audio.current.onstatechange = null;
      void audio.current?.close();
      audio.current = null;
    };
  }, []);
  const token = game?.round?.token,
    phase = game?.phase;
  useEffect(() => {
    if (!host || phase !== 'loading' || !token) return;
    let cancelled = false;
    const snapshot = current.current.game!;
    async function play() {
      try {
        const context = audio.current;
        if (!context || context.state !== 'running' || document.hidden)
          throw new Error('音箱未解锁，请重新准备');
        const response = await fetch(
          '/api/duel/audio/' + encodeURIComponent(token!),
        );
        if (!response.ok) throw new Error('片段加载失败');
        const buffer = await context.decodeAudioData(
          await response.arrayBuffer(),
        );
        if (cancelled) return;
        const node = context.createBufferSource();
        node.buffer = buffer;
        node.connect(context.destination);
        source.current = node;
        node.start();
        await gameAction({ type: 'audio_started' }, snapshot);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '播放失败');
          await gameAction({ type: 'audio_failed' }, snapshot);
        }
      }
    }
    void play();
    return () => {
      cancelled = true;
    };
  }, [host, phase, token]);
  useEffect(() => {
    if (phase && phase !== 'loading' && phase !== 'playing') {
      source.current?.stop();
      source.current = null;
    }
  }, [phase]);
  async function confirm() {
    if (host) {
      try {
        audio.current ??= new AudioContext();
        audio.current.onstatechange = () => {
          const g = current.current.game;
          if (
            g &&
            ['loading', 'playing'].includes(g.phase) &&
            audio.current?.state !== 'running'
          )
            void gameAction({ type: 'audio_failed' }, g);
        };
        await audio.current.resume();
        if (audio.current.state !== 'running')
          throw new Error('浏览器未允许播放，请再点一次');
        const tone = audio.current.createOscillator(),
          volume = audio.current.createGain();
        volume.gain.value = 0.06;
        tone.frequency.value = 660;
        tone.connect(volume);
        volume.connect(audio.current.destination);
        tone.start();
        tone.stop(audio.current.currentTime + 0.15);
      } catch (e) {
        setError(String(e));
        return;
      }
    }
    await command({ type: 'match_ready', cardsLoaded: true, audioReady: host });
  }
  const choosing = view.phase === 'selecting',
    banning = view.phase === 'banning';
  const choices = choosing ? view.ownPool : view.banChoices;
  const count = choosing ? preset.selectPerPlayer : preset.banPerPlayer;
  const submitted = choosing ? view.ownSelection : view.ownBans;
  return (
    <section className="panel duel-panel">
      <div className="section-heading">
        <div>
          <div className="eyebrow">听歌 · 抢牌 · 碰个面</div>
          <h2>
            {game
              ? '听歌抢牌'
              : view.phase === 'idle'
                ? '开启双人听歌局'
                : choosing
                  ? '挑选你的歌牌'
                  : banning
                    ? '给对方出点难题'
                    : '准备好，一起听'}
          </h2>
        </div>
        <span className="pill">
          {preset.handSize} 对 {preset.handSize}
        </span>
      </div>
      <p role="status">{game?.message ?? view.message}</p>
      {error && (
        <p role="alert" className="message error">
          {error}
        </p>
      )}
      {view.phase === 'idle' && (
        <>
          <p className="muted">
            各选 {preset.selectPerPlayer} 首，交换禁掉 {preset.banPerPlayer}{' '}
            首。先清空自己手牌的人获胜，由房主设备共享播放。
          </p>
          <button
            className="primary"
            disabled={
              busy ||
              !host ||
              room.members.length !== 2 ||
              room.members.some((m) => !m.online || !m.lobbyReady) ||
              room.playableCount < preset.minimumCandidates
            }
            onClick={() => void command({ type: 'begin' })}
          >
            {host ? '开始选歌' : '等待房主开始'}
          </button>
          {room.playableCount < preset.minimumCandidates && (
            <p className="message">
              目前已核验 {room.playableCount} 首，需要至少{' '}
              {preset.minimumCandidates} 首前奏题目。
            </p>
          )}
        </>
      )}
      {(choosing || banning) && (
        <>
          <p>
            {submitted
              ? '已提交，等待另一位玩家'
              : '已选 ' + selected.length + ' / ' + count + ' 首'}{' '}
            ·{' '}
            {banning ? '禁掉后对方保留其余歌牌' : '每首歌只会出现在一方候选中'}
          </p>
          <div className="song-grid">
            {choices.map((id) => (
              <button
                className="song-card"
                key={id}
                aria-pressed={(submitted ?? selected).includes(id)}
                disabled={
                  busy ||
                  !!submitted ||
                  (!selected.includes(id) && selected.length === count)
                }
                onClick={() =>
                  setSelected((old) =>
                    old.includes(id)
                      ? old.filter((s) => s !== id)
                      : [...old, id],
                  )
                }
              >
                {title(id)}
              </button>
            ))}
          </div>
          <button
            className="primary"
            disabled={busy || !!submitted || selected.length !== count}
            onClick={() =>
              void command({
                type: choosing ? 'select' : 'ban',
                songIds: selected,
              })
            }
          >
            {submitted ? '等待好友' : choosing ? '确认选歌' : '确认禁歌'}
          </button>
        </>
      )}
      {view.phase === 'confirming' && (
        <>
          <p>
            最终 {view.cards.length}{' '}
            首已重新评估。双方确认看到全部歌牌，房主点击确认时会播放提示音。
          </p>
          {view.assessment?.reasons.map((r, i) => (
            <p className="message" key={i}>
              {'playerId' in r
                ? (room.members.find((m) => m.id === r.playerId)?.nickname ??
                    '玩家') + '：'
                : ''}
              {r.code === 'LOW_CONFIDENCE'
                ? '熟悉度信息不足，可以补充音乐偏好。'
                : r.code === 'LOW_COVERAGE'
                  ? '部分玩家的熟悉歌曲覆盖不足。'
                  : r.code === 'COVERAGE_GAP'
                    ? '双方熟悉覆盖存在差距。'
                    : '本题组存在公平性告警，请确认后继续。'}
            </p>
          ))}
          {host &&
            view.assessment?.validity &&
            !view.assessment.passed &&
            !view.acknowledged && (
              <button
                disabled={busy}
                onClick={() => void command({ type: 'acknowledge' })}
              >
                了解以上差异，继续这一局
              </button>
            )}
          <div className="song-grid">
            {view.cards.map((c) => (
              <div className="song-card" key={c.cardId}>
                {c.title}
              </div>
            ))}
          </div>
          <button disabled={busy} onClick={() => void confirm()}>
            {view.readyPlayerIds.includes(playerId as LobbySnapshot['hostId'])
              ? '重新确认'
              : '歌牌已就绪' + (host ? '，启用共享音箱' : '')}
          </button>
          <p className="muted">已确认 {view.readyPlayerIds.length} / 2 人</p>
          {host && (
            <button
              className="primary"
              disabled={busy || !view.canStart}
              onClick={() => void command({ type: 'start' })}
            >
              开始听歌
            </button>
          )}
        </>
      )}
      {game && (
        <>
          <div className="duel-score">
            {room.members.map((m) => (
              <span key={m.id}>
                {m.nickname} · 剩 {game.hands[m.id]?.length ?? 0} 张
                <small>抢牌得分 {game.scores[m.id] ?? 0}</small>
              </span>
            ))}
          </div>
          {game.round && (
            <p className="muted">
              第 {game.round.number} 段{' '}
              {!done &&
                ' · 剩余 ' +
                  Math.max(0, Math.ceil((game.round.deadline - clock) / 1000)) +
                  ' 秒'}
              {game.round.revealedCardId
                ? ' · 答案：' + cardTitle(game.round.revealedCardId)
                : ''}
            </p>
          )}
          {game.transfer && (
            <p className="message">
              {game.transfer.giverId === playerId
                ? '请点选自己的一张牌交给对方；超时将自动交牌。'
                : '等待对方交来一张牌。'}
            </p>
          )}
          {done ? (
            <div className="duel-result">
              <h3>
                {game.phase === 'aborted'
                  ? '本局已中断'
                  : game.winnerId
                    ? (room.members.find((m) => m.id === game.winnerId)
                        ?.nickname ?? '玩家') + ' 清空手牌，获胜！'
                    : '本局平局'}
              </h3>
              <p>
                {game.phase === 'aborted'
                  ? '本局不计正式胜负，也不会更新识曲反馈。'
                  : game.outcome === 'exhausted'
                    ? '题目已播完，双方仍有手牌。可以重新选歌再来一局。'
                    : '明确作答的结果已用于更新音乐画像。'}
              </p>
            </div>
          ) : (
            Object.entries(game.hands)
              .sort(
                ([a], [b]) => Number(a === playerId) - Number(b === playerId),
              )
              .map(([owner, cards]) => (
                <section className="hand" key={owner}>
                  <h3>{owner === playerId ? '你的歌牌' : '对方的歌牌'}</h3>
                  <div className="song-grid">
                    {cards.map((card) => (
                      <button
                        className="song-card"
                        key={card}
                        disabled={
                          game.phase !== 'playing' &&
                          !(
                            game.phase === 'transfer' &&
                            game.transfer?.giverId === playerId &&
                            owner === playerId
                          )
                        }
                        onClick={() =>
                          void gameAction({
                            type:
                              game.phase === 'transfer' ? 'transfer' : 'claim',
                            cardId: card,
                          })
                        }
                      >
                        {cardTitle(card)}
                      </button>
                    ))}
                  </div>
                </section>
              ))
          )}
          {!done && (
            <button
              className="text-button"
              onClick={() => void command({ type: 'interrupt' })}
            >
              中断本局
            </button>
          )}
        </>
      )}
      {host && view.phase !== 'idle' && (!game || done) && (
        <button
          className="text-button"
          disabled={busy}
          onClick={() => void command({ type: 'reset' })}
        >
          {done ? '再来一局' : '重新选歌'}
        </button>
      )}
    </section>
  );
}
