import { type DomainError, type Result } from '@amp/core';
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v))
        .join(',') +
      '}'
    );
  return JSON.stringify(value) ?? 'undefined';
}
export function copy<T>(value: T): T {
  return structuredClone(value);
}
export function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
export function failure<T = never>(
  code: DomainError['code'],
  message: string,
): Result<T> {
  return { ok: false, error: { code, message, details: {} } };
}
export class RuntimeFailure extends Error {
  constructor(
    readonly code: DomainError['code'],
    message: string,
  ) {
    super(message);
  }
}
export function requireCondition(
  condition: unknown,
  code: DomainError['code'],
  message: string,
): asserts condition {
  if (!condition) throw new RuntimeFailure(code, message);
}
