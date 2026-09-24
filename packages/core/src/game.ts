import { z } from 'zod';
import {
  ActionIdSchema,
  GameSessionIdSchema,
  GameTypeSchema,
  JudgementIdSchema,
  PartyIdSchema,
  PlayerIdSchema,
  PositiveCountSchema,
  RoundIdSchema,
  SafeCountSchema,
  SongIdSchema,
  StableIdSchema,
  uniqueValues,
} from './ids.js';
import { EventIdSchema, UtcTimestampSchema } from './evidence.js';
import { RecognitionScopeSchema } from './recognition.js';
import { contractIssue, sameData, sameIds } from './contract-validation.js';

export const GameSessionInputSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    partyId: PartyIdSchema,
    gameSessionId: GameSessionIdSchema,
    selectionVersion: PositiveCountSchema,
    gameType: GameTypeSchema,
    roundNumber: PositiveCountSchema,
    playerIds: uniqueValues(PlayerIdSchema).refine(
      (ids) => ids.length > 0,
      'A game needs players',
    ),
    songIds: uniqueValues(SongIdSchema).refine(
      (ids) => ids.length > 0,
      'A game needs songs',
    ),
    referenceTime: UtcTimestampSchema,
  })
  .readonly();
export const JudgementSchema = z
  .strictObject({
    judgementId: JudgementIdSchema,
    actionId: ActionIdSchema,
    roundId: RoundIdSchema,
    songId: SongIdSchema,
    playerId: PlayerIdSchema,
    outcome: z.enum(['correct', 'wrong']),
    recognitionScope: RecognitionScopeSchema.optional(),
    occurredAt: UtcTimestampSchema,
  })
  .readonly();
export const GameResultSchema = z
  .strictObject({
    session: GameSessionInputSchema,
    status: z.enum(['completed', 'aborted']),
    startedAt: UtcTimestampSchema,
    endedAt: UtcTimestampSchema,
    playedSongIds: uniqueValues(SongIdSchema),
    judgements: z.array(JudgementSchema).readonly(),
    scores: z.record(PlayerIdSchema, SafeCountSchema).readonly(),
  })
  .superRefine((result, context) => {
    const session = result.session;
    if (
      Date.parse(result.startedAt) < Date.parse(session.referenceTime) ||
      Date.parse(result.endedAt) < Date.parse(result.startedAt)
    )
      contractIssue(
        context,
        ['endedAt'],
        'Expected referenceTime <= startedAt <= endedAt',
      );
    if (!sameIds(session.playerIds, Object.keys(result.scores)))
      contractIssue(
        context,
        ['scores'],
        'Scores must cover exactly the frozen players',
      );
    if (
      result.playedSongIds.some((id) => !session.songIds.includes(id)) ||
      (session.gameType === 'mock-karuta' &&
        result.status === 'completed' &&
        !sameIds(result.playedSongIds, session.songIds))
    )
      contractIssue(
        context,
        ['playedSongIds'],
        'Completed Mock games must play the whole frozen playlist',
      );
    for (const field of ['judgementId', 'actionId'] as const)
      if (
        new Set(result.judgements.map((item) => item[field])).size !==
        result.judgements.length
      )
        contractIssue(
          context,
          ['judgements'],
          'Duplicate judgement or action ID',
        );
    const pairs = new Set<string>();
    const roundSongs = new Map<string, string>();
    const songRounds = new Map<string, string>();
    for (const [i, item] of result.judgements.entries()) {
      const pair = JSON.stringify([item.playerId, item.songId]);
      if (
        !session.playerIds.includes(item.playerId) ||
        !result.playedSongIds.includes(item.songId) ||
        Date.parse(item.occurredAt) < Date.parse(result.startedAt) ||
        Date.parse(item.occurredAt) > Date.parse(result.endedAt) ||
        (session.gameType === 'mock-karuta' && pairs.has(pair))
      )
        contractIssue(
          context,
          ['judgements', i],
          'Judgement is outside the frozen game or duplicates a Mock answer',
        );
      pairs.add(pair);
      if (session.gameType === 'mock-karuta') {
        if (
          (roundSongs.has(item.roundId) &&
            roundSongs.get(item.roundId) !== item.songId) ||
          (songRounds.has(item.songId) &&
            songRounds.get(item.songId) !== item.roundId)
        )
          contractIssue(
            context,
            ['judgements', i],
            'Mock rounds and songs must map one to one',
          );
        roundSongs.set(item.roundId, item.songId);
        songRounds.set(item.songId, item.roundId);
      }
    }
    if (session.gameType === 'mock-karuta') {
      for (const id of session.playerIds) {
        const expected = result.judgements.filter(
          (item) => item.playerId === id && item.outcome === 'correct',
        ).length;
        if (result.scores[id] !== expected)
          contractIssue(
            context,
            ['scores', id],
            'Mock score must equal correct judgements',
          );
      }
    }
  })
  .readonly();
