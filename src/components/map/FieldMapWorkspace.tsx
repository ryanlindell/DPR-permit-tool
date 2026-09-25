import { useEffect, useState } from "react";
import { FieldMap } from "./FieldMap";
import { useFieldMapData } from "./useFieldMapData";

const noConflicts: ReadonlySet<string> = new Set();

/**
 * Phase 1A stand-in that connects FieldMap to real data so fields can be drawn and persisted
 * before integration. Phase 2 replaces the local edit toggle with canEdit() and supplies live
 * conflicting field ids and the sidebar.
 */
export function FieldMapWorkspace() {
  const { fields, settings, loading, loadError, reload, handleGeometryChange, saveHomeView } = useFieldMapData();
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  if (loadError) {
    return <div className="field-map-loading" role="alert"><span className="error">Could not load your fields: {loadError}</span><button onClick={() => void reload()}>Try again</button></div>;
  }
  if (loading || !settings) return <div className="field-map-loading" role="status">Loading fields…</div>;

  return (
    <>
      <FieldMap
        fields={fields}
        conflictingFieldIds={noConflicts}
        selectedFieldId={selectedFieldId}
        editable={editing}
        onFieldSelect={setSelectedFieldId}
        homeCenter={settings.home_center}
        homeZoom={settings.home_zoom}
        onHomeViewChange={(center, zoom) => {
          saveHomeView(center, zoom).then(() => setNotice("Home view saved."), (error: unknown) => setNotice(`Could not save home view: ${(error as { message?: string })?.message ?? "unknown error"}`));
        }}
        onGeometryChange={handleGeometryChange}
      />
      <div className="field-map-workspace-bar">
        {notice && <span className="notice" role="status">{notice}</span>}
        <button type="button" className={editing ? "primary" : undefined} aria-pressed={editing} onClick={() => setEditing((on) => !on)}>
          {editing ? "Done editing fields" : "Edit fields"}
        </button>
      </div>
    </>
  );
}
