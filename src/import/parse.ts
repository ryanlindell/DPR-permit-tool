import type { Json } from "../types";
import type { PermitAttribute } from "../config/permitSchema";
import { normalizeName } from "../logic/matching";
import { headerAliases, importColumns, type ImportColumn } from "./columns";

/** A cell value after unwrapping exceljs rich text, formulas, and hyperlinks. */
export type CellValue = string | number | boolean | Date | null;

/** A validated spreadsheet row, not yet matched to a field or checked for duplicates. */
export interface ParsedPermitRow {
  /** 1-based spreadsheet row number, as the user sees it in Excel. */
  row: number;
  organization: string;
  raw_field_name: string;
  start_time: string;
  end_time: string;
  days: number[];
  notes: string;
  extra: Record<string, Json>;
}

export interface RejectedRow { row: number; reason: string }

export interface ParseResult {
  rows: ParsedPermitRow[];
  rejected: RejectedRow[];
}

/** Thrown when the file as a whole is unusable (wrong file, missing columns), as opposed to a bad row. */
export class ImportFileError extends Error {}

const TIME_HELP = "write times like 5:30 PM";

/**
 * Converts one time cell to "HH:MM" (24-hour), or null when it cannot be read.
 * Excel stores a typed time as a fraction of a day; exceljs hands those back as a
 * Date on 1899-12-30 in UTC, so both the number and Date forms are handled.
 */
export function parseTimeValue(value: CellValue): string | null {
  if (value === null || typeof value === "boolean") return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const msOfDay = ((value.getTime() % 86_400_000) + 86_400_000) % 86_400_000;
    return minutesToHHMM(Math.round(msOfDay / 60_000));
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return null;
    return minutesToHHMM(Math.round((value % 1) * 1440));
  }
  return parseTimeText(value);
}

function parseTimeText(text: string): string | null {
  const cleaned = text.trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, " ");
  if (cleaned === "noon") return "12:00";
  const match = /^(\d{1,2})(?:[:h](\d{2}))?(?::(\d{2}))?\s*(am|pm|a|p)?$/.exec(cleaned);
  if (!match) return null;
  const [, hourText, minuteText, , meridiem] = match;
  let hour = Number(hourText);
  const minute = minuteText === undefined ? 0 : Number(minuteText);
  if (minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (hour === 12) hour = 0;
    if (meridiem.startsWith("p")) hour += 12;
  } else {
    // A bare "5" is ambiguous (5 AM or 5 PM?), so only accept 24-hour text with a colon.
    if (minuteText === undefined || hour > 23) return null;
  }
  return minutesToHHMM(hour * 60 + minute);
}

function minutesToHHMM(totalMinutes: number): string | null {
  // Rounding 11:59:59.9 PM can produce 1440; a permit cannot end at midnight in a `time` column check.
  if (totalMinutes < 0 || totalMinutes >= 1440) return null;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** Formats "HH:MM" (or "HH:MM:SS") as "5:30 PM" for messages. */
export function formatTime12h(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${suffix}`;
}

const YES = new Set(["y", "yes", "x", "true", "1", "✓", "✔"]);
const NO = new Set(["", "n", "no", "false", "0", "-"]);

/** Day cells: "Y" (or yes/x/✓) means the permit uses that day; blank means it does not. */
export function parseDayValue(value: CellValue): boolean | null {
  if (value === null) return false;
  if (typeof value === "boolean") return value;
  const text = normalizeName(String(value));
  if (YES.has(text)) return true;
  if (NO.has(text)) return false;
  return null;
}

function cellText(value: CellValue): string {
  if (value === null) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value).trim().replace(/\s+/g, " ");
}

/** Maps each template column to its position in the uploaded header row. */
export function mapHeaders(header: readonly CellValue[], columns: readonly ImportColumn[]): Map<ImportColumn, number> {
  const positions = new Map<string, number>();
  header.forEach((cell, index) => {
    const key = normalizeName(cellText(cell)).replace(/[*:]/g, "").trim();
    if (key && !positions.has(key)) positions.set(key, index);
  });
  const mapped = new Map<ImportColumn, number>();
  const missing: string[] = [];
  for (const column of columns) {
    const index = headerAliases(column).map((alias) => positions.get(alias)).find((i) => i !== undefined);
    if (index !== undefined) mapped.set(column, index);
    else if (column.kind !== "notes" && !(column.kind === "extra" && !column.attribute.required)) missing.push(column.label);
  }
  if (missing.length) {
    throw new ImportFileError(`This file doesn't look like the permit template. Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. Download a fresh template and copy your rows into it.`);
  }
  return mapped;
}

