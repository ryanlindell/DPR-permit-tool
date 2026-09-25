/* global MAP_CONFIG from config.js */

const PLACEHOLDER_KEY = "YOUR_GOOGLE_MAPS_API_KEY";

function isTouchUi() {
  return window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
}

function formatDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function popupHtml(sign) {
  return `
    <div class="popup">
      <img src="${sign.image}" alt="Sign photo ${sign.id}" width="200" height="150" loading="lazy" />
      <p class="date">Taken ${formatDate(sign.date)}</p>
      <p class="id">${sign.id}</p>
    </div>
  `;
}

async function loadSigns() {
  const res = await fetch("data/signs.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`Could not load data/signs.json (${res.status})`);
  return res.json();
}

function showSetup(message) {
  const el = document.getElementById("setup");
  el.hidden = false;
  if (message) {
    el.querySelector("p").textContent = message;
  }
}

function hideSetup() {
  document.getElementById("setup").hidden = true;
}

function loadGoogleMaps(apiKey) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(
        new Error(
          "Google Maps timed out. Check API restrictions (Maps JavaScript API must be allowed) and Application restrictions (allow http://localhost:5500/*)."
        )
      );
    }, 15000);

    window.__onGoogleMapsReady = () => {
      clearTimeout(timeout);
      delete window.__onGoogleMapsReady;
      resolve();
    };

    const script = document.createElement("script");
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}` +
      `&callback=__onGoogleMapsReady&v=weekly`;
    script.async = true;
    script.onerror = () => {
      clearTimeout(timeout);
      reject(new Error("Google Maps script failed to load (network or ad blocker)."));
    };
    document.head.appendChild(script);
  });
}

async function init() {
  if (window.__CONFIG_LOAD_ERROR) {
    showSetup(
      "config.js failed to load. In Live Server, open the DPR-map folder as the site root (the folder that contains index.html and config.js)."
    );
    return;
  }

  const apiKey = String((window.MAP_CONFIG && window.MAP_CONFIG.apiKey) || "").trim();
  if (!apiKey || apiKey === PLACEHOLDER_KEY) {
    showSetup(
      "MAP_CONFIG.apiKey is missing. Confirm config.js is next to index.html and contains: window.MAP_CONFIG = { apiKey: \"...\" };"
    );
    return;
  }

  const [signs] = await Promise.all([loadSigns(), loadGoogleMaps(apiKey)]);
  hideSetup();
  document.getElementById("count").textContent = String(signs.length);

  const map = new google.maps.Map(document.getElementById("map"), {
    mapTypeId: google.maps.MapTypeId.SATELLITE,
    center: { lat: 21.395, lng: -157.7388 },
    zoom: 16,
    maxZoom: 20,
    mapTypeControl: true,
    mapTypeControlOptions: {
      mapTypeIds: [
        google.maps.MapTypeId.SATELLITE,
        google.maps.MapTypeId.HYBRID,
        google.maps.MapTypeId.TERRAIN,
        google.maps.MapTypeId.ROADMAP,
      ],
      style: google.maps.MapTypeControlStyle.DROPDOWN_MENU,
    },
    streetViewControl: false,
    fullscreenControl: true,
  });

  map.setMapTypeId(google.maps.MapTypeId.SATELLITE);

  const bounds = new google.maps.LatLngBounds();
  const info = new google.maps.InfoWindow();
  const touch = isTouchUi();
  let openId = null;
  let pinnedId = null; // click keeps popup open until closed

  const dotIcon = {
    path: google.maps.SymbolPath.CIRCLE,
    scale: 5,
    fillColor: "#ffcc00",
    fillOpacity: 1,
    strokeColor: "#111111",
    strokeWeight: 1.5,
  };

  const openPopup = (sign, marker, { pin = false } = {}) => {
    info.setContent(popupHtml(sign));
    info.open({ map, anchor: marker });
    openId = sign.id;
    if (pin) pinnedId = sign.id;
  };

  const closePopup = () => {
    info.close();
    openId = null;
    pinnedId = null;
  };

  for (const sign of signs) {
    const position = { lat: sign.lat, lng: sign.lon };
    bounds.extend(position);

    const marker = new google.maps.Marker({
      map,
      position,
      title: sign.id,
      icon: dotIcon,
      optimized: true,
    });

    marker.addListener("click", () => {
      if (pinnedId === sign.id) {
        closePopup();
      } else {
        openPopup(sign, marker, { pin: true });
      }
    });

    if (!touch) {
      marker.addListener("mouseover", () => {
        if (pinnedId) return; // don't override a pinned popup
        openPopup(sign, marker);
      });
      marker.addListener("mouseout", () => {
        if (pinnedId) return; // stay open after click
        if (openId === sign.id) {
          info.close();
          openId = null;
        }
      });
    }
  }

  info.addListener("closeclick", closePopup);
  map.addListener("click", closePopup);

  if (signs.length) {
    map.fitBounds(bounds, 48);
    google.maps.event.addListenerOnce(map, "idle", () => {
      map.setMapTypeId(google.maps.MapTypeId.SATELLITE);
    });
  }
}

init().catch((err) => {
  console.error(err);
  showSetup(String(err && err.message ? err.message : err));
});
