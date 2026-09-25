import { requireSupabase } from "./supabaseClient";
import type { AccountSettings, Field, FieldOverlap, Permit, Version } from "../types";

/** Everything the read-only share page needs, returned by the get_shared_view Postgres function. */
export interface SharedView { fields: Field[]; overlaps: FieldOverlap[]; permits: Permit[]; settings: Pick<AccountSettings, "home_center" | "home_zoom">; version: Version; }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Share tokens are UUIDs; anything else cannot match, so it is not worth a request. */
export function isShareToken(token: string): boolean { return UUID.test(token); }

/**
 * Returns the shared schedule, or null when the link is wrong, was regenerated, or sharing is off.
 * The function deliberately cannot tell those cases apart, so a guessed token learns nothing.
 */
export async function getSharedView(token: string): Promise<SharedView | null> {
  if (!isShareToken(token)) return null;
  const { data, error } = await requireSupabase().rpc("get_shared_view", { token }); if (error) throw error; return data as SharedView | null;
}
export async function setShareEnabled(enabled: boolean): Promise<AccountSettings> {
  const { data, error } = await requireSupabase().from("account_settings").update({ share_enabled: enabled }).select("*").single(); if (error) throw error; return data as AccountSettings;
}
/** Issues a new token; the old link stops working immediately. */
export async function regenerateShareToken(): Promise<AccountSettings> {
  const { data, error } = await requireSupabase().from("account_settings").update({ share_token: crypto.randomUUID() }).select("*").single(); if (error) throw error; return data as AccountSettings;
}

/** Full link to the share page. Uses the current page's path so it works under the GitHub Pages base path. */
export function buildShareUrl(token: string, location: Pick<Location, "origin" | "pathname"> = window.location): string {
  return `${location.origin}${location.pathname}#/share/${token}`;
}
