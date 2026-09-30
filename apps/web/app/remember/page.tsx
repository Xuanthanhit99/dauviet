"use client";
import {useEffect,useState} from "react";
import {restoreWebSession,webApi} from "../auth/session";
type Bookmark={id?:string;targetType:string;targetId:string;createdAt?:string};
export default function RememberPage(){const [items,setItems]=useState<Bookmark[]>([]),[state,setState]=useState("Đang tải mục đã lưu…");
useEffect(()=>{void restoreWebSession().then(async u=>{if(!u){setState("AUTH");return}try{const r:any=await webApi.listBookmarks();setItems(Array.isArray(r)?r:r.items??[]);setState("OK")}catch{setState("Không thể tải mục đã lưu.")}})},[]);
if(state==="AUTH")return <main id="main" className="auth-shell"><section className="auth-card"><h1>Nhớ lại hành trình</h1><p>Đăng nhập để xem những địa điểm, câu chuyện và dấu mốc bạn đã chủ động lưu.</p><a className="button button-gold" href="/auth/login">Đăng nhập</a></section></main>;
return <main id="main" className="content-shell"><div className="eyebrow">REMEMBER · RIÊNG TƯ</div><h1>Đã lưu</h1><p>Đây là danh sách cá nhân của bạn. Việc lưu không biến nội dung cộng đồng thành kiến thức đã xác minh.</p>{state!=="OK"?<p role="status">{state}</p>:items.length===0?<p role="status">Bạn chưa lưu nội dung nào.</p>:<div className="card-grid">{items.map((b,i)=><article className="content-card" key={b.id??i}><div className="eyebrow">{b.targetType}</div><h2>{b.targetId}</h2><button className="button button-quiet" onClick={async()=>{await webApi.removeBookmark(b.targetType,b.targetId);setItems(x=>x.filter(v=>v!==b))}}>Bỏ lưu</button></article>)}</div>}</main>}
