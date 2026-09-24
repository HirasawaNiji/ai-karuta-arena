import {
  CatalogSchema,
  RawUserMusicDataSchema,
  type GameEvent,
  type DuelResult,
  type GameResult,
  MULTIPLAYER_RULES,
  GameTypeSchema,
  PlayerIdSchema,
  LobbyEntrySchema,
  LobbyCommandSchema,
  emptyPreferences,
  DUEL_PRESETS,
  type Catalog,
  type PlayerId,
  type PlayerMusicProfile,
  type RawUserMusicData,
  type ManualPreferences,
  type LobbyCommand,
  type LobbySnapshot,
  type LobbySelf,
  type Question,
} from '@amp/core';
import {
  gameplayEvidence,
  buildPlayerProfile,
  buildFamiliarityMatrix,
  MANUAL_SCORING_CONFIG,
} from '@amp/music-profile';
import {
  selectPlaylist,
  assessPlaylist,
  DEFAULT_SELECTION_CONFIG,
  DEFAULT_FAIRNESS_CONFIG,
} from '@amp/playlist-engine';

export interface LobbyPreparationContext {
  readonly room: LobbySnapshot;
  readonly catalog: Catalog;
  readonly profiles: readonly PlayerMusicProfile[];
  readonly questions: Readonly<Record<string, Question>>;
}
export interface LobbyDependencies {
  readonly catalog: Catalog;
  /** Only semantically reviewed questions; decoding audio alone cannot populate this list. */
  readonly verifiedQuestionIds: readonly string[];
  readonly submitProfile: (
    playerId: PlayerId,
    input: ManualPreferences,
    catalog: Catalog,
    at: string,
  ) => RawUserMusicData;
  readonly now: () => string;
}
export function createLobby(
  roomId: string,
  hostId: PlayerId,
  nickname: string,
  deps: LobbyDependencies,
) {
  const base = CatalogSchema.parse({ ...deps.catalog, players: [] });
  type Member = {
    id: PlayerId;
    nickname: string;
    online: boolean;
    lobbyReady: boolean;
    waitingForNextMatch: boolean;
    profile: PlayerMusicProfile;
    raw: RawUserMusicData;
    feedback: RawUserMusicData[];
  };
  const members = new Map<PlayerId, Member>();
  let preset: LobbySnapshot['preset'] = 'quick';
  let mode: LobbySnapshot['mode'] = 'duel';
  let revision = 0;
  let assessment: LobbySnapshot['assessment'] = null;
  let selectedSongIds: LobbySnapshot['selectedSongIds'] = [];
  const questions: Record<string, Question> = {};
  for (const q of base.questions) {
    const recording = base.recordings.find(
      (r) => r.recordingId === q.recordingId,
    );
    const asset = base.audioAssets.find(
      (a) => a.assetId === recording?.audioAssetId,
    );
    if (
      deps.verifiedQuestionIds.includes(q.questionId) &&
      asset?.available &&
      asset.usage.status === 'verified' &&
      q.segmentKind === 'intro' &&
      !questions[q.songId]
    )
      questions[q.songId] = q;
  }
  const catalog = (): Catalog => ({
    ...base,
    players: [...members.values()].map((m) => ({
      player: { id: m.id, displayName: m.nickname },
      preferences: emptyPreferences(),
    })),
  });
  function invalidate() {
    revision++;
    assessment = null;
    selectedSongIds = [];
    for (const m of members.values()) m.lobbyReady = false;
  }
  function join(
    id: PlayerId,
    displayName: string,
    waitingForNextMatch = false,
  ) {
    PlayerIdSchema.parse(id);
    const { nickname } = LobbyEntrySchema.parse({ nickname: displayName });
    if (members.has(id) || members.size >= 8)
      throw new Error('房间已满或成员重复');
    const c: Catalog = {
      ...catalog(),
      players: [
        ...catalog().players,
        {
          player: { id, displayName: nickname },
          preferences: emptyPreferences(),
        },
      ],
    };
    const at = deps.now();
    const raw = deps.submitProfile(id, { tagIds: [], reports: [] }, c, at);
    const profile = buildPlayerProfile(
      {
        catalog: c,
        rawData: [raw],
        referenceTime: at,
        scoringConfig: MANUAL_SCORING_CONFIG,
      },
      id,
    );
    members.set(id, {
      id,
      nickname,
      online: true,
      lobbyReady: false,
      waitingForNextMatch,
      profile,
      raw,
      feedback: [],
    });
    if (!waitingForNextMatch) invalidate();
  }
  function setOnline(id: PlayerId, online: boolean) {
    const m = members.get(id);
    if (!m) throw new Error('成员会话已失效');
    if (m.online !== online) {
      m.online = online;
      if (!m.waitingForNextMatch) invalidate();
    }
  }
  function matrix(at: string) {
    return buildFamiliarityMatrix({
      catalog: catalog(),
      profiles: [...members.values()].map((m) => m.profile),
      scoringConfig: MANUAL_SCORING_CONFIG,
      referenceTime: at,
      matrixVersion: roomId + ':' + revision,
      questionBySongId: questions,
    });
  }
  function snapshot(): LobbySnapshot {
    const playableCount = Object.keys(questions).length;
    return structuredClone({
      roomId,
      revision,
      hostId,
      preset,
      mode,
      members: [...members.values()].map((m) => ({
        id: m.id,
        nickname: m.nickname,
        online: m.online,
        lobbyReady: m.lobbyReady,
        waitingForNextMatch: m.waitingForNextMatch,
        matchReady: null,
        profileVersion: m.profile.profileVersion,
      })),
      assessment,
      selectedSongIds,
      playableCount,
      pendingCount: base.songs.length - playableCount,
      stage: assessment ? 'assessed' : 'lobby',
      canStart: false,
      startBlocker:
        playableCount <
        (mode === 'multiplayer'
          ? MULTIPLAYER_RULES.questionCount
          : DUEL_PRESETS[preset].minimumCandidates)
          ? '已核验可玩素材不足，请先完成素材核验。'
          : '请进入听歌抢牌，完成双方选歌、禁歌和最终准备。',
    });
  }
  function self(id: PlayerId): LobbySelf {
    const m = members.get(id);
    if (!m) throw new Error('成员会话已失效');
    return structuredClone({
      playerId: id,
      profile: m.profile,
      estimates: matrix(deps.now()).cells[id]!,
    });
  }
  function dispatch(id: PlayerId, input: LobbyCommand): LobbySnapshot {
    const cmd = LobbyCommandSchema.parse(input);
    const m = members.get(id);
    if (!m || !m.online) throw new Error('成员不在线');
    if (['preset', 'assess', 'mode'].includes(cmd.type) && id !== hostId)
      throw new Error('仅房主可执行此操作');
    if (m.waitingForNextMatch && cmd.type !== 'profile' && cmd.type !== 'leave')
      throw new Error('请等待下一局');
    if (cmd.type === 'profile') {
      const at = deps.now();
      const raw = deps.submitProfile(id, cmd.preferences, catalog(), at);
      const profile = buildPlayerProfile(
        {
          catalog: catalog(),
          rawData: [raw, ...m.feedback],
          scoringConfig: MANUAL_SCORING_CONFIG,
          referenceTime: at,
        },
        id,
        m.profile,
      );
      m.raw = raw;
      m.profile = profile;
      if (!m.waitingForNextMatch) invalidate();
    } else if (cmd.type === 'mode') {
      if (mode !== cmd.mode) {
        mode = cmd.mode;
        invalidate();
      }
    } else if (cmd.type === 'preset') {
      if (preset !== cmd.preset) {
        preset = cmd.preset;
        invalidate();
      }
    } else if (cmd.type === 'ready') {
      m.lobbyReady = cmd.ready;
      revision++;
      assessment = null;
      selectedSongIds = [];
    } else if (cmd.type === 'leave') {
      if (id === hostId) {
        for (const member of members.values()) member.online = false;
      } else members.delete(id);
      if (!m.waitingForNextMatch) invalidate();
    } else {
      if (
        members.size !== 2 ||
        [...members.values()].some((m) => !m.online || !m.lobbyReady)
      )
        throw new Error('1v1 预评估需要两位在线玩家均完成入场准备');
      const at = deps.now();
      // Each new evaluation has its own version, including a changed reference time.
      revision++;
      assessment = null;
      selectedSongIds = [];
      const result = selectPlaylist({
        profileContext: {
          catalog: catalog(),
          profiles: [...members.values()].map((m) => m.profile),
          scoringConfig: MANUAL_SCORING_CONFIG,
          referenceTime: at,
          matrix: matrix(at),
        },
        candidateSongIds: base.songs.map((s) => s.id),
        requestedCount: DUEL_PRESETS[preset].minimumCandidates,
        bannedSongIds: [],
        excludedHistorySongIds: [],
        availability: Object.fromEntries(
          base.songs.map((s) => [
            s.id,
            questions[s.id]
              ? { available: true as const }
              : { available: false as const, reason: 'MATERIAL_PENDING' },
          ]),
        ),
        selectionConfig: DEFAULT_SELECTION_CONFIG,
        fairnessConfig: DEFAULT_FAIRNESS_CONFIG,
        selectionVersion: revision,
        gameType: GameTypeSchema.parse('karuta'),
        roundNumber: 1,
      });
      selectedSongIds = result.selectedSongIds;
      assessment = assessPlaylist({
        playerIds: [...members.keys()],
        selectedSongIds,
        matrix: matrix(at),
        requestedCount: DUEL_PRESETS[preset].minimumCandidates,
        fairnessConfig: DEFAULT_FAIRNESS_CONFIG,
        selectionVersion: revision,
      });
    }
    return snapshot();
  }
  join(hostId, nickname);
  // Trusted composition input: never expose profiles/question mappings over HTTP.
  function preparationContext(): LobbyPreparationContext {
    return structuredClone({
      room: snapshot(),
      catalog: catalog(),
      profiles: [...members.values()].map((m) => m.profile),
      questions,
    });
  }
  const settled = new Set<string>();
  function settleDuel(result: DuelResult, events: readonly GameEvent[]) {
    settleGame(result.game, events);
  }
  function releaseWaiting() {
    if ([...members.values()].some((m) => m.waitingForNextMatch)) {
      for (const m of members.values()) m.waitingForNextMatch = false;
      invalidate();
    }
  }
  function settleGame(
    result: GameResult,
    events: readonly GameEvent[],
    preserveWaiting = false,
  ) {
    if (
      result.status !== 'completed' ||
      settled.has(result.session.gameSessionId)
    )
      return;
    const at = result.endedAt;
    const evidence = events.flatMap((event) => {
      const e = gameplayEvidence({
        catalog: catalog(),
        session: result.session,
        event,
        sourceId: 'runtime:gameplay',
        observedAt: at,
      });
      return e ? [e] : [];
    });
    // Build every profile before committing any feedback.
    const updates = [...members.values()].map((m) => {
      const raw = RawUserMusicDataSchema.parse({
        schemaVersion: 1,
        sourceId: 'runtime:gameplay',
        userId: m.id,
        snapshotId: 'feedback:' + result.session.gameSessionId + ':' + m.id,
        observedAt: at,
        evidence: evidence.filter((e) => e.playerId === m.id),
        declaredPreferences: emptyPreferences(),
      });
      const feedback = [...m.feedback, raw];
      const profile = buildPlayerProfile(
        {
          catalog: catalog(),
          rawData: [m.raw, ...feedback],
          referenceTime: at,
          scoringConfig: MANUAL_SCORING_CONFIG,
        },
        m.id,
        m.profile,
      );
      return { m, feedback, profile };
    });
    for (const { m, feedback, profile } of updates) {
      m.feedback = feedback;
      m.profile = profile;
    }
    settled.add(result.session.gameSessionId);
    if (!preserveWaiting) releaseWaiting();
    invalidate();
  }
  return {
    join,
    setOnline,
    dispatch,
    snapshot,
    self,
    preparationContext,
    settleDuel,
    settleGame,
    releaseWaiting,
  };
}
export type LobbyController = ReturnType<typeof createLobby>;
