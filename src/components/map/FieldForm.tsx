import { useState, type FormEvent } from "react";
import { fieldTypes } from "../../config/fieldTypes";
import type { Field } from "../../types";
import { cleanFieldName, fieldNameError } from "./fieldValidation";

export interface FieldFormValues { name: string; field_type: string; notes: string }

interface FieldFormProps {
  /** Title shown at the top of the dialog. */
  title: string;
  initial: FieldFormValues;
  /** Existing fields, for the unique-name check. */
  fields: readonly Pick<Field, "id" | "name">[];
  /** Set when editing so the field may keep its own name. */
  editingId?: string;
  /** Resolves with an error message to show, or null when saved. */
  onSubmit: (values: FieldFormValues) => Promise<string | null>;
  onCancel: () => void;
}

/** Modal form for a field's name, type, and notes, used both after drawing and for later edits. */
export function FieldForm({ title, initial, fields, editingId, onSubmit, onCancel }: FieldFormProps) {
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const nameProblem = fieldNameError(values.name, fields, editingId);
    if (nameProblem) { setError(nameProblem); return; }
    setSaving(true); setError(null);
    const problem = await onSubmit({ ...values, name: cleanFieldName(values.name), notes: values.notes.trim() });
    setSaving(false);
    if (problem) setError(problem);
  }

  return (
    <div className="modal-backdrop" role="presentation" onKeyDown={(e) => { if (e.key === "Escape" && !saving) onCancel(); }}>
      <form className="field-form" role="dialog" aria-modal="true" aria-labelledby="field-form-title" onSubmit={(e) => void submit(e)}>
        <h2 id="field-form-title">{title}</h2>
        <label>Name
          <input autoFocus required value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} placeholder="e.g. Field A" />
        </label>
        <label>Field type
          <select value={values.field_type} onChange={(e) => setValues({ ...values, field_type: e.target.value })}>
            {fieldTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            {!fieldTypes.includes(values.field_type as (typeof fieldTypes)[number]) && <option value={values.field_type}>{values.field_type}</option>}
          </select>
        </label>
        <label>Notes
          <textarea rows={3} value={values.notes} onChange={(e) => setValues({ ...values, notes: e.target.value })} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="field-form-actions">
          <button type="button" onClick={onCancel} disabled={saving}>Cancel</button>
          <button type="submit" className="primary" disabled={saving}>{saving ? "Saving…" : "Save field"}</button>
        </div>
      </form>
    </div>
  );
}
