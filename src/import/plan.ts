import { appConfig } from "../config/appConfig";
import { findDuplicatePermits } from "../logic/dedup";
import { matchFieldName } from "../logic/matching";
import type { Field, Permit } from "../types";
import type { ParseResult, ParsedPermitRow, RejectedRow } from "./parse";

export type NewPermit = Omit<Permit, "id" | "owner_id" | "created_at" | "updated_at">;

/** Everything the import summary screen shows, with spreadsheet row numbers. */
export interface ImportReport {
  toInsert: NewPermit[];
  /** Rows that will be added (or were added), in spreadsheet order. */
  addedRows: number[];
  duplicateRows: number[];
  /** Added rows whose Field did not match any field on the map. */
  broken: Array<{ row: number; rawFieldName: string }>;
  rejected: RejectedRow[];
  /** Added rows with a start before or an end after the calendar's visible hours. */
  outOfHours: Array<{ row: number; start: string; end: string }>;
}

/**
 * Postgres returns `time` columns as "17:00:00" while the importer produces "17:00".
 * Both sides must use the same shape or re-importing a file would not detect duplicates.
 */
export function toHHMM(time: string): string {
  return time.trim().slice(0, 5);
}

const hourText = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

export function isOutOfHours(start: string, end: string): boolean {
  return toHHMM(start) < hourText(appConfig.calendar.startHour) || toHHMM(end) > hourText(appConfig.calendar.endHour);
}

/**
 * Pure import planning: de-duplicates parsed rows against the active version's permits
 * (and against earlier rows in the same file), matches field names, and builds the rows
 * to insert. Nothing is written here; the caller persists `toInsert`.
 */
export function planImport(parsed: ParseResult, context: { existingPermits: readonly Permit[]; fields: readonly Field[]; versionId: string; importBatchId: string }): ImportReport {
  type Keyed = Pick<ParsedPermitRow, "row" | "organization" | "raw_field_name" | "start_time" | "end_time" | "days">;
  const existing: Keyed[] = context.existingPermits.map((permit) => ({ row: 0, organization: permit.organization, raw_field_name: permit.raw_field_name, start_time: toHHMM(permit.start_time), end_time: toHHMM(permit.end_time), days: permit.days }));
  const { added, duplicates } = findDuplicatePermits<Keyed>(parsed.rows, existing);
  const byRow = new Map(parsed.rows.map((row) => [row.row, row]));
  const addedRows = added.map((keyed) => byRow.get(keyed.row) as ParsedPermitRow);

  const report: ImportReport = { toInsert: [], addedRows: [], duplicateRows: duplicates.map((row) => row.row), broken: [], rejected: parsed.rejected, outOfHours: [] };
  for (const row of addedRows) {
    const field = matchFieldName(row.raw_field_name, context.fields);
    if (!field) report.broken.push({ row: row.row, rawFieldName: row.raw_field_name });
    if (isOutOfHours(row.start_time, row.end_time)) report.outOfHours.push({ row: row.row, start: row.start_time, end: row.end_time });
    report.addedRows.push(row.row);
    report.toInsert.push({
      version_id: context.versionId,
      organization: row.organization,
      field_id: field?.id ?? null,
      raw_field_name: row.raw_field_name,
      start_time: row.start_time,
      end_time: row.end_time,
      days: row.days,
      notes: row.notes,
      extra: row.extra,
      import_batch_id: context.importBatchId,
    });
  }
  return report;
}
