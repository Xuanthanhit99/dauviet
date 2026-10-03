import type {Metadata} from "next";
const API=(process.env.NEXT_PUBLIC_API_URL??"http://localhost:3000").replace(/\/$/,"");
export async function detailMetadata(kind:string,slug:string,locale:"vi"|"en",fallback:string):Promise<Metadata>{
 const path=kind==="people"?"people":kind;
 try{
  const r=await fetch(`${API}/v1/${path}/${encodeURIComponent(slug)}?locale=${locale}`,{next:{revalidate:3600}});
  if(!r.ok)return {title:fallback,robots:{index:false,follow:true}};
  const p=await r.json();const d=p?.data??p;const tr=d?.translation??{};
  const title=tr.name??tr.title??tr.displayName??fallback;
  const description=tr.summary??tr.shortDescription??tr.description??undefined;
  const canonical=`/${kind}/${encodeURIComponent(d?.slug??slug)}`;
  return {title,description,alternates:{canonical},openGraph:{title,description,url:canonical,type:"website"}};
 }catch{return {title:fallback,robots:{index:false,follow:true}}}
}
