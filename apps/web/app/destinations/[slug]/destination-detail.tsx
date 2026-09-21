"use client";

import { useEffect, useState } from "react";

type Item={id:string;slug:string;title?:string;name?:string;summary?:string|null;type?:string;role?:string;isFeatured?:boolean;date?:{display?:string}|null};
type Destination={
 id:string;slug:string;type:string;importance:number;
 country:{slug:string;iso2:string};region?:{slug:string}|null;city?:{slug:string}|null;
 location?:{latitude:number;longitude:number}|null;heroMedia?:{id:string;url:string|null}|null;
 translation?:{name?:string;summary?:string|null;description?:string|null;tagline?:string|null;whyVisit?:string|null}|null;
 themes:Array<{id:string;slug:string;category:string;name:string}>;
 places:Item[];stories:Item[];journeys:Item[];historicalTurningPoints:Item[];
 meta:{requestedLocale:string;resolvedLocale:string;fallbackApplied:boolean};
};
const API=(process.env.NEXT_PUBLIC_API_URL??"http://localhost:3000").replace(/\/$/,"");
const label=(x:Item)=>x.name??x.title??x.slug;

export default function DestinationDetail({slug}:{slug:string}){
 const [data,setData]=useState<Destination|null>(null);const [error,setError]=useState("");const [loading,setLoading]=useState(true);
 useEffect(()=>{const c=new AbortController();setLoading(true);fetch(`${API}/v1/destinations/${encodeURIComponent(slug)}?locale=vi`,{signal:c.signal,credentials:"include"}).then(async r=>{const p=await r.json();if(!r.ok)throw new Error(p?.error?.message??"Không thể tải điểm đến.");return p?.data??p}).then(setData).catch(e=>{if(!c.signal.aborted)setError(e instanceof Error?e.message:"Không thể tải điểm đến.")}).finally(()=>{if(!c.signal.aborted)setLoading(false)});return()=>c.abort()},[slug]);
 if(loading)return <main id="main" className="destination-state" aria-live="polite"><p>Đang tải điểm đến…</p></main>;
 if(error||!data)return <main id="main" className="destination-state"><div className="eyebrow">Destination</div><h1>Không thể mở điểm đến</h1><p>{error||"Không tìm thấy dữ liệu đã xuất bản."}</p><a className="button button-gold" href="/explore">Quay lại khám phá</a></main>;
 const t=data.translation??{};
 return <main id="main" className="destination-page">
  <section className={`destination-hero ${data.heroMedia?.url?"has-media":""}`} style={data.heroMedia?.url?{backgroundImage:`linear-gradient(90deg,rgba(6,42,36,.92),rgba(6,42,36,.42)),url("${data.heroMedia.url}")`}:undefined}>
   <div className="container destination-hero-inner"><div className="destination-breadcrumb">World → {data.country.iso2} → {data.region?.slug??"Region"} → Destination</div><div className="eyebrow">{data.type}</div><h1>{t.name??data.slug}</h1>{t.tagline&&<p className="destination-tagline">{t.tagline}</p>}<p className="destination-summary">{t.summary??"Nội dung giới thiệu đang được biên tập từ dữ liệu đã xuất bản."}</p>
   <div className="destination-meta">{data.themes.map(x=><span key={x.id}>{x.name}</span>)}{data.meta.fallbackApplied&&<span>Ngôn ngữ dự phòng: {data.meta.resolvedLocale}</span>}</div></div>
  </section>
  <nav className="destination-jump container" aria-label="Đi tới nội dung điểm đến"><a href="#understand">Hiểu điểm đến</a><a href="#places">Địa điểm</a><a href="#turning-points">Dòng thời gian</a><a href="#stories">Câu chuyện</a><a href="#journeys">Hành trình</a></nav>
  <section id="understand" className="section"><div className="container destination-intro"><div><div className="eyebrow">Understand</div><h2>Hiểu nơi này trước khi lên đường</h2><p>{t.description??t.summary??"Chưa có mô tả đã xuất bản cho điểm đến này."}</p></div><aside>{t.whyVisit&&<><strong>Vì sao nên khám phá</strong><p>{t.whyVisit}</p></>}{data.location&&<><strong>Vị trí</strong><p>{data.location.latitude.toFixed(4)}, {data.location.longitude.toFixed(4)}</p></>}</aside></div></section>
  <Section id="places" eyebrow="Places" title="Những nơi tạo nên điểm đến" items={data.places} kind="place"/>
  <section id="turning-points" className="section destination-dark"><div className="container"><div className="eyebrow">How it became</div><h2>Những bước ngoặt theo thời gian</h2>{data.historicalTurningPoints.length?<div className="turning-list">{data.historicalTurningPoints.map(x=><article key={x.id}><time>{x.date?.display??"Thời gian chưa xác định"}</time><h3>{label(x)}</h3>{x.role&&<p>{x.role}</p>}</article>)}</div>:<p>Chưa có bước ngoặt lịch sử đã xuất bản.</p>}</div></section>
  <Section id="stories" eyebrow="Story Explorer" title="Đi sâu vào những câu chuyện" items={data.stories} kind="story"/>
  <Section id="journeys" eyebrow="Journeys" title="Tiếp tục bằng một hành trình" items={data.journeys} kind="journey"/>
  <section className="section destination-trust"><div className="container"><div className="eyebrow">Trust & provenance</div><h2>Dữ liệu hiển thị theo trạng thái xuất bản.</h2><p>Dấu Việt không tự điền địa điểm, mốc thời gian hay hình ảnh khi API không cung cấp. Media hero chỉ xuất hiện khi backend trả về media public/ready.</p></div></section>
 </main>
}
function Section({id,eyebrow,title,items,kind}:{id:string;eyebrow:string;title:string;items:Item[];kind:"place"|"story"|"journey"}){
 return <section id={id} className="section"><div className="container"><div className="section-head"><div><div className="eyebrow">{eyebrow}</div><h2>{title}</h2></div></div>{items.length?<div className="destination-card-grid">{items.map(x=><a key={x.id} className="destination-card" href={kind==="place"?`/places/${x.slug}`:kind==="story"?`/stories/${x.slug}`:`/journeys/${x.slug}`}><small>{x.type??x.role??eyebrow}</small><h3>{label(x)}</h3>{x.summary&&<p>{x.summary}</p>}</a>)}</div>:<p className="destination-empty">Chưa có nội dung đã xuất bản trong phần này.</p>}</div></section>
}
