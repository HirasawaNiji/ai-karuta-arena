import { describe, expect, it } from 'vitest';
import {
  CatalogSchema,
  RawUserMusicDataSchema,
  SelectionRequestSchema,
  type Catalog,
  type RawUserMusicData,
  type SelectionRequest,
} from '@amp/core';
import { MockMusicSource } from '@amp/adapters';
import {
  createMixedFixture,
  createStressFixture,
  MOCK_REFERENCE_TIME as now,
  MOCK_SOURCE_ID,
} from '@amp/adapters/fixtures';
import {
  buildPlayerProfile,
  buildFamiliarityMatrix,
  DEFAULT_SCORING_CONFIG,
} from '@amp/music-profile';
import {
  selectPlaylist,
  assessPlaylist,
  explainSelection,
  DEFAULT_FAIRNESS_CONFIG,
  DEFAULT_SELECTION_CONFIG,
} from '@amp/playlist-engine';
import { assessmentFixture } from './fixtures/selection.js';
type Fixture = { catalog: Catalog; rawData: readonly RawUserMusicData[] };
async function request(
  fixture: Fixture,
  requestedCount = 12,
): Promise<SelectionRequest> {
  const { catalog } = fixture,
    source = new MockMusicSource(MOCK_SOURCE_ID, fixture.rawData);
  const rawData = await Promise.all(
    catalog.players.map((p) => source.getUserMusicData(p.player.id)),
  );
  const profiles = catalog.players.map((p) =>
    buildPlayerProfile(
      {
        catalog,
        rawData,
        referenceTime: now,
        scoringConfig: DEFAULT_SCORING_CONFIG,
      },
      p.player.id,
    ),
  );
  const matrix = buildFamiliarityMatrix({
    catalog,
    profiles,
    referenceTime: now,
    scoringConfig: DEFAULT_SCORING_CONFIG,
    matrixVersion: 'integration-matrix',
  });
  return SelectionRequestSchema.parse({
    profileContext: {
      catalog,
      profiles,
      matrix,
      referenceTime: now,
      scoringConfig: DEFAULT_SCORING_CONFIG,
    },
    candidateSongIds: catalog.songs.map((s) => s.id),
    requestedCount,
    bannedSongIds: [],
    excludedHistorySongIds: [],
    availability: Object.fromEntries(
      catalog.songs.map((s) => [s.id, { available: true }]),
    ),
    selectionConfig: DEFAULT_SELECTION_CONFIG,
    fairnessConfig: DEFAULT_FAIRNESS_CONFIG,
    selectionVersion: 1,
    gameType: 'mock-karuta',
    roundNumber: 1,
  });
}
/** Explicit zero reports keep unfamiliar songs supported, independently of simulated answers. */
function noCommonMinority(): Fixture {
  const base = createStressFixture();
  const rawData = base.rawData.map((raw, i) =>
    RawUserMusicDataSchema.parse({
      ...raw,
      evidence: base.catalog.songs.map((song) => {
        const known = (
          i < 6 ? base.groups.common : base.groups.classical
        ).includes(song.id);
        const envelope = {
          evidenceId: 'isolated:' + i + ':' + song.id,
          playerId: raw.userId,
          songId: song.id,
          sourceId: MOCK_SOURCE_ID,
          observedAt: now,
        };
        return known
          ? {
              ...envelope,
              type: 'warmup_correct',
              eventId: 'isolated-event:' + i + ':' + song.id,
              occurredAt: now,
            }
          : { ...envelope, type: 'self_report', familiarity: 0 };
      }),
    }),
  );
  return { catalog: base.catalog, rawData };
}
function expand(fixture: Fixture, forMinority: boolean): Fixture {
  const template = fixture.catalog.songs.find((s) =>
    s.genres.some((g) => g === 'genre:classical'),
  )!;
  const catalog = CatalogSchema.parse({
    ...fixture.catalog,
    catalogVersion: forMinority ? 'minority-expanded' : 'majority-expanded',
    songs: [
      ...fixture.catalog.songs,
      ...Array.from({ length: 3 }, (_, i) => ({
        ...template,
        id: 'new-song:' + i,
        title: 'Synthetic expansion ' + i,
      })),
    ],
  });
  const rawData = fixture.rawData.map((raw, i) =>
    RawUserMusicDataSchema.parse({
      ...raw,
      snapshotId: 'expanded:' + raw.snapshotId,
      evidence: [
        ...raw.evidence,
        ...catalog.songs
          .filter((s) => s.id.startsWith('new-song:'))
          .map((song) => {
            const known = forMinority ? i === 6 : i < 6;
            const envelope = {
              evidenceId: 'expanded:' + i + ':' + song.id,
              playerId: raw.userId,
              songId: song.id,
              sourceId: MOCK_SOURCE_ID,
              observedAt: now,
            };
            return known
              ? {
                  ...envelope,
                  type: 'warmup_correct',
                  eventId: 'expanded-event:' + i + ':' + song.id,
                  occurredAt: now,
                }
              : { ...envelope, type: 'self_report', familiarity: 0 };
          }),
      ],
    }),
  );
  return { catalog, rawData };
}
describe('source to independent selection and assessment', () => {
  it('selects the mixed 84-song catalog from computed evidence, with truthful diagnostics', async () => {
    const r = await request(createMixedFixture()),
      report = explainSelection(r);
    expect(report.result.actualCount).toBe(12);
    expect(new Set(report.result.selectedSongIds).size).toBe(12);
    expect(report.assessment).toEqual(
      assessPlaylist(assessmentFixture(r, report.result.selectedSongIds)),
    );
    expect(
      report.result.steps.every((s) => s.coverageAfter !== s.coverageBefore),
    ).toBe(true);
    expect(report.result.inputVersions.catalogVersion).toBe('synthetic-84-v1');
    // Sparse cross-circle evidence may legitimately warn; never fabricate recognition to force a pass.
    expect(report.assessment.passed).toBe(false);
    expect(
      report.assessment.reasons.filter(
        (reason) => reason.code === 'LOW_CONFIDENCE',
      ),
    ).toHaveLength(6);
    expect(
      report.assessment.reasons
        .filter((reason) => reason.code === 'LOW_COVERAGE')
        .map((reason) => ('playerId' in reason ? reason.playerId : null)),
    ).toEqual(['player:mixed-3', 'player:mixed-5']);
    expect(report.comparisons).toHaveLength(72);
  });
  it('passes the evidence-driven six-versus-one feasible catalog', async () => {
    const r = await request(createStressFixture()),
      result = selectPlaylist(r);
    expect(result.fairnessAssessment.passed).toBe(true);
    expect(
      Object.values(result.fairnessAssessment.playerMetrics).map(
        (m) => m.familiarCount,
      ),
    ).toEqual([9, 9, 9, 9, 9, 9, 9]);
  });
  it('honestly warns when the minority catalog is missing', async () => {
    const r = await request(createStressFixture('missing-catalog')),
      result = selectPlaylist(r);
    expect(result.actualCount).toBe(3);
    expect(result.requestedCount).toBe(12);
    expect(result.fairnessAssessment.passed).toBe(false);
    expect(result.fairnessAssessment.reasons).toEqual(
      expect.arrayContaining([
        {
          code: 'LOW_COVERAGE',
          playerId: 'player:stress-7',
          observed: 0,
          threshold: 0.25,
        },
        {
          code: 'LOW_CONFIDENCE',
          playerId: 'player:stress-7',
          observed: 1,
          threshold: 0.5,
        },
        { code: 'COVERAGE_GAP', observed: 1, threshold: 0.4 },
        { code: 'SHORT_PLAYLIST', observed: 3, threshold: 12 },
      ]),
    );
  });
  it('distinguishes a short playlist from actual coverage failure after bans', async () => {
    const fixture = createStressFixture(),
      r = await request(fixture),
      before = selectPlaylist(r);
    const selected = before.selectedSongIds.filter(
      (id) => !fixture.groups.classical.includes(id),
    );
    const assessment = assessPlaylist({
      ...assessmentFixture(r, selected),
      selectionVersion: 2,
    });
    expect(assessment.reasons).toEqual([
      { code: 'SHORT_PLAYLIST', observed: 9, threshold: 12 },
    ]);
    expect(Object.values(assessment.playerMetrics).at(-1)!.coverageRatio).toBe(
      6 / 9,
    );
    const regenerated = selectPlaylist({
      ...r,
      bannedSongIds: fixture.groups.classical,
      selectionVersion: 2,
    });
    expect(regenerated.selectedSongIds).toHaveLength(9);
    expect(
      regenerated.selectedSongIds.some((id) =>
        fixture.groups.classical.includes(id),
      ),
    ).toBe(false);
    expect(regenerated.fairnessAssessment.reasons).toEqual(assessment.reasons);
  });
  it('detects genuinely lost minority coverage and only repairs with unbanned minority content', async () => {
    const fixture = noCommonMinority(),
      r = await request(fixture),
      bans = createStressFixture().groups.classical;
    const before = selectPlaylist(r);
    expect(before.fairnessAssessment.passed).toBe(true);
    const lost = selectPlaylist({ ...r, bannedSongIds: bans });
    expect(lost.fairnessAssessment.reasons).toContainEqual({
      code: 'LOW_COVERAGE',
      playerId: 'player:stress-7',
      observed: 0,
      threshold: 0.25,
    });
    const minorRequest = await request(expand(fixture, true));
    const repaired = selectPlaylist({ ...minorRequest, bannedSongIds: bans });
    expect(repaired.selectedSongIds.some((id) => bans.includes(id))).toBe(
      false,
    );
    expect(repaired.fairnessAssessment.passed).toBe(true);
    expect(
      repaired.selectedSongIds.filter((id) => id.startsWith('new-song:')),
    ).toHaveLength(3);
    const majorRequest = await request(expand(fixture, false));
    const notRepaired = selectPlaylist({
      ...majorRequest,
      bannedSongIds: bans,
    });
    expect(notRepaired.fairnessAssessment.reasons).toContainEqual({
      code: 'LOW_COVERAGE',
      playerId: 'player:stress-7',
      observed: 0,
      threshold: 0.25,
    });
  });
});
