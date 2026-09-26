"use client";

import { useMemo } from "react";
import { MapContainer, TileLayer, Marker } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Report } from "@/lib/types";
import { statusPinColor } from "@/lib/types";

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const GJAKOVA_CENTER: [number, number] = [42.3803, 20.4308];
const GJAKOVA_ZOOM = 13;

const iconCache = new Map<string, L.DivIcon>();

function pinIcon(color: string): L.DivIcon {
  const cached = iconCache.get(color);
  if (cached) return cached;
  const icon = L.divIcon({
    className: "leaflet-clay-pin",
    html: `<svg width="30" height="38" viewBox="0 0 24 30" fill="none" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,0.25))">
      <path d="M12 0C5.4 0 0 5.4 0 12c0 8 12 18 12 18s12-10 12-18c0-6.6-5.4-12-12-12z" fill="${color}"/>
      <circle cx="12" cy="12" r="4.6" fill="var(--paper)"/>
    </svg>`,
    iconSize: [30, 38],
    iconAnchor: [15, 38],
  });
  iconCache.set(color, icon);
  return icon;
}

export default function ReportsMap({
  reports,
  onPinClick,
}: {
  reports: Report[];
  onPinClick: (id: string) => void;
}) {
  const pins = useMemo(
    () => reports.filter((r) => r.latitude != null && r.longitude != null),
    [reports]
  );

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
      {pins.map((r) => (
        <Marker
          key={r.id}
          position={[r.latitude as number, r.longitude as number]}
          icon={pinIcon(statusPinColor(r.status))}
          eventHandlers={{ click: () => onPinClick(r.id) }}
        />
      ))}
    </MapContainer>
  );
}
