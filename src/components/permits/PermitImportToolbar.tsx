import { useCallback, useEffect, useState } from "react";
import type { Field, Permit, Version } from "../../types";
import { listFields } from "../../data/fields";
import { assignPermitsToField, createPermits, listPermits } from "../../data/permits";
import { getSettings } from "../../data/settings";
import { listVersions } from "../../data/versions";
import { normalizeName } from "../../logic/matching";
import { downloadTemplate } from "../../import/template";
import { BrokenPermitsDialog } from "./BrokenPermitsDialog";
import { ImportDialog, type ImportSummary } from "./ImportDialog";
import "./permits.css";

/**
 * Top-bar buttons for Import, Download template, and Broken permits (N).
 *
 * Phase 1B stopgap: this loads its own fields and active-version permits so the importer
 * works before Phase 2 lifts that state into MainApp. Phase 2 should pass the shared app
 * state down instead of loading here (and call its own refresh after onChanged).
 */
export function PermitImportToolbar({ onChanged }: { onChanged?: () => void }) {
  const [fields, setFields] = useState<Field[]>([]);
  const [permits, setPermits] = useState<Permit[]>([]);
  const [activeVersion, setActiveVersion] = useState<Version | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"import" | "broken" | null>(null);
  const [downloading, setDownloading] = useState(false);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const [settings, versions, loadedFields] = await Promise.all([getSettings(), listVersions(), listFields()]);
      const version = versions.find((v) => v.id === settings.active_version_id) ?? null;
      if (!version) throw new Error("The active version could not be found.");
      setFields(loadedFields);
      setActiveVersion(version);
      setPermits(await listPermits(version.id));
    } catch (caught) {
      setError(`Could not load permits: ${caught instanceof Error ? caught.message : String(caught)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const broken = permits.filter((permit) => permit.field_id === null);

  async function handleImported(newPermits: Parameters<typeof createPermits>[0]): Promise<ImportSummary> {
    const saved = await createPermits(newPermits);
    await reload();
    onChanged?.();
    return { added: saved.length, duplicates: 0, broken: saved.filter((p) => p.field_id === null).length, rejected: 0 };
  }

  async function handleAssign(permitId: string, fieldId: string, applyToMatchingRawNames: boolean) {
    const target = broken.find((permit) => permit.id === permitId);
    const ids = applyToMatchingRawNames && target
      ? broken.filter((permit) => normalizeName(permit.raw_field_name) === normalizeName(target.raw_field_name)).map((permit) => permit.id)
      : [permitId];
    await assignPermitsToField(ids, fieldId);
    await reload();
    onChanged?.();
  }

  async function handleTemplate() {
    setDownloading(true);
    setError(null);
    try {
      // Refresh fields first so the dropdown includes anything drawn since the page loaded.
      const latest = await listFields();
      setFields(latest);
      await downloadTemplate(latest.map((field) => field.name));
    } catch (caught) {
      setError(`Could not create the template: ${caught instanceof Error ? caught.message : String(caught)}`);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <>
      <button onClick={() => { void reload(); setDialog("import"); }} disabled={loading || !activeVersion}>Import</button>
      <button onClick={() => void handleTemplate()} disabled={downloading}>{downloading ? "Preparing…" : "Download template"}</button>
      {broken.length > 0 && <button className="broken-button" onClick={() => setDialog("broken")}>Broken permits ({broken.length})</button>}
      {error && <span className="toolbar-error" role="alert" title={error}>{error} <button className="link-button" onClick={() => void reload()}>Retry</button></span>}
      {activeVersion && (
        <ImportDialog open={dialog === "import"} fields={fields} activeVersion={activeVersion} existingPermits={permits} onClose={() => setDialog(null)} onImported={handleImported} />
      )}
      {dialog === "broken" && <BrokenPermitsDialog permits={broken} fields={fields} onClose={() => setDialog(null)} onAssign={handleAssign} />}
    </>
  );
}
