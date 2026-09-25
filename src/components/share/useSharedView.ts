import { useCallback, useEffect, useReducer, useRef } from "react";
import { getSharedView } from "../../data/share";
import { shareViewReducer, type ShareViewState } from "./shareViewState";

/** How often the share page re-fetches, so a projected view follows edits made elsewhere (SPEC 5.8). */
export const SHARE_REFRESH_MS = 15_000;

const messageOf = (error: unknown) => error instanceof Error ? error.message
  : typeof error === "object" && error && "message" in error ? String((error as { message: unknown }).message) : String(error);

/**
 * Loads the shared schedule and refreshes it every 15 seconds. The next refresh is scheduled
 * only after the previous one finishes, so a slow network can never pile up requests.
 * Coming back to the tab or back online refreshes immediately.
 */
export function useSharedView(token: string): { state: ShareViewState; refresh: () => void } {
  const [state, dispatch] = useReducer(shareViewReducer, { status: "loading" });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const alive = useRef(true);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (timer.current) clearTimeout(timer.current);
    try {
      const view = await getSharedView(token);
      if (alive.current) dispatch({ type: "loaded", view, at: Date.now() });
    } catch (error) {
      if (alive.current) dispatch({ type: "failed", message: messageOf(error) });
    } finally {
      inFlight.current = false;
      if (alive.current) timer.current = setTimeout(() => { void load(); }, SHARE_REFRESH_MS);
    }
  }, [token]);

  useEffect(() => {
    alive.current = true;
    void load();
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    const onOnline = () => { void load(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [load]);

  return { state, refresh: () => { void load(); } };
}
