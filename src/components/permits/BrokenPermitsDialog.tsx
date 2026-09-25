import type { Field, Permit } from "../../types";

/** Contract for assigning unmatched active-version permit rows to existing physical fields. */
export interface BrokenPermitsDialogProps {
  /** Only permits with a null field_id should be passed. */
  permits: Permit[];
  fields: Field[];
  onClose: () => void;
  /** Assign one permit or all broken permits with the same normalized raw field name. */
  onAssign: (permitId: string, fieldId: string, applyToMatchingRawNames: boolean) => Promise<void>;
}

export function BrokenPermitsDialog(props: BrokenPermitsDialogProps) {
  return <div className="component-placeholder" data-broken-count={props.permits.length}>Broken permits placeholder.</div>;
}
