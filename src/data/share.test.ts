import { describe, expect, it } from "vitest";
import { buildShareUrl, getSharedView, isShareToken } from "./share";

describe("share links", () => {
  it("builds a hash-route link under the GitHub Pages base path", () => {
    expect(buildShareUrl("3f0c1d7e-8a55-4c2b-9d7e-2b8f6a0c1e44", { origin: "https://example.github.io", pathname: "/DPR-permit-tool/" }))
      .toBe("https://example.github.io/DPR-permit-tool/#/share/3f0c1d7e-8a55-4c2b-9d7e-2b8f6a0c1e44");
  });

  it("recognizes only UUID tokens", () => {
    expect(isShareToken("3F0C1D7E-8A55-4C2B-9D7E-2B8F6A0C1E44")).toBe(true);
    for (const bad of ["", "abc", "3f0c1d7e-8a55-4c2b-9d7e-2b8f6a0c1e4", "' or 1=1 --"]) expect(isShareToken(bad)).toBe(false);
  });

  it("treats a malformed token as 'not available' without calling the server", async () => {
    // Supabase is not configured in tests, so reaching the server would throw instead.
    await expect(getSharedView("not-a-token")).resolves.toBeNull();
  });
});
