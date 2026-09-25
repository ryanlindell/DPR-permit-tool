import { useEffect, useId, useMemo, useState } from "react";
import type { Field, Permit } from "../../types";
import { normalizeName } from "../../logic/matching";
import { formatTime12h } from "../../import/parse";
import { suggestField } from "../../import/suggest";
import "./permits.css";

/** Contract for assigning unmatched active-version permit rows to existing physical fields. */
export interface BrokenPermitsDialogProps {
  /** Only permits with a null field_id should be passed. */
  permits: Permit[];
  fields: Field[];
  onClose: () => void;
  /** Assign one permit or all broken permits with the same normalized raw field name. */
  onAssign: (permitId: string, fieldId: string, applyToMatchingRawNames: boolean) => Promise<void>;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Show days Monday-first, matching the spreadsheet. */
const formatDays = (days: number[]) => [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => DAY_NAMES[d]).join(", ");

export function BrokenPermitsDialog({ permits, fields, onClose, onAssign }: BrokenPermitsDialogProps) {
  const titleId = useId();
  const sortedFields = useMemo(() => [...fields].sort((a, b) => a.name.localeCompare(b.name)), [fields]);
  const rawNameCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const permit of permits) counts.set(normalizeName(permit.raw_field_name), (counts.get(normalizeName(permit.raw_field_name)) ?? 0) + 1);
    return counts;
  }, [permits]);
  const sortedPermits = useMemo(() => [...permits].sort((a, b) =>
    normalizeName(a.raw_field_name).localeCompare(normalizeName(b.raw_field_name)) || a.organization.localeCompare(b.organization) || a.start_time.localeCompare(b.start_time)), [permits]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="permit-dialog permit-dialog-wide" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(event) => event.stopPropagation()}>
        <header className="permit-dialog-header">
          <h2 id={titleId}>Broken permits ({permits.length})</h2>
          <button className="icon-button" aria-label="Close" onClick={onClose}>×</button>
        </header>
        {permits.length === 0 ? (
          <p>Every permit is matched to a field. Nothing to fix.</p>
        ) : (
          <>
            <p className="muted">These permits name a field that isn't on the map, usually a typo. Pick the field each one belongs to.{fields.length === 0 && " Draw your fields on the map first."}</p>
            <ul className="broken-list">
              {sortedPermits.map((permit) => (
                <BrokenPermitRow key={permit.id} permit={permit} fields={sortedFields} sameNameCount={rawNameCounts.get(normalizeName(permit.raw_field_name)) ?? 1} onAssign={onAssign} />
              ))}
            </ul>
          </>
        )}
        <footer className="permit-dialog-footer"><button onClick={onClose}>Close</button></footer>
      </section>
    </div>
  );
}

function BrokenPermitRow({ permit, fields, sameNameCount, onAssign }: { permit: Permit; fields: Field[]; sameNameCount: number; onAssign: BrokenPermitsDialogProps["onAssign"] }) {
  const [fieldId, setFieldId] = useState(() => suggestField(permit.raw_field_name, fields)?.id ?? "");
  const [applyToAll, setApplyToAll] = useState(sameNameCount > 1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectId = useId();

  async function assign() {
    if (!fieldId) return;
    setSaving(true);
    setError(null);
    try {
      await onAssign(permit.id, fieldId, applyToAll && sameNameCount > 1);
      // On success the parent drops this permit from the list, which unmounts the row.
    } catch (caught) {
      setError(`Could not save: ${caught instanceof Error ? caught.message : String(caught)}`);
      setSaving(false);
    }
  }

  return (
    <li className="broken-row">
      <div className="broken-details">
        <strong>{permit.organization}</strong>
        <span>{formatDays(permit.days)} · {formatTime12h(permit.start_time)} to {formatTime12h(permit.end_time)}</span>
        <span>Field in file: <mark>{permit.raw_field_name || "(blank)"}</mark></span>
      </div>
      <div className="broken-actions">
        <label htmlFor={selectId} className="visually-hidden">Field for {permit.organization}</label>
        <select id={selectId} value={fieldId} onChange={(event) => setFieldId(event.target.value)} disabled={saving || fields.length === 0}>
          <option value="">Choose a field…</option>
          {fields.map((field) => <option key={field.id} value={field.id}>{field.name}</option>)}
        </select>
        <button className="primary" onClick={() => void assign()} disabled={!fieldId || saving}>{saving ? "Saving…" : "Assign"}</button>
        {sameNameCount > 1 && (
          <label className="apply-all">
            <input type="checkbox" checked={applyToAll} onChange={(event) => setApplyToAll(event.target.checked)} disabled={saving} />
            Apply to all {sameNameCount} permits with "{permit.raw_field_name}"
          </label>
        )}
        {error && <p className="error" role="alert">{error}</p>}
      </div>
    </li>
  );
}