const envelope = {
  eventId: EventIdSchema,
  partyId: PartyIdSchema,
  gameSessionId: GameSessionIdSchema,
  selectionVersion: PositiveCountSchema,
  sequence: PositiveCountSchema,
  occurredAt: UtcTimestampSchema,
};
const answer = {
  roundId: RoundIdSchema,
  songId: SongIdSchema,
  playerId: PlayerIdSchema,
  actionId: ActionIdSchema,
};
export const GameEventSchema = z
  .discriminatedUnion('type', [
    z.strictObject({
      ...envelope,
      type: z.literal('GAME_STARTED'),
      gameType: GameTypeSchema,
    }),
    z.strictObject({
      ...envelope,
      type: z.literal('ROUND_STARTED'),
      roundId: RoundIdSchema,
    }),
    z.strictObject({
      ...envelope,
      type: z.literal('SONG_STARTED'),
      roundId: RoundIdSchema,
      songId: SongIdSchema,
    }),
    z.strictObject({
      ...envelope,
      ...answer,
      type: z.literal('PLAYER_ACTION'),
      actionType: StableIdSchema,
    }),
    z.strictObject({
      ...envelope,
      ...answer,
      type: z.literal('ANSWER_CORRECT'),
      judgementId: JudgementIdSchema,
      recognitionScope: RecognitionScopeSchema.optional(),
    }),
    z.strictObject({
      ...envelope,
      ...answer,
      type: z.literal('ANSWER_WRONG'),
      judgementId: JudgementIdSchema,
      recognitionScope: RecognitionScopeSchema.optional(),
    }),
    z.strictObject({
      ...envelope,
      type: z.literal('ROUND_FINISHED'),
      roundId: RoundIdSchema,
    }),
    z.strictObject({
      ...envelope,
      type: z.literal('GAME_FINISHED'),
      result: GameResultSchema,
    }),
  ])
  .readonly();
export const GameEventContextSchema = z
  .strictObject({
    session: GameSessionInputSchema,
    event: GameEventSchema,
  })
  .superRefine(({ session, event }, context) => {
    if (
      event.partyId !== session.partyId ||
      event.gameSessionId !== session.gameSessionId ||
      event.selectionVersion !== session.selectionVersion ||
      Date.parse(event.occurredAt) < Date.parse(session.referenceTime)
    )
      contractIssue(
        context,
        ['event'],
        'Event does not belong to the frozen session/version/time',
      );
    if ('playerId' in event && !session.playerIds.includes(event.playerId))
      contractIssue(context, ['event', 'playerId'], 'Unknown game player');
    if ('songId' in event && !session.songIds.includes(event.songId))
      contractIssue(context, ['event', 'songId'], 'Unknown game song');
    if (event.type === 'GAME_STARTED' && event.gameType !== session.gameType)
      contractIssue(
        context,
        ['event', 'gameType'],
        'Game type differs from frozen session',
      );
    if (
      event.type === 'GAME_FINISHED' &&
      (!sameData(event.result.session, session) ||
        event.result.status !== 'completed' ||
        Date.parse(event.occurredAt) !== Date.parse(event.result.endedAt))
    )
      contractIssue(
        context,
        ['event', 'result'],
        'Finished event must carry this completed game and its ending time',
      );
  })
  .readonly();
export const GameResultStateSchema = z
  .discriminatedUnion('status', [
    z.strictObject({ status: z.literal('not_finished') }),
    z.strictObject({ status: z.literal('finished'), result: GameResultSchema }),
  ])
  .readonly();
export const GameStateSchema = z
  .strictObject({
    session: GameSessionInputSchema,
    phase: z.enum(['created', 'playing', 'finished', 'stopped', 'error']),
    currentRoundId: RoundIdSchema.nullable(),
    currentSongId: SongIdSchema.nullable(),
    lastSequence: SafeCountSchema,
  })
  .superRefine((state, context) => {
    if (
      state.currentSongId !== null &&
      (!state.session.songIds.includes(state.currentSongId) ||
        state.currentRoundId === null)
    )
      contractIssue(
        context,
        ['currentSongId'],
        'Current song needs a round and frozen song ID',
      );
  })
  .readonly();
export type GameSessionInput = z.infer<typeof GameSessionInputSchema>;
export type GameEvent = z.infer<typeof GameEventSchema>;
export type GameResult = z.infer<typeof GameResultSchema>;
export type GameState = z.infer<typeof GameStateSchema>;
export type GameResultState = z.infer<typeof GameResultStateSchema>;
export interface MusicGame {
  start(): Promise<void>;
  getState(): GameState;
  getResult(): GameResultState;
  stop(): Promise<void>;
}
export interface GameFactory {
  readonly capabilities: readonly z.infer<typeof GameTypeSchema>[];
  create(
    session: GameSessionInput,
    onEvent: (event: GameEvent) => void,
  ): Promise<MusicGame>;
}
