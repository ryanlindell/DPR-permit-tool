import { describe, expect, it } from "vitest";
import type { PermitAttribute } from "../config/permitSchema";
import { parsePermitWorkbook } from "./parse";
import type { DataValidation, Worksheet } from "exceljs";
import { FIELD_LIST_SHEET_NAME, INSTRUCTIONS_SHEET_NAME, TEMPLATE_ROWS, buildTemplateWorkbook } from "./template";

/** Validations are registered per column range, e.g. "B2:B501". */
const validationFor = (sheet: Worksheet, column: string): DataValidation | undefined =>
  (sheet as unknown as { dataValidations: { model: Record<string, DataValidation> } }).dataValidations.model[`${column}2:${column}${TEMPLATE_ROWS + 1}`];

const excelTime = (h: number, m = 0) => (h * 60 + m) / 1440;

describe("buildTemplateWorkbook", () => {
  it("has the template columns in order, with the Permits sheet first", async () => {
    const workbook = await buildTemplateWorkbook(["Field B", "Field A"]);
    expect(workbook.worksheets.map((ws) => ws.name)).toEqual(["Permits", INSTRUCTIONS_SHEET_NAME, FIELD_LIST_SHEET_NAME]);
    const header = workbook.getWorksheet("Permits")!.getRow(1).values as unknown[];
    expect(header.slice(1)).toEqual(["Organization", "Field", "Start Time", "End Time", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Notes"]);
  });

  it("builds the Field dropdown from the account's field names via a hidden list sheet", async () => {
    const workbook = await buildTemplateWorkbook(["Field B", "Field, Upper", "Field A", "Field A "]);
    const list = workbook.getWorksheet(FIELD_LIST_SHEET_NAME)!;
    expect(list.state).toBe("hidden");
    expect(list.getColumn(1).values.slice(1)).toEqual(["Field A", "Field B", "Field, Upper"]);
    const validation = validationFor(workbook.getWorksheet("Permits")!, "B");
    expect(validation).toMatchObject({ type: "list", formulae: [`'${FIELD_LIST_SHEET_NAME}'!$A$1:$A$3`], errorStyle: "warning" });
  });

  it("omits the dropdown (but keeps the column) when no fields are drawn yet", async () => {
    const workbook = await buildTemplateWorkbook([]);
    expect(workbook.getWorksheet(FIELD_LIST_SHEET_NAME)).toBeUndefined();
    expect(validationFor(workbook.getWorksheet("Permits")!, "B")).toBeUndefined();
  });

  it("formats and validates time cells and restricts day cells to Y", async () => {
    const sheet = (await buildTemplateWorkbook(["Field A"])).getWorksheet("Permits")!;
    expect(sheet.getCell("C2").numFmt).toBe("h:mm AM/PM");
    expect(validationFor(sheet, "D")).toMatchObject({ type: "decimal", operator: "between", errorStyle: "stop" });
    expect(validationFor(sheet, "E")).toMatchObject({ type: "list", formulae: ['"Y"'] });
  });

  it("explains the one-row-per-time-slot rule and shows an organization using two rows", async () => {
    const sheet = (await buildTemplateWorkbook(["Field A"])).getWorksheet(INSTRUCTIONS_SHEET_NAME)!;
    const texts: string[] = [];
    sheet.eachRow((row) => texts.push((row.values as unknown[]).filter((v) => typeof v === "string").join(" | ")));
    expect(texts.join("\n")).toContain("Each row is one time slot. If your times differ by day, use a separate row for each time.");
    expect(texts.filter((t) => t.startsWith("Kailua Youth Soccer"))).toHaveLength(2);
  });

  it("adds permitSchema extras as columns, with a dropdown for select attributes", async () => {
    const schema: PermitAttribute[] = [{ key: "level", label: "Level", type: "select", options: ["Youth", "Adult"], required: true, showInSidebar: true, editable: true }];
    const sheet = (await buildTemplateWorkbook([], schema)).getWorksheet("Permits")!;
    expect(sheet.getCell("M1").value).toBe("Level");
    expect(validationFor(sheet, "M")).toMatchObject({ type: "list", formulae: ['"Youth,Adult"'] });
  });

  it("registers one validation range per column, never per cell (per-cell ranges overlap and make Excel offer to repair the file)", async () => {
    const sheet = (await buildTemplateWorkbook(["Field A"])).getWorksheet("Permits")!;
    const ranges = Object.keys((sheet as unknown as { dataValidations: { model: Record<string, unknown> } }).dataValidations.model);
    expect(ranges).toEqual(["B", "C", "D", "E", "F", "G", "H", "I", "J", "K"].map((c) => `${c}2:${c}${TEMPLATE_ROWS + 1}`));
  });

  it("round-trips: a filled-in template parses back into permits", async () => {
    const workbook = await buildTemplateWorkbook(["Field A"]);
    const sheet = workbook.getWorksheet("Permits")!;
    sheet.getRow(2).values = ["Kailua Youth Soccer", "Field A", excelTime(17), excelTime(18, 30), "Y", null, "Y", null, null, null, null, "U10"];
    sheet.getRow(3).values = ["Kailua Youth Soccer", "Field A", "9:00 AM", "11:00 AM", null, null, null, null, null, "Y", null, ""];
    const buffer = await workbook.xlsx.writeBuffer();
    const result = await parsePermitWorkbook(buffer as ArrayBuffer);
    expect(result.rejected).toEqual([]);
    expect(result.rows.map(({ row, start_time, end_time, days }) => ({ row, start_time, end_time, days }))).toEqual([
      { row: 2, start_time: "17:00", end_time: "18:30", days: [1, 3] },
      { row: 3, start_time: "09:00", end_time: "11:00", days: [6] },
    ]);
  });
});
