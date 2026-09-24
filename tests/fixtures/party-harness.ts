import {
  PartySetupInputSchema,
  PartyCommandSchema,
  type PartyActor,
  type GameFactory,
  type GameEvent,
  type PartyCommand,
  type PartyHostAgent,
  type MusicProfileSource,
} from '@amp/core';
import { DEFAULT_SCORING_CONFIG } from '@amp/music-profile';
import {
  DEFAULT_FAIRNESS_CONFIG,
  DEFAULT_SELECTION_CONFIG,
} from '@amp/playlist-engine';
import {
  MockMusicSource,
  MockPartyHostAgent,
  MockGameFactory,
  type MockAnswer,
} from '@amp/adapters';
import {
  createStressFixture,
  createMixedFixture,
  MOCK_SOURCE_ID,
  MOCK_REFERENCE_TIME,
} from '@amp/adapters/fixtures';
import { createPartyRuntime } from '@amp/party-runtime';
export function harness(
  options: {
    mixed?: boolean;
    count?: number;
    factory?: GameFactory;
    source?: MusicProfileSource;
    host?: PartyHostAgent;
    allowSystem?: boolean;
    hostEndIntent?: boolean;
    answers?: (
      songId: MockAnswer['songId'],
      playerId: MockAnswer['playerId'],
      index: number,
    ) => MockAnswer['outcome'] | null;
  } = {},
) {
  const fixture = options.mixed ? createMixedFixture() : createStressFixture();
  const input = PartySetupInputSchema.parse({
    partyId: 'party:test',
    hostPlayerId: fixture.catalog.players[0]!.player.id,
    players: fixture.catalog.players.map((p) => p.player),
    catalog: fixture.catalog,
    candidateSongIds: fixture.catalog.songs.map((s) => s.id),
    availability: Object.fromEntries(
      fixture.catalog.songs.map((s) => [s.id, { available: true }]),
    ),
    requestedCount: options.count ?? 12,
    currentGame: 'mock-karuta',
    config: {
      scoring: DEFAULT_SCORING_CONFIG,
      selection: DEFAULT_SELECTION_CONFIG,
      fairness: DEFAULT_FAIRNESS_CONFIG,
    },
    partyPreferences: { excludePlayedSongs: true },
    referenceTime: MOCK_REFERENCE_TIME,
  });
  let tick = Date.parse(MOCK_REFERENCE_TIME),
    id = 0,
    commandId = 0;
  const clock = () => new Date(tick).toISOString();
  const emitted: GameEvent[] = [];
  let emit: ((event: GameEvent) => void) | undefined;
  const mock = new MockGameFactory((session) => ({
    now: () => new Date(++tick).toISOString(),
    answers: session.songIds.flatMap((songId) =>
      session.playerIds.flatMap((playerId, index) => {
        const outcome = options.answers?.(songId, playerId, index);
        return outcome ? [{ songId, playerId, outcome }] : [];
      }),
    ),
  }));
  const chosen = options.factory ?? mock;
  const factory: GameFactory = {
    capabilities: chosen.capabilities,
    create: async (session, onEvent) => {
      emit = onEvent;
      return chosen.create(session, (event) => {
        emitted.push(event);
        onEvent(event);
      });
    },
  };
  const runtime = createPartyRuntime(
    {
      sources: [
        options.source ?? new MockMusicSource(MOCK_SOURCE_ID, fixture.rawData),
      ],
      gameFactory: factory,
      hostAgent: options.host ?? new MockPartyHostAgent(),
      now: clock,
      nextId: () => 'session:' + ++id,
      allowSystem: () => options.allowSystem ?? true,
      hasHostEndIntent: () => options.hostEndIntent ?? false,
    },
    input,
  );
  const host: PartyActor = { role: 'host', playerId: input.hostPlayerId };
  const system: PartyActor = { role: 'system' };
  function command(
    type: PartyCommand['type'],
    extra: Record<string, unknown> = {},
  ) {
    return PartyCommandSchema.parse({
      partyId: input.partyId,
      commandId: 'command:' + ++commandId,
      expectedVersion: runtime.getSnapshot().selectionVersion,
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
        ? { referenceTime: clock() }
        : {}),
      ...extra,
    });
  }
  const send = (
    type: PartyCommand['type'],
    extra: Record<string, unknown> = {},
    actor: PartyActor = host,
  ) => runtime.dispatch(command(type, extra), actor);
  const ready = async () => {
    const init = await send('INITIALIZE', {}, system);
    if (!init.ok) throw new Error(JSON.stringify(init));
    const result = await send('GENERATE');
    if (!result.ok) throw new Error(JSON.stringify(result));
  };
  return {
    fixture,
    input,
    runtime,
    mock,
    emitted,
    host,
    system,
    clock,
    command,
    send,
    ready,
    emit: (event: GameEvent) => {
      if (!emit) throw new Error('No subscription');
      emit(event);
    },
    tick: () => ++tick,
  };
}
