import { appConfig } from "../config/appConfig";
import { requireSupabase, supabase, supabaseConfig } from "./supabaseClient";

/**
 * One editor at a time (SPEC 6.3).
 *
 * The database row in `edit_locks` says which browser tab (session_id) may edit the account.
 * `acquire_edit_lock` is an atomic upsert, so two tabs racing for a free lock cannot both win.
 * The holder proves it is still alive with a heartbeat; a lock whose heartbeat is older than
 * `editLockStaleAfterSeconds` is treated as abandoned and can be taken without asking.
 */
export interface EditLock { owner_id: string; session_id: string; holder_label: string; heartbeat_at: string; acquired_at: string; }

export async function getEditLock(): Promise<EditLock | null> {
  const { data, error } = await requireSupabase().from("edit_locks").select("*").maybeSingle(); if (error) throw error; return data as EditLock | null;
}
export async function acquireEditLock(sessionId: string, label: string, force = false): Promise<boolean> {
  const { data, error } = await requireSupabase().rpc("acquire_edit_lock", { p_session_id: sessionId, p_label: label, p_force: force }); if (error) throw error; return data as boolean;
}
export async function heartbeatEditLock(sessionId: string): Promise<boolean> {
  const { data, error } = await requireSupabase().rpc("heartbeat_edit_lock", { p_session_id: sessionId }); if (error) throw error; return data as boolean;
}
export async function releaseEditLock(sessionId: string): Promise<void> {
  const { error } = await requireSupabase().rpc("release_edit_lock", { p_session_id: sessionId }); if (error) throw error;
}

/** True while the holder's last heartbeat is recent enough that the lock still counts. */
export function isLockFresh(lock: Pick<EditLock, "heartbeat_at">, nowMs: number, staleAfterSeconds: number = appConfig.editLockStaleAfterSeconds): boolean {
  const beat = Date.parse(lock.heartbeat_at);
  return Number.isFinite(beat) && nowMs - beat < staleAfterSeconds * 1000;
}

/** A short, human description of this browser for the lock row, e.g. "Chrome on Windows". */
export function describeBrowser(userAgent: string): string {
  const browser = /Edg\//.test(userAgent) ? "Edge"
    : /OPR\/|Opera/.test(userAgent) ? "Opera"
    : /Firefox\/|FxiOS\//.test(userAgent) ? "Firefox"
    : /Chrome\/|CriOS\//.test(userAgent) ? "Chrome"
    : /Safari\//.test(userAgent) ? "Safari"
    : "a browser";
  const os = /iPhone/.test(userAgent) ? "iPhone"
    : /iPad/.test(userAgent) ? "iPad"
    : /Android/.test(userAgent) ? "Android"
    : /Windows/.test(userAgent) ? "Windows"
    : /CrOS/.test(userAgent) ? "Chromebook"
    : /Mac OS X|Macintosh/.test(userAgent) ? "Mac"
    : /Linux/.test(userAgent) ? "Linux"
    : "";
  return os ? `${browser} on ${os}` : browser;
}

/** The database calls the controller needs; injected so tests can supply fakes. */
export interface EditLockApi {
  acquire(sessionId: string, label: string, force: boolean): Promise<boolean>;
  heartbeat(sessionId: string): Promise<boolean>;
  release(sessionId: string): Promise<void>;
  get(): Promise<EditLock | null>;
  /** Fire-and-forget release that survives the tab closing. */
  releaseOnUnload(sessionId: string): void;
}

export interface EditLockState {
  /** "editing" is the only mode in which canEdit() is true. */
  mode: "viewing" | "acquiring" | "editing";
  /** A live lock held by a different tab or device, shown in the read-only banner. */
  otherHolder: EditLock | null;
  /** One-off message, e.g. that another device took over. */
  notice: string | null;
  /** Latest network problem, cleared by the next successful call. */
  error: string | null;
}

const messageOf = (error: unknown) => error instanceof Error ? error.message
  : typeof error === "object" && error && "message" in error ? String((error as { message: unknown }).message) : String(error);

/**
 * Client side of the lock for one browser tab. It keeps a small state object that React
 * subscribes to (see useEditLock), heartbeats while editing, and otherwise polls the lock so
 * the read-only banner appears when someone else starts editing.
 */
export class EditLockController {
  readonly sessionId: string;
  private state: EditLockState = { mode: "viewing", otherHolder: null, notice: null, error: null };
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  /** Every lock operation runs in order, so a heartbeat can never interleave with a take-over. */
  private queue: Promise<unknown> = Promise.resolve();
  private label = "another device";
  private readonly onPageHide = () => { if (this.state.mode === "editing") this.api.releaseOnUnload(this.sessionId); };
  private readonly api: EditLockApi;
  private readonly intervalMs: number;

