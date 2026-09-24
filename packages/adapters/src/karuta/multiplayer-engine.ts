import {
  MultiplayerInputSchema,
  MultiplayerActionSchema,
  MULTIPLAYER_RULES,
  GameEventSchema,
  GameResultSchema,
  JudgementSchema,
  StableIdSchema,
  type MultiplayerInput,
  type MultiplayerAction,
  type MultiplayerView,
  type MultiplayerEngine,
  type MultiplayerEngineFactory,
  type DuelEngineDependencies,
  type PlayerId,
  type GameResult,
} from '@amp/core';
import { shuffledQuestions } from './duel-engine.js';

export class MultiplayerFactory implements MultiplayerEngineFactory {
  create(
    input: MultiplayerInput,
    deps: DuelEngineDependencies,
  ): MultiplayerEngine {
    return createMultiplayer(input, deps);
  }
}
export function createMultiplayer(
  raw: MultiplayerInput,
  deps: DuelEngineDependencies,
): MultiplayerEngine {
  const input = MultiplayerInputSchema.parse(raw),
    players = input.session.playerIds;
  if (!players.includes(deps.audioPlayerId))
    throw new Error('Audio player must participate');
  const plan = shuffledQuestions(input.questions, input.seed),
    remaining = new Set(input.questions.map((q) => q.answerCardId));
  const scores: Record<string, number> = Object.fromEntries(
      players.map((p) => [p, 0]),
    ),
    locked = new Set<PlayerId>(),
    actions = new Map<string, string>(),
    tokens = new Set<string>();
  let phase: MultiplayerView['phase'] = 'created',
    index = -1,
    sequence = 0,
    startedAt = 0,
    token = '',
    deadline = 0,
    revealed = false,
    message = '等待开局',
    result: GameResult | null = null;
  const played: GameResult['playedSongIds'][number][] = [],
    judgements: GameResult['judgements'][number][] = [];
  const question = () => plan[index];
  function emit(event: Record<string, unknown>, at = deps.now()) {
    const e = GameEventSchema.parse({
      ...event,
      eventId: input.session.gameSessionId + ':event:' + ++sequence,
      partyId: input.session.partyId,
      gameSessionId: input.session.gameSessionId,
      selectionVersion: input.session.selectionVersion,
      sequence,
      occurredAt: new Date(at).toISOString(),
    });
    deps.onEvent(e);
    return e;
  }
  function snapshot(): MultiplayerView {
    const ordered = [...players].sort(
      (a, b) => scores[b]! - scores[a]! || (a < b ? -1 : 1),
    );
    return structuredClone({
      gameSessionId: input.session.gameSessionId,
      selectionVersion: input.session.selectionVersion,
      rulesVersion: MULTIPLAYER_RULES.version,
      phase,
      round:
        index < 0
          ? null
          : {
              number: index + 1,
              token,
              deadline,
              revealedCardId: revealed ? question()!.answerCardId : null,
            },
      remainingCards: [...remaining],
      lockedPlayerIds: [...locked],
      scores,
      standings: ordered.map((p) => ({
        playerId: p,
        score: scores[p]!,
        rank: 1 + players.filter((other) => scores[other]! > scores[p]!).length,
      })),
      sequence,
      message,
    });
  }
  function finish(aborted: boolean) {
    if (result) return;
    const endedAt = deps.now();
    phase = aborted ? 'aborted' : 'completed';
    result = GameResultSchema.parse({
      session: input.session,
      status: aborted ? 'aborted' : 'completed',
      startedAt: new Date(startedAt).toISOString(),
      endedAt: new Date(endedAt).toISOString(),
      playedSongIds: played,
      judgements,
      scores,
    });
    if (!aborted) {
      message = '全部片段已播完，看看大家的默契';
      emit({ type: 'GAME_FINISHED', result }, endedAt);
    }
    deps.onChange();
  }
  function next() {
    if (index + 1 >= plan.length) {
      finish(false);
      return;
    }
    index++;
    token = StableIdSchema.parse(deps.nextToken());
    if (tokens.has(token)) throw new Error('Repeated round token');
    tokens.add(token);
    deadline = deps.now() + MULTIPLAYER_RULES.loadingMs;
    revealed = false;
    locked.clear();
    phase = 'loading';
    message = '等待房主音箱播放';
    deps.onChange();
  }
  function closeRound() {
    remaining.delete(question()!.answerCardId);
    revealed = true;
    emit({
      type: 'ROUND_FINISHED',
      roundId: input.session.gameSessionId + ':round:' + (index + 1),
    });
    phase = 'rest';
    deadline = deps.now() + MULTIPLAYER_RULES.restMs;
    deps.onChange();
  }
  function abort(reason: string) {
    if (result) return;
    if (phase === 'created') startedAt = deps.now();
    message = reason;
    finish(true);
  }
  function tick() {
    if (result) return;
    if (phase === 'loading' && deps.now() >= deadline)
      abort('片段加载或播放确认超时，本局中断');
    else if (phase === 'playing' && deps.now() >= deadline) {
      message = '本题无人抢中';
      closeRound();
    } else if (phase === 'rest' && deps.now() >= deadline) next();
  }
  function action(id: PlayerId, raw: MultiplayerAction): MultiplayerView {
    const a = MultiplayerActionSchema.parse(raw);
    if (
      !players.includes(id) ||
      a.gameSessionId !== input.session.gameSessionId ||
      a.selectionVersion !== input.session.selectionVersion
    )
      throw new Error('动作不属于当前比赛');
    const key = JSON.stringify([id, a]),
      old = actions.get(a.actionId);
    if (old) {
      if (old !== key) throw new Error('动作 ID 冲突');
      return snapshot();
    }
    tick();
    if (result || a.roundToken !== token || !question())
      throw new Error('题目或比赛已结束');
    if (actions.size >= 4000) throw new Error('本局动作过多');
    if (a.type === 'audio_failed') {
      if (id !== deps.audioPlayerId) throw new Error('仅播放设备可报告音频');
      actions.set(a.actionId, key);
      abort('房主设备播放失败，本局中断');
      return snapshot();
    }
    if (a.type === 'audio_started') {
      if (id !== deps.audioPlayerId || phase !== 'loading')
        throw new Error('音频确认已过期');
      actions.set(a.actionId, key);
      phase = 'playing';
      deadline = deps.now() + MULTIPLAYER_RULES.roundMs;
      played.push(question()!.songId);
      const roundId = input.session.gameSessionId + ':round:' + (index + 1);
      emit({ type: 'ROUND_STARTED', roundId });
      emit({ type: 'SONG_STARTED', roundId, songId: question()!.songId });
      message = '抢到正确歌牌，收下一分';
      deps.onChange();
      return snapshot();
    }
    if (phase !== 'playing' || locked.has(id))
      throw new Error('本题已结束或你已错抢');
    if (!remaining.has(a.cardId)) throw new Error('歌牌不在场上');
    actions.set(a.actionId, key);
    locked.add(id);
    const q = question()!,
      correct = a.cardId === q.answerCardId,
      roundId = input.session.gameSessionId + ':round:' + (index + 1);
    const envelope = {
      actionId: a.actionId,
      roundId,
      songId: q.songId,
      playerId: id,
    };
    emit({ type: 'PLAYER_ACTION', ...envelope, actionType: 'claim' });
    const scope = {
      questionId: q.questionId,
      recordingId: q.recordingId,
      segment: {
        startMs: q.startMs,
        durationMs: q.durationMs,
        kind: q.segmentKind,
      },
    };
    const judgementId =
      input.session.gameSessionId + ':judgement:' + a.actionId;
    const event = emit({
      type: correct ? 'ANSWER_CORRECT' : 'ANSWER_WRONG',
      ...envelope,
      judgementId,
      recognitionScope: scope,
    });
    judgements.push(
      JudgementSchema.parse({
        ...envelope,
        judgementId,
        outcome: correct ? 'correct' : 'wrong',
        recognitionScope: scope,
        occurredAt: event.occurredAt,
      }),
    );
    if (correct) {
      scores[id] = scores[id]! + 1;
      message = '有人抢中了！';
      closeRound();
    } else {
      message = '错抢者本题不能再抢，其他人继续';
      deps.onChange();
    }
    return snapshot();
  }
  return {
    start() {
      if (phase !== 'created') throw new Error('Match already started');
      startedAt = deps.now();
      if (startedAt < Date.parse(input.session.referenceTime))
        throw new Error('Clock predates session');
      emit(
        { type: 'GAME_STARTED', gameType: input.session.gameType },
        startedAt,
      );
      next();
    },
    action,
    tick,
    abort,
    snapshot,
    result: () => (result ? structuredClone(result) : null),
    currentQuestion: (t) =>
      t === token && (phase === 'loading' || phase === 'playing')
        ? (question() ?? null)
        : null,
  };
}
