import { expect, it, vi } from 'vitest';
import {
  ActionIdSchema,
  PlayerIdSchema,
  DUEL_PRESETS,
  type DuelPreparationCommand,
  type DuelResult,
} from '@amp/core';
import { KarutaDuelFactory, ManualPreferenceSource } from '@amp/adapters';
import { MANUAL_SCORING_CONFIG } from '@amp/music-profile';
import { createDuelPreparation, createLobby } from '@amp/party-runtime';
import { createPracticeOpponent } from '@amp/server';
import { duelCatalog } from './fixtures/duel.js';

const host = PlayerIdSchema.parse('human'),
  botId = PlayerIdSchema.parse('practice:bot');
function fixture(preset: 'quick' | 'standard' = 'quick', random = () => 0) {
  let clock = Date.parse('2026-09-27T00:00:00Z'),
    sequence = 0;
  const nextId = () => 'id:' + ++sequence;
  const catalog = duelCatalog();
  const source = new ManualPreferenceSource();
  const lobby = createLobby('ABCDEF', host, 'Human', {
    catalog,
    verifiedQuestionIds: catalog.questions.map((q) => q.questionId),
    now: () => new Date(clock).toISOString(),
    submitProfile: (id, input, c, at) =>
      source.submit(id, input, c, MANUAL_SCORING_CONFIG, at, nextId()),
  });
  lobby.join(botId, '电脑陪练（规则）');
  lobby.dispatch(host, { type: 'preset', preset });
  const results: DuelResult[] = [];
  const duel = createDuelPreparation({
    context: lobby.preparationContext,
    factory: new KarutaDuelFactory(),
    now: () => clock,
    nextId,
    seed: () => 42,
    onChange: () => {},
    onCompleted: (result) => results.push(result),
  });
  const companion = createPracticeOpponent({
    playerId: botId,
    lobby,
    duel,
    now: () => clock,
    nextId,
    onChange: () => {},
    random,
  });
  const step = (ms = 200) => {
    clock += ms;
    duel.tick();
    companion.tick();
  };
  const command = (input: Record<string, unknown>) =>
    duel.dispatch(host, {
      actionId: ActionIdSchema.parse(nextId()),
      expectedVersion: duel.snapshot(host).version,
      ...input,
    } as DuelPreparationCommand);
  const action = (type: 'audio_started' | 'audio_failed') => {
    const game = duel.snapshot(host).game!;
    return duel.action(
      host,
      {
        type,
        actionId: ActionIdSchema.parse(nextId()),
        gameSessionId: game.gameSessionId,
        selectionVersion: game.selectionVersion,
        roundToken: game.round!.token,
      },
      0,
    );
  };
  function prepare() {
    step();
    lobby.dispatch(host, { type: 'ready', ready: true });
    command({ type: 'begin' });
    step();
    command({
      type: 'select',
      songIds: duel
        .snapshot(host)
        .ownPool.slice(0, DUEL_PRESETS[preset].selectPerPlayer),
    });
    step();
    command({
      type: 'ban',
      songIds: duel
        .snapshot(host)
        .banChoices.slice(0, DUEL_PRESETS[preset].banPerPlayer),
    });
    step();
    command({ type: 'acknowledge' });
    command({ type: 'match_ready', cardsLoaded: true, audioReady: true });
  }
  return { lobby, duel, companion, step, command, action, prepare, results };
}

it.each(['quick', 'standard'] as const)(
  'automates only the opponent side of %s preparation, with human start/audio gates',
  (preset) => {
    const f = fixture(preset);
    f.prepare();
    const view = f.duel.snapshot(host);
    expect(view.phase).toBe('confirming');
    expect(view.canStart).toBe(true);
    expect(view.game).toBeNull();
    expect(view.finalHands[botId]).toHaveLength(DUEL_PRESETS[preset].handSize);
    expect(view.readyPlayerIds).toContain(botId);
  },
);

