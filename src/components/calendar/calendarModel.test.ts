import { describe, expect, it } from "vitest";
import type { Conflict, Field, Permit } from "../../types";
import {
  applyOccurrenceChange, buildOccurrences, canDropOnDay, dateForDay, describeConflict, formatDays, formatTimeRange, fromCalendarDate, toIso, visibleRange,
} from "./calendarModel";

const permit = (id: string, field_id: string | null, days: number[], start_time: string, end_time: string, organization = id): Permit => ({
  id, owner_id: "owner", version_id: "v", organization, field_id, raw_field_name: "Field", days, start_time, end_time, notes: "", extra: {}, import_batch_id: null, created_at: "", updated_at: "",
});
const field = (id: string, name: string): Field => ({
  id, owner_id: "owner", name, field_type: "Soccer", geometry: { type: "Polygon", coordinates: [] }, notes: "", created_at: "", updated_at: "",
});

describe("generic week", () => {
  it("maps every weekday to a date in the fixed Monday-first week and back", () => {
    for (let day = 0; day < 7; day++) {
      const date = new Date(`${toIso(day, "17:15")}Z`);
      expect(fromCalendarDate(date)).toEqual({ day, time: "17:15" });
    }
    expect(dateForDay(1)).toBe("2024-01-01");
    expect(dateForDay(0)).toBe("2024-01-07");
  });
  it("accepts HH:MM:SS from Postgres", () => {
    expect(toIso(2, "05:30:00")).toBe("2024-01-02T05:30:00");
  });
});

describe("formatting", () => {
  it("formats time ranges and days the way the conflict text needs", () => {
    expect(formatTimeRange("17:00", "18:00")).toBe("5:00-6:00 PM");
    expect(formatTimeRange("11:00", "13:30:00")).toBe("11:00 AM-1:30 PM");
    expect(formatTimeRange("00:00", "12:00")).toBe("12:00 AM-12:00 PM");
    expect(formatDays([4, 0, 2])).toBe("Tue/Thu/Sun");
  });
  it("describes a conflict per SPEC 4.3", () => {
    const other = permit("q", "B", [2, 4], "17:00", "18:00", "Kailua Youth Soccer");
    const conflict: Conflict = { permit_id: "p", conflicts_with: other, shared_days: [2, 4] };
    expect(describeConflict(conflict, (id) => (id === "B" ? "Field B" : "?"))).toBe("Conflicts with Kailua Youth Soccer on Field B, Tue/Thu 5:00-6:00 PM");
  });
});

describe("buildOccurrences", () => {
  const fields = [field("A", "Field A"), field("B", "Field B")];
  it("emits one event per day and marks other-field and conflicting permits", () => {
    const events = buildOccurrences([permit("p", "A", [1, 3], "17:00", "18:00"), permit("q", "B", [3], "17:30", "18:30")], fields, "A", new Set(["q"]));
    expect(events.map((e) => e.id)).toEqual(["p::1", "p::3", "q::3"]);
    expect(events[0]).toMatchObject({ start: "2024-01-01T17:00:00", end: "2024-01-01T18:00:00", extendedProps: { isOtherField: false, conflicting: false } });
    expect(events[2]).toMatchObject({ classNames: ["permit-event", "is-conflict", "is-other-field"], extendedProps: { isOtherField: true, fieldName: "Field B", conflicting: true } });
  });
  it("skips broken permits, permits on fields not passed in, and duplicated days", () => {
    const events = buildOccurrences([permit("broken", null, [1], "17:00", "18:00"), permit("far", "Z", [1], "17:00", "18:00"), permit("dup", "A", [2, 2], "17:00", "18:00")], fields, "A", new Set());
    expect(events.map((e) => e.id)).toEqual(["dup::2"]);
  });
});

describe("visibleRange", () => {
  it("defaults to 5 AM-10 PM and widens to include out-of-hours permits", () => {
    const fields = [field("A", "Field A")];
    expect(visibleRange(buildOccurrences([permit("p", "A", [1], "17:00", "18:00")], fields, "A", new Set()))).toEqual({ slotMinTime: "05:00:00", slotMaxTime: "22:00:00" });
    expect(visibleRange(buildOccurrences([permit("p", "A", [1], "04:30", "05:30"), permit("q", "A", [1], "21:30", "22:15")], fields, "A", new Set()))).toEqual({ slotMinTime: "04:00:00", slotMaxTime: "23:00:00" });
  });
});

