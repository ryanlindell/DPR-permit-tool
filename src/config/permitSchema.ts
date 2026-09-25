export type PermitAttribute = {
  key: string;
  label: string;
  type: "text" | "longtext" | "number" | "select";
  options?: string[];
  required: boolean;
  showInSidebar: boolean;
  editable: boolean;
};

/** Additional permit attributes map to permits.extra; core columns stay dedicated. */
export const permitSchema: PermitAttribute[] = [];