  constructor(api: EditLockApi, sessionId: string = crypto.randomUUID(), intervalMs: number = appConfig.editLockHeartbeatSeconds * 1000) {
    this.api = api;
    this.sessionId = sessionId;
    this.intervalMs = intervalMs;
  }

  getState = (): EditLockState => this.state;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };

  /** Begin watching the lock (for the banner) and heartbeating while editing. */
  start(label: string): void {
    this.label = label;
    if (this.timer) return;
    this.timer = setInterval(() => { void this.tick(); }, this.intervalMs);
    if (typeof window !== "undefined") window.addEventListener("pagehide", this.onPageHide);
    void this.tick();
  }

  /** Stop timers and give the lock back (used when the main app unmounts, e.g. on sign-out). */
  stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (typeof window !== "undefined") window.removeEventListener("pagehide", this.onPageHide);
    return this.stopEditing();
  }

  /** Try to enter edit mode. Resolves true when this tab now holds the lock. */
  requestEdit(): Promise<boolean> { return this.acquire(false); }

  /** Forcibly take the lock from another device. The UI must confirm first. */
  takeOver(): Promise<boolean> { return this.acquire(true); }

  stopEditing(): Promise<void> {
    return this.enqueue(async () => {
      if (this.state.mode !== "editing") return;
      this.set({ mode: "viewing", notice: null });
      try { await this.api.release(this.sessionId); }
      catch { /* Best effort: an unreleased lock goes stale by itself after two minutes. */ }
    });
  }

  dismissNotice(): void { this.set({ notice: null }); }

  private acquire(force: boolean): Promise<boolean> {
    return this.enqueue(async () => {
      if (this.state.mode === "editing") return true;
      this.set({ mode: "acquiring", error: null, notice: null });
      try {
        if (await this.api.acquire(this.sessionId, this.label, force)) {
          this.set({ mode: "editing", otherHolder: null });
          return true;
        }
        this.set({ mode: "viewing", otherHolder: await this.api.get() });
        return false;
      } catch (error) {
        this.set({ mode: "viewing", error: `Could not start editing: ${messageOf(error)}` });
        return false;
      }
    });
  }

  private tick(): Promise<void> {
    return this.enqueue(async () => {
      try {
        if (this.state.mode === "editing") {
          if (await this.api.heartbeat(this.sessionId)) { this.set({ error: null }); return; }
          // Another device took over (or our lock went stale and was claimed): drop to read-only.
          const holder = await this.api.get();
          this.set({ mode: "viewing", otherHolder: holder, error: null, notice: "Another device took over editing. This view is now read-only." });
          return;
        }
        const lock = await this.api.get();
        const other = lock && lock.session_id !== this.sessionId && isLockFresh(lock, Date.now()) ? lock : null;
        this.set({ otherHolder: other, error: null });
      } catch (error) {
        this.set({ error: `Lost contact with the server (${messageOf(error)}). Retrying…` });
      }
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation, operation);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private set(changes: Partial<EditLockState>): void {
    this.state = { ...this.state, ...changes };
    for (const listener of this.listeners) listener();
  }
}

/** Access token cached for the unload request, which cannot wait for an async session lookup. */
let cachedAccessToken: string | null = null;
async function rememberAccessToken() {
  const { data } = await requireSupabase().auth.getSession();
  cachedAccessToken = data.session?.access_token ?? null;
}

const supabaseLockApi: EditLockApi = {
  async acquire(sessionId, label, force) { const won = await acquireEditLock(sessionId, label, force); await rememberAccessToken(); return won; },
  async heartbeat(sessionId) { const alive = await heartbeatEditLock(sessionId); await rememberAccessToken(); return alive; },
  release: releaseEditLock,
  get: getEditLock,
  releaseOnUnload(sessionId) {
    if (!supabase || !cachedAccessToken) return;
    // keepalive lets the request finish after the tab is gone; supabase-js cannot do that.
    void fetch(`${supabaseConfig.url}/rest/v1/rpc/release_edit_lock`, {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json", apikey: supabaseConfig.publishableKey, Authorization: `Bearer ${cachedAccessToken}` },
      body: JSON.stringify({ p_session_id: sessionId }),
    }).catch(() => undefined);
  },
};

/** The lock for this browser tab. */
export const editLock = new EditLockController(supabaseLockApi);

/** Whether this tab may edit right now: signed in and holding the account's edit lock. */
export function canEdit(): boolean { return editLock.getState().mode === "editing"; }
