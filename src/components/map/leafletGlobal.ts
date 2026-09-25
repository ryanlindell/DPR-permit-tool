import L from "leaflet";

// Geoman's bundle patches the global `L` rather than importing Leaflet, and ES modules don't
// create globals. This module must be imported before "@geoman-io/leaflet-geoman-free".
declare global { interface Window { L: typeof L } }
window.L = L;
