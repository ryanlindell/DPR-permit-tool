import { useState } from "react";
import { editLock, type EditLockState } from "../../data/lock";
import "./lock.css";

const clockTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/**
 * Full-width strip under the top bar. Shows "Being edited on another device since HH:MM" with a
 * "Take over editing" button, plus one-off notices and connection errors from the lock.
 */
export function EditLockBanner({ state }: { state: EditLockState }) {
  const [busy, setBusy] = useState(false);
  const holder = state.mode !== "editing" ? state.otherHolder : null;

  async function takeOver() {
    if (!holder) return;
    const ok = window.confirm(`Take over editing from ${holder.holder_label}?\n\nThat device will switch to view-only within about 30 seconds. Anything it has already saved is kept.`);
    if (!ok) return;
    setBusy(true);
    try { await editLock.takeOver(); } finally { setBusy(false); }
  }

  if (!holder && !state.notice && !state.error) return null;
  return <div className="lock-banners">
    {holder && <div className="lock-banner" role="status">
      <span><strong>Being edited on another device since {clockTime(holder.acquired_at ?? holder.heartbeat_at)}</strong> ({holder.holder_label}). You can look, but changes are turned off here.</span>
      <button type="button" onClick={() => void takeOver()} disabled={busy}>{busy ? "Taking over…" : "Take over editing"}</button>
    </div>}
    {state.notice && <div className="lock-banner" role="alert">
      <span>{state.notice}</span>
      <button type="button" onClick={() => editLock.dismissNotice()}>Dismiss</button>
    </div>}
    {state.error && <div className="lock-banner lock-banner--error" role="alert"><span>{state.error}</span></div>}
  </div>;
}
