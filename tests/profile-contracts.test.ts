import { describe, expect, it } from 'vitest';
import {
  EvidenceSchema,
  EvidenceCollectionSchema,
  EvidenceContextSchema,
  RawUserMusicDataSchema,
  UtcTimestampSchema,
  PlayerMusicProfileSchema,
  FamiliarityEstimateSchema,
  FamiliarityMatrixSchema,
  ProfileMatrixContextSchema,
  ProfileBuildInputSchema,
  ScoringConfigSchema,
  SelectionConfigSchema,
  FairnessConfigSchema,
  FixedRatioSchema,
} from '@amp/core';
import { catalogInput } from './fixtures/catalog.js';
import {
  referenceTime,
  observedAt,
  evidenceInput,
  rawInput,
  profileInput,
  cellInput,
  matrixInput,
  matrixContextInput,
  scoringConfigInput,
  selectionConfigInput,
  fairnessConfigInput,
} from './fixtures/profile.js';

function without<T extends object, K extends keyof T>(
  input: T,
  ...keys: K[]
): Omit<T, K> {
  const result = { ...input };
  for (const key of keys) delete result[key];
  return result;
}

describe('evidence boundaries', () => {
  it.each([
    { type: 'favorite', active: false },
    { type: 'playlist', active: true },
    { type: 'top_song', active: true },
    {
      type: 'play_count',
      count: 0,
      countKind: 'cumulative',
      periodStart: observedAt,
      periodEnd: observedAt,
    },
    {
      type: 'play_count',
      count: 2,
      countKind: 'window',
      periodStart: observedAt,
      periodEnd: observedAt,
    },
    { type: 'recent_play', occurredAt: observedAt },
    { type: 'self_report', familiarity: 0 },
    ...['warmup_correct', 'warmup_wrong', 'game_correct', 'game_wrong'].map(
      (type) => ({ type, eventId: 'event:1', occurredAt: observedAt }),
    ),
  ])('accepts $type without inventing other signals', (payload) => {
    const base = without(evidenceInput(), 'type', 'active');
    expect(EvidenceSchema.safeParse({ ...base, ...payload }).success).toBe(
      true,
    );
  });
  it('keeps artist evidence separate and rejects missing payloads or unknown fields', () => {
    const base = without(evidenceInput(), 'songId', 'type');
    expect(
      EvidenceSchema.safeParse({
        ...base,
        type: 'top_artist',
        artistId: 'artist:1',
      }).success,
    ).toBe(true);
    expect(
      EvidenceSchema.safeParse({
        ...evidenceInput(),
        type: 'top_artist',
        artistId: 'artist:1',
      }).success,
    ).toBe(false);
    expect(
      EvidenceSchema.safeParse({ ...evidenceInput(), active: undefined })
        .success,
    ).toBe(false);
    expect(
      EvidenceSchema.safeParse({ ...evidenceInput(), token: 'forbidden-field' })
        .success,
    ).toBe(false);
  });
  it.each([
    '2026-02-30T00:00:00Z',
    '2026-09-23',
    '2026-09-23T00:00:00',
    '2026-09-23T00:00:00+08:00',
    '2026-09-23T00:00:00.0001Z',
    '2026-09-23T24:00:00Z',
  ])('rejects invalid UTC time %s', (value) => {
    expect(UtcTimestampSchema.safeParse(value).success).toBe(false);
  });
  it('compares timestamps as instants rather than lexicographically', () => {
    const base = without(evidenceInput(), 'active');
    expect(
      EvidenceSchema.safeParse({
        ...base,
        type: 'recent_play',
        observedAt: '2026-09-23T00:00:00.1Z',
        occurredAt: '2026-09-23T00:00:00Z',
      }).success,
    ).toBe(true);
    expect(
      EvidenceSchema.safeParse({
        ...base,
        type: 'recent_play',
        occurredAt: referenceTime,
      }).success,
    ).toBe(false);
  });
  it.each([-1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid count %s',
    (count) => {
      const base = without(evidenceInput(), 'active');
      expect(
        EvidenceSchema.safeParse({
          ...base,
          type: 'play_count',
          count,
          countKind: 'cumulative',
          periodStart: observedAt,
          periodEnd: observedAt,
        }).success,
      ).toBe(false);
    },
  );
  it('rejects reversed periods and periods after observation', () => {
    const base = without(evidenceInput(), 'active');
    for (const [periodStart, periodEnd] of [
      [referenceTime, observedAt],
      [observedAt, referenceTime],
    ])
      expect(
        EvidenceSchema.safeParse({
          ...base,
          type: 'play_count',
          count: 1,
          countKind: 'cumulative',
          periodStart,
          periodEnd,
        }).success,
      ).toBe(false);
  });
  it('rejects future observations and unknown player/song/artist references', () => {
    const input = {
      catalog: catalogInput(),
      referenceTime,
      evidence: [evidenceInput()],
    };
    expect(EvidenceContextSchema.safeParse(input).success).toBe(true);
    for (const change of [
      { playerId: 'missing' },
      { songId: 'missing' },
      { observedAt: '2027-01-01T00:00:00Z' },
    ])
      expect(
        EvidenceContextSchema.safeParse({
          ...input,
          evidence: [{ ...evidenceInput(), ...change }],
        }).success,
      ).toBe(false);
    const base = without(evidenceInput(), 'songId', 'type');
    expect(
      EvidenceContextSchema.safeParse({
        ...input,
        evidence: [{ ...base, type: 'top_artist', artistId: 'missing' }],
      }).success,
    ).toBe(false);
  });
  it('allows raw replay but rejects duplicates in normalized collections including rewrapped events', () => {
    const raw = rawInput();
    raw.evidence.push(evidenceInput());
    expect(RawUserMusicDataSchema.safeParse(raw).success).toBe(true);
    expect(EvidenceCollectionSchema.safeParse(raw.evidence).success).toBe(
      false,
    );
    const base = without(evidenceInput(), 'active');
    const event = {
      ...base,
      type: 'game_correct',
      eventId: 'event:1',
      occurredAt: observedAt,
    };
    expect(
      EvidenceCollectionSchema.safeParse([
        event,
        { ...event, evidenceId: 'evidence:2' },
      ]).success,
    ).toBe(false);
  });
  it('binds raw snapshots to player, source and observation time', () => {
    for (const change of [
      { playerId: 'player:2' },
      { sourceId: 'another' },
      { observedAt: referenceTime },
    ])
      expect(
        RawUserMusicDataSchema.safeParse({
          ...rawInput(),
          evidence: [{ ...evidenceInput(), ...change }],
        }).success,
      ).toBe(false);
    const input = {
      catalog: catalogInput(),
      referenceTime,
      scoringConfig: scoringConfigInput(),
      rawData: [rawInput()],
    };
    expect(ProfileBuildInputSchema.safeParse(input).success).toBe(true);
    Object.assign(input.rawData[0]!.declaredPreferences, {
      genres: { 'region:jp': { weight: 1, confidence: 1 } },
    });
    expect(ProfileBuildInputSchema.safeParse(input).success).toBe(false);
    expect(
      ProfileBuildInputSchema.safeParse({
        ...input,
        rawData: [{ ...rawInput(), observedAt: '2027-01-01T00:00:00Z' }],
      }).success,
    ).toBe(false);
  });
});

describe('profiles and complete matrix snapshots', () => {
  it('keeps unknown cells present, low confidence and readonly', () => {
    const input = matrixContextInput();
    const cell = cellInput();
    cell.familiarityScore = 0.05;
    cell.confidence = 0;
    cell.evidenceStatus = 'insufficient';
    cell.reasons = [cell.reasons[0]!];
    cell.confidenceBasis = { feature: 'unknown', evidenceIds: [], value: 0 };
    input.matrix.cells['player:1']['song:1'] = cell;
    const output = ProfileMatrixContextSchema.parse(input);
    expect(
      Object.isFrozen(
        output.matrix.cells[output.matrix.playerIds[0]!]![
          output.matrix.songIds[0]!
        ]!.reasons[0],
      ),
    ).toBe(true);
    input.matrix.cells['player:1']['song:1'].familiarityScore = 1;
    expect(
      output.matrix.cells[output.matrix.playerIds[0]!]![
        output.matrix.songIds[0]!
      ]!.familiarityScore,
    ).toBe(0.05);
    expect(output.profiles[0]!.explorationScore).toBeUndefined();
  });
  it.each([
    { cells: {} },
    { cells: { 'player:1': {} } },
    { cells: { 'player:1': { 'song:1': cellInput(), extra: cellInput() } } },
    { profileVersions: {} },
    { playerIds: ['player:1', 'player:1'] },
    { songIds: ['song:1', 'song:1'] },
    { songIds: ['song:2', 'song:1'] },
    {
      cells: {
        'player:1': { 'song:1': cellInput() },
        extra: { 'song:1': cellInput() },
      },
    },
  ])(
    'rejects missing, extra, duplicate or unordered matrix identities %#',
    (change) => {
      expect(
        FamiliarityMatrixSchema.safeParse({ ...matrixInput(), ...change })
          .success,
      ).toBe(false);
    },
  );
  it('supports empty axes as data without fabricating cells', () => {
    expect(
      FamiliarityMatrixSchema.safeParse({
        ...matrixInput(),
        playerIds: [],
        songIds: [],
        profileVersions: {},
        cells: {},
      }).success,
    ).toBe(true);
    expect(
      FamiliarityMatrixSchema.safeParse({
        ...matrixInput(),
        songIds: [],
        cells: { 'player:1': {} },
      }).success,
    ).toBe(true);
  });
  it.each(['catalogVersion', 'scoringConfigVersion', 'referenceTime'] as const)(
    'rejects stale matrix %s',
    (field) => {
      const input = matrixContextInput();
      input.matrix[field] = field === 'referenceTime' ? observedAt : 'stale';
      expect(ProfileMatrixContextSchema.safeParse(input).success).toBe(false);
    },
  );
  it('rejects changed configuration content even when the version name is reused', () => {
    const input = matrixContextInput();
    input.scoringConfig.weights.favorite = 0.9;
    expect(ProfileMatrixContextSchema.safeParse(input).success).toBe(false);
  });
  it.each([
    { kind: 'clamp', before: 0.2, after: 0.9 },
    { kind: 'correctFloor', before: 0.2, after: 0.1 },
    { kind: 'wrongPenalty', before: 0.2, after: 0.9 },
  ])('rejects an adjustment that contradicts $kind', (adjustment) => {
    const cell = cellInput();
    cell.adjustments = [{ ...adjustment, evidenceIds: [] }];
    cell.familiarityScore = adjustment.after;
    expect(FamiliarityEstimateSchema.safeParse(cell).success).toBe(false);
  });
  it('rejects duplicate profiles, stale profile versions and unknown matrix targets', () => {
    const input = matrixContextInput();
    input.profiles.push(profileInput());
    expect(ProfileMatrixContextSchema.safeParse(input).success).toBe(false);
    input.profiles.pop();
    input.matrix.profileVersions['player:1'] = 2;
    expect(ProfileMatrixContextSchema.safeParse(input).success).toBe(false);
    const unknownSong = matrixContextInput();
    unknownSong.matrix.songIds = ['unknown'];
    Object.assign(unknownSong.matrix, {
      cells: { 'player:1': { unknown: cellInput() } },
    });
    expect(ProfileMatrixContextSchema.safeParse(unknownSong).success).toBe(
      false,
    );
  });
  it('rejects evidence stored under a different song/player, duplicate evidence and future profiles', () => {
    for (const change of [{ playerId: 'other' }, { songId: 'other' }]) {
      const input = profileInput();
      input.songEvidence['song:1'] = [{ ...evidenceInput(), ...change }];
      expect(PlayerMusicProfileSchema.safeParse(input).success).toBe(false);
    }
    const duplicate = profileInput();
    duplicate.songEvidence['song:1'].push(evidenceInput());
    expect(PlayerMusicProfileSchema.safeParse(duplicate).success).toBe(false);
    const future = matrixContextInput();
    future.profiles[0]!.updatedAt = '2027-01-01T00:00:00Z';
    expect(ProfileMatrixContextSchema.safeParse(future).success).toBe(false);
  });
  it('requires real provenance references and the declared dimension', () => {
    const input = profileInput();
    input.provenance = [];
    expect(PlayerMusicProfileSchema.safeParse(input).success).toBe(false);
    const inferred = profileInput();
    inferred.provenance[0]!.source = 'inferred';
    expect(PlayerMusicProfileSchema.safeParse(inferred).success).toBe(false);
    inferred.provenance[0]!.evidenceIds = ['unknown'];
    expect(PlayerMusicProfileSchema.safeParse(inferred).success).toBe(false);
    inferred.provenance[0]!.evidenceIds = ['evidence:1'];
    expect(PlayerMusicProfileSchema.safeParse(inferred).success).toBe(true);
    const context = matrixContextInput();
    Object.assign(context.profiles[0]!.preferences, {
      genres: { 'lang:en': { weight: 0.8, confidence: 0.4 } },
    });
    context.profiles[0]!.provenance[0]!.id = 'lang:en';
    expect(ProfileMatrixContextSchema.safeParse(context).success).toBe(false);
  });
  it('rejects foreign explanation evidence and false known status at low confidence', () => {
    const input = matrixContextInput();
    input.matrix.cells['player:1']['song:1'].reasons[1]!.evidenceIds = [
      'other-player-evidence',
    ];
    expect(ProfileMatrixContextSchema.safeParse(input).success).toBe(false);
    const low = matrixContextInput();
    low.matrix.cells['player:1']['song:1'].confidence = 0.1;
    low.matrix.cells['player:1']['song:1'].confidenceBasis.value = 0.1;
    expect(ProfileMatrixContextSchema.safeParse(low).success).toBe(false);
  });
  it('rejects inconsistent explanation contributions, confidence and score', () => {
    for (const change of [{ familiarityScore: 0.8 }, { confidence: 0.8 }])
      expect(
        FamiliarityEstimateSchema.safeParse({ ...cellInput(), ...change })
          .success,
      ).toBe(false);
    const cell = cellInput();
    cell.reasons[1]!.contribution = 0.7;
    expect(FamiliarityEstimateSchema.safeParse(cell).success).toBe(false);
    const adjusted = cellInput();
    adjusted.adjustments = [
      {
        kind: 'correctFloor',
        before: 0.2,
        after: 0.9,
        evidenceIds: ['evidence:1'],
      },
    ];
    adjusted.familiarityScore = 0.9;
    expect(FamiliarityEstimateSchema.safeParse(adjusted).success).toBe(true);
    adjusted.adjustments[0]!.before = 0.5;
    expect(FamiliarityEstimateSchema.safeParse(adjusted).success).toBe(false);
  });
});

describe('versioned configuration boundaries', () => {
  it('accepts the documented v1 parameters and freezes nested output', () => {
    expect(ScoringConfigSchema.safeParse(scoringConfigInput()).success).toBe(
      true,
    );
    expect(
      SelectionConfigSchema.safeParse(selectionConfigInput()).success,
    ).toBe(true);
    expect(FairnessConfigSchema.safeParse(fairnessConfigInput()).success).toBe(
      true,
    );
    expect(
      Object.isFrozen(
        ScoringConfigSchema.parse(scoringConfigInput()).confidence.recognition,
      ),
    ).toBe(true);
  });
  it.each([0, -1, Infinity, NaN])('rejects invalid half-life %s', (value) => {
    expect(
      ScoringConfigSchema.safeParse({
        ...scoringConfigInput(),
        recencyHalfLifeDays: value,
      }).success,
    ).toBe(false);
  });
  it('rejects missing or negative scoring parameters and unbounded confidence', () => {
    const input = scoringConfigInput();
    input.weights.favorite = -0.1;
    expect(ScoringConfigSchema.safeParse(input).success).toBe(false);
    expect(
      ScoringConfigSchema.safeParse({
        ...scoringConfigInput(),
        profile: undefined,
      }).success,
    ).toBe(false);
    const confidence = scoringConfigInput();
    confidence.confidence.recognition.gain = 0.8;
    expect(ScoringConfigSchema.safeParse(confidence).success).toBe(false);
  });
  it('requires normalized objective/target weights and a positive diversity weight', () => {
    const input = selectionConfigInput();
    input.objectiveWeights.fairness = 0.5;
    expect(SelectionConfigSchema.safeParse(input).success).toBe(false);
    const ratios = selectionConfigInput();
    ratios.targetRatios.common = 0.7;
    expect(SelectionConfigSchema.safeParse(ratios).success).toBe(false);
    const empty = selectionConfigInput();
    for (const key of Object.keys(
      empty.diversityWeights,
    ) as (keyof typeof empty.diversityWeights)[])
      empty.diversityWeights[key] = 0;
    expect(SelectionConfigSchema.safeParse(empty).success).toBe(false);
  });
  it.each([0, 1, 0.123456, 0.000001, 0.6])(
    'accepts quantized threshold %s',
    (value) => {
      expect(FixedRatioSchema.safeParse(value).success).toBe(true);
    },
  );
  it.each([0.1234567, 0.0000001, 1e-16, 1.000001, -0.000001, Infinity])(
    'rejects invalid threshold %s',
    (value) => {
      expect(FixedRatioSchema.safeParse(value).success).toBe(false);
    },
  );
});
