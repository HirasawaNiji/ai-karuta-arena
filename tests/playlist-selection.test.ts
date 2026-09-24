import { describe, expect, it } from 'vitest';
import {
  SelectionRequestSchema,
  SelectionResultSchema,
  PlayerMusicProfileSchema,
  type SelectionRequest,
  type SongId,
} from '@amp/core';
import {
  evaluateObjective,
  filterCandidates,
  selectPlaylist,
  explainSelection,
  assessPlaylist,
} from '@amp/playlist-engine';
import { selectionFixture, assessmentFixture } from './fixtures/selection.js';
const id = (r: SelectionRequest, n: number) => r.candidateSongIds[n]!;
function genreOnly(r: SelectionRequest): SelectionRequest {
  return SelectionRequestSchema.parse({
    ...r,
    selectionConfig: {
      ...r.selectionConfig,
      diversityWeights: {
        genres: 1,
        languages: 0,
        regions: 0,
        artists: 0,
        eras: 0,
        cultures: 0,
        franchises: 0,
      },
    },
  });
}
describe('objective arithmetic', () => {
  it('matches independent hand calculations of F D C E Q and total', () => {
    const r = selectionFixture(),
      o = evaluateObjective(r, [id(r, 0)]);
    expect(o.fairness).toBeCloseTo(71 / 72);
    expect(o.diversity).toBe(1);
    expect(o.competition).toBeCloseTo(11 / 120);
    expect(o.exploration).toBeCloseTo(1 / 160);
    expect(o.softRatio).toBeCloseTo(0.5);
    expect(o.total).toBeCloseTo(
      (0.4 * 71) / 72 + 0.2 + (0.3 * 11) / 120 + 0.1 / 160 + 0.02 * 0.5,
    );
    expect(evaluateObjective(r, [])).toEqual({
      fairness: 0,
      diversity: 0,
      competition: 0,
      exploration: 0,
      softRatio: 0,
      total: 0,
    });
  });
  it('keeps N constant during partial selection and uses population variance', () => {
    const r = selectionFixture();
    const selected = [id(r, 0), id(r, 2)],
      o = evaluateObjective(r, selected);
    expect(o.fairness).toBe(1);
    expect(o.competition).toBeCloseTo((11 / 30 + 0.1) / 4);
    expect(o.exploration).toBeCloseTo(0.0125);
    expect(o.softRatio).toBeCloseTo(0.8);
    const larger = SelectionRequestSchema.parse({ ...r, requestedCount: 8 });
    expect(evaluateObjective(larger, selected).competition).toBeCloseTo(
      o.competition / 2,
    );
  });
  it('uses context relevance and mean preference, normalized over fixed filtered candidates', () => {
    let r = genreOnly(selectionFixture([[0.8, 0.2]]));
    const c = r.profileContext.catalog;
    r = SelectionRequestSchema.parse({
      ...r,
      profileContext: {
        ...r.profileContext,
        catalog: {
          ...c,
          taxonomy: [
            ...c.taxonomy,
            {
              id: 'new-genre',
              dimension: 'genres',
              label: 'New',
              parentId: 'genre',
            },
          ],
          songs: c.songs.map((s, i) => ({
            ...s,
            genres: [i ? 'new-genre' : 'genre'],
          })),
        },
        profiles: r.profileContext.profiles.map((p) =>
          PlayerMusicProfileSchema.parse({
            ...p,
            preferences: {
              ...p.preferences,
              genres: { 'new-genre': { weight: 0.9, confidence: 0.8 } },
            },
            provenance: [
              {
                dimension: 'genres',
                id: 'new-genre',
                source: 'declared',
                evidenceIds: [],
              },
            ],
          }),
        ),
      },
    });
    expect(evaluateObjective(r, [id(r, 0)]).diversity).toBeCloseTo(8 / 17);
    expect(evaluateObjective(r, [id(r, 1)]).diversity).toBeCloseTo(9 / 17);
    expect(evaluateObjective(r, r.candidateSongIds).diversity).toBeCloseTo(1);
    const banned = SelectionRequestSchema.parse({
      ...r,
      bannedSongIds: [id(r, 1)],
    });
    expect(evaluateObjective(banned, [id(r, 0)]).diversity).toBe(1);
    expect(() => evaluateObjective(banned, [id(r, 1)])).toThrow();
  });
  it('uses direct genre tags once, without ancestor or duplicate-song rewards', () => {
    const r = genreOnly(selectionFixture([[0.8, 0.8]]));
    expect(evaluateObjective(r, [id(r, 0)]).diversity).toBe(1);
    expect(evaluateObjective(r, r.candidateSongIds).diversity).toBe(1);
    expect(() => evaluateObjective(r, [id(r, 0), id(r, 0)])).toThrow();
  });
  it('ignores unknown metadata and leaves diversity zero when no weighted dimension is known', () => {
    const r = genreOnly(selectionFixture([[0.1, 0.1]]));
    const changed = SelectionRequestSchema.parse({
      ...r,
      profileContext: {
        ...r.profileContext,
        catalog: {
          ...r.profileContext.catalog,
          songs: r.profileContext.catalog.songs.map((s) => {
            const { popularity: _pop, ...rest } = s;
            void _pop;
            return { ...rest, genres: [] };
          }),
        },
      },
    });
    const o = evaluateObjective(changed, changed.candidateSongIds);
    expect(o.diversity).toBe(0);
    expect(o.exploration).toBe(0);
    expect(o.competition).toBe(0);
  });
  it('does not give exclusive recognition competition credit', () => {
    const r = selectionFixture([
      [1, 0],
      [0, 1],
    ]);
    const o = evaluateObjective(r, r.candidateSongIds);
    expect(o.competition).toBe(0);
    expect(o.exploration).toBe(0);
    expect(o.fairness).toBe(1);
    expect(o.softRatio).toBeCloseTo(0.3);
    const one = selectionFixture([[0.9, 0.9]]);
    expect(evaluateObjective(one, one.candidateSongIds).competition).toBe(0);
  });
  it('allows homogeneous profiles without an artificial genre quota', () => {
    const r = selectionFixture([
        [0.9, 0.9, 0.9],
        [0.9, 0.9, 0.9],
      ]),
      o = evaluateObjective(r, r.candidateSongIds);
    expect(o.fairness).toBe(1);
    expect(o.diversity).toBe(1);
    expect(o.competition).toBeCloseTo(0.9);
    expect(selectPlaylist(r).fairnessAssessment.passed).toBe(true);
  });
  it('uses the configurable exploration default only for missing player values', () => {
    const r = selectionFixture([[0.2]]),
      base = evaluateObjective(r, r.candidateSongIds);
    const p = r.profileContext.profiles[0]!;
    const explicit = SelectionRequestSchema.parse({
      ...r,
      profileContext: {
        ...r.profileContext,
        profiles: [{ ...p, explorationScore: 1 }],
      },
    });
    expect(
      evaluateObjective(explicit, explicit.candidateSongIds).exploration,
    ).toBeCloseTo(2 * base.exploration);
  });
  it('does not let a high fairness objective hide zero coverage', () => {
    const r = selectionFixture([
      [0, 0],
      [0, 0],
    ]);
    expect(evaluateObjective(r, r.candidateSongIds).fairness).toBe(1);
    expect(selectPlaylist(r).fairnessAssessment.passed).toBe(false);
  });
});
describe('filtering, dynamic selection and explanations', () => {
  it('selects the exact three-player four-song example: second song must be s3', () => {
    const r = selectionFixture(),
      result = selectPlaylist(r);
    expect(result.selectedSongIds.slice(0, 2)).toEqual(['s1', 's3']);
    expect(result.steps[0]!.deficitGain).toBe(2);
    expect(result.steps[1]!.deficitGain).toBe(1);
    expect(result.steps[0]!.coverageAfter).toEqual({ p1: 1, p2: 1, p3: 0 });
    expect(result.steps[1]!.coverageAfter).toEqual({ p1: 1, p2: 1, p3: 1 });
    expect(result.steps[0]!.tieBreak).toEqual({
      rule: 'song_id',
      tiedSongIds: ['s1', 's2'],
    });
    expect(result.steps[1]!.tieBreak.rule).toBe('deficit');
    expect(
      Object.values(result.fairnessAssessment.playerMetrics).map(
        (m) => m.coverageRatio,
      ),
    ).toEqual([0.5, 0.5, 0.25]);
    expect(result.fairnessAssessment.passed).toBe(true);
    expect(SelectionResultSchema.safeParse(result).success).toBe(true);
  });
  it('recomputes every marginal objective and yields a continuous independently checkable trace', () => {
    const r = selectionFixture(),
      report = explainSelection(r);
    const previous: SongId[] = [];
    for (const step of report.result.steps) {
      const before = evaluateObjective(r, previous),
        after = evaluateObjective(r, [...previous, step.songId]);
      expect(step.objectiveBefore).toEqual(before);
      expect(step.objectiveAfter).toEqual(after);
      for (const key of [
        'fairness',
        'diversity',
        'competition',
        'exploration',
        'softRatio',
      ] as const)
        expect(step.objectiveGains[key]).toBeCloseTo(after[key] - before[key]);
      expect(step.totalGain).toBe(after.total - before.total);
      expect(step.gainKey).toBe(Math.round(step.totalGain * 1e12));
      expect(step.softRatioContribution).toBe(
        step.objectiveGains.softRatio * r.selectionConfig.softRatioWeight,
      );
      previous.push(step.songId);
    }
    expect(report.assessment).toEqual(
      assessPlaylist(assessmentFixture(r, report.result.selectedSongIds)),
    );
    expect(report.comparisons).toHaveLength(12);
    expect(report.songs[0]).toMatchObject({
      songId: 's1',
      familiarPlayerIds: ['p1', 'p2'],
      category: 'common',
    });
    expect(report.songs[1]).toMatchObject({
      songId: 's3',
      familiarPlayerIds: ['p3'],
      category: 'home',
    });
  });
  it('filters unavailable then bans then history without counting overlaps twice', () => {
    const initial = selectionFixture(),
      r = SelectionRequestSchema.parse({
        ...initial,
        availability: {
          ...initial.availability,
          s1: { available: false, reason: 'missing asset' },
        },
        bannedSongIds: [id(initial, 0), id(initial, 1)],
        excludedHistorySongIds: [
          id(initial, 0),
          id(initial, 1),
          id(initial, 2),
        ],
      });
    expect(filterCandidates(r)).toEqual({
      songIds: ['s4'],
      excludedCounts: { unavailable: 1, banned: 1, history: 1 },
    });
    const result = selectPlaylist(r);
    expect(result.selectedSongIds).toEqual(['s4']);
    expect(result.excludedCounts).toEqual({
      unavailable: 1,
      banned: 1,
      history: 1,
    });
    expect(selectPlaylist(r)).toEqual(result);
    expect(result.fairnessAssessment.reasons.map((r) => r.code)).toContain(
      'SHORT_PLAYLIST',
    );
  });
  it('reports valid but insufficient candidates and preserves bans on regeneration', () => {
    const initial = selectionFixture(),
      r = SelectionRequestSchema.parse({
        ...initial,
        requestedCount: 6,
        bannedSongIds: [id(initial, 2)],
      });
    const result = selectPlaylist(r);
    expect(result.selectedSongIds).not.toContain('s3');
    expect(result.actualCount).toBe(3);
    expect(result.requestedCount).toBe(6);
    expect(result.unfilledCoverage).toEqual({ p1: 0, p2: 0, p3: 2 });
    const report = explainSelection(r);
    expect(report.message).toContain('本次未找到');
    expect(report.message).not.toContain('无解');
  });
  it('does not use confidence to silently alter coverage selection', () => {
    const r = selectionFixture(undefined, {
      confidence: [
        [0.9, 0.9, 0.9, 0.9],
        [0.9, 0.9, 0.9, 0.9],
        [0, 0, 0, 0],
      ],
    });
    const result = selectPlaylist(r);
    expect(result.selectedSongIds.slice(0, 2)).toEqual(['s1', 's3']);
    expect(result.fairnessAssessment.reasons).toContainEqual({
      code: 'LOW_CONFIDENCE',
      playerId: 'p3',
      observed: 1,
      threshold: 0.5,
    });
  });
  it('is invariant to candidate, catalog, profile and tag input order', () => {
    const r = selectionFixture(),
      original = selectPlaylist(r);
    const shuffled = SelectionRequestSchema.parse({
      ...r,
      candidateSongIds: [...r.candidateSongIds].reverse(),
      profileContext: {
        ...r.profileContext,
        profiles: [...r.profileContext.profiles].reverse(),
        catalog: {
          ...r.profileContext.catalog,
          songs: [...r.profileContext.catalog.songs].reverse(),
          players: [...r.profileContext.catalog.players].reverse(),
          taxonomy: [...r.profileContext.catalog.taxonomy].reverse(),
        },
      },
    });
    expect(selectPlaylist(shuffled)).toEqual(original);
  });
  it('keeps identity and taxonomy renaming equivalent away from song ties', () => {
    const r = selectionFixture(),
      original = selectPlaylist(r);
    const renamed = SelectionRequestSchema.parse(
      JSON.parse(
        JSON.stringify(r)
          .replaceAll('p1', 'renamed-A')
          .replaceAll('p2', 'renamed-B')
          .replaceAll('p3', 'renamed-C')
          .replaceAll('"genre"', '"new-open-style"')
          .replaceAll('"language"', '"new-language"'),
      ),
    );
    const result = selectPlaylist(renamed);
    expect(result.selectedSongIds).toEqual(original.selectedSongIds);
    expect(result.objectiveSummary).toEqual(original.objectiveSummary);
  });
  it('uses quantized objective gain then stable song IDs after equal deficit', () => {
    const r = selectionFixture([[0.1, 0.1]], { requestedCount: 1 });
    const c = r.profileContext.catalog;
    const changed = SelectionRequestSchema.parse({
      ...r,
      profileContext: {
        ...r.profileContext,
        catalog: {
          ...c,
          songs: c.songs.map((s, i) => ({ ...s, popularity: i ? 0.9 : 0.1 })),
        },
      },
    });
    const result = selectPlaylist(changed);
    expect(result.selectedSongIds).toEqual(['s2']);
    expect(result.steps[0]!.tieBreak.rule).toBe('objective');
    const almost = SelectionRequestSchema.parse({
      ...r,
      profileContext: {
        ...r.profileContext,
        catalog: {
          ...c,
          songs: c.songs.map((s, i) => ({ ...s, popularity: 0.5 + i * 1e-13 })),
        },
      },
    });
    expect(selectPlaylist(almost).selectedSongIds).toEqual(['s1']);
  });
  it('returns empty invalid selection without computing fake objectives for no players or no candidates', () => {
    for (const r of [selectionFixture([]), selectionFixture([[]])]) {
      const result = selectPlaylist(r);
      expect(result.selectedSongIds).toEqual([]);
      expect(result.steps).toEqual([]);
      expect(result.fairnessAssessment.passed).toBe(false);
      expect(Object.values(result.objectiveSummary).every((v) => v === 0)).toBe(
        true,
      );
    }
  });
  it('rejects unsafe integer products, squared deficits and gain keys', () => {
    const r = selectionFixture();
    for (const requestedCount of [Number.MAX_SAFE_INTEGER, 1_000_000_000])
      expect(() => selectPlaylist({ ...r, requestedCount })).toThrow(
        /unsafe integer/,
      );
    expect(() =>
      selectPlaylist({
        ...r,
        selectionConfig: { ...r.selectionConfig, softRatioWeight: 1e10 },
      }),
    ).toThrow(/unsafe integer/);
  });
  it('rejects duplicate candidates, missing availability and matrix entries before selecting', () => {
    const r = selectionFixture();
    for (const invalid of [
      { ...r, candidateSongIds: [...r.candidateSongIds, id(r, 0)] },
      { ...r, availability: {} },
      {
        ...r,
        profileContext: {
          ...r.profileContext,
          matrix: { ...r.profileContext.matrix, cells: {} },
        },
      },
    ])
      expect(() => selectPlaylist(invalid as SelectionRequest)).toThrow();
  });
  it('retains all actual configuration content and leaves the input unchanged', () => {
    const r = selectionFixture(),
      before = JSON.stringify(r),
      result = selectPlaylist(r);
    expect(JSON.stringify(r)).toBe(before);
    expect(result.inputVersions.selectionConfig).toEqual(r.selectionConfig);
    expect(result.fairnessAssessment.fairnessConfig).toEqual(r.fairnessConfig);
    const changed = {
      ...r,
      fairnessConfig: { ...r.fairnessConfig, minCoverageRatio: 0.75 },
    };
    expect(selectPlaylist(changed).fairnessAssessment.passed).toBe(false);
  });
});
