import { describe, expect, it } from 'vitest';
import {
  AssessmentInputSchema,
  SelectionRequestSchema,
  SelectionResultSchema,
  FairnessAssessmentSchema,
  PartyActorSchema,
  PartyCommandSchema,
  PartySetupInputSchema,
  PartyStateSchema,
  EvaluationContextSchema,
  GameSessionInputSchema,
  GameEventSchema,
  GameEventContextSchema,
  GameResultSchema,
  GameResultStateSchema,
  HostDecisionSchema,
  HostContextSchema,
  StartCheckSchema,
  DomainErrorSchema,
  ResultSchema,
} from '@amp/core';
import { referenceTime, observedAt, matrixInput } from './fixtures/profile.js';
import {
  configInput,
  selectionRequestInput,
  selectionResultInput,
  assessmentInput,
  sessionInput,
  gameResultInput,
  eventEnvelope,
  setupInput,
  evaluationContextInput,
  partyStateInput,
  warningStateInput,
  acknowledgedStateInput,
  commandEnvelope,
} from './fixtures/runtime.js';

describe('selection and assessment boundaries', () => {
  it('accepts coherent inputs and preserves isolated readonly output', () => {
    const request = selectionRequestInput();
    const parsed = SelectionRequestSchema.parse(request);
    request.availability['song:1'].available = false;
    expect(Object.values(parsed.availability)[0]!.available).toBe(true);
    expect(Object.isFrozen(parsed.profileContext.matrix)).toBe(true);
    expect(
      SelectionResultSchema.safeParse(selectionResultInput()).success,
    ).toBe(true);
    expect(
      AssessmentInputSchema.safeParse({
        playerIds: ['player:1'],
        selectedSongIds: ['song:1'],
        matrix: matrixInput(),
        requestedCount: 1,
        fairnessConfig: configInput().fairness,
        selectionVersion: 1,
      }).success,
    ).toBe(true);
  });
  it.each([
    { candidateSongIds: ['song:1', 'song:1'] },
    { candidateSongIds: ['missing'] },
    { availability: {} },
    { availability: { 'song:1': { available: false } } },
    { requestedCount: 0 },
    { requestedCount: Number.MAX_SAFE_INTEGER + 1 },
    { selectionVersion: 0 },
    { roundNumber: 0 },
  ])('rejects invalid selection input %#', (change) => {
    expect(
      SelectionRequestSchema.safeParse({
        ...selectionRequestInput(),
        ...change,
      }).success,
    ).toBe(false);
  });
  it('retains unavailable candidates and historic bans for the selection filter', () => {
    const request = selectionRequestInput();
    expect(
      SelectionRequestSchema.safeParse({
        ...request,
        bannedSongIds: ['old-catalog-song'],
        availability: {
          'song:1': { available: false, reason: 'No verified audio' },
        },
      }).success,
    ).toBe(true);
  });
  it.each([
    { selectedSongIds: ['missing'] },
    { playerIds: [] },
    { selectedSongIds: ['song:1', 'song:1'] },
  ])(
    'rejects assessment references that are not in the matrix %#',
    (change) => {
      expect(
        AssessmentInputSchema.safeParse({
          playerIds: ['player:1'],
          selectedSongIds: ['song:1'],
          matrix: matrixInput(),
          requestedCount: 1,
          fairnessConfig: configInput().fairness,
          selectionVersion: 1,
          ...change,
        }).success,
      ).toBe(false);
    },
  );
  it('represents an empty assessment with null ratios and explicit hard blockers', () => {
    const empty = {
      ...assessmentInput(),
      playerIds: [],
      selectedSongIds: [],
      actualCount: 0,
      playerMetrics: {},
      validity: false,
      passed: false,
      maxCoverageGap: null,
      reasons: [
        { code: 'NO_PLAYERS' },
        { code: 'EMPTY_PLAYLIST' },
        { code: 'SHORT_PLAYLIST', observed: 0, threshold: 1 },
      ],
    };
    expect(FairnessAssessmentSchema.safeParse(empty).success).toBe(true);
    expect(
      FairnessAssessmentSchema.safeParse({ ...empty, maxCoverageGap: 0 })
        .success,
    ).toBe(false);
    expect(
      FairnessAssessmentSchema.safeParse({ ...empty, passed: true }).success,
    ).toBe(false);
  });
  it('requires SHORT_PLAYLIST to retain the original request instead of hiding it', () => {
    const short = warningStateInput().fairnessAssessment!;
    expect(FairnessAssessmentSchema.safeParse(short).success).toBe(true);
    expect(
      FairnessAssessmentSchema.safeParse({ ...short, reasons: [] }).success,
    ).toBe(false);
    expect(
      FairnessAssessmentSchema.safeParse({
        ...short,
        reasons: [{ code: 'SHORT_PLAYLIST', observed: 1, threshold: 1 }],
      }).success,
    ).toBe(false);
    expect(
      FairnessAssessmentSchema.safeParse({ ...short, passed: true }).success,
    ).toBe(false);
  });
  it.each([
    { actualCount: 0 },
    { playerMetrics: {} },
    { fairnessConfigVersion: 'old' },
    { maxCoverageGap: null },
    { validity: false },
    {
      reasons: [
        {
          code: 'LOW_COVERAGE',
          playerId: 'foreign',
          observed: 0,
          threshold: 0.25,
        },
      ],
    },
  ])('rejects contradictory assessment structures %#', (change) => {
    expect(
      FairnessAssessmentSchema.safeParse({ ...assessmentInput(), ...change })
        .success,
    ).toBe(false);
  });
  it('checks metric counts and ratios against actual playlist length', () => {
    const input = assessmentInput();
    input.playerMetrics['player:1'].familiarCount = 2;
    expect(FairnessAssessmentSchema.safeParse(input).success).toBe(false);
    input.playerMetrics['player:1'].familiarCount = 1;
    input.playerMetrics['player:1'].coverageRatio = 0.5;
    expect(FairnessAssessmentSchema.safeParse(input).success).toBe(false);
  });
  it('rejects a result attached to a different playlist, version or config', () => {
    const input = selectionResultInput();
    input.steps[0]!.songId = 'other';
    expect(SelectionResultSchema.safeParse(input).success).toBe(false);
    const old = selectionResultInput();
    old.inputVersions.selectionVersion = 2;
    expect(SelectionResultSchema.safeParse(old).success).toBe(false);
    const changed = selectionResultInput();
    changed.inputVersions.fairnessConfig.minCoverageRatio = 0.8;
    expect(SelectionResultSchema.safeParse(changed).success).toBe(false);
  });
  it('rejects impossible single-step coverage, unknown players and unsafe tie-break numbers', () => {
    const input = selectionResultInput();
    input.steps[0]!.coverageAfter['player:1'] = 2;
    expect(SelectionResultSchema.safeParse(input).success).toBe(false);
    input.steps[0]!.coverageAfter['player:1'] = 1;
    input.steps[0]!.gainKey = Number.MAX_SAFE_INTEGER + 1;
    expect(SelectionResultSchema.safeParse(input).success).toBe(false);
    const foreign = selectionResultInput();
    Object.assign(foreign, { unfilledCoverage: { foreign: 0 } });
    expect(SelectionResultSchema.safeParse(foreign).success).toBe(false);
  });
});

