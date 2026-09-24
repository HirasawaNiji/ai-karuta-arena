import {
  PartySetupInputSchema,
  PartyCommandSchema,
  SelectionRequestSchema,
  type PartyActor,
  type PartyCommand,
  type Catalog,
  type RawUserMusicData,
  type GameEvent,
  type DomainError,
  type Result,
} from '@amp/core';
import { DEFAULT_SCORING_CONFIG } from '@amp/music-profile';
import {
  DEFAULT_FAIRNESS_CONFIG,
  DEFAULT_SELECTION_CONFIG,
  explainSelection,
} from '@amp/playlist-engine';
import {
  MockMusicSource,
  MockPartyHostAgent,
  MockGameFactory,
  type MockAnswer,
} from '@amp/adapters';
import {
  MOCK_REFERENCE_TIME,
  MOCK_SOURCE_ID,
  coverageManifest,
} from '@amp/adapters/fixtures';
import { createPartyRuntime, canStart } from '@amp/party-runtime';
import {
  summarize,
  type DemoRun,
  type DemoStep,
  type CellChange,
} from './report.js';
export type Fixture = {
  readonly catalog: Catalog;
  readonly rawData: readonly RawUserMusicData[];
};
export function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error('Demo assertion failed: ' + message);
}
export function unwrap<T>(result: Result<T>): T {
  if (!result.ok)
    throw new Error(result.error.code + ': ' + result.error.message);
  return result.value;
}
export function session(
  runId: string,
  fixture: Fixture,
  options: {
    requestedCount?: number;
    answers?: (
      songId: MockAnswer['songId'],
      playerId: MockAnswer['playerId'],
      index: number,
    ) => MockAnswer['outcome'] | null;
  } = {},
) {
  let nowMs = Date.parse(MOCK_REFERENCE_TIME),
    commandId = 0,
    sessionId = 0;
  const now = () => new Date(nowMs).toISOString();
  let source = new MockMusicSource(MOCK_SOURCE_ID, fixture.rawData);
  const steps: DemoStep[] = [],
    selections: DemoRun['selections'][number][] = [],
    hostDecisions: DemoRun['hostDecisions'][number][] = [],
    events: GameEvent[] = [],
    cellChanges: CellChange[] = [];
  const setup = PartySetupInputSchema.parse({
    partyId: 'demo:' + runId,
    hostPlayerId: fixture.catalog.players[0]!.player.id,
    players: fixture.catalog.players.map((p) => p.player),
    catalog: fixture.catalog,
    candidateSongIds: fixture.catalog.songs.map((s) => s.id),
    availability: Object.fromEntries(
      fixture.catalog.songs.map((s) => [s.id, { available: true }]),
    ),
    requestedCount: options.requestedCount ?? 12,
    currentGame: 'mock-karuta',
    config: {
      scoring: DEFAULT_SCORING_CONFIG,
      selection: DEFAULT_SELECTION_CONFIG,
      fairness: DEFAULT_FAIRNESS_CONFIG,
    },
    partyPreferences: { excludePlayedSongs: true },
    referenceTime: MOCK_REFERENCE_TIME,
  });
  const mock = new MockGameFactory((game) => ({
    now: () => new Date(++nowMs).toISOString(),
    answers: game.songIds.flatMap((songId) =>
      game.playerIds.flatMap((playerId, index) => {
        const outcome = options.answers?.(songId, playerId, index);
        return outcome ? [{ songId, playerId, outcome }] : [];
      }),
    ),
  }));
  let replay: ((event: GameEvent) => void) | undefined;
  const runtime = createPartyRuntime(
    {
      sources: [
        {
          sourceId: MOCK_SOURCE_ID,
          getUserMusicData: (id) => source.getUserMusicData(id),
        },
      ],
      gameFactory: {
        capabilities: mock.capabilities,
        create: (input, onEvent) => {
          replay = onEvent;
          return mock.create(input, (event) => {
            events.push(event);
            onEvent(event);
          });
        },
      },
      hostAgent: new MockPartyHostAgent(),
      now,
      nextId: () => runId + ':session:' + ++sessionId,
      allowSystem: () => true,
    },
    setup,
  );
  const host: PartyActor = { role: 'host', playerId: setup.hostPlayerId },
    system: PartyActor = { role: 'system' };
  let profiles: DemoRun['profiles'] = [];
  const state = () => runtime.getSnapshot();
  function expectOutcome<T>(
    result: Result<T>,
    expected:
      DomainError['code'] | 'OK' | readonly (DomainError['code'] | 'OK')[],
    label: string,
  ) {
    const outcome = result.ok ? 'OK' : result.error.code;
    ensure(
      (Array.isArray(expected) ? expected : [expected]).includes(outcome),
      label + ' expected ' + String(expected) + '; received ' + outcome,
    );
    return outcome;
  }
  async function send(
    label: string,
    type: PartyCommand['type'],
    extra: Record<string, unknown> = {},
    expected:
      | DomainError['code']
      | 'OK'
      | readonly (DomainError['code'] | 'OK')[] = 'OK',
    actor: PartyActor = host,
  ) {
    const command = PartyCommandSchema.parse({
      partyId: setup.partyId,
      commandId: runId + ':command:' + ++commandId,
      expectedVersion: state().selectionVersion,
      type,
      ...([
        'INITIALIZE',
        'GENERATE',
        'REGENERATE',
        'START_NEXT_ROUND',
        'REGENERATE_FROM_ERROR',
        'REFRESH_PROFILES',
        'UPDATE_CONFIG',
        'UPDATE_CATALOG',
        'UPDATE_MEMBERS',
      ].includes(type)
        ? { referenceTime: now() }
        : {}),
      ...extra,
    });
    const result = await runtime.dispatch(command, actor);
    const outcome = expectOutcome(result, expected, label);
    steps.push({
      label,
      command,
      actor,
      actorSource:
        actor.role === 'host'
          ? 'simulated_host'
          : actor.role === 'player'
            ? 'simulated_member'
            : 'trusted_demo_system',
      outcome,
      state: summarize(state()),
    });
    return state();
  }
  async function drain(label: string) {
    const result = await runtime.drainEvents();
    unwrap(result);
    steps.push({
      label,
      command: null,
      actor: null,
      actorSource: 'mock_game',
      outcome: 'OK',
      state: summarize(state()),
    });
    return state();
  }
  function captureSelection(label: string) {
    const s = state();
    ensure(s.matrix && s.selectionResult, 'selection and matrix exist');
    const request = SelectionRequestSchema.parse({
      profileContext: {
        catalog: s.catalog,
        profiles: s.playerProfiles,
        matrix: s.matrix,
        scoringConfig: s.config.scoring,
        referenceTime: s.referenceTime,
      },
      candidateSongIds: s.candidateSongIds,
      requestedCount: s.requestedCount,
      bannedSongIds: s.bannedSongIds,
      excludedHistorySongIds: s.excludedHistorySongIds,
      availability: s.availability,
      selectionConfig: s.config.selection,
      fairnessConfig: s.config.fairness,
      selectionVersion: s.selectionVersion,
      gameType: s.currentGame,
      roundNumber: s.currentRound,
    });
    const report = explainSelection(request);
    ensure(
      JSON.stringify(report.result) === JSON.stringify(s.selectionResult),
      'explanation reproduces current runtime selection',
    );
    selections.push({ label, report });
  }
  async function prepare() {
    await send('加载模拟来源并计算画像', 'INITIALIZE', {}, 'OK', system);
    profiles = state().playerProfiles.map((p) => ({
      playerId: p.playerId,
      preferences: p.preferences,
      evidenceCount: [
        ...Object.values(p.songEvidence),
        ...Object.values(p.artistEvidence),
      ].flat().length,
    }));
    await send('生成题组并独立评估', 'GENERATE');
    captureSelection('initial');
    hostDecisions.push(unwrap(await runtime.suggest()));
  }
  async function finishGame() {
    ensure(state().phase === 'playing', 'game has started');
    await drain('消费开局事件');
    let advances = 0;
    while (mock.latest?.getState().phase === 'playing') {
      ensure(++advances <= setup.requestedCount, 'bounded game progression');
      mock.latest.advance();
      await drain('消费第 ' + advances + ' 首事件');
    }
    ensure(state().phase === 'finished', 'atomic settlement completed');
  }
  async function expand(fixture: Fixture) {
    await send('扩充候选目录', 'UPDATE_CATALOG', {
      catalog: fixture.catalog,
      candidateSongIds: fixture.catalog.songs.map((s) => s.id),
      availability: Object.fromEntries(
        fixture.catalog.songs.map((s) => [s.id, { available: true }]),
      ),
    });
    source = new MockMusicSource(MOCK_SOURCE_ID, fixture.rawData);
    await send('加载扩库歌曲的来源证据', 'REFRESH_PROFILES');
    await send('保留禁歌重新选曲', 'REGENERATE');
    captureSelection('expanded');
  }
  async function replayFinish() {
    const finish = [...events]
      .reverse()
      .find((e) => e.type === 'GAME_FINISHED');
    ensure(finish && replay, 'completed session exists');
    const before = JSON.stringify(state());
    replay(finish);
    await drain('重放结束事件不重复结算');
    ensure(
      JSON.stringify(state()) === before,
      'finish replay must be idempotent',
    );
  }
  function report(): DemoRun {
    const final = state();
    return {
      runId,
      dataVersion: setup.catalog.catalogVersion,
      config: setup.config,
      referenceTime: setup.referenceTime,
      manifest: coverageManifest(setup.catalog),
      profiles,
      steps,
      selections,
      hostDecisions,
      events: {
        counts: Object.fromEntries(
          [...new Set(events.map((e) => e.type))]
            .sort()
            .map((type) => [
              type,
              events.filter((e) => e.type === type).length,
            ]),
        ),
        emittedCount: events.length,
        acceptedCount: final.processedEventIds.length,
        judgements: events.filter(
          (
            e,
          ): e is Extract<
            GameEvent,
            { type: 'ANSWER_CORRECT' | 'ANSWER_WRONG' }
          > => e.type === 'ANSWER_CORRECT' || e.type === 'ANSWER_WRONG',
        ),
      },
      cellChanges,
      finalState: summarize(final),
    };
  }
  return {
    state,
    runtime,
    mock,
    send,
    drain,
    prepare,
    finishGame,
    expand,
    captureSelection,
    replayFinish,
    cellChanges,
    report,
    host,
    system,
    canStart: () => canStart(state(), mock.capabilities),
  };
}
