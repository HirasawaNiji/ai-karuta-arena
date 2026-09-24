import { expect, it } from 'vitest';
import {
  CatalogSchema,
  ActionIdSchema,
  DuelActionSchema,
  PlayerIdSchema,
  DUEL_PRESETS,
} from '@amp/core';
import { KarutaDuelFactory, ManualPreferenceSource } from '@amp/adapters';
import { MANUAL_SCORING_CONFIG } from '@amp/music-profile';
import { createDuelPreparation, createLobby } from '@amp/party-runtime';
import { catalogInput } from './fixtures/catalog.js';
const host = PlayerIdSchema.parse('host'),
  guest = PlayerIdSchema.parse('guest');
function fixture(verified = false, now = () => '2026-09-24T00:00:00Z') {
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
    now,
    submitProfile: (id, input, c, at) =>
      source.submit(id, input, c, MANUAL_SCORING_CONFIG, at, 's:' + sequence++),
  });
  lobby.join(guest, 'Guest');
  return { lobby, catalog };
}

function prepared(
  preset: 'quick' | 'standard' = 'quick',
  factory = new KarutaDuelFactory(),
) {
  let clock = Date.parse('2026-09-24T00:00:01Z');
  const { lobby, catalog } = fixture(true, () => new Date(clock).toISOString());
  lobby.dispatch(host, { type: 'preset', preset });
  lobby.dispatch(host, { type: 'ready', ready: true });
  lobby.dispatch(guest, { type: 'ready', ready: true });
  let counter = 0;
  const completed: unknown[] = [];
  const duel = createDuelPreparation({
    context: lobby.preparationContext,
    factory,
    now: () => clock,
    nextId: () => 'id:' + ++counter,
    seed: () => 42,
    onChange: () => {},
    onCompleted: (r, events) => {
      lobby.settleDuel(r, events);
      completed.push(r);
    },
  });
  const cmd = (id: typeof host, value: Record<string, unknown>) =>
    duel.dispatch(id, {
      actionId: 'a:' + ++counter,
      expectedVersion: duel.snapshot(id).version,
      ...value,
    } as Parameters<typeof duel.dispatch>[1]);
  const draft = () => {
    cmd(host, { type: 'begin' });
    for (const id of [host, guest])
      cmd(id, {
        type: 'select',
        songIds: duel
          .snapshot(id)
          .ownPool.slice(0, DUEL_PRESETS[preset].selectPerPlayer),
      });
    for (const id of [host, guest])
      cmd(id, {
        type: 'ban',
        songIds: duel
          .snapshot(id)
          .banChoices.slice(0, DUEL_PRESETS[preset].banPerPlayer),
      });
  };
  return {
    lobby,
    catalog,
    duel,
    cmd,
    draft,
    completed,
    advance: (ms: number) => {
      clock += ms;
      duel.tick();
    },
  };
}
it.each(['quick', 'standard'] as const)(
  'freezes %s final cards after BAN and invokes fairness/ready gates',
  (preset) => {
    const { duel, cmd, draft } = prepared(preset);
    draft();
    let view = duel.snapshot(host);
    expect(view.phase).toBe('confirming');
    expect(view.cards).toHaveLength(DUEL_PRESETS[preset].handSize * 2);
    expect(view.assessment?.actualCount).toBe(
      DUEL_PRESETS[preset].handSize * 2,
    );
    expect(view.blockers).not.toContain('INVALID_INPUT');
    expect(view.blockers).toContain('ACK_REQUIRED');
    expect(() => cmd(host, { type: 'start' })).toThrow(/开局/);
    cmd(host, { type: 'acknowledge' });
    expect(() =>
      cmd(guest, { type: 'match_ready', cardsLoaded: true, audioReady: true }),
    ).toThrow(/房主/);
    cmd(guest, { type: 'match_ready', cardsLoaded: true, audioReady: false });
    cmd(host, { type: 'match_ready', cardsLoaded: true, audioReady: false });
    expect(duel.snapshot(host).canStart).toBe(false);
    cmd(host, { type: 'match_ready', cardsLoaded: true, audioReady: true });
    expect(duel.snapshot(host).canStart).toBe(true);
    view = cmd(host, { type: 'start' });
    expect(view.game?.phase).toBe('loading');
    expect(
      Object.values(view.game!.hands).every(
        (h) => h.length === DUEL_PRESETS[preset].handSize,
      ),
    ).toBe(true);
    expect(JSON.stringify(view)).not.toMatch(
      /questionId|recordingId|seed|profiles|questionBySongId/,
    );
  },
);
it.each(['profile', 'preset', 'disconnect', 'join'] as const)(
  '%s invalidates frozen readiness and host acknowledgement',
  (kind) => {
    const { duel, cmd, draft, lobby } = prepared();
    draft();
    cmd(host, { type: 'acknowledge' });
    cmd(host, { type: 'match_ready', cardsLoaded: true, audioReady: true });
    const version = duel.snapshot(host).version;
    if (kind === 'profile')
      lobby.dispatch(guest, {
        type: 'profile',
        preferences: { tagIds: [], reports: [] },
      });
    if (kind === 'preset')
      lobby.dispatch(host, { type: 'preset', preset: 'standard' });
    if (kind === 'disconnect') lobby.setOnline(guest, false);
    if (kind === 'join') lobby.join(PlayerIdSchema.parse('third'), 'Third');
    const v = duel.snapshot(host);
    expect(v.phase).toBe('idle');
    expect(v.assessment).toBeNull();
    expect(v.acknowledged).toBe(false);
    expect(v.readyPlayerIds).toEqual([]);
    expect(() =>
      duel.dispatch(host, {
        type: 'start',
        actionId: ActionIdSchema.parse('stale'),
        expectedVersion: version,
      }),
    ).toThrow(/版本/);
  },
);
it('disjoint candidates, exact quotas, authorized bans and duplicate intent', () => {
  const { duel, cmd } = prepared();
  expect(() => cmd(guest, { type: 'begin' })).toThrow(/房主/);
  cmd(host, { type: 'begin' });
  const pool = duel.snapshot(host).ownPool;
  expect(pool.some((s) => duel.snapshot(guest).ownPool.includes(s))).toBe(
    false,
  );
  expect(() =>
    cmd(host, { type: 'select', songIds: pool.slice(0, 11) }),
  ).toThrow(/数量/);
  expect(() =>
    cmd(host, {
      type: 'select',
      songIds: duel.snapshot(guest).ownPool.slice(0, 12),
    }),
  ).toThrow(/范围/);
  const action = {
    type: 'select' as const,
    actionId: ActionIdSchema.parse('dedup'),
    expectedVersion: duel.snapshot(host).version,
    songIds: pool.slice(0, 12),
  };
  duel.dispatch(host, action);
  duel.dispatch(host, action);
  expect(() => duel.dispatch(guest, action)).toThrow(/冲突/);
  cmd(guest, {
    type: 'select',
    songIds: duel.snapshot(guest).ownPool.slice(0, 12),
  });
  expect(() => cmd(host, { type: 'ban', songIds: pool.slice(0, 2) })).toThrow(
    /对方/,
  );
});
it('pending materials cannot start a draft and lobby preassessment never starts a match', () => {
  const { lobby } = fixture();
  lobby.dispatch(host, { type: 'ready', ready: true });
  lobby.dispatch(guest, { type: 'ready', ready: true });
  lobby.dispatch(host, { type: 'assess' });
  const duel = createDuelPreparation({
    context: lobby.preparationContext,
    factory: new KarutaDuelFactory(),
    now: () => Date.now(),
    nextId: () => 'id',
    seed: () => 1,
    onChange: () => {},
    onCompleted: () => {},
  });
  expect(() =>
    duel.dispatch(host, {
      type: 'begin',
      actionId: ActionIdSchema.parse('a'),
      expectedVersion: 0,
    }),
  ).toThrow(/素材不足/);
  expect(duel.snapshot(host).canStart).toBe(false);
});
it('disconnect during a match aborts without formal result delivery', () => {
  const { duel, cmd, draft, lobby, completed } = prepared();
  draft();
  cmd(host, { type: 'acknowledge' });
  cmd(host, { type: 'match_ready', cardsLoaded: true, audioReady: true });
  cmd(guest, { type: 'match_ready', cardsLoaded: true, audioReady: false });
  cmd(host, { type: 'start' });
  lobby.setOnline(guest, false);
  duel.tick();
  expect(duel.snapshot(host).game?.phase).toBe('aborted');
  expect(completed).toEqual([]);
});

