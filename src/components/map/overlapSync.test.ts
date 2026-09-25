import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Field, GeoJsonPolygon } from "../../types";

// In-memory stand-in for the fields and field_overlaps tables, so the sync functions run
// exactly as they would against Supabase, minus the network.
const db = vi.hoisted(() => ({ fields: [] as Field[], overlaps: [] as Array<{ field_a: string; field_b: string }> }));
vi.mock("../../data/fields", () => ({
  listFields: async () => db.fields.map((field) => ({ ...field })),
  replaceOverlapsForField: async (fieldId: string, pairs: Array<[string, string]>) => {
    db.overlaps = db.overlaps.filter((row) => row.field_a !== fieldId && row.field_b !== fieldId);
    db.overlaps.push(...pairs.map(([a, b]) => ({ field_a: a < b ? a : b, field_b: a < b ? b : a })));
  },
  recomputeAllOverlaps: async (pairs: Array<[string, string]>) => {
    db.overlaps = pairs.map(([a, b]) => ({ field_a: a < b ? a : b, field_b: a < b ? b : a }));
  },
}));

const { allOverlapPairs, overlapPairsForField, recomputeAllFieldOverlaps, syncOverlapsForField } = await import("./overlapSync");

// Rectangles near Kailua, HI. 0.001 degrees is roughly 100 m, so these are field-sized.
const lng0 = -157.74; const lat0 = 21.39;
const rect = (x1: number, y1: number, x2: number, y2: number): GeoJsonPolygon => ({
  type: "Polygon",
  coordinates: [[[lng0 + x1, lat0 + y1], [lng0 + x2, lat0 + y1], [lng0 + x2, lat0 + y2], [lng0 + x1, lat0 + y2], [lng0 + x1, lat0 + y1]]],
});
const field = (id: string, geometry: GeoJsonPolygon): Field => ({
  id, owner_id: "owner", name: id, field_type: "Soccer", geometry, notes: "", created_at: "", updated_at: "",
});

// A and B truly overlap. C and D touch along one edge only. No other pair touches.
const A = field("a", rect(0, 0, 0.001, 0.001));
const B = field("b", rect(0.0005, 0, 0.0015, 0.001));
const C = field("c", rect(0, 0.003, 0.001, 0.004));
const D = field("d", rect(0.001, 0.003, 0.002, 0.004));

/** Mimics FieldMap: persist the field, then run the incremental recompute. */
async function draw(f: Field) {
  db.fields.push(f);
  await syncOverlapsForField(f.id, f.geometry);
}

beforeEach(() => { db.fields = []; db.overlaps = []; });

describe("overlap pairs (pure)", () => {
  it("finds only the true overlap among four fields", () => {
    expect(allOverlapPairs([A, B, C, D])).toEqual([["a", "b"]]);
  });
  it("orders each pair as field_a < field_b regardless of which field changed", () => {
    expect(overlapPairsForField("b", B.geometry, [A, B, C, D])).toEqual([["a", "b"]]);
  });
  it("never pairs a field with itself", () => {
    expect(overlapPairsForField("a", A.geometry, [A])).toEqual([]);
  });
  it("ignores slivers below the 1 m² threshold", () => {
    // ~0.5 cm overlap along a 100 m edge: well under 1 m².
    const nearlyTouching = field("e", rect(0.00099995, 0, 0.002, 0.001));
    expect(overlapPairsForField("e", nearlyTouching.geometry, [A])).toEqual([]);
  });
});

describe("incremental overlap sync (Phase 1A done-when scenario)", () => {
  it("drawing four fields leaves exactly one overlap row", async () => {
    for (const f of [A, B, C, D]) await draw(f);
    expect(db.overlaps).toEqual([{ field_a: "a", field_b: "b" }]);
  });

  it("editing a polygon so the overlap disappears removes the row", async () => {
    for (const f of [A, B, C, D]) await draw(f);
    const movedB = rect(0.002, 0, 0.003, 0.001);
    db.fields = db.fields.map((f) => (f.id === "b" ? { ...f, geometry: movedB } : f));
    await syncOverlapsForField("b", movedB);
    expect(db.overlaps).toEqual([]);
  });

  it("editing a polygon into another field adds the row, and leaves unrelated rows alone", async () => {
    for (const f of [A, B, C, D]) await draw(f);
    const grownC = rect(0, 0.003, 0.0015, 0.004); // now overlaps D by 50 m × 100 m
    db.fields = db.fields.map((f) => (f.id === "c" ? { ...f, geometry: grownC } : f));
    await syncOverlapsForField("c", grownC);
    expect(db.overlaps).toEqual([{ field_a: "a", field_b: "b" }, { field_a: "c", field_b: "d" }]);
  });

  it("deleting a field removes its rows", async () => {
    for (const f of [A, B, C, D]) await draw(f);
    db.fields = db.fields.filter((f) => f.id !== "a");
    await syncOverlapsForField("a", null);
    expect(db.overlaps).toEqual([]);
  });

  it("recompute-all rebuilds the cache from geometry", async () => {
    db.fields = [A, B, C, D];
    db.overlaps = [{ field_a: "c", field_b: "d" }]; // stale/wrong row
    await expect(recomputeAllFieldOverlaps()).resolves.toBe(1);
    expect(db.overlaps).toEqual([{ field_a: "a", field_b: "b" }]);
  });
});
