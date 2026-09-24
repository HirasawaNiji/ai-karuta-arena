import { useEffect, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import {
  DUEL_PRESETS,
  ManualPreferencesSchema,
  type Catalog,
  type DuelPreparationView,
  type MultiplayerPreparationView,
  type TournamentView,
  MULTIPLAYER_RULES,
  type LobbySnapshot,
  type LobbySelf,
  type LobbyCommand,
  type ManualPreferences,
} from '@amp/core';
import { DuelPanel } from './duel.js';
import { MultiplayerPanel } from './multiplayer.js';
import { TournamentPanel } from './tournament.js';
import { platform } from './platform.js';
import './style.css';

type Entry = { playerId: string; room: LobbySnapshot };
type Library = Pick<Catalog, 'songs' | 'artists'> & {
  tags: Catalog['taxonomy'];
  playableSongIds: readonly string[];
};
type Preview = {
  id: string;
  title: string;
  artist: string;
  durationMs: number;
  available: boolean;
  sha256: string;
  status: 'pending' | 'verified';
};
async function api<T>(path: string, data?: unknown): Promise<T> {
  const response = await fetch(
    path,
    data === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        },
  );
  const value: unknown = await response.json();
  if (!response.ok)
    throw new Error(
      value && typeof value === 'object' && 'error' in value
        ? String(value.error)
        : '连接失败，请重试',
    );
  return value as T;
}
const levels = {
  heard: '听过',
  familiar: '熟悉',
  intro: '前奏就能认出',
} as const;
function App() {
  const [tournament, setTournament] = useState<TournamentView | null>(null);
  const [multi, setMulti] = useState<MultiplayerPreparationView | null>(null);
  const [duel, setDuel] = useState<DuelPreparationView | null>(null);
  const [entry, setEntry] = useState<Entry | null>(null);
  const [library, setLibrary] = useState<Library | null>(null);
  const [nickname, setNickname] = useState('');
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [screen, setScreen] = useState<'profile' | 'lobby' | 'review' | 'duel'>(
    'profile',
  );
  const [tags, setTags] = useState<string[]>([]);
  const [reports, setReports] = useState<ManualPreferences['reports']>([]);
  const [self, setSelf] = useState<LobbySelf | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [materials, setMaterials] = useState<Preview[]>([]);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [activeAudio, setActiveAudio] = useState<string | null>(null);
  async function loadProfile() {
    const data = await api<LobbySelf>('/api/profile');
    setSelf(data);
    setTags(
      Object.values(data.profile.preferences).flatMap((v) => Object.keys(v)),
    );
    setReports(
      Object.values(data.profile.songEvidence)
        .flat()
        .filter((e) => e.type === 'recognition_report')
        .map((e) => ({
          songId: e.songId,
          recognitionLevel: e.recognitionLevel,
          ...(e.recognitionScope
            ? { recognitionScope: e.recognitionScope }
            : {}),
        })),
    );
  }
  useEffect(() => {
    void api<Library>('/api/catalog')
      .then(setLibrary)
      .catch((e) => setError(String(e)));
    void api<Entry | null>('/api/session')
      .then((data) => {
        if (!data) return;
        setEntry(data);
        setScreen('lobby');
        return loadProfile();
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
    const pause = () => {
      if (document.hidden) {
        platform.pauseAudio();
        setNotice('页面离开前台，试听已暂停。返回后请手动播放。');
      }
    };
    document.addEventListener('visibilitychange', pause);
    return () => document.removeEventListener('visibilitychange', pause);
  }, []);
  const roomId = entry?.room.roomId;
  useEffect(() => {
    if (!roomId) return;
    const events = new EventSource('/api/events');
    void api<TournamentView>('/api/tournament')
      .then(setTournament)
      .catch(() => {});
    events.addEventListener('tournament', (event) =>
      setTournament(
        JSON.parse((event as MessageEvent<string>).data) as TournamentView,
      ),
    );
    void api<MultiplayerPreparationView>('/api/multiplayer')
      .then(setMulti)
      .catch(() => {});
    events.addEventListener('multiplayer', (event) =>
      setMulti(
        JSON.parse(
          (event as MessageEvent<string>).data,
        ) as MultiplayerPreparationView,
      ),
    );
    void api<DuelPreparationView>('/api/duel')
      .then(setDuel)
      .catch(() => {});
    events.addEventListener('duel', (event) =>
      setDuel(
        JSON.parse((event as MessageEvent<string>).data) as DuelPreparationView,
      ),
    );
    events.addEventListener('heartbeat', (event) => {
      const challenge = JSON.parse((event as MessageEvent<string>).data) as {
        token: string;
      };
      void api('/api/heartbeat', {
        token: challenge.token,
        visible: !document.hidden,
      }).catch(() => {});
    });
    events.onopen = () => setConnected(true);
    events.onerror = () => {
      setConnected(false);
      setNotice('连接中断，准备已失效；恢复后请重新准备。');
      void api<Entry | null>('/api/session')
        .then((session) => {
          if (!session) {
            events.close();
            setEntry(null);
            setNotice('房间已过期或服务已重启，请重新创建或加入。');
          }
        })
        .catch(() => {});
    };
    events.onmessage = (e: MessageEvent<string>) => {
      const room = JSON.parse(e.data) as LobbySnapshot;
      setEntry((old) => (old ? { ...old, room } : null));
    };
    events.addEventListener('ended', () => {
      events.close();
      setEntry(null);
      setDuel(null);
      setMulti(null);
      setTournament(null);
      setNotice('房间已结束或已退出。');
    });
    return () => {
      events.close();
      setConnected(false);
    };
  }, [roomId]);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败');
    } finally {
      setBusy(false);
    }
  }
  async function enter(e: FormEvent) {
    e.preventDefault();
    await action(async () => {
      const data = await api<Entry>(
        mode === 'create'
          ? '/api/rooms'
          : '/api/rooms/' + code.trim().toUpperCase() + '/join',
        { nickname },
      );
      setEntry(data);
      await loadProfile();
      setScreen('profile');
    });
  }
  async function command(cmd: LobbyCommand) {
    const room = await api<LobbySnapshot>('/api/commands', cmd);
    setEntry((old) => (old ? { ...old, room } : null));
  }
  const room = entry?.room;
  const me = room?.members.find((m) => m.id === entry?.playerId);
  const host = room?.hostId === entry?.playerId;
  const preset = DUEL_PRESETS[room?.preset ?? 'quick'];
  const shownSongs =
    library?.songs
      .filter((s) => s.title.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 30) ?? [];
  function setReport(
    songId: ManualPreferences['reports'][number]['songId'],
    level: string,
  ) {
    setReports((old) => [
      ...old.filter((r) => r.songId !== songId),
      ...(level
        ? [{ songId, recognitionLevel: level as keyof typeof levels }]
        : []),
    ]);
  }
  async function saveProfile(skip = false) {
    await action(async () => {
      await command({
        type: 'profile',
        preferences: skip
          ? { tagIds: [], reports: [] }
          : ManualPreferencesSchema.parse({ tagIds: tags, reports }),
      });
      await loadProfile();
      setScreen('lobby');
      setNotice(
        skip
          ? '已跳过画像，熟悉度保持信息不足；仍需手动准备。'
          : '音乐偏好已保存，请在大厅确认准备。',
      );
    });
  }
  async function openReview() {
    await action(async () => {
      setMaterials(await api<Preview[]>('/api/materials'));
      setScreen('review');
      setQuery('');
    });
  }
  function exportNotes() {
    const data = {
      schemaVersion: 'semantic-review-draft-v1',
      reviewedAt: new Date().toISOString(),
      status: 'draft',
      records: materials
        .filter((m) => reviewNotes[m.id]?.trim())
        .map((m) => ({
          id: m.id,
          audioSha256: m.sha256,
          notes: reviewNotes[m.id],
          semanticReview: 'pending',
        })),
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'material-review-draft.json';
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="音乐碰个面首页">
          <span className="brand-mark">♪</span> 音乐碰个面
        </a>
        <span className="pill">{platform.label}</span>
      </header>
      <main>
        <div role="alert" className={error ? 'message error' : 'hidden'}>
          {error}
        </div>
        <div role="status" className={notice ? 'message' : 'hidden'}>
          {notice}
        </div>
        {!loaded ? (
          <p>正在连接派对…</p>
        ) : !room ? (
          <div className="landing">
            <section className="hero">
              <div className="eyebrow">MUSIC BRINGS US TOGETHER</div>
              <h1>
                让熟悉的旋律，
                <br />
                成为相聚的理由。
              </h1>
              <p>
                选几首你爱的歌，邀请朋友，
                <br />
                一起发现彼此的音乐世界。
              </p>
              <div className="record-art" aria-hidden="true">
                <div className="vinyl">
                  <span>♪</span>
                </div>
                <div className="float-note">你的歌，也是我们的默契</div>
              </div>
              <div className="hero-facts">
                <span>
                  10 张起步
                  <br />
                  <small>轻量快速局</small>
                </span>
                <span>
                  面对面
                  <br />
                  <small>共享音箱体验</small>
                </span>
                <span>
                  随心选择
                  <br />
                  <small>无需平台授权</small>
                </span>
              </div>
            </section>
            <section className="panel entry">
              <div className="eyebrow">开始一次音乐相遇</div>
              <h2>把朋友叫上吧</h2>
              <div className="segmented">
                <button
                  aria-pressed={mode === 'create'}
                  onClick={() => setMode('create')}
                >
                  创建派对
                </button>
                <button
                  aria-pressed={mode === 'join'}
                  onClick={() => setMode('join')}
                >
                  加入好友
                </button>
              </div>
              <form onSubmit={(e) => void enter(e)}>
                <label>
                  派对昵称
                  <input
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    maxLength={24}
                    required
                    placeholder="朋友怎么称呼你？"
                    autoComplete="nickname"
                  />
                </label>
                {mode === 'join' && (
                  <label>
                    好友房间码
                    <input
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      required
                      pattern="[A-Fa-f0-9]{6}"
                      maxLength={6}
                      placeholder="输入 6 位房间码"
                    />
                  </label>
                )}
                <button className="primary full" disabled={busy || !library}>
                  {busy
                    ? '正在入场…'
                    : mode === 'create'
                      ? '创建音乐派对 →'
                      : '加入好友房间 →'}
                </button>
              </form>
              <p className="muted small">
                建立音乐偏好，与好友选歌、禁歌，开启双人或多人听歌局。
              </p>
              <div className="platform-note">
                QQ 音乐场景原型 ·
                官方登录、曲库和分享尚未接入。使用手动偏好即可体验。
              </div>
            </section>
          </div>
        ) : (
          <>
            <div className="room-heading">
              <div>
                <div className="eyebrow">
                  好友音乐派对 · {connected ? '实时连接' : '正在重连'}
                </div>
                <h1>
                  {screen === 'profile'
                    ? '先聊聊你的音乐喜好'
                    : screen === 'review'
                      ? '素材试听与核验'
                      : '人到齐，默契就开场'}
                </h1>
                <p className="muted">
                  房间 <strong>{room.roomId}</strong> · {room.members.length} /
                  8 人 ·{' '}
                  {room.mode === 'multiplayer'
                    ? '多人 · 12 题'
                    : preset.handSize + ' 对 ' + preset.handSize}
                </p>
              </div>
              <button
                onClick={() =>
                  void action(async () => {
                    await platform.copyRoom(room.roomId);
                    setNotice('房间码已复制，请发给朋友。');
                  })
                }
              >
                复制房间码
              </button>
            </div>
            <nav className="steps" aria-label="派对进度">
              <button
                disabled={[
                  duel?.game,
                  multi?.game,
                  tournament?.preparation?.game,
                ].some((g) => g && !['completed', 'aborted'].includes(g.phase))}
                aria-current={screen === 'profile' ? 'step' : undefined}
                onClick={() => {
                  platform.pauseAudio();
                  setScreen('profile');
                }}
              >
                01 音乐偏好
              </button>
              <button
                disabled={[
                  duel?.game,
                  multi?.game,
                  tournament?.preparation?.game,
                ].some((g) => g && !['completed', 'aborted'].includes(g.phase))}
                aria-current={screen === 'lobby' ? 'step' : undefined}
                onClick={() => {
                  platform.pauseAudio();
                  setScreen('lobby');
                }}
              >
                02 好友大厅
              </button>
              <button
                aria-current={screen === 'duel' ? 'step' : undefined}
                onClick={() => setScreen('duel')}
              >
                03 听歌抢牌
              </button>
            </nav>
            {screen === 'duel' ? (
              room.mode === 'tournament' ? (
                tournament && entry && library ? (
                  <TournamentPanel
                    room={room}
                    playerId={entry.playerId as LobbySnapshot['hostId']}
                    songs={library.songs}
                    view={tournament}
                    onView={setTournament}
                  />
                ) : (
                  <p>正在加载赛程…</p>
                )
              ) : room.mode === 'multiplayer' ? (
                multi && entry && library ? (
                  <MultiplayerPanel
                    room={room}
                    playerId={entry.playerId}
                    songs={library.songs}
                    view={multi}
                    onView={setMulti}
                  />
                ) : (
                  <p>正在加载多人对局…</p>
                )
              ) : duel && entry && library ? (
                <DuelPanel
                  room={room}
                  playerId={entry.playerId}
                  songs={library.songs}
                  view={duel}
                  onView={setDuel}
                />
              ) : (
                <p>正在加载对局…</p>
              )
            ) : screen === 'profile' ? (
              <div className="content-grid">
                <section className="panel">
                  <div className="section-title">
                    <h2>你最近爱听什么？</h2>
                    <span className="muted small">可跳过</span>
                  </div>
                  <p className="muted">
                    选择偏好只帮助了解你，不会当作你认识每一首歌。
                  </p>
                  <div className="tag-list">
                    {library?.tags.map((t) => (
                      <button
                        key={t.id}
                        aria-pressed={tags.includes(t.id)}
                        onClick={() =>
                          setTags((old) =>
                            old.includes(t.id)
                              ? old.filter((id) => id !== t.id)
                              : [...old, t.id],
                          )
                        }
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <h2>挑几首熟悉的歌</h2>
                  <p className="muted small">
                    推荐 3–5
                    首。未指定录音的“前奏就能认出”按歌曲级熟悉处理；对局只使用已核验的前奏题目。
                  </p>
                  <label className="search">
                    搜索歌曲
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="输入歌名"
                    />
                  </label>
                  <div className="song-list">
                    {shownSongs.map((s, i) => (
                      <div className="song-row" key={s.id}>
                        <span className="song-number">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <div className="song-info">
                          <strong>{s.title}</strong>
                          <small>
                            {
                              library?.artists.find(
                                (a) => a.id === s.artistIds[0],
                              )?.name
                            }{' '}
                            ·{' '}
                            {library?.playableSongIds.includes(s.id)
                              ? '已核验前奏'
                              : '待核验'}
                          </small>
                        </div>
                        <label className="level">
                          <span className="sr-only">{s.title}熟悉度</span>
                          <select
                            value={
                              reports.find((r) => r.songId === s.id)
                                ?.recognitionLevel ?? ''
                            }
                            onChange={(e) => setReport(s.id, e.target.value)}
                          >
                            <option value="">未填写</option>
                            {Object.entries(levels).map(([key, label]) => (
                              <option key={key} value={key}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    ))}
                    {!shownSongs.length && (
                      <p className="muted">没有找到这首歌，换个关键词试试。</p>
                    )}
                  </div>
                </section>
                <aside>
                  <div className="panel profile-summary">
                    <span className="eyebrow">YOUR MUSIC DNA</span>
                    <h2>
                      每一种喜好
                      <br />
                      都值得被听见。
                    </h2>
                    <div className="stat-pair">
                      <span>
                        <b>{tags.length}</b> 个偏好
                      </span>
                      <span>
                        <b>{reports.length}</b> 首自报
                      </span>
                    </div>
                    <p className="muted">
                      自报用于选曲参考，不是识别成绩。保存后会更新画像并清空旧准备。
                    </p>
                    <button
                      className="primary full"
                      disabled={busy || !connected}
                      onClick={() => void saveProfile()}
                    >
                      保存偏好，进入大厅
                    </button>
                    <button
                      className="text-button full"
                      disabled={busy || !connected}
                      onClick={() => void saveProfile(true)}
                    >
                      暂时跳过，保留未知
                    </button>
                  </div>
                </aside>
              </div>
            ) : screen === 'lobby' ? (
              <div className="content-grid">
                <section>
                  <div className="panel">
                    <div className="section-title">
                      <h2>这一场，和谁一起听</h2>
                      <span className="pill">
                        {room.mode === 'multiplayer'
                          ? '多人同场'
                          : room.mode === 'tournament' ? '好友淘汰赛' : '1v1 预评估'}
                      </span>
                    </div>
                    <div className="members">
                      {room.members.map((m, i) => (
                        <div className="member" key={m.id}>
                          <div className="avatar">{m.nickname.slice(0, 1)}</div>
                          <div className="song-info">
                            <strong>
                              {m.nickname}
                              {m.id === entry?.playerId ? '（你）' : ''}
                            </strong>
                            <small>
                              {m.id === room.hostId ? '房主' : '好友'} ·{' '}
                              {m.online ? '在线' : '已离线'}
                            </small>
                          </div>
                          <span className={m.lobbyReady ? 'ready' : 'muted'}>
                            {m.waitingForNextMatch
                              ? '下一局加入'
                              : m.lobbyReady
                                ? '已准备'
                                : '未准备'}
                          </span>
                          <span className="sr-only">成员 {i + 1}</span>
                        </div>
                      ))}
                    </div>
                    <button
                      className={me?.lobbyReady ? 'full' : 'primary full'}
                      disabled={busy || !connected || me?.waitingForNextMatch}
                      onClick={() =>
                        void action(async () =>
                          command({ type: 'ready', ready: !me?.lobbyReady }),
                        )
                      }
                    >
                      {me?.waitingForNextMatch
                        ? '等待下一局'
                        : me?.lobbyReady
                          ? '取消准备'
                          : '我已完成入场，准备好了'}
                    </button>
                    <p className="muted small">
                      入场准备不代表最终开局确认；人员、偏好或规则变化后需要重新准备。
                    </p>
                  </div>
                  <div className="panel">
                    <h2>选曲前，先听听大家的偏好</h2>
                    <div className="assessment-stats">
                      <div>
                        <b>{room.playableCount}</b>
                        <span>已核验可玩</span>
                      </div>
                      <div>
                        <b>{room.pendingCount}</b>
                        <span>待核验歌曲</span>
                      </div>
                      <div>
                        <b>
                          {room.mode === 'multiplayer'
                            ? MULTIPLAYER_RULES.questionCount
                            : preset.minimumCandidates}
                        </b>
                        <span>本局最少候选</span>
                      </div>
                    </div>
                    <p className="message">{room.startBlocker}</p>
                    {room.assessment && (
                      <div>
                        <h3>选曲预评估</h3>
                        <p>
                          已选 {room.assessment.actualCount} /{' '}
                          {room.assessment.requestedCount} 首 ·{' '}
                          {room.assessment.passed
                            ? '预评估通过'
                            : '需要补充或调整'}
                        </p>
                        <ul>
                          {room.assessment.reasons.map((reason, i) => (
                            <li key={i}>
                              {reason.code === 'SHORT_PLAYLIST'
                                ? '曲目不足：补充已核验素材后重新评估。'
                                : reason.code === 'EMPTY_PLAYLIST'
                                  ? '当前没有可选的已核验题目。'
                                  : reason.code === 'LOW_CONFIDENCE'
                                    ? '玩家熟悉度信息不足。'
                                    : reason.code === 'LOW_COVERAGE'
                                      ? '部分玩家的熟悉歌曲覆盖不足。'
                                      : '双方覆盖存在差距，请调整候选曲库。'}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <button
                      disabled={
                        busy ||
                        !connected ||
                        !host ||
                        room.mode !== 'duel' ||
                        room.members.length !== 2 ||
                        room.members.some((m) => !m.online || !m.lobbyReady)
                      }
                      onClick={() =>
                        void action(async () => command({ type: 'assess' }))
                      }
                    >
                      {host ? '生成选曲预评估' : '等待房主生成预评估'}
                    </button>
                  </div>
                </section>
                <aside>
                  <section className="panel">
                    <h2>这一局怎么听</h2>
                    <div className="preset-list">
                      {(['duel', 'multiplayer', 'tournament'] as const).map(
                        (mode) => (
                          <button
                            key={mode}
                            disabled={!host || busy || !connected}
                            aria-pressed={room.mode === mode}
                            onClick={() =>
                              void action(async () =>
                                command({ type: 'mode', mode }),
                              )
                            }
                          >
                            <strong>
                              {mode === 'duel'
                                ? '双人经典抢牌'
                                : mode === 'multiplayer'
                                  ? '多人同场抢牌'
                                  : '好友单淘汰赛'}
                            </strong>
                            <small>
                              {mode === 'duel'
                                ? '先清空手牌获胜'
                                : mode === 'multiplayer'
                                  ? '2–8 人 · 12 题 · 同分并列'
                                  : '4 / 8 人 · 半决赛到冠军'}
                            </small>
                          </button>
                        ),
                      )}
                    </div>
                    <div className="preset-list">
                      {room.mode !== 'multiplayer' &&
                        Object.entries(DUEL_PRESETS).map(([id, p]) => (
                          <button
                            key={id}
                            disabled={!host || busy || !connected}
                            aria-pressed={room.preset === id}
                            onClick={() =>
                              void action(async () =>
                                command({
                                  type: 'preset',
                                  preset: id as LobbySnapshot['preset'],
                                }),
                              )
                            }
                          >
                            <strong>
                              {p.label} · {p.handSize} 对 {p.handSize}
                            </strong>
                            <small>
                              每人选 {p.selectPerPlayer} · BAN {p.banPerPlayer}{' '}
                              · 不追加空牌
                            </small>
                          </button>
                        ))}
                    </div>
                    <p className="muted small">
                      默认同一现场共享音箱。禁歌后重新评估，全员确认最终歌牌再开始。
                    </p>
                    <h3>我的音乐画像</h3>
                    <p>{self ? reports.length + ' 首歌曲自报' : '正在加载'}</p>
                    {reports.slice(0, 3).map((r) => (
                      <p className="score-line" key={r.songId}>
                        <span>
                          {library?.songs.find((s) => s.id === r.songId)?.title}
                        </span>
                        <b>
                          {self?.estimates[r.songId]?.familiarityScore.toFixed(
                            2,
                          ) ?? '—'}
                        </b>
                      </p>
                    ))}
                    <small className="muted">试验评分，不是识别概率。</small>
                    <button
                      className="text-button full"
                      onClick={() => setScreen('profile')}
                    >
                      修改音乐偏好
                    </button>
                  </section>
                  {host && (
                    <button
                      className="text-button full"
                      onClick={() => void openReview()}
                    >
                      房主工具 · 素材试听核验
                    </button>
                  )}
                  <button
                    className="text-button full"
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        await command({ type: 'leave' });
                        setEntry(null);
                        platform.pauseAudio();
                      })
                    }
                  >
                    {host ? '结束并离开房间' : '离开房间'}
                  </button>
                </aside>
              </div>
            ) : (
              <section className="panel">
                <div className="section-title">
                  <h2>先试听，再记录核验依据</h2>
                  <button
                    onClick={exportNotes}
                    disabled={!Object.values(reviewNotes).some((n) => n.trim())}
                  >
                    导出核验草稿
                  </button>
                </div>
                <p className="muted">
                  确认艺人、录音版本、片段起点、前奏语义和歌名映射。试听或填写笔记不会自动把素材变为可玩。草稿仅保存在当前页面，离开前请导出。
                </p>
                <label>
                  搜索素材
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="输入歌名或编号"
                  />
                </label>
                {materials
                  .filter((m) =>
                    (m.title + m.id)
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                  )
                  .slice(0, 20)
                  .map((m) => (
                    <article className="review-row" key={m.id}>
                      <h3>{m.title}</h3>
                      <p className="muted small">
                        {m.id} · {m.artist} · {(m.durationMs / 1000).toFixed(1)}{' '}
                        秒 · {m.status === 'verified' ? '已核验前奏' : '待核验'}
                      </p>
                      {m.available ? (
                        <>
                          <button
                            onClick={() => {
                              platform.pauseAudio();
                              setActiveAudio(m.id);
                              setNotice(
                                '请点击播放器播放；返回前台后需重新点击。',
                              );
                            }}
                          >
                            载入试听
                          </button>
                          {activeAudio === m.id && (
                            <audio
                              controls
                              preload="metadata"
                              src={'/api/materials/' + m.id + '/audio'}
                              onError={() =>
                                setError('试听加载失败，请检查本地素材。')
                              }
                            />
                          )}
                        </>
                      ) : (
                        <p className="muted">本地音频未安装或校验未通过。</p>
                      )}
                      <label>
                        核验笔记：{m.title}
                        <textarea
                          value={reviewNotes[m.id] ?? ''}
                          maxLength={2000}
                          onChange={(e) =>
                            setReviewNotes((old) => ({
                              ...old,
                              [m.id]: e.target.value,
                            }))
                          }
                          placeholder="艺人 / 版本 / 片段起点 / 前奏与歌名是否匹配 / 核验来源"
                        />
                      </label>
                    </article>
                  ))}
              </section>
            )}
          </>
        )}
      </main>
      <footer>音乐让我们相遇 · 手动画像体验 · 官方 QQ 音乐能力待接入</footer>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
