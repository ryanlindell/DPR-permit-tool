import { useId, useRef, useState } from "react";
import { buildShareUrl, regenerateShareToken, setShareEnabled } from "../../data/share";
import type { AccountSettings } from "../../types";

const messageOf = (error: unknown) => error instanceof Error ? error.message
  : typeof error === "object" && error && "message" in error ? String((error as { message: unknown }).message) : String(error);

/** Settings section: turn the read-only share link on or off, copy it, or replace it (SPEC 5.8). */
export function ShareSettings({ settings, onSettingsChange }: { settings: AccountSettings; onSettingsChange: (settings: AccountSettings) => void }) {
  const [busy, setBusy] = useState<"toggle" | "regenerate" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const linkRef = useRef<HTMLInputElement>(null);
  const toggleId = useId();
  const linkId = useId();
  const url = buildShareUrl(settings.share_token);

  async function run(kind: "toggle" | "regenerate", action: () => Promise<AccountSettings>, failure: string) {
    setBusy(kind); setError(null); setCopied(false);
    try { onSettingsChange(await action()); }
    catch (caught) { setError(`${failure}: ${messageOf(caught)}`); }
    finally { setBusy(null); }
  }

  async function copy() {
    setError(null);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard access can be blocked (older browsers, non-HTTPS); select the text so Ctrl+C works.
      linkRef.current?.select();
      setError("Couldn't copy automatically. The link is selected; press Ctrl+C (or ⌘C) to copy it.");
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  }

  function regenerate() {
    const ok = window.confirm("Make a new share link?\n\nThe current link will stop working right away. Anyone using it (including a projector) will need the new link.");
    if (ok) void run("regenerate", regenerateShareToken, "Couldn't make a new link");
  }

  return <section className="settings-section" aria-labelledby={`${toggleId}-title`}>
    <h3 id={`${toggleId}-title`}>Share link</h3>
    <p className="settings-help">Anyone with the link can <strong>view</strong> the current schedule (map, conflicts, and calendar). They can't change anything. Use it for the projector in meetings or to send to permit holders.</p>

    <label className="settings-toggle" htmlFor={toggleId}>
      <input id={toggleId} type="checkbox" checked={settings.share_enabled} disabled={busy !== null}
        onChange={(event) => void run("toggle", () => setShareEnabled(event.target.checked), "Couldn't change sharing")} />
      <span>{busy === "toggle" ? "Saving…" : "Enable share link"}</span>
    </label>

    <div className={`share-link${settings.share_enabled ? "" : " is-off"}`}>
      <label htmlFor={linkId}>Link</label>
      <div className="share-link__row">
        <input id={linkId} ref={linkRef} type="text" readOnly value={url} onFocus={(event) => event.target.select()} disabled={!settings.share_enabled} />
        <button type="button" className="primary" onClick={() => void copy()} disabled={!settings.share_enabled || busy !== null}>{copied ? "Copied!" : "Copy link"}</button>
      </div>
      {!settings.share_enabled && <p className="settings-help">Sharing is off. Anyone opening this link sees a "not available" message.</p>}
    </div>

    <div className="settings-row">
      <button type="button" onClick={regenerate} disabled={busy !== null}>{busy === "regenerate" ? "Making a new link…" : "Regenerate link"}</button>
      <span className="settings-help">Use this if the link went to someone who shouldn't have it.</span>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
