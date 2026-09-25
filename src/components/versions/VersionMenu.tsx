import { useEffect, useRef, useState, type FormEvent } from "react";
import { countVersionPermits, createVersion, deleteVersion, renameVersion } from "../../data/versions";
import type { Version } from "../../types";
import { cleanVersionName, suggestVersionName, versionErrorMessage, versionNameError } from "./versionNames";
import "./versions.css";

export interface VersionMenuProps {
  versions: Version[];
  activeVersionId: string;
  /** True when this session may not change versions (e.g. another device holds the edit lock). */
  readOnly: boolean;
  /** Disable selection while an edit-lock acquisition is in flight. */
  selectionDisabled?: boolean;
  /** Reload settings, versions, and permits after any change. Rejects if the reload fails. */
  onChanged: () => Promise<void>;
  /** Selects the version displayed by this browser session; does not change other sessions. */
  onSelectVersion: (versionId: string) => void;
}

type Dialog =
  | { kind: "saveAs" }
  | { kind: "rename"; version: Version }
  | { kind: "delete"; version: Version; permitCount: number | null; permitCountError: string | null };

/**
 * Top-bar menu for versions ("saves"): shows the active version, and offers Save as new version,
 * switch, rename, and delete. Every change goes through src/data/versions.ts and then calls
 * onChanged so the app reloads permits and conflicts for whichever version is now active.
 */
