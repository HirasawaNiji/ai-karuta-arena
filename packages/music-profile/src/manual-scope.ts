import { type Question, type RecognitionScope, type Evidence } from '@amp/core';

export function matchesScope(
  scope: RecognitionScope | undefined,
  question: Question | undefined,
): boolean {
  if (!scope) return true;
  if (!question) return false;
  return (
    (scope.questionId === undefined ||
      scope.questionId === question.questionId) &&
    (scope.recordingId === undefined ||
      scope.recordingId === question.recordingId) &&
    (scope.segment === undefined ||
      (scope.segment.startMs === question.startMs &&
        scope.segment.durationMs === question.durationMs &&
        scope.segment.kind === question.segmentKind))
  );
}
export function scopeSpecificity(
  e: Extract<Evidence, { type: 'recognition_report' }>,
): number {
  const s = e.recognitionScope;
  return s?.questionId ? 3 : s?.segment ? 2 : s?.recordingId ? 1 : 0;
}
export function applicableRecognition(
  e: Evidence,
  q: Question | undefined,
): boolean {
  if (!('eventId' in e)) return true;
  const scope = e.recognitionScope;
  return (
    !!scope &&
    !!(scope.questionId || (scope.recordingId && scope.segment)) &&
    matchesScope(scope, q)
  );
}
