import { describe, expect, it } from 'vitest';
import {
  CatalogSchema,
  EvidenceSchema,
  RawUserMusicDataSchema,
  ProfileBuildInputSchema,
  ProfileMatrixContextSchema,
  GameEventSchema,
  GameSessionInputSchema,
  type Evidence,
  type Catalog,
  type PlayerMusicProfile,
} from '@amp/core';
import {
  DEFAULT_SCORING_CONFIG as config,
  normalizeEvidence,
  buildPlayerProfile,
  scoreFamiliarity,
  buildFamiliarityMatrix,
  gameplayEvidence,
} from '@amp/music-profile';
import { MockMusicSource } from '@amp/adapters';
import {
  createMixedFixture,
  createStressFixture,
  coverageManifest,
  MOCK_REFERENCE_TIME as now,
  MOCK_SOURCE_ID,
} from '@amp/adapters/fixtures';
import { catalogInput } from './fixtures/catalog.js';
import {
  sessionInput,
  eventEnvelope,
  gameResultInput,
} from './fixtures/runtime.js';
import { directSmallMatrix } from './fixtures/direct-matrix.js';

function catalog(): Catalog {
  const c = catalogInput();
  Object.assign(c.players[0]!.preferences, { genres: {} });
  return CatalogSchema.parse(c);
}
function ev(fields: Record<string, unknown> = {}): Evidence {
  return EvidenceSchema.parse({
    type: 'favorite',
    active: true,
    evidenceId: 'e:1',
    playerId: 'player:1',
    songId: 'song:1',
    sourceId: 'source:1',
    observedAt: now,
    ...fields,
  });
}
function typed(type: string, fields: Record<string, unknown> = {}): Evidence {
  const base = {
    evidenceId: 'e:1',
    playerId: 'player:1',
    songId: 'song:1',
    sourceId: 'source:1',
    observedAt: now,
  };
  return EvidenceSchema.parse({ ...base, type, ...fields });
}
function build(
  evidence: readonly Evidence[] = [],
  c = catalog(),
  previous?: PlayerMusicProfile,
  time = now,
) {
  const sources = [...new Set(evidence.map((e) => e.sourceId))];
  const rawData = sources.map((sourceId) =>
    RawUserMusicDataSchema.parse({
      schemaVersion: 1,
      sourceId,
      userId: c.players[0]!.player.id,
      snapshotId: 'snapshot:' + sourceId,
      observedAt: time,
      declaredPreferences: c.players[0]!.preferences,
      evidence: evidence.filter((e) => e.sourceId === sourceId),
    }),
  );
  return buildPlayerProfile(
    ProfileBuildInputSchema.parse({
      catalog: c,
      rawData,
      referenceTime: time,
      scoringConfig: config,
    }),
    c.players[0]!.player.id,
    previous,
  );
}
function score(evidence: readonly Evidence[] = [], c = catalog(), time = now) {
  return scoreFamiliarity(
    build(evidence, c, undefined, time),
    c.songs[0]!,
    config,
    time,
    c.taxonomy,
  );
}
const daysAgo = (days: number) =>
  new Date(Date.parse(now) - days * 86400000).toISOString();
const recognition = (correct: boolean, days = 0, id = 'answer') =>
  typed(correct ? 'game_correct' : 'game_wrong', {
    eventId: id,
    evidenceId: id,
    occurredAt: daysAgo(days),
  });
const count = (n: number, fields: Record<string, unknown> = {}) =>
  typed('play_count', {
    count: n,
    countKind: 'cumulative',
    periodStart: '2025-01-01T00:00:00Z',
    periodEnd: now,
    ...fields,
  });

