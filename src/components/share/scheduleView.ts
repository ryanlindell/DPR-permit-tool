import { computeConflicts } from "../../logic/conflicts";
import type { Conflict, Field, FieldOverlap, Permit } from "../../types";

export interface ScheduleView {
  conflictsByPermit: Map<string, Conflict[]>;
  /** Fields with at least one conflicting permit, for map coloring. */
  conflictingFieldIds: Set<string>;
  /** Permits on the selected field, for the sidebar. */
  sidebarPermits: Permit[];
  /** The selected field plus the fields that overlap it, for the calendar. */
  calendarFields: Field[];
  calendarPermits: Permit[];
  calendarConflictIds: Set<string>;
}

/**
 * Everything the map, sidebar and calendar need, derived from raw rows. Same rules as MainApp;
 * kept pure so the read-only share page and tests can use it without React.
 */
export function deriveScheduleView(fields: readonly Field[], overlaps: readonly FieldOverlap[], permits: readonly Permit[], selectedFieldId: string | null): ScheduleView {
  const conflictsByPermit = computeConflicts(permits, overlaps);
  const permitsById = new Map(permits.map((permit) => [permit.id, permit]));
  const conflictingFieldIds = new Set<string>();
  for (const [permitId, conflicts] of conflictsByPermit) {
    if (!conflicts.length) continue;
    const fieldId = permitsById.get(permitId)?.field_id;
    if (fieldId) conflictingFieldIds.add(fieldId);
    for (const conflict of conflicts) if (conflict.conflicts_with.field_id) conflictingFieldIds.add(conflict.conflicts_with.field_id);
  }

  const calendarFieldIds = new Set<string>();
  if (selectedFieldId) {
    calendarFieldIds.add(selectedFieldId);
    for (const overlap of overlaps) {
      if (overlap.field_a === selectedFieldId) calendarFieldIds.add(overlap.field_b);
      if (overlap.field_b === selectedFieldId) calendarFieldIds.add(overlap.field_a);
    }
  }
  const calendarPermits = permits.filter((permit) => permit.field_id !== null && calendarFieldIds.has(permit.field_id));
  return {
    conflictsByPermit,
    conflictingFieldIds,
    sidebarPermits: selectedFieldId ? permits.filter((permit) => permit.field_id === selectedFieldId) : [],
    calendarFields: fields.filter((field) => calendarFieldIds.has(field.id)),
    calendarPermits,
    calendarConflictIds: new Set(calendarPermits.filter((permit) => conflictsByPermit.get(permit.id)?.length).map((permit) => permit.id)),
  };
}
