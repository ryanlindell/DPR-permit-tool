import { describe, expect, it } from "vitest";
import { computeConflicts } from "./conflicts";
import type { Permit } from "../types";

const permit = (id: string, field_id: string | null, days: number[], start_time: string, end_time: string): Permit => ({
  id, owner_id: "owner", version_id: "v", organization: id, field_id, raw_field_name: "Field", days, start_time, end_time, notes: "", extra: {}, import_batch_id: null, created_at: "", updated_at: "",
});

describe("computeConflicts", () => {
  it("detects field overlap only on shared days and shared time", () => {
    const conflicts = computeConflicts([permit("a", "A", [1, 3], "17:00", "18:00"), permit("b", "B", [3], "17:30", "18:30")], [{ field_a: "A", field_b: "B" }]);
    expect(conflicts.get("a")?.[0]?.shared_days).toEqual([3]);
  });
  it("does not merge days and times across permits from one organization", () => {
    const permits = [
      { ...permit("a", "A", [1], "17:00", "18:00"), organization: "Org 1" },
      { ...permit("b", "A", [2], "18:00", "19:00"), organization: "Org 1" },
      { ...permit("c", "A", [2], "17:00", "18:00"), organization: "Org 2" },
    ];
    expect([...computeConflicts(permits, []).values()].every((items) => items.length === 0)).toBe(true);
  });
  it("ignores broken permits and back-to-back slots", () => {
    const conflicts = computeConflicts([permit("a", "A", [1], "17:00", "18:00"), permit("b", "A", [1], "18:00", "19:00"), permit("c", null, [1], "17:00", "19:00")], []);
    expect([...conflicts.values()].every((items) => items.length === 0)).toBe(true);
  });
  it("does not compare permits from different versions", () => {
    const a = permit("a", "A", [1], "17:00", "18:00");
    const b = { ...permit("b", "A", [1], "17:00", "18:00"), version_id: "another-version" };
    expect(computeConflicts([a, b], []).get("a")).toEqual([]);
  });
});
