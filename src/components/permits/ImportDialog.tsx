import type { Field, Permit, Version } from "../../types";

/** Inputs needed to parse, deduplicate, and save an Excel import to the active version. */
export interface ImportSummary {
  added: number;
  duplicates: number;
  broken: number;
  rejected: number;
  outOfHours?: number;
  rejectedRows?: Array<{ row: number; reason: string }>;
}

export interface ImportDialogProps {
  open: boolean;
  fields: Field[];
  activeVersion: Version;
  /** Existing active-version permits provide the duplicate comparison set. */
  existingPermits: Permit[];
  onClose: () => void;
  /** Resolve after persisted import so app state can reload; return summary counts. */
  onImported: (newPermits: Omit<Permit, "id" | "owner_id" | "created_at" | "updated_at">[]) => Promise<ImportSummary>;
}

export function ImportDialog({ open }: ImportDialogProps) {
  return open ? <div className="component-placeholder" role="dialog" aria-label="Import permits">Permit import placeholder.</div> : null;
}
