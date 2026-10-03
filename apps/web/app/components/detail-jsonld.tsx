const API=(process.env.NEXT_PUBLIC_API_URL??"http://localhost:3000").replace(/\/$/,"");
const SITE=(process.env.NEXT_PUBLIC_SITE_URL??"https://dauvietweb-production.up.railway.app").replace(/\/$/,"");
const schemaType:Record<string,string>={destinations:"TouristDestination",places:"Place",stories:"Article",journeys:"TouristTrip",countries:"Country",regions:"AdministrativeArea",people:"Person",events:"Event"};
export async function DetailJsonLd({kind,slug,locale}:{kind:string;slug:string;locale:"vi"|"en"}){
 try{
  const r=await fetch(`${API}/v1/${kind}/${encodeURIComponent(slug)}?locale=${locale}`,{next:{revalidate:3600}});
  if(!r.ok)return null;const p=await r.json();const d=p?.data??p;const tr=d?.translation??{};
  const name=tr.name??tr.title??tr.displayName;if(!name)return null;
  const canonical=`${SITE}/${kind}/${encodeURIComponent(d?.slug??slug)}`;
  const json:Record<string,unknown>={"@context":"https://schema.org","@type":schemaType[kind]??"Thing",name,url:canonical};
  const description=tr.summary??tr.shortDescription??tr.description;if(description)json.description=description;
  if(kind==="stories"){json.headline=name;if(d.publishedAt)json.datePublished=d.publishedAt;if(d.byline)json.author={"@type":"Person",name:d.byline};}
  return <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(json).replace(/</g,"\\u003c")}}/>;
 }catch{return null}
}
