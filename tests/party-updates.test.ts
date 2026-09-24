import { it, expect } from 'vitest';
import {
  PartyStateSchema,
  RawUserMusicDataSchema,
  type RawUserMusicData,
} from '@amp/core';
import { harness } from './fixtures/party-harness.js';

it.each([
  'scoring',
  'selection',
  'fairness',
  'preferences',
  'requestedCount',
] as const)(
  'same-name %s configuration changes invalidate the host acknowledgement',
  async (field) => {
    const h = harness({ count: 13 });
    await h.ready();
    await h.send('ACKNOWLEDGE_CONTINUE');
    const before = h.runtime.getSnapshot();
    const config = { ...before.config };
    let requestedCount = 13,
      partyPreferences = before.partyPreferences;
    if (field === 'scoring')
      config.scoring = {
        ...config.scoring,
        playCountCap: config.scoring.playCountCap + 1,
      };
    if (field === 'selection')
      config.selection = {
        ...config.selection,
        softRatioWeight: config.selection.softRatioWeight + 0.01,
      };
    if (field === 'fairness')
      config.fairness = { ...config.fairness, maxCoverageGap: 0.31 };
    if (field === 'preferences')
      partyPreferences = { excludePlayedSongs: false };
    if (field === 'requestedCount') requestedCount = 14;
    expect(
      await h.send('UPDATE_CONFIG', {
        config,
        requestedCount,
        partyPreferences,
      }),
    ).toMatchObject({ ok: true });
    const after = h.runtime.getSnapshot();
    expect(after.selectionVersion).toBe(before.selectionVersion + 1);
    expect(after.hostAcknowledgement).toBeNull();
    expect(after.evaluationContext?.config).toEqual(config);
  },
);

it('changed source evidence invalidates confirmation even at identical referenceTime', async () => {
  const fixture = harness().fixture;
  let changed = false;
  const h = harness({
    count: 13,
    source: {
      sourceId: fixture.rawData[0]!.sourceId,
      getUserMusicData: (id) => {
        const raw = fixture.rawData.find((r) => r.userId === id)!;
        return Promise.resolve(
          changed
            ? RawUserMusicDataSchema.parse({
                ...raw,
                snapshotId: raw.snapshotId + ':changed',
                evidence: [
                  ...raw.evidence,
                  {
                    type: 'game_wrong',
                    evidenceId: 'changed:' + id,
                    eventId: 'changed:' + id,
                    sourceId: raw.sourceId,
                    playerId: id,
                    songId: fixture.catalog.songs[0]!.id,
                    observedAt: raw.observedAt,
                    occurredAt: raw.observedAt,
                  },
                ],
              })
            : raw,
        );
      },
    },
  });
  await h.ready();
  await h.send('ACKNOWLEDGE_CONTINUE');
  const before = h.runtime.getSnapshot();
  changed = true;
  expect((await h.send('REFRESH_PROFILES')).ok).toBe(true);
  const after = h.runtime.getSnapshot();
  expect(after.selectionVersion).toBe(before.selectionVersion + 1);
  expect(after.playerProfiles[0]!.profileVersion).toBe(
    before.playerProfiles[0]!.profileVersion + 1,
  );
  expect(after.hostAcknowledgement).toBeNull();
});

it('projects the full matrix to candidates while preserving full evidence references', async () => {
  const h = harness();
  await h.ready();
  const before = h.runtime.getSnapshot(),
    candidateSongIds = before.candidateSongIds.slice(0, 3),
    availability = Object.fromEntries(
      candidateSongIds.map((id) => [id, { available: true }]),
    );
  expect(
    (
      await h.send('UPDATE_CATALOG', {
        catalog: before.catalog,
        candidateSongIds,
        availability,
      })
    ).ok,
  ).toBe(true);
  const after = h.runtime.getSnapshot();
  expect(after.matrix!.songIds).toEqual(candidateSongIds);
  expect(after.playerProfiles).toEqual(before.playerProfiles);
  expect(PartyStateSchema.safeParse(after).success).toBe(true);
  expect(after.currentPlaylist).toHaveLength(3);
});

it('empty candidates cannot be made startable by acknowledgement', async () => {
  const h = harness();
  await h.ready();
  const s = h.runtime.getSnapshot();
  expect(
    (
      await h.send('UPDATE_CATALOG', {
        catalog: s.catalog,
        candidateSongIds: [],
        availability: {},
      })
    ).ok,
  ).toBe(true);
  expect(await h.send('ACKNOWLEDGE_CONTINUE')).toMatchObject({
    ok: false,
    error: { code: 'INVALID_INPUT' },
  });
  expect(h.runtime.getSnapshot().fairnessAssessment?.validity).toBe(false);
});

it('replacements invalidate warnings without altering original selection steps', async () => {
  const h = harness({ mixed: true, count: 2 });
  await h.ready();
  await h.send('ACKNOWLEDGE_CONTINUE');
  const before = h.runtime.getSnapshot();
  expect(before.hostAcknowledgement).not.toBeNull();
  expect(
    (
      await h.send('REPLACE_SONG', {
        oldSongId: before.currentPlaylist[0],
        newSongId: before.candidateSongIds.find(
          (id) => !before.currentPlaylist.includes(id),
        ),
      })
    ).ok,
  ).toBe(true);
  const after = h.runtime.getSnapshot();
  expect(after.hostAcknowledgement).toBeNull();
  expect(after.selectionResult).toEqual(before.selectionResult);
});

it('preserves unsupported source count diagnostics at the import boundary', async () => {
  const fixture = harness().fixture;
  const h = harness({
    source: {
      sourceId: fixture.rawData[0]!.sourceId,
      getUserMusicData: (id) => {
        const raw = fixture.rawData.find((r) => r.userId === id)!;
        const value: RawUserMusicData = RawUserMusicDataSchema.parse({
          ...raw,
          evidence: [
            ...raw.evidence,
            {
              type: 'play_count',
              countKind: 'window',
              count: 5,
              periodStart: '2026-09-01T00:00:00.000Z',
              periodEnd: raw.observedAt,
              evidenceId: 'window:' + id,
              playerId: id,
              songId: fixture.catalog.songs[0]!.id,
              sourceId: raw.sourceId,
              observedAt: raw.observedAt,
            },
          ],
        });
        return Promise.resolve(value);
      },
    },
  });
  await h.ready();
  expect(h.runtime.getDiagnostics()).toHaveLength(7);
  expect(
    h.runtime
      .getDiagnostics()
      .every((d) => d.code === 'UNSUPPORTED_WINDOW_COUNT'),
  ).toBe(true);
});

it('a source with the wrong player identity cannot partially initialize', async () => {
  const fixture = harness().fixture;
  const h = harness({
    source: {
      sourceId: fixture.rawData[0]!.sourceId,
      getUserMusicData: () => Promise.resolve(fixture.rawData[0]!),
    },
  });
  expect(await h.send('INITIALIZE', {}, h.system)).toMatchObject({
    ok: false,
    error: { code: 'SOURCE_FAILED' },
  });
  expect(h.runtime.getSnapshot()).toMatchObject({
    selectionVersion: 0,
    playerProfiles: [],
    matrix: null,
  });
});