it('settles scoped recognition once after a real empty-hand finish, preserving it through profile edits', () => {
  const { duel, cmd, draft, lobby, completed, advance } = prepared();
  draft();
  cmd(host, { type: 'acknowledge' });
  cmd(host, { type: 'match_ready', cardsLoaded: true, audioReady: true });
  cmd(guest, { type: 'match_ready', cardsLoaded: true, audioReady: false });
  cmd(host, { type: 'start' });
  let n = 0;
  const act = (
    id: typeof host,
    type: string,
    extra: Record<string, unknown> = {},
  ) => {
    const g = duel.snapshot(host).game!;
    return duel.action(
      id,
      DuelActionSchema.parse({
        type,
        actionId: 'game-action:' + ++n,
        gameSessionId: g.gameSessionId,
        selectionVersion: g.selectionVersion,
        roundToken: g.round!.token,
        ...extra,
      }),
      0,
    );
  };
  while (duel.snapshot(host).game?.phase !== 'completed' && n < 150) {
    const g = duel.snapshot(host).game!;
    if (g.phase === 'loading') {
      act(host, 'audio_started');
      const q = duel.currentQuestion(g.round!.token)!;
      const owner = [host, guest].find((p) =>
        g.hands[p]!.includes(q.answerCardId),
      )!;
      advance(100);
      act(owner, 'claim', { cardId: q.answerCardId });
      advance(126);
    } else if (g.phase === 'rest') advance(2001);
    else throw new Error('Unexpected phase ' + g.phase);
  }
  expect(duel.snapshot(host).game?.phase).toBe('completed');
  expect(completed).toHaveLength(1);
  duel.tick();
  expect(completed).toHaveLength(1);
  const before = Object.values(lobby.self(host).profile.songEvidence)
    .flat()
    .filter((e) => e.type === 'game_correct');
  expect(before.length).toBeGreaterThan(0);
  expect(
    before.every(
      (e) => 'recognitionScope' in e && e.recognitionScope?.questionId,
    ),
  ).toBe(true);
  lobby.dispatch(host, {
    type: 'profile',
    preferences: { tagIds: [], reports: [] },
  });
  expect(
    Object.values(lobby.self(host).profile.songEvidence)
      .flat()
      .filter((e) => e.type === 'game_correct'),
  ).toEqual(before);
});

it('isolates an internal scheduler failure and allows a new preparation without publishing a winner', () => {
  const factory = new KarutaDuelFactory();
  const f = prepared('quick', {
    create: (input, deps) => ({
      ...factory.create(input, deps),
      tick: () => {
        throw new Error('injected internal failure');
      },
    }),
  });
  f.draft();
  f.cmd(host, { type: 'acknowledge' });
  f.cmd(host, { type: 'match_ready', cardsLoaded: true, audioReady: true });
  f.cmd(guest, { type: 'match_ready', cardsLoaded: true, audioReady: false });
  f.cmd(host, { type: 'start' });
  expect(() => f.duel.tick()).not.toThrow();
  expect(f.duel.snapshot(host).game).toMatchObject({
    phase: 'aborted',
    winnerId: null,
    outcome: 'aborted',
  });
  expect(f.completed).toEqual([]);
  expect(f.cmd(host, { type: 'reset' }).phase).toBe('idle');
});
