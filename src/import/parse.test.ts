import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type { PermitAttribute } from "../config/permitSchema";
import { ImportFileError, formatTime12h, parseDayValue, parsePermitGrid, parsePermitWorkbook, parseTimeValue, toCellValue, type CellValue } from "./parse";

const HEADER = ["Organization", "Field", "Start Time", "End Time", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Notes"];
const row = (org: CellValue, field: CellValue, start: CellValue, end: CellValue, dayCells: CellValue[] = ["Y", null, null, null, null, null, null], notes: CellValue = null): CellValue[] =>
  [org, field, start, end, ...dayCells, notes];
/** Excel stores times as a fraction of a day; exceljs returns time-formatted cells as Dates on 1899-12-30 UTC. */
const excelDate = (h: number, m = 0) => new Date(Date.UTC(1899, 11, 30, h, m));

describe("parseTimeValue", () => {
  it.each<[CellValue, string | null]>([
    ["5:30 PM", "17:30"], ["5:30pm", "17:30"], ["5 pm", "17:00"], ["5p", "17:00"], ["5:30 p.m.", "17:30"],
    ["12:00 PM", "12:00"], ["12:15 AM", "00:15"], ["noon", "12:00"], ["17:30", "17:30"], [" 07:05 ", "07:05"],
    ["5", null], ["13:00 PM", null], ["0:30 AM", null], ["5:75 PM", null], ["24:00", null], ["after school", null], ["", null], [null, null], [true, null],
  ])("text/other %j -> %j", (input, expected) => expect(parseTimeValue(input)).toBe(expected));

  it("reads Excel day fractions, rounding float noise to the nearest minute", () => {
    expect(parseTimeValue(17.5 / 24)).toBe("17:30");
    expect(parseTimeValue(0.7083333333)).toBe("17:00");
    expect(parseTimeValue(45000 + 9 / 24)).toBe("09:00"); // a full date-time serial: only the time part counts
    expect(parseTimeValue(-1)).toBeNull();
  });

  it("reads exceljs Dates using UTC so the reader's time zone never shifts the time", () => {
    expect(parseTimeValue(excelDate(17, 30))).toBe("17:30");
    expect(parseTimeValue(new Date(Date.UTC(1899, 11, 30, 16, 59, 59, 990)))).toBe("17:00");
    expect(parseTimeValue(new Date(Number.NaN))).toBeNull();
  });
});

describe("parseDayValue", () => {
  it("treats Y/yes/x as used, blank/N as unused, anything else as an error", () => {
    for (const yes of ["Y", "y", " yes ", "X", "✓", true]) expect(parseDayValue(yes)).toBe(true);
    for (const no of [null, "", "  ", "N", "no", false]) expect(parseDayValue(no)).toBe(false);
    expect(parseDayValue("maybe")).toBeNull();
  });
});

describe("parsePermitGrid", () => {
  it("parses a valid row into a normalized permit with DB day numbers (0=Sun)", () => {
    const result = parsePermitGrid([HEADER, row("  Kailua   Youth Soccer ", "Field A", "5:00 PM", excelDate(18, 30), [null, "Y", null, null, null, "Y", "Y"], " U10 ")]);
    expect(result.rejected).toEqual([]);
    expect(result.rows).toEqual([{ row: 2, organization: "Kailua Youth Soccer", raw_field_name: "Field A", start_time: "17:00", end_time: "18:30", days: [0, 2, 6], notes: "U10", extra: {} }]);
  });

  it("finds columns by header name, in any order and letter case", () => {
    const header = ["notes", "SUNDAY", "end", "Start", "field", "org", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const result = parsePermitGrid([header, ["n", "Y", "6:00 PM", "5:00 PM", "F", "O", null, null, null, null, null, null]]);
    expect(result.rows[0]).toMatchObject({ organization: "O", raw_field_name: "F", start_time: "17:00", end_time: "18:00", days: [0], notes: "n" });
  });

  it("skips blank rows and keeps spreadsheet row numbers accurate", () => {
    const blank = HEADER.map(() => null);
    const result = parsePermitGrid([HEADER, blank, row("A", "F", "5 PM", "6 PM"), ["", "  ", null]]);
    expect(result.rows.map((r) => r.row)).toEqual([3]);
  });

  it("reports every problem on a rejected row", () => {
    const result = parsePermitGrid([HEADER, row("", "", "later", "", [null, null, null, null, null, null, null])]);
    expect(result.rows).toEqual([]);
    expect(result.rejected).toHaveLength(1);
    const { reason } = result.rejected[0];
    for (const text of ["Organization is missing", "Field is missing", 'Start Time "later" is not a time', "End Time is missing", "No days marked"]) expect(reason).toContain(text);
  });

  it("rejects end times that are not after the start, including back-to-back equal times", () => {
    const result = parsePermitGrid([HEADER, row("A", "F", "6:00 PM", "5:00 PM"), row("A", "F", "6:00 PM", "6:00 PM")]);
    expect(result.rejected.map((r) => r.row)).toEqual([2, 3]);
    expect(result.rejected[0].reason).toContain("End Time (5:00 PM) must be after Start Time (6:00 PM)");
  });

  it("rejects day cells that are not Y or blank", () => {
    const result = parsePermitGrid([HEADER, row("A", "F", "5 PM", "6 PM", ["maybe", null, null, null, null, null, null])]);
    expect(result.rejected[0].reason).toBe('Mon should be Y or blank, not "maybe"');
  });

  it("throws a friendly file-level error when template columns are missing", () => {
    expect(() => parsePermitGrid([["Name", "Where", "When"]])).toThrow(ImportFileError);
    expect(() => parsePermitGrid([["Organization", "Field"]])).toThrow(/Missing columns: Start Time, End Time, Mon/);
    expect(() => parsePermitGrid([])).toThrow(/empty/);
  });

  it("allows the optional Notes column to be absent", () => {
    const result = parsePermitGrid([HEADER.slice(0, -1), row("A", "F", "5 PM", "6 PM").slice(0, -1)]);
    expect(result.rows[0].notes).toBe("");
  });

  it("reads extra permitSchema attributes into `extra` and validates them", () => {
    const schema: PermitAttribute[] = [
      { key: "contactName", label: "Contact Name", type: "text", required: true, showInSidebar: true, editable: true },
      { key: "players", label: "Players", type: "number", required: false, showInSidebar: false, editable: true },
      { key: "level", label: "Level", type: "select", options: ["Youth", "Adult"], required: false, showInSidebar: true, editable: true },
    ];
    const header = [...HEADER, "Contact Name", "Players", "Level"];
    const result = parsePermitGrid([
      header,
      [...row("A", "F", "5 PM", "6 PM"), "Pat", "1,200", "youth"],
      [...row("B", "F", "5 PM", "6 PM"), "", "lots", "Senior"],
    ], schema);
    expect(result.rows[0].extra).toEqual({ contactName: "Pat", players: 1200, level: "Youth" });
    expect(result.rejected[0].reason).toBe("Contact Name is required; Players must be a number; Level must be one of: Youth, Adult");
  });
});

describe("toCellValue", () => {
  it("unwraps exceljs rich text, formulas, hyperlinks and errors", () => {
    expect(toCellValue({ richText: [{ text: "Field " }, { text: "A" }] })).toBe("Field A");
    expect(toCellValue({ formula: "A1", result: 0.75 })).toBe(0.75);
    expect(toCellValue({ text: "Club site", hyperlink: "https://example.org" })).toBe("Club site");
    expect(toCellValue({ error: "#N/A" })).toBeNull();
    expect(toCellValue(undefined)).toBeNull();
  });
});

describe("formatTime12h", () => {
  it("formats database and import times for people", () => {
    expect(formatTime12h("17:30:00")).toBe("5:30 PM");
    expect(formatTime12h("00:05")).toBe("12:05 AM");
    expect(formatTime12h("12:00")).toBe("12:00 PM");
  });
});

describe("parsePermitWorkbook with the committed sample fixture", () => {
  it("reads good rows, keeps duplicates for de-dup, and rejects invalid rows with row numbers", async () => {
    const file = await readFile(new URL("./__fixtures__/sample-import.xlsx", import.meta.url));
    const result = await parsePermitWorkbook(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer);

    expect(result.rows.map((r) => r.row)).toEqual([2, 3, 4, 5, 6, 7, 13]);
    expect(result.rows[0]).toMatchObject({ organization: "Kailua Youth Soccer", raw_field_name: "Field A", start_time: "17:00", end_time: "18:30", days: [1, 3] });
    expect(result.rows[3]).toMatchObject({ organization: "Lanikai Lacrosse", start_time: "18:00", end_time: "19:45", days: [5] });
    expect(result.rows[5]).toMatchObject({ raw_field_name: "Feild A" });

    expect(result.rejected.map((r) => r.row)).toEqual([9, 10, 11, 12]);
    expect(result.rejected[0].reason).toContain("Organization is missing");
    expect(result.rejected[1].reason).toContain("must be after Start Time");
    expect(result.rejected[2].reason).toContain("No days marked");
    expect(result.rejected[3].reason).toContain('Start Time "after school" is not a time');
    expect(result.rejected[3].reason).toContain('Mon should be Y or blank, not "maybe"');
  });

  it("rejects files that are not Excel workbooks", async () => {
    await expect(parsePermitWorkbook(new TextEncoder().encode("not a zip").buffer as ArrayBuffer)).rejects.toThrow(ImportFileError);
  });
});
