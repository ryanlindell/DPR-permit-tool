import { requireSupabase } from "./supabaseClient";
import type { Version } from "../types";

export async function listVersions(): Promise<Version[]> {
  const { data, error } = await requireSupabase().from("versions").select("*").order("created_at"); if (error) throw error; return data as Version[];
}
export async function createVersion(name: string, sourceVersionId: string): Promise<Version> {
  const { data, error } = await requireSupabase().rpc("create_version_copy", { p_name: name, p_source_version_id: sourceVersionId });
  if (error) throw error; return data as Version;
}
export async function renameVersion(id: string, name: string): Promise<Version> {
  const { data, error } = await requireSupabase().from("versions").update({ name }).eq("id", id).select("*").single(); if (error) throw error; return data as Version;
}
export async function deleteVersion(id: string): Promise<void> {
  const client = requireSupabase(); const { data: settings, error: settingsError } = await client.from("account_settings").select("active_version_id").single(); if (settingsError) throw settingsError;
  if (settings?.active_version_id === id) throw new Error("The active version cannot be deleted.");
  const { error } = await client.from("versions").delete().eq("id", id); if (error) throw error;
}