describe('commands are intentions, distinct from actors and host suggestions', () => {
  const timed = [
    'GENERATE',
    'REGENERATE',
    'START_NEXT_ROUND',
    'REGENERATE_FROM_ERROR',
    'REFRESH_PROFILES',
  ];
  const simple = [
    'BEGIN_BAN',
    'FINISH_BAN',
    'ACKNOWLEDGE_CONTINUE',
    'START_GAME',
    'END_PARTY',
  ];
  it.each([
    ...timed.map((type) => ({ type, referenceTime })),
    ...simple.map((type) => ({ type })),
    { type: 'INITIALIZE', referenceTime, expectedVersion: 0 },
    { type: 'BAN_SONG', songId: 'song:1' },
    { type: 'REPLACE_SONG', oldSongId: 'song:1', newSongId: 'song:2' },
    { type: 'UPDATE_MEMBERS', players: setupInput().players, referenceTime },
    {
      type: 'UPDATE_CATALOG',
      catalog: setupInput().catalog,
      candidateSongIds: ['song:1'],
      availability: setupInput().availability,
      referenceTime,
    },
    {
      type: 'UPDATE_CONFIG',
      config: configInput(),
      requestedCount: 12,
      partyPreferences: { excludePlayedSongs: true },
      referenceTime,
    },
    { type: 'CHANGE_GAME', gameType: 'future-mode' },
  ])('accepts the required payload for $type', (payload) => {
    expect(
      PartyCommandSchema.safeParse({ ...commandEnvelope(), ...payload })
        .success,
    ).toBe(true);
  });
  it.each([
    { type: 'BAN_SONG' },
    { type: 'REPLACE_SONG', oldSongId: 'song:1' },
    { type: 'INITIALIZE', expectedVersion: 1, referenceTime },
    { type: 'START_NEXT_ROUND' },
    { type: 'UNBAN', songId: 'song:1' },
    { type: 'START_GAME', expectedVersion: -1 },
    { type: 'START_GAME', actor: { role: 'host', playerId: 'player:1' } },
  ])('rejects malformed or unsupported command payload %#', (payload) => {
    expect(
      PartyCommandSchema.safeParse({ ...commandEnvelope(), ...payload })
        .success,
    ).toBe(false);
  });
  it('rejects duplicate members and broken catalog updates before runtime dispatch', () => {
    expect(
      PartyCommandSchema.safeParse({
        ...commandEnvelope(),
        type: 'UPDATE_MEMBERS',
        referenceTime,
        players: [...setupInput().players, ...setupInput().players],
      }).success,
    ).toBe(false);
    expect(
      PartyCommandSchema.safeParse({
        ...commandEnvelope(),
        type: 'UPDATE_CATALOG',
        referenceTime,
        catalog: setupInput().catalog,
        candidateSongIds: ['missing'],
        availability: {},
      }).success,
    ).toBe(false);
  });
  it.each([
    { role: 'host' },
    { role: 'player' },
    { role: 'ai', playerId: 'player:1' },
    { role: 'system', playerId: 'player:1' },
  ])('rejects malformed actor %#', (actor) => {
    expect(PartyActorSchema.safeParse(actor).success).toBe(false);
  });
  it('accepts explicit actors but never treats a host suggestion as confirmation', () => {
    expect(
      PartyActorSchema.safeParse({ role: 'host', playerId: 'player:1' })
        .success,
    ).toBe(true);
    expect(PartyActorSchema.safeParse({ role: 'system' }).success).toBe(true);
    expect(
      HostDecisionSchema.safeParse({
        action: 'REQUEST_HOST_CHOICE',
        reason: 'Short playlist',
        message: 'Choose next step',
        reasonCodes: ['SHORT_PLAYLIST'],
      }).success,
    ).toBe(true);
    expect(
      HostDecisionSchema.safeParse({
        action: 'ACKNOWLEDGE_CONTINUE',
        reason: 'Auto accept',
        message: 'Go',
        reasonCodes: [],
      }).success,
    ).toBe(false);
  });
});

