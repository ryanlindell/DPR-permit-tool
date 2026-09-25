import { describe, expect, it } from "vitest";
import { polygonsOverlap } from "./overlaps";
import type { GeoJsonPolygon } from "../types";

const rect = (x1: number, y1: number, x2: number, y2: number): GeoJsonPolygon => ({
  type: "Polygon", coordinates: [[[x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]]],
});

describe("polygon overlap", () => {
  it("detects positive-area intersections", () => expect(polygonsOverlap(rect(0, 0, 0.001, 0.001), rect(0.0005, 0, 0.0015, 0.001))).toBe(true));
  it("does not treat a shared edge as an overlap", () => expect(polygonsOverlap(rect(0, 0, 0.001, 0.001), rect(0.001, 0, 0.002, 0.001))).toBe(false));
});
