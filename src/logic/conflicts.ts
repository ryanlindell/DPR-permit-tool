import type { Conflict, FieldOverlap, Permit } from "../types";
import { timesOverlap } from "./time";

/** Finds per-permit conflicts using each permit's own time slot and days. */
export function computeConflicts(permits: readonly Permit[], overlaps: readonly Pick<FieldOverlap, "field_a" | "field_b">[]): Map<string, Conflict[]> {
  const overlapKeys = new Set(overlaps.map(({ field_a, field_b }) => [field_a, field_b].sort().join(":")));
  const result = new Map<string, Conflict[]>();
  for (const p of permits) result.set(p.id, []);
  for (let i = 0; i < permits.length; i++) for (let j = i + 1; j < permits.length; j++) {
    const a = permits[i]!; const b = permits[j]!;
    if (a.version_id !== b.version_id) continue;
    if (a.field_id === null || b.field_id === null) continue;
    const sameOrAdjacent = a.field_id === b.field_id || overlapKeys.has([a.field_id, b.field_id].sort().join(":"));
    if (!sameOrAdjacent || !timesOverlap(a.start_time, a.end_time, b.start_time, b.end_time)) continue;
    const bDays = new Set(b.days);
    const sharedDays = [...new Set(a.days)].filter((day) => bDays.has(day)).sort((x, y) => x - y);
    if (sharedDays.length) {
      result.get(a.id)!.push({ permit_id: a.id, conflicts_with: b, shared_days: sharedDays });
      result.get(b.id)!.push({ permit_id: b.id, conflicts_with: a, shared_days: sharedDays });
    }
  }
  return result;
}
