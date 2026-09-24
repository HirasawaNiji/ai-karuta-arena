import { z } from 'zod';
import { QuestionIdSchema, RecordingIdSchema, SafeCountSchema } from './ids.js';
/** Optional detail; absent scope remains song-level evidence. */
export const RecognitionScopeSchema = z
  .strictObject({
    questionId: QuestionIdSchema.optional(),
    recordingId: RecordingIdSchema.optional(),
    segment: z
      .strictObject({
        startMs: SafeCountSchema,
        durationMs: SafeCountSchema.min(1),
        kind: z.enum(['intro', 'chorus', 'other']),
      })
      .readonly()
      .optional(),
  })
  .refine(
    (scope) =>
      scope.questionId !== undefined || scope.recordingId !== undefined,
    'Recognition scope needs a question or recording',
  )
  .readonly();
export type RecognitionScope = z.infer<typeof RecognitionScopeSchema>;
