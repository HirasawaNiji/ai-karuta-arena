import { ActionIdSchema, DUEL_PRESETS, type PlayerId } from '@amp/core';
import {
  type DuelPreparationController,
  type LobbyController,
} from '@amp/party-runtime';

/** Local scripted practice only. Never claims to recognize audio or learns a profile. */
export function createPracticeOpponent(deps: {
  playerId: PlayerId;
  lobby: LobbyController;
  duel: DuelPreparationController;
  now: () => number;
  nextId: () => string;
  onChange: () => void;
  random?: () => number;
}) {
  const { playerId, lobby, duel, now, nextId } = deps;
  const random = deps.random ?? Math.random;
  let nextTick = 0;
  let stopped = false;
  let plan: { key: string; due: number; attempted: boolean } | null = null;
  const choose = <T>(values: readonly T[], count: number): T[] => {
    const shuffled = [...values];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }
    return shuffled.slice(0, count);
  };
  function tick() {
    if (stopped || now() < nextTick) return;
    nextTick = now() + 200;
    const room = lobby.snapshot();
    const member = room.members.find((m) => m.id === playerId);
    if (
      room.mode !== 'duel' ||
      !member?.online ||
      !room.members.find((m) => m.id === room.hostId)?.online
    ) {
      plan = null;
      return;
    }
    const view = duel.snapshot(playerId);
    const envelope = {
      actionId: ActionIdSchema.parse(nextId()),
      expectedVersion: view.version,
    };
    if (view.phase === 'idle' && !member.lobbyReady) {
      lobby.dispatch(playerId, { type: 'ready', ready: true });
      deps.onChange();
    } else if (view.phase === 'selecting' && !view.ownSelection) {
      duel.dispatch(playerId, {
        ...envelope,
        type: 'select',
        songIds: choose(
          view.ownPool,
          DUEL_PRESETS[view.preset].selectPerPlayer,
        ),
      });
    } else if (view.phase === 'banning' && !view.ownBans) {
      duel.dispatch(playerId, {
        ...envelope,
        type: 'ban',
        songIds: choose(
          view.banChoices,
          DUEL_PRESETS[view.preset].banPerPlayer,
        ),
      });
    } else if (
      view.phase === 'confirming' &&
      !view.readyPlayerIds.includes(playerId)
    ) {
      duel.dispatch(playerId, {
        ...envelope,
        type: 'match_ready',
        cardsLoaded: true,
        audioReady: false,
      });
    }
    const game = view.game;
    const transfer =
      game?.phase === 'transfer' && game.transfer?.giverId === playerId;
    if (!game?.round || (game.phase !== 'playing' && !transfer)) {
      plan = null;
      return;
    }
    const key = [
      game.gameSessionId,
      game.selectionVersion,
      game.round.token,
      game.phase,
    ].join(':');
    if (plan?.key !== key) {
      plan = {
        key,
        due: now() + (transfer ? 800 : 4000 + random() * 2000),
        attempted: !transfer && random() >= 0.75,
      };
    }
    if (plan.attempted || now() < plan.due || now() >= game.round.deadline)
      return;
    plan.attempted = true;
    // Only inspect the CURRENT question after the host has acknowledged playback
    // and the reaction delay elapsed. No future order or answer reaches the UI.
    const cardId = transfer
      ? game.hands[playerId]?.[0]
      : duel.currentQuestion(game.round.token)?.answerCardId;
    if (
      !cardId ||
      !Object.values(game.hands).some((hand) => hand.includes(cardId))
    )
      return;
    duel.action(
      playerId,
      {
        type: transfer ? 'transfer' : 'claim',
        actionId: ActionIdSchema.parse(nextId()),
        gameSessionId: game.gameSessionId,
        selectionVersion: game.selectionVersion,
        roundToken: game.round.token,
        cardId,
      },
      0,
    );
  }
  return {
    tick,
    stop: () => {
      stopped = true;
      plan = null;
    },
  };
}