describe('party snapshot consistency', () => {
  it('accepts a prepared party and returns deep readonly state', () => {
    const input = partyStateInput();
    const output = PartyStateSchema.parse(input);
    expect(Object.isFrozen(output.config.scoring.weights)).toBe(true);
    expect(Object.isFrozen(output.evaluationContext?.profiles)).toBe(true);
    input.currentPlaylist.push('foreign');
    expect(output.currentPlaylist).toEqual(['song:1']);
  });
  it('accepts setup before loading profiles and matrices', () => {
    const state = partyStateInput();
    Object.assign(state, {
      phase: 'setup',
      hostState: 'awaiting_host_choice',
      selectionVersion: 0,
      currentPlaylist: [],
      playerProfiles: [],
      matrix: null,
      evaluationContext: null,
      fairnessAssessment: null,
      selectionResult: null,
    });
    expect(PartySetupInputSchema.safeParse(setupInput()).success).toBe(true);
    expect(PartyStateSchema.safeParse(state).success).toBe(true);
  });
  it('blocks ban-phase readiness and permits only a cleared assessment while banning', () => {
    const state = partyStateInput();
    state.banPhase = 'open';
    expect(PartyStateSchema.safeParse(state).success).toBe(false);
    state.hostState = 'awaiting_host_choice';
    state.fairnessAssessment = null;
    state.evaluationContext = null;
    expect(PartyStateSchema.safeParse(state).success).toBe(true);
  });
  it('binds informed continuation to current warnings without changing passed=false', () => {
    expect(PartyStateSchema.safeParse(warningStateInput()).success).toBe(true);
    const state = acknowledgedStateInput();
    const output = PartyStateSchema.parse(state);
    expect(output.hostState).toBe('ready');
    expect(output.fairnessAssessment!.passed).toBe(false);
    expect(output.fairnessAssessment!.reasons[0]!.code).toBe('SHORT_PLAYLIST');
    state.hostAcknowledgement!.reasons = [];
    expect(PartyStateSchema.safeParse(state).success).toBe(false);
  });
  it.each([
    [
      'stale version',
      (state: ReturnType<typeof acknowledgedStateInput>) => {
        state.hostAcknowledgement!.selectionVersion = 2;
      },
    ],
    [
      'different host',
      (state: ReturnType<typeof acknowledgedStateInput>) => {
        state.hostAcknowledgement!.playerId = 'foreign';
      },
    ],
    [
      'old confirmation time',
      (state: ReturnType<typeof acknowledgedStateInput>) => {
        state.hostAcknowledgement!.acknowledgedAt = observedAt;
      },
    ],
    [
      'hidden warnings',
      (state: ReturnType<typeof acknowledgedStateInput>) => {
        state.fairnessAssessment!.passed = true;
      },
    ],
  ] as const)('rejects %s', (_name, mutate) => {
    const state = acknowledgedStateInput();
    mutate(state);
    expect(PartyStateSchema.safeParse(state).success).toBe(false);
  });
  it.each([
    [
      'config content',
      (state: ReturnType<typeof partyStateInput>) => {
        state.config.selection.softRatioWeight = 0.5;
      },
    ],
    [
      'profile version',
      (state: ReturnType<typeof partyStateInput>) => {
        state.playerProfiles[0]!.profileVersion = 2;
      },
    ],
    [
      'time',
      (state: ReturnType<typeof partyStateInput>) => {
        state.referenceTime = '2026-09-25T00:00:00Z';
      },
    ],
    [
      'game',
      (state: ReturnType<typeof partyStateInput>) => {
        state.currentGame = 'another';
      },
    ],
    [
      'history rule',
      (state: ReturnType<typeof partyStateInput>) => {
        state.partyPreferences.excludePlayedSongs = false;
      },
    ],
    [
      'round',
      (state: ReturnType<typeof partyStateInput>) => {
        state.currentRound = 2;
      },
    ],
    [
      'requested count',
      (state: ReturnType<typeof partyStateInput>) => {
        state.requestedCount = 2;
      },
    ],
    [
      'availability',
      (state: ReturnType<typeof partyStateInput>) => {
        state.availability['song:1'].available = false;
      },
    ],
    [
      'banned song',
      (state: ReturnType<typeof partyStateInput>) => {
        state.bannedSongIds.push('song:1');
      },
    ],
    [
      'catalog',
      (state: ReturnType<typeof partyStateInput>) => {
        state.catalogVersion = 'different';
      },
    ],
  ] as const)('rejects stale evaluation after changing %s', (_name, mutate) => {
    const state = partyStateInput();
    mutate(state);
    expect(PartyStateSchema.safeParse(state).success).toBe(false);
  });
  it('rejects duplicate members, unknown host, missing matrix and fake readiness', () => {
    const state = partyStateInput();
    state.players.push(state.players[0]!);
    expect(PartyStateSchema.safeParse(state).success).toBe(false);
    const host = setupInput();
    host.hostPlayerId = 'foreign';
    expect(PartySetupInputSchema.safeParse(host).success).toBe(false);
    const missing = partyStateInput();
    missing.matrix = null;
    expect(PartyStateSchema.safeParse(missing).success).toBe(false);
    const unassessed = partyStateInput();
    unassessed.fairnessAssessment = null;
    expect(PartyStateSchema.safeParse(unassessed).success).toBe(false);
  });
  it('requires canonical context sets without sorting the played playlist', () => {
    const context = evaluationContextInput();
    context.bannedSongIds = ['z-old', 'a-old'];
    expect(EvaluationContextSchema.safeParse(context).success).toBe(false);
    context.bannedSongIds.sort();
    expect(EvaluationContextSchema.safeParse(context).success).toBe(true);
  });
  it('requires a frozen session while playing and keeps active/history sessions separate', () => {
    const state = partyStateInput();
    state.phase = 'playing';
    state.hostState = 'awaiting_host_choice';
    expect(PartyStateSchema.safeParse(state).success).toBe(false);
    state.activeGameSession = sessionInput();
    expect(PartyStateSchema.safeParse(state).success).toBe(true);
    state.gameHistory = [gameResultInput()];
    expect(PartyStateSchema.safeParse(state).success).toBe(false);
  });
  it('accepts settled history after clearing start permission, rejects duplicate settlement', () => {
    const state = partyStateInput();
    Object.assign(state, {
      phase: 'finished',
      hostState: 'awaiting_host_choice',
      selectionVersion: 2,
      evaluationContext: null,
      fairnessAssessment: null,
      matrix: null,
      gameHistory: [gameResultInput()],
    });
    expect(PartyStateSchema.safeParse(state).success).toBe(true);
    state.gameHistory.push(gameResultInput());
    expect(PartyStateSchema.safeParse(state).success).toBe(false);
  });
  it('allows only processed answer evidence in an active game', () => {
    const state = partyStateInput();
    state.phase = 'playing';
    state.hostState = 'awaiting_host_choice';
    state.activeGameSession = sessionInput();
    state.pendingGameplayEvidence = [
      {
        type: 'game_correct',
        evidenceId: 'evidence:game:1',
        playerId: 'player:1',
        sourceId: 'mock-game',
        observedAt: '2026-09-24T00:00:02Z',
        occurredAt: '2026-09-24T00:00:01.500Z',
        eventId: 'event:answer',
        songId: 'song:1',
      },
    ];
    expect(PartyStateSchema.safeParse(state).success).toBe(false);
    state.processedEventIds = ['event:answer'];
    expect(PartyStateSchema.safeParse(state).success).toBe(true);
    state.pendingGameplayEvidence[0]!.playerId = 'foreign';
    expect(PartyStateSchema.safeParse(state).success).toBe(false);
  });
  it('never retains ready/assessment in ended state and rejects contradictory start checks', () => {
    const state = partyStateInput();
    state.phase = 'ended';
    expect(PartyStateSchema.safeParse(state).success).toBe(false);
    state.hostState = 'ended';
    state.fairnessAssessment = null;
    state.evaluationContext = null;
    expect(PartyStateSchema.safeParse(state).success).toBe(true);
    expect(
      StartCheckSchema.safeParse({
        allowed: true,
        blockers: ['BAN_OPEN'],
        acknowledgedWarnings: [],
      }).success,
    ).toBe(false);
  });
  it('does not let host narration substitute another assessment or an unrecorded game result', () => {
    const snapshot = partyStateInput();
    expect(
      HostContextSchema.safeParse({
        snapshot,
        assessment: snapshot.fairnessAssessment,
        gameResult: null,
      }).success,
    ).toBe(true);
    expect(
      HostContextSchema.safeParse({
        snapshot,
        assessment: null,
        gameResult: null,
      }).success,
    ).toBe(false);
    expect(
      HostContextSchema.safeParse({
        snapshot,
        assessment: snapshot.fairnessAssessment,
        gameResult: gameResultInput(),
      }).success,
    ).toBe(false);
  });
});

