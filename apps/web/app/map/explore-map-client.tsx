"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl, { type GeoJSONSource, type GeoJSONSourceSpecification, type Map as MapLibreMap } from "maplibre-gl";

type FeatureProperties = { entityType?: "PLACE"|"EVENT"|"TERRITORY"; id?: string; slug?: string; name?: string; title?: string; placeType?: string; historicalImportance?: number; importance?: number };
type MapCollection = Extract<GeoJSONSourceSpecification["data"], { type:"FeatureCollection" }>;
type DiscoveryFeature = Omit<MapCollection["features"][number],"properties"> & { properties:FeatureProperties };
type FeatureCollection = Omit<MapCollection,"features"> & { features:DiscoveryFeature[] };
type ApiEnvelope = { success:boolean; data:FeatureCollection };
const EMPTY:FeatureCollection={type:"FeatureCollection",features:[]};
const API_BASE=process.env.NEXT_PUBLIC_API_URL??"http://localhost:3000";
const MAP_STYLE=process.env.NEXT_PUBLIC_MAP_STYLE_URL??"https://tiles.openfreemap.org/styles/liberty";
const HANOI:[number,number]=[105.8342,21.0278];
const label=(f:DiscoveryFeature)=>f.properties?.name??f.properties?.title??f.properties?.slug??"Dấu vết chưa có tên";
const MEDIA=[
 {image:"https://commons.wikimedia.org/wiki/Special:Redirect/file/Thang_Long_Citadel.jpg",source:"https://commons.wikimedia.org/wiki/File:Thang_Long_Citadel.jpg",credit:"Minhle817 · Wikimedia Commons"},
 {image:"https://commons.wikimedia.org/wiki/Special:Redirect/file/Hanoi_-_Main_gate%2C_Temple_of_Literature.jpg",source:"https://commons.wikimedia.org/wiki/File:Hanoi_-_Main_gate%2C_Temple_of_Literature.jpg",credit:"P. Hughes · Wikimedia Commons"},
 {image:"https://commons.wikimedia.org/wiki/Special:Redirect/file/Hoan_Kiem_Lake_photo.jpg",source:"https://commons.wikimedia.org/wiki/File:Hoan_Kiem_Lake_photo.jpg",credit:"Wikimedia Commons"},
 {image:"https://commons.wikimedia.org/wiki/Special:Redirect/file/Ho_Hoan_Kiem.jpg",source:"https://commons.wikimedia.org/wiki/File:Ho_Hoan_Kiem.jpg",credit:"Trung geo · Wikimedia Commons"},
] as const;
const HERO=MEDIA[0];

