import { useMemo, useState, type FormEvent } from "react";
import { permitSchema } from "../../config/permitSchema";
import { formatDays, formatTimeRange, describeConflict } from "../calendar/calendarModel";
import { isValidTimeRange } from "../../logic/time";
import type { Conflict, Field, Json, Permit } from "../../types";
import "./sidebar.css";

interface PermitSidebarProps {
  field: Field | null;
  fields: Field[];
  permits: Permit[];
  conflictsByPermit: ReadonlyMap<string, Conflict[]>;
  editMode: boolean;
  onToggleEdit: () => void;
  onClose: () => void;
  onExpandCalendar: () => void;
  onSavePermit: (permit: Permit) => Promise<void>;
  onDeletePermit: (permitId: string) => Promise<void>;
}

const DAY_OPTIONS = [
  { value: 1, label: "Mon" }, { value: 2, label: "Tue" }, { value: 3, label: "Wed" },
  { value: 4, label: "Thu" }, { value: 5, label: "Fri" }, { value: 6, label: "Sat" }, { value: 0, label: "Sun" },
];

export function PermitSidebar(props: PermitSidebarProps) {
  const { field, fields, permits, conflictsByPermit, editMode, onToggleEdit, onClose, onExpandCalendar, onSavePermit, onDeletePermit } = props;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const fieldNames = useMemo(() => new Map(fields.map((item) => [item.id, item.name])), [fields]);
  const groups = useMemo(() => {
    const result = new Map<string, Permit[]>();
    for (const permit of permits) result.set(permit.organization, [...(result.get(permit.organization) ?? []), permit]);
    return [...result].sort(([a], [b]) => a.localeCompare(b));
  }, [permits]);

  async function remove(permit: Permit) {
    if (!window.confirm(`Delete ${permit.organization}'s permit for ${field?.name ?? "this field"}?`)) return;
    setActionError(null);
    try { await onDeletePermit(permit.id); }
    catch (error) { setActionError(error instanceof Error ? error.message : String(error)); }
  }

  return (
    <aside className={`permit-sidebar${field ? " is-open" : ""}`} aria-label="Field permits" aria-hidden={!field} inert={!field}>
      {field && <>
        <header className="permit-sidebar__header">
          <div><h2>{field.name}</h2><p>{field.field_type}</p></div>
          <button type="button" aria-label="Close sidebar" onClick={onClose}>×</button>
        </header>
        <div className="permit-sidebar__toolbar">
          <button type="button" onClick={onExpandCalendar}>Expand to calendar</button>
          <button type="button" aria-pressed={editMode} className={editMode ? "primary" : ""} onClick={onToggleEdit}>{editMode ? "Done editing" : "Edit permits"}</button>
        </div>
        {actionError && <p className="permit-sidebar__error" role="alert">{actionError}</p>}
        <div className="permit-sidebar__content">
          {groups.length === 0 && <p className="muted">No permits assigned to this field yet.</p>}
          {groups.map(([organization, organizationPermits]) => <section className="permit-group" key={organization}>
            <h3>{organization}</h3>
            {organizationPermits.map((permit) => editingId === permit.id && editMode
              ? <PermitEditor key={permit.id} permit={permit} fields={fields} onCancel={() => setEditingId(null)} onSave={async (updated) => { await onSavePermit(updated); setEditingId(null); }} />
              : <article className={`permit-card${conflictsByPermit.get(permit.id)?.length ? " has-conflict" : ""}`} key={permit.id}>
                <strong>{formatTimeRange(permit.start_time, permit.end_time)}</strong>
                <span>{formatDays(permit.days)}</span>
                {permit.notes && <p>{permit.notes}</p>}
                {permitSchema.filter((attribute) => attribute.showInSidebar && permit.extra[attribute.key] !== undefined && permit.extra[attribute.key] !== null && permit.extra[attribute.key] !== "").map((attribute) => <p key={attribute.key}><span className="permit-card__label">{attribute.label}:</span> {String(permit.extra[attribute.key])}</p>)}
                {!!conflictsByPermit.get(permit.id)?.length && <ul className="permit-conflict-list">{conflictsByPermit.get(permit.id)!.map((conflict) => <li key={conflict.conflicts_with.id}>{describeConflict(conflict, (id) => id ? fieldNames.get(id) ?? "another field" : "unassigned field")}</li>)}</ul>}
                {editMode && <div className="permit-card__actions"><button type="button" onClick={() => setEditingId(permit.id)}>Edit</button><button type="button" className="danger-button" onClick={() => void remove(permit)}>Delete</button></div>}
              </article>)}
          </section>)}
        </div>
      </>}
    </aside>
  );
}