describe('frozen game events and results', () => {
  const action = {
    roundId: 'round:1',
    songId: 'song:1',
    playerId: 'player:1',
    actionId: 'action:1',
  };
  it.each([
    { type: 'GAME_STARTED', gameType: 'mock-karuta' },
    { type: 'ROUND_STARTED', roundId: 'round:1' },
    { type: 'SONG_STARTED', roundId: 'round:1', songId: 'song:1' },
    { type: 'PLAYER_ACTION', ...action, actionType: 'claim' },
    { type: 'ANSWER_CORRECT', ...action, judgementId: 'judgement:1' },
    { type: 'ANSWER_WRONG', ...action, judgementId: 'judgement:1' },
    { type: 'ROUND_FINISHED', roundId: 'round:1' },
    {
      type: 'GAME_FINISHED',
      result: gameResultInput(),
      occurredAt: '2026-09-24T00:00:02Z',
    },
  ])('accepts the typed $type envelope', (payload) => {
    expect(
      GameEventContextSchema.safeParse({
        session: sessionInput(),
        event: { ...eventEnvelope(), ...payload },
      }).success,
    ).toBe(true);
  });
  it.each([
    { playerIds: [] },
    { songIds: [] },
    { songIds: ['song:1', 'song:1'] },
    { selectionVersion: 0 },
  ])('rejects unusable frozen session %#', (change) => {
    expect(
      GameSessionInputSchema.safeParse({ ...sessionInput(), ...change })
        .success,
    ).toBe(false);
  });
  it.each([
    { partyId: 'foreign' },
    { gameSessionId: 'old' },
    { selectionVersion: 2 },
    { sequence: 0 },
    { occurredAt: observedAt },
    { songId: 'foreign' },
    { playerId: 'foreign' },
    { judgementId: undefined },
  ])('rejects a foreign or malformed answer event %#', (change) => {
    expect(
      GameEventContextSchema.safeParse({
        session: sessionInput(),
        event: {
          ...eventEnvelope(),
          ...action,
          type: 'ANSWER_CORRECT',
          judgementId: 'judgement:1',
          ...change,
        },
      }).success,
    ).toBe(false);
  });
  it('keeps player actions separate from answer judgements', () => {
    const event = {
      ...eventEnvelope(),
      ...action,
      type: 'PLAYER_ACTION',
      actionType: 'claim',
    };
    expect(GameEventSchema.safeParse(event).success).toBe(true);
    expect(GameEventSchema.safeParse({ ...event, correct: true }).success).toBe(
      false,
    );
  });
  it('represents not-finished honestly without a fake result', () => {
    expect(
      GameResultStateSchema.safeParse({ status: 'not_finished' }).success,
    ).toBe(true);
    expect(
      GameResultStateSchema.safeParse({
        status: 'not_finished',
        result: gameResultInput(),
      }).success,
    ).toBe(false);
  });
  it('validates Mock result membership, unique judgements, score and time', () => {
    const result = gameResultInput();
    expect(GameResultSchema.safeParse(result).success).toBe(true);
    result.scores['player:1'] = 2;
    expect(GameResultSchema.safeParse(result).success).toBe(false);
    result.scores['player:1'] = 1;
    result.judgements.push({ ...result.judgements[0]! });
    expect(GameResultSchema.safeParse(result).success).toBe(false);
    const future = gameResultInput();
    future.judgements[0]!.occurredAt = '2027-01-01T00:00:00Z';
    expect(GameResultSchema.safeParse(future).success).toBe(false);
    const foreign = gameResultInput();
    foreign.judgements[0]!.playerId = 'foreign';
    expect(GameResultSchema.safeParse(foreign).success).toBe(false);
  });
  it('distinguishes aborted games and does not require a completed aborted result', () => {
    const result = gameResultInput();
    result.status = 'aborted';
    result.playedSongIds = [];
    result.judgements = [];
    result.scores['player:1'] = 0;
    expect(GameResultSchema.safeParse(result).success).toBe(true);
    expect(
      GameEventContextSchema.safeParse({
        session: sessionInput(),
        event: {
          ...eventEnvelope(),
          type: 'GAME_FINISHED',
          occurredAt: result.endedAt,
          result,
        },
      }).success,
    ).toBe(false);
  });
  it('does not impose all-song completion or +1 scoring on future classic adapters', () => {
    const result = gameResultInput();
    result.session.gameType = 'classic-karuta';
    result.session.songIds.push('song:2');
    result.scores['player:1'] = 25;
    expect(GameResultSchema.safeParse(result).success).toBe(true);
    result.session.gameType = 'mock-karuta';
    expect(GameResultSchema.safeParse(result).success).toBe(false);
  });
  it('does not allow a completed event to attach another frozen session', () => {
    const result = gameResultInput();
    result.session.gameSessionId = 'different';
    expect(
      GameEventContextSchema.safeParse({
        session: sessionInput(),
        event: {
          ...eventEnvelope(),
          type: 'GAME_FINISHED',
          occurredAt: result.endedAt,
          result,
        },
      }).success,
    ).toBe(false);
  });
  it('provides structured failures without accepting arbitrary result payloads', () => {
    const error = {
      code: 'STALE_VERSION',
      message: 'Context changed',
      details: { expectedVersion: 1, actualVersion: 2 },
    };
    expect(DomainErrorSchema.safeParse(error).success).toBe(true);
    const result = ResultSchema(PartyStateSchema);
    expect(result.safeParse({ ok: false, error }).success).toBe(true);
    expect(result.safeParse({ ok: true, value: { ready: true } }).success).toBe(
      false,
    );
  });
});

