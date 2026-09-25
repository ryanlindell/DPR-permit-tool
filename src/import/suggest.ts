import { normalizeName } from "../logic/matching";

/** Classic edit distance: the number of single-letter inserts, deletes or swaps between two strings. */
export function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length];
}

/**
 * Best guess for a misspelled field name, used only to pre-select the dropdown in the
 * Broken permits dialog. Returns undefined unless one field is clearly the closest, so
 * the user is never nudged toward an arbitrary choice.
 */
export function suggestField<T extends { name: string }>(rawName: string, fields: readonly T[]): T | undefined {
  const target = normalizeName(rawName);
  if (!target) return undefined;
  const scored = fields
    .map((field) => ({ field, distance: editDistance(target, normalizeName(field.name)) }))
    .sort((a, b) => a.distance - b.distance);
  const [best, runnerUp] = scored;
  if (!best) return undefined;
  const allowed = Math.max(1, Math.floor(target.length / 3));
  if (best.distance > allowed) return undefined;
  if (runnerUp && runnerUp.distance === best.distance) return undefined;
  return best.field;
}
