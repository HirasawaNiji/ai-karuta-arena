import { describe, it, expect } from 'vitest';
import {
  GameTypeSchema,
  GameEventSchema,
  type GameFactory,
  type GameEvent,
  type Result,
  type MusicGame,
} from '@amp/core';
import { harness } from './fixtures/party-harness.js';
import { MockKarutaGame } from '@amp/adapters';
function error(result: Result<unknown>, code: string) {
  expect(result).toMatchObject({ ok: false, error: { code } });
}
const capabilities = [GameTypeSchema.parse('mock-karuta')];
async function playing(options: Parameters<typeof harness>[0] = { count: 2 }) {
  const h = harness(options);
  await h.ready();
  if (!h.runtime.getSnapshot().fairnessAssessment?.passed)
    expect((await h.send('ACKNOWLEDGE_CONTINUE')).ok).toBe(true);
  expect((await h.send('START_GAME')).ok).toBe(true);
  return h;
}

describe('Mock feedback and settlement', () => {
  it('start queues without reentrancy, settles correct/wrong only once and refreshes next-round cells', async () => {
    const h = await playing({
      count: 2,
      answers: (_s, _p, index) =>
        index === 0 ? 'wrong' : index === 1 ? 'correct' : null,
    });
    const before = h.runtime.getSnapshot();
    const song = before.currentPlaylist[0]!,
      player = h.input.players[0]!.id;
    expect(before.processedEventIds).toHaveLength(0);
    expect(before.phase).toBe('playing');
    expect((await h.runtime.drainEvents()).ok).toBe(true);
    h.mock.latest!.advance();
    expect(h.runtime.getSnapshot().pendingGameplayEvidence).toHaveLength(0);
    expect((await h.runtime.drainEvents()).ok).toBe(true);
    expect(h.runtime.getSnapshot().pendingGameplayEvidence).toHaveLength(2);
    expect(h.runtime.getSnapshot().playerProfiles).toEqual(
      before.playerProfiles,
    );
    h.mock.latest!.advance();
    expect((await h.runtime.drainEvents()).ok).toBe(true);
    const settled = h.runtime.getSnapshot();
    expect(settled.phase).toBe('finished');
    expect(settled.matrix).toBeNull();
    expect(settled.fairnessAssessment).toBeNull();
    expect(settled.hostAcknowledgement).toBeNull();
    expect(settled.gameHistory).toHaveLength(1);
    expect(Object.values(settled.gameHistory[0]!.scores)).toEqual([
      0, 2, 0, 0, 0, 0, 0,
    ]);
    expect(settled.pendingGameplayEvidence).toHaveLength(0);
    expect(settled.playerProfiles[0]!.profileVersion).toBe(
      before.playerProfiles[0]!.profileVersion + 1,
    );
    expect(settled.playerProfiles[2]).toEqual(before.playerProfiles[2]);
    h.emit(h.emitted.at(-1)!);
    expect((await h.runtime.drainEvents()).ok).toBe(true);
    expect(h.runtime.getSnapshot()).toEqual(settled);
    expect(
      (
        await h.send('UPDATE_CONFIG', {
          config: settled.config,
          requestedCount: 2,
          partyPreferences: { excludePlayedSongs: false },
        })
      ).ok,
    ).toBe(true);
    const nextResult = await h.send('START_NEXT_ROUND');
    error(nextResult, 'ACK_REQUIRED');
    expect(h.runtime.getSnapshot().hostAcknowledgement).toBeNull();
    expect((await h.send('ACKNOWLEDGE_CONTINUE')).ok).toBe(true);
    expect((await h.send('START_GAME')).ok).toBe(true);
    const next = h.runtime.getSnapshot();
    expect(next.currentRound).toBe(2);
    expect(next.matrix!.cells[player]![song]!.familiarityScore).toBeLessThan(
      before.matrix!.cells[player]![song]!.familiarityScore,
    );
    expect(next.playerProfiles).toEqual(settled.playerProfiles);
  });
  it('next round keeps bans and history exclusion and cannot reuse old acknowledgement', async () => {
    const h = harness({ count: 13 });
    await h.ready();
    await h.send('BEGIN_BAN');
    const banned = h.runtime.getSnapshot().currentPlaylist[0]!;
    await h.send('BAN_SONG', { songId: banned });
    await h.send('FINISH_BAN');
    await h.send('ACKNOWLEDGE_CONTINUE');
    expect((await h.send('START_GAME')).ok).toBe(true);
    await h.runtime.drainEvents();
    while (h.mock.latest!.getState().phase === 'playing') {
      h.mock.latest!.advance();
      expect((await h.runtime.drainEvents()).ok).toBe(true);
    }
    const finished = h.runtime.getSnapshot();
    const result = await h.send('START_NEXT_ROUND');
    expect(result.ok).toBe(false);
    expect(h.runtime.getSnapshot()).toMatchObject({
      phase: 'prepared',
      hostAcknowledgement: null,
      currentRound: 2,
    });
    expect(h.runtime.getSnapshot().bannedSongIds).toContain(banned);
    expect(h.runtime.getSnapshot().excludedHistorySongIds).toEqual(
      [...finished.gameHistory[0]!.playedSongIds].sort(),
    );
    expect(h.runtime.getSnapshot().currentPlaylist).toHaveLength(0);
  });
  it('ending mid-game records aborted history but never commits pending evidence', async () => {
    const h = await playing({ count: 2, answers: () => 'correct' });
    const profiles = h.runtime.getSnapshot().playerProfiles;
    await h.runtime.drainEvents();
    h.mock.latest!.advance();
    await h.runtime.drainEvents();
    expect(
      h.runtime.getSnapshot().pendingGameplayEvidence.length,
    ).toBeGreaterThan(0);
    expect((await h.send('END_PARTY')).ok).toBe(true);
    expect(h.runtime.getSnapshot()).toMatchObject({
      phase: 'ended',
      pendingGameplayEvidence: [],
      playerProfiles: profiles,
      gameHistory: [{ status: 'aborted' }],
    });
    h.emit(h.emitted[0]!);
    expect((await h.runtime.drainEvents()).ok).toBe(true);
    h.emit({ ...h.emitted[0]!, eventId: 'late-event' } as GameEvent);
    error(await h.runtime.drainEvents(), 'EVENT_INVALID');
    expect(h.runtime.getSnapshot().phase).toBe('ended');
  });
  it('rejects a referenceTime earlier than consumed events', async () => {
    const h = await playing({ count: 1 });
    await h.runtime.drainEvents();
    h.mock.latest!.advance();
    await h.runtime.drainEvents();
    error(
      await h.send('START_NEXT_ROUND', {
        referenceTime: h.input.referenceTime,
      }),
      'INVALID_INPUT',
    );
    expect(h.runtime.getSnapshot().gameHistory).toHaveLength(1);
  });
  it.each([
    'UPDATE_CONFIG',
    'UPDATE_MEMBERS',
    'UPDATE_CATALOG',
    'REFRESH_PROFILES',
    'CHANGE_GAME',
    'BEGIN_BAN',
    'REGENERATE',
  ] as const)('rejects %s during play', async (type) => {
    const h = await playing();
    const s = h.runtime.getSnapshot();
    let extra: Record<string, unknown> = {};
    if (type === 'UPDATE_CONFIG')
      extra = {
        config: s.config,
        requestedCount: s.requestedCount,
        partyPreferences: s.partyPreferences,
      };
    if (type === 'UPDATE_MEMBERS') extra = { players: s.players };
    if (type === 'UPDATE_CATALOG')
      extra = {
        catalog: s.catalog,
        candidateSongIds: s.candidateSongIds,
        availability: s.availability,
      };
    if (type === 'CHANGE_GAME') extra = { gameType: 'other' };
    error(await h.send(type, extra), 'INVALID_PHASE');
    expect(h.runtime.getSnapshot()).toEqual(s);
  });
});

