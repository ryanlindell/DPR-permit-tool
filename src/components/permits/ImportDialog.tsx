import { useEffect, useId, useRef, useState } from "react";
import type { Field, Permit, Version } from "../../types";
import { ImportFileError, formatTime12h, parsePermitWorkbook } from "../../import/parse";
import { planImport, type ImportReport } from "../../import/plan";
import { downloadTemplate } from "../../import/template";
import "./permits.css";

/** Inputs needed to parse, deduplicate, and save an Excel import to the active version. */
export interface ImportSummary {
  added: number;
  duplicates: number;
  broken: number;
  rejected: number;
  outOfHours?: number;
  rejectedRows?: Array<{ row: number; reason: string }>;
}

export interface ImportDialogProps {
  open: boolean;
  fields: Field[];
  activeVersion: Version;
  /** Existing active-version permits provide the duplicate comparison set. */
  existingPermits: Permit[];
  onClose: () => void;
  /** Resolve after persisted import so app state can reload; return summary counts. */
  onImported: (newPermits: Omit<Permit, "id" | "owner_id" | "created_at" | "updated_at">[]) => Promise<ImportSummary>;
}

/** The dialog walks through: choose a file, preview what will happen, save, show the result. */
type Step =
  | { name: "choose" }
  | { name: "reading"; fileName: string }
  | { name: "preview"; fileName: string; report: ImportReport }
  | { name: "saving"; fileName: string; report: ImportReport }
  | { name: "done"; fileName: string; report: ImportReport; added: number };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const rowList = (rows: number[]) => rows.length > 12 ? `${rows.slice(0, 12).join(", ")} and ${rows.length - 12} more` : rows.join(", ");
const messageOf = (caught: unknown) => caught instanceof Error ? caught.message : String(caught);

export function ImportDialog({ open, fields, activeVersion, existingPermits, onClose, onImported }: ImportDialogProps) {
  const [step, setStep] = useState<Step>({ name: "choose" });
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const busy = step.name === "reading" || step.name === "saving";

  useEffect(() => { if (open) { setStep({ name: "choose" }); setError(null); } }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  async function readFile(file: File) {
    setError(null);
    setStep({ name: "reading", fileName: file.name });
    try {
      const parsed = await parsePermitWorkbook(await file.arrayBuffer());
      const report = planImport(parsed, { existingPermits, fields, versionId: activeVersion.id, importBatchId: crypto.randomUUID() });
      setStep({ name: "preview", fileName: file.name, report });
    } catch (caught) {
      setError(caught instanceof ImportFileError ? caught.message : `The file could not be read: ${messageOf(caught)}`);
      setStep({ name: "choose" });
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function save() {
    if (step.name !== "preview") return;
    setError(null);
    setStep({ ...step, name: "saving" });
    try {
      const result = await onImported(step.report.toInsert);
      setStep({ name: "done", fileName: step.fileName, report: step.report, added: result.added });
    } catch (caught) {
      setError(`Nothing was imported. The server said: ${messageOf(caught)}`);
      setStep({ ...step, name: "preview" });
    }
  }

  async function template() {
    setError(null);
    try { await downloadTemplate(fields.map((field) => field.name)); }
    catch (caught) { setError(`The template could not be created: ${messageOf(caught)}`); }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={() => { if (!busy) onClose(); }}>
      <section className="permit-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(event) => event.stopPropagation()}>
        <header className="permit-dialog-header">
          <h2 id={titleId}>Import permits</h2>
          <button className="icon-button" aria-label="Close" onClick={onClose} disabled={busy}>×</button>
        </header>
        <p className="muted">Permits are added to the <strong>{activeVersion.name}</strong> version. Rows already on file are skipped.</p>

        {(step.name === "choose" || step.name === "reading") && (
          <div className="import-choose">
            <label className={`file-drop${busy ? " is-busy" : ""}`}>
              <input ref={inputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void readFile(file); }} />
              <span>{step.name === "reading" ? `Reading ${step.fileName}…` : "Choose a filled-in template (.xlsx)"}</span>
            </label>
            <p className="muted">Don't have the template? <button className="link-button" onClick={() => void template()}>Download the template</button></p>
          </div>
        )}

        {(step.name === "preview" || step.name === "saving" || step.name === "done") && (
          <ImportReportView report={step.report} fileName={step.fileName} addedCount={step.name === "done" ? step.added : undefined} />
        )}

        {error && <p className="error" role="alert">{error}</p>}

        <footer className="permit-dialog-footer">
          {step.name === "preview" && <button onClick={() => setStep({ name: "choose" })}>Choose a different file</button>}
          {step.name === "preview" && (
            <button className="primary" onClick={() => void save()} disabled={!step.report.toInsert.length}>
              {step.report.toInsert.length ? `Import ${plural(step.report.toInsert.length, "permit")}` : "Nothing new to import"}
            </button>
          )}
          {step.name === "saving" && <button className="primary" disabled>Importing…</button>}
          {(step.name === "done" || step.name === "choose") && <button onClick={onClose}>{step.name === "done" ? "Done" : "Cancel"}</button>}
        </footer>
      </section>
    </div>
  );
}

function ImportReportView({ report, fileName, addedCount }: { report: ImportReport; fileName: string; addedCount?: number }) {
  const done = addedCount !== undefined;
  const added = addedCount ?? report.toInsert.length;
  return (
    <div className="import-report" aria-live="polite">
      <p><strong>{fileName}</strong>{done ? " was imported." : " is ready. Review the summary, then click Import."}</p>
      <ul className="import-counts">
        <li className="count-added"><strong>{added}</strong> {done ? "added" : "to add"}</li>
        <li><strong>{report.duplicateRows.length}</strong> skipped as duplicates</li>
        <li className={report.broken.length ? "count-warning" : undefined}><strong>{report.broken.length}</strong> broken (field not found)</li>
        <li className={report.rejected.length ? "count-error" : undefined}><strong>{report.rejected.length}</strong> rejected</li>
      </ul>

      {report.rejected.length > 0 && (
        <details open>
          <summary>Rejected rows are not imported. Fix them in the spreadsheet and import it again; rows already imported will be skipped.</summary>
          <table className="report-table"><thead><tr><th>Row</th><th>Problem</th></tr></thead>
            <tbody>{report.rejected.map(({ row, reason }) => <tr key={row}><td>{row}</td><td>{reason}</td></tr>)}</tbody>
          </table>
        </details>
      )}
      {report.broken.length > 0 && (
        <details open>
          <summary>Broken permits {done ? "were" : "will be"} imported, but their field name does not match a field on the map. Match them up with the Broken permits button.</summary>
          <table className="report-table"><thead><tr><th>Row</th><th>Field name in file</th></tr></thead>
            <tbody>{report.broken.map(({ row, rawFieldName }) => <tr key={row}><td>{row}</td><td>{rawFieldName}</td></tr>)}</tbody>
          </table>
        </details>
      )}
      {report.outOfHours.length > 0 && (
        <details open>
          <summary>{plural(report.outOfHours.length, "permit")} outside 5:00 AM to 10:00 PM ({done ? "imported" : "will be imported"}; please double-check)</summary>
          <table className="report-table"><thead><tr><th>Row</th><th>Time</th></tr></thead>
            <tbody>{report.outOfHours.map(({ row, start, end }) => <tr key={row}><td>{row}</td><td>{formatTime12h(start)} to {formatTime12h(end)}</td></tr>)}</tbody>
          </table>
        </details>
      )}
      {report.duplicateRows.length > 0 && <p className="muted">Duplicate rows skipped: {rowList(report.duplicateRows)}.</p>}
    </div>
  );
}
