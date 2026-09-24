import {
  JudgementSchema,
  DuelInputSchema,
  DuelActionSchema,
  DUEL_RULES,
  GameEventSchema,
  GameResultSchema,
  type DuelInput,
  type DuelAction,
  type DuelView,
  type DuelResult,
  type DuelEngine,
  type DuelEngineDependencies,
  type DuelEngineFactory,
  type PlayerId,
  type CardId,
  type GameResult,
  type Question,
  StableIdSchema,
} from '@amp/core';

/** Extracted/typed rule semantics from HITsz-JLA/karuta-web onlineRooms.mjs,
 * commit 780c1c0230589caf43c4835dc046ad7555c85f0a. Reuse authorized by its administrator.
 * See docs/karuta-engine-audit.md; no new open-source license is asserted.
 */
export function shuffledQuestions<T>(input: readonly T[], seed: number): T[] {
  let state = seed >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const result = [...input];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}
export class KarutaDuelFactory implements DuelEngineFactory {
  create(input: DuelInput, deps: DuelEngineDependencies): DuelEngine {
    return createKarutaDuel(input, deps);
  }
}
export function createKarutaDuel(
  raw: DuelInput,
  deps: DuelEngineDependencies,
): DuelEngine {
  const input = DuelInputSchema.parse(raw);
  if (!input.session.playerIds.includes(deps.audioPlayerId))
    throw new Error('Audio player must be a frozen participant');
  const players = input.session.playerIds;
  const hands: Record<string, CardId[]> = Object.fromEntries(
    players.map((id) => [id, [...input.hands[id]!]]),
  );
  const scores: Record<string, number> = Object.fromEntries(
    players.map((id) => [id, 0]),
  );
  const plan = shuffledQuestions(input.questions, input.seed);
  let phase: DuelView['phase'] = 'created',
    sequence = 0,
    index = -1,
    startedAt = 0;
  let current: {
    question: Question;
    token: string;
    deadline: number;
    startAt: number | null;
    revealed: boolean;
  } | null = null;
  let transfer: DuelView['transfer'] = null,
    outcome: DuelResult | null = null,
    message = '等待开局';
  let settlementAt: number | null = null;
  const claims = new Map<
    PlayerId,
    { receivedAt: number; adjustedAt: number }
  >();
  const actions = new Map<string, string>();
  const played: Question[] = [];
  const judgements: GameResult['judgements'][number][] = [];
  const tokens = new Set<string>();
  function emit(event: Record<string, unknown>, at = deps.now()) {
    sequence++;
    const normalized = GameEventSchema.parse({
      ...event,
      eventId: input.session.gameSessionId + ':event:' + sequence,
      partyId: input.session.partyId,
      gameSessionId: input.session.gameSessionId,
      selectionVersion: input.session.selectionVersion,
      sequence,
      occurredAt: new Date(at).toISOString(),
    });
    deps.onEvent(normalized);
    return normalized;
  }
  function changed() {
    deps.onChange();
  }
  function snapshot(): DuelView {
    return structuredClone({
      gameSessionId: input.session.gameSessionId,
      selectionVersion: input.session.selectionVersion,
      rulesVersion: DUEL_RULES.version,
      phase,
      round: current
        ? {
            number: index + 1,
            token: current.token,
            deadline: current.deadline,
            revealedCardId: current.revealed
              ? current.question.answerCardId
              : null,
          }
        : null,
      hands,
      scores,
      transfer,
      sequence,
      winnerId: outcome?.winnerId ?? null,
      outcome: outcome?.reason ?? null,
      message,
    });
  }
  const opponent = (id: PlayerId) => players.find((p) => p !== id)!;
  const emptyWinner = () => {
    const empty = players.filter((p) => hands[p]!.length === 0);
    return empty.length === 1 ? empty[0]! : null;
  };
  function finish(winnerId: PlayerId | null, reason: DuelResult['reason']) {
    if (outcome) return;
    transfer = null;
    settlementAt = null;
    phase = reason === 'aborted' ? 'aborted' : 'completed';
    const endedAt = deps.now();
    const game = GameResultSchema.parse({
      session: input.session,
      status: reason === 'aborted' ? 'aborted' : 'completed',
      startedAt: new Date(startedAt).toISOString(),
      endedAt: new Date(endedAt).toISOString(),
      playedSongIds: played.map((q) => q.songId),
      judgements,
      scores,
    });
    outcome = {
      game,
      winnerId,
      reason,
      rulesVersion: DUEL_RULES.version,
      resultVersion: 1,
    };
    if (reason !== 'aborted') {
      message = winnerId ? '手牌已清空，本局结束' : '题组已播完，本局平局';
      emit({ type: 'GAME_FINISHED', result: game }, endedAt);
    }
    changed();
  }
  function nextRound() {
    if (outcome) return;
    index++;
    const question = plan[index];
    if (!question) {
      finish(null, 'exhausted');
      return;
    }
    const token = StableIdSchema.parse(deps.nextToken());
    if (tokens.has(token)) throw new Error('Round tokens must be unique');
    tokens.add(token);
    current = {
      question,
      token,
      deadline: deps.now() + DUEL_RULES.loadingMs,
      startAt: null,
      revealed: false,
    };
    claims.clear();
    settlementAt = null;
    phase = 'loading';
    message = '等待房主设备加载并播放片段';
    changed();
  }
  function start() {
    if (phase !== 'created') throw new Error('Match already started');
    startedAt = deps.now();
    if (startedAt < Date.parse(input.session.referenceTime))
      throw new Error('Clock predates frozen selection');
    emit({ type: 'GAME_STARTED', gameType: input.session.gameType }, startedAt);
    nextRound();
  }
  function closeRound() {
    if (!current) return;
    emit({
      type: 'ROUND_FINISHED',
      roundId: input.session.gameSessionId + ':round:' + (index + 1),
    });
    const winner = emptyWinner();
    if (winner) {
      finish(winner, 'empty_hand');
      return;
    }
    phase = 'rest';
    current.deadline = deps.now() + DUEL_RULES.restMs;
    message = '本题结束，准备下一段';
    changed();
  }
  function pend(
    giverId: PlayerId,
    recipientId: PlayerId,
    reason: 'wrong_claim' | 'opponent_card',
  ) {
    // Explicit giver/recipient replaces the inverted pendingTransfer.to/from in the source.
    transfer = {
      giverId,
      recipientId,
      reason,
      expiresAt: deps.now() + DUEL_RULES.transferMs,
    };
    phase = 'transfer';
    current!.deadline = transfer.expiresAt;
    message =
      reason === 'opponent_card'
        ? '抢到对手的牌：请向对方交出一张自己的牌'
        : '错抢：对方将交给你一张牌';
    // Both paths are timed by tick(), including opponent_card (missing in the source).
    changed();
  }
  function give(id: PlayerId, cardId: CardId) {
    if (!transfer || phase !== 'transfer' || id !== transfer.giverId)
      throw new Error('当前不是你的交牌操作');
    const position = hands[id]!.indexOf(cardId);
    if (position < 0) throw new Error('只能交出自己手中的牌');
    hands[id]!.splice(position, 1);
    hands[transfer.recipientId]!.push(cardId);
    transfer = null;
    closeRound();
  }
  function resolve(winnerId: PlayerId | null) {
    if (!current || phase !== 'playing') return;
    settlementAt = null;
    current.revealed = true;
    const owner = players.find((p) =>
      hands[p]!.includes(current!.question.answerCardId),
    );
    if (owner)
      hands[owner]!.splice(
        hands[owner]!.indexOf(current.question.answerCardId),
        1,
      );
    if (winnerId) scores[winnerId] = scores[winnerId]! + 1;
    // As in the source, defer empty-hand victory until an opponent-card transfer completes.
    if (winnerId && owner && owner !== winnerId)
      pend(winnerId, owner, 'opponent_card');
    else closeRound();
  }
  function judge(id: PlayerId, action: DuelAction, correct: boolean) {
    const q = current!.question;
    const roundId = input.session.gameSessionId + ':round:' + (index + 1);
    const envelope = {
      actionId: action.actionId,
      roundId,
      songId: q.songId,
      playerId: id,
    };
    emit({ type: 'PLAYER_ACTION', ...envelope, actionType: 'claim' });
    const judgementId =
      input.session.gameSessionId + ':judgement:' + action.actionId;
    const recognitionScope = {
      questionId: q.questionId,
      recordingId: q.recordingId,
      segment: {
        startMs: q.startMs,
        durationMs: q.durationMs,
        kind: q.segmentKind,
      },
    };
    const event = emit({
      type: correct ? 'ANSWER_CORRECT' : 'ANSWER_WRONG',
      eventId: input.session.gameSessionId + ':event:' + (sequence + 1),
      partyId: input.session.partyId,
      gameSessionId: input.session.gameSessionId,
      selectionVersion: input.session.selectionVersion,
      sequence: sequence + 1,
      occurredAt: new Date(deps.now()).toISOString(),
      ...envelope,
      judgementId,
      recognitionScope,
    });
    judgements.push(
      JudgementSchema.parse({
        judgementId:
          event.type === 'ANSWER_CORRECT' || event.type === 'ANSWER_WRONG'
            ? event.judgementId
            : neverEvent(),
        ...envelope,
        outcome: correct ? 'correct' : 'wrong',
        recognitionScope,
        occurredAt: event.occurredAt,
      }),
    );
  }
  function neverEvent(): never {
    throw new Error('Unexpected judgement event');
  }
  function action(
    playerId: PlayerId,
    rawAction: DuelAction,
    rttMs: number,
  ): DuelView {
    const a = DuelActionSchema.parse(rawAction);
    if (
      !players.includes(playerId) ||
      a.gameSessionId !== input.session.gameSessionId ||
      a.selectionVersion !== input.session.selectionVersion
    )
      throw new Error('动作不属于当前比赛或评估版本');
    const key = JSON.stringify([playerId, a]);
    const old = actions.get(a.actionId);
    if (old) {
      if (old !== key) throw new Error('动作 ID 冲突');
      return snapshot();
    }
    tick();
    if (actions.size >= 2000) throw new Error('本局动作过多');
    if (outcome || !current || a.roundToken !== current.token)
      throw new Error('题目已结束或动作已过期');
    if (a.type === 'audio_failed') {
      if (playerId !== deps.audioPlayerId)
        throw new Error('仅播放设备可报告音频状态');
      actions.set(a.actionId, key);
      abort('房主设备播放失败，本局中断');
      return snapshot();
    }
    if (a.type === 'audio_started') {
      if (
        playerId !== deps.audioPlayerId ||
        phase !== 'loading' ||
        deps.now() > current.deadline
      )
        throw new Error('音频确认不适用于当前题目');
      actions.set(a.actionId, key);
      current.startAt = deps.now();
      current.deadline = deps.now() + DUEL_RULES.roundMs;
      phase = 'playing';
      played.push(current.question);
      message = '听到熟悉的旋律，点击对应歌牌';
      emit({
        type: 'ROUND_STARTED',
        roundId: input.session.gameSessionId + ':round:' + (index + 1),
      });
      emit({
        type: 'SONG_STARTED',
        roundId: input.session.gameSessionId + ':round:' + (index + 1),
        songId: current.question.songId,
      });
      changed();
      return snapshot();
    }
    if (a.type === 'transfer') {
      give(playerId, a.cardId);
      actions.set(a.actionId, key);
      return snapshot();
    }
    if (
      phase !== 'playing' ||
      current.startAt === null ||
      deps.now() > current.deadline + DUEL_RULES.compensationCapMs ||
      claims.has(playerId)
    )
      throw new Error('当前不能抢牌');
    if (!players.some((p) => hands[p]!.includes(a.cardId)))
      throw new Error('歌牌不在场上');
    const correct = a.cardId === current.question.answerCardId;
    if (!correct && settlementAt !== null)
      throw new Error('本题正确抢牌正在结算');
    if (!Number.isFinite(rttMs) || rttMs < 0) throw new Error('无效网络延迟');
    const adjustedAt =
      deps.now() - Math.min(DUEL_RULES.compensationCapMs, rttMs / 2);
    if (adjustedAt < current.startAt || adjustedAt > current.deadline)
      throw new Error('抢牌超出作答时间');
    actions.set(a.actionId, key);
    judge(playerId, a, correct);
    if (correct) {
      claims.set(playerId, { receivedAt: deps.now(), adjustedAt });
      settlementAt ??= deps.now() + DUEL_RULES.settleMs;
      changed();
    } else {
      const giver = opponent(playerId);
      scores[giver] = scores[giver]! + 1;
      current.revealed = true;
      pend(giver, playerId, 'wrong_claim');
    }
    return snapshot();
  }
  function tick() {
    if (outcome || !current) return;
    if (phase === 'loading' && deps.now() >= current.deadline) {
      abort('片段加载或播放确认超时，本局中断');
      return;
    }
    if (phase === 'playing') {
      if (settlementAt !== null && deps.now() >= settlementAt) {
        const winner =
          [...claims].sort(
            ([a, x], [b, y]) =>
              x.adjustedAt - y.adjustedAt ||
              x.receivedAt - y.receivedAt ||
              (a < b ? -1 : a > b ? 1 : 0),
          )[0]?.[0] ?? null;
        resolve(winner);
      } else if (
        settlementAt === null &&
        deps.now() > current.deadline + DUEL_RULES.compensationCapMs
      )
        resolve(null);
    } else if (
      phase === 'transfer' &&
      transfer &&
      deps.now() >= transfer.expiresAt
    ) {
      const card = hands[transfer.giverId]!.slice().sort()[0];
      if (card) give(transfer.giverId, card);
      else {
        transfer = null;
        closeRound();
      }
    } else if (phase === 'rest' && deps.now() >= current.deadline) nextRound();
  }
  function abort(reason: string) {
    if (outcome) return;
    if (phase === 'created') startedAt = deps.now();
    message = reason;
    finish(null, 'aborted');
  }
  return {
    start,
    action,
    tick,
    abort,
    snapshot,
    result: () => (outcome ? structuredClone(outcome) : null),
    currentQuestion: (token) =>
      current?.token === token && (phase === 'loading' || phase === 'playing')
        ? current.question
        : null,
  };
}