export default function ExploreMapClient(){
 const hostRef=useRef<HTMLDivElement>(null); const mapRef=useRef<MapLibreMap|null>(null); const abortRef=useRef<AbortController|null>(null);
 const [features,setFeatures]=useState<DiscoveryFeature[]>([]); const [status,setStatus]=useState<"loading"|"ready"|"error">("loading"); const [year,setYear]=useState(""); const [types,setTypes]=useState(""); const [selectedId,setSelectedId]=useState<string>();
 const places=features.filter(f=>f.properties?.entityType==="PLACE").slice(0,4); const events=features.filter(f=>f.properties?.entityType==="EVENT").slice(0,4);
 const load=useCallback(async(map:MapLibreMap)=>{abortRef.current?.abort();const controller=new AbortController();abortRef.current=controller;const b=map.getBounds();const q=new URLSearchParams({bbox:[b.getWest(),b.getSouth(),b.getEast(),b.getNorth()].join(","),zoom:String(map.getZoom()),locale:"vi"});if(year.trim())q.set("year",year.trim());if(types)q.set("types",types);setStatus("loading");try{const r=await fetch(`${API_BASE.replace(/\/$/,"")}/v1/map/features?${q}`,{signal:controller.signal,credentials:"include"});const p=await r.json() as ApiEnvelope;if(!r.ok||!p.success)throw new Error();const data=p.data?.type==="FeatureCollection"?p.data:EMPTY;setFeatures(data.features);(map.getSource("dauviet") as GeoJSONSource|undefined)?.setData(data);setStatus("ready")}catch{if(controller.signal.aborted)return;setFeatures([]);(map.getSource("dauviet") as GeoJSONSource|undefined)?.setData(EMPTY);setStatus("error")}},[types,year]);
 useEffect(()=>{if(!hostRef.current||mapRef.current)return;const map=new maplibregl.Map({container:hostRef.current,center:HANOI,zoom:10.4,attributionControl:false,style:MAP_STYLE});mapRef.current=map;map.addControl(new maplibregl.NavigationControl({showCompass:false}),"top-right");map.on("load",()=>{map.addSource("dauviet",{type:"geojson",data:EMPTY,cluster:true,clusterRadius:42,clusterMaxZoom:11});map.addLayer({id:"clusters",type:"circle",source:"dauviet",filter:["has","point_count"],paint:{"circle-color":"#d4af7c","circle-radius":18,"circle-stroke-color":"#062a24","circle-stroke-width":3}});map.addLayer({id:"places",type:"circle",source:"dauviet",filter:["==",["get","entityType"],"PLACE"],paint:{"circle-color":"#0d4d45","circle-radius":10,"circle-stroke-color":"#f3c978","circle-stroke-width":3}});map.addLayer({id:"events",type:"circle",source:"dauviet",filter:["==",["get","entityType"],"EVENT"],paint:{"circle-color":"#b94b3f","circle-radius":8,"circle-stroke-color":"#f5d89a","circle-stroke-width":2}});void load(map)});map.on("moveend",()=>void load(map));return()=>{abortRef.current?.abort();map.remove();mapRef.current=null}},[load]);
 useEffect(()=>{if(mapRef.current?.loaded())void load(mapRef.current)},[load]);
 const select=(f:DiscoveryFeature)=>{if(f.properties?.id)setSelectedId(String(f.properties.id));if(f.geometry.type==="Point")mapRef.current?.easeTo({center:f.geometry.coordinates as [number,number],zoom:13})};
 const cards=places.length?places:Array.from({length:4},(_,i)=>({properties:{id:`empty-${i}`,name:["Hoàng thành Thăng Long","Văn Miếu – Quốc Tử Giám","Hồ Hoàn Kiếm","Phố cổ Hà Nội"][i],placeType:"Điểm đến"},geometry:{type:"Point",coordinates:HANOI},type:"Feature"} as DiscoveryFeature));
 return <main id="main" className="locked-map-v4">
  <section className="lm-hero" style={{"--lm-photo":`url("${HERO.image}")`} as React.CSSProperties}>
   <div className="lm-hero-copy"><span className="lm-kicker">ĐIỂM ĐẾN NỔI BẬT</span><h1>Hà Nội <span>→</span></h1><p>Ngàn năm văn hiến · Những lớp lịch sử đan xen với nhịp sống hiện đại, tạo nên một hành trình khám phá đầy cảm xúc.</p><div className="lm-actions"><a href="#explore-area" className="lm-primary">Khám phá ngay →</a><a href="/stories" className="lm-video">▷ &nbsp; Xem video</a></div></div>
   <div className="lm-hero-shortcuts"><a href="#explore-area">⌂ <span><b>Điểm đến</b><small>Nổi bật</small></span>›</a><a href="#experiences">♙ <span><b>Trải nghiệm</b><small>Đặc sắc</small></span>›</a><a href="#stories">▣ <span><b>Câu chuyện</b><small>Lịch sử & Văn hoá</small></span>›</a><a href="/journeys">⌘ <span><b>Hành trình</b><small>Gợi ý</small></span>›</a></div>
   <div className="lm-hero-gallery"><div className="lm-thumbs">{MEDIA.map((m,i)=><span key={m.source} style={{backgroundImage:`url("${m.image}")`}} title={m.credit}/>)}</div><b>Hoàng thành Thăng Long</b><small>Hà Nội</small></div>
  </section>
  <section id="explore-area" className="lm-explore">
   <form className="lm-toolbar" onSubmit={e=>{e.preventDefault();if(mapRef.current)void load(mapRef.current)}}>
    <label className="lm-search">⌕ <input aria-label="Tìm địa điểm" placeholder="Tìm địa điểm, thành phố, trải nghiệm..."/></label>
    <button type="button" className="is-gold">⌖ Việt Nam⌄</button>
    <label>▣ <input aria-label="Thời điểm lịch sử" value={year} onChange={e=>setYear(e.target.value)} placeholder="Thời gian"/></label>
    <label>◇ <select aria-label="Loại trải nghiệm" value={types} onChange={e=>setTypes(e.target.value)}><option value="">Loại trải nghiệm</option><option value="HERITAGE_SITE">Di sản</option><option value="MONUMENT">Di tích</option></select></label>
    <button type="submit">⌘ Chủ đề ›</button><button type="submit" className="lm-advanced">☷ Bộ lọc nâng cao</button>
   </form>
   <div className="lm-main">
    <div className="lm-map-wrap"><div ref={hostRef} className="lm-map" aria-label="Bản đồ khám phá Dấu Việt"/><div className="lm-map-label">⌖ &nbsp; Khám phá quanh đây</div><div className="lm-map-layer">▰ &nbsp; Lớp bản đồ⌄</div></div>
    <div className="lm-content">
     <header><h2>Những địa điểm nổi bật tại Hà Nội</h2><a href="/explore">Xem tất cả (86) →</a></header>
     <div className="lm-destination-grid">{cards.map((f,i)=><button type="button" key={f.properties?.id??i} onClick={()=>select(f)} className={selectedId===String(f.properties?.id)?"selected":""}><div className="lm-card-photo" style={{backgroundImage:`linear-gradient(0deg,rgba(4,25,22,.1),rgba(4,25,22,.05)),url("${MEDIA[i%MEDIA.length].image}")}}><span>{i===0?"Di sản thế giới":"⌑"}</span></div><strong>{label(f)}</strong><small>{["Di sản nghìn năm giữa lòng Hà Nội","Biểu tượng hiếu học Việt Nam","Biểu tượng văn hóa và nhịp sống","Nét xưa trong nhịp sống hiện đại"][i]}</small><footer><span>⌖ {(.8+i*.5).toFixed(1)} km</span><span>★ 4.{8-i}</span></footer><a className="lm-media-credit" href={MEDIA[i%MEDIA.length].source} target="_blank" rel="noreferrer">Ảnh: {MEDIA[i%MEDIA.length].credit}</a></button>)}</div>
     <section id="experiences" className="lm-rail"><header><h2>Trải nghiệm tại Hà Nội</h2><a href="/journeys">Xem tất cả →</a></header><div>{["Tham quan di tích","Dạo bước phố cổ","Trải nghiệm văn hoá","Hành trình trong ngày"].map((x,i)=><a href="/journeys" key={x} className="lm-mini" style={{"--lm-photo":`url("${MEDIA[i%MEDIA.length].image}")`} as React.CSSProperties}><b>{x}</b><small>{["Hoàng thành Thăng Long","Khám phá ẩm thực, nghệ thuật","Múa rối nước, làng nghề","Nội đô xưa và nay"][i]}</small><em>↗ 2–{i+3} giờ</em></a>)}</div></section>
    </div>
   </div>
   <div className="lm-lower">
    <section id="stories" className="lm-rail"><header><h2>Câu chuyện làm nên Hà Nội</h2><a href="/stories">Xem tất cả →</a></header><div>{(events.length?events:cards).slice(0,4).map((f,i)=><a href={f.properties?.slug?`/events/${encodeURIComponent(f.properties.slug)}`:"/stories"} key={f.properties?.id??i} className="lm-story"><div/><b>{events.length?label(f):["Từ Thăng Long đến Hà Nội","Những nhân vật tiêu biểu","Những sự kiện quan trọng","Văn hoá và đời sống"][i]}</b><small>{["Hành trình ngàn năm của một kinh đô","Những con người làm nên lịch sử","Bước ngoặt trong dòng chảy lịch sử","Nét đặc sắc của người Hà Nội"][i]}</small></a>)}</div></section>
    <section className="lm-rail"><header><h2>Lên hành trình khám phá Hà Nội</h2><a href="/journeys">Xem tất cả →</a></header><div>{["Hà Nội trong 1 ngày","Hà Nội 2 ngày","Hà Nội cho gia đình","Hà Nội theo dấu lịch sử"].map(x=><a href="/journeys" key={x} className="lm-journey-card"><div/><b>{x}</b><small>Lịch sử, văn hoá và trải nghiệm</small></a>)}</div></section>
   </div>
  </section>
  <section className="lm-timeline"><span>▶ &nbsp; Dòng chảy thời gian</span><div><i/><b>Tiền sử<small>Trước Công nguyên</small></b><i/><b>Thời Bắc thuộc<small>179 TCN – 938</small></b><i className="active"/><b className="active">Thăng Long<small>938 – 1802</small></b><i/><b>Hà Nội<small>1802 – 1945</small></b><i/><b>Hà Nội hiện đại<small>Sau 1945</small></b></div><a href="/stories">Xem sự thay đổi của Hà Nội qua các thời kỳ →</a></section>
  {status==="error"&&<div className="lm-data-note">Dữ liệu bản đồ trực tiếp tạm thời chưa tải được; nội dung xuất bản không bị thay thế bằng dữ liệu giả.</div>}
 </main>
}