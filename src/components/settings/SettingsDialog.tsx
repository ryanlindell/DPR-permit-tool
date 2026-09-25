import { useEffect, useId, useState } from "react";
import type { AccountSettings } from "../../types";
import { ShareSettings } from "./ShareSettings";
import "./settings.css";

export interface SettingsDialogProps {
  settings: AccountSettings;
  /** Called with the saved row after any setting changes, so the app can keep its copy current. */
  onSettingsChange: (settings: AccountSettings) => void;
  /** Rebuilds every cached field overlap pair from the current field geometries. */
  onRecomputeOverlaps: () => Promise<number>;
  /** Recomputing the cache writes account data, so require the active edit lock. */
  canRecomputeOverlaps: boolean;
  onClose: () => void;
}

/** Account settings. Each section is its own component so later phases can add sections independently. */
export function SettingsDialog({ settings, onSettingsChange, onRecomputeOverlaps, canRecomputeOverlaps, onClose }: SettingsDialogProps) {
  const titleId = useId();
  const [recomputing, setRecomputing] = useState(false);
  const [overlapMessage, setOverlapMessage] = useState<string | null>(null);
  const [overlapError, setOverlapError] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function recomputeOverlaps() {
    setRecomputing(true);
    setOverlapMessage(null);
    setOverlapError(null);
    try {
      const count = await onRecomputeOverlaps();
      setOverlapMessage(`Recomputed ${count} overlapping field pair${count === 1 ? "" : "s"}.`);
    } catch (caught) {
      setOverlapError(`Could not recompute field overlaps: ${caught instanceof Error ? caught.message : String(caught)}`);
    } finally {
      setRecomputing(false);
    }
  }

  return <div className="modal-backdrop" role="presentation" onClick={onClose}>
    <section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(event) => event.stopPropagation()}>
      <header className="settings-dialog__header">
        <h2 id={titleId}>Settings</h2>
        <button type="button" aria-label="Close settings" onClick={onClose}>×</button>
      </header>
      <section className="settings-section" aria-labelledby={`${titleId}-overlaps`}>
        <h3 id={`${titleId}-overlaps`}>Field overlaps</h3>
        <p className="settings-help">Rebuild the cached list of fields that physically overlap. Use this if the map or conflict results look out of date.</p>
        <button type="button" onClick={() => void recomputeOverlaps()} disabled={!canRecomputeOverlaps || recomputing}>
          {recomputing ? "Recomputing overlaps…" : "Recompute all overlaps"}
        </button>
        {!canRecomputeOverlaps && <p className="settings-help">Enter edit mode to rebuild the overlap cache.</p>}
        {overlapMessage && <p role="status">{overlapMessage}</p>}
        {overlapError && <p className="error" role="alert">{overlapError}</p>}
      </section>
      <ShareSettings settings={settings} onSettingsChange={onSettingsChange} />
      <footer className="settings-dialog__footer"><button type="button" onClick={onClose}>Close</button></footer>
    </section>
  </div>;
}
