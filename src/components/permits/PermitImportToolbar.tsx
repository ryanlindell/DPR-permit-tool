import { useState } from "react";
import type { Field, Permit, Version } from "../../types";
import { assignPermitsToField, createPermits } from "../../data/permits";
import { normalizeName } from "../../logic/matching";
import { downloadTemplate } from "../../import/template";
import { BrokenPermitsDialog } from "./BrokenPermitsDialog";
import { ImportDialog, type ImportSummary } from "./ImportDialog";
import "./permits.css";

/** Import controls use the app's shared active-version data and notify it after a write. */
export function PermitImportToolbar({ fields, permits, activeVersion, onChanged }: {
  fields: Field[];
  permits: Permit[];
  activeVersion: Version;
  onChanged: () => Promise<void>;
}) {
  const [dialog, setDialog] = useState<"import" | "broken" | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const broken = permits.filter((permit) => permit.field_id === null);

  async function handleImported(newPermits: Parameters<typeof createPermits>[0]): Promise<ImportSummary> {
    const saved = await createPermits(newPermits);
    await onChanged();
    return { added: saved.length, duplicates: 0, broken: saved.filter((permit) => permit.field_id === null).length, rejected: 0 };
  }

  async function handleAssign(permitId: string, fieldId: string, applyToMatchingRawNames: boolean) {
    const target = broken.find((permit) => permit.id === permitId);
    const ids = applyToMatchingRawNames && target
      ? broken.filter((permit) => normalizeName(permit.raw_field_name) === normalizeName(target.raw_field_name)).map((permit) => permit.id)
      : [permitId];
    await assignPermitsToField(ids, fieldId);
    await onChanged();
  }

  async function handleTemplate() {
    setDownloading(true); setError(null);
    try { await downloadTemplate(fields.map((field) => field.name)); }
    catch (caught) { setError(`Could not create the template: ${caught instanceof Error ? caught.message : String(caught)}`); }
    finally { setDownloading(false); }
  }

  return <>
    <button onClick={() => setDialog("import")}>Import</button>
    <button onClick={() => void handleTemplate()} disabled={downloading}>{downloading ? "Preparing…" : "Download template"}</button>
    {broken.length > 0 && <button className="broken-button" onClick={() => setDialog("broken")}>Broken permits ({broken.length})</button>}
    {error && <span className="toolbar-error" role="alert" title={error}>{error}</span>}
    <ImportDialog open={dialog === "import"} fields={fields} activeVersion={activeVersion} existingPermits={permits} onClose={() => setDialog(null)} onImported={handleImported} />
    {dialog === "broken" && <BrokenPermitsDialog permits={broken} fields={fields} onClose={() => setDialog(null)} onAssign={handleAssign} />}
  </>;
}
