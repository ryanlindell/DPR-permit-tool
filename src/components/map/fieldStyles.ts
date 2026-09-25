import type { PathOptions } from "leaflet";
import { appConfig } from "../../config/appConfig";

/**
 * Leaflet style for a field polygon. Conflict is signalled by color AND a thicker dashed
 * outline, so color-blind viewers can still tell the two states apart (SPEC 6.1).
 */
export function fieldPathStyle({ conflict, selected }: { conflict: boolean; selected: boolean }): PathOptions {
  const color = conflict ? appConfig.colors.conflict : appConfig.colors.normal;
  const baseWeight = conflict ? 4 : 2;
  return {
    color,
    fillColor: color,
    weight: selected ? baseWeight + 2 : baseWeight,
    dashArray: conflict ? "10 6" : undefined,
    opacity: 1,
    fillOpacity: selected ? 0.45 : 0.25,
  };
}
