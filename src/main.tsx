import { StrictMode, Suspense, lazy, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import type { Session, User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "./data/supabaseClient";
import { Login } from "./pages/Login";
import { Signup } from "./pages/Signup";
import { MainApp } from "./pages/MainApp";
import { SharePage } from "./pages/SharePage";
import "./styles.css";

/** Development-only component harnesses; import.meta.env.DEV is false in production builds, so these are dropped from the bundle. */
const CalendarDemoPage = import.meta.env.DEV ? lazy(() => import("./components/calendar/dev/CalendarDemoPage").then((m) => ({ default: m.CalendarDemoPage }))) : null;

export function Root() {
  const [user, setUser] = useState<User | null>(null); const [ready, setReady] = useState(!isSupabaseConfigured);
  useEffect(() => {
    if (!supabase) return;
    let live = true;
    void supabase.auth.getSession().then(({ data }) => { if (live) { setUser(data.session?.user ?? null); setReady(true); } });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session: Session | null) => setUser(session?.user ?? null));
    return () => { live = false; subscription.subscription.unsubscribe(); };
  }, []);
  if (!ready) return <main className="loading">Loading account…</main>;
  return <HashRouter><Routes><Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} /><Route path="/signup" element={user ? <Navigate to="/" replace /> : <Signup />} /><Route path="/share/:token" element={<SharePage />} />{CalendarDemoPage && <Route path="/dev/calendar" element={<Suspense fallback={<main className="loading">Loading…</main>}><CalendarDemoPage /></Suspense>} />}<Route path="/" element={user ? <MainApp user={user} /> : <Navigate to="/login" replace />} /><Route path="*" element={<Navigate to={user ? "/" : "/login"} replace />} /></Routes></HashRouter>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><Root /></StrictMode>);
