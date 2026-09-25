import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditLockController, describeBrowser, isLockFresh, type EditLock, type EditLockApi } from "./lock";

/**
 * An in-memory stand-in for the edit_locks row and its three Postgres functions, with the same
 * rules as the SQL: acquire wins if the row is free, ours, stale, or forced; heartbeat only
 * succeeds for the current holder. Several controllers can share one fake to act as browsers.
 */
function fakeDatabase() {
  const rows = new Map<string, EditLock>();
  const now = () => new Date(Date.now()).toISOString();
  const stale = (lock: EditLock) => Date.now() - Date.parse(lock.heartbeat_at) >= 120_000;
  const api = (): EditLockApi & { releasedOnUnload: string[] } => ({
    releasedOnUnload: [],
    async acquire(sessionId, versionId, label, force) {
      let row = rows.get(versionId) ?? null;
      if (!row || row.session_id === sessionId || force || stale(row)) {
        const acquired_at = row?.session_id === sessionId ? row.acquired_at : now();
        row = { owner_id: "u1", version_id: versionId, session_id: sessionId, holder_label: label, heartbeat_at: now(), acquired_at };
        rows.set(versionId, row);
      }
      return row.session_id === sessionId;
    },
    async heartbeat(sessionId, versionId) {
      let row = rows.get(versionId) ?? null;
      if (row?.session_id !== sessionId) return false;
      row = { ...row, heartbeat_at: now() };
      rows.set(versionId, row);
      return true;
    },
    async release(sessionId, versionId) { if (rows.get(versionId)?.session_id === sessionId) rows.delete(versionId); },
    async get(versionId) { return rows.get(versionId) ?? null; },
    releaseOnUnload(sessionId, versionId) { this.releasedOnUnload.push(`${sessionId}:${versionId}`); },
  });
  return { api, row: (versionId = "v1") => rows.get(versionId) ?? null };
}

const flush = () => vi.advanceTimersByTimeAsync(0);

