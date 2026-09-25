import { listFields, recomputeAllOverlaps, replaceOverlapsForField } from "../../data/fields";
import { polygonsOverlap } from "../../logic/overlaps";
import { appConfig } from "../../config/appConfig";
import type { Field, GeoJsonPolygon } from "../../types";

export type OverlapPair = [string, string];

/** Orders a pair so field_a < field_b, matching how field_overlaps stores rows. */
function orderedPair(a: string, b: string): OverlapPair {
  return a < b ? [a, b] : [b, a];
}

/** Pairs between one field (by id and geometry) and every other field whose polygon overlaps it with positive area. */
export function overlapPairsForField(fieldId: string, geometry: GeoJsonPolygon, fields: readonly Pick<Field, "id" | "geometry">[]): OverlapPair[] {
  return fields
    .filter((other) => other.id !== fieldId && polygonsOverlap(geometry, other.geometry, appConfig.overlapAreaThresholdSquareMeters))
    .map((other) => orderedPair(fieldId, other.id));
}

/** Every overlapping pair among the given fields, each pair listed once. */
export function allOverlapPairs(fields: readonly Pick<Field, "id" | "geometry">[]): OverlapPair[] {
  const pairs: OverlapPair[] = [];
  for (let i = 0; i < fields.length; i++) for (let j = i + 1; j < fields.length; j++) {
    const a = fields[i]!; const b = fields[j]!;
    if (polygonsOverlap(a.geometry, b.geometry, appConfig.overlapAreaThresholdSquareMeters)) pairs.push(orderedPair(a.id, b.id));
  }
  return pairs;
}

/**
 * Incremental recompute after one field is created, reshaped, or deleted (geometry null).
 * Only rows involving that field are rewritten; other pairs are untouched.
 * Reads the other fields fresh from the database so stale UI state cannot produce wrong rows.
 */
export async function syncOverlapsForField(fieldId: string, geometry: GeoJsonPolygon | null): Promise<void> {
  if (geometry === null) {
    // Deleting a field cascades its field_overlaps rows in the database; this clears any leftovers.
    await replaceOverlapsForField(fieldId, []);
    return;
  }
  const fields = await listFields();
  await replaceOverlapsForField(fieldId, overlapPairsForField(fieldId, geometry, fields));
}

/** Safety valve for the settings page: rebuilds the whole field_overlaps cache from current geometry. */
export async function recomputeAllFieldOverlaps(): Promise<number> {
  const pairs = allOverlapPairs(await listFields());
  await recomputeAllOverlaps(pairs);
  return pairs.length;
}
