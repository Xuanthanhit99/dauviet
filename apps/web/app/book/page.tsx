"use client";

import {FormEvent,useState} from "react";
import {webApi} from "../auth/session";

type Kind="stay"|"food"|"activity";
type Row={id?:string;slug?:string;name?:string;title?:string;canonicalSlug?:string;city?:string;country?:string;providerCode?:string;[key:string]:unknown};

function rows(value:unknown):Row[]{
 if(Array.isArray(value))return value as Row[];
 if(value&&typeof value==="object"){
  const v=value as Record<string,unknown>;
  for(const key of ["items","data","results","accommodations","restaurants","activities"])if(Array.isArray(v[key]))return v[key] as Row[];
 }
 return [];
}
function label(row:Row){return String(row.name??row.title??row.slug??row.canonicalSlug??"Kết quả");}
function slug(row:Row){return String(row.slug??row.canonicalSlug??row.id??"");}

export default function BookPage(){
 const [kind,setKind]=useState<Kind>("stay");
 const [items,setItems]=useState<Row[]>([]);
 const [status,setStatus]=useState("Chọn loại trải nghiệm và nhập điểm đến để bắt đầu.");
 const [busy,setBusy]=useState(false);
 async function search(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setBusy(true);setStatus("Đang tìm dữ liệu đã xác minh từ hệ thống…");setItems([]);
  const f=new FormData(event.currentTarget),destination=String(f.get("destination")??"").trim();
  try{
   const value=kind==="stay"
    ?await webApi.listAccommodations({destination,page:1,pageSize:20})
    :kind==="food"
     ?await webApi.listRestaurants({city:destination,page:1,pageSize:20})
     :await webApi.listActivities({destination,page:1,pageSize:20});
   const next=rows(value);setItems(next);setStatus(next.length?"":"Chưa có dữ liệu phù hợp. Dấu Việt không tự suy đoán địa điểm, giá hay khả năng đặt.");
  }catch{setStatus("Không thể tải dữ liệu lúc này. Không có dữ liệu thay thế được dựng giả.");}
  finally{setBusy(false);}
 }
 return <main id="main" className="auth-shell"><section className="auth-card" aria-labelledby="book-title">
  <div className="eyebrow">BOOK · Provider data</div>
  <h1 id="book-title">Tìm nơi ở, món ăn và hoạt động</h1>
  <p>Dấu Việt giúp khám phá và chuyển tiếp tới nhà cung cấp đủ điều kiện; đây không phải công cụ xác nhận đặt chỗ trong Dấu Việt.</p>
  <div role="group" aria-label="Loại trải nghiệm">
   {([["stay","Nơi ở"],["food","Ăn uống"],["activity","Hoạt động"]] as const).map(([value,text])=><button key={value} type="button" className={kind===value?"button button-gold":"button button-quiet"} aria-pressed={kind===value} onClick={()=>{setKind(value);setItems([]);setStatus("Nhập điểm đến để tìm.");}}>{text}</button>)}
  </div>
  <form className="auth-form" onSubmit={search}>
   <label>Điểm đến<input name="destination" required placeholder="Ví dụ: ha-noi"/></label>
   <button className="button button-gold" disabled={busy}>{busy?"Đang tìm…":"Tìm"}</button>
  </form>
  <p role="status">{status}</p>
  <div>
   {items.map((item,index)=><article key={String(item.id??item.slug??index)}>
    <h2>{label(item)}</h2>
    {(item.city||item.country)&&<p>{[item.city,item.country].filter(Boolean).join(" · ")}</p>}
    {slug(item)&&<a className="button button-quiet" href={`/book/${kind}/${encodeURIComponent(slug(item))}`}>Xem chi tiết</a>}
   </article>)}
  </div>
 </section></main>
}
