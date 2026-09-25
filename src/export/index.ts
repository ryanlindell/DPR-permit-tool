import type { Conflict, Field, Permit } from "../types";

/** Exporter contract for formats added by a later phase. */
export type Exporter = (fields: Field[], permits: Permit[], conflicts: Conflict[]) => Blob;
export interface ExportFormat { id: string; label: string; export: Exporter; }

/** Formats register here so the app shell can present a common export menu. */
export const exporters: ExportFormat[] = [];
