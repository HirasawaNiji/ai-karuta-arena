import { describe, it, expect } from 'vitest';
import {
  PartyStateSchema,
  PartyActorSchema,
  GameTypeSchema,
  type Result,
  type PartyState,
  type PartyCommand,
} from '@amp/core';
import { canStart } from '@amp/party-runtime';
import { harness } from './fixtures/party-harness.js';
function error(result: Result<unknown>, code: string) {
  expect(result).toMatchObject({ ok: false, error: { code } });
}
const capabilities = [GameTypeSchema.parse('mock-karuta')];

describe('party commands and authority', () => {
  it('initializes at zero, prepares without auto-start, and exposes detached immutable snapshots', async () => {
    const h = harness();
    expect(h.runtime.getSnapshot()).toMatchObject({
      selectionVersion: 0,
      phase: 'setup',
      matrix: null,
      banPhase: 'closed',
    });
    await h.ready();
    const s = h.runtime.getSnapshot();
    expect(s.phase).toBe('prepared');
    expect(h.mock.latest).toBeUndefined();
    expect(canStart(s, capabilities).allowed).toBe(true);
    expect(PartyStateSchema.safeParse(s).success).toBe(true);
    expect(Object.isFrozen(s.catalog.songs)).toBe(true);
    expect(s).not.toBe(h.runtime.getSnapshot());
  });
  it('validates actor before replay and never leaks another actor result', async () => {
    const h = harness();
    await h.ready();
    const cmd = h.command('BEGIN_BAN');
    const first = await h.runtime.dispatch(cmd, h.host);
    expect(first.ok).toBe(true);
    await h.send('BAN_SONG', { songId: h.input.candidateSongIds[0] });
    expect(await h.runtime.dispatch(cmd, h.host)).toEqual(first);
    error(
      await h.runtime.dispatch(cmd, {
        role: 'host',
        playerId: h.input.players[1]!.id,
      }),
      'INVALID_ACTOR',
    );
    error(
      await h.runtime.dispatch(cmd, {
        role: 'player',
        playerId: h.input.players[1]!.id,
      }),
      'COMMAND_CONFLICT',
    );
    error(
      await h.runtime.dispatch(
        {
          ...cmd,
          expectedVersion: h.runtime.getSnapshot().selectionVersion,
        } as PartyCommand,
        h.host,
      ),
      'COMMAND_CONFLICT',
    );
  });
  it('checks removed players before their cached command', async () => {
    const h = harness();
    await h.ready();
    await h.send('BEGIN_BAN');
    const player = PartyActorSchema.parse({
      role: 'player',
      playerId: h.input.players[1]!.id,
    });
    const cmd = h.command('BAN_SONG', { songId: h.input.candidateSongIds[0] });
    expect((await h.runtime.dispatch(cmd, player)).ok).toBe(true);
    await h.send('FINISH_BAN');
    await h.send('UPDATE_MEMBERS', {
      players: h.input.players.filter((p) => p.id !== h.input.players[1]!.id),
    });
    error(await h.runtime.dispatch(cmd, player), 'INVALID_ACTOR');
  });
  it('requires a trusted system port and a matching host', async () => {
    const h = harness({ allowSystem: false });
    error(await h.send('INITIALIZE', {}, h.system), 'INVALID_ACTOR');
    error(await h.send('INITIALIZE'), 'FORBIDDEN');
  });
  it('blocks concurrent commands while sources await without partial state', async () => {
    const initial = harness();
    let release: () => void = () => {};
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const h = harness({
      source: {
        sourceId: initial.fixture.rawData[0]!.sourceId,
        getUserMusicData: async (id) => {
          await wait;
          return initial.fixture.rawData.find((r) => r.userId === id)!;
        },
      },
    });
    const initializing = h.send('INITIALIZE', {}, h.system);
    error(await h.send('GENERATE'), 'BUSY');
    error(await h.runtime.drainEvents(), 'BUSY');
    expect(h.runtime.getSnapshot().playerProfiles).toHaveLength(0);
    release();
    expect((await initializing).ok).toBe(true);
  });
  it('preserves real mixed warnings and never lets a host agent acknowledge', async () => {
    const h = harness({ mixed: true });
    await h.ready();
    expect(h.runtime.getSnapshot().fairnessAssessment?.passed).toBe(false);
    error(await h.send('START_GAME'), 'ACK_REQUIRED');
    error(await h.send('ACKNOWLEDGE_CONTINUE', {}, h.system), 'FORBIDDEN');
    const before = h.runtime.getSnapshot();
    const advice = await h.runtime.suggest();
    expect(advice).toMatchObject({
      ok: true,
      value: { action: 'REQUEST_HOST_CHOICE' },
    });
    expect(h.runtime.getSnapshot()).toEqual(before);
    expect((await h.send('ACKNOWLEDGE_CONTINUE')).ok).toBe(true);
    expect(h.runtime.getSnapshot().fairnessAssessment).toEqual(
      before.fairnessAssessment,
    );
    expect(canStart(h.runtime.getSnapshot(), capabilities).allowed).toBe(true);
  });
  it('ban pauses, persists, removes without replacement and reassesses shortened playlists', async () => {
    const h = harness();
    await h.ready();
    const original = h.runtime.getSnapshot().selectionResult;
    await h.send('BEGIN_BAN');
    error(await h.send('START_GAME'), 'BAN_OPEN');
    const songId = h.runtime.getSnapshot().currentPlaylist[0]!;
    await h.send(
      'BAN_SONG',
      { songId },
      { role: 'player', playerId: h.input.players[1]!.id },
    );
    const v = h.runtime.getSnapshot().selectionVersion;
    await h.send('BAN_SONG', { songId });
    expect(h.runtime.getSnapshot().selectionVersion).toBe(v);
    expect(h.runtime.getSnapshot().currentPlaylist).toHaveLength(11);
    expect(h.runtime.getSnapshot().selectionResult).toEqual(original);
    await h.send('FINISH_BAN');
    expect(h.runtime.getSnapshot().fairnessAssessment?.reasons).toContainEqual({
      code: 'SHORT_PLAYLIST',
      observed: 11,
      threshold: 12,
    });
    expect((await h.send('ACKNOWLEDGE_CONTINUE')).ok).toBe(true);
    await h.send('REGENERATE');
    expect(h.runtime.getSnapshot().bannedSongIds).toContain(songId);
    expect(h.runtime.getSnapshot().currentPlaylist).not.toContain(songId);
    expect(h.runtime.getSnapshot().hostAcknowledgement).toBeNull();
  });
  it('never waives an empty playlist', async () => {
    const h = harness({ count: 1 });
    await h.ready();
    await h.send('BEGIN_BAN');
    await h.send('BAN_SONG', {
      songId: h.runtime.getSnapshot().currentPlaylist[0],
    });
    await h.send('FINISH_BAN');
    error(await h.send('ACKNOWLEDGE_CONTINUE'), 'INVALID_INPUT');
    expect(canStart(h.runtime.getSnapshot(), capabilities).allowed).toBe(false);
  });
  it.each([
    'UPDATE_CONFIG',
    'UPDATE_CATALOG',
    'UPDATE_MEMBERS',
    'REFRESH_PROFILES',
    'CHANGE_GAME',
    'REGENERATE',
  ] as const)('%s invalidates a current acknowledgement', async (type) => {
    const h = harness({ count: 13 });
    await h.ready();
    await h.send('ACKNOWLEDGE_CONTINUE');
    const before = h.runtime.getSnapshot();
    let extra: Record<string, unknown> = {};
    if (type === 'UPDATE_CONFIG')
      extra = {
        config: {
          ...before.config,
          fairness: { ...before.config.fairness, maxCoverageGap: 0.3 },
        },
        requestedCount: 13,
        partyPreferences: before.partyPreferences,
      };
    if (type === 'UPDATE_CATALOG')
      extra = {
        catalog: { ...before.catalog, catalogVersion: 'catalog:updated' },
        candidateSongIds: before.candidateSongIds,
        availability: before.availability,
      };
    if (type === 'UPDATE_MEMBERS')
      extra = { players: before.players.slice(0, 6) };
    if (type === 'CHANGE_GAME') extra = { gameType: 'unimplemented' };
    if (type === 'REFRESH_PROFILES') h.tick();
    const result = await h.send(type, extra);
    if (type === 'CHANGE_GAME') error(result, 'UNSUPPORTED_GAME');
    else expect(result.ok).toBe(true);
    const after = h.runtime.getSnapshot();
    expect(after.selectionVersion).toBeGreaterThan(before.selectionVersion);
    expect(after.hostAcknowledgement).toBeNull();
    error(
      await h.send('ACKNOWLEDGE_CONTINUE', {
        expectedVersion: before.selectionVersion,
      }),
      'STALE_VERSION',
    );
  });
  it('identical refresh and config leave version and confirmation unchanged', async () => {
    const h = harness({ count: 13 });
    await h.ready();
    await h.send('ACKNOWLEDGE_CONTINUE');
    const s = h.runtime.getSnapshot();
    await h.send('REFRESH_PROFILES');
    expect(h.runtime.getSnapshot()).toEqual(s);
    await h.send('UPDATE_CONFIG', {
      config: s.config,
      requestedCount: s.requestedCount,
      partyPreferences: s.partyPreferences,
    });
    expect(h.runtime.getSnapshot()).toEqual(s);
  });
  it('removes newly unavailable songs and preserves the original requested count', async () => {
    const h = harness();
    await h.ready();
    const s = h.runtime.getSnapshot(),
      song = s.currentPlaylist[0]!;
    const result = await h.send('UPDATE_CATALOG', {
      catalog: s.catalog,
      candidateSongIds: s.candidateSongIds,
      availability: {
        ...s.availability,
        [song]: { available: false, reason: 'removed' },
      },
    });
    expect(result.ok).toBe(true);
    expect(h.runtime.getSnapshot().currentPlaylist).not.toContain(song);
    expect(h.runtime.getSnapshot().fairnessAssessment?.requestedCount).toBe(12);
  });
  it('replaces a song without rewriting selection history', async () => {
    const h = harness({ count: 2 });
    await h.ready();
    const s = h.runtime.getSnapshot();
    const newSongId = s.candidateSongIds.find(
      (id) => !s.currentPlaylist.includes(id),
    );
    expect(
      (
        await h.send('REPLACE_SONG', {
          oldSongId: s.currentPlaylist[0],
          newSongId,
        })
      ).ok,
    ).toBe(true);
    expect(h.runtime.getSnapshot().selectionResult).toEqual(s.selectionResult);
    expect(h.runtime.getSnapshot().currentPlaylist).toContain(newSongId);
  });
  it('failed source refresh clears readiness without partially replacing members', async () => {
    const fixture = harness().fixture;
    let fail = false;
    const h = harness({
      source: {
        sourceId: fixture.rawData[0]!.sourceId,
        getUserMusicData: async (id) => {
          if (fail) throw Error('source');
          return Promise.resolve(fixture.rawData.find((r) => r.userId === id)!);
        },
      },
    });
    await h.ready();
    const before = h.runtime.getSnapshot();
    fail = true;
    error(
      await h.send('UPDATE_MEMBERS', { players: before.players.slice(0, 6) }),
      'SOURCE_FAILED',
    );
    expect(h.runtime.getSnapshot().players).toEqual(before.players);
    expect(h.runtime.getSnapshot().fairnessAssessment).toBeNull();
    expect(h.runtime.getSnapshot().hostState).toBe('awaiting_host_choice');
  });
  it('does not remove host or accept unsupported game acknowledgement', async () => {
    const h = harness({ count: 13 });
    await h.ready();
    error(
      await h.send('UPDATE_MEMBERS', { players: h.input.players.slice(1) }),
      'INVALID_INPUT',
    );
    expect(h.runtime.getSnapshot().players).toEqual(h.input.players);
    await h.send('GENERATE');
    error(
      await h.send('CHANGE_GAME', { gameType: 'future-game' }),
      'UNSUPPORTED_GAME',
    );
    expect(h.runtime.getSnapshot().currentGame).toBe('future-game');
    error(await h.send('ACKNOWLEDGE_CONTINUE'), 'UNSUPPORTED_GAME');
    error(await h.send('START_GAME'), 'UNSUPPORTED_GAME');
  });
  it.each(['START_WARMUP', 'CHANGE_DIFFICULTY', 'UNKNOWN'])(
    'rejects unsupported host action %s',
    async (action) => {
      const h = harness({
        host: {
          decide: () =>
            Promise.resolve({
              action,
              reason: 'test',
              message: 'test',
              reasonCodes: [],
            } as never),
        },
      });
      error(await h.runtime.suggest(), 'UNSUPPORTED_ACTION');
    },
  );
  it('rejects host suggestions computed against stale state', async () => {
    let release: (x: never) => void = () => {};
    const h = harness({
      host: {
        decide: () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      },
    });
    await h.ready();
    const pending = h.runtime.suggest();
    await h.send('BEGIN_BAN');
    release({
      action: 'START_GAME',
      reason: 'test',
      message: 'test',
      reasonCodes: [],
    } as never);
    error(await pending, 'STALE_VERSION');
  });
  it('ends terminally and system needs existing host intent', async () => {
    const h = harness();
    await h.ready();
    error(await h.send('END_PARTY', {}, h.system), 'FORBIDDEN');
    await h.send('END_PARTY');
    error(await h.send('GENERATE'), 'INVALID_PHASE');
    error(await h.send('START_GAME'), 'INVALID_PHASE');
    expect(h.runtime.getSnapshot().phase).toBe('ended');
    const allowed = harness({ hostEndIntent: true });
    expect((await allowed.send('END_PARTY', {}, allowed.system)).ok).toBe(true);
  });
});

