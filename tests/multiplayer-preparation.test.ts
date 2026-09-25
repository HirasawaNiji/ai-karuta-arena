import { it, expect } from 'vitest';
import {
  PlayerIdSchema,
  SongIdSchema,
  ActionIdSchema,
  MultiplayerPreparationCommandSchema,
  MultiplayerActionSchema,
  MULTIPLAYER_RULES,
} from '@amp/core';
import { MultiplayerFactory, ManualPreferenceSource } from '@amp/adapters';
import { createLobby, createMultiplayerPreparation } from '@amp/party-runtime';
import { MANUAL_SCORING_CONFIG } from '@amp/music-profile';
import { duelCatalog } from './fixtures/duel.js';
const ids = ['host', 'guest', 'third'].map((p) => PlayerIdSchema.parse(p));
const host = ids[0]!;
function fixture(count = 40) {
  let now = Date.parse('2026-09-25T00:00:00Z'),
    nonce = 0;
  const catalog = duelCatalog(),
    source = new ManualPreferenceSource();
  const lobby = createLobby('ABCDEF', host, 'Host', {
    catalog,
    verifiedQuestionIds: catalog.questions
      .slice(0, count)
      .map((q) => q.questionId),
    now: () => new Date(now).toISOString(),
    submitProfile: (id, input, c, at) =>
      source.submit(id, input, c, MANUAL_SCORING_CONFIG, at, 'raw:' + ++nonce),
  });
  ids.slice(1).forEach((id) => lobby.join(id, id));
  lobby.dispatch(host, { type: 'mode', mode: 'multiplayer' });
  ids.forEach((id) => lobby.dispatch(id, { type: 'ready', ready: true }));
  let completions = 0;
  let failContext = false;
  const multi = createMultiplayerPreparation({
    context: () => {
      if (failContext) {
        failContext = false;
        throw new Error('Test context failure');
      }
      return lobby.preparationContext();
    },
    factory: new MultiplayerFactory(),
    now: () => now,
    nextId: () => 'id:' + ++nonce,
    seed: () => 45,
    onChange: () => {},
    onCompleted: (r, e) => {
      lobby.settleGame(r, e);
      completions++;
    },
  });
  const cmd = (id: typeof host, body: Record<string, unknown>) =>
    multi.dispatch(
      id,
      MultiplayerPreparationCommandSchema.parse({
        actionId: 'a:' + ++nonce,
        expectedVersion: multi.snapshot(id).version,
        ...body,
      }),
    );
  const prepare = () => {
    cmd(host, { type: 'begin' });
    ids.forEach((id, i) =>
      cmd(id, {
        type: 'ban',
        songIds: multi.snapshot(id).proposedSongIds.slice(i, i + 1),
      }),
    );
  };
  const ready = () => {
    cmd(host, { type: 'acknowledge' });
    ids.forEach((id) =>
      cmd(id, {
        type: 'match_ready',
        cardsLoaded: true,
        audioReady: id === host,
      }),
    );
    cmd(host, { type: 'start' });
  };
  const action = (
    id: typeof host,
    type: 'audio_started' | 'claim',
    cardId?: string,
  ) => {
    const v = multi.snapshot(id).game!;
    return multi.action(
      id,
      MultiplayerActionSchema.parse({
        type,
        actionId: 'game:' + ++nonce,
        gameSessionId: v.gameSessionId,
        selectionVersion: v.selectionVersion,
        roundToken: v.round!.token,
        ...(cardId ? { cardId } : {}),
      }),
    );
  };
  return {
    multi,
    lobby,
    cmd,
    prepare,
    ready,
    action,
    failNextContext() {
      failContext = true;
    },
    advance(ms: number) {
      now += ms;
      multi.tick();
    },
    completions: () => completions,
  };
}
it('projects hand-checkable selection gains without exposing player evidence or playback order', () => {
  const f = fixture();
  expect(f.multi.snapshot(host).selectionExplanation).toBeNull();
  for (const id of ids)
    f.lobby.dispatch(id, {
      type: 'profile',
      preferences: {
        tagIds: [],
        reports: [
          {
            songId: SongIdSchema.parse('song:7'),
            recognitionLevel: 'familiar',
          },
        ],
      },
    });
  ids.forEach((id) => f.lobby.dispatch(id, { type: 'ready', ready: true }));
  f.cmd(host, { type: 'begin' });
  const view = f.multi.snapshot(host);
  const explanation = view.selectionExplanation!;
  expect(explanation.stage).toBe('proposal');
  expect(explanation.selectionVersion).toBe(view.version);
  expect(explanation.selectionConfigVersion).toBe('selection-v1');
  expect(explanation.scoringConfigVersion).toBe(MANUAL_SCORING_CONFIG.version);
  expect(explanation.fairnessConfigVersion).toBe('fairness-v1');
  expect(explanation.requestedCount).toBe(12);
  expect(explanation.actualCount).toBe(12);
  expect(explanation.steps.map((s) => s.songId)).toEqual(view.proposedSongIds);
  const first = explanation.steps[0]!;
  // Three players each move from a deficit of 3 to 2: 3 * (3² - 2²) = 15.
  // One familiar song scores .65 for every pair; competition is normalized by 12.
  expect(first.songId).toBe('song:7');
  expect(first.deficitGain).toBe(15);
  expect(first.tieBreakRule).toBe('deficit');
  expect(first.objectiveGains.fairness).toBe(1);
  expect(first.objectiveGains.diversity).toBe(1);
  expect(first.objectiveGains.competition).toBeCloseTo(0.65 / 12);
  expect(first.objectiveGains.exploration).toBe(0);
  expect(first.softRatioContribution).toBeCloseTo(0.01);
  expect(first.totalGain).toBeCloseTo(0.4 + 0.2 + (0.3 * 0.65) / 12 + 0.01);
  expect(Object.keys(explanation).sort()).toEqual([
    'actualCount',
    'fairnessConfigVersion',
    'requestedCount',
    'scoringConfigVersion',
    'selectionConfigVersion',
    'selectionVersion',
    'stage',
    'steps',
  ]);
  expect(Object.keys(first).sort()).toEqual([
    'deficitGain',
    'objectiveGains',
    'softRatioContribution',
    'songId',
    'tieBreakRule',
    'totalGain',
  ]);
  const mutable = first as {
    deficitGain: number;
    objectiveGains: { fairness: number };
  };
  mutable.deficitGain = -123;
  mutable.objectiveGains.fairness = -123;
  const fresh = f.multi.snapshot(host).selectionExplanation!.steps[0]!;
  expect(fresh.deficitGain).toBe(15);
  expect(fresh.objectiveGains.fairness).toBe(1);
  expect(f.multi.snapshot(ids[1]!).selectionExplanation).toEqual(
    f.multi.snapshot(host).selectionExplanation,
  );
  f.cmd(host, { type: 'reset' });
  expect(f.multi.snapshot(host).selectionExplanation).toBeNull();
});
it('reselects after all bans and binds final assessment, readiness and host warning to one version', () => {
  const f = fixture();
  f.cmd(host, { type: 'begin' });
  const old = f.multi.snapshot(host),
    banned = old.proposedSongIds.slice(0, 3);
  ids.forEach((id, i) => f.cmd(id, { type: 'ban', songIds: [banned[i]] }));
  const v = f.multi.snapshot(host);
  const explanation = v.selectionExplanation!;
  expect(explanation.stage).toBe('final');
  expect(explanation.selectionVersion).toBe(v.version);
  expect(explanation.selectionVersion).toBe(v.assessment?.selectionVersion);
  expect(explanation.selectionVersion).toBeGreaterThan(
    old.selectionExplanation!.selectionVersion,
  );
  expect(explanation.steps.map((s) => s.songId)).toEqual(
    v.assessment?.selectedSongIds,
  );
  expect(explanation.steps.every((s) => !banned.includes(s.songId))).toBe(true);
  expect(v.cards).toHaveLength(12);
  expect(v.assessment?.actualCount).toBe(12);
  expect(v.blockers).not.toContain('INVALID_INPUT');
  expect(
    v.cards.some((c) =>
      banned.map((s) => 'card:' + s.split(':')[1]).includes(c.cardId),
    ),
  ).toBe(false);
  expect(() => f.cmd(host, { type: 'start' })).toThrow();
  expect(() =>
    f.multi.dispatch(host, {
      type: 'acknowledge',
      actionId: ActionIdSchema.parse('stale'),
      expectedVersion: old.version,
    }),
  ).toThrow();
  expect(() =>
    f.cmd(ids[1]!, {
      type: 'match_ready',
      cardsLoaded: true,
      audioReady: true,
    }),
  ).toThrow();
  f.ready();
  expect(f.multi.snapshot(host).game?.phase).toBe('loading');
});
it('does not allow short post-ban material sets to bypass canStart', () => {
  const f = fixture(12);
  f.prepare();
  const explanation = f.multi.snapshot(host).selectionExplanation!;
  expect(explanation.stage).toBe('final');
  expect(explanation.requestedCount).toBe(12);
  expect(explanation.actualCount).toBe(9);
  expect(explanation.steps).toHaveLength(9);
  expect(f.multi.snapshot(host).canStart).toBe(false);
  expect(() => f.cmd(host, { type: 'acknowledge' })).toThrow();
  expect(() => f.cmd(host, { type: 'start' })).toThrow();
});
it('clears final confirmation on profile changes and aborts participant disconnection without feedback', () => {
  const f = fixture();
  f.prepare();
  f.lobby.dispatch(ids[1]!, {
    type: 'profile',
    preferences: { tagIds: [], reports: [] },
  });
  expect(f.multi.snapshot(host).phase).toBe('idle');
  expect(f.multi.snapshot(host).selectionExplanation).toBeNull();
  const g = fixture();
  g.prepare();
  g.ready();
  g.lobby.setOnline(ids[1]!, false);
  g.multi.tick();
  expect(g.multi.snapshot(host).game?.phase).toBe('aborted');
  expect(g.multi.snapshot(host).selectionExplanation).toBeNull();
  expect(g.completions()).toBe(0);
});
it('clears selection explanation when the runtime contains a preparation fault', () => {
  const f = fixture();
  f.prepare();
  f.ready();
  expect(f.multi.snapshot(host).selectionExplanation).not.toBeNull();
  f.failNextContext();
  f.multi.tick();
  expect(f.multi.snapshot(host).game?.phase).toBe('aborted');
  expect(f.multi.snapshot(host).selectionExplanation).toBeNull();
  expect(f.completions()).toBe(0);
});
it('late join waits without invalidating the match, and cannot act as a participant', () => {
  const f = fixture();
  f.prepare();
  f.ready();
  const late = PlayerIdSchema.parse('late'),
    revision = f.lobby.snapshot().revision;
  f.lobby.join(late, 'Late', true);
  expect(f.lobby.snapshot().revision).toBe(revision);
  expect(f.multi.snapshot(host).game?.phase).toBe('loading');
  expect(() => f.cmd(late, { type: 'interrupt' })).toThrow(/下一局/);
  expect(() =>
    f.lobby.dispatch(late, { type: 'ready', ready: true }),
  ).toThrow();
  f.cmd(host, { type: 'interrupt' });
  f.cmd(host, { type: 'reset' });
  f.lobby.releaseWaiting();
  expect(
    f.lobby.snapshot().members.find((m) => m.id === late)?.waitingForNextMatch,
  ).toBe(false);
});
it('commits scoped completed feedback once, leaving non-answering players without wrong evidence', () => {
  const f = fixture();
  f.prepare();
  f.ready();
  let first = true;
  while (f.multi.snapshot(host).game?.phase !== 'completed') {
    f.action(host, 'audio_started');
    const game = f.multi.snapshot(host).game!;
    if (first) {
      const q = f.multi.currentQuestion(game.round!.token)!;
      f.action(host, 'claim', q.answerCardId);
      first = false;
    } else f.advance(MULTIPLAYER_RULES.roundMs);
    f.advance(MULTIPLAYER_RULES.restMs);
  }
  f.multi.tick();
  expect(f.completions()).toBe(1);
  expect(Object.keys(f.lobby.self(host).profile.songEvidence)).toHaveLength(1);
  expect(f.lobby.self(ids[1]!).profile.songEvidence).toEqual({});
});
