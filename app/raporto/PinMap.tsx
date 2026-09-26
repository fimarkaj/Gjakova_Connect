"use client";

import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Next.js bundles Leaflet's default marker image paths incorrectly, so the stock
// blue-pin icon 404s unless we repoint it at the CDN-hosted assets.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// Recreates the mockup's clay teardrop pin (viewBox 0 0 24 30) as a Leaflet divIcon,
// using the same CSS custom properties so it matches in light and dark mode.
const clayPinIcon = L.divIcon({
  className: "leaflet-clay-pin",
  html: `<svg width="30" height="38" viewBox="0 0 24 30" fill="none" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,0.25))">
    <path d="M12 0C5.4 0 0 5.4 0 12c0 8 12 18 12 18s12-10 12-18c0-6.6-5.4-12-12-12z" fill="var(--clay)"/>
    <circle cx="12" cy="12" r="4.6" fill="var(--paper)"/>
  </svg>`,
  iconSize: [30, 38],
  iconAnchor: [15, 38],
});

export const GJAKOVA_CENTER: [number, number] = [42.3803, 20.4308];
const GJAKOVA_ZOOM = 14;

type LatLng = { lat: number; lng: number };

function ClickHandler({ onSelect }: { onSelect: (pos: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onSelect({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

function FlyToController({ target }: { target: (LatLng & { nonce: number }) | null }) {
  const map = useMap();
  const lastNonce = useRef<number | null>(null);
  useEffect(() => {
    if (!target || target.nonce === lastNonce.current) return;
    lastNonce.current = target.nonce;
    map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 16), { duration: 0.8 });
  }, [target, map]);
  return null;
}

export default function PinMap({
  position,
  onSelect,
  flyTo,
}: {
  position: LatLng | null;
  onSelect: (pos: LatLng) => void;
  flyTo: (LatLng & { nonce: number }) | null;
}) {
  return (
    <MapContainer
      center={GJAKOVA_CENTER}
      zoom={GJAKOVA_ZOOM}
      style={{ width: "100%", height: "100%" }}
      scrollWheelZoom={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ClickHandler onSelect={onSelect} />
      <FlyToController target={flyTo} />
      {position && (
        <Marker
          position={[position.lat, position.lng]}
          icon={clayPinIcon}
          draggable
          eventHandlers={{
            dragend(e) {
              const marker = e.target as L.Marker;
              const latlng = marker.getLatLng();
              onSelect({ lat: latlng.lat, lng: latlng.lng });
            },
          }}
        />
      )}
    </MapContainer>
  );
}
