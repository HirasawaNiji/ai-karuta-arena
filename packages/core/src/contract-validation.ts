import { z } from 'zod';

export function contractIssue(
  context: z.RefinementCtx,
  path: (string | number)[],
  message: string,
) {
  context.addIssue({ code: 'custom', path, message });
}
export function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return (
    a.length === b.length &&
    new Set(a).size === a.length &&
    new Set(b).size === b.length &&
    a.every((id) => b.includes(id))
  );
}
export function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}
// All inputs have already passed strict schemas. Compare records without depending on key order.
export function sameData(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b))
    return (
      a.length === b.length &&
      a.every((value: unknown, index) => sameData(value, b[index]))
    );
  if (
    a === null ||
    b === null ||
    typeof a !== 'object' ||
    typeof b !== 'object' ||
    Array.isArray(a) ||
    Array.isArray(b)
  )
    return false;
  const left = Object.entries(a) as [string, unknown][];
  const right = Object.entries(b) as [string, unknown][];
  return (
    left.length === right.length &&
    left.every(([key, value]) => {
      const match = right.find(([other]) => key === other);
      return match !== undefined && sameData(value, match[1]);
    })
  );
}
