import type { Cell, DataValidation, Workbook, Worksheet } from "exceljs";
import type { PermitAttribute } from "../config/permitSchema";
import { importColumns, type ImportColumn } from "./columns";
import { PERMITS_SHEET_NAME } from "./parse";

/** How many empty, pre-formatted rows the template offers. Rows below still import; they just lack dropdowns. */
export const TEMPLATE_ROWS = 500;
export const FIELD_LIST_SHEET_NAME = "Field list";
export const INSTRUCTIONS_SHEET_NAME = "Instructions";
export const TEMPLATE_FILE_NAME = "permit-request-template.xlsx";

const TIME_FORMAT = "h:mm AM/PM";
const HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FF197A58" } } as const;

/** Excel stores a time of day as a fraction of 24 hours, so 5:30 PM is 17.5 / 24. */
const excelTime = (hours: number, minutes = 0) => (hours * 60 + minutes) / 1440;

/** Example rows for the Instructions sheet: one organization, two time slots, so two rows. */
function exampleRows(fieldNames: readonly string[]) {
  const field = fieldNames[0] ?? "Field A";
  return [
    { organization: "Kailua Youth Soccer", field, start: excelTime(17), end: excelTime(18, 30), days: ["Mon", "Wed"], notes: "U10 practice" },
    { organization: "Kailua Youth Soccer", field, start: excelTime(9), end: excelTime(11), days: ["Sat"], notes: "Games" },
  ];
}

/** Inline list for an Excel dropdown. Excel splits on commas, so an option cannot contain one. */
function listFormula(options: readonly string[]): string {
  return `"${options.map((o) => o.replace(/"/g, "'").replace(/,/g, " ")).join(",")}"`;
}

function columnLetter(index: number): string {
  let n = index + 1;
  let letters = "";
  while (n > 0) { letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters; n = Math.floor((n - 1) / 26); }
  return letters;
}

/** exceljs supports range-keyed validations at runtime but leaves `dataValidations` out of its type definitions. */
type WorksheetWithValidations = Worksheet & { dataValidations: { add(range: string, validation: DataValidation): void } };

