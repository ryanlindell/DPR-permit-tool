import { describe, expect, it } from "vitest";
import { fieldPathStyle } from "./fieldStyles";
import { cleanFieldName, fieldNameError, isDuplicateNameError } from "./fieldValidation";
import { appConfig } from "../../config/appConfig";

describe("field styling", () => {
  it("uses the normal color with a solid outline", () => {
    const style = fieldPathStyle({ conflict: false, selected: false });
    expect(style.color).toBe(appConfig.colors.normal);
    expect(style.dashArray).toBeUndefined();
  });
  it("marks conflicts with color plus a thicker dashed outline (color-blind safe)", () => {
    const normal = fieldPathStyle({ conflict: false, selected: false });
    const conflict = fieldPathStyle({ conflict: true, selected: false });
    expect(conflict.color).toBe(appConfig.colors.conflict);
    expect(conflict.dashArray).toBeTruthy();
    expect(conflict.weight!).toBeGreaterThan(normal.weight!);
  });
  it("emphasizes the selected field without losing the conflict dash", () => {
    const style = fieldPathStyle({ conflict: true, selected: true });
    expect(style.dashArray).toBeTruthy();
    expect(style.weight!).toBeGreaterThan(fieldPathStyle({ conflict: true, selected: false }).weight!);
  });
});

describe("field name validation", () => {
  const fields = [{ id: "1", name: "Field A" }, { id: "2", name: "North Diamond" }];
  it("requires a non-blank name", () => {
    expect(fieldNameError("   ", fields)).toMatch(/enter/i);
  });
  it("rejects duplicates ignoring case and extra spaces", () => {
    expect(fieldNameError("  field   a ", fields)).toMatch(/already exists/);
  });
  it("allows a field to keep its own name when editing", () => {
    expect(fieldNameError("FIELD A", fields, "1")).toBeNull();
  });
  it("accepts a new unique name", () => {
    expect(fieldNameError("Field B", fields)).toBeNull();
  });
  it("cleans whitespace before saving", () => {
    expect(cleanFieldName("  Field   B ")).toBe("Field B");
  });
  it("recognizes the database unique-violation code", () => {
    expect(isDuplicateNameError({ code: "23505" })).toBe(true);
    expect(isDuplicateNameError(new Error("network"))).toBe(false);
  });
});
