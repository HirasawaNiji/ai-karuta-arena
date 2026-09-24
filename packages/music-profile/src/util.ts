import type { Evidence } from '@amp/core';
export const compare = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;
/** Exact canonical content, deliberately collision-free rather than a lossy hash. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') {
    return (
      '{' +
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => compare(a, b))
        .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v))
        .join(',') +
      '}'
    );
  }
  return JSON.stringify(value) ?? 'null';
}
export const byObservation = (a: Evidence, b: Evidence): number =>
  Date.parse(a.observedAt) - Date.parse(b.observedAt) ||
  compare(a.evidenceId, b.evidenceId);
export const playScore = (count: number, cap: number): number =>
  Math.min(1, Math.log1p(count) / Math.log1p(cap));
export const clamp = (value: number): number => Math.max(0, Math.min(1, value));
export const decay = (
  at: string,
  referenceTime: string,
  halfLife: number,
): number =>
  2 ** (-(Date.parse(referenceTime) - Date.parse(at)) / 86_400_000 / halfLife);
export function latest<T extends Evidence>(items: readonly T[]): T | undefined {
  return [...items].sort(byObservation).at(-1);
}
