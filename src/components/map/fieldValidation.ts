import type { Field } from "../../types";

/** Trim and collapse internal whitespace so "  Field   A " is saved as "Field A". */
export function cleanFieldName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/**
 * Returns a human-readable problem with a proposed field name, or null if it is fine.
 * Uniqueness is case-insensitive, matching the database index on lower(name).
 */
export function fieldNameError(name: string, fields: readonly Pick<Field, "id" | "name">[], editingId?: string): string | null {
  const cleaned = cleanFieldName(name);
  if (!cleaned) return "Enter a field name.";
  const key = cleaned.toLowerCase();
  const clash = fields.find((field) => field.id !== editingId && cleanFieldName(field.name).toLowerCase() === key);
  return clash ? `A field named "${clash.name}" already exists.` : null;
}

/** Postgres unique_violation, raised if another tab created the same name first. */
export function isDuplicateNameError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "23505";
}
