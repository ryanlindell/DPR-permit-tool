import { useEffect, useId } from "react";
import type { AccountSettings } from "../../types";
import { ShareSettings } from "./ShareSettings";
import "./settings.css";

export interface SettingsDialogProps {
  settings: AccountSettings;
  /** Called with the saved row after any setting changes, so the app can keep its copy current. */
  onSettingsChange: (settings: AccountSettings) => void;
  onClose: () => void;
}

/** Account settings. Each section is its own component so later phases can add sections independently. */
export function SettingsDialog({ settings, onSettingsChange, onClose }: SettingsDialogProps) {
  const titleId = useId();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return <div className="modal-backdrop" role="presentation" onClick={onClose}>
    <section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(event) => event.stopPropagation()}>
      <header className="settings-dialog__header">
        <h2 id={titleId}>Settings</h2>
        <button type="button" aria-label="Close settings" onClick={onClose}>×</button>
      </header>
      <ShareSettings settings={settings} onSettingsChange={onSettingsChange} />
      <footer className="settings-dialog__footer"><button type="button" onClick={onClose}>Close</button></footer>
    </section>
  </div>;
}
