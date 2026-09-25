import type { SharedView } from "../../data/share";

/** What the share page is showing. A failed refresh keeps the last good schedule on screen. */
export type ShareViewState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "error"; message: string }
  | { status: "ready"; view: SharedView; updatedAt: number; refreshError: string | null };

export type ShareViewEvent =
  | { type: "loaded"; view: SharedView | null; at: number }
  | { type: "failed"; message: string };

export function shareViewReducer(state: ShareViewState, event: ShareViewEvent): ShareViewState {
  if (event.type === "loaded") {
    // null means the link is wrong, was regenerated, or sharing was turned off, even mid-meeting.
    return event.view ? { status: "ready", view: event.view, updatedAt: event.at, refreshError: null } : { status: "unavailable" };
  }
  // A projector should not go blank because one refresh failed; keep the data and say so.
  if (state.status === "ready") return { ...state, refreshError: event.message };
  return { status: "error", message: event.message };
}