function PermitEditor({ permit, fields, onCancel, onSave }: { permit: Permit; fields: Field[]; onCancel: () => void; onSave: (permit: Permit) => Promise<void> }) {
  const [draft, setDraft] = useState(permit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  function setExtra(key: string, value: Json | undefined) {
    const extra = { ...draft.extra };
    if (value === undefined || value === "") delete extra[key];
    else extra[key] = value;
    setDraft({ ...draft, extra });
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(null);
    if (!draft.days.length) { setError("Choose at least one day."); return; }
    if (!isValidTimeRange(draft.start_time, draft.end_time)) { setError("End time must be after start time."); return; }
    setSaving(true);
    try { await onSave(draft); }
    catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setSaving(false); }
  }
  return <form className="permit-editor" onSubmit={(event) => void submit(event)}>
    <label>Field<select value={draft.field_id ?? ""} onChange={(event) => setDraft({ ...draft, field_id: event.target.value || null })}><option value="">Broken / unassigned</option>{fields.map((field) => <option value={field.id} key={field.id}>{field.name}</option>)}</select></label>
    <div className="permit-editor__times"><label>Start<input type="time" step={900} value={draft.start_time.slice(0, 5)} onChange={(event) => setDraft({ ...draft, start_time: event.target.value })} required /></label><label>End<input type="time" step={900} value={draft.end_time.slice(0, 5)} onChange={(event) => setDraft({ ...draft, end_time: event.target.value })} required /></label></div>
    <fieldset><legend>Days</legend><div className="permit-editor__days">{DAY_OPTIONS.map((day) => <label key={day.value}><input type="checkbox" checked={draft.days.includes(day.value)} onChange={(event) => setDraft({ ...draft, days: event.target.checked ? [...draft.days, day.value] : draft.days.filter((value) => value !== day.value) })} />{day.label}</label>)}</div></fieldset>
    <label>Notes<textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} rows={2} /></label>
    {permitSchema.filter((attribute) => attribute.editable).map((attribute) => <label key={attribute.key}>{attribute.label}{attribute.type === "select" ? <select required={attribute.required} value={draft.extra[attribute.key] == null ? "" : String(draft.extra[attribute.key])} onChange={(event) => setExtra(attribute.key, event.target.value || undefined)}><option value="">Choose…</option>{attribute.options?.map((option) => <option key={option}>{option}</option>)}</select> : attribute.type === "longtext" ? <textarea required={attribute.required} value={draft.extra[attribute.key] == null ? "" : String(draft.extra[attribute.key])} onChange={(event) => setExtra(attribute.key, event.target.value)} /> : <input type={attribute.type === "number" ? "number" : "text"} required={attribute.required} value={draft.extra[attribute.key] == null ? "" : String(draft.extra[attribute.key])} onChange={(event) => setExtra(attribute.key, attribute.type === "number" && event.target.value ? Number(event.target.value) : event.target.value)} />}</label>)}
    {error && <p className="permit-sidebar__error" role="alert">{error}</p>}
    <div className="permit-editor__actions"><button type="button" onClick={onCancel} disabled={saving}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Saving…" : "Save"}</button></div>
  </form>;
}
