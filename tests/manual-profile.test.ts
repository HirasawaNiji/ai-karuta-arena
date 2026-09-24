import { describe, expect, it } from 'vitest';
import {
  CatalogSchema,
  ScoringConfigSchema,
  TagIdSchema,
  EvidenceSchema,
  RawUserMusicDataSchema,
  ManualPreferencesSchema,
  emptyPreferences,
  type Evidence,
  type Question,
  type PlayerMusicProfile,
} from '@amp/core';
import { ManualPreferenceSource } from '@amp/adapters';
import {
  MANUAL_SCORING_CONFIG as config,
  DEFAULT_SCORING_CONFIG,
  buildPlayerProfile,
  normalizeEvidence,
  scoreFamiliarity,
  buildFamiliarityMatrix,
} from '@amp/music-profile';
import { catalogInput } from './fixtures/catalog.js';
const now = '2026-09-24T00:00:00Z';
function context() {
  const c = catalogInput();
  Object.assign(c.players[0]!.preferences, emptyPreferences());
  c.recordings.push({
    ...c.recordings[0]!,
    recordingId: 'recording:2',
    versionLabel: 'Other',
  });
  c.questions.push({
    ...c.questions[0]!,
    questionId: 'question:2',
    recordingId: 'recording:2',
  });
  c.questions.push({
    ...c.questions[0]!,
    questionId: 'question:chorus',
    segmentKind: 'chorus',
  });
  return CatalogSchema.parse(c);
}
const catalog = context();
const player = catalog.players[0]!.player.id;
const song = catalog.songs[0]!;
const q = catalog.questions[0]!;
function report(extra: Record<string, unknown> = {}): Evidence {
  return EvidenceSchema.parse({
    type: 'recognition_report',
    evidenceId: 'report',
    playerId: player,
    songId: song.id,
    sourceId: 'manual',
    observedAt: now,
    recognitionLevel: 'intro',
    ...extra,
  });
}
function build(evidence: readonly Evidence[], previous?: PlayerMusicProfile) {
  const raw = RawUserMusicDataSchema.parse({
    schemaVersion: 1,
    sourceId: 'manual',
    userId: player,
    snapshotId: 's',
    observedAt: now,
    declaredPreferences: emptyPreferences(),
    evidence,
  });
  return buildPlayerProfile(
    { catalog, rawData: [raw], referenceTime: now, scoringConfig: config },
    player,
    previous,
  );
}
function score(
  evidence: readonly Evidence[],
  question: Question | undefined = q,
) {
  return scoreFamiliarity(
    build(evidence),
    song,
    config,
    now,
    catalog.taxonomy,
    question,
  );
}
describe('manual scoring v2', () => {
  it('requires explicit v2 configuration for manual floors', () => {
    expect(() =>
      ScoringConfigSchema.parse({
        ...DEFAULT_SCORING_CONFIG,
        manual: config.manual,
      }),
    ).toThrow();
    expect(() =>
      ScoringConfigSchema.parse({ ...config, manual: undefined }),
    ).toThrow();
  });
  it.each([
    ['heard', 0.25],
    ['familiar', 0.65],
    ['intro', 0.65],
  ] as const)(
    'preserves raw %s and applies a general floor',
    (level, floor) => {
      const e = report({ recognitionLevel: level });
      const result = score([e]);
      expect(result.familiarityScore).toBe(floor);
      expect(result.confidence).toBe(0.6);
      expect(build([e]).songEvidence[song.id]?.[0]?.type).toBe(
        'recognition_report',
      );
    },
  );
  it('applies intro only to matching recording and segment, without confidence leakage', () => {
    const e = report({ recognitionScope: { recordingId: q.recordingId } });
    expect(score([e]).familiarityScore).toBe(0.85);
    for (const question of catalog.questions.slice(1)) {
      expect(score([e], question).familiarityScore).toBe(0.05);
      expect(score([e], question).confidence).toBe(0);
    }
    const generic = scoreFamiliarity(
      build([e]),
      song,
      config,
      now,
      catalog.taxonomy,
    );
    expect(generic.familiarityScore).toBe(0.05);
    expect(generic.confidence).toBe(0);
  });
  it('takes specific question over newer general, then newest same scope even when lower', () => {
    const general = report({
      evidenceId: 'general',
      recognitionLevel: 'intro',
    });
    const old = report({
      evidenceId: 'old',
      observedAt: '2026-09-23T00:00:00Z',
      recognitionScope: { questionId: q.questionId },
    });
    const lower = report({
      evidenceId: 'lower',
      recognitionLevel: 'heard',
      recognitionScope: { questionId: q.questionId },
    });
    const normalized = normalizeEvidence(
      [general, lower, old],
      catalog,
      now,
    ).evidence;
    expect(normalized).toHaveLength(2);
    expect(score(normalized).familiarityScore).toBe(0.25);
    expect(score([...normalized].reverse())).toEqual(score(normalized));
  });
  it('orders question > recording segment > recording > song and stable IDs break ties', () => {
    const records = [
      report({ evidenceId: 'song' }),
      report({
        evidenceId: 'recording',
        recognitionLevel: 'heard',
        recognitionScope: { recordingId: q.recordingId },
      }),
      report({
        evidenceId: 'segment',
        recognitionLevel: 'familiar',
        recognitionScope: {
          recordingId: q.recordingId,
          segment: {
            startMs: q.startMs,
            durationMs: q.durationMs,
            kind: q.segmentKind,
          },
        },
      }),
    ];
    expect(score(records).familiarityScore).toBe(0.65);
    expect(
      score([
        ...records,
        report({
          evidenceId: 'q',
          recognitionLevel: 'heard',
          recognitionScope: { questionId: q.questionId },
        }),
      ]).familiarityScore,
    ).toBe(0.25);
    expect(
      score([
        report({ evidenceId: 'a' }),
        report({ evidenceId: 'z', recognitionLevel: 'heard' }),
      ]).familiarityScore,
    ).toBe(0.25);
  });
  it('applies correct floor and latest wrong penalty after self-report only to matching question', () => {
    const correct = EvidenceSchema.parse({
      type: 'game_correct',
      sourceId: 'manual',
      evidenceId: 'correct',
      eventId: 'correct',
      playerId: player,
      songId: song.id,
      observedAt: now,
      occurredAt: now,
      recognitionScope: { questionId: q.questionId },
    });
    const wrong = EvidenceSchema.parse({
      ...correct,
      type: 'game_wrong',
      evidenceId: 'wrong',
      eventId: 'wrong',
    });
    expect(score([report(), correct, wrong]).familiarityScore).toBeCloseTo(
      0.75,
    );
    const other = score([correct, wrong], catalog.questions[1]);
    expect(other.familiarityScore).toBe(0.05);
    expect(other.confidence).toBe(0);
    const unscoped = EvidenceSchema.parse({
      ...correct,
      recognitionScope: undefined,
    });
    expect(score([unscoped]).confidence).toBe(0);
  });
  it('keeps v1 scores unchanged by typed self-reports', () => {
    expect(
      scoreFamiliarity(
        build([report()]),
        song,
        DEFAULT_SCORING_CONFIG,
        now,
        catalog.taxonomy,
      ).familiarityScore,
    ).toBe(0.05);
    expect(
      scoreFamiliarity(
        build([report()]),
        song,
        DEFAULT_SCORING_CONFIG,
        now,
        catalog.taxonomy,
      ).confidence,
    ).toBe(0);
  });
  it('rejects mismatched scope before building a profile or question matrix', () => {
    expect(() =>
      build([report({ recognitionScope: { recordingId: 'missing' } })]),
    ).toThrow();
    expect(() =>
      buildFamiliarityMatrix({
        catalog,
        profiles: [build([])],
        scoringConfig: config,
        referenceTime: now,
        matrixVersion: 'v2',
        questionBySongId: { [song.id]: { ...q, startMs: 9999 } },
      }),
    ).toThrow();
  });
});
describe('manual source', () => {
  it('retains levels, defaults tags to .8/.4, and permits empty submission', async () => {
    const source = new ManualPreferenceSource();
    source.submit(
      player,
      ManualPreferencesSchema.parse({
        tagIds: ['genre:child'],
        reports: [{ songId: song.id, recognitionLevel: 'familiar' }],
      }),
      catalog,
      config,
      now,
      'first',
    );
    const raw = await source.getUserMusicData(player);
    expect(
      raw.declaredPreferences.genres[TagIdSchema.parse('genre:child')],
    ).toEqual({ weight: 0.8, confidence: 0.4 });
    expect(raw.evidence[0]).toMatchObject({
      type: 'recognition_report',
      recognitionLevel: 'familiar',
    });
    const p = buildPlayerProfile(
      { catalog, rawData: [raw], referenceTime: now, scoringConfig: config },
      player,
    );
    const empty = source.submit(
      player,
      { tagIds: [], reports: [] },
      catalog,
      config,
      now,
      'second',
    );
    const next = buildPlayerProfile(
      { catalog, rawData: [empty], referenceTime: now, scoringConfig: config },
      player,
      p,
    );
    expect(next.profileVersion).toBe(p.profileVersion + 1);
    expect(next.preferences.genres).toEqual({});
    expect(
      scoreFamiliarity(next, song, config, now, catalog.taxonomy).confidence,
    ).toBe(0);
  });
  it('rejects unknown tags, duplicate scopes and out-of-bounds segments', () => {
    const source = new ManualPreferenceSource();
    for (const input of [
      { tagIds: ['unknown'], reports: [] },
      {
        tagIds: [],
        reports: [
          { songId: song.id, recognitionLevel: 'heard' },
          { songId: song.id, recognitionLevel: 'intro' },
        ],
      },
      {
        tagIds: [],
        reports: [
          {
            songId: song.id,
            recognitionLevel: 'intro',
            recognitionScope: {
              recordingId: q.recordingId,
              segment: { startMs: 1000, durationMs: 10, kind: 'intro' },
            },
          },
        ],
      },
    ])
      expect(() =>
        source.submit(
          player,
          ManualPreferencesSchema.parse(input),
          catalog,
          config,
          now,
          'bad',
        ),
      ).toThrow();
  });
});