describe('normalization', () => {
  it('deduplicates exact records, ignores input order and rejects same-ID conflict', () => {
    expect(normalizeEvidence([ev(), ev()], catalog(), now)).toMatchObject({
      evidence: [ev()],
      duplicateCount: 1,
    });
    expect(() =>
      normalizeEvidence([ev(), ev({ active: false })], catalog(), now),
    ).toThrow(/Conflicting/);
  });
  it('withdraws only the latest source interest, breaking equal-time ties by ID', () => {
    const records = [
      ev({ evidenceId: 'e:a' }),
      ev({ evidenceId: 'e:z', active: false }),
      ev({ evidenceId: 'e:b', sourceId: 'source:2' }),
    ];
    const normalized = normalizeEvidence(records, catalog(), now).evidence;
    expect(normalized).toHaveLength(2);
    expect(normalized.find((e) => e.sourceId === 'source:1')).toMatchObject({
      active: false,
    });
    expect(
      score(records).reasons.find((r) => r.feature === 'favorite')
        ?.transformedValue,
    ).toBe(1);
    expect(
      normalizeEvidence([...records].reverse(), catalog(), now).evidence,
    ).toEqual(normalized);
  });
  it('uses latest source cumulative counts and cross-source maximum, not sum or historical maximum', () => {
    const records = [
      count(50, {
        evidenceId: 'old',
        observedAt: daysAgo(2),
        periodEnd: daysAgo(2),
      }),
      count(10, { evidenceId: 'new' }),
      count(20, { sourceId: 'source:2', evidenceId: 'other' }),
    ];
    expect(normalizeEvidence(records, catalog(), now).evidence).toEqual([
      records[2],
    ]);
    expect(
      score(records).reasons.find((r) => r.feature === 'playCount')
        ?.transformedValue,
    ).toBeCloseTo(Math.log1p(20) / Math.log1p(50));
  });
  it('reports unsupported window counts without masking older cumulative evidence', () => {
    const records = [
      count(10),
      count(99, { countKind: 'window', evidenceId: 'window' }),
    ];
    const result = normalizeEvidence(records, catalog(), now);
    expect(result.evidence).toEqual([records[0]]);
    expect(result.diagnostics).toEqual([
      { code: 'UNSUPPORTED_WINDOW_COUNT', evidenceId: 'window' },
    ]);
  });
  it('selects latest self-report and latest actual play, not the newest import time', () => {
    const records = [
      typed('self_report', { familiarity: 0.8, evidenceId: 'a' }),
      typed('self_report', { familiarity: 0, evidenceId: 'z' }),
      typed('recent_play', {
        occurredAt: daysAgo(1),
        observedAt: daysAgo(1),
        evidenceId: 'play-old-import',
      }),
      typed('recent_play', {
        occurredAt: daysAgo(5),
        evidenceId: 'play-new-import',
      }),
    ];
    const result = normalizeEvidence(records, catalog(), now).evidence;
    expect(result).toContainEqual(records[1]);
    expect(result).toContainEqual(records[2]);
    expect(result).toHaveLength(2);
  });
  it('deduplicates recognition IDs across source envelopes and rejects conflicting outcomes', () => {
    const a = recognition(true),
      b = EvidenceSchema.parse({
        ...a,
        evidenceId: 'z-replay',
        sourceId: 'second',
      });
    expect(normalizeEvidence([b, a], catalog(), now)).toMatchObject({
      evidence: [a],
      duplicateCount: 1,
    });
    expect(() =>
      normalizeEvidence(
        [a, EvidenceSchema.parse({ ...b, type: 'game_wrong' })],
        catalog(),
        now,
      ),
    ).toThrow(/Conflicting/);
  });
  it.each([
    { playerId: 'unknown' },
    { songId: 'unknown' },
    { observedAt: '2027-01-01T00:00:00Z' },
    { unexpected: 1 },
  ])('rejects invalid records even when obsolete: %j', (fields) => {
    expect(() =>
      normalizeEvidence(
        [ev(), { ...ev(), evidenceId: 'bad', ...fields } as Evidence],
        catalog(),
        now,
      ),
    ).toThrow();
  });
  it('rejects future duplicate event envelopes and malformed event/count times', () => {
    expect(() =>
      normalizeEvidence(
        [
          recognition(true),
          EvidenceSchema.parse({
            ...recognition(true),
            evidenceId: 'z',
            observedAt: '2027-01-01T00:00:00Z',
          }),
        ],
        catalog(),
        now,
      ),
    ).toThrow();
    expect(() =>
      typed('recent_play', { occurredAt: '2027-01-01T00:00:00Z' }),
    ).toThrow();
    expect(() => count(-1)).toThrow();
    expect(() => count(1, { periodStart: '2027-01-01T00:00:00Z' })).toThrow();
  });
});

