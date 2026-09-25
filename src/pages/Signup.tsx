import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { isSupabaseConfigured, requireSupabase } from "../data/supabaseClient";

export function Signup() {
  const [username, setUsername] = useState(""); const [password, setPassword] = useState(""); const [inviteCode, setInviteCode] = useState(""); const [error, setError] = useState(""); const [done, setDone] = useState(false); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      const { error: invokeError } = await requireSupabase().functions.invoke("signup-with-invite", { body: { username, password, inviteCode } });
      if (invokeError) throw invokeError;
      setDone(true);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not create account."); }
    finally { setBusy(false); }
  }
  return <main className="auth-card"><h1>Create account</h1>{done ? <p>Account created. <Link to="/login">Sign in</Link> to continue.</p> : <form onSubmit={submit}><label>Username<input autoComplete="username" minLength={3} maxLength={32} value={username} onChange={(e) => setUsername(e.target.value)} required /></label><label>Password<input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required /></label><label>Invite code<input value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} required /></label>{error && <p className="error">{error}</p>}<button disabled={busy || !isSupabaseConfigured}>{busy ? "Creating account…" : "Create account"}</button></form>}<p>Already have an account? <Link to="/login">Sign in</Link></p></main>;
}
