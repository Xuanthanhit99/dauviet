"use client";

import { useEffect, useState } from "react";
import PublishedMedia from "../../components/published-media";

type Item={id:string;slug:string;title?:string;name?:string;summary?:string|null;type?:string;role?:string;isFeatured?:boolean;date?:{display?:string}|null};
type Destination={
 id:string;slug:string;type:string;importance:number;
 country:{slug:string;iso2:string};region?:{slug:string}|null;city?:{slug:string}|null;
 location?:{latitude:number;longitude:number}|null;heroMedia?:{id:string;url?:string|null}|null;
 translation?:{name?:string;summary?:string|null;description?:string|null;tagline?:string|null;whyVisit?:string|null}|null;
 themes:Array<{id:string;slug:string;category:string;name:string}>;
 places:Item[];stories:Item[];journeys:Item[];historicalTurningPoints:Item[];
 meta:{requestedLocale:string;resolvedLocale:string;fallbackApplied:boolean};
};
const API=(process.env.NEXT_PUBLIC_API_URL??"http://localhost:3000").replace(/\/$/,"");
const label=(x:Item)=>x.name??x.title??x.slug;
const copy={vi:{loading:"Đang tải điểm đến…",fail:"Không thể mở điểm đến",back:"Quay lại khám phá",understand:"Hiểu điểm đến",places:"Địa điểm",timeline:"Dòng thời gian",stories:"Câu chuyện",journeys:"Hành trình"},en:{loading:"Loading destination…",fail:"Unable to open destination",back:"Back to Explore",understand:"Understand",places:"Places",timeline:"Timeline",stories:"Stories",journeys:"Journeys"}} as const;

