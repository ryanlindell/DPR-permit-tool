import { useEffect, useRef } from "react";
import type { Layer, LeafletEvent } from "leaflet";
import { useMap, useMapEvents } from "react-leaflet";

/**
 * Geoman toolbar (draw polygon/rectangle, edit vertices, drag, delete). Mounted only in edit
 * mode; leaving edit mode turns every tool off and removes the toolbar.
 */
export function DrawingTools({ enabled, onCreated }: { enabled: boolean; onCreated: (layer: Layer) => void }) {
  const map = useMap();
  const created = useRef(onCreated);
  useEffect(() => { created.current = onCreated; });

  useEffect(() => {
    if (!enabled) return;
    map.pm.setGlobalOptions({
      allowSelfIntersection: false, // bowtie shapes would break area/overlap math
      snappable: true, // snapping to neighbors' vertices is how you draw fields that share an edge
      snapDistance: 15,
    });
    map.pm.addControls({
      position: "topleft",
      drawPolygon: true, drawRectangle: true,
      editMode: true, dragMode: true, removalMode: true,
      drawMarker: false, drawCircleMarker: false, drawPolyline: false, drawCircle: false, drawText: false,
      cutPolygon: false, rotateMode: false,
    });
    const handleCreate = (event: LeafletEvent & { layer: Layer }) => created.current(event.layer);
    map.on("pm:create", handleCreate);
    return () => {
      map.off("pm:create", handleCreate);
      map.pm.disableDraw();
      map.pm.disableGlobalEditMode();
      map.pm.disableGlobalDragMode();
      map.pm.disableGlobalRemovalMode();
      map.pm.removeControls();
    };
  }, [enabled, map]);
  return null;
}

/** Clicking empty map (not a field) clears the selection, except while placing polygon vertices. */
export function MapClickDeselect({ onDeselect }: { onDeselect: () => void }) {
  const map = useMapEvents({ click: () => { if (!map.pm.globalDrawModeEnabled()) onDeselect(); } });
  return null;
}

/** Moves the map when the saved home view changes (e.g. settings finished loading). */
export function HomeViewSync({ lat, lng, zoom }: { lat: number; lng: number; zoom: number }) {
  const map = useMap();
  useEffect(() => { map.setView([lat, lng], zoom); }, [map, lat, lng, zoom]);
  return null;
}
