import { describe, expect, it } from 'vitest';
import { AssessmentInputSchema, type AssessmentInput } from '@amp/core';
import { assessPlaylist, explainAssessment } from '@amp/playlist-engine';
import { selectionFixture, assessmentFixture } from './fixtures/selection.js';
const codes = (input: AssessmentInput) =>
  assessPlaylist(input).reasons.map((r) => r.code);
describe('independent fairness assessment', () => {
  it('uses actual M for ratios but retains requested N and all warnings', () => {
    const r = selectionFixture(
      [
        [0.9, 0.1, 0.1, 0.1],
        [0.1, 0.1, 0.1, 0.1],
      ],
      {
        confidence: [
          [0.9, 0.1, 0.1, 0.1],
          [0.1, 0.1, 0.1, 0.1],
        ],
        requestedCount: 4,
      },
    );
    const assessment = assessPlaylist(
      assessmentFixture(r, r.candidateSongIds.slice(0, 2)),
    );
    expect(assessment).toMatchObject({
      requestedCount: 4,
      actualCount: 2,
      validity: true,
      passed: false,
      maxCoverageGap: 0.5,
    });
    expect(Object.values(assessment.playerMetrics)).toEqual([
      {
        familiarCount: 1,
        coverageRatio: 0.5,
        familiaritySum: 1,
        lowConfidenceCount: 1,
        lowConfidenceRatio: 0.5,
      },
      {
        familiarCount: 0,
        coverageRatio: 0,
        familiaritySum: 0.2,
        lowConfidenceCount: 2,
        lowConfidenceRatio: 1,
      },
    ]);
    expect(assessment.reasons.map((r) => r.code).sort()).toEqual([
      'COVERAGE_GAP',
      'LOW_CONFIDENCE',
      'LOW_COVERAGE',
      'SHORT_PLAYLIST',
    ]);
  });
  it('passes exact coverage and confidence thresholds, with only a half low-confidence ratio', () => {
    const r = selectionFixture([[0.6, 0.1, 0.1, 0.1]], {
      confidence: [[0.5, 0.5, 0.499999, 0.499999]],
    });
    const result = assessPlaylist(assessmentFixture(r));
    expect(result.passed).toBe(true);
    expect(Object.values(result.playerMetrics)[0]).toMatchObject({
      familiarCount: 1,
      lowConfidenceCount: 2,
    });
  });
  it.each([
    [0.59999949, false],
    [0.5999995, true],
    [0.6, true],
    [0.60000049, true],
  ])('quantizes familiarity %s to threshold correctly', (value, familiar) => {
    const result = explainAssessment(
      assessmentFixture(selectionFixture([[value]])),
    );
    expect(result.comparisons[0]!.isFamiliar).toBe(familiar);
    expect(result.comparisons[0]!.familiarityScore).toBe(value);
    expect(result.comparisons[0]!.familiarityInt).toBe(Math.round(value * 1e6));
    expect(result.assessment.passed).toBe(familiar);
  });
  it.each([
    [0.49999949, true],
    [0.4999995, false],
    [0.5, false],
  ])('quantizes confidence %s separately', (value, low) => {
    const input = assessmentFixture(
      selectionFixture([[0.9]], { confidence: [[value]] }),
    );
    const result = explainAssessment(input);
    expect(result.comparisons[0]!.isLowConfidence).toBe(low);
    expect(codes(input).includes('LOW_CONFIDENCE')).toBe(low);
  });
  it('requires ceil(M*ratio), never rounded coverage', () => {
    const r = selectionFixture([[0.9, 0.1, 0.1, 0.1, 0.1]]);
    expect(codes(assessmentFixture(r))).toContain('LOW_COVERAGE');
    const four = assessmentFixture(r, r.candidateSongIds.slice(0, 4));
    expect(codes(four)).not.toContain('LOW_COVERAGE');
    expect(codes(four)).toContain('SHORT_PLAYLIST');
  });
  it('keeps coverage gap equality valid and rejects one song beyond it', () => {
    const equal = selectionFixture([
      [0.9, 0.9, 0.9, 0.1, 0.1],
      [0.9, 0.1, 0.1, 0.1, 0.1],
    ]);
    expect(codes(assessmentFixture(equal))).not.toContain('COVERAGE_GAP');
    const above = selectionFixture([
      [0.9, 0.9, 0.9, 0.9, 0.1],
      [0.9, 0.1, 0.1, 0.1, 0.1],
    ]);
    expect(codes(assessmentFixture(above))).toContain('COVERAGE_GAP');
  });
  it('cannot hide low confidence behind high scores or homogeneity', () => {
    const high = selectionFixture(
      [
        [0.99, 0.99],
        [0.99, 0.99],
      ],
      {
        confidence: [
          [0.1, 0.1],
          [0.1, 0.1],
        ],
      },
    );
    const result = assessPlaylist(assessmentFixture(high));
    expect(result.passed).toBe(false);
    expect(result.reasons.map((r) => r.code)).toEqual([
      'LOW_CONFIDENCE',
      'LOW_CONFIDENCE',
    ]);
    const unknown = selectionFixture(
      [
        [0.05, 0.05],
        [0.05, 0.05],
      ],
      {
        confidence: [
          [0, 0],
          [0, 0],
        ],
      },
    );
    expect(codes(assessmentFixture(unknown))).toEqual([
      'LOW_COVERAGE',
      'LOW_CONFIDENCE',
      'LOW_COVERAGE',
      'LOW_CONFIDENCE',
    ]);
  });
  it('returns null ratios for an empty playlist and never allows an empty game', () => {
    const request = selectionFixture(),
      result = assessPlaylist(assessmentFixture(request, []));
    expect(result).toMatchObject({
      validity: false,
      passed: false,
      maxCoverageGap: null,
    });
    expect(result.reasons.map((r) => r.code)).toEqual([
      'EMPTY_PLAYLIST',
      'SHORT_PLAYLIST',
    ]);
    for (const m of Object.values(result.playerMetrics))
      expect(m).toMatchObject({
        coverageRatio: null,
        lowConfidenceRatio: null,
      });
    const noPlayers = assessPlaylist(assessmentFixture(selectionFixture([])));
    expect(noPlayers).toMatchObject({
      validity: false,
      passed: false,
      maxCoverageGap: null,
      playerMetrics: {},
    });
    expect(noPlayers.reasons).toEqual([{ code: 'NO_PLAYERS' }]);
  });
  it('reassesses modified playlists independently, preserving selection version', () => {
    const r = selectionFixture();
    const original = assessPlaylist(assessmentFixture(r));
    const after = assessPlaylist({
      ...assessmentFixture(
        r,
        r.candidateSongIds.filter((id) => id !== 's3'),
      ),
      selectionVersion: 2,
    });
    expect(original.passed).toBe(true);
    expect(after.passed).toBe(false);
    expect(after.selectionVersion).toBe(2);
    expect(after.reasons).toContainEqual({
      code: 'LOW_COVERAGE',
      playerId: 'p3',
      observed: 0,
      threshold: 0.25,
    });
  });
  it('rejects extra, missing, duplicate, unknown and nonfinite input rather than treating it as zero', () => {
    const input = assessmentFixture(selectionFixture());
    for (const invalid of [
      { ...input, requestedCount: 1 },
      { ...input, requestedCount: 0 },
      {
        ...input,
        selectedSongIds: [...input.selectedSongIds, input.selectedSongIds[0]],
      },
      { ...input, playerIds: [] },
      { ...input, matrix: { ...input.matrix, cells: {} } },
      {
        ...input,
        fairnessConfig: {
          ...input.fairnessConfig,
          minCoverageRatio: 0.1234567,
        },
      },
      {
        ...input,
        fairnessConfig: { ...input.fairnessConfig, familiarityThreshold: NaN },
      },
      { ...input, hostConfirmed: true },
    ])
      expect(() => assessPlaylist(invalid as AssessmentInput)).toThrow();
    expect(() =>
      assessPlaylist({ ...input, requestedCount: Number.MAX_SAFE_INTEGER }),
    ).toThrow(/unsafe integer/);
  });
  it('reports raw and compared values without mutating inputs or depending on player order', () => {
    const r = selectionFixture(),
      input = assessmentFixture(r);
    const before = JSON.stringify(input);
    const a = explainAssessment(input),
      b = explainAssessment(
        AssessmentInputSchema.parse({
          ...input,
          playerIds: [...input.playerIds].reverse(),
        }),
      );
    expect(a).toEqual(b);
    expect(JSON.stringify(input)).toBe(before);
    expect(a.comparisons).toHaveLength(12);
  });
});