describe('game event failures and recovery', () => {
  it.each([
    'sequence',
    'time',
    'session',
    'party',
    'version',
    'type',
    'start-twice',
  ] as const)(
    'rejects invalid %s without contaminating profiles',
    async (field) => {
      const h = await playing();
      await h.runtime.drainEvents();
      const before = h.runtime.getSnapshot();
      const first = h.emitted[0]!;
      const patch: Record<string, unknown> = {
        eventId: 'bad:event',
        sequence: 2,
      };
      if (field === 'sequence') patch.sequence = 3;
      if (field === 'time') patch.occurredAt = h.input.referenceTime;
      if (field === 'session') patch.gameSessionId = 'other:session';
      if (field === 'party') patch.partyId = 'other:party';
      if (field === 'version') patch.selectionVersion = 999;
      if (field === 'type') patch.type = 'INVALID';
      h.emit({ ...first, ...patch });
      error(await h.runtime.drainEvents(), 'EVENT_INVALID');
      expect(h.runtime.getSnapshot()).toMatchObject({
        phase: 'error',
        playerProfiles: before.playerProfiles,
        gameHistory: [],
        pendingGameplayEvidence: [],
        fairnessAssessment: null,
      });
      expect(h.mock.latest!.getState().phase).toBe('stopped');
      expect((await h.send('REGENERATE_FROM_ERROR')).ok).toBe(true);
      expect(h.runtime.getSnapshot().phase).toBe('prepared');
    },
  );
  it('checks duplicate event contents before phase and sequence', async () => {
    const h = await playing();
    await h.runtime.drainEvents();
    const before = h.runtime.getSnapshot();
    h.emit(h.emitted[0]!);
    expect((await h.runtime.drainEvents()).ok).toBe(true);
    expect(h.runtime.getSnapshot()).toEqual(before);
    h.emit({ ...h.emitted[0]!, sequence: 2 });
    error(await h.runtime.drainEvents(), 'EVENT_CONFLICT');
    expect(h.runtime.getSnapshot().phase).toBe('error');
  });
  it.each([
    'answer-before-action',
    'round-before-close',
    'wrong-player',
    'repeated-song',
    'unknown-action',
    'repeated-judgement',
    'wrong-round',
    'round-without-song',
    'finish-before-close',
  ] as const)('rejects %s', async (kind) => {
    const h = await playing();
    await h.runtime.drainEvents();
    const s = h.runtime.getSnapshot(),
      session = s.activeGameSession!;
    let seq = 1;
    const event = (payload: Record<string, unknown>) =>
      ({
        ...payload,
        eventId: 'injected:' + ++seq,
        partyId: session.partyId,
        gameSessionId: session.gameSessionId,
        selectionVersion: session.selectionVersion,
        sequence: seq,
        occurredAt: h.clock(),
      }) as GameEvent;
    const roundId = 'round:a',
      songId = session.songIds[0]!,
      playerId = session.playerIds[0]!,
      actionId = 'action:a',
      judgementId = 'judgement:a';
    const answer = {
      type: 'ANSWER_CORRECT',
      roundId,
      songId,
      playerId,
      actionId,
      judgementId,
    };
    h.emit(event({ type: 'ROUND_STARTED', roundId }));
    if (kind === 'round-without-song')
      h.emit(event({ type: 'ROUND_FINISHED', roundId }));
    else {
      h.emit(event({ type: 'SONG_STARTED', roundId, songId }));
      if (kind === 'answer-before-action') h.emit(event(answer));
      if (kind === 'round-before-close')
        h.emit(event({ type: 'ROUND_STARTED', roundId: 'round:b' }));
      if (kind === 'wrong-player')
        h.emit(
          event({
            type: 'PLAYER_ACTION',
            roundId,
            songId,
            playerId: 'unknown',
            actionId,
            actionType: 'recognize',
          }),
        );
      if (kind === 'repeated-song') {
        h.emit(event({ type: 'ROUND_FINISHED', roundId }));
        h.emit(event({ type: 'ROUND_STARTED', roundId: 'round:b' }));
        h.emit(event({ type: 'SONG_STARTED', roundId: 'round:b', songId }));
      }
      if (
        kind === 'unknown-action' ||
        kind === 'repeated-judgement' ||
        kind === 'wrong-round'
      ) {
        h.emit(
          event({
            type: 'PLAYER_ACTION',
            roundId,
            songId,
            playerId,
            actionId,
            actionType: 'recognize',
          }),
        );
        if (kind === 'unknown-action')
          h.emit(event({ ...answer, actionId: 'unknown' }));
        if (kind === 'wrong-round')
          h.emit(event({ ...answer, roundId: 'other' }));
        if (kind === 'repeated-judgement') {
          h.emit(event(answer));
          h.emit(event(answer));
        }
      }
      if (kind === 'finish-before-close')
        h.emit(
          event({
            type: 'GAME_FINISHED',
            result: {
              session,
              status: 'completed',
              startedAt: h.emitted[0]!.occurredAt,
              endedAt: h.clock(),
              playedSongIds: session.songIds,
              judgements: [],
              scores: Object.fromEntries(
                session.playerIds.map((id) => [id, 0]),
              ),
            },
          }),
        );
    }
    error(await h.runtime.drainEvents(), 'EVENT_INVALID');
    expect(h.runtime.getSnapshot().playerProfiles).toEqual(s.playerProfiles);
    expect(h.runtime.getSnapshot().pendingGameplayEvidence).toEqual([]);
  });
  it.each(['create', 'start', 'stop'] as const)(
    'handles %s failures without a reusable ready state',
    async (kind) => {
      let actual: MusicGame | undefined;
      const factory: GameFactory = {
        capabilities,
        create: async (session, onEvent) => {
          if (kind === 'create') throw Error('create');
          actual = new MockKarutaGame(session, onEvent, {
            now: () => session.referenceTime,
            answers: [],
          });
          return Promise.resolve({
            ...actual,
            start: () =>
              kind === 'start'
                ? Promise.reject(Error('start'))
                : actual!.start(),
            getState: () => actual!.getState(),
            getResult: () => actual!.getResult(),
            stop: () =>
              kind === 'stop' ? Promise.reject(Error('stop')) : actual!.stop(),
          });
        },
      };
      const h = harness({ count: 1, factory });
      await h.ready();
      const result = await h.send('START_GAME');
      if (kind === 'stop') {
        expect(result.ok).toBe(true);
        error(await h.send('END_PARTY'), 'STOP_FAILED');
        expect(h.runtime.getSnapshot().phase).toBe('ended');
      } else {
        error(result, 'GAME_FAILED');
        expect(h.runtime.getSnapshot()).toMatchObject({
          phase: 'error',
          hostAcknowledgement: null,
          fairnessAssessment: null,
        });
        expect((await h.send('REGENERATE_FROM_ERROR')).ok).toBe(true);
      }
    },
  );
  it('blocks recovery when an invalid game cannot be stopped', async () => {
    const factory: GameFactory = {
      capabilities,
      create: async (session, onEvent) => {
        const actual = new MockKarutaGame(session, onEvent, {
          now: () => session.referenceTime,
          answers: [],
        });
        return Promise.resolve({
          start: () => actual.start(),
          getState: () => actual.getState(),
          getResult: () => actual.getResult(),
          stop: () => Promise.reject(Error('stop')),
        });
      },
    };
    const h = await playing({ count: 1, factory });
    h.emit({ ...h.emitted[0]!, eventId: 'bad', sequence: 999 } as GameEvent);
    error(await h.runtime.drainEvents(), 'STOP_FAILED');
    error(await h.send('REGENERATE_FROM_ERROR'), 'INVALID_PHASE');
    expect(h.runtime.getSnapshot().phase).toBe('error');
  });
  it.each(['event-result', 'adapter-result'] as const)(
    'rejects %s disagreement before profile settlement',
    async (mismatch) => {
      let mock: MockKarutaGame | undefined;
      const factory: GameFactory = {
        capabilities,
        create: async (session, onEvent) => {
          mock = new MockKarutaGame(
            session,
            (e) => {
              if (e.type === 'GAME_FINISHED' && mismatch === 'event-result') {
                const j = e.result.judgements[0]!;
                onEvent({
                  ...e,
                  result: {
                    ...e.result,
                    judgements: [{ ...j, outcome: 'wrong' }],
                    scores: Object.fromEntries(
                      session.playerIds.map((id) => [id, 0]),
                    ),
                  },
                });
              } else onEvent(e);
            },
            {
              now: () => session.referenceTime,
              answers: [
                {
                  songId: session.songIds[0]!,
                  playerId: session.playerIds[0]!,
                  outcome: 'correct',
                },
              ],
            },
          );
          return Promise.resolve({
            start: () => mock!.start(),
            getState: () => mock!.getState(),
            getResult: () =>
              mismatch === 'adapter-result'
                ? { status: 'not_finished' }
                : mock!.getResult(),
            stop: () => mock!.stop(),
          });
        },
      };
      const h = await playing({ count: 1, factory });
      const before = h.runtime.getSnapshot();
      mock!.advance();
      error(await h.runtime.drainEvents(), 'RESULT_MISMATCH');
      expect(h.runtime.getSnapshot()).toMatchObject({
        phase: 'error',
        gameHistory: [],
        playerProfiles: before.playerProfiles,
        pendingGameplayEvidence: [],
      });
    },
  );
});

describe('Mock adapter contracts', () => {
  it('rejects duplicate script answers and unsupported games', async () => {
    const h = await playing({ count: 1 });
    const session = h.runtime.getSnapshot().activeGameSession!;
    const answer = {
      songId: session.songIds[0]!,
      playerId: session.playerIds[0]!,
      outcome: 'correct' as const,
    };
    expect(
      () =>
        new MockKarutaGame(session, () => {}, {
          now: h.clock,
          answers: [answer, answer],
        }),
    ).toThrow();
    expect(
      () =>
        new MockKarutaGame(
          { ...session, gameType: GameTypeSchema.parse('other') },
          () => {},
          { now: h.clock, answers: [] },
        ),
    ).toThrow();
  });
  it('does not synthesize wrong answers for nonparticipants', async () => {
    const h = await playing({ count: 1 });
    await h.runtime.drainEvents();
    h.mock.latest!.advance();
    expect((await h.runtime.drainEvents()).ok).toBe(true);
    expect(h.runtime.getSnapshot().gameHistory[0]!.judgements).toHaveLength(0);
    expect(h.emitted.every((e) => GameEventSchema.safeParse(e).success)).toBe(
      true,
    );
  });
});
