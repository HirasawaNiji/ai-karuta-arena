import {
  GameTypeSchema,
  GameSessionInputSchema,
  GameEventSchema,
  GameStateSchema,
  GameResultSchema,
  type GameFactory,
  type MusicGame,
  type GameSessionInput,
  type GameEvent,
  type GameState,
  type GameResultState,
  type GameResult,
  type PlayerId,
  type SongId,
  type RecognitionScope,
} from '@amp/core';
export interface MockAnswer {
  readonly songId: SongId;
  readonly playerId: PlayerId;
  readonly outcome: 'correct' | 'wrong';
  readonly recognitionScope?: RecognitionScope;
}
export interface MockGameOptions {
  readonly now: () => string;
  readonly answers: readonly MockAnswer[];
}
/** start returns immediately; the caller explicitly advances one song then drains runtime events. */
export class MockKarutaGame implements MusicGame {
  private state: GameState;
  private result: GameResultState = { status: 'not_finished' };
  private readonly answers: readonly MockAnswer[];
  private readonly judgements: GameResult['judgements'][number][] = [];
  private readonly played: SongId[] = [];
  private startedAt: string | null = null;
  private lastTime: string;
  constructor(
    private readonly session: GameSessionInput,
    private readonly emit: (event: GameEvent) => void,
    private readonly options: MockGameOptions,
  ) {
    this.session = GameSessionInputSchema.parse(session);
    if (session.gameType !== 'mock-karuta')
      throw new Error('Unsupported mock game');
    this.answers = structuredClone(options.answers);
    const pairs = new Set<string>();
    for (const answer of this.answers) {
      const pair = JSON.stringify([answer.songId, answer.playerId]);
      if (
        !session.songIds.includes(answer.songId) ||
        !session.playerIds.includes(answer.playerId) ||
        pairs.has(pair) ||
        !['correct', 'wrong'].includes(answer.outcome)
      )
        throw new Error('Invalid Mock script');
      pairs.add(pair);
    }
    this.lastTime = session.referenceTime;
    this.state = GameStateSchema.parse({
      session: this.session,
      phase: 'created',
      currentRoundId: null,
      currentSongId: null,
      lastSequence: 0,
    });
  }
  private send(payload: Record<string, unknown>) {
    const occurredAt = this.options.now();
    if (Date.parse(occurredAt) < Date.parse(this.lastTime))
      throw new Error('Mock clock moved backwards');
    const sequence = this.state.lastSequence + 1;
    const event = GameEventSchema.parse({
      ...payload,
      eventId: this.session.gameSessionId + ':event:' + sequence,
      partyId: this.session.partyId,
      gameSessionId: this.session.gameSessionId,
      selectionVersion: this.session.selectionVersion,
      sequence,
      occurredAt,
    });
    this.lastTime = occurredAt;
    this.state = { ...this.state, lastSequence: sequence };
    this.emit(event);
    return event;
  }
  start(): Promise<void> {
    if (this.state.phase !== 'created')
      return Promise.reject(new Error('Mock already started'));
    this.state = { ...this.state, phase: 'playing' };
    this.startedAt = this.send({
      type: 'GAME_STARTED',
      gameType: this.session.gameType,
    }).occurredAt;
    return Promise.resolve();
  }
  advance(): void {
    if (this.state.phase !== 'playing') throw new Error('Mock is not playing');
    const songId = this.session.songIds[this.played.length]!;
    const roundId =
      this.session.gameSessionId + ':round:' + (this.played.length + 1);
    this.state = {
      ...this.state,
      currentRoundId: roundId as GameState['currentRoundId'],
    };
    this.send({ type: 'ROUND_STARTED', roundId });
    this.state = { ...this.state, currentSongId: songId };
    this.send({ type: 'SONG_STARTED', roundId, songId });
    this.played.push(songId);
    for (const answer of this.answers.filter((a) => a.songId === songId)) {
      const actionId = roundId + ':action:' + answer.playerId,
        judgementId = roundId + ':judgement:' + answer.playerId;
      const common = { roundId, songId, playerId: answer.playerId, actionId };
      this.send({ ...common, type: 'PLAYER_ACTION', actionType: 'recognize' });
      const event = this.send({
        ...common,
        type: answer.outcome === 'correct' ? 'ANSWER_CORRECT' : 'ANSWER_WRONG',
        judgementId,
        ...(answer.recognitionScope
          ? { recognitionScope: answer.recognitionScope }
          : {}),
      });
      if (event.type !== 'ANSWER_CORRECT' && event.type !== 'ANSWER_WRONG')
        throw new Error('Invalid answer event');
      this.judgements.push({
        roundId: event.roundId,
        songId: event.songId,
        playerId: event.playerId,
        actionId: event.actionId,
        judgementId: event.judgementId,
        outcome: answer.outcome,
        occurredAt: event.occurredAt,
        ...(answer.recognitionScope
          ? { recognitionScope: answer.recognitionScope }
          : {}),
      });
    }
    this.send({ type: 'ROUND_FINISHED', roundId });
    this.state = { ...this.state, currentRoundId: null, currentSongId: null };
    if (this.played.length === this.session.songIds.length) {
      const endedAt = this.options.now();
      const result = GameResultSchema.parse({
        session: this.session,
        status: 'completed',
        startedAt: this.startedAt,
        endedAt,
        playedSongIds: this.played,
        judgements: this.judgements,
        scores: Object.fromEntries(
          this.session.playerIds.map((id) => [
            id,
            this.judgements.filter(
              (j) => j.playerId === id && j.outcome === 'correct',
            ).length,
          ]),
        ),
      });
      // Set the result before emitting GAME_FINISHED; callbacks only enqueue.
      this.result = { status: 'finished', result };
      this.state = { ...this.state, phase: 'finished' };
      // Use the very same timestamp as the result, even for an incrementing clock.
      const sequence = this.state.lastSequence + 1;
      const event = GameEventSchema.parse({
        type: 'GAME_FINISHED',
        eventId: this.session.gameSessionId + ':event:' + sequence,
        partyId: this.session.partyId,
        gameSessionId: this.session.gameSessionId,
        selectionVersion: this.session.selectionVersion,
        sequence,
        occurredAt: endedAt,
        result,
      });
      if (Date.parse(endedAt) < Date.parse(this.lastTime))
        throw new Error('Mock clock moved backwards');
      this.lastTime = endedAt;
      this.state = { ...this.state, lastSequence: sequence };
      this.emit(event);
    }
  }
  getState(): GameState {
    return structuredClone(this.state);
  }
  getResult(): GameResultState {
    return structuredClone(this.result);
  }
  stop(): Promise<void> {
    this.state = { ...this.state, phase: 'stopped' };
    return Promise.resolve();
  }
}
export class MockGameFactory implements GameFactory {
  readonly capabilities: GameFactory['capabilities'] = [
    GameTypeSchema.parse('mock-karuta'),
  ];
  private games: MockKarutaGame[] = [];
  constructor(
    private readonly options: (session: GameSessionInput) => MockGameOptions,
  ) {}
  create(
    session: GameSessionInput,
    onEvent: (event: GameEvent) => void,
  ): Promise<MockKarutaGame> {
    const game = new MockKarutaGame(session, onEvent, this.options(session));
    this.games.push(game);
    return Promise.resolve(game);
  }
  get latest(): MockKarutaGame | undefined {
    return this.games.at(-1);
  }
}
