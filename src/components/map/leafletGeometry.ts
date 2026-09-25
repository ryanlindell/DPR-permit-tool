import type { LatLngExpression, Layer, Polygon } from "leaflet";
import type { GeoJsonPolygon } from "../../types";

/** GeoJSON stores [lng, lat] with a closing point; Leaflet wants [lat, lng] rings without it. */
export function polygonToLatLngs(geometry: GeoJsonPolygon): LatLngExpression[][] {
  return geometry.coordinates.map((ring) => ring.slice(0, -1).map(([lng, lat]) => [lat!, lng!] as [number, number]));
}

/** ~1 cm precision; keeps stored JSON small without visibly moving vertices. */
const round = (value: number) => Math.round(value * 1e7) / 1e7;

/** Converts a drawn/edited Leaflet polygon (or rectangle) to a GeoJSON Polygon, or null if it is not a usable polygon. */
export function layerToPolygon(layer: Layer): GeoJsonPolygon | null {
  const toGeoJSON = (layer as Polygon).toGeoJSON;
  if (typeof toGeoJSON !== "function") return null;
  const geometry = toGeoJSON.call(layer).geometry;
  if (geometry.type !== "Polygon") return null;
  const coordinates = geometry.coordinates.map((ring) => ring.map((point) => point.map(round)));
  if (!coordinates[0] || coordinates[0].length < 4) return null;
  return { type: "Polygon", coordinates };
}

/** Stable key for detecting geometry changes between renders. */
export function geometryKey(geometry: GeoJsonPolygon): string {
  return JSON.stringify(geometry.coordinates);
}