describe("EditLockController", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-25T17:00:00Z")); });
  afterEach(() => { vi.useRealTimers(); });

  it("lets only one of two browsers on the same account enter edit mode", async () => {
    const db = fakeDatabase();
    const laptop = new EditLockController(db.api(), "laptop", 30_000);
    const office = new EditLockController(db.api(), "office", 30_000);
    laptop.start("v1", "Chrome on Windows");
    office.start("v1", "Safari on Mac");
    await flush();

    expect(await laptop.requestEdit()).toBe(true);
    expect(await office.requestEdit()).toBe(false);
    expect(laptop.getState().mode).toBe("editing");
    expect(office.getState()).toMatchObject({ mode: "viewing", otherHolder: { session_id: "laptop", holder_label: "Chrome on Windows" } });
  });

  it("allows simultaneous editing when browsers are working on different versions", async () => {
    const db = fakeDatabase();
    const first = new EditLockController(db.api(), "tab-a", 30_000);
    const second = new EditLockController(db.api(), "tab-b", 30_000);
    first.start("version-a", "Chrome on Windows");
    second.start("version-b", "Safari on Mac");
    await flush();

    expect(await first.requestEdit()).toBe(true);
    expect(await second.requestEdit()).toBe(true);
    expect(db.row("version-a")?.session_id).toBe("tab-a");
    expect(db.row("version-b")?.session_id).toBe("tab-b");
  });

  it("shows the banner to other sessions within one poll, without them trying to edit", async () => {
    const db = fakeDatabase();
    const laptop = new EditLockController(db.api(), "laptop", 30_000);
    const office = new EditLockController(db.api(), "office", 30_000);
    office.start("v1", "Safari on Mac");
    await flush();
    expect(office.getState().otherHolder).toBeNull();

    laptop.start("v1", "Chrome on Windows");
    await laptop.requestEdit();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(office.getState().otherHolder?.session_id).toBe("laptop");

    await laptop.stopEditing();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(office.getState().otherHolder).toBeNull();
  });

  it("take over moves the lock, and the displaced browser drops to read-only on its next heartbeat", async () => {
    const db = fakeDatabase();
    const laptop = new EditLockController(db.api(), "laptop", 30_000);
    const office = new EditLockController(db.api(), "office", 30_000);
    laptop.start("v1", "Chrome on Windows");
    office.start("v1", "Safari on Mac");
    await laptop.requestEdit();
    await office.requestEdit();

    expect(await office.takeOver()).toBe(true);
    expect(office.getState().mode).toBe("editing");
    expect(laptop.getState().mode).toBe("editing"); // it has not heard yet

    await vi.advanceTimersByTimeAsync(30_000);
    expect(laptop.getState()).toMatchObject({ mode: "viewing", otherHolder: { session_id: "office" } });
    expect(laptop.getState().notice).toMatch(/took over/);
    expect(office.getState().mode).toBe("editing");
  });

  it("keeps the lock alive with heartbeats, so a long session is never considered stale", async () => {
    const db = fakeDatabase();
    const laptop = new EditLockController(db.api(), "laptop", 30_000);
    laptop.start("v1", "Chrome");
    await laptop.requestEdit();
    const acquiredAt = db.row("v1")!.acquired_at;
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(isLockFresh(db.row("v1")!, Date.now())).toBe(true);
    expect(db.row("v1")!.acquired_at).toBe(acquiredAt);
  });

  it("claims a lock abandoned for over two minutes without asking", async () => {
    const db = fakeDatabase();
    await db.api().acquire("crashed", "v1", "Chrome", false); // abandoned tab: acquired, then stopped heartbeating
    const office = new EditLockController(db.api(), "office", 30_000);
    office.start("v1", "Safari");
    await flush();
    expect(office.getState().otherHolder?.session_id).toBe("crashed");
    expect(await office.requestEdit()).toBe(false);

    await vi.advanceTimersByTimeAsync(121_000);
    expect(office.getState().otherHolder).toBeNull(); // the poll now sees a stale lock
    expect(await office.requestEdit()).toBe(true);
  });

  it("releases the lock when leaving edit mode, and best-effort when the tab closes", async () => {
    const db = fakeDatabase();
    const api = db.api();
    const laptop = new EditLockController(api, "laptop", 30_000);
    await laptop.requestEdit();
    await laptop.stopEditing();
    expect(db.row("v1")).toBeNull();

    const pageHide = new Map<string, () => void>();
    vi.stubGlobal("window", { addEventListener: (type: string, fn: () => void) => pageHide.set(type, fn), removeEventListener: () => undefined });
    try {
      laptop.start("v1", "Chrome");
      await laptop.requestEdit();
      pageHide.get("pagehide")!();
      expect(api.releasedOnUnload).toEqual(["laptop:v1"]);
    } finally { vi.unstubAllGlobals(); }
  });

  it("reports network errors without pretending to hold the lock", async () => {
    const api: EditLockApi = { ...fakeDatabase().api(), acquire: async () => { throw new Error("Failed to fetch"); } };
    const laptop = new EditLockController(api, "laptop", 30_000);
    laptop.start("v1", "Chrome");
    expect(await laptop.requestEdit()).toBe(false);
    expect(laptop.getState()).toMatchObject({ mode: "viewing", error: "Could not start editing: Failed to fetch" });
  });

  it("keeps editing through a failed heartbeat and says it is retrying", async () => {
    const db = fakeDatabase();
    const api = db.api();
    let offline = false;
    const flaky: EditLockApi = { ...api, heartbeat: (id, versionId) => offline ? Promise.reject(new Error("offline")) : api.heartbeat(id, versionId) };
    const laptop = new EditLockController(flaky, "laptop", 30_000);
    laptop.start("v1", "Chrome");
    await laptop.requestEdit();
    offline = true;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(laptop.getState()).toMatchObject({ mode: "editing", error: expect.stringContaining("Retrying") });
    offline = false;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(laptop.getState().error).toBeNull();
  });

  it("notifies subscribers on every change", async () => {
    const laptop = new EditLockController(fakeDatabase().api(), "laptop", 30_000);
    laptop.start("v1", "Chrome");
    const seen: string[] = [];
    const unsubscribe = laptop.subscribe(() => seen.push(laptop.getState().mode));
    await laptop.requestEdit();
    unsubscribe();
    await laptop.stopEditing();
    expect(seen).toEqual(["viewing", "acquiring", "editing"]);
  });
});

describe("isLockFresh", () => {
  it("uses the two-minute stale window", () => {
    const now = Date.parse("2026-09-25T17:02:00Z");
    expect(isLockFresh({ heartbeat_at: "2026-09-25T17:00:01Z" }, now)).toBe(true);
    expect(isLockFresh({ heartbeat_at: "2026-09-25T17:00:00Z" }, now)).toBe(false);
    expect(isLockFresh({ heartbeat_at: "not a date" }, now)).toBe(false);
  });
});

describe("describeBrowser", () => {
  it.each([
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36", "Chrome on Windows"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0", "Edge on Windows"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15", "Safari on Mac"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0 Mobile/15E148 Safari/604.1", "Chrome on iPhone"],
    ["Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0", "Firefox on Linux"],
    ["curl/8.0", "a browser"],
  ])("%s", (agent, expected) => expect(describeBrowser(agent)).toBe(expected));
});
