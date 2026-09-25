import { useEffect, useRef } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";
import type { Field, GeoJsonPolygon } from "../../types";
import { fieldPathStyle } from "./fieldStyles";
import { geometryKey, layerToPolygon, polygonToLatLngs } from "./leafletGeometry";

interface FieldLayersProps {
  fields: Field[];
  conflictingFieldIds: ReadonlySet<string>;
  selectedFieldId: string | null;
  onSelect: (fieldId: string) => void;
  /** Resolves true if the new geometry was saved; false reverts the polygon to its last saved shape. */
  onGeometryEdited: (fieldId: string, geometry: GeoJsonPolygon) => Promise<boolean>;
  /** Called after Geoman's removal tool took the polygon off the map. Resolves false to put it back. */
  onRemoveRequested: (fieldId: string) => Promise<boolean>;
}

interface Entry { layer: L.Polygon; key: string; geometry: GeoJsonPolygon }

/**
 * Keeps one Leaflet polygon per field in sync with props. Leaflet is imperative, so instead of
 * rendering JSX we diff `fields` against the layers already on the map and patch the difference.
 * Doing it this way (rather than react-leaflet's <Polygon>) keeps React from resetting shapes
 * while Geoman is in the middle of editing them.
 */
export function FieldLayers({ fields, conflictingFieldIds, selectedFieldId, onSelect, onGeometryEdited, onRemoveRequested }: FieldLayersProps) {
  const map = useMap();
  const entries = useRef(new Map<string, Entry>());
  // Layer event handlers are bound once per layer, so they read the latest callbacks from a ref.
  const handlers = useRef({ onSelect, onGeometryEdited, onRemoveRequested });
  useEffect(() => { handlers.current = { onSelect, onGeometryEdited, onRemoveRequested }; });

  useEffect(() => {
    const current = entries.current;
    return () => { for (const { layer } of current.values()) layer.remove(); current.clear(); };
  }, [map]);

  // Create, reshape, rename, and remove layers to match `fields`.
  useEffect(() => {
    const current = entries.current;
    const seen = new Set<string>();
    for (const field of fields) {
      seen.add(field.id);
      const key = geometryKey(field.geometry);
      const entry = current.get(field.id);
      if (!entry) {
        const layer = L.polygon(polygonToLatLngs(field.geometry));
        layer.bindTooltip(field.name, { sticky: true, className: "field-tooltip" });
        layer.on("click", (event) => {
          L.DomEvent.stopPropagation(event);
          if (map.pm.globalRemovalModeEnabled() || map.pm.globalDrawModeEnabled()) return;
          handlers.current.onSelect(field.id);
        });
        layer.on("pm:edit", () => void handleEdit(field.id));
        layer.on("pm:remove", () => void handleRemove(field.id));
        layer.addTo(map);
        current.set(field.id, { layer, key, geometry: field.geometry });
      } else {
        entry.layer.setTooltipContent(field.name);
        if (entry.key !== key) { entry.key = key; entry.geometry = field.geometry; resetShape(entry); }
      }
    }
    for (const [id, entry] of current) if (!seen.has(id)) { entry.layer.remove(); current.delete(id); }

    async function handleEdit(fieldId: string) {
      const entry = current.get(fieldId); if (!entry) return;
      const geometry = layerToPolygon(entry.layer);
      if (!geometry) { resetShape(entry); return; }
      const previous = { key: entry.key, geometry: entry.geometry };
      // Record the new shape up front so the refreshed props that follow a save don't reset it mid-edit.
      entry.key = geometryKey(geometry); entry.geometry = geometry;
      const saved = await handlers.current.onGeometryEdited(fieldId, geometry);
      if (!saved) { entry.key = previous.key; entry.geometry = previous.geometry; resetShape(entry); }
    }

    async function handleRemove(fieldId: string) {
      const entry = current.get(fieldId); if (!entry) return;
      const removed = await handlers.current.onRemoveRequested(fieldId);
      if (!removed && current.get(fieldId) === entry) entry.layer.addTo(map);
    }
  }, [fields, map]);

  // Style from conflict/selection state; kept separate so style changes never touch geometry.
  useEffect(() => {
    for (const [id, { layer }] of entries.current) {
      layer.setStyle(fieldPathStyle({ conflict: conflictingFieldIds.has(id), selected: id === selectedFieldId }));
    }
    if (selectedFieldId) entries.current.get(selectedFieldId)?.layer.bringToFront();
  }, [fields, conflictingFieldIds, selectedFieldId]);

  return null;
}

/** Puts a layer back to its stored geometry, refreshing Geoman's vertex handles if it is being edited. */
function resetShape(entry: Entry) {
  const editing = entry.layer.pm?.enabled();
  if (editing) entry.layer.pm.disable();
  entry.layer.setLatLngs(polygonToLatLngs(entry.geometry));
  if (editing) entry.layer.pm.enable();
}
