import { requireSupabase } from "./supabaseClient";
export interface EditLock { owner_id: string; session_id: string; holder_label: string; heartbeat_at: string; }
export async function getEditLock(): Promise<EditLock | null> {
  const { data, error } = await requireSupabase().from("edit_locks").select("*").maybeSingle(); if (error) throw error; return data as EditLock | null;
}
export async function acquireEditLock(sessionId: string, label: string, force = false): Promise<boolean> {
  const { data, error } = await requireSupabase().rpc("acquire_edit_lock", { p_session_id: sessionId, p_label: label, p_force: force }); if (error) throw error; return data as boolean;
}
export async function heartbeatEditLock(sessionId: string): Promise<boolean> {
  const { data, error } = await requireSupabase().rpc("heartbeat_edit_lock", { p_session_id: sessionId }); if (error) throw error; return data as boolean;
}
export async function releaseEditLock(sessionId: string): Promise<void> {
  const { error } = await requireSupabase().rpc("release_edit_lock", { p_session_id: sessionId }); if (error) throw error;
}
