import { useCallback, useEffect, useState } from "react";
import { listFieldOverlaps, listFields } from "../../data/fields";
import { getSettings, updateSettings } from "../../data/settings";
import type { AccountSettings, Field, FieldOverlap, GeoJsonPolygon } from "../../types";
import { syncOverlapsForField } from "./overlapSync";

/**
 * Loads fields, cached overlaps, and account settings for the map, and supplies the handlers
 * FieldMap needs. Phase 2 can lift this into MainApp's shared state or reuse it as-is.
 */
export function useFieldMapData() {
  const [fields, setFields] = useState<Field[]>([]);
  const [overlaps, setOverlaps] = useState<FieldOverlap[]>([]);
  const [settings, setSettings] = useState<AccountSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refreshFields = useCallback(async () => {
    const [nextFields, nextOverlaps] = await Promise.all([listFields(), listFieldOverlaps()]);
    setFields(nextFields); setOverlaps(nextOverlaps);
  }, []);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [nextSettings] = await Promise.all([getSettings(), refreshFields()]);
      setSettings(nextSettings);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error));
    }
  }, [refreshFields]);

  useEffect(() => { void load(); }, [load]);

  /** FieldMap's onGeometryChange: rewrite this field's overlap rows, then reload fields and overlaps. */
  const handleGeometryChange = useCallback(async (fieldId: string, geometry: GeoJsonPolygon | null) => {
    await syncOverlapsForField(fieldId, geometry);
    await refreshFields();
  }, [refreshFields]);

  /** Saves the home view; throws on failure so the caller can report it. */
  const saveHomeView = useCallback(async (center: { lat: number; lng: number }, zoom: number) => {
    setSettings(await updateSettings({ home_center: center, home_zoom: zoom }));
  }, []);

  return { fields, overlaps, settings, loading: !settings && !loadError, loadError, reload: load, refreshFields, handleGeometryChange, saveHomeView };
}
