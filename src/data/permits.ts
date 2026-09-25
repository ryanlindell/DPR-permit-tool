import { requireSupabase } from "./supabaseClient";
import type { Permit } from "../types";

export type PermitInput = Omit<Permit, "id" | "owner_id" | "created_at" | "updated_at">;
export async function listPermits(versionId: string): Promise<Permit[]> {
  const { data, error } = await requireSupabase().from("permits").select("*").eq("version_id", versionId).order("start_time");
  if (error) throw error; return data as Permit[];
}
export async function createPermits(inputs: PermitInput[]): Promise<Permit[]> {
  if (!inputs.length) return [];
  const client = requireSupabase(); const { data: auth, error: authError } = await client.auth.getUser(); if (authError) throw authError;
  const { data, error } = await client.from("permits").insert(inputs.map((input) => ({ ...input, owner_id: auth.user.id }))).select("*"); if (error) throw error; return data as Permit[];
}
export async function updatePermit(id: string, changes: Partial<PermitInput>): Promise<Permit> {
  const { data, error } = await requireSupabase().from("permits").update({ ...changes, updated_at: new Date().toISOString() }).eq("id", id).select("*").single();
  if (error) throw error; return data as Permit;
}
export async function deletePermit(id: string): Promise<void> {
  const { error } = await requireSupabase().from("permits").delete().eq("id", id); if (error) throw error;
}
export async function assignBrokenPermits(rawFieldName: string, fieldId: string, allMatching = false, permitId?: string): Promise<void> {
  let query = requireSupabase().from("permits").update({ field_id: fieldId });
  query = allMatching ? query.is("field_id", null).ilike("raw_field_name", rawFieldName) : query.eq("id", permitId ?? "");
  const { error } = await query; if (error) throw error;
}