describe('review regressions for contract explanations', () => {
  it('rejects warning values that differ from the assessment being shown', () => {
    const assessment = assessmentInput();
    assessment.passed = false;
    assessment.reasons = [
      {
        code: 'LOW_COVERAGE',
        playerId: 'player:1',
        observed: 0,
        threshold: 0.25,
      },
    ];
    expect(FairnessAssessmentSchema.safeParse(assessment).success).toBe(false);
    assessment.reasons = [
      { code: 'COVERAGE_GAP', observed: 0.9, threshold: 0.4 },
    ];
    expect(FairnessAssessmentSchema.safeParse(assessment).success).toBe(false);
  });
  it('rejects step histories that start with existing coverage or hide their final objective', () => {
    const result = selectionResultInput();
    result.steps[0]!.coverageBefore['player:1'] = 1;
    expect(SelectionResultSchema.safeParse(result).success).toBe(false);
    const summary = selectionResultInput();
    summary.objectiveSummary = { ...summary.objectiveSummary, total: 0 };
    expect(SelectionResultSchema.safeParse(summary).success).toBe(false);
  });
  it('requires a one-to-one round/song mapping in Mock result identities', () => {
    const result = gameResultInput();
    result.session.songIds.push('song:2');
    result.playedSongIds.push('song:2');
    result.judgements.push({
      ...result.judgements[0]!,
      actionId: 'action:2',
      judgementId: 'judgement:2',
      songId: 'song:2',
    });
    result.scores['player:1'] = 2;
    expect(GameResultSchema.safeParse(result).success).toBe(false);
    result.judgements[1]!.roundId = 'round:2';
    expect(GameResultSchema.safeParse(result).success).toBe(true);
  });
});

it('rejects game history from a future party version or round', () => {
  const state = partyStateInput();
  Object.assign(state, {
    phase: 'finished',
    hostState: 'awaiting_host_choice',
    selectionVersion: 2,
    matrix: null,
    evaluationContext: null,
    fairnessAssessment: null,
    gameHistory: [gameResultInput()],
  });
  state.gameHistory[0]!.session.selectionVersion = 3;
  expect(PartyStateSchema.safeParse(state).success).toBe(false);
  state.gameHistory[0]!.session.selectionVersion = 1;
  state.gameHistory[0]!.session.roundNumber = 2;
  expect(PartyStateSchema.safeParse(state).success).toBe(false);
});