export function VersionMenu({ versions, activeVersionId, readOnly, selectionDisabled = false, onChanged, onSelectVersion }: VersionMenuProps) {
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const active = versions.find((version) => version.id === activeVersionId);

  // Close the dropdown on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onPointer); document.removeEventListener("keydown", onKey); };
  }, [open]);

  /** Runs a change, then reloads the app. Returns an error message for dialogs, or null on success. */
  async function run(label: string, action: () => Promise<unknown>): Promise<string | null> {
    setBusy(label); setError(null);
    try {
      await action();
      await onChanged();
      return null;
    } catch (caught) {
      const message = versionErrorMessage(caught);
      setError(message);
      return message;
    } finally {
      setBusy(null);
    }
  }

  async function handleSwitch(version: Version) {
    setOpen(false);
    await run(`Showing ${version.name}…`, async () => onSelectVersion(version.id));
  }

  async function openDelete(version: Version) {
    setOpen(false);
    setDialog({ kind: "delete", version, permitCount: null, permitCountError: null });
    try {
      const permitCount = await countVersionPermits(version.id);
      setDialog((current) => current?.kind === "delete" && current.version.id === version.id ? { ...current, permitCount } : current);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setDialog((current) => current?.kind === "delete" && current.version.id === version.id
        ? { ...current, permitCountError: `Could not load the permit count: ${message}` }
        : current);
    }
  }

  return (
    <div className="version-menu" ref={rootRef}>
      <button type="button" className="version-menu__trigger" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)} disabled={!!busy}>
        {busy ?? <>Version: <span className="version-menu__active">{active?.name ?? "…"}</span> <span aria-hidden="true">▾</span></>}
      </button>

      {open && (
        <div className="version-menu__panel" role="menu" aria-label="Versions">
          <p className="version-menu__note">Versions save permit schedules. Field names and map shapes are shared across all versions.</p>
          {readOnly && <p className="version-menu__note">You can switch the displayed version anytime. Save, rename, and delete require edit mode for this version.</p>}
          <button type="button" role="menuitem" className="version-menu__save" disabled={readOnly} onClick={() => { setOpen(false); setError(null); setDialog({ kind: "saveAs" }); }}>
            Save as new version…
          </button>
          <ul className="version-menu__list">
            {versions.map((version) => {
              const isActive = version.id === activeVersionId;
              return (
                <li key={version.id} className={isActive ? "is-active" : undefined}>
                  <div className="version-menu__name">
                    <span>{version.name}</span>
                    <small>{isActive ? "Active" : `Saved ${new Date(version.created_at).toLocaleDateString()}`}</small>
                  </div>
                  <div className="version-menu__actions">
                    {!isActive && <button type="button" role="menuitem" disabled={selectionDisabled} onClick={() => void handleSwitch(version)}>Switch</button>}
                    <button type="button" role="menuitem" disabled={readOnly} aria-label={`Rename ${version.name}`} onClick={() => { setOpen(false); setError(null); setDialog({ kind: "rename", version }); }}>Rename</button>
                    {!isActive && <button type="button" role="menuitem" className="danger-button" disabled={readOnly} aria-label={`Delete ${version.name}`} onClick={() => void openDelete(version)}>Delete</button>}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {error && !dialog && (
        <div className="version-menu__error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {dialog?.kind === "saveAs" && active && (
        <VersionNameDialog
          title="Save as new version"
          description={`Copies all permits in "${active.name}" into a new version and switches to it. "${active.name}" stays exactly as it is.`}
          submitLabel="Save and switch"
          initialName={suggestVersionName(versions)}
          versions={versions}
          onCancel={() => setDialog(null)}
          onSubmit={async (name) => {
            let created: Version | null = null;
            const problem = await run(`Saving ${name}…`, async () => {
              created = await createVersion(name, active.id);
              onSelectVersion(created.id);
              return created;
            });
            if (!problem) setDialog(null);
            return problem;
          }}
        />
      )}

      {dialog?.kind === "rename" && (
        <VersionNameDialog
          title={`Rename "${dialog.version.name}"`}
          submitLabel="Rename"
          initialName={dialog.version.name}
          versions={versions}
          editingId={dialog.version.id}
          onCancel={() => setDialog(null)}
          onSubmit={async (name) => {
            const problem = await run("Renaming…", () => renameVersion(dialog.version.id, name));
            if (!problem) setDialog(null);
            return problem;
          }}
        />
      )}

      {dialog?.kind === "delete" && (
        <ConfirmDeleteDialog
          version={dialog.version}
          permitCount={dialog.permitCount}
          permitCountError={dialog.permitCountError}
          onCancel={() => setDialog(null)}
          onConfirm={async () => {
            const problem = await run(`Deleting ${dialog.version.name}…`, () => deleteVersion(dialog.version.id));
            if (!problem) setDialog(null);
            return problem;
          }}
        />
      )}
    </div>
  );
}

interface VersionNameDialogProps {
  title: string;
  description?: string;
  submitLabel: string;
  initialName: string;
  versions: Version[];
  editingId?: string;
  onCancel: () => void;
  /** Resolves with an error message to show, or null when done. */
  onSubmit: (name: string) => Promise<string | null>;
}

function VersionNameDialog({ title, description, submitLabel, initialName, versions, editingId, onCancel, onSubmit }: VersionNameDialogProps) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const problem = versionNameError(name, versions, editingId);
    if (problem) { setError(problem); return; }
    setSaving(true); setError(null);
    const failure = await onSubmit(cleanVersionName(name));
    setSaving(false);
    if (failure) setError(failure);
  }

  return (
    <div className="modal-backdrop" role="presentation" onKeyDown={(event) => { if (event.key === "Escape" && !saving) onCancel(); }}>
      <form className="version-dialog" role="dialog" aria-modal="true" aria-labelledby="version-dialog-title" onSubmit={(event) => void submit(event)}>
        <h2 id="version-dialog-title">{title}</h2>
        {description && <p className="muted">{description}</p>}
        <label>Version name
          <input autoFocus value={name} onChange={(event) => setName(event.target.value)} onFocus={(event) => event.target.select()} maxLength={120} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="version-dialog__actions">
          <button type="button" onClick={onCancel} disabled={saving}>Cancel</button>
          <button type="submit" className="primary" disabled={saving}>{saving ? "Saving…" : submitLabel}</button>
        </div>
      </form>
    </div>
  );
}

function ConfirmDeleteDialog({ version, permitCount, permitCountError, onCancel, onConfirm }: { version: Version; permitCount: number | null; permitCountError: string | null; onCancel: () => void; onConfirm: () => Promise<string | null> }) {
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const permits = permitCount === null ? "its permits" : permitCount === 1 ? "its 1 permit" : `its ${permitCount} permits`;

  async function confirm() {
    setDeleting(true); setError(null);
    const failure = await onConfirm();
    setDeleting(false);
    if (failure) setError(failure);
  }

  return (
    <div className="modal-backdrop" role="presentation" onKeyDown={(event) => { if (event.key === "Escape" && !deleting) onCancel(); }}>
      <section className="version-dialog" role="alertdialog" aria-modal="true" aria-labelledby="version-delete-title" aria-describedby="version-delete-body">
        <h2 id="version-delete-title">Delete "{version.name}"?</h2>
        <p id="version-delete-body">This permanently deletes the version and {permits}. Other versions are not affected. This can't be undone.</p>
        {permitCountError && <p className="error" role="alert">{permitCountError}</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="version-dialog__actions">
          <button type="button" autoFocus onClick={onCancel} disabled={deleting}>Cancel</button>
          <button type="button" className="danger-button solid" onClick={() => void confirm()} disabled={deleting}>{deleting ? "Deleting…" : "Delete version"}</button>
        </div>
      </section>
    </div>
  );
}
