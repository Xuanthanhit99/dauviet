"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl, { type GeoJSONSource, type GeoJSONSourceSpecification, type Map as MapLibreMap } from "maplibre-gl";

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

type MapCollection = Extract<GeoJSONSourceSpecification["data"], { type: "FeatureCollection" }>;
type DiscoveryFeature = Omit<MapCollection["features"][number], "properties"> & { properties: FeatureProperties };
type FeatureCollection = Omit<MapCollection, "features"> & { features: DiscoveryFeature[] };
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
  const [panelOpen, setPanelOpen] = useState(true);
  const places = features.filter(feature => feature.properties?.entityType === "PLACE").slice(0, 6);
  const events = features.filter(feature => feature.properties?.entityType === "EVENT").slice(0, 4);

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
      if (id) { setSelectedId(String(id)); setPanelOpen(true); }
    };
    map.on("click", "places", selectFeature);
    map.on("click", "events", selectFeature);
    return () => { abortRef.current?.abort(); map.remove(); mapRef.current = null; };
  }, [load]);

  useEffect(() => { if (mapRef.current?.loaded()) void load(mapRef.current); }, [load]);

  const selectedFeature = features.find(feature => String(feature.properties?.id ?? "") === selectedId);
  const selectedRoute = selectedFeature?.properties?.slug && selectedFeature.properties.entityType === "PLACE" ? `/places/${encodeURIComponent(selectedFeature.properties.slug)}` : selectedFeature?.properties?.slug && selectedFeature.properties.entityType === "EVENT" ? `/events/${encodeURIComponent(selectedFeature.properties.slug)}` : null;

  const selectFromList = (feature: DiscoveryFeature) => {
    const id = feature.properties?.id;
    if (id) { setSelectedId(String(id)); setPanelOpen(true); }
    if (feature.geometry.type === "Point" && mapRef.current) mapRef.current.easeTo({ center: feature.geometry.coordinates as [number, number], zoom: Math.max(mapRef.current.getZoom(), 10) });
  };

  return <main id="main" className="travel-map-v4">
    <section className="tm-hero"><div className="container tm-hero-inner"><div className="eyebrow">Khám phá Việt Nam</div><h1>Đi đến một nơi.<br/>Hiểu câu chuyện của nơi ấy.</h1><p>Dấu Việt kết nối địa điểm đã xuất bản với sự kiện và câu chuyện trong đúng bối cảnh. Bản đồ là điểm bắt đầu, không phải điểm kết thúc.</p><div className="tm-hero-actions"><a className="button button-gold" href="#explore-area">Khám phá quanh đây</a><a className="button button-quiet" href="/journeys">Xem hành trình</a></div></div></section>
    <section id="explore-area" className="container tm-discovery">
      <div className="tm-search-row"><div><div className="eyebrow">Explore places</div><h2>Hôm nay bạn muốn khám phá đâu?</h2></div><div className="map-discovery-links"><a href="/explore">Tìm theo tên</a><a href="/stories">Câu chuyện</a><a href="/journeys">Hành trình</a></div></div>
      <form className="tm-filters" onSubmit={(event)=>{event.preventDefault();if(mapRef.current)void load(mapRef.current)}}>
        <label>Thời điểm lịch sử<input inputMode="numeric" pattern="-?[0-9]*" value={year} onChange={(e)=>setYear(e.target.value)} placeholder="Ví dụ: 1288"/></label>
        <label>Loại địa điểm<select value={types} onChange={(e)=>setTypes(e.target.value)}><option value="">Tất cả địa điểm</option><option value="HERITAGE_SITE">Di sản</option><option value="ARCHAEOLOGICAL_SITE">Khảo cổ</option><option value="MONUMENT">Di tích</option></select></label>
        <button type="submit" className="button button-gold">Áp dụng</button>
      </form>
      <div className="tm-main-grid">
        <div className="tm-map-column"><div className="tm-map-frame"><div className="tm-map" ref={hostRef} aria-label="Bản đồ khám phá Dấu Việt"/><div className="tm-map-caption"><strong>Khám phá quanh bản đồ</strong><span>{status==="loading"?"Đang tải dữ liệu…":status==="error"?error:`${features.length} dấu vết đã xuất bản trong khung nhìn`}</span></div></div><div className="tm-history-lens"><div><span className="eyebrow">Historical lens</span><strong>{year?`Bối cảnh năm ${year}`:"Bật lớp thời gian khi bạn muốn hiểu sâu hơn"}</strong></div><a href="/stories">Đi vào câu chuyện →</a></div></div>
        <aside className="tm-place-feed" aria-label="Địa điểm trong khu vực"><div className="tm-section-title"><div><span className="eyebrow">Điểm đến</span><h2>Đáng khám phá trong khu vực</h2></div><a href="/explore">Xem tất cả</a></div>
          {meta.truncated&&<p className="tm-notice">Khung nhìn có nhiều kết quả. Phóng to bản đồ để khám phá cụ thể hơn.</p>}
          {status==="ready"&&places.length===0&&<div className="tm-empty"><strong>Chưa có địa điểm đã xuất bản ở khung nhìn này.</strong><span>Di chuyển bản đồ hoặc mở Khám phá để tìm theo tên.</span></div>}
          <div className="tm-place-list">{places.map((feature,index)=><button type="button" key={feature.properties?.id??index} className={`tm-place-card ${selectedId===feature.properties?.id?"is-selected":""}`} onClick={()=>selectFromList(feature)}><span className="tm-card-index" aria-hidden="true">⌖</span><span><strong>{featureLabel(feature)}</strong><small>{feature.properties?.placeType??"Địa điểm"} · dữ liệu đã xuất bản</small></span><span aria-hidden="true">→</span></button>)}</div>
          {selectedFeature&&<article className="tm-selected"><div className="eyebrow">Đang khám phá</div><h3>{featureLabel(selectedFeature)}</h3><p>{selectedFeature.properties?.entityType==="TERRITORY"?"Lãnh thổ lịch sử chỉ được trình bày trong đúng bối cảnh thời gian, không suy diễn thành biên giới hiện tại.":"Mở hồ sơ để xem thông tin, câu chuyện và nguồn đã xuất bản của nơi này."}</p>{selectedRoute&&<a className="button button-gold" href={selectedRoute}>Mở hồ sơ địa điểm</a>}</article>}
        </aside>
      </div>
    </section>
    <section className="tm-story-band"><div className="container tm-story-grid"><div><span className="eyebrow">Understand stories</span><h2>Đằng sau mỗi nơi là những lớp thời gian.</h2><p>Chỉ những sự kiện đã xuất bản trong khung nhìn hiện tại mới xuất hiện ở đây. Không tự tạo dữ liệu để lấp khoảng trống.</p></div><div className="tm-event-list">{events.length?events.map((feature,index)=><article key={feature.properties?.id??index}><span>Sự kiện</span><strong>{featureLabel(feature)}</strong>{feature.properties?.slug&&<a href={`/events/${encodeURIComponent(feature.properties.slug)}`}>Đọc trong bối cảnh →</a>}</article>):<div className="tm-empty tm-empty-dark">Chưa có sự kiện đã xuất bản trong khung nhìn hiện tại.</div>}</div></div></section>
    <section className="container tm-journey"><div><span className="eyebrow">Đi tiếp</span><h2>Biến những nơi bạn quan tâm thành một hành trình.</h2></div><div className="tm-journey-actions"><a href="/journeys" className="button button-gold">Khám phá hành trình</a><a href="/stories" className="tm-text-link">Đọc câu chuyện</a></div></section>
  </main>;
