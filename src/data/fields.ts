import { requireSupabase } from "./supabaseClient";
import type { Field, FieldOverlap, GeoJsonPolygon } from "../types";

export type FieldInput = Pick<Field, "name" | "field_type" | "geometry" | "notes">;
export async function listFields(): Promise<Field[]> {
  const { data, error } = await requireSupabase().from("fields").select("*").order("name");
  if (error) throw error; return data as Field[];
}
export async function saveField(input: FieldInput, id?: string): Promise<Field> {
  const client = requireSupabase();
  const { data: auth, error: authError } = await client.auth.getUser(); if (authError) throw authError;
  const query = id ? client.from("fields").update({ ...input, updated_at: new Date().toISOString() }).eq("id", id) : client.from("fields").insert({ ...input, owner_id: auth.user.id });
  const { data, error } = await query.select("*").single(); if (error) throw error; return data as Field;
}
export async function deleteField(id: string): Promise<void> {
  const { error } = await requireSupabase().from("fields").delete().eq("id", id); if (error) throw error;
}
export async function listFieldOverlaps(): Promise<FieldOverlap[]> {
  const { data, error } = await requireSupabase().from("field_overlaps").select("*"); if (error) throw error; return data as FieldOverlap[];
}
export async function replaceOverlapsForField(fieldId: string, overlaps: Array<[string, string]>): Promise<void> {
  const client = requireSupabase();
  const { data: userData, error: userError } = await client.auth.getUser(); if (userError) throw userError;
  const ownerId = userData.user.id;
  const { error: deleteError } = await client.from("field_overlaps").delete().or(`field_a.eq.${fieldId},field_b.eq.${fieldId}`); if (deleteError) throw deleteError;
  if (!overlaps.length) return;
  const rows = overlaps.map(([a, b]) => ({ owner_id: ownerId, field_a: a < b ? a : b, field_b: a < b ? b : a }));
  const { error } = await client.from("field_overlaps").insert(rows); if (error) throw error;
}
export async function recomputeAllOverlaps(overlapPairs: Array<[string, string]>): Promise<void> {
  const client = requireSupabase(); const { data, error: userError } = await client.auth.getUser(); if (userError) throw userError;
  const owner_id = data.user.id;
  const { error: clearError } = await client.from("field_overlaps").delete().eq("owner_id", owner_id); if (clearError) throw clearError;
  if (overlapPairs.length) {
    const { error } = await client.from("field_overlaps").insert(overlapPairs.map(([a, b]) => ({ owner_id, field_a: a < b ? a : b, field_b: a < b ? b : a })));
    if (error) throw error;
  }
}
export function polygon(value: GeoJsonPolygon): GeoJsonPolygon { return value; }
