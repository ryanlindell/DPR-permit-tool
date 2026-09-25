export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
export type GeoJsonPolygon = { type: "Polygon"; coordinates: number[][][] };

/** A physical play area. Geometry and names are shared across schedule versions. */
export interface Field {
  id: string;
  owner_id: string;
  name: string;
  field_type: string;
  geometry: GeoJsonPolygon;
  notes: string;
  created_at: string;
  updated_at: string;
}

/** One recurring weekly time slot in exactly one schedule version. */
export interface Permit {
  id: string;
  owner_id: string;
  version_id: string;
  organization: string;
  field_id: string | null;
  raw_field_name: string;
  start_time: string;
  end_time: string;
  days: number[];
  notes: string;
  extra: Record<string, Json>;
  import_batch_id: string | null;
  created_at: string;
  updated_at: string;
}

/** A named save slot for permits; fields are not versioned. */
export interface Version {
  id: string;
  owner_id: string;
  name: string;
  created_at: string;
}

/** One directed conflict relationship annotated with the weekdays shared by both permits. */
export interface Conflict {
  permit_id: string;
  conflicts_with: Permit;
  shared_days: number[];
}

/** Per-account map view and active schedule preferences. */
export interface AccountSettings {
  owner_id: string;
  home_center: { lat: number; lng: number };
  home_zoom: number;
  active_version_id: string;
  share_enabled: boolean;
  share_token: string;
}

export interface FieldOverlap {
  owner_id: string;
  field_a: string;
  field_b: string;
}
