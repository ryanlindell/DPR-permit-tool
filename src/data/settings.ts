import { requireSupabase } from "./supabaseClient";
import type { AccountSettings } from "../types";
export async function getSettings(): Promise<AccountSettings> {
  const { data, error } = await requireSupabase().from("account_settings").select("*").single(); if (error) throw error; return data as AccountSettings;
}
export async function updateSettings(changes: Partial<Omit<AccountSettings, "owner_id">>): Promise<AccountSettings> {
  const { data, error } = await requireSupabase().from("account_settings").update(changes).select("*").single(); if (error) throw error; return data as AccountSettings;
}
export async function setActiveVersion(versionId: string): Promise<AccountSettings> { return updateSettings({ active_version_id: versionId }); }
