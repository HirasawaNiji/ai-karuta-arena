import { z } from 'zod';
import { DisplayTextSchema, StableIdSchema } from './ids.js';

export const DomainErrorCodeSchema = z.enum([
  'INVALID_INPUT',
  'SOURCE_FAILED',
  'BUSY',
  'INVALID_ACTOR',
  'FORBIDDEN',
  'INVALID_PHASE',
  'STALE_VERSION',
  'COMMAND_CONFLICT',
  'BAN_OPEN',
  'NOT_EVALUATED',
  'ACK_REQUIRED',
  'UNSUPPORTED_GAME',
  'UNSUPPORTED_ACTION',
  'GAME_FAILED',
  'STOP_FAILED',
  'EVENT_CONFLICT',
  'EVENT_INVALID',
  'RESULT_MISMATCH',
  'INTERNAL_ERROR',
]);
export const DomainErrorSchema = z
  .strictObject({
    code: DomainErrorCodeSchema,
    message: DisplayTextSchema,
    details: z
      .record(
        StableIdSchema,
        z.union([
          z.string(),
          z.number().finite(),
          z.boolean(),
          z.null(),
          z.array(z.string()).readonly(),
        ]),
      )
      .readonly(),
  })
  .readonly();
export function ResultSchema<T extends z.ZodType>(value: T) {
  return z
    .discriminatedUnion('ok', [
      z.strictObject({ ok: z.literal(true), value }).readonly(),
      z
        .strictObject({ ok: z.literal(false), error: DomainErrorSchema })
        .readonly(),
    ])
    .readonly();
}
export type DomainError = z.infer<typeof DomainErrorSchema>;
export type Result<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: DomainError }>;
