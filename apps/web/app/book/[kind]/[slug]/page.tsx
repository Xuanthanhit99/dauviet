"use client";

import {FormEvent,useEffect,useState} from "react";
import {useParams} from "next/navigation";
import {webApi} from "../../../auth/session";

type Kind="stay"|"food"|"activity";
type Detail={name?:string;title?:string;description?:string;providerCode?:string;[key:string]:unknown};
function providerRows(value:unknown){
 if(Array.isArray(value))return value;
 if(value&&typeof value==="object"){
  const v=value as Record<string,unknown>;
  for(const key of ["items","offers","data","results"])if(Array.isArray(v[key]))return v[key] as unknown[];
 }
 return [];
}

export default function BookDetailPage(){
 const params=useParams<{kind:string;slug:string}>(),kind=params.kind as Kind,slug=decodeURIComponent(params.slug);
 const [detail,setDetail]=useState<Detail|null>(null),[providerData,setProviderData]=useState<unknown[]>([]);
 const [status,setStatus]=useState("Đang tải…"),[busy,setBusy]=useState(false);
 useEffect(()=>{void (async()=>{try{
  const value=kind==="stay"?await webApi.accommodation<Detail>(slug):kind==="food"?await webApi.restaurant<Detail>(slug):await webApi.activity<Detail>(slug);
  setDetail(value);setStatus("");
 }catch{setStatus("Không thể tải chi tiết. Dấu Việt không dựng dữ liệu thay thế.");}})()},[kind,slug]);
 async function loadProvider(event?:FormEvent<HTMLFormElement>){
  event?.preventDefault();setBusy(true);setProviderData([]);
  try{
   let value:unknown;
   if(kind==="food")value=await webApi.restaurantOperationalSnapshot(slug);
   else{
    const f=new FormData(event!.currentTarget);
    value=kind==="stay"
     ?await webApi.accommodationOffers(slug,{checkIn:String(f.get("checkIn")),checkOut:String(f.get("checkOut")),guests:Number(f.get("guests")),rooms:Number(f.get("rooms")||1),currency:String(f.get("currency")||"VND")})
     :await webApi.activityOffers(slug,{date:String(f.get("date")),participants:Number(f.get("participants")),currency:String(f.get("currency")||"VND")});
   }
   const next=providerRows(value);setProviderData(next);setStatus(next.length?"Dữ liệu bên dưới thuộc nhà cung cấp và có thể thay đổi.":"Hiện không có dữ liệu nhà cung cấp đủ điều kiện cho ngữ cảnh này.");
  }catch{setStatus("Dữ liệu nhà cung cấp hiện không khả dụng hoặc không đủ điều kiện.");}
  finally{setBusy(false);}
 }
 if(!["stay","food","activity"].includes(kind))return <main id="main" className="auth-shell"><p>Loại BOOK không hợp lệ.</p></main>;
 return <main id="main" className="auth-shell"><section className="auth-card">
  <div className="eyebrow">BOOK · {kind.toUpperCase()}</div><h1>{detail?.name??detail?.title??slug}</h1>
  {detail?.description&&<p>{String(detail.description)}</p>}
  {kind==="food"?<button className="button button-gold" disabled={busy} onClick={()=>void loadProvider()}>{busy?"Đang tải…":"Xem trạng thái vận hành hiện tại"}</button>:
   <form className="auth-form" onSubmit={loadProvider}>
    {kind==="stay"?<><label>Nhận phòng<input name="checkIn" type="date" required/></label><label>Trả phòng<input name="checkOut" type="date" required/></label><label>Số khách<input name="guests" type="number" min="1" defaultValue="2" required/></label><label>Số phòng<input name="rooms" type="number" min="1" defaultValue="1" required/></label></>:<><label>Ngày tham gia<input name="date" type="date" required/></label><label>Số người<input name="participants" type="number" min="1" defaultValue="1" required/></label></>}
    <label>Tiền tệ<input name="currency" defaultValue="VND" maxLength={3} required/></label>
    <button className="button button-gold" disabled={busy}>{busy?"Đang kiểm tra…":"Kiểm tra dữ liệu nhà cung cấp"}</button>
   </form>}
  <p role="status">{status}</p>
  {providerData.map((value,index)=><pre key={index}>{JSON.stringify(value,null,2)}</pre>)}
  <p><a href="/book">Quay lại BOOK</a></p>
 </section></main>;
}