describe('continuous profiles', () => {
  it('infers every supplied dimension and maps 1896 explicitly to era:1890s', () => {
    const input = catalogInput();
    Object.assign(input.players[0]!.preferences, { genres: {} });
    for (const dimension of [
      'regions',
      'cultures',
      'scenes',
      'franchises',
    ] as const) {
      input.taxonomy.push({
        id: dimension + ':new',
        dimension,
        label: dimension,
      });
      Object.assign(input.songs[0]!, { [dimension]: [dimension + ':new'] });
    }
    const profile = build([ev()], CatalogSchema.parse(input));
    for (const values of Object.values(profile.preferences))
      expect(Object.values(values)).toHaveLength(1);
    expect(Object.values(profile.preferences.eras)[0]).toEqual({
      weight: 1 / 3,
      confidence: 0.1,
    });
    expect(profile.provenance).toHaveLength(8);
    expect(
      profile.provenance.every(
        (p) => p.source === 'inferred' && p.evidenceIds[0] === 'e:1',
      ),
    ).toBe(true);
  });
  it('does not invent missing eras or treat artist region as song language', () => {
    const input = catalogInput();
    input.taxonomy = input.taxonomy.filter((t) => t.dimension !== 'eras');
    const profile = build([ev()], CatalogSchema.parse(input));
    expect(profile.preferences.eras).toEqual({});
    expect(profile.preferences.languages).not.toHaveProperty('region:jp');
  });
  it('keeps stronger declared weights and confidence for equal maximum candidates', () => {
    const c = CatalogSchema.parse(catalogInput()),
      profile = build([ev()], c);
    expect(profile.preferences.genres).toEqual({
      'genre:child': { weight: 0.8, confidence: 0.4 },
    });
    expect(
      profile.provenance.find((p) => p.dimension === 'genres')?.source,
    ).toBe('declared');
  });
  it('top artist is only a weak candidate, not knowledge of every song', () => {
    const base = {
      evidenceId: 'e:1',
      playerId: 'player:1',
      sourceId: 'source:1',
      observedAt: now,
    };
    const artist = EvidenceSchema.parse({
      ...base,
      type: 'top_artist',
      artistId: 'artist:1',
      active: true,
    });
    expect(build([artist]).preferences.artists).toEqual({
      'artist:1': { weight: 0.8, confidence: 0.6 },
    });
    expect(score([artist]).familiarityScore).toBeCloseTo(0.13);
    expect(score([artist]).evidenceStatus).toBe('insufficient');
  });
  it('recognition updates only song evidence, without genre/language inference', () => {
    expect(build([recognition(true)]).preferences).toEqual(
      catalog().players[0]!.preferences,
    );
    expect(build([recognition(false)]).confidence).toBe(0);
  });
  it('preserves profile version and timestamp on replay; changes advance once', () => {
    const first = build([ev()]);
    const replay = build(
      [ev(), ev()],
      catalog(),
      first,
      '2026-09-25T00:00:00Z',
    );
    expect(replay).toEqual(first);
    expect(
      build([ev(), recognition(true)], catalog(), first).profileVersion,
    ).toBe(2);
    expect(() =>
      build([], catalog(), {
        ...first,
        playerId: 'other' as typeof first.playerId,
      }),
    ).toThrow();
  });
  it('snapshot order does not change content, and conflicting snapshot IDs fail', () => {
    const c = catalog();
    const raw = RawUserMusicDataSchema.parse({
      schemaVersion: 1,
      sourceId: 'source:1',
      snapshotId: 'snap',
      observedAt: now,
      userId: c.players[0]!.player.id,
      evidence: [ev()],
      declaredPreferences: c.players[0]!.preferences,
    });
    const input = {
      catalog: c,
      referenceTime: now,
      scoringConfig: config,
      rawData: [raw, raw],
    };
    expect(buildPlayerProfile(input, c.players[0]!.player.id)).toEqual(
      build([ev()]),
    );
    expect(() =>
      buildPlayerProfile(
        { ...input, rawData: [raw, { ...raw, evidence: [] }] },
        c.players[0]!.player.id,
      ),
    ).toThrow(/snapshot/);
  });
});

