import type { Field } from "../../types";

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

export function FieldMap(props: FieldMapProps) {
  return <div className="map-placeholder" aria-label="Field map placeholder" data-field-count={props.fields.length}>Map and field drawing will appear here.</div>;
}
