import { describe, expect, it } from "vitest";
import { findDuplicatePermits, permitIdentityKey } from "./dedup";

const p = (organization: string, days = [1, 3]) => ({ organization, raw_field_name: "Field A", start_time: "17:00", end_time: "18:00", days });

describe("permit duplicate identity", () => {
  it("ignores whitespace, case and day order", () => {
    expect(permitIdentityKey(p(" Org   One ", [3, 1]))).toBe(permitIdentityKey(p("org one", [1, 3])));
  });
  it("deduplicates against existing and earlier incoming rows", () => {
    const result = findDuplicatePermits([p("ORG ONE"), p(" Org One "), p("Other")], [p("org one")]);
    expect(result.duplicates).toHaveLength(2);
    expect(result.added).toHaveLength(1);
  });
});
