import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { signInWithUsername } from "../data/auth";
import { isSupabaseConfigured } from "../data/supabaseClient";

export function Login() {
  const [username, setUsername] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setBusy(true);
    try { await signInWithUsername(username, password); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not sign in."); }
    finally { setBusy(false); }
  }
  return <main className="auth-card"><h1>Sign in</h1>{!isSupabaseConfigured && <p className="error">Supabase environment variables are not configured.</p>}<form onSubmit={submit}><label>Username<input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required /></label><label>Password<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>{error && <p className="error">{error}</p>}<button disabled={busy || !isSupabaseConfigured}>{busy ? "Signing in…" : "Sign in"}</button></form><p>Have an invite code? <Link to="/signup">Create an account</Link></p></main>;
}
