import { catalogInput } from './catalog.js';
import {
  matrixContextInput,
  matrixInput,
  profileInput,
  referenceTime,
  scoringConfigInput,
  selectionConfigInput,
  fairnessConfigInput,
} from './profile.js';

export function configInput() {
  return {
    scoring: scoringConfigInput(),
    selection: selectionConfigInput(),
    fairness: { ...fairnessConfigInput(), familiarityThreshold: 0.1 },
  };
}
export function selectionRequestInput() {
  return {
    profileContext: matrixContextInput(),
    candidateSongIds: ['song:1'],
    requestedCount: 1,
    bannedSongIds: [] as string[],
    excludedHistorySongIds: [] as string[],
    availability: { 'song:1': { available: true } },
    selectionConfig: selectionConfigInput(),
    fairnessConfig: configInput().fairness,
    selectionVersion: 1,
    gameType: 'mock-karuta',
    roundNumber: 1,
  };
}
export function assessmentInput() {
  return {
    selectionVersion: 1,
    matrixVersion: 'matrix:1',
    fairnessConfigVersion: 'fairness-v1',
    fairnessConfig: configInput().fairness,
    playerIds: ['player:1'],
    selectedSongIds: ['song:1'],
    requestedCount: 1,
    actualCount: 1,
    validity: true,
    passed: true,
    playerMetrics: {
      'player:1': {
        familiarCount: 1,
        coverageRatio: 1,
        familiaritySum: 0.2,
        lowConfidenceCount: 0,
        lowConfidenceRatio: 0,
      },
    },
    maxCoverageGap: 0,
    reasons: [] as {
      code: string;
      observed?: number;
      threshold?: number;
      playerId?: string;
    }[],
  };
}
export function selectionResultInput() {
  const zero = {
    fairness: 0,
    diversity: 0,
    competition: 0,
    exploration: 0,
    softRatio: 0,
    total: 0,
  };
  const final = {
    fairness: 1,
    diversity: 1,
    competition: 0,
    exploration: 0,
    softRatio: 0.3,
    total: 0.606,
  };
  return {
    selectedSongIds: ['song:1'],
    requestedCount: 1,
    actualCount: 1,
    steps: [
      {
        songId: 'song:1',
        coverageBefore: { 'player:1': 0 },
        coverageAfter: { 'player:1': 1 },
        deficitGain: 1,
        objectiveBefore: zero,
        objectiveAfter: final,
        objectiveGains: {
          fairness: 1,
          diversity: 1,
          competition: 0,
          exploration: 0,
          softRatio: 0.3,
        },
        softRatioContribution: 0.006,
        totalGain: 0.606,
        gainKey: 606000000000,
        tieBreak: { rule: 'song_id', tiedSongIds: ['song:1'] },
      },
    ],
    excludedCounts: { unavailable: 0, banned: 0, history: 0 },
    unfilledCoverage: { 'player:1': 0 },
    objectiveSummary: final,
    fairnessAssessment: assessmentInput(),
    inputVersions: {
      selectionVersion: 1,
      matrixVersion: 'matrix:1',
      catalogVersion: 'catalog-test-1',
      profileVersions: { 'player:1': 1 },
      scoringConfig: scoringConfigInput(),
      selectionConfig: selectionConfigInput(),
      fairnessConfig: configInput().fairness,
    },
  };
}
export function sessionInput() {
  return {
    schemaVersion: 1,
    partyId: 'party:1',
    gameSessionId: 'session:1',
    selectionVersion: 1,
    gameType: 'mock-karuta',
    roundNumber: 1,
    playerIds: ['player:1'],
    songIds: ['song:1'],
    referenceTime,
  };
}
export function gameResultInput() {
  return {
    session: sessionInput(),
    status: 'completed',
    startedAt: '2026-09-24T00:00:01Z',
    endedAt: '2026-09-24T00:00:02Z',
    playedSongIds: ['song:1'],
    scores: { 'player:1': 1 },
    judgements: [
      {
        judgementId: 'judgement:1',
        actionId: 'action:1',
        roundId: 'round:1',
        songId: 'song:1',
        playerId: 'player:1',
        outcome: 'correct',
        occurredAt: '2026-09-24T00:00:01.500Z',
      },
    ],
  };
}
export function eventEnvelope() {
  return {
    eventId: 'event:1',
    partyId: 'party:1',
    gameSessionId: 'session:1',
    selectionVersion: 1,
    sequence: 1,
    occurredAt: '2026-09-24T00:00:01Z',
  };
}
export function setupInput() {
  return {
    partyId: 'party:1',
    hostPlayerId: 'player:1',
    players: [catalogInput().players[0]!.player],
    catalog: catalogInput(),
    candidateSongIds: ['song:1'],
    availability: { 'song:1': { available: true } },
    requestedCount: 1,
    currentGame: 'mock-karuta',
    config: configInput(),
    partyPreferences: { excludePlayedSongs: true },
    referenceTime,
  };
}
export function evaluationContextInput() {
  return {
    selectionVersion: 1,
    hostPlayerId: 'player:1',
    playerIds: ['player:1'],
    profileVersions: { 'player:1': 1 },
    profiles: [profileInput()],
    catalogVersion: 'catalog-test-1',
    candidateSongIds: ['song:1'],
    selectedSongIds: ['song:1'],
    requestedCount: 1,
    gameType: 'mock-karuta',
    roundNumber: 1,
    bannedSongIds: [] as string[],
    excludedHistorySongIds: [] as string[],
    availability: { 'song:1': { available: true } },
    referenceTime,
    matrixVersion: 'matrix:1',
    config: configInput(),
    partyPreferences: { excludePlayedSongs: true },
  };
}
export function partyStateInput() {
  return {
    ...setupInput(),
    playerProfiles: [profileInput()],
    currentRound: 1,
    difficulty: null,
    catalogVersion: 'catalog-test-1',
    matrix: matrixInput() as ReturnType<typeof matrixInput> | null,
    currentPlaylist: ['song:1'],
    selectionResult: selectionResultInput() as ReturnType<
      typeof selectionResultInput
    > | null,
    bannedSongIds: [] as string[],
    excludedHistorySongIds: [] as string[],
    banPhase: 'closed',
    phase: 'prepared',
    hostState: 'ready',
    selectionVersion: 1,
    evaluationContext: evaluationContextInput() as ReturnType<
      typeof evaluationContextInput
    > | null,
    fairnessAssessment: assessmentInput() as ReturnType<
      typeof assessmentInput
    > | null,
    hostAcknowledgement: null as {
      action: string;
      playerId: string;
      selectionVersion: number;
      acknowledgedAt: string;
      reasons: ReturnType<typeof assessmentInput>['reasons'];
    } | null,
    activeGameSession: null as ReturnType<typeof sessionInput> | null,
    gameHistory: [] as ReturnType<typeof gameResultInput>[],
    processedEventIds: [] as string[],
    pendingGameplayEvidence: [] as {
      type: string;
      evidenceId: string;
      playerId: string;
      sourceId: string;
      observedAt: string;
      occurredAt: string;
      eventId: string;
      songId: string;
    }[],
  };
}
export function warningStateInput() {
  const state = partyStateInput();
  state.requestedCount = 2;
  state.evaluationContext!.requestedCount = 2;
  state.fairnessAssessment!.requestedCount = 2;
  state.fairnessAssessment!.passed = false;
  state.fairnessAssessment!.reasons = [
    { code: 'SHORT_PLAYLIST', observed: 1, threshold: 2 },
  ];
  state.hostState = 'awaiting_host_choice';
  // Previous selection result is historical and deliberately not overwritten after a change.
  return state;
}
export function acknowledgedStateInput() {
  const state = warningStateInput();
  state.hostAcknowledgement = {
    action: 'continue',
    playerId: 'player:1',
    selectionVersion: 1,
    acknowledgedAt: referenceTime,
    reasons: structuredClone(state.fairnessAssessment!.reasons),
  };
  state.hostState = 'ready';
  return state;
}
export function commandEnvelope() {
  return { commandId: 'command:1', partyId: 'party:1', expectedVersion: 1 };
}
