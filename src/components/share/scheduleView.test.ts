import { describe, expect, it } from "vitest";
import type { Field, FieldOverlap, Permit } from "../../types";
import { deriveScheduleView } from "./scheduleView";

const field = (id: string): Field => ({ id, owner_id: "u", name: id.toUpperCase(), field_type: "Soccer", geometry: { type: "Polygon", coordinates: [] }, notes: "", created_at: "", updated_at: "" });
const permit = (id: string, field_id: string | null, start: string, end: string, days: number[]): Permit => ({
  id, owner_id: "u", version_id: "v", organization: id, field_id, raw_field_name: field_id ?? "?", start_time: start, end_time: end, days, notes: "", extra: {}, import_batch_id: null, created_at: "", updated_at: "",
});
const fields = [field("a"), field("b"), field("c")];
const overlaps: FieldOverlap[] = [{ owner_id: "u", field_a: "a", field_b: "b" }];
const permits = [
  permit("p1", "a", "17:00", "18:00", [1]),
  permit("p2", "b", "17:30", "18:30", [1]), // conflicts with p1 through the a/b overlap
  permit("p3", "c", "17:00", "18:00", [1]), // c overlaps nothing
  permit("p4", null, "17:00", "18:00", [1]), // broken permits never conflict
];

describe("deriveScheduleView", () => {
  it("colors both fields of a conflict across overlapping fields", () => {
    const view = deriveScheduleView(fields, overlaps, permits, null);
    expect([...view.conflictingFieldIds].sort()).toEqual(["a", "b"]);
    expect(view.conflictsByPermit.get("p1")?.map((c) => c.conflicts_with.id)).toEqual(["p2"]);
    expect(view.sidebarPermits).toEqual([]);
    expect(view.calendarPermits).toEqual([]);
  });

  it("gives the sidebar the selected field's permits and the calendar its overlapping neighbours too", () => {
    const view = deriveScheduleView(fields, overlaps, permits, "a");
    expect(view.sidebarPermits.map((p) => p.id)).toEqual(["p1"]);
    expect(view.calendarFields.map((f) => f.id)).toEqual(["a", "b"]);
    expect(view.calendarPermits.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect([...view.calendarConflictIds].sort()).toEqual(["p1", "p2"]);
  });
});
