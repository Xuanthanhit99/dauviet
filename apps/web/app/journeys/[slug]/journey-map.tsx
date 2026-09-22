"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import { hasCoordinates, stopName, type JourneyStop } from "./journey-detail";

const MAP_STYLE = process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? "https://tiles.openfreemap.org/styles/liberty";

export default function JourneyMap({ stops, selected, onSelect }: { stops: JourneyStop[]; selected: string | null; onSelect: (id: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const markers = useRef(new Map<string, HTMLButtonElement>());
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    const points = stops.filter(hasCoordinates);
    if (!host.current || !points.length) return;
    let instance: MapLibreMap | undefined;
    const buttons = markers.current;
    setState("loading");
    const timeout = window.setTimeout(() => setState(current => current === "loading" ? "error" : current), 12000);
    try {
      const first = points[0].place.location!;
      instance = new maplibregl.Map({ container: host.current, style: MAP_STYLE, center: [first.longitude!, first.latitude], zoom: 11, cooperativeGestures: true, attributionControl: false });
      map.current = instance;
      instance.scrollZoom.disable();
      instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      instance.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
      instance.getCanvas().setAttribute("aria-label", "Bản đồ vị trí các điểm dừng");
      instance.on("load", () => { window.clearTimeout(timeout); setState("ready"); });
      instance.on("error", () => { window.clearTimeout(timeout); setState("error"); });
      for (const [index, stop] of stops.entries()) {
        if (!hasCoordinates(stop)) continue;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "journey-marker dv-map-marker__hit";
        button.textContent = String(index + 1);
        button.setAttribute("aria-label", `Điểm ${index + 1}: ${stopName(stop)}`);
        button.setAttribute("aria-pressed", "false");
        button.addEventListener("click", () => onSelect(stop.place.id));
        buttons.set(stop.place.id, button);
        new maplibregl.Marker({ element: button }).setLngLat([stop.place.location!.longitude!, stop.place.location!.latitude]).addTo(instance);
      }
      const bounds = new maplibregl.LngLatBounds();
      points.forEach(stop => bounds.extend([stop.place.location!.longitude!, stop.place.location!.latitude]));
      instance.fitBounds(bounds, { padding: 60, maxZoom: 13, duration: 0 });
    } catch { window.clearTimeout(timeout); setState("error"); }
    return () => { window.clearTimeout(timeout); instance?.remove(); buttons.clear(); map.current = null; };
  }, [stops, onSelect]);
  useEffect(() => {
    markers.current.forEach((button, id) => button.setAttribute("aria-pressed", String(id === selected)));
    const stop = stops.find(item => item.place.id === selected);
    if (!stop || !hasCoordinates(stop)) return;
    map.current?.easeTo({ center: [stop.place.location!.longitude!, stop.place.location!.latitude], zoom: 13, duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 300 });
  }, [selected, stops]);
  function showAll() {
    const bounds = new maplibregl.LngLatBounds();
    stops.filter(hasCoordinates).forEach(stop => bounds.extend([stop.place.location!.longitude!, stop.place.location!.latitude]));
    if (!bounds.isEmpty()) map.current?.fitBounds(bounds, { padding: 60, maxZoom: 13, duration: 0 });
  }
  return <div className="journey-map-panel">
    <div ref={host} className="journey-map" role="region" aria-label="Bản đồ hành trình"/>
    {state === "loading" && <p role="status">Đang tải bản đồ nền…</p>}
    {state === "error" && <p role="status">Bản đồ nền chưa khả dụng. Danh sách điểm dừng và liên kết địa điểm vẫn sử dụng được.</p>}
    <button className="journey-map-select" onClick={showAll}>Xem tất cả điểm</button>
  </div>;
}
