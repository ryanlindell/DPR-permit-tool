import { describe, expect, it } from "vitest";
import { matchFieldName, normalizeName } from "./matching";

describe("field name matching", () => {
  const fields = [{ name: "Soccer   Field A" }, { name: "Diamond" }];
  it("normalizes case, outer whitespace and repeated spaces", () => {
    expect(normalizeName("  SOCCER Field  A ")).toBe("soccer field a");
    expect(matchFieldName(" soccer field a ", fields)).toBe(fields[0]);
  });
  it("returns undefined for unmatched names", () => expect(matchFieldName("Field Z", fields)).toBeUndefined());
});
