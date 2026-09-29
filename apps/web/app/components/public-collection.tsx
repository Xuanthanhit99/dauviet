"use client";

import { useEffect, useState } from "react";
import "./discovery-collection.css";

type Item={id:string;slug:string;title:string;type?:string};
type Page={items:Item[];nextCursor:string|null;hasMore:boolean};
const API=(process.env.NEXT_PUBLIC_API_URL??"http://localhost:3000").replace(/\/$/,"");
export default function PublicCollection({kind,locale}:{kind:"stories"|"journeys";locale:"vi"|"en"}){
 const [page,setPage]=useState<Page|null>(null),[error,setError]=useState(false),[loading,setLoading]=useState(true),[cursor,setCursor]=useState<string|null>(null);
 useEffect(()=>{const c=new AbortController();setLoading(true);setError(false);fetch(`${API}/v1/${kind}?locale=${locale}&limit=20${cursor?`&cursor=${encodeURIComponent(cursor)}`:""}`,{signal:c.signal}).then(async r=>{if(!r.ok)throw new Error();return r.json()}).then(v=>{const d=v?.data??v;setPage(old=>cursor&&old?{items:[...old.items,...(d.items??[])],nextCursor:d.nextCursor??null,hasMore:!!d.hasMore}:d)}).catch(()=>{if(!c.signal.aborted)setError(true)}).finally(()=>{if(!c.signal.aborted)setLoading(false)});return()=>c.abort()},[kind,locale,cursor]);
 if(loading&&!page)return <p className="collection-state" role="status">{locale==="vi"?"Đang tải nội dung…":"Loading content…"}</p>;
 if(error&&!page)return <div className="collection-state" role="alert"><p>{locale==="vi"?"Chưa thể tải danh sách. Vui lòng thử lại.":"The collection could not be loaded. Please try again."}</p><button type="button" onClick={()=>setCursor(value=>value===null?"":null)}>{locale==="vi"?"Thử lại":"Retry"}</button></div>;
 const items=page?.items??[];
 if(!items.length)return <p className="collection-state">{locale==="vi"?"Chưa có nội dung đã xuất bản trong danh sách này.":"No published content is available in this collection yet."}</p>;
 return <><div className="collection-grid">{items.map(item=><article className="collection-card" key={item.id}><p className="collection-kicker">{item.type??(kind==="stories"?"Story":"Journey")}</p><h2>{item.title||item.slug}</h2><a href={`/${kind}/${encodeURIComponent(item.slug)}?locale=${locale}`}>{locale==="vi"?"Mở nội dung":"Open"} <span aria-hidden="true">↗</span></a></article>)}</div>{page?.hasMore&&page.nextCursor&&<p><button onClick={()=>setCursor(page.nextCursor)} disabled={loading}>{loading?(locale==="vi"?"Đang tải…":"Loading…"):(locale==="vi"?"Xem thêm":"Load more")}</button></p>}{error&&page&&<div className="collection-state" role="alert"><p>{locale==="vi"?"Không tải được trang tiếp theo.":"The next page could not be loaded."}</p><button type="button" onClick={()=>setCursor(value=>value===null?"":null)}>{locale==="vi"?"Thử lại":"Retry"}</button></div>}</>;
}
