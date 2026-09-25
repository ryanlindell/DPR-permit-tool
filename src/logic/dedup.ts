import type { Permit } from "../types";
import { normalizeName } from "./matching";

export type PermitIdentity = Pick<Permit, "organization" | "raw_field_name" | "start_time" | "end_time" | "days">;

/** Stable identity for import duplicate detection, independent of day order. */
export function permitIdentityKey(permit: PermitIdentity): string {
  return JSON.stringify([
    normalizeName(permit.organization),
    normalizeName(permit.raw_field_name),
    permit.start_time.trim(),
    permit.end_time.trim(),
    [...new Set(permit.days)].sort((a, b) => a - b),
  ]);
}

export function findDuplicatePermits<T extends PermitIdentity>(incoming: readonly T[], existing: readonly T[]): { added: T[]; duplicates: T[] } {
  const seen = new Set(existing.map(permitIdentityKey));
  const added: T[] = [];
  const duplicates: T[] = [];
  for (const permit of incoming) {
    const key = permitIdentityKey(permit);
    if (seen.has(key)) duplicates.push(permit);
    else { seen.add(key); added.push(permit); }
  }
  return { added, duplicates };
}
