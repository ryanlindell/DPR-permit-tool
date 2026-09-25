export const fieldTypes = ["Soccer", "Football", "Baseball", "Softball", "Multi-purpose", "Other"] as const;
export type FieldType = (typeof fieldTypes)[number];
