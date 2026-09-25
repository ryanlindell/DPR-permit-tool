import { StrictMode, Suspense, lazy, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import { getCurrentUser, subscribeToAuthChanges } from "./data/auth";
import { isSupabaseConfigured } from "./data/supabaseClient";
import { Login } from "./pages/Login";
import { Signup } from "./pages/Signup";
import { MainApp } from "./pages/MainApp";
import { SharePage } from "./pages/SharePage";
import "./styles.css";

/** Development-only component harnesses; import.meta.env.DEV is false in production builds, so these are dropped from the bundle. */
const CalendarDemoPage = import.meta.env.DEV ? lazy(() => import("./components/calendar/dev/CalendarDemoPage").then((m) => ({ default: m.CalendarDemoPage }))) : null;

export function Root() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(!isSupabaseConfigured);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authAttempt, setAuthAttempt] = useState(0);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let live = true;
    setReady(false);
    setAuthError(null);
    const unsubscribe = subscribeToAuthChanges((nextUser) => {
      if (!live) return;
      setUser(nextUser);
      setAuthError(null);
      setReady(true);
    });
    void getCurrentUser().then((nextUser) => {
      if (live) setUser(nextUser);
    }).catch((caught: unknown) => {
      if (live) setAuthError(`Could not check your sign-in session: ${caught instanceof Error ? caught.message : String(caught)}`);
    }).finally(() => {
      if (live) setReady(true);
    });
    return () => { live = false; unsubscribe(); };
  }, [authAttempt]);
  if (!ready) return <main className="loading" role="status">Loading account…</main>;
  if (authError) return <main className="workspace-error" role="alert"><h1>Sign-in status unavailable</h1><p>{authError}</p><button type="button" onClick={() => setAuthAttempt((attempt) => attempt + 1)}>Try again</button></main>;
  return <HashRouter><Routes><Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} /><Route path="/signup" element={user ? <Navigate to="/" replace /> : <Signup />} /><Route path="/share/:token" element={<SharePage />} />{CalendarDemoPage && <Route path="/dev/calendar" element={<Suspense fallback={<main className="loading">Loading…</main>}><CalendarDemoPage /></Suspense>} />}<Route path="/" element={user ? <MainApp user={user} /> : <Navigate to="/login" replace />} /><Route path="*" element={<Navigate to={user ? "/" : "/login"} replace />} /></Routes></HashRouter>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><Root /></StrictMode>);
