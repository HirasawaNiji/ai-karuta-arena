import { expect, it } from 'vitest';
import {
  CatalogSchema,
  PlayerIdSchema,
  ManualPreferencesSchema,
  DUEL_PRESETS,
  DuelPresetIdSchema,
} from '@amp/core';
import { ManualPreferenceSource } from '@amp/adapters';
import { MANUAL_SCORING_CONFIG } from '@amp/music-profile';
import { createLobby } from '@amp/party-runtime';
import { catalogInput } from './fixtures/catalog.js';
const host = PlayerIdSchema.parse('host'),
  guest = PlayerIdSchema.parse('guest');
function fixture(verified = false) {
  const raw = catalogInput();
  const first = raw.songs[0]!;
  const catalog = CatalogSchema.parse({
    ...raw,
    players: [],
    songs: Array.from({ length: 40 }, (_, i) => ({
      ...first,
      id: 'song:' + i,
    })),
    audioAssets: [
      {
        ...raw.audioAssets[0],
        available: true,
        usage: {
          status: verified ? 'verified' : 'pending',
          source: 'test',
          ...(verified
            ? { reference: 'test-only', allowedUse: 'test-only' }
            : {}),
        },
      },
    ],
    recordings: Array.from({ length: 40 }, (_, i) => ({
      ...raw.recordings[0],
      songId: 'song:' + i,
      recordingId: 'recording:' + i,
    })),
    cards: Array.from({ length: 40 }, (_, i) => ({
      ...raw.cards[0],
      cardId: 'card:' + i,
    })),
    questions: Array.from({ length: 40 }, (_, i) => ({
      ...raw.questions[0],
      questionId: 'q:' + i,
      songId: 'song:' + i,
      recordingId: 'recording:' + i,
      answerCardId: 'card:' + i,
    })),
  });
  const source = new ManualPreferenceSource();
  let sequence = 0;
  const lobby = createLobby('ABCDEF', host, 'Host', {
    catalog,
    verifiedQuestionIds: verified
      ? catalog.questions.map((q) => q.questionId)
      : [],
    now: () => '2026-09-24T00:00:00Z',
    submitProfile: (id, input, c, at) =>
      source.submit(id, input, c, MANUAL_SCORING_CONFIG, at, 's:' + sequence++),
  });
  lobby.join(guest, 'Guest');
  return { lobby, catalog };
}
it('requires two independently ready online members and host-only assessment/config', () => {
  const { lobby } = fixture();
  expect(
    lobby
      .snapshot()
      .members.every((m) => !m.lobbyReady && m.matchReady === null),
  ).toBe(true);
  expect(() =>
    lobby.dispatch(guest, { type: 'preset', preset: 'standard' }),
  ).toThrow(/房主/);
  expect(() => lobby.dispatch(guest, { type: 'assess' })).toThrow(/房主/);
  expect(() => lobby.dispatch(host, { type: 'assess' })).toThrow(/准备/);
  lobby.dispatch(host, { type: 'ready', ready: true });
  lobby.dispatch(guest, { type: 'ready', ready: true });
  const state = lobby.dispatch(host, { type: 'assess' });
  expect(state.assessment?.actualCount).toBe(0);
  expect(state.canStart).toBe(false);
  expect(state.pendingCount).toBe(40);
});
it.each(['quick', 'standard'] as const)(
  'uses shared %s count in actual selection and excludes no extra songs',
  (preset) => {
    const { lobby } = fixture(true);
    lobby.dispatch(host, { type: 'preset', preset });
    lobby.dispatch(host, { type: 'ready', ready: true });
    lobby.dispatch(guest, { type: 'ready', ready: true });
    const state = lobby.dispatch(host, { type: 'assess' });
    expect(state.selectedSongIds).toHaveLength(
      DUEL_PRESETS[preset].minimumCandidates,
    );
    expect(state.assessment?.requestedCount).toBe(
      DUEL_PRESETS[preset].minimumCandidates,
    );
    expect(state.canStart).toBe(false);
  },
);
it('profile and member/rule/connection changes invalidate prepared state and old assessment', () => {
  const { lobby } = fixture(true);
  const ready = () => {
    lobby.dispatch(host, { type: 'ready', ready: true });
    lobby.dispatch(guest, { type: 'ready', ready: true });
    lobby.dispatch(host, { type: 'assess' });
  };
  const invalid = () => {
    expect(lobby.snapshot().assessment).toBeNull();
    expect(lobby.snapshot().members.every((m) => !m.lobbyReady)).toBe(true);
  };
  ready();
  lobby.dispatch(guest, {
    type: 'profile',
    preferences: ManualPreferencesSchema.parse({
      tagIds: ['genre:child'],
      reports: [{ songId: 'song:0', recognitionLevel: 'familiar' }],
    }),
  });
  invalid();
  expect(lobby.self(guest).estimates['song:0']?.familiarityScore).toBe(0.65);
  ready();
  lobby.setOnline(guest, false);
  invalid();
  lobby.setOnline(guest, true);
  invalid();
  ready();
  lobby.dispatch(host, { type: 'preset', preset: 'standard' });
  invalid();
  ready();
  lobby.join(PlayerIdSchema.parse('third'), 'Third');
  invalid();
  expect(() => lobby.dispatch(host, { type: 'assess' })).toThrow();
});
it('strictly rejects legacy/custom presets and forged identity fields', () => {
  expect(DuelPresetIdSchema.safeParse('25v25').success).toBe(false);
  const { lobby } = fixture();
  expect(() =>
    lobby.dispatch(
      guest,
      Object.assign(
        { type: 'ready' as const, ready: true },
        { playerId: host, role: 'host' },
      ),
    ),
  ).toThrow();
});

it('assigns a new version to repeated evaluations even without changed membership', () => {
  const { lobby } = fixture(true);
  lobby.dispatch(host, { type: 'ready', ready: true });
  lobby.dispatch(guest, { type: 'ready', ready: true });
  const first = lobby.dispatch(host, { type: 'assess' }).assessment!;
  const next = lobby.dispatch(host, { type: 'assess' }).assessment!;
  expect(next.selectionVersion).toBeGreaterThan(first.selectionVersion);
  expect(next.matrixVersion).not.toBe(first.matrixVersion);
});