describe("applyOccurrenceChange (SPEC 5.6 drag rules)", () => {
  const monWed = permit("p", "A", [1, 3], "17:00", "18:00");

  it("vertical drag changes the time for all days", () => {
    const result = applyOccurrenceChange(monWed, 1, { day: 1, time: "18:15" }, { day: 1, time: "19:15" });
    expect(result).toEqual({ kind: "changed", permit: { ...monWed, start_time: "18:15", end_time: "19:15" } });
  });
  it("horizontal drag moves only that occurrence's day (Mon/Wed, Mon -> Tue = Tue/Wed)", () => {
    const result = applyOccurrenceChange(monWed, 1, { day: 2, time: "17:00" }, { day: 2, time: "18:00" });
    expect(result).toEqual({ kind: "changed", permit: { ...monWed, days: [2, 3] } });
  });
  it("moving Sunday keeps days sorted", () => {
    const result = applyOccurrenceChange(permit("s", "A", [0, 3], "09:00", "10:00"), 0, { day: 5, time: "09:00" }, { day: 5, time: "10:00" });
    expect(result.kind === "changed" && result.permit.days).toEqual([3, 5]);
  });
  it("rejects a drop onto a day the permit already has", () => {
    const result = applyOccurrenceChange(monWed, 1, { day: 3, time: "17:00" }, { day: 3, time: "18:00" });
    expect(result).toEqual({ kind: "rejected", reason: "p already has this slot on Wednesday." });
    expect(canDropOnDay(monWed, 1, 3)).toBe(false);
    expect(canDropOnDay(monWed, 1, 1)).toBe(true);
    expect(canDropOnDay(monWed, 1, 2)).toBe(true);
  });
  it("diagonal drag applies both the new time and the new day", () => {
    const result = applyOccurrenceChange(monWed, 3, { day: 4, time: "16:00" }, { day: 4, time: "17:00" });
    expect(result).toEqual({ kind: "changed", permit: { ...monWed, days: [1, 4], start_time: "16:00", end_time: "17:00" } });
  });
  it("resize changes the duration for all days", () => {
    const result = applyOccurrenceChange(monWed, 3, { day: 3, time: "17:00" }, { day: 3, time: "19:30" });
    expect(result).toEqual({ kind: "changed", permit: { ...monWed, end_time: "19:30" } });
  });
  it("keeps the HH:MM:SS format that Postgres returns", () => {
    const stored = permit("p", "A", [1], "17:00:00", "18:00:00");
    const result = applyOccurrenceChange(stored, 1, { day: 1, time: "17:15" }, { day: 1, time: "18:15" });
    expect(result.kind === "changed" && [result.permit.start_time, result.permit.end_time]).toEqual(["17:15:00", "18:15:00"]);
  });
  it("reports a drop back to the same place as unchanged", () => {
    expect(applyOccurrenceChange(monWed, 1, { day: 1, time: "17:00" }, { day: 1, time: "18:00" })).toEqual({ kind: "unchanged" });
    expect(applyOccurrenceChange(permit("p", "A", [1], "17:00:00", "18:00:00"), 1, { day: 1, time: "17:00" }, { day: 1, time: "18:00" })).toEqual({ kind: "unchanged" });
  });
  it("rejects a slot that runs past midnight or ends before it starts", () => {
    expect(applyOccurrenceChange(monWed, 1, { day: 1, time: "23:00" }, { day: 2, time: "01:00" }).kind).toBe("rejected");
    expect(applyOccurrenceChange(monWed, 1, { day: 1, time: "18:00" }, { day: 1, time: "18:00" }).kind).toBe("rejected");
  });
  it("does not mutate the input permit", () => {
    const original = permit("p", "A", [1, 3], "17:00", "18:00");
    applyOccurrenceChange(original, 1, { day: 2, time: "18:00" }, { day: 2, time: "19:00" });
    expect(original).toEqual(permit("p", "A", [1, 3], "17:00", "18:00"));
  });
});
