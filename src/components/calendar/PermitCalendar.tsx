import type { Conflict, Field, Permit } from "../../types";

/** Contract for a self-contained weekly calendar. Data fetching and persistence stay outside this component. */
export interface PermitCalendarProps {
  /** Permits for the active schedule version. */
  permits: Permit[];
  /** Fields used to label and visually distinguish adjacent-field occurrences. */
  fields: Field[];
  /** Field whose schedule is open in the calendar. */
  selectedFieldId: string;
  /** IDs with at least one conflict, used for event styling. */
  conflictingPermitIds: ReadonlySet<string>;
  /** Conflict relationships and intersecting weekdays, keyed by permit ID. */
  conflictsByPermit: ReadonlyMap<string, Conflict[]>;
  /** False in read-only share view; disables drag and resize. */
  editable: boolean;
  /** Close calendar and return to map while retaining selected field. */
  onBack: () => void;
  /** Emit a changed complete permit; caller validates and persists it. */
  onPermitChange: (updated: Permit) => void | Promise<void>;
  /** Optional event selection callback for a detail panel. */
  onPermitSelect?: (permit: Permit) => void;
}

export function PermitCalendar(props: PermitCalendarProps) {
  return <div className="component-placeholder" data-permit-count={props.permits.length}>Weekly permit calendar placeholder.</div>;
}
