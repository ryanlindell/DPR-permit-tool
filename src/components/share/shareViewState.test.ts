import { describe, expect, it } from "vitest";
import type { SharedView } from "../../data/share";
import { shareViewReducer, type ShareViewState } from "./shareViewState";

const view = (name: string): SharedView => ({ fields: [], overlaps: [], permits: [], settings: { home_center: { lat: 0, lng: 0 }, home_zoom: 18 }, version: { id: "v", owner_id: "u", name, created_at: "" } });

describe("shareViewReducer", () => {
  it("shows the schedule once loaded, and each refresh replaces it", () => {
    let state: ShareViewState = { status: "loading" };
    state = shareViewReducer(state, { type: "loaded", view: view("Original"), at: 1 });
    state = shareViewReducer(state, { type: "loaded", view: view("Plan B"), at: 2 });
    expect(state).toEqual({ status: "ready", view: view("Plan B"), updatedAt: 2, refreshError: null });
  });

  it("shows 'not available' for a bad link, and when sharing is turned off mid-meeting", () => {
    expect(shareViewReducer({ status: "loading" }, { type: "loaded", view: null, at: 1 })).toEqual({ status: "unavailable" });
    const ready = shareViewReducer({ status: "loading" }, { type: "loaded", view: view("Original"), at: 1 });
    expect(shareViewReducer(ready, { type: "loaded", view: null, at: 2 })).toEqual({ status: "unavailable" });
  });

  it("keeps the last schedule on screen when a refresh fails, then clears the warning on recovery", () => {
    const ready = shareViewReducer({ status: "loading" }, { type: "loaded", view: view("Original"), at: 1 });
    const failed = shareViewReducer(ready, { type: "failed", message: "Failed to fetch" });
    expect(failed).toEqual({ status: "ready", view: view("Original"), updatedAt: 1, refreshError: "Failed to fetch" });
    expect(shareViewReducer(failed, { type: "loaded", view: view("Original"), at: 3 })).toMatchObject({ refreshError: null, updatedAt: 3 });
  });

  it("shows an error when the first load fails", () => {
    expect(shareViewReducer({ status: "loading" }, { type: "failed", message: "offline" })).toEqual({ status: "error", message: "offline" });
  });
});
