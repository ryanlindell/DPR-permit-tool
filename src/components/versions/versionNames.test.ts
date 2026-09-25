import { describe, expect, it } from "vitest";
import { cleanVersionName, suggestVersionName, versionErrorMessage, versionNameError } from "./versionNames";

const versions = [{ id: "1", name: "Original" }, { id: "2", name: "Plan B" }];

describe("version name validation", () => {
  it("requires a non-blank name", () => expect(versionNameError("   ", versions)).toMatch(/enter a name/i));
  it("rejects duplicates ignoring case and extra spaces", () => expect(versionNameError("  plan   b ", versions)).toMatch(/already exists/));
  it("lets a version keep its own name when renaming", () => expect(versionNameError("PLAN B", versions, "2")).toBeNull());
  it("accepts a new unique name", () => expect(versionNameError("After meeting", versions)).toBeNull());
  it("rejects very long names", () => expect(versionNameError("x".repeat(81), versions)).toMatch(/80/));
  it("cleans whitespace", () => expect(cleanVersionName("  Plan   C ")).toBe("Plan C"));
});

describe("suggested name for Save as new version", () => {
  it("starts at Plan B", () => expect(suggestVersionName([{ name: "Original" }])).toBe("Plan B"));
  it("skips names already used, case-insensitively", () => expect(suggestVersionName([{ name: "Original" }, { name: "plan b" }])).toBe("Plan C"));
  it("falls back to Version N after Plan Z", () => {
    const all = [{ name: "Original" }, ...Array.from({ length: 25 }, (_, i) => ({ name: `Plan ${String.fromCharCode(66 + i)}` }))];
    expect(suggestVersionName(all)).toBe("Version 27");
  });
});

describe("friendly error messages", () => {
  it("explains a duplicate name", () => expect(versionErrorMessage({ code: "23505", message: "duplicate key" })).toMatch(/already exists/));
  it("explains deleting the active version", () => expect(versionErrorMessage({ code: "23503" })).toMatch(/active/));
  it("passes through ordinary errors", () => expect(versionErrorMessage(new Error("Network down"))).toBe("Network down"));
  it("reads Supabase error objects", () => expect(versionErrorMessage({ message: "JWT expired" })).toBe("JWT expired"));
});
