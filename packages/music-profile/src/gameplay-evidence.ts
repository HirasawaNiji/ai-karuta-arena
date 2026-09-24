import {
  EvidenceSchema,
  EvidenceContextSchema,
  GameRecognitionContextSchema,
  UtcTimestampSchema,
  StableIdSchema,
  type Catalog,
  type Evidence,
  type GameEvent,
  type GameSessionInput,
} from '@amp/core';
/** Pure conversion only. Runtime owns sequence, authorization and settlement. */
export function gameplayEvidence(input: {
  readonly catalog: Catalog;
  readonly session: GameSessionInput;
  readonly event: GameEvent;
  readonly sourceId: string;
  readonly observedAt: string;
}): Evidence | null {
  const {
    context: { event },
  } = GameRecognitionContextSchema.parse({
    catalog: input.catalog,
    context: { session: input.session, event: input.event },
  });
  const observedAt = UtcTimestampSchema.parse(input.observedAt);
  const sourceId = StableIdSchema.parse(input.sourceId);
  if (Date.parse(event.occurredAt) > Date.parse(observedAt))
    throw new Error('Future game event');
  if (event.type !== 'ANSWER_CORRECT' && event.type !== 'ANSWER_WRONG')
    return null;
  const evidence = EvidenceSchema.parse({
    evidenceId: 'game:' + event.eventId,
    eventId: event.eventId,
    playerId: event.playerId,
    songId: event.songId,
    sourceId,
    observedAt,
    occurredAt: event.occurredAt,
    type: event.type === 'ANSWER_CORRECT' ? 'game_correct' : 'game_wrong',
    ...(event.recognitionScope
      ? { recognitionScope: event.recognitionScope }
      : {}),
  });
  EvidenceContextSchema.parse({
    catalog: input.catalog,
    referenceTime: observedAt,
    evidence: [evidence],
  });
  return evidence;
}
