export const SCALE = 1_000_000;
export const compareIds = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;
export function safeInteger(value: number): number {
  if (!Number.isSafeInteger(value))
    throw new RangeError('INVALID_INPUT: unsafe integer arithmetic');
  return value;
}
export const product = (a: number, b: number): number => safeInteger(a * b);
export const quantize = (value: number): number =>
  safeInteger(Math.round(value * SCALE));
export function requiredCoverage(count: number, ratio: number): number {
  const scaled = product(count, quantize(ratio));
  return Number((BigInt(scaled) + BigInt(SCALE) - 1n) / BigInt(SCALE));
}
export const gainKey = (gain: number): number =>
  safeInteger(Math.round(gain * 1e12));
export function unit(value: number): number {
  if (!Number.isFinite(value) || value < -1e-12 || value > 1 + 1e-12)
    throw new RangeError('INVALID_INPUT: non-unit objective');
  // Only absorb floating-point roundoff at the mathematical unit interval boundary.
  return Math.max(0, Math.min(1, value));
}
