"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from "maplibre-gl";

type FeatureProperties = {
  entityType?: "PLACE" | "EVENT" | "TERRITORY";
  id?: string;
  slug?: string;
  name?: string;
  title?: string;
  placeType?: string;
  historicalImportance?: number;
  importance?: number;
};

type DiscoveryFeature = GeoJSON.Feature<GeoJSON.Geometry, FeatureProperties>;
type FeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Geometry, FeatureProperties>;
type MapMeta = { truncated?: boolean; limit?: number; minImportance?: number };
type ApiEnvelope = { success: boolean; data: FeatureCollection; meta?: MapMeta };

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
const INITIAL_CENTER: [number, number] = [106.2, 16.4];
const MAP_STYLE = process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? "https://tiles.openfreemap.org/styles/liberty";

function featureLabel(feature: DiscoveryFeature) {
  return feature.properties?.name ?? feature.properties?.title ?? feature.properties?.slug ?? "Dấu vết chưa có tên";
}

export default function ExploreMapClient() {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [features, setFeatures] = useState<DiscoveryFeature[]>([]);
  const [meta, setMeta] = useState<MapMeta>({});
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [year, setYear] = useState("");
  const [types, setTypes] = useState("");
  const [selectedId, setSelectedId] = useState<string>();

  const load = useCallback(async (map: MapLibreMap) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const bounds = map.getBounds();
    const query = new URLSearchParams({
      bbox: [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()].join(","),
      zoom: String(map.getZoom()),
      locale: "vi",
    });
    if (year.trim()) query.set("year", year.trim());
    if (types) query.set("types", types);
    setStatus("loading");
    setError("");
    try {
      const response = await fetch(`${API_BASE.replace(/\/$/, "")}/v1/map/features?${query}`, { signal: controller.signal, credentials: "include" });
      const payload = await response.json() as ApiEnvelope & { error?: { message?: string } };
      if (!response.ok || !payload.success) throw new Error(payload.error?.message ?? "Không thể tải dữ liệu bản đồ.");
      const collection = payload.data?.type === "FeatureCollection" ? payload.data : EMPTY;
      setFeatures(collection.features);
      setMeta(payload.meta ?? {});
      const source = map.getSource("dauviet") as GeoJSONSource | undefined;
      source?.setData(collection);
      setStatus("ready");
    } catch (reason) {
      if (controller.signal.aborted) return;
      setStatus("error");
      setError(reason instanceof Error ? reason.message : "Không thể tải dữ liệu bản đồ.");
      const source = map.getSource("dauviet") as GeoJSONSource | undefined;
      source?.setData(EMPTY);
      setFeatures([]);
    }
  }, [types, year]);

  useEffect(() => {
    if (!hostRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: hostRef.current,
      center: INITIAL_CENTER,
      zoom: 4.4,
      attributionControl: false,
      style: MAP_STYLE,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");
    map.on("load", () => {
      // Keep Dấu Việt historical overlays separate from the basemap source.
      map.addSource("dauviet", { type: "geojson", data: EMPTY, cluster: true, clusterRadius: 46, clusterMaxZoom: 10 });
      map.addLayer({ id: "territories-fill", type: "fill", source: "dauviet", filter: ["==", ["get", "entityType"], "TERRITORY"], paint: { "fill-color": "#18463C", "fill-opacity": 0.12 } });
      map.addLayer({ id: "territories-line", type: "line", source: "dauviet", filter: ["==", ["get", "entityType"], "TERRITORY"], paint: { "line-color": "#18463C", "line-width": 1.75 } });
      map.addLayer({ id: "clusters", type: "circle", source: "dauviet", filter: ["has", "point_count"], paint: { "circle-color": "#062A24", "circle-radius": ["step", ["get", "point_count"], 18, 20, 22, 60, 26], "circle-stroke-color": "#EADDC7", "circle-stroke-width": 2 } });
      map.addLayer({ id: "cluster-count", type: "symbol", source: "dauviet", filter: ["has", "point_count"], layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 12 }, paint: { "text-color": "#FFFFFF" } });
      map.addLayer({ id: "places", type: "circle", source: "dauviet", filter: ["==", ["get", "entityType"], "PLACE"], paint: { "circle-color": "#18463C", "circle-radius": 10, "circle-stroke-color": "#D4AF7C", "circle-stroke-width": 3 } });
      map.addLayer({ id: "events", type: "circle", source: "dauviet", filter: ["==", ["get", "entityType"], "EVENT"], paint: { "circle-color": "#D4AF7C", "circle-radius": 8, "circle-stroke-color": "#062A24", "circle-stroke-width": 2 } });
      void load(map);
    });
    map.on("moveend", () => void load(map));
    map.on("click", "clusters", async (event) => {
      const cluster = map.queryRenderedFeatures(event.point, { layers: ["clusters"] })[0];
      const clusterId = cluster?.properties?.cluster_id;
      const source = map.getSource("dauviet") as GeoJSONSource;
      if (typeof clusterId !== "number") return;
      const zoom = await source.getClusterExpansionZoom(clusterId);
      const geometry = cluster.geometry;
      if (geometry.type === "Point") map.easeTo({ center: geometry.coordinates as [number, number], zoom });
    });
    const selectFeature = (event: maplibregl.MapLayerMouseEvent) => {
      const id = event.features?.[0]?.properties?.id;
      if (id) setSelectedId(String(id));
    };
    map.on("click", "places", selectFeature);
    map.on("click", "events", selectFeature);
    return () => { abortRef.current?.abort(); map.remove(); mapRef.current = null; };
  }, [load]);

  useEffect(() => { if (mapRef.current?.loaded()) void load(mapRef.current); }, [load]);

  const selectFromList = (feature: DiscoveryFeature) => {
    const id = feature.properties?.id;
    if (id) setSelectedId(String(id));
    if (feature.geometry.type === "Point" && mapRef.current) mapRef.current.easeTo({ center: feature.geometry.coordinates as [number, number], zoom: Math.max(mapRef.current.getZoom(), 10) });
  };

  return <main id="main" className="map-page">
    <section className="map-toolbar" aria-labelledby="map-title">
      <div><div className="eyebrow">Explore Map</div><h1 id="map-title">Khám phá không gian qua thời gian</h1><p>Địa điểm, sự kiện và lãnh thổ được tải theo đúng khung nhìn hiện tại. Mật độ thay đổi theo mức zoom do backend quyết định.</p></div>
      <form className="map-controls" onSubmit={(event) => { event.preventDefault(); if (mapRef.current) void load(mapRef.current); }}>
        <label>Năm lịch sử<input inputMode="numeric" pattern="-?[0-9]*" value={year} onChange={(e)=>setYear(e.target.value)} placeholder="Ví dụ: 1288" /></label>
        <label>Loại địa điểm<select value={types} onChange={(e)=>setTypes(e.target.value)}><option value="">Tất cả</option><option value="HERITAGE_SITE">Di sản</option><option value="ARCHAEOLOGICAL_SITE">Khảo cổ</option><option value="MONUMENT">Di tích</option></select></label>
        <button type="submit" className="button button-gold">Áp dụng</button>
      </form>
    </section>
    <section className="map-workspace">
      <div className="map-canvas" ref={hostRef} aria-label="Bản đồ khám phá Dấu Việt" />
      <aside className="map-results" aria-label="Danh sách đồng bộ với bản đồ">
        <div className="eyebrow">Trong khung nhìn</div><h2>Những dấu vết có thể khám phá</h2>
        <div className="map-live" aria-live="polite">{status === "loading" ? "Đang tải dữ liệu…" : status === "error" ? error : `${features.length} dấu vết trong khung nhìn.`}</div>
        {meta.truncated && <div className="map-warning">Kết quả đã đạt giới hạn {meta.limit ?? ""}. Hãy phóng to để xem chi tiết hơn.</div>}
        {status === "ready" && features.length === 0 && <p className="map-note">Không có thực thể đã xuất bản phù hợp trong khung nhìn này.</p>}
        <div className="map-feature-list">{features.map((feature,index)=>{
          const id=feature.properties?.id ?? `${feature.properties?.entityType ?? "feature"}-${index}`;
          return <button type="button" key={id} className="map-feature" aria-pressed={selectedId===feature.properties?.id} onClick={()=>selectFromList(feature)}>
            <span className={`feature-symbol ${(feature.properties?.entityType ?? "").toLowerCase()}`} aria-hidden="true"/>
            <span><strong>{featureLabel(feature)}</strong><small>{feature.properties?.entityType ?? "UNKNOWN"}{feature.properties?.placeType ? ` · ${feature.properties.placeType}` : ""}</small></span>
          </button>;
        })}</div>
      </aside>
    </section>
  </main>;
}
