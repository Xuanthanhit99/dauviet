"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const MAP_STYLE = process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? "https://tiles.openfreemap.org/styles/liberty";

/** One supplied representative point; no boundary, child coordinates or route is inferred. */
export default function RegionMap({ latitude, longitude, locale }: { latitude: number; longitude: number; locale: "vi" | "en" }) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState("loading");
  useEffect(() => {
    if (!host.current) return;
    let map: maplibregl.Map | undefined;
    const observer = new ResizeObserver(() => map?.resize());
    setState("loading");
    const timeout = window.setTimeout(() => setState("error"), 12000);
    try {
      map = new maplibregl.Map({ container: host.current, style: MAP_STYLE, center: [longitude, latitude], zoom: 7, interactive: false, attributionControl: false });
      observer.observe(host.current);
      map.addControl(new maplibregl.AttributionControl({ compact: false }), "bottom-right");
      map.getCanvas().setAttribute("aria-label", locale === "vi" ? "Bản đồ điểm đại diện" : "Representative point map");
      map.getCanvas().setAttribute("tabindex", "-1");
      const marker = document.createElement("div");
      marker.className = "region-map-dot";
      marker.setAttribute("aria-hidden", "true");
      new maplibregl.Marker({ element: marker }).setLngLat([longitude, latitude]).addTo(map);
      map.on("load", () => { window.clearTimeout(timeout); setState("ready"); });
      map.on("error", () => { window.clearTimeout(timeout); setState("error"); });
    } catch { window.clearTimeout(timeout); setState("error"); }
    return () => { window.clearTimeout(timeout); observer.disconnect(); map?.remove(); };
  }, [latitude, longitude, locale]);
  return <div><div ref={host} className="region-map" role="region" aria-label={locale === "vi" ? "Bản đồ vị trí đại diện" : "Regional reference map"} /><p className="region-small" role="status">{state === "loading" ? (locale === "vi" ? "Đang tải bản đồ nền…" : "Loading basemap…") : state === "error" ? (locale === "vi" ? "Bản đồ nền chưa khả dụng. Tọa độ và nội dung vùng vẫn có thể đọc ở trên." : "Basemap unavailable. The coordinates and regional content remain readable above.") : (locale === "vi" ? "Bản đồ tham chiếu · một điểm đại diện" : "Reference map · one representative point")}</p></div>;
}
