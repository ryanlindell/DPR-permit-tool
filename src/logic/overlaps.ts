import area from "@turf/area";
import intersect from "@turf/intersect";
import { featureCollection, polygon } from "@turf/helpers";
import type { GeoJsonPolygon } from "../types";

/** Returns positive-area overlap; shared borders and slivers below threshold are ignored. */
export function polygonsOverlap(a: GeoJsonPolygon, b: GeoJsonPolygon, thresholdSquareMeters = 1): boolean {
  const intersection = intersect(featureCollection([polygon(a.coordinates), polygon(b.coordinates)]));
  return intersection !== null && area(intersection) > thresholdSquareMeters;
}