describe('score-v1 arithmetic and explanation', () => {
  it('keeps unknown scores low and explicitly insufficient', () => {
    const result = score();
    expect(result.familiarityScore).toBe(0.05);
    expect(result.confidence).toBe(0);
    expect(result.evidenceStatus).toBe('insufficient');
  });
  it('matches a hand calculation including inferred affinity', () => {
    const result = score([ev()]);
    expect(result.familiarityScore).toBeCloseTo(
      0.05 + 0.15 + 0.1 / 3 + 0.05 / 3 + 0.05 / 3,
    );
    expect(result.confidence).toBe(0.5);
    expect(result.evidenceStatus).toBe('known');
    expect(result.reasons.reduce((s, r) => s + r.contribution, 0)).toBeCloseTo(
      result.familiarityScore,
    );
  });
  it('treats explicit zero report as support without adding familiarity', () => {
    expect(score([typed('self_report', { familiarity: 0 })])).toMatchObject({
      familiarityScore: 0.05,
      confidence: 0.6,
      evidenceStatus: 'known',
    });
  });
  it.each([0, 1, 10, 25, 50, 500])('calculates cumulative count %d', (n) => {
    const result = score([count(n)]);
    expect(
      result.reasons.find((r) => r.feature === 'playCount')?.transformedValue,
    ).toBeCloseTo(Math.min(1, Math.log1p(n) / Math.log1p(50)));
  });
  it.each([0, 90, 180, 360])('decays recent play over %d days', (days) => {
    const result = score([typed('recent_play', { occurredAt: daysAgo(days) })]);
    expect(result.familiarityScore).toBeCloseTo(
      0.05 + 0.15 * 2 ** (-days / 180),
    );
    expect(result.confidence).toBeCloseTo(0.4 + 0.4 * 2 ** (-days / 180));
  });
  it('increasing counts or adding favorite never lowers an otherwise fixed estimate', () => {
    let prior = 0;
    for (const n of [0, 1, 2, 5, 10, 25, 50, 100]) {
      const value = score([count(n)]).familiarityScore;
      expect(value).toBeGreaterThanOrEqual(prior);
      prior = value;
    }
    expect(
      score([count(10), ev({ evidenceId: 'favorite' })]).familiarityScore,
    ).toBeGreaterThanOrEqual(score([count(10)]).familiarityScore);
  });
  it('clamps saturation and reports its adjustment', () => {
    const c = catalogInput();
    c.players[0]!.preferences.genres = {
      'genre:child': { weight: 1, confidence: 1 },
    };
    Object.assign(c.players[0]!.preferences, {
      artists: { 'artist:1': { weight: 1, confidence: 1 } },
      languages: { 'lang:en': { weight: 1, confidence: 1 } },
    });
    const evidence = [
      ev(),
      ev({ type: 'playlist', evidenceId: 'playlist' }),
      ev({ type: 'top_song', evidenceId: 'top' }),
      count(50, { evidenceId: 'count' }),
      typed('recent_play', { occurredAt: now, evidenceId: 'recent' }),
      typed('self_report', { familiarity: 1, evidenceId: 'report' }),
    ];
    const result = score(evidence, CatalogSchema.parse(c));
    expect(result.familiarityScore).toBe(1);
    expect(result.adjustments[0]!.before).toBeGreaterThan(1);
  });
  it('uses genre ancestor max, never a sum, and allows arbitrary taxonomy labels', () => {
    const c = catalogInput();
    Object.assign(c.players[0]!.preferences, {
      genres: {
        'genre:new': { weight: 0.9, confidence: 0.8 },
        'genre:child': { weight: 0.7, confidence: 0.8 },
      },
    });
    const result = score([], CatalogSchema.parse(c));
    expect(result.familiarityScore).toBeCloseTo(0.05 + 0.05 * 0.9);
    expect(result.confidence).toBeCloseTo(0.2);
  });
  it('uses fixed weights rather than normalizing by evidence count', () => {
    const a = score([
      typed('self_report', { familiarity: 1 }),
    ]).familiarityScore;
    const b = score([
      typed('self_report', { familiarity: 1 }),
      ev({ evidenceId: 'fav' }),
    ]).familiarityScore;
    expect(b).toBeGreaterThan(a);
  });
  it.each([0, 365, 730])(
    'uses correct floor and confidence decay at %d days',
    (days) => {
      const result = score([recognition(true, days)]);
      expect(result.familiarityScore).toBeCloseTo(
        Math.max(0.05, 0.9 * 2 ** (-days / 365)),
      );
      expect(result.confidence).toBeCloseTo(0.5 + 0.45 * 2 ** (-days / 365));
    },
  );
  it('latest wrong reduces score; new correct cancels penalty; event time beats observation', () => {
    const a = recognition(true, 1, 'a'),
      b = recognition(false, 0, 'b');
    expect(score([a, b]).familiarityScore).toBeCloseTo(
      0.9 * 2 ** (-1 / 365) - 0.15,
    );
    expect(score([a, b, recognition(true, 0, 'z')]).familiarityScore).toBe(0.9);
    expect(score([recognition(false)]).familiarityScore).toBe(0);
    expect(score([recognition(false)]).confidence).toBe(0.95);
  });
  it('rejects future score contexts and non-finite configuration', () => {
    expect(() =>
      scoreFamiliarity(
        build(),
        catalog().songs[0]!,
        config,
        daysAgo(1),
        catalog().taxonomy,
      ),
    ).toThrow();
    expect(() =>
      scoreFamiliarity(
        build(),
        catalog().songs[0]!,
        { ...config, weights: { ...config.weights, prior: Infinity } },
        now,
        catalog().taxonomy,
      ),
    ).toThrow();
  });
});