describe('unified start guard', () => {
  it.each([
    'ready',
    'no-players',
    'duplicate-song',
    'stale-context',
    'stale-ack',
    'tampered-metrics',
    'unsupported',
    'banned',
    'open-ban',
  ] as const)('blocks malformed %s snapshots', async (kind) => {
    const h = harness({ count: 13 });
    await h.ready();
    await h.send('ACKNOWLEDGE_CONTINUE');
    const s = structuredClone(h.runtime.getSnapshot()) as {
      -readonly [K in keyof PartyState]: PartyState[K];
    };
    if (kind === 'ready') {
      s.hostAcknowledgement = null;
      s.hostState = 'ready';
    }
    if (kind === 'no-players') s.players = [];
    if (kind === 'duplicate-song')
      s.currentPlaylist = [s.currentPlaylist[0]!, s.currentPlaylist[0]!];
    if (kind === 'stale-context')
      s.config = {
        ...s.config,
        scoring: { ...s.config.scoring, playCountCap: 123 },
      };
    if (kind === 'stale-ack') s.selectionVersion++;
    if (kind === 'tampered-metrics')
      s.fairnessAssessment = {
        ...s.fairnessAssessment!,
        playerMetrics: {
          ...s.fairnessAssessment!.playerMetrics,
          [s.players[0]!.id]: {
            ...s.fairnessAssessment!.playerMetrics[s.players[0]!.id]!,
            familiaritySum: 0,
          },
        },
      };
    if (kind === 'unsupported')
      s.currentGame = GameTypeSchema.parse('future-game');
    if (kind === 'banned') s.bannedSongIds = [s.currentPlaylist[0]!];
    if (kind === 'open-ban') s.banPhase = 'open';
    expect(canStart(s, capabilities).allowed).toBe(false);
  });
  it('a new command cannot replay a stale expectedVersion', async () => {
    const h = harness();
    await h.ready();
    const cmd = h.command('BEGIN_BAN');
    await h.send('REGENERATE');
    error(await h.runtime.dispatch(cmd, h.host), 'STALE_VERSION');
  });
});
