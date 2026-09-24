import { z } from 'zod';

export const StableIdSchema = z
  .string()
  .min(1)
  .refine(
    (value) =>
      value === value.trim() &&
      [...value].every((character) => {
        const code = character.charCodeAt(0);
        return code >= 32 && code !== 127;
      }),
    'IDs must be nonempty, without surrounding whitespace or control characters',
  );
export const SongIdSchema = StableIdSchema.brand<'SongId'>();
export const PlayerIdSchema = StableIdSchema.brand<'PlayerId'>();
export const ArtistIdSchema = StableIdSchema.brand<'ArtistId'>();
export const TagIdSchema = StableIdSchema.brand<'TagId'>();
export const RecordingIdSchema = StableIdSchema.brand<'RecordingId'>();
export const QuestionIdSchema = StableIdSchema.brand<'QuestionId'>();
export const CardIdSchema = StableIdSchema.brand<'CardId'>();
export const AssetIdSchema = StableIdSchema.brand<'AssetId'>();
export type SongId = z.infer<typeof SongIdSchema>;
export type PlayerId = z.infer<typeof PlayerIdSchema>;
export type ArtistId = z.infer<typeof ArtistIdSchema>;
export type TagId = z.infer<typeof TagIdSchema>;
export type RecordingId = z.infer<typeof RecordingIdSchema>;
export type QuestionId = z.infer<typeof QuestionIdSchema>;
export type CardId = z.infer<typeof CardIdSchema>;
export type AssetId = z.infer<typeof AssetIdSchema>;
export const UnitIntervalSchema = z.number().finite().min(0).max(1);
export const SafeCountSchema = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER);
export const DisplayTextSchema = z.string().trim().min(1);

export function uniqueValues<T extends z.ZodType>(schema: T) {
  return z
    .array(schema)
    .refine(
      (values) => new Set(values).size === values.length,
      'Duplicate values are not allowed',
    )
    .readonly();
}

export const PositiveCountSchema = SafeCountSchema.min(1);
export const PartyIdSchema = StableIdSchema.brand<'PartyId'>();
export type PartyId = z.infer<typeof PartyIdSchema>;
export const CommandIdSchema = StableIdSchema.brand<'CommandId'>();
export type CommandId = z.infer<typeof CommandIdSchema>;
export const GameSessionIdSchema = StableIdSchema.brand<'GameSessionId'>();
export type GameSessionId = z.infer<typeof GameSessionIdSchema>;
export const RoundIdSchema = StableIdSchema.brand<'RoundId'>();
export type RoundId = z.infer<typeof RoundIdSchema>;
export const ActionIdSchema = StableIdSchema.brand<'ActionId'>();
export type ActionId = z.infer<typeof ActionIdSchema>;
export const JudgementIdSchema = StableIdSchema.brand<'JudgementId'>();
export type JudgementId = z.infer<typeof JudgementIdSchema>;
export const GameTypeSchema = StableIdSchema.brand<'GameType'>();
export type GameType = z.infer<typeof GameTypeSchema>;
