/** Trim, collapse internal whitespace and lowercase for name matching. */
export function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

export function matchFieldName<T extends { name: string }>(rawName: string, fields: readonly T[]): T | undefined {
  const target = normalizeName(rawName);
  return fields.find((field) => normalizeName(field.name) === target);
}