function styleHeader(sheet: Worksheet, columns: readonly ImportColumn[]) {
  sheet.columns = columns.map((column) => ({ header: column.label, key: column.label, width: column.width }));
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  header.height = 22;
  columns.forEach((_, index) => { header.getCell(index + 1).fill = HEADER_FILL; });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

function addPermitsSheet(workbook: Workbook, columns: readonly ImportColumn[], fieldNames: readonly string[]) {
  const sheet = workbook.addWorksheet(PERMITS_SHEET_NAME, { properties: { tabColor: { argb: "FF197A58" } } });
  styleHeader(sheet, columns);

  const fieldListRange = fieldNames.length ? `'${FIELD_LIST_SHEET_NAME}'!$A$1:$A$${fieldNames.length}` : null;
  const lastRow = TEMPLATE_ROWS + 1;
  columns.forEach((column, index) => {
    const letter = columnLetter(index);
    // One validation per column range. Setting cell.dataValidation per cell instead lets exceljs
    // merge cells into ranges itself, and it sorts addresses as text ("B10" before "B2"), which
    // produces overlapping ranges that make Excel offer to "repair" the file.
    const validate = (validation: DataValidation) => (sheet as WorksheetWithValidations).dataValidations.add(`${letter}2:${letter}${lastRow}`, validation);
    const format = (apply: (cell: Cell) => void) => { for (let r = 2; r <= lastRow; r += 1) apply(sheet.getCell(r, index + 1)); };
    switch (column.kind) {
      case "field":
        if (fieldListRange) {
          // Warning (not Stop): a permit can still name a field that has not been drawn yet;
          // it imports as a "broken" permit that staff match up later.
          validate({ type: "list", allowBlank: true, formulae: [fieldListRange], showErrorMessage: true, errorStyle: "warning", errorTitle: "Unknown field", error: "That field is not in the list. Pick one from the dropdown if you can. Click Yes to keep what you typed." });
        }
        break;
      case "start":
      case "end":
        format((cell) => { cell.numFmt = TIME_FORMAT; });
        validate({ type: "decimal", operator: "between", allowBlank: true, formulae: [0, 0.99999], showInputMessage: true, promptTitle: column.label, prompt: "Type a time like 5:30 PM", showErrorMessage: true, errorStyle: "stop", errorTitle: "Not a time", error: "Please type a time like 5:30 PM or 9:00 AM." });
        break;
      case "day":
        format((cell) => { cell.alignment = { horizontal: "center" }; });
        validate({ type: "list", allowBlank: true, formulae: ['"Y"'], showErrorMessage: true, errorStyle: "stop", errorTitle: column.label, error: "Type Y if you need this day, or leave it blank." });
        break;
      case "notes":
        format((cell) => { cell.alignment = { wrapText: true, vertical: "top" }; });
        break;
      case "extra":
        if (column.attribute.type === "select" && column.attribute.options?.length) {
          validate({ type: "list", allowBlank: !column.attribute.required, formulae: [listFormula(column.attribute.options)], showErrorMessage: true, errorStyle: "stop", error: `Pick one of: ${column.attribute.options.join(", ")}` });
        } else if (column.attribute.type === "number") {
          validate({ type: "decimal", operator: "greaterThanOrEqual", allowBlank: !column.attribute.required, formulae: [-1e15], showErrorMessage: true, errorStyle: "stop", error: `${column.attribute.label} must be a number.` });
        }
        break;
    }
  });
  return sheet;
}

function addFieldListSheet(workbook: Workbook, fieldNames: readonly string[]) {
  const sheet = workbook.addWorksheet(FIELD_LIST_SHEET_NAME, { state: "hidden" });
  fieldNames.forEach((name, index) => { sheet.getCell(index + 1, 1).value = name; });
}

function addInstructionsSheet(workbook: Workbook, columns: readonly ImportColumn[], fieldNames: readonly string[]) {
  const sheet = workbook.addWorksheet(INSTRUCTIONS_SHEET_NAME, { properties: { tabColor: { argb: "FFF2B01E" } } });
  sheet.getColumn(1).width = 30;
  columns.slice(1).forEach((column, index) => { sheet.getColumn(index + 2).width = column.width; });

  const lines: Array<[string, { bold?: boolean; size?: number }?]> = [
    ["How to fill in your field permit request", { bold: true, size: 16 }],
    [""],
    ["1.  Use the \"Permits\" tab. Fill in one row for each time slot you need."],
    ["2.  Each row is one time slot. If your times differ by day, use a separate row for each time."],
    ["3.  Organization: your organization's name. Spell it the same way on every row."],
    ["4.  Field: click the cell and pick your field from the dropdown arrow."],
    ["5.  Start Time and End Time: type the time with AM or PM, for example 5:30 PM. The end time must be later than the start time."],
    ["6.  Days: type Y under each day you need that time slot. Leave the other days blank."],
    ["7.  Notes: anything else staff should know (optional)."],
    ...(columns.some((c) => c.kind === "extra") ? [["8.  Fill in the remaining columns as labeled. Columns marked with a dropdown only accept the listed choices."] as [string]] : []),
    [""],
    ["Example: Kailua Youth Soccer practices Monday and Wednesday evenings and plays games on Saturday mornings.", { bold: true }],
    ["Because the Saturday time is different, it goes on its own row:"],
  ];
  lines.forEach(([text, font]) => {
    const row = sheet.addRow([text]);
    if (font) row.font = font;
    row.getCell(1).alignment = { wrapText: false };
  });

  const headerRow = sheet.addRow(columns.map((column) => column.label));
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  columns.forEach((_, index) => { headerRow.getCell(index + 1).fill = HEADER_FILL; });
  for (const example of exampleRows(fieldNames)) {
    const row = sheet.addRow(columns.map((column) => {
      switch (column.kind) {
        case "organization": return example.organization;
        case "field": return example.field;
        case "start": return example.start;
        case "end": return example.end;
        case "day": return example.days.includes(column.label) ? "Y" : null;
        case "notes": return example.notes;
        default: return null;
      }
    }));
    columns.forEach((column, index) => {
      if (column.kind === "start" || column.kind === "end") row.getCell(index + 1).numFmt = TIME_FORMAT;
      if (column.kind === "day") row.getCell(index + 1).alignment = { horizontal: "center" };
    });
  }

  sheet.addRow([]);
  const tips = [
    "Good to know",
    "•  Do not change the column headings on the Permits tab.",
    "•  Sending the same row twice is fine. Rows that are already on file are skipped.",
    "•  Need a new time? Add a new row. Staff will remove the old one if it is no longer needed.",
    "•  Fields are available from 5:00 AM to 10:00 PM.",
    "•  Save the file as an Excel Workbook (.xlsx) and send it back to Parks and Recreation.",
  ];
  tips.forEach((text, index) => { const row = sheet.addRow([text]); if (index === 0) row.font = { bold: true }; });
}

/** Builds the template workbook. Field names become the Field dropdown; permitSchema adds extra columns. */
export async function buildTemplateWorkbook(fieldNames: readonly string[], schema?: readonly PermitAttribute[]): Promise<Workbook> {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Field Permit Scheduler";
  workbook.created = new Date();
  const columns = importColumns(schema);
  const names = [...new Set(fieldNames.map((name) => name.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  addPermitsSheet(workbook, columns, names);
  addInstructionsSheet(workbook, columns, names);
  if (names.length) addFieldListSheet(workbook, names);
  return workbook;
}

export async function generateTemplate(fieldNames: readonly string[], schema?: readonly PermitAttribute[]): Promise<Blob> {
  const workbook = await buildTemplateWorkbook(fieldNames, schema);
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

/** Saves a Blob through the browser's normal download flow. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadTemplate(fieldNames: readonly string[], schema?: readonly PermitAttribute[]): Promise<void> {
  downloadBlob(await generateTemplate(fieldNames, schema), TEMPLATE_FILE_NAME);
}
