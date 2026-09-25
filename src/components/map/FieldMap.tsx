import "leaflet/dist/leaflet.css";
import "./leafletGlobal"; // must precede Geoman
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import "./fieldMap.css";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Layer, Map as LeafletMap } from "leaflet";
import { MapContainer, TileLayer } from "react-leaflet";
import type { Field, GeoJsonPolygon } from "../../types";
import { deleteField, saveField } from "../../data/fields";
import { FieldForm, type FieldFormValues } from "./FieldForm";
import { FieldLayers } from "./FieldLayers";
import { DrawingTools, HomeViewSync, MapClickDeselect } from "./MapTools";
import { layerToPolygon } from "./leafletGeometry";
import { isDuplicateNameError } from "./fieldValidation";

/** Contract for the interactive map. Owns map rendering only; persistence remains in MainApp/data. */
export interface FieldMapProps {
  /** Physical fields to display, independent of the active schedule version. */
  fields: Field[];
  /** Field IDs with one or more permit conflicts; use conflict color and dashed emphasis. */
  conflictingFieldIds: ReadonlySet<string>;
  /** Currently selected field, or null when the sidebar is closed. */
  selectedFieldId: string | null;
  /** False for public share view; disables geometry/name editing controls. */
  editable: boolean;
  /** Called on map click or field deselection with null, and with the ID on field click. */
  onFieldSelect: (fieldId: string | null) => void;
  /** Saved map center, loaded from account settings. */
  homeCenter: { lat: number; lng: number };
  /** Saved map zoom, loaded from account settings. */
  homeZoom: number;
  /** Persist the current viewport when the user selects Set home view. */
  onHomeViewChange: (center: { lat: number; lng: number }, zoom: number) => void;
  /** Requests fresh overlap pairs after the indicated field geometry is changed or removed. */
  onGeometryChange: (fieldId: string, geometry: Field["geometry"] | null) => Promise<void>;
}

const ESRI_IMAGERY_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_ATTRIBUTION = "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community";

type Dialog = { kind: "create"; geometry: GeoJsonPolygon } | { kind: "edit"; field: Field };

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) return String((error as { message: unknown }).message);
  return "Something went wrong.";
}

/**
 * Satellite map of the account's fields. In edit mode it provides Geoman drawing tools and
 * saves every change through src/data immediately. After each saved change it calls
 * onGeometryChange so the parent can refresh overlaps and the field list; property-only edits
 * (name/type/notes) pass the field's unchanged geometry for the same reason.
 */