function parseExtra(attribute: PermitAttribute, value: CellValue): { value?: Json; error?: string } {
  const text = cellText(value);
  if (!text) return attribute.required ? { error: `${attribute.label} is required` } : {};
  switch (attribute.type) {
    case "number": {
      const n = typeof value === "number" ? value : Number(text.replace(/,/g, ""));
      return Number.isFinite(n) ? { value: n } : { error: `${attribute.label} must be a number` };
    }
    case "select": {
      const option = attribute.options?.find((o) => normalizeName(o) === normalizeName(text));
      return option ? { value: option } : { error: `${attribute.label} must be one of: ${(attribute.options ?? []).join(", ")}` };
    }
    default: return { value: text };
  }
}

/**
 * Validates spreadsheet rows. `grid[0]` is the header row; `firstRowNumber` is the
 * spreadsheet row number of `grid[0]` so messages point at the right Excel row.
 * Blank rows are ignored. Every problem on a row is reported, not just the first.
 */
export function parsePermitGrid(grid: readonly (readonly CellValue[])[], schema?: readonly PermitAttribute[], firstRowNumber = 1): ParseResult {
  if (!grid.length) throw new ImportFileError("The file is empty. Download the template, fill in one row per time slot, and try again.");
  const columns = importColumns(schema);
  const positions = mapHeaders(grid[0], columns);
  const at = (cells: readonly CellValue[], column: ImportColumn): CellValue => {
    const index = positions.get(column);
    return index === undefined ? null : cells[index] ?? null;
  };

  const rows: ParsedPermitRow[] = [];
  const rejected: RejectedRow[] = [];
  grid.slice(1).forEach((cells, offset) => {
    const row = firstRowNumber + offset + 1;
    if (cells.every((cell) => cellText(cell ?? null) === "")) return;

    const problems: string[] = [];
    const parsed: ParsedPermitRow = { row, organization: "", raw_field_name: "", start_time: "", end_time: "", days: [], notes: "", extra: {} };
    let startText = "";
    let endText = "";
    for (const column of columns) {
      const value = at(cells, column);
      switch (column.kind) {
        case "organization": parsed.organization = cellText(value); if (!parsed.organization) problems.push("Organization is missing"); break;
        case "field": parsed.raw_field_name = cellText(value); if (!parsed.raw_field_name) problems.push("Field is missing"); break;
        case "start":
        case "end": {
          const label = column.kind === "start" ? "Start Time" : "End Time";
          if (cellText(value) === "") { problems.push(`${label} is missing`); break; }
          const time = parseTimeValue(value);
          if (!time) { problems.push(`${label} "${cellText(value)}" is not a time (${TIME_HELP})`); break; }
          if (column.kind === "start") { parsed.start_time = time; startText = time; } else { parsed.end_time = time; endText = time; }
          break;
        }
        case "day": {
          const used = parseDayValue(value);
          if (used === null) problems.push(`${column.label} should be Y or blank, not "${cellText(value)}"`);
          else if (used) parsed.days.push(column.day);
          break;
        }
        case "notes": parsed.notes = cellText(value); break;
        case "extra": {
          const result = parseExtra(column.attribute, value);
          if (result.error) problems.push(result.error);
          else if (result.value !== undefined) parsed.extra[column.attribute.key] = result.value;
          break;
        }
      }
    }
    if (startText && endText && startText >= endText) problems.push(`End Time (${formatTime12h(endText)}) must be after Start Time (${formatTime12h(startText)})`);
    if (!parsed.days.length && !problems.some((p) => p.includes("should be Y"))) problems.push("No days marked; put Y under at least one day");
    parsed.days.sort((a, b) => a - b);

    if (problems.length) rejected.push({ row, reason: problems.join("; ") });
    else rows.push(parsed);
  });
  return { rows, rejected };
}

/** Unwraps the object shapes exceljs uses for formulas, rich text, hyperlinks and errors. */
export function toCellValue(raw: unknown): CellValue {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean" || raw instanceof Date) return raw;
  if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.richText)) return (obj.richText as Array<{ text?: string }>).map((part) => part.text ?? "").join("");
    if ("result" in obj) return toCellValue(obj.result);
    if ("text" in obj) return toCellValue(obj.text);
    if ("error" in obj) return null;
  }
  return String(raw);
}

export const PERMITS_SHEET_NAME = "Permits";

/** Reads an uploaded .xlsx into validated rows. exceljs is loaded on demand because it is large. */
export async function parsePermitWorkbook(data: ArrayBuffer, schema?: readonly PermitAttribute[]): Promise<ParseResult> {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(data);
  } catch {
    throw new ImportFileError("This file could not be opened as an Excel workbook. Save it as .xlsx (Excel Workbook) and try again.");
  }
  const sheet = workbook.getWorksheet(PERMITS_SHEET_NAME) ?? workbook.worksheets.find((ws) => ws.state === "visible");
  if (!sheet) throw new ImportFileError("The workbook has no sheets to read.");

  const width = Math.max(sheet.columnCount, 1);
  const grid: CellValue[][] = [];
  for (let r = 1; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r);
    const cells: CellValue[] = [];
    for (let c = 1; c <= width; c += 1) cells.push(toCellValue(row.getCell(c).value));
    grid.push(cells);
  }
  return parsePermitGrid(grid, schema);
}
