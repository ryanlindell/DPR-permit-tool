import { describe, expect, it } from "vitest";
import { editDistance, suggestField } from "./suggest";

const fields = [{ name: "Field A" }, { name: "Field B" }, { name: "Kalama Park Diamond" }];

describe("editDistance", () => {
  it("counts single-letter edits", () => {
    expect(editDistance("feild a", "field a")).toBe(2);
    expect(editDistance("", "abc")).toBe(3);
    expect(editDistance("same", "same")).toBe(0);
  });
});

describe("suggestField", () => {
  it("suggests the clearly closest field for a typo", () => {
    expect(suggestField("Kalama Prak Diamond", fields)?.name).toBe("Kalama Park Diamond");
    expect(suggestField("  FEILD  A ", fields)?.name).toBe("Field A");
  });
  it("refuses to guess when two fields are equally close or nothing is close", () => {
    expect(suggestField("Field C", fields)).toBeUndefined();
    expect(suggestField("Gym", fields)).toBeUndefined();
    expect(suggestField("", fields)).toBeUndefined();
  });
});
