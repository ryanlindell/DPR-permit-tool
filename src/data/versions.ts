import { requireSupabase } from "./supabaseClient";
import type { Version } from "../types";

export async function listVersions(): Promise<Version[]> {
  const { data, error } = await requireSupabase().from("versions").select("*").order("created_at"); if (error) throw error; return data as Version[];
}
/**
 * "Save as new version": copies every permit of the source version into a new version and makes
 * it active. Runs as one Postgres function call (create_version_copy), which executes in a single
 * transaction, so a failure part-way leaves no half-copied version behind.
 */
export async function createVersion(name: string, sourceVersionId: string): Promise<Version> {
  const { data, error } = await requireSupabase().rpc("create_version_copy", { p_name: name.trim(), p_source_version_id: sourceVersionId });
  if (error) throw error; return data as Version;
}
export async function renameVersion(id: string, name: string): Promise<Version> {
  const { data, error } = await requireSupabase().from("versions").update({ name: name.trim() }).eq("id", id).select("*").single(); if (error) throw error; return data as Version;
}
/** Number of permits in a version, shown in the delete confirmation; null if the server didn't report one. */
export async function countVersionPermits(versionId: string): Promise<number | null> {
  const { count, error } = await requireSupabase().from("permits").select("id", { count: "exact", head: true }).eq("version_id", versionId);
  if (error) throw error; return count;
}
export async function deleteVersion(id: string): Promise<void> {
  const client = requireSupabase(); const { data: settings, error: settingsError } = await client.from("account_settings").select("active_version_id").single(); if (settingsError) throw settingsError;
  if (settings?.active_version_id === id) throw new Error("The active version cannot be deleted.");
  // The database also refuses (foreign key, on delete restrict) if it became active in the meantime.
  const { error } = await client.from("versions").delete().eq("id", id); if (error) throw error;
}
