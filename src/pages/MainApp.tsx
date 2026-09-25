import type { User } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FieldMap } from "../components/map/FieldMap";
import { PermitCalendar } from "../components/calendar/PermitCalendar";
import { PermitSidebar } from "../components/sidebar/PermitSidebar";
import { PermitImportToolbar } from "../components/permits/PermitImportToolbar";
import { computeConflicts } from "../logic/conflicts";
import { canEdit, describeBrowser, editLock } from "../data/lock";
import { useEditLock } from "../components/lock/useEditLock";
import { EditLockBanner } from "../components/lock/EditLockBanner";
import { SettingsDialog } from "../components/settings/SettingsDialog";
import { deletePermit, listPermits, updatePermit } from "../data/permits";
import { listFields, listFieldOverlaps } from "../data/fields";
import { getSettings, updateSettings } from "../data/settings";
import { listVersions } from "../data/versions";
import { requireSupabase } from "../data/supabaseClient";
import { syncOverlapsForField } from "../components/map/overlapSync";
import type { AccountSettings, Field, FieldOverlap, Permit, Version } from "../types";

export function MainApp({ user }: { user: User }) {
  const [fields, setFields] = useState<Field[]>([]);
  const [overlaps, setOverlaps] = useState<FieldOverlap[]>([]);
  const [permits, setPermits] = useState<Permit[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [settings, setSettings] = useState<AccountSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  // Edit mode is holding the account's edit lock (SPEC 6.3); canEdit() reads the same state.
  const lock = useEditLock(describeBrowser(navigator.userAgent));
  const editMode = lock.mode === "editing";
  const toggleEdit = useCallback(() => { void (editLock.getState().mode === "editing" ? editLock.stopEditing() : editLock.requestEdit()); }, []);
  const [showSettings, setShowSettings] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const username = String(user.user_metadata.username ?? user.email?.split("@")[0] ?? "Account");

  const reloadWorkspace = useCallback(async () => {
    setPageError(null);
    try {
      const nextSettings = await getSettings();
      const [nextFields, nextOverlaps, nextVersions] = await Promise.all([listFields(), listFieldOverlaps(), listVersions()]);
      const activeVersion = nextVersions.find((version) => version.id === nextSettings.active_version_id);
      if (!activeVersion) throw new Error("The active schedule version could not be found.");
      const nextPermits = await listPermits(activeVersion.id);
      setSettings(nextSettings);
      setFields(nextFields);
      setOverlaps(nextOverlaps);
      setVersions(nextVersions);
      setPermits(nextPermits);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setPageError(`Could not load the schedule: ${message}`);
      throw caught;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reloadWorkspace().catch(() => undefined); }, [reloadWorkspace]);

  const activeVersion = versions.find((version) => version.id === settings?.active_version_id) ?? null;
  const selectedField = fields.find((field) => field.id === selectedFieldId) ?? null;
  const conflictsByPermit = useMemo(() => computeConflicts(permits, overlaps), [permits, overlaps]);
  const conflictingFieldIds = useMemo(() => {
    const ids = new Set<string>();
    const permitsById = new Map(permits.map((permit) => [permit.id, permit]));
    for (const [permitId, conflicts] of conflictsByPermit) {
      if (!conflicts.length) continue;
      const permit = permitsById.get(permitId);
      if (permit?.field_id) ids.add(permit.field_id);
      for (const conflict of conflicts) if (conflict.conflicts_with.field_id) ids.add(conflict.conflicts_with.field_id);
    }
    return ids;
  }, [conflictsByPermit, permits]);
  const sidebarPermits = selectedFieldId ? permits.filter((permit) => permit.field_id === selectedFieldId) : [];
  const calendarFieldIds = useMemo(() => {
    if (!selectedFieldId) return new Set<string>();
    const ids = new Set([selectedFieldId]);
    for (const overlap of overlaps) {
      if (overlap.field_a === selectedFieldId) ids.add(overlap.field_b);
      if (overlap.field_b === selectedFieldId) ids.add(overlap.field_a);
    }
    return ids;
  }, [overlaps, selectedFieldId]);
  const calendarFields = fields.filter((field) => calendarFieldIds.has(field.id));
  const calendarPermits = permits.filter((permit) => permit.field_id !== null && calendarFieldIds.has(permit.field_id));
  const calendarConflictIds = new Set(calendarPermits.filter((permit) => conflictsByPermit.get(permit.id)?.length).map((permit) => permit.id));

  async function handleGeometryChange(fieldId: string, geometry: Field["geometry"] | null) {
    await syncOverlapsForField(fieldId, geometry);
    await reloadWorkspace();
  }

  async function saveHomeView(center: { lat: number; lng: number }, zoom: number) {
    const saved = await updateSettings({ home_center: center, home_zoom: zoom });
    setSettings(saved);
  }

  async function savePermitOptimistically(updated: Permit) {
    const previous = permits.find((permit) => permit.id === updated.id);
    if (!previous) throw new Error("This permit is no longer in the active schedule. Refresh and try again.");
    setPermits((current) => current.map((permit) => permit.id === updated.id ? updated : permit));
    try {
      const saved = await updatePermit(updated.id, {
        field_id: updated.field_id,
        start_time: updated.start_time,
        end_time: updated.end_time,
        days: updated.days,
        notes: updated.notes,
        extra: updated.extra,
      });
      setPermits((current) => current.map((permit) => permit.id === saved.id ? saved : permit));
    } catch (error) {
      setPermits((current) => current.map((permit) => permit.id === previous.id ? previous : permit));
      throw error;
    }
  }

  async function deletePermitOptimistically(permitId: string) {
    const previous = permits.find((permit) => permit.id === permitId);
    if (!previous) return;
    setPermits((current) => current.filter((permit) => permit.id !== permitId));
    try { await deletePermit(permitId); }
    catch (error) {
      setPermits((current) => current.some((permit) => permit.id === permitId) ? current : [...current, previous].sort((a, b) => a.start_time.localeCompare(b.start_time)));
      throw error;
    }
  }

  if (loading) return <main className="loading" role="status">Loading your schedule…</main>;
  if (pageError || !settings || !activeVersion) return <main className="workspace-error" role="alert"><h1>Schedule unavailable</h1><p>{pageError ?? "Your active schedule could not be loaded."}</p><button onClick={() => { setLoading(true); void reloadWorkspace().catch(() => undefined); }}>Try again</button></main>;

  return <div className="app-shell">
    <header className="topbar">
      <strong>Field Permit Scheduler</strong>
      <span className="account-name">{username}</span>
      <button disabled title="Version management is coming in Phase 3A">Version: {activeVersion.name}</button>
      <button type="button" className={editMode ? "primary" : ""} aria-pressed={editMode} onClick={toggleEdit} disabled={lock.mode === "acquiring"}>{lock.mode === "acquiring" ? "Starting…" : editMode ? "Done editing" : "Edit mode"}</button>
      <PermitImportToolbar fields={fields} permits={permits} activeVersion={activeVersion} onChanged={reloadWorkspace} />
      <button onClick={() => setShowExport(true)}>Export</button>
      <button onClick={() => setShowSettings(true)}>Settings</button>
      <button onClick={() => void requireSupabase().auth.signOut()}>Sign out</button>
    </header>
    <EditLockBanner state={lock} />
    <main className="workspace">
      {actionError && <div className="workspace-notice" role="alert">{actionError}<button type="button" onClick={() => setActionError(null)}>Dismiss</button></div>}
      <FieldMap
        fields={fields}
        conflictingFieldIds={conflictingFieldIds}
        selectedFieldId={selectedField?.id ?? null}
        editable={canEdit() && editMode}
        onFieldSelect={setSelectedFieldId}
        homeCenter={settings.home_center}
        homeZoom={settings.home_zoom}
        onHomeViewChange={(center, zoom) => { void saveHomeView(center, zoom).then(() => setActionError(null), (error: unknown) => setActionError(`Could not save the home view: ${error instanceof Error ? error.message : String(error)}`)); }}
        onGeometryChange={handleGeometryChange}
      />
      <PermitSidebar
        field={selectedField}
        fields={fields}
        permits={sidebarPermits}
        conflictsByPermit={conflictsByPermit}
        editMode={editMode}
        onToggleEdit={toggleEdit}
        onClose={() => setSelectedFieldId(null)}
        onExpandCalendar={() => setShowCalendar(true)}
        onSavePermit={savePermitOptimistically}
        onDeletePermit={deletePermitOptimistically}
      />
      {showCalendar && selectedField && <PermitCalendar
        permits={calendarPermits}
        fields={calendarFields}
        selectedFieldId={selectedField.id}
        conflictingPermitIds={calendarConflictIds}
        conflictsByPermit={conflictsByPermit}
        editable={canEdit() && editMode}
        onBack={() => setShowCalendar(false)}
        onToggleEdit={toggleEdit}
        onPermitChange={savePermitOptimistically}
      />}
    </main>
    {showSettings && <SettingsDialog settings={settings} onSettingsChange={setSettings} onClose={() => setShowSettings(false)} />}
    {showExport && <div className="modal-backdrop" role="presentation" onClick={() => setShowExport(false)}><section className="export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-title" onClick={(event) => event.stopPropagation()}><h2 id="export-title">Export</h2><p>Export formats are coming soon.</p><button onClick={() => setShowExport(false)}>Close</button></section></div>}
  </div>;
}