export default function DestinationDetail({slug,locale}:{slug:string;locale:"vi"|"en"}){
 const [data,setData]=useState<Destination|null>(null);const [error,setError]=useState("");const [loading,setLoading]=useState(true);
 useEffect(()=>{const c=new AbortController();setLoading(true);fetch(`${API}/v1/destinations/${encodeURIComponent(slug)}?locale=${locale}`,{signal:c.signal,credentials:"include"}).then(async r=>{const p=await r.json();if(!r.ok)throw new Error(p?.error?.message??"Không thể tải điểm đến.");return p?.data??p}).then(setData).catch(e=>{if(!c.signal.aborted)setError(e instanceof Error?e.message:"Không thể tải điểm đến.")}).finally(()=>{if(!c.signal.aborted)setLoading(false)});return()=>c.abort()},[slug,locale]);
 const ui=copy[locale];
 if(loading)return <main id="main" className="destination-state" aria-live="polite"><p>{ui.loading}</p></main>;
 if(error||!data)return <main id="main" className="destination-state"><div className="eyebrow">Destination</div><h1>{ui.fail}</h1><p>{error||"Không tìm thấy dữ liệu đã xuất bản."}</p><a className="button button-gold" href="/explore">{ui.back}</a></main>;
 const t=data.translation??{};
 return <main id="main" className="destination-page">
  <section className="destination-hero">
   <div className="container destination-hero-inner"><div className="destination-breadcrumb">World → {data.country.iso2} → {data.region?.slug??"Region"} → Destination</div><div className="eyebrow">{data.type}</div><h1>{t.name??data.slug}</h1>{t.tagline&&<p className="destination-tagline">{t.tagline}</p>}<p className="destination-summary">{t.summary??"Nội dung giới thiệu đang được biên tập từ dữ liệu đã xuất bản."}</p>
   <div className="destination-meta">{data.themes.map(x=><span key={x.id}>{x.name}</span>)}{data.meta.fallbackApplied&&<span>Ngôn ngữ dự phòng: {data.meta.resolvedLocale}</span>}</div></div>
  </section>
  {data.heroMedia?.id ? <section className="section destination-media" aria-label={locale==="en"?"Destination imagery and provenance":"Hình ảnh và nguồn gốc điểm đến"}><div className="container"><PublishedMedia id={data.heroMedia.id} locale={locale} /></div></section> : <section className="destination-media-empty"><div className="container"><p>{locale==="en"?"No eligible published hero media is linked to this destination.":"Chưa có hero media đã xuất bản đủ điều kiện cho điểm đến này."}</p></div></section>}
  <nav className="destination-jump container" aria-label={locale==="en"?"Destination sections":"Đi tới nội dung điểm đến"}><a href="#understand">{ui.understand}</a><a href="#places">{ui.places}</a><a href="#turning-points">{ui.timeline}</a><a href="#stories">{ui.stories}</a><a href="#journeys">{ui.journeys}</a></nav>
  <section id="understand" className="section"><div className="container destination-intro"><div><div className="eyebrow">Understand</div><h2>Hiểu nơi này trước khi lên đường</h2><p>{t.description??t.summary??"Chưa có mô tả đã xuất bản cho điểm đến này."}</p></div><aside>{t.whyVisit&&<><strong>Vì sao nên khám phá</strong><p>{t.whyVisit}</p></>}{data.location&&<><strong>Vị trí</strong><p>{data.location.latitude.toFixed(4)}, {data.location.longitude.toFixed(4)}</p></>}</aside></div></section>
  <Section id="places" eyebrow="Places" title="Những nơi tạo nên điểm đến" items={data.places} kind="place"/>
  <section id="turning-points" className="section destination-dark"><div className="container"><div className="eyebrow">How it became</div><h2>Những bước ngoặt theo thời gian</h2>{data.historicalTurningPoints.length?<div className="turning-list">{data.historicalTurningPoints.map(x=><article key={x.id}><time>{x.date?.display??"Thời gian chưa xác định"}</time><h3><a href={`/events/${encodeURIComponent(x.slug)}`}>{label(x)}</a></h3>{x.role&&<p>{x.role}</p>}</article>)}</div>:<p>Chưa có bước ngoặt lịch sử đã xuất bản.</p>}</div></section>
  <Section id="stories" eyebrow="Story Explorer" title="Đi sâu vào những câu chuyện" items={data.stories} kind="story"/>
  <Section id="journeys" eyebrow="Journeys" title="Tiếp tục bằng một hành trình" items={data.journeys} kind="journey"/>
  <section className="section destination-trust"><div className="container destination-trust-grid"><div><div className="eyebrow">Trust & provenance</div><h2>{locale==="en"?"Published knowledge, without invented gaps.":"Tri thức đã xuất bản, không tự lấp khoảng trống."}</h2><p>{locale==="en"?"Places, dates and media are shown only when supplied by published API data. Hero media appears only when the backend exposes eligible public media.":"Địa điểm, mốc thời gian và media chỉ hiển thị khi có trong dữ liệu API đã xuất bản. Hero media chỉ xuất hiện khi backend cung cấp media public đủ điều kiện."}</p></div><aside className="provenance-note"><strong>{locale==="en"?"Language resolution":"Ngôn ngữ hiển thị"}</strong><span>{data.meta.resolvedLocale.toUpperCase()}</span>{data.meta.fallbackApplied&&<small>{locale==="en"?"Fallback applied":"Đang dùng bản dịch dự phòng"}</small>}</aside></div></section>
 </main>
}
function Section({id,eyebrow,title,items,kind}:{id:string;eyebrow:string;title:string;items:Item[];kind:"place"|"story"|"journey"}){
 return <section id={id} className="section"><div className="container"><div className="section-head"><div><div className="eyebrow">{eyebrow}</div><h2>{title}</h2></div></div>{items.length?<div className="destination-card-grid">{items.map(x=><a key={x.id} className="destination-card" href={kind==="place"?`/places/${x.slug}`:kind==="story"?`/stories/${x.slug}`:`/journeys/${x.slug}`}><small>{x.type??x.role??eyebrow}</small><h3>{label(x)}</h3>{x.summary&&<p>{x.summary}</p>}</a>)}</div>:<p className="destination-empty">Chưa có nội dung đã xuất bản trong phần này.</p>}</div></section>
}
