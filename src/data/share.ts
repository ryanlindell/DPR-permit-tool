import { requireSupabase } from "./supabaseClient";
import type { AccountSettings, Field, FieldOverlap, Permit, Version } from "../types";

export interface SharedView { fields: Field[]; overlaps: FieldOverlap[]; permits: Permit[]; settings: Pick<AccountSettings, "home_center" | "home_zoom">; version: Version; }
export async function getSharedView(token: string): Promise<SharedView | null> {
  const { data, error } = await requireSupabase().rpc("get_shared_view", { token }); if (error) throw error; return data as SharedView | null;
}
export async function regenerateShareToken(): Promise<AccountSettings> {
  const { data, error } = await requireSupabase().from("account_settings").update({ share_token: crypto.randomUUID() }).select("*").single(); if (error) throw error; return data as AccountSettings;
}