describe('real source to matrix chain', () => {
  it('has 84 synthetic songs, seven language groups, all eight dimensions and six distinct players', () => {
    const { catalog: c, manifest } = createMixedFixture();
    expect(c.songs).toHaveLength(84);
    expect(c.players).toHaveLength(6);
    expect(manifest).toMatchObject({ synthetic: true, audioIncluded: false });
    expect(Object.keys(manifest.distribution.languages!)).toHaveLength(7);
    expect(Object.keys(manifest.distribution)).toHaveLength(8);
    expect(c.audioAssets).toEqual([]);
    expect(manifest.ecosystems).toHaveLength(14);
    expect(
      new Set(c.players.map((p) => JSON.stringify(p.preferences))).size,
    ).toBe(6);
  });
  it('runs Mock source, normalization, profile and matrix without fabricated cells', async () => {
    const { catalog: c, rawData } = createMixedFixture();
    const source = new MockMusicSource(MOCK_SOURCE_ID, rawData);
    const snapshots = await Promise.all(
      c.players.map((p) => source.getUserMusicData(p.player.id)),
    );
    const profiles = c.players.map((p) =>
      buildPlayerProfile(
        {
          catalog: c,
          rawData: snapshots,
          scoringConfig: config,
          referenceTime: now,
        },
        p.player.id,
      ),
    );
    const input = {
      catalog: c,
      profiles,
      scoringConfig: config,
      referenceTime: now,
      matrixVersion: 'matrix:mixed-v1',
    };
    const matrix = buildFamiliarityMatrix(input);
    expect(matrix.playerIds).toHaveLength(6);
    expect(matrix.songIds).toHaveLength(84);
    expect(
      ProfileMatrixContextSchema.safeParse({
        catalog: c,
        profiles,
        scoringConfig: config,
        referenceTime: now,
        matrix,
      }).success,
    ).toBe(true);
    for (const p of profiles)
      for (const song of c.songs)
        expect(matrix.cells[p.playerId]![song.id]).toEqual(
          scoreFamiliarity(p, song, config, now, c.taxonomy),
        );
    const shuffled = buildFamiliarityMatrix({
      ...input,
      profiles: [...profiles].reverse(),
      catalog: { ...c, songs: [...c.songs].reverse() },
    });
    expect(shuffled).toEqual(matrix);
    expect(() =>
      buildFamiliarityMatrix({
        ...input,
        profiles: [profiles[0]!, profiles[0]!],
      }),
    ).toThrow();
    expect(await source.getUserMusicData(c.players[0]!.player.id)).not.toBe(
      snapshots[0],
    );
  }, 30000);
  it.each(['feasible', 'missing-catalog'] as const)(
    'calculates six-versus-one %s from evidence',
    (variant) => {
      const { catalog: c, rawData } = createStressFixture(variant);
      const profiles = c.players.map((p) =>
        buildPlayerProfile(
          { catalog: c, rawData, scoringConfig: config, referenceTime: now },
          p.player.id,
        ),
      );
      const matrix = buildFamiliarityMatrix({
        catalog: c,
        profiles,
        scoringConfig: config,
        referenceTime: now,
        matrixVersion: 'stress',
      });
      const coverage = matrix.playerIds.map(
        (p) =>
          Object.values(matrix.cells[p]!).filter(
            (cell) => cell.familiarityScore >= 0.6,
          ).length,
      );
      expect(coverage).toEqual(
        variant === 'feasible' ? [9, 9, 9, 9, 9, 9, 9] : [3, 3, 3, 3, 3, 3, 0],
      );
    },
  );
});

