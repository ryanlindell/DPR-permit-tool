import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL ?? "";
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";

export const isSupabaseConfigured = Boolean(url && publishableKey);
export const supabase = isSupabaseConfigured ? createClient(url, publishableKey) : null;
/** Raw connection details, for the rare request supabase-js cannot make (a keepalive fetch on tab close). */
export const supabaseConfig = { url, publishableKey } as const;

export function requireSupabase() {
  if (!supabase) throw new Error("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.");
  return supabase;
}

export function getUsernameEmail(username: string): string {
  return `${username.trim().toLocaleLowerCase("en-US")}@users.fieldpermits.invalid`;
}
