import { permitSchema, type PermitAttribute } from "../config/permitSchema";
import { normalizeName } from "../logic/matching";

/**
 * One spreadsheet column. The template writer and the parser both read this list,
 * so a column added here (or in permitSchema) shows up in both places at once.
 */
export type ImportColumn =
  | { kind: "organization"; label: string; width: number }
  | { kind: "field"; label: string; width: number }
  | { kind: "start"; label: string; width: number }
  | { kind: "end"; label: string; width: number }
  | { kind: "day"; label: string; width: number; day: number }
  | { kind: "notes"; label: string; width: number }
  | { kind: "extra"; label: string; width: number; attribute: PermitAttribute };

/** Excel-style weekday order (Mon first) mapped to the database convention 0=Sun ... 6=Sat. */
export const DAY_COLUMNS = [
  { label: "Mon", day: 1, aliases: ["monday"] },
  { label: "Tue", day: 2, aliases: ["tuesday", "tues"] },
  { label: "Wed", day: 3, aliases: ["wednesday"] },
  { label: "Thu", day: 4, aliases: ["thursday", "thur", "thurs"] },
  { label: "Fri", day: 5, aliases: ["friday"] },
  { label: "Sat", day: 6, aliases: ["saturday"] },
  { label: "Sun", day: 0, aliases: ["sunday"] },
] as const;

/** Keys with dedicated permit columns; a permitSchema entry using one of these is not an extra. */
const CORE_KEYS = new Set(["organization", "field", "fieldid", "field_id", "starttime", "start_time", "endtime", "end_time", "days", "notes"]);

export function extraAttributes(schema: readonly PermitAttribute[] = permitSchema): PermitAttribute[] {
  return schema.filter((attribute) => !CORE_KEYS.has(attribute.key.toLowerCase()));
}

export function importColumns(schema: readonly PermitAttribute[] = permitSchema): ImportColumn[] {
  return [
    { kind: "organization", label: "Organization", width: 30 },
    { kind: "field", label: "Field", width: 24 },
    { kind: "start", label: "Start Time", width: 13 },
    { kind: "end", label: "End Time", width: 13 },
    ...DAY_COLUMNS.map(({ label, day }) => ({ kind: "day" as const, label, day, width: 7 })),
    { kind: "notes", label: "Notes", width: 40 },
    ...extraAttributes(schema).map((attribute) => ({ kind: "extra" as const, label: attribute.label, attribute, width: attribute.type === "longtext" ? 40 : 20 })),
  ];
}

/** Header spellings the parser accepts for each column, already normalized. */
export function headerAliases(column: ImportColumn): string[] {
  const own = normalizeName(column.label);
  switch (column.kind) {
    case "start": return [own, "start", "from"];
    case "end": return [own, "end", "to", "until"];
    case "day": return [own, ...(DAY_COLUMNS.find((d) => d.day === column.day)?.aliases ?? [])];
    case "field": return [own, "field name"];
    case "organization": return [own, "org", "organization name"];
    default: return [own];
  }
}
