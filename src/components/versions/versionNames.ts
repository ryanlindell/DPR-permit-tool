import type { Version } from "../../types";

const normalize = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

/** Trims and collapses whitespace, e.g. "  Plan   B " -> "Plan B". */
export function cleanVersionName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/** A human-readable problem with a proposed version name, or null if it is fine. Case-insensitive, like the database index. */
export function versionNameError(name: string, versions: readonly Pick<Version, "id" | "name">[], editingId?: string): string | null {
  const cleaned = cleanVersionName(name);
  if (!cleaned) return "Enter a name for the version.";
  if (cleaned.length > 80) return "Keep the name under 80 characters.";
  const clash = versions.find((version) => version.id !== editingId && normalize(version.name) === normalize(cleaned));
  return clash ? `A version named "${clash.name}" already exists.` : null;
}

/** Default name offered by "Save as new version": the first unused of Plan B, Plan C, ... then Version N. */
export function suggestVersionName(versions: readonly Pick<Version, "name">[]): string {
  const taken = new Set(versions.map((version) => normalize(version.name)));
  for (let code = "B".charCodeAt(0); code <= "Z".charCodeAt(0); code++) {
    const candidate = `Plan ${String.fromCharCode(code)}`;
    if (!taken.has(normalize(candidate))) return candidate;
  }
  let n = versions.length + 1;
  while (taken.has(normalize(`Version ${n}`))) n++;
  return `Version ${n}`;
}

/** Turns database errors into sentences a non-technical user can act on. */
export function versionErrorMessage(error: unknown): string {
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  if (code === "23505") return "A version with that name already exists.";
  if (code === "23503") return "That version is active, so it can't be deleted. Switch to another version first.";
  if (code === "23514") return "Enter a name for the version.";
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) return String((error as { message: unknown }).message);
  return "Something went wrong. Please try again.";
}