export function FieldMap(props: FieldMapProps) {
  const { fields, conflictingFieldIds, selectedFieldId, editable, onFieldSelect, homeCenter, homeZoom, onHomeViewChange, onGeometryChange } = props;
  const [map, setMap] = useState<LeafletMap | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const draftLayer = useRef<Layer | null>(null);
  // Saves run one at a time so quick successive edits can't land out of order.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const latest = useRef({ fields, onGeometryChange, onFieldSelect, selectedFieldId });
  useEffect(() => { latest.current = { fields, onGeometryChange, onFieldSelect, selectedFieldId }; });

  const findField = (id: string) => latest.current.fields.find((field) => field.id === id);

  /** Runs one save step; shows a human-readable error and resolves false on failure. */
  const run = useCallback((context: string, action: () => Promise<void>): Promise<boolean> => {
    const task = queue.current.then(async () => {
      setBusy((n) => n + 1);
      try { await action(); return true; } catch (e) { setError(`${context}: ${describeError(e)}`); return false; } finally { setBusy((n) => n - 1); }
    });
    queue.current = task;
    return task;
  }, []);

  const refreshOverlaps = useCallback((fieldId: string, geometry: GeoJsonPolygon | null) =>
    run("Saved, but field overlaps could not be updated (use Recompute all overlaps in Settings)", () => latest.current.onGeometryChange(fieldId, geometry)), [run]);

  // Leaving edit mode closes any open field dialog.
  useEffect(() => { if (!editable) closeDialog(); }, [editable]);

  function closeDialog() {
    draftLayer.current?.remove();
    draftLayer.current = null;
    setDialog(null);
  }

  function handleCreated(layer: Layer) {
    closeDialog();
    const geometry = layerToPolygon(layer);
    if (!geometry) { layer.remove(); setError("That shape could not be used as a field. Draw a polygon with at least three corners."); return; }
    draftLayer.current = layer; // keep the drawn shape visible while the form is open
    setError(null);
    setDialog({ kind: "create", geometry });
  }

  async function submitDialog(values: FieldFormValues): Promise<string | null> {
    if (!dialog) return null;
    const isCreate = dialog.kind === "create";
    const geometry = isCreate ? dialog.geometry : dialog.field.geometry;
    let saved: Field;
    try {
      saved = await saveField({ ...values, geometry }, isCreate ? undefined : dialog.field.id);
    } catch (e) {
      return isDuplicateNameError(e) ? "A field with that name already exists." : `Could not save the field: ${describeError(e)}`;
    }
    closeDialog();
    await refreshOverlaps(saved.id, saved.geometry);
    return null;
  }

  async function handleGeometryEdited(fieldId: string, geometry: GeoJsonPolygon): Promise<boolean> {
    const field = findField(fieldId);
    if (!field) return false;
    const ok = await run(`Could not save the new shape of "${field.name}"`, async () => {
      await saveField({ name: field.name, field_type: field.field_type, notes: field.notes, geometry }, fieldId);
    });
    if (ok) void refreshOverlaps(fieldId, geometry);
    return ok;
  }

  async function handleRemoveRequested(fieldId: string): Promise<boolean> {
    const field = findField(fieldId);
    if (!field) return false;
    const confirmed = window.confirm(`Delete the field "${field.name}"?\n\nIts permits are kept but become broken permits until you assign them to another field.`);
    if (!confirmed) return false;
    const ok = await run(`Could not delete "${field.name}"`, () => deleteField(fieldId));
    if (!ok) return false;
    if (latest.current.selectedFieldId === fieldId) latest.current.onFieldSelect(null);
    void refreshOverlaps(fieldId, null);
    return true;
  }

  const selected = selectedFieldId ? fields.find((field) => field.id === selectedFieldId) ?? null : null;

  return (
    <div className="field-map">
      <MapContainer ref={setMap} center={[homeCenter.lat, homeCenter.lng]} zoom={homeZoom} maxZoom={21} className="field-map-leaflet">
        <TileLayer url={ESRI_IMAGERY_URL} attribution={ESRI_ATTRIBUTION} maxNativeZoom={19} maxZoom={21} />
        <HomeViewSync lat={homeCenter.lat} lng={homeCenter.lng} zoom={homeZoom} />
        <MapClickDeselect onDeselect={() => onFieldSelect(null)} />
        <FieldLayers
          fields={fields}
          conflictingFieldIds={conflictingFieldIds}
          selectedFieldId={selectedFieldId}
          onSelect={onFieldSelect}
          onGeometryEdited={handleGeometryEdited}
          onRemoveRequested={handleRemoveRequested}
        />
        <DrawingTools enabled={editable} onCreated={handleCreated} />
      </MapContainer>

      <div className="field-map-actions">
        <button type="button" disabled={!map} onClick={() => map?.setView([homeCenter.lat, homeCenter.lng], homeZoom)}>Home view</button>
        {editable && (
          <button type="button" disabled={!map} onClick={() => { if (!map) return; const c = map.getCenter(); onHomeViewChange({ lat: c.lat, lng: c.lng }, Math.round(map.getZoom())); }}>
            Set home view
          </button>
        )}
      </div>

      {editable && selected && (
        <section className="field-map-selected" aria-label="Selected field">
          <strong>{selected.name}</strong>
          <span>{selected.field_type}</span>
          {selected.notes && <p>{selected.notes}</p>}
          <button type="button" onClick={() => setDialog({ kind: "edit", field: selected })}>Edit details</button>
        </section>
      )}

      {editable && fields.length === 0 && !dialog && (
        <p className="field-map-hint">Use the polygon or rectangle tool at the top left to draw your first field.</p>
      )}

      {(busy > 0 || error) && (
        <div className="field-map-status" role={error ? "alert" : "status"}>
          {busy > 0 && !error && <span>Saving…</span>}
          {error && <><span className="error">{error}</span><button type="button" onClick={() => setError(null)}>Dismiss</button></>}
        </div>
      )}

      {dialog && (
        <FieldForm
          key={dialog.kind === "edit" ? dialog.field.id : "new"}
          title={dialog.kind === "create" ? "New field" : `Edit ${dialog.field.name}`}
          initial={dialog.kind === "create" ? { name: "", field_type: "Soccer", notes: "" } : { name: dialog.field.name, field_type: dialog.field.field_type, notes: dialog.field.notes }}
          fields={fields}
          editingId={dialog.kind === "edit" ? dialog.field.id : undefined}
          onSubmit={submitDialog}
          onCancel={closeDialog}
        />
      )}
    </div>
  );
}
