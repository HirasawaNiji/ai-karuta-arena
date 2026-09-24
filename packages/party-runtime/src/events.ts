import {
  GameEventContextSchema,
  type GameEvent,
  type GameSessionInput,
  type GameResult,
} from '@amp/core';
import { canonical, copy, requireCondition as check } from './util.js';
export interface EventProgress {
  sequence: number;
  time: string;
  startedAt: string | null;
  roundId: string | null;
  songId: string | null;
  rounds: string[];
  songs: string[];
  actions: Extract<GameEvent, { type: 'PLAYER_ACTION' }>[];
  judgements: GameResult['judgements'][number][];
}
export function initialProgress(session: GameSessionInput): EventProgress {
  return {
    sequence: 0,
    time: session.referenceTime,
    startedAt: null,
    roundId: null,
    songId: null,
    rounds: [],
    songs: [],
    actions: [],
    judgements: [],
  };
}
/** Validate a prospective event on a copy; a rejected event never mutates progress. */
export function advanceProgress(
  previous: EventProgress,
  session: GameSessionInput,
  event: GameEvent,
): EventProgress {
  check(
    GameEventContextSchema.safeParse({ session, event }).success,
    'EVENT_INVALID',
    'Event differs from frozen session',
  );
  const p = copy(previous);
  check(
    event.sequence === p.sequence + 1 &&
      Date.parse(event.occurredAt) >= Date.parse(p.time),
    'EVENT_INVALID',
    'Event sequence or time is invalid',
  );
  const valid = (condition: unknown) =>
    check(condition, 'EVENT_INVALID', 'Illegal game event order or identity');
  if (event.type === 'GAME_STARTED') {
    valid(!p.startedAt && p.sequence === 0);
    p.startedAt = event.occurredAt;
  } else {
    valid(p.startedAt);
    switch (event.type) {
      case 'ROUND_STARTED':
        valid(
          !p.roundId &&
            !p.rounds.includes(event.roundId) &&
            p.songs.length < session.songIds.length,
        );
        p.roundId = event.roundId;
        p.rounds.push(event.roundId);
        break;
      case 'SONG_STARTED':
        valid(
          p.roundId === event.roundId &&
            !p.songId &&
            !p.songs.includes(event.songId),
        );
        p.songId = event.songId;
        p.songs.push(event.songId);
        break;
      case 'PLAYER_ACTION':
        valid(
          p.roundId === event.roundId &&
            p.songId === event.songId &&
            !p.actions.some(
              (a) =>
                a.actionId === event.actionId ||
                (a.playerId === event.playerId && a.songId === event.songId),
            ),
        );
        p.actions.push(event);
        break;
      case 'ANSWER_CORRECT':
      case 'ANSWER_WRONG': {
        const action = p.actions.find((a) => a.actionId === event.actionId);
        valid(
          p.roundId === event.roundId &&
            p.songId === event.songId &&
            action &&
            action.playerId === event.playerId &&
            action.songId === event.songId &&
            action.roundId === event.roundId &&
            !p.judgements.some(
              (j) =>
                j.actionId === event.actionId ||
                j.judgementId === event.judgementId,
            ),
        );
        p.judgements.push({
          judgementId: event.judgementId,
          actionId: event.actionId,
          roundId: event.roundId,
          songId: event.songId,
          playerId: event.playerId,
          outcome: event.type === 'ANSWER_CORRECT' ? 'correct' : 'wrong',
          occurredAt: event.occurredAt,
          ...(event.recognitionScope
            ? { recognitionScope: event.recognitionScope }
            : {}),
        });
        break;
      }
      case 'ROUND_FINISHED':
        valid(p.roundId === event.roundId && p.songId);
        p.roundId = null;
        p.songId = null;
        break;
      case 'GAME_FINISHED':
        valid(
          !p.roundId &&
            (session.gameType !== 'mock-karuta' ||
              p.songs.length === session.songIds.length),
        );
        check(
          event.result.startedAt === p.startedAt &&
            canonical(event.result.playedSongIds) === canonical(p.songs) &&
            canonical(event.result.judgements) === canonical(p.judgements),
          'RESULT_MISMATCH',
          'Result differs from accepted game events',
        );
        break;
    }
  }
  p.sequence = event.sequence;
  p.time = event.occurredAt;
  return p;
}
