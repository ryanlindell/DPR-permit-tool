import type { User } from "@supabase/supabase-js";
import { useState } from "react";
import { FieldMapWorkspace } from "../components/map/FieldMapWorkspace";
import { requireSupabase } from "../data/supabaseClient";

export function MainApp({ user }: { user: User }) {
  const [showExport, setShowExport] = useState(false);
  const username = String(user.user_metadata.username ?? user.email?.split("@")[0] ?? "Account");
  return <div className="app-shell"><header className="topbar"><strong>Field Permit Scheduler</strong><span className="account-name">{username}</span><button disabled title="Available in a later phase">Version: Original</button><button disabled title="Available in a later phase">Import</button><button disabled title="Available in a later phase">Download template</button><button disabled title="Available in a later phase">Broken permits</button><button onClick={() => setShowExport(true)}>Export</button><button disabled title="Available in a later phase">Settings</button><button onClick={() => void requireSupabase().auth.signOut()}>Sign out</button></header><main className="workspace"><FieldMapWorkspace /><aside aria-label="Permit sidebar mount point" /><div aria-label="Calendar overlay mount point" /></main>{showExport && <div className="modal-backdrop" role="presentation" onClick={() => setShowExport(false)}><section className="export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-title" onClick={(event) => event.stopPropagation()}><h2 id="export-title">Export</h2><p>Export formats are coming soon.</p><button onClick={() => setShowExport(false)}>Close</button></section></div>}</div>;
}
