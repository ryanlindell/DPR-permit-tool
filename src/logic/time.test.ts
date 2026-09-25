import { describe, expect, it } from "vitest";
import { isValidTimeRange, timesOverlap } from "./time";

describe("timesOverlap", () => {
  it("treats back-to-back intervals as non-overlapping", () => expect(timesOverlap("17:00", "18:00", "18:00", "19:00")).toBe(false));
  it("detects strict overlap", () => expect(timesOverlap("17:00", "18:15", "18:00", "19:00")).toBe(true));
  it("rejects invalid, zero-length, and overnight ranges", () => {
    expect(isValidTimeRange("17:00", "18:00")).toBe(true);
    expect(isValidTimeRange("18:00", "18:00")).toBe(false);
    expect(isValidTimeRange("23:00", "01:00")).toBe(false);
    expect(isValidTimeRange("25:00", "26:00")).toBe(false);
  });
});
