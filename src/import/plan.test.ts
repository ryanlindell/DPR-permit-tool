import { describe, expect, it } from "vitest";
import type { Field, Permit } from "../types";
import type { ParsedPermitRow, ParseResult } from "./parse";
import { isOutOfHours, planImport, toHHMM } from "./plan";

const field = (id: string, name: string): Field => ({ id, owner_id: "u", name, field_type: "Soccer", geometry: { type: "Polygon", coordinates: [] }, notes: "", created_at: "", updated_at: "" });
const fields = [field("fa", "Field A"), field("fb", "Field B")];
const parsedRow = (row: number, overrides: Partial<ParsedPermitRow> = {}): ParsedPermitRow =>
  ({ row, organization: "Kailua Youth Soccer", raw_field_name: "Field A", start_time: "17:00", end_time: "18:00", days: [1, 3], notes: "", extra: {}, ...overrides });
/** Postgres returns `time` columns with seconds, e.g. "17:00:00". */
const saved = (overrides: Partial<Permit> = {}): Permit => ({
  id: "p1", owner_id: "u", version_id: "v1", organization: "Kailua Youth Soccer", field_id: "fa", raw_field_name: "Field A",
  start_time: "17:00:00", end_time: "18:00:00", days: [1, 3], notes: "", extra: {}, import_batch_id: null, created_at: "", updated_at: "", ...overrides,
});
const plan = (parsed: ParseResult, existingPermits: Permit[] = []) => planImport(parsed, { existingPermits, fields, versionId: "v1", importBatchId: "batch-1" });

describe("planImport", () => {
  it("matches field names, builds insert rows for the active version, and tags the batch", () => {
    const report = plan({ rows: [parsedRow(2, { raw_field_name: "  field   b " })], rejected: [] });
    expect(report.toInsert).toEqual([{ version_id: "v1", organization: "Kailua Youth Soccer", field_id: "fb", raw_field_name: "  field   b ", start_time: "17:00", end_time: "18:00", days: [1, 3], notes: "", extra: {}, import_batch_id: "batch-1" }]);
    expect(report.addedRows).toEqual([2]);
    expect(report.broken).toEqual([]);
  });

  it("skips rows already in the version even though the database returns HH:MM:SS times", () => {
    const report = plan({ rows: [parsedRow(2, { organization: " kailua youth  SOCCER", days: [3, 1] })], rejected: [] }, [saved()]);
    expect(report.toInsert).toEqual([]);
    expect(report.duplicateRows).toEqual([2]);
  });

  it("re-importing the same rows adds nothing the second time", () => {
    const parsed: ParseResult = { rows: [parsedRow(2), parsedRow(3, { raw_field_name: "Feild A" })], rejected: [] };
    const first = plan(parsed);
    const nowSaved = first.toInsert.map((p, i) => saved({ ...p, id: `p${i}`, start_time: `${p.start_time}:00`, end_time: `${p.end_time}:00` }));
    const second = plan(parsed, nowSaved);
    expect(first.toInsert).toHaveLength(2);
    expect(second.toInsert).toHaveLength(0);
    expect(second.duplicateRows).toEqual([2, 3]);
  });

  it("de-duplicates rows repeated within the same file", () => {
    const report = plan({ rows: [parsedRow(2), parsedRow(5)], rejected: [] });
    expect(report.addedRows).toEqual([2]);
    expect(report.duplicateRows).toEqual([5]);
  });

  it("treats a changed time as a new permit rather than a duplicate", () => {
    const report = plan({ rows: [parsedRow(2, { start_time: "17:30" })], rejected: [] }, [saved()]);
    expect(report.addedRows).toEqual([2]);
  });

  it("imports unmatched field names as broken permits with a null field_id", () => {
    const report = plan({ rows: [parsedRow(4, { raw_field_name: "Feild A" })], rejected: [] });
    expect(report.toInsert[0].field_id).toBeNull();
    expect(report.broken).toEqual([{ row: 4, rawFieldName: "Feild A" }]);
  });

  it("flags but still imports times outside 5:00 AM to 10:00 PM", () => {
    const report = plan({ rows: [parsedRow(2, { start_time: "04:30", end_time: "06:00" }), parsedRow(3, { start_time: "21:00", end_time: "22:30" }), parsedRow(4, { start_time: "05:00", end_time: "22:00", days: [0] })], rejected: [] });
    expect(report.addedRows).toEqual([2, 3, 4]);
    expect(report.outOfHours.map((o) => o.row)).toEqual([2, 3]);
  });

  it("passes rejected rows straight through to the report", () => {
    const report = plan({ rows: [], rejected: [{ row: 7, reason: "Field is missing" }] });
    expect(report.rejected).toEqual([{ row: 7, reason: "Field is missing" }]);
  });
});

describe("time helpers", () => {
  it("toHHMM strips seconds and whitespace", () => {
    expect(toHHMM("17:00:00")).toBe("17:00");
    expect(toHHMM(" 09:15 ")).toBe("09:15");
  });
  it("isOutOfHours uses the calendar range from appConfig with inclusive edges", () => {
    expect(isOutOfHours("05:00", "22:00:00")).toBe(false);
    expect(isOutOfHours("04:59", "06:00")).toBe(true);
    expect(isOutOfHours("21:00", "22:01")).toBe(true);
  });
});
