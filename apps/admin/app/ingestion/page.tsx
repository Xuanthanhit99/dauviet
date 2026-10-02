"use client";
import {useEffect,useState} from "react";
import {AdminGate} from "../admin-gate";
import {adminApi} from "../admin-session";

const COMMONS_FILES=[
 "File:2024-11-03 Hanoi's Old Quarter 1.jpg",
 "File:Hanoi - Temple of Literature.jpg",
 "File:Dien Kinh Thien 002.jpg",
 "File:Gion Kyoto.jpg",
];

export default function Ingestion(){
 const[sources,setSources]=useState<any[]>([]),[jobs,setJobs]=useState<any[]>([]),[candidates,setCandidates]=useState<any[]>([]),[state,setState]=useState("Đang tải vận hành nhập dữ liệu…");
 async function load(){
  try{
   const[s,j,c]:any[]=await Promise.all([adminApi.adminIngestionSources(),adminApi.adminIngestionJobs(),adminApi.adminIngestionCandidates({sourceCode:"WIKIMEDIA_COMMONS",pageSize:50})]);
   setSources(Array.isArray(s)?s:s.items??[]);setJobs(Array.isArray(j)?j:j.items??[]);setCandidates(Array.isArray(c)?c:c.items??[]);
   setState("Đã tải nguồn, tác vụ và hàng đợi review Wikimedia Commons.");
  }catch(e:any){setState(e?.status===403?"Cần quyền ADMIN/EDITOR phù hợp để vận hành ingestion.":"Không thể tải vận hành ingestion.");}
 }
 useEffect(()=>{void load()},[]);
 async function createCommonsJob(){
  try{
   await adminApi.adminCreateIngestionJob({sourceCode:"WIKIMEDIA_COMMONS",scopeType:"EXTERNAL_IDS",scopeParams:{ids:COMMONS_FILES},label:"Home V5 real media — curated batch v1"});
   setState("Đã tạo bounded Wikimedia Commons job. Bấm Chạy tác vụ sau khi kiểm tra source policy.");await load();
  }catch{setState("Không thể tạo Wikimedia Commons job.");}
 }
 async function approve(id:string){
  try{const result:any=await adminApi.adminApproveIngestionCandidate(id);setState(`Đã approve + promote candidate. MediaAsset: ${result?.entityId??"đã tạo"}.`);await load();}
  catch{setState("Approve/promotion thất bại; không có media nào được công bố một phần.");}
 }
 return <main><AdminGate><a href="/">← Admin</a><p className="eyebrow">ADMIN · REAL MEDIA INGESTION</p><h1>Nhập ảnh thật & provenance</h1>
  <p role="status">{state}</p>
  <section><h2>Nguồn dữ liệu</h2>{sources.length?sources.map(x=><p key={x.id}>{x.name??x.code??x.id} · enabled: {String(x.enabled??"—")}</p>):<p>Không có nguồn ingestion.</p>}</section>
  <section><h2>Curated Commons batch V1</h2><p>4 file title đã được chọn trước theo đúng địa điểm. Pipeline chỉ lấy metadata trước; binary chỉ được tải vào S3 sau human approval.</p><button onClick={createCommonsJob}>Tạo job ảnh thật V1</button></section>
  <section><h2>Tác vụ</h2>{jobs.length?jobs.map(x=><article key={x.id}><strong>{x.label??x.name??x.id}</strong><p>{x.status??x.runs?.[0]?.status??"chưa chạy"}</p><button onClick={async()=>{try{await adminApi.adminRunIngestionJob(x.id);setState("Đã enqueue tác vụ.");}catch{setState("Không thể chạy tác vụ.");}}}>Chạy tác vụ</button></article>):<p>Không có tác vụ.</p>}</section>
  <section><h2>Candidate cần review</h2>{candidates.length?candidates.map(x=><article key={x.id}><strong>{x.candidateType} · {x.status}</strong><p>{x.normalizedData?.description??x.id}</p><button disabled={!["NEEDS_REVIEW","AUTO_MATCHED","UNRESOLVED"].includes(x.status)} onClick={()=>void approve(x.id)}>Approve & promote vào MediaAsset/S3</button></article>):<p>Chưa có Wikimedia Commons candidate.</p>}</section>
 </AdminGate></main>;
}