it('waits for playback and at least four seconds before reading only the current answer', () => {
  const f = fixture();
  f.prepare();
  f.command({ type: 'start' });
  const answers = vi.spyOn(f.duel, 'currentQuestion');
  f.step(2000);
  expect(answers).not.toHaveBeenCalled();
  f.action('audio_started');
  f.step();
  f.step(3800);
  expect(answers).not.toHaveBeenCalled();
  f.step(200);
  expect(answers).toHaveBeenCalledTimes(1);
  expect(answers).toHaveBeenCalledWith(
    f.duel.snapshot(host).game!.round!.token,
  );
  f.step(50);
  expect(answers).toHaveBeenCalledTimes(1);
});

it('can skip a question instead of answering perfectly', () => {
  const f = fixture('quick', () => 0.99);
  f.prepare();
  f.command({ type: 'start' });
  const answers = vi.spyOn(f.duel, 'currentQuestion');
  f.action('audio_started');
  f.step();
  f.step(9000);
  expect(answers).not.toHaveBeenCalled();
  expect(f.duel.snapshot(host).game!.scores[botId]).toBe(0);
});

it.each(['quick', 'standard'] as const)(
  'finishes a real %s engine match including automatic transfers',
  (preset) => {
    const f = fixture(preset);
    f.prepare();
    f.command({ type: 'start' });
    let transfers = 0;
    for (
      let i = 0;
      i < 300 && f.duel.snapshot(host).game!.phase !== 'completed';
      i++
    ) {
      const game = f.duel.snapshot(host).game!;
      if (game.phase === 'loading') f.action('audio_started');
      if (game.phase === 'transfer') transfers++;
      f.step(
        game.phase === 'playing'
          ? 4200
          : game.phase === 'transfer'
            ? 1000
            : game.phase === 'rest'
              ? 2200
              : 200,
      );
    }
    expect(f.duel.snapshot(host).game!.phase).toBe('completed');
    expect(f.results).toHaveLength(1);
    expect(transfers).toBeGreaterThan(0);
    const end = f.duel.snapshot(host).game;
    f.step(20000);
    expect(f.duel.snapshot(host).game).toEqual(end);
  },
  15000,
);

it('discards an old reaction after interruption/reset and still prepares another match', () => {
  const f = fixture();
  f.prepare();
  f.command({ type: 'start' });
  f.action('audio_started');
  f.step();
  const oldSession = f.duel.snapshot(host).game!.gameSessionId;
  const answers = vi.spyOn(f.duel, 'currentQuestion');
  f.command({ type: 'interrupt' });
  f.step(6000);
  expect(answers).not.toHaveBeenCalled();
  expect(f.results).toHaveLength(0);
  f.command({ type: 'reset' });
  f.prepare();
  f.command({ type: 'start' });
  expect(f.duel.snapshot(host).game!.gameSessionId).not.toBe(oldSession);
  f.step(4000);
  expect(answers).not.toHaveBeenCalled();
});

it('does not answer when the host goes offline or playback fails', () => {
  for (const failure of ['offline', 'audio'] as const) {
    const f = fixture();
    f.prepare();
    f.command({ type: 'start' });
    f.action('audio_started');
    f.step();
    const answers = vi.spyOn(f.duel, 'currentQuestion');
    if (failure === 'offline') f.lobby.setOnline(host, false);
    else f.action('audio_failed');
    f.step(6000);
    expect(answers).not.toHaveBeenCalled();
    expect(f.duel.snapshot(host).game!.phase).toBe('aborted');
    expect(f.results).toHaveLength(0);
  }
});

it('stop cancels pending actions permanently', () => {
  const f = fixture();
  f.prepare();
  f.command({ type: 'start' });
  f.action('audio_started');
  f.step();
  const answers = vi.spyOn(f.duel, 'currentQuestion');
  f.companion.stop();
  f.step(6000);
  expect(answers).not.toHaveBeenCalled();
});