describe('gameplay evidence and recognition scope', () => {
  const session = GameSessionInputSchema.parse(sessionInput());
  const observedAt = '2026-09-24T00:00:02Z';
  const answer = (extra: Record<string, unknown> = {}) =>
    GameEventSchema.parse({
      ...eventEnvelope(),
      type: 'ANSWER_CORRECT',
      roundId: 'round:1',
      songId: 'song:1',
      playerId: 'player:1',
      actionId: 'action:1',
      judgementId: 'judgement:1',
      ...extra,
    });
  const convert = (event: ReturnType<typeof answer>) =>
    gameplayEvidence({
      catalog: catalog(),
      session,
      event,
      sourceId: 'game',
      observedAt,
    });
  it('retains complete question, recording and segment detail', () => {
    const recognitionScope = {
      questionId: 'question:1',
      recordingId: 'recording:1',
      segment: { startMs: 0, durationMs: 1000, kind: 'intro' },
    };
    const result = convert(answer({ recognitionScope }));
    expect(result).toMatchObject({ type: 'game_correct', recognitionScope });
    expect(
      normalizeEvidence([result!, result!], catalog(), observedAt),
    ).toMatchObject({ evidence: [result], duplicateCount: 1 });
  });
  it.each([
    { questionId: 'unknown' },
    { recordingId: 'unknown' },
    { questionId: 'question:1', recordingId: 'unknown' },
    {
      recordingId: 'recording:1',
      segment: { startMs: 999, durationMs: 2, kind: 'intro' },
    },
    {
      questionId: 'question:1',
      segment: { startMs: 0, durationMs: 999, kind: 'intro' },
    },
    {
      questionId: 'question:1',
      segment: { startMs: 0, durationMs: 1000, kind: 'chorus' },
    },
  ])('rejects mismatched recognition detail %j', (recognitionScope) => {
    expect(() => convert(answer({ recognitionScope }))).toThrow();
    expect(() =>
      normalizeEvidence(
        [
          recognition(true),
          EvidenceSchema.parse({
            ...recognition(true),
            evidenceId: 'scope',
            eventId: 'scope',
            recognitionScope,
          }),
        ],
        catalog(),
        now,
      ),
    ).toThrow();
  });
  it('accepts optional question-only and recording-only scopes', () => {
    expect(
      convert(answer({ recognitionScope: { questionId: 'question:1' } })),
    ).not.toBeNull();
    expect(
      convert(answer({ recognitionScope: { recordingId: 'recording:1' } })),
    ).not.toBeNull();
  });
  it('never turns participation or no action into a wrong answer', () => {
    for (const event of [
      GameEventSchema.parse({
        ...eventEnvelope(),
        type: 'GAME_STARTED',
        gameType: 'mock-karuta',
      }),
      GameEventSchema.parse({
        ...eventEnvelope(),
        type: 'ROUND_FINISHED',
        roundId: 'round:1',
      }),
      GameEventSchema.parse({
        ...eventEnvelope(),
        type: 'PLAYER_ACTION',
        roundId: 'round:1',
        songId: 'song:1',
        playerId: 'player:1',
        actionId: 'action:1',
        actionType: 'tap',
      }),
    ])
      expect(convert(event)).toBeNull();
    expect(convert(answer({ type: 'ANSWER_WRONG' }))).toMatchObject({
      type: 'game_wrong',
    });
  });
  it('rejects cross-session, unknown-player, future and unknown-song events', () => {
    for (const fields of [
      { gameSessionId: 'other' },
      { playerId: 'other' },
      { songId: 'other' },
      { occurredAt: '2027-01-01T00:00:00Z' },
    ])
      expect(() => convert(answer(fields))).toThrow();
  });
});

