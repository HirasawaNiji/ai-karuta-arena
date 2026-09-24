import { useEffect, useRef, useState } from 'react';
import { newActionId } from './platform.js';
import {
  MULTIPLAYER_RULES,
  type MultiplayerPreparationView,
  type MultiplayerPreparationCommand,
  type MultiplayerAction,
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
  MultiplayerPreparationCommand,
  'actionId' | 'expectedVersion'
>;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;
export function MultiplayerPanel({
  room,
  playerId,
  songs,
  view,
  onView,
}: {
  room: LobbySnapshot;
  playerId: string;
  songs: Catalog['songs'];
  view: MultiplayerPreparationView;
  onView: (v: MultiplayerPreparationView) => void;
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
        await api<MultiplayerPreparationView>('/api/multiplayer/prepare', {
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
      MultiplayerAction,
      'actionId' | 'gameSessionId' | 'selectionVersion' | 'roundToken'
    >,
    snapshot = current.current.game,
  ) {
    if (!snapshot?.round) return;
    try {
      await api('/api/multiplayer/action', {
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
        void api('/api/multiplayer/prepare', {
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
          '/api/multiplayer/audio/' + encodeURIComponent(token!),
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
  const participant = view.playerIds.includes(
    playerId as LobbySnapshot['hostId'],
  );
  const nickname = (id: string) =>
    room.members.find((m) => m.id === id)?.nickname ?? '玩家';
  return (
    <section
      className={
        'panel duel-panel multiplayer-panel' +
        (game && !done ? ' multiplayer-active' : '')
      }
    >
      <div className="section-heading">
        <h2>
          {game
            ? '一起听，抢歌牌'
            : view.phase === 'banning'
              ? '挑掉一首，留住好心情'
              : '好友同场听歌局'}
        </h2>
        <span className="pill">
          多人 · {MULTIPLAYER_RULES.questionCount} 题
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
          <p>
            2–8
            人同场，由房主音箱播放。首个抢对者收下一分，错抢后等下一题；同分并列。
          </p>
          <button
            className="primary"
            disabled={
              busy ||
              !host ||
              room.members.length < 2 ||
              room.members.some((m) => !m.online || !m.lobbyReady) ||
              room.playableCount < MULTIPLAYER_RULES.questionCount
            }
            onClick={() => void command({ type: 'begin' })}
          >
            {host ? '生成多人题组' : '等待房主选曲'}
          </button>
        </>
      )}
      {view.phase === 'banning' && (
        <>
          <p>每人可以禁一首，也可以直接跳过。系统会补齐并重新评估。</p>
          <div className="song-grid">
            {view.proposedSongIds.map((id) => (
              <button
                key={id}
                className="song-card"
                aria-pressed={(view.ownBans ?? selected).includes(id)}
                disabled={busy || !!view.ownBans || !participant}
                onClick={() =>
                  setSelected((old) => (old.includes(id) ? [] : [id]))
                }
              >
                {title(id)}
              </button>
            ))}
          </div>
          <button
            className="primary"
            disabled={busy || !!view.ownBans || !participant}
            onClick={() => void command({ type: 'ban', songIds: selected })}
          >
            {view.ownBans
              ? '已提交，等其他人'
              : selected.length
                ? '确认禁歌'
                : '不禁歌，继续'}
          </button>
          <p className="muted">
            已提交 {view.banComplete.length} / {view.playerIds.length} 人
          </p>
        </>
      )}
      {view.phase === 'confirming' && (
        <>
          <p>最终 {view.cards.length} 首已按全员画像重新评估。</p>
          {view.assessment?.reasons.map((r, i) => (
            <p className="message" key={i}>
              {'playerId' in r ? nickname(r.playerId) + '：' : ''}
              {r.code === 'LOW_CONFIDENCE'
                ? '熟悉度信息不足'
                : r.code === 'LOW_COVERAGE'
                  ? '熟悉歌曲覆盖不足'
                  : r.code === 'SHORT_PLAYLIST'
                    ? '可玩歌曲不足，请补充素材或重新禁歌'
                    : '题组存在公平性差异'}
            </p>
          ))}
          {host &&
            !view.acknowledged &&
            view.assessment?.validity &&
            !view.assessment.passed &&
            view.cards.length === MULTIPLAYER_RULES.questionCount && (
              <button
                onClick={() => void command({ type: 'acknowledge' })}
                disabled={busy}
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
          <button
            disabled={busy || !participant}
            onClick={() => void confirm()}
          >
            {view.readyPlayerIds.includes(playerId as LobbySnapshot['hostId'])
              ? '重新确认'
              : '歌牌已就绪' + (host ? '，启用共享音箱' : '')}
          </button>
          <p>
            已确认 {view.readyPlayerIds.length} / {view.playerIds.length} 人
          </p>
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
          {!participant && (
            <p className="message">你正在旁观，下一局再一起抢牌。</p>
          )}
          <div className="duel-score">
            {game.standings.map((s) => (
              <span key={s.playerId}>
                {nickname(s.playerId)}
                <small>{s.score} 张歌牌</small>
              </span>
            ))}
          </div>
          {game.round && (
            <p className="muted">
              第 {game.round.number} / {MULTIPLAYER_RULES.questionCount} 段
              {!done
                ? ' · 剩余 ' +
                  Math.max(0, Math.ceil((game.round.deadline - clock) / 1000)) +
                  ' 秒'
                : ''}
              {game.round.revealedCardId
                ? ' · 答案：' + cardTitle(game.round.revealedCardId)
                : ''}
            </p>
          )}
          {done ? (
            <div className="duel-result">
              <h3>
                {game.phase === 'aborted'
                  ? '本局已中断'
                  : '这一场，我们的音乐默契'}
              </h3>
              {game.phase === 'aborted' ? (
                <p>本局不计正式排名，也不会更新识曲反馈。</p>
              ) : (
                <>
                  <ol>
                    {game.standings.map((s) => (
                      <li key={s.playerId} value={s.rank}>
                        {nickname(s.playerId)} · {s.score} 张
                      </li>
                    ))}
                  </ol>
                  <p>同分并列；明确作答的结果已更新音乐画像。</p>
                </>
              )}
            </div>
          ) : (
            <>
              {game.lockedPlayerIds.includes(
                playerId as LobbySnapshot['hostId'],
              ) && <p className="message">这次没猜中，下一题再试。</p>}
              <div className="song-grid">
                {game.remainingCards.map((card) => (
                  <button
                    key={card}
                    className="song-card"
                    disabled={
                      !participant ||
                      game.phase !== 'playing' ||
                      game.lockedPlayerIds.includes(
                        playerId as LobbySnapshot['hostId'],
                      )
                    }
                    onClick={() =>
                      void gameAction({ type: 'claim', cardId: card })
                    }
                  >
                    {cardTitle(card)}
                  </button>
                ))}
              </div>
              {participant && (
                <button
                  className="text-button"
                  onClick={() => void command({ type: 'interrupt' })}
                >
                  中断本局
                </button>
              )}
            </>
          )}
        </>
      )}
      {host && view.phase !== 'idle' && (!game || done) && (
        <button
          className="text-button"
          disabled={busy}
          onClick={() => void command({ type: 'reset' })}
        >
          {done ? '再来一局' : '重新选曲'}
        </button>
      )}
    </section>
  );
}