it('keeps direct selector matrices visibly separate from evidence-driven fixtures', () => {
  const matrix = directSmallMatrix();
  expect(matrix.catalogVersion).toBe('direct-selector-only-v1');
  expect(matrix.playerIds).toHaveLength(2);
  expect(matrix.songIds).toHaveLength(3);
});
it('source rejects foreign, duplicate and unknown users and returns isolated copies', async () => {
  const fixture = createMixedFixture(),
    raw = fixture.rawData[0]!;
  expect(() => new MockMusicSource('wrong', [raw])).toThrow();
  expect(() => new MockMusicSource(MOCK_SOURCE_ID, [raw, raw])).toThrow();
  const source = new MockMusicSource(MOCK_SOURCE_ID, [raw]);
  await expect(
    source.getUserMusicData(fixture.catalog.players[1]!.player.id),
  ).rejects.toThrow();
  const a = await source.getUserMusicData(raw.userId),
    b = await source.getUserMusicData(raw.userId);
  expect(a).toEqual(b);
  expect(a.evidence).not.toBe(b.evidence);
  expect(a.declaredPreferences).not.toBe(b.declaredPreferences);
});
it('refreshes declared source preferences, ignoring obsolete snapshots', () => {
  const c = catalog(),
    playerId = c.players[0]!.player.id;
  const raw = RawUserMusicDataSchema.parse({
    schemaVersion: 1,
    sourceId: 'source:1',
    userId: playerId,
    snapshotId: 'old',
    observedAt: daysAgo(1),
    evidence: [],
    declaredPreferences: {
      ...c.players[0]!.preferences,
      languages: { 'lang:en': { weight: 1, confidence: 1 } },
    },
  });
  const latest = RawUserMusicDataSchema.parse({
    ...raw,
    snapshotId: 'new',
    observedAt: now,
    declaredPreferences: c.players[0]!.preferences,
  });
  const input = {
    catalog: c,
    referenceTime: now,
    scoringConfig: config,
    rawData: [latest, raw],
  };
  expect(buildPlayerProfile(input, playerId).preferences.languages).toEqual({});
  expect(
    buildPlayerProfile({ ...input, rawData: [raw, latest] }, playerId),
  ).toEqual(buildPlayerProfile(input, playerId));
});
it('is independent of arbitrary genre/language IDs and never scores culture as familiarity', () => {
  const c = catalogInput();
  const old = score([], CatalogSchema.parse(c));
  const text = JSON.stringify(c)
    .replaceAll('genre:child', 'genre:unseen')
    .replaceAll('lang:en', 'lang:unseen');
  expect(score([], CatalogSchema.parse(JSON.parse(text)))).toEqual(old);
  c.taxonomy.push({
    id: 'culture:custom',
    dimension: 'cultures',
    label: 'Custom',
  });
  Object.assign(c.songs[0]!, { cultures: ['culture:custom'] });
  Object.assign(c.players[0]!.preferences, {
    cultures: { 'culture:custom': { weight: 1, confidence: 1 } },
  });
  expect(score([], CatalogSchema.parse(c))).toEqual(old);
});
it('keeps the confidence maximum independent of source count', () => {
  const a = score([ev()]);
  const b = score([ev(), ev({ evidenceId: 'another', sourceId: 'another' })]);
  expect(b.familiarityScore).toBe(a.familiarityScore);
  expect(b.confidence).toBe(a.confidence);
});
it('changes the complete matrix config snapshot even when the version name is reused', () => {
  const c = catalog(),
    p = build();
  const input = {
    catalog: c,
    profiles: [p],
    scoringConfig: config,
    referenceTime: now,
    matrixVersion: 'v1',
  };
  const a = buildFamiliarityMatrix(input),
    changed = { ...config, weights: { ...config.weights, prior: 0.1 } };
  const b = buildFamiliarityMatrix({ ...input, scoringConfig: changed });
  expect(a).not.toEqual(b);
  expect(
    ProfileMatrixContextSchema.safeParse({
      catalog: c,
      profiles: [p],
      scoringConfig: changed,
      referenceTime: now,
      matrix: a,
    }).success,
  ).toBe(false);
});
it('handles empty axes and rejects unsafe profile version overflow', () => {
  const c = catalog(),
    matrix = buildFamiliarityMatrix({
      catalog: { ...c, songs: [], recordings: [], questions: [] },
      profiles: [],
      scoringConfig: config,
      referenceTime: now,
      matrixVersion: 'empty',
    });
  expect(matrix.cells).toEqual({});
  const previous = { ...build(), profileVersion: Number.MAX_SAFE_INTEGER };
  expect(() => build([ev()], c, previous)).toThrow();
});

it('derives manifest ecosystems from actual content, including a reduced catalog', () => {
  const { catalog: c } = createStressFixture('missing-catalog');
  expect(coverageManifest(c).ecosystems).toEqual(['english-electronic']);
  expect(coverageManifest({ ...c, songs: [] }).ecosystems).toEqual([]);
});
it('validates recognition scope on final judgements before ignoring a non-answer event', () => {
  const result = gameResultInput();
  const event = GameEventSchema.parse({
    ...eventEnvelope(),
    type: 'GAME_FINISHED',
    occurredAt: result.endedAt,
    result: {
      ...result,
      judgements: result.judgements.map((j) => ({
        ...j,
        recognitionScope: { questionId: 'missing' },
      })),
    },
  });
  expect(() =>
    gameplayEvidence({
      catalog: catalog(),
      session: GameSessionInputSchema.parse(sessionInput()),
      event,
      sourceId: 'game',
      observedAt: result.endedAt,
    }),
  ).toThrow();
});
