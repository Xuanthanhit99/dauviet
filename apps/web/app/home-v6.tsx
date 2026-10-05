"use client";
import {useEffect,useMemo,useState} from "react";

type Item={id:string;slug:string;name?:string;title?:string;type?:string;tagline?:string|null;heroMedia?:{url:string|null}|null};
type Nearby={id:string;slug:string;name:string;distanceMeters:number;historicalImportance?:number};
const API=process.env.NEXT_PUBLIC_API_URL||"https://dauvietapi-production.up.railway.app";
const CURATED_MEDIA: Record<string,{url:string;source:string;license:string;credit:string}> = {
 "hoang-thanh-thang-long": {url:"https://upload.wikimedia.org/wikipedia/commons/b/b6/Imperial_Citadel_of_Thang_Long_%2826910835332%29.jpg",source:"Wikimedia Commons",license:"CC BY 2.0",credit:"Bex Walton"},
 "hoa-lu": {url:"https://upload.wikimedia.org/wikipedia/commons/thumb/9/96/Hoa_Lu_%282%29.jpg/1920px-Hoa_Lu_%282%29.jpg",source:"Wikimedia Commons",license:"CC BY-SA 3.0",credit:"Wikimedia Commons contributor"},
 "co-loa": {url:"https://upload.wikimedia.org/wikipedia/commons/2/23/Hoa_Lu_landscape.jpg",source:"Wikimedia Commons",license:"CC BY-SA",credit:"Wikimedia Commons contributor"},
 "co-do-hue": {url:"https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Hue_Vietnam_Citadel-of-Hu%E1%BA%BF-01.jpg/1920px-Hue_Vietnam_Citadel-of-Hu%E1%BA%BF-01.jpg",source:"Wikimedia Commons",license:"CC BY-SA 4.0",credit:"HCCB3947"},
 "hoi-an": {url:"https://upload.wikimedia.org/wikipedia/commons/0/06/Hoi_An_Ancient_Town.jpg",source:"Wikimedia Commons",license:"CC BY 4.0",credit:"Andre Hospers"},
 "my-son": {url:"https://upload.wikimedia.org/wikipedia/commons/4/42/My_Son_Sanctuary%2C_Vietnam%2C_2017_%2852415210322%29.jpg",source:"Wikimedia Commons",license:"CC BY-SA 2.0",credit:"JL Cogburn"},
 "dien-bien-phu": {url:"https://upload.wikimedia.org/wikipedia/commons/2/24/Dien_Bien_Phu002.jpg",source:"Wikimedia Commons",license:"Public domain",credit:"U.S. Army / public domain"},
 "dinh-doc-lap": {url:"https://upload.wikimedia.org/wikipedia/commons/1/1f/Independence_Palace_%289982437526%29.jpg",source:"Wikimedia Commons",license:"CC BY-SA",credit:"Wikimedia Commons contributor"},
 "gion": {url:"https://upload.wikimedia.org/wikipedia/commons/d/d1/Gion_Kyoto.jpg",source:"Wikimedia Commons",license:"CC BY-SA 4.0",credit:"Vldimir Pankratov"},
 "arashiyama": {url:"https://upload.wikimedia.org/wikipedia/commons/1/1e/Arashiyama%2C_Kyoto.jpg",source:"Wikimedia Commons",license:"CC BY-SA",credit:"Wikimedia Commons contributor"},
};
const MEDIA_BY_JOURNEY: Record<string,string> = {"dau-kinh-do-xua":"hoa-lu","di-san-mien-trung":"hoi-an","dau-an-khang-chien":"dien-bien-phu"};
const MEDIA_BY_STORY: Record<string,string> = {"vi-sao-thang-long-tro-thanh-kinh-do":"hoang-thanh-thang-long","hue-va-dau-an-kinh-do-trieu-nguyen":"co-do-hue","dien-bien-phu-trong-tien-trinh-nam-1954":"dien-bien-phu"};
const mediaKey=(x:any)=>{
 const slug=String(x?.slug??"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
 const name=String(x?.name??x?.title??"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
 const all=slug+" "+name;
 if(all.includes("thang-long")||all.includes("hoang-thanh")) return "hoang-thanh-thang-long";
 if(all.includes("pho-co-ha-noi")||all.includes("hanoi-old-quarter")||all.includes("old-quarter")) return "hoang-thanh-thang-long";
 if(all.includes("hoa-lu")||all.includes("ancient-capital")) return "hoa-lu";
 if(all.includes("co-loa")) return "co-loa";
 if(all.includes("hue")||all.includes("co-do")) return "co-do-hue";
 if(all.includes("hoi-an")) return "hoi-an";
 if(all.includes("my-son")) return "my-son";
 if(all.includes("dien-bien")||all.includes("kháng chien")||all.includes("resistance")) return "dien-bien-phu";
 if(all.includes("doc-lap")||all.includes("independence-palace")) return "dinh-doc-lap";
 if(all.includes("gion")||all.includes("gion-kyoto")) return "gion";
 if(all.includes("arashiyama")) return "arashiyama";
 return MEDIA_BY_JOURNEY[slug]||MEDIA_BY_STORY[slug]||null;
};
const curatedMedia=(x:any)=>{
 const key=mediaKey(x);
 return key?CURATED_MEDIA[key]??null:null;
};

const hrefFor=(x:Item)=>{const type=(x.type??"").toUpperCase();if(type==="JOURNEY")return "/journeys/"+x.slug;if(type==="STORY")return "/stories/"+x.slug;if(type==="DESTINATION")return "/destinations/"+x.slug;return "/places/"+x.slug;};
const img=(x:Item)=>{const apiUrl=typeof x?.heroMedia?.url==="string"&&x.heroMedia.url.trim()?x.heroMedia.url:null;return apiUrl||curatedMedia(x)?.url||null;};

export default function HomeV6(){
 const [destinations,setDestinations]=useState<Item[]>([]),[journeys,setJourneys]=useState<Item[]>([]),[stories,setStories]=useState<Item[]>([]),[mediaById,setMediaById]=useState<Record<string,{url:string|null}>>({});
 const [nearby,setNearby]=useState<Nearby[]>([]),[location,setLocation]=useState<"idle"|"loading"|"granted"|"denied">("idle");
 const [q,setQ]=useState(""),[results,setResults]=useState<Item[]>([]);
 const [plan,setPlan]=useState({destination:"",days:"2",travellers:"2",stay:"Khách sạn hoặc homestay"});
 useEffect(()=>{Promise.all([
   fetch(API+"/v1/destinations?page=1&pageSize=8").then(r=>r.json()).catch(()=>null),
   fetch(API+"/v1/journeys?limit=8").then(r=>r.json()).catch(()=>null),
   fetch(API+"/v1/stories?limit=8&featured=true").then(r=>r.json()).catch(()=>null)
 ]).then(async ([a,b,c])=>{
   const ds=(a?.data??a)?.items??[],js=(b?.data??b)?.items??[],ss=(c?.data??c)?.items??[];
   const detail=await Promise.all(ds.slice(0,8).map((x:Item)=>fetch(API+"/v1/destinations/"+encodeURIComponent(x.slug)).then(r=>r.json()).catch(()=>null)));
   const media=new Map(detail.map((x:any)=>x?.data??x).filter(Boolean).map((x:any)=>[x.slug,x.heroMedia]));
   setDestinations(ds.map((x:Item)=>({...x,heroMedia:media.get(x.slug)||null})));setJourneys(js);setStories(ss);
   const [journeyDetails,storyDetails]=await Promise.all([
     Promise.all(js.slice(0,6).map((x:Item)=>fetch(API+"/v1/journeys/"+encodeURIComponent(x.slug)).then(r=>r.json()).catch(()=>null))),
     Promise.all(ss.slice(0,6).map((x:Item)=>fetch(API+"/v1/stories/"+encodeURIComponent(x.slug)).then(r=>r.json()).catch(()=>null)))
   ]);
   const journeyMedia=new Map(journeyDetails.map((x:any)=>x?.data??x).filter(Boolean).map((x:any)=>[x.slug,x.heroMedia]));
   const storyMedia=new Map(storyDetails.map((x:any)=>x?.data??x).filter(Boolean).map((x:any)=>[x.slug,x.heroMedia]));
   setJourneys(js.map((x:Item)=>({...x,heroMedia:journeyMedia.get(x.slug)||null})));
   setStories(ss.map((x:Item)=>({...x,heroMedia:storyMedia.get(x.slug)||null})));
   const allHeroIds=[...detail.map((x:any)=>(x?.data??x)?.heroMedia?.id),...journeyDetails.map((x:any)=>(x?.data??x)?.heroMedia?.id),...storyDetails.map((x:any)=>(x?.data??x)?.heroMedia?.id)].filter(Boolean);
   const resolved=await Promise.all(allHeroIds.map(async(id:string)=>{const r=await fetch(API+"/v1/media/"+encodeURIComponent(id)).then(r=>r.json()).catch(()=>null);const v=r?.data??r;return v?.id?{id,url:v.url??null}:null;}));
   setMediaById(Object.fromEntries(resolved.filter(Boolean).map((x:any)=>[x.id,{url:x.url}])));
 });},[]);
 const mediaUrl=(x:any)=>x?.heroMedia?.url??(x?.heroMedia?.id?mediaById[x.heroMedia.id]?.url:null)??curatedMedia(x)?.url;
 const journeyFallbackKeys=["hoa-lu","hoi-an","dien-bien-phu","co-do-hue","my-son","dinh-doc-lap"];
 const journeyMediaUrl=(x:any,index:number)=>curatedMedia(x)?.url??CURATED_MEDIA[journeyFallbackKeys[index%journeyFallbackKeys.length]]?.url??mediaUrl(x);
 const context=useMemo(()=>location==="granted"&&nearby.length?nearby.map(x=>({id:x.id,slug:x.slug,name:x.name,type:"Gần bạn"})):destinations,[location,nearby,destinations,mediaById]);
 async function search(value:string){setQ(value);if(value.trim().length<2){setResults([]);return}try{const r=await fetch(API+"/v1/search?q="+encodeURIComponent(value)+"&limit=6");const p=await r.json();const d=p.data??p;setResults((d.results??d.items??[]).map((x:any)=>({id:x.id,slug:x.slug,name:x.name??x.title??x.slug,type:x.entityType??x.type})))}catch{}}
 function locate(){if(!navigator.geolocation){setLocation("denied");return}setLocation("loading");navigator.geolocation.getCurrentPosition(async p=>{try{const r=await fetch(API+"/v1/places/nearby?lat="+p.coords.latitude+"&lng="+p.coords.longitude+"&radius=25000&limit=8");const j=await r.json();setNearby(j.data??j);setLocation("granted")}catch{setLocation("denied")}},()=>setLocation("denied"),{maximumAge:300000,timeout:8000})}
 return <div className="home-v6">
  <section className="home-v6-hero" style={(destinations[0]&&(curatedMedia(destinations[0])?.url||img(destinations[0])))?{backgroundImage:"linear-gradient(90deg,rgba(4,24,20,.72),rgba(4,24,20,.18) 58%,rgba(4,24,20,.34)),url("+(curatedMedia(destinations[0])?.url||img(destinations[0]))+")"}:undefined}>
   <header className="home-v6-nav container"><a href="/" className="home-v6-logo"><img src="/brand/dvg-logo-horizontal-primary-light-v1.4.1.svg" alt="Dấu Việt"/></a><nav><a className="active" href="/explore">Khám phá</a><a href="/map">Bản đồ</a><a href="/stories">Câu chuyện</a><a href="/journeys">Hành trình</a><a href="/periods">Thời kỳ</a><a href="/people">Nhân vật</a><a href="/events">Sự kiện</a><a href="/themes">Chủ đề</a></nav><div className="home-v6-actions"><span>VN</span><a href="/auth/login">Đăng nhập</a></div></header>
   <div className="home-v6-hero-inner container"><div className="hero-media-credit">{destinations[0]&&curatedMedia(destinations[0])&&!destinations[0]?.heroMedia?.url?`Ảnh: ${curatedMedia(destinations[0])!.credit} · ${curatedMedia(destinations[0])!.license}`:""}</div><div className="home-v6-copy"><span className="kicker">DU LỊCH LỊCH SỬ</span><h1>Đi để khám phá.<br/><em>Ở lại để hiểu.</em></h1><p>Những vùng đất, con người và biến cố đã tạo nên Việt Nam và thế giới — qua những hành trình có thể chạm tới.</p>
    <div className="home-v6-search"><span>⌕</span><input value={q} onChange={e=>search(e.target.value)} placeholder="Bạn muốn đi đâu? Hà Nội, Huế, Hội An..." aria-label="Bạn muốn đi đâu?"/><button onClick={()=>search(q)}>Tìm</button>{results.length>0&&<div className="search-results">{results.map(x=><a key={x.id} href={hrefFor(x)}><strong>{x.name}</strong><small>{x.type??"Địa điểm"}</small></a>)}</div>}</div>
    <div className="home-v6-chips">{["Địa điểm","Hành trình","Nơi ở","Trải nghiệm","Câu chuyện","Nhân vật"].map(x=><a key={x} href={x==="Hành trình"?"/journeys":x==="Địa điểm"?"/explore":"/book"}>{x}</a>)}</div></div>
    <aside className="context-card"><div className="context-head"><div><span>{location==="granted"?"📍 GẦN BẠN":"KHÁM PHÁ THEO VÙNG"}</span><strong>{location==="granted"?"Những nơi quanh bạn":"Việt Nam · Đông Nam Á · Châu Á · Thế giới"}</strong></div><button onClick={locate}>{location==="loading"?"Đang tìm...":location==="granted"?"Đã cập nhật":"Dùng vị trí"}</button></div><div className="context-list">{context.slice(0,4).map((x:any)=><a key={x.id} href={hrefFor(x)}><span className="context-thumb">{img(x)?<img src={img(x)!} alt=""/>:<b>✦</b>}</span><span><strong>{x.name}</strong><small>{x.type??"Địa danh lịch sử"}</small></span><i>→</i></a>)}</div>{location==="denied"&&<p className="context-note">Không cần vị trí để khám phá. Bạn có thể chọn bất kỳ nơi nào trong ô tìm kiếm.</p>}</aside></div>
  <section className="planner hero-planner"><div className="container planner-grid"><div className="planner-main"><span className="kicker dark">LÊN KẾ HOẠCH</span><h2>Lên kế hoạch hành trình của bạn</h2><p>Chọn nơi đến, thời gian, nơi ở và trải nghiệm. Bắt đầu từ du lịch, rồi đi sâu vào câu chuyện của vùng đất.</p><div className="steps"><b>1 Chọn điểm đến</b><span>2 Thời gian</span><span>3 Nơi ở</span><span>4 Trải nghiệm</span></div><div className="planner-form"><label>Đi đâu?<input value={plan.destination} onChange={e=>setPlan({...plan,destination:e.target.value})} placeholder="Hà Nội, Huế, Hội An..."/></label><label>Thời gian<select value={plan.days} onChange={e=>setPlan({...plan,days:e.target.value})}><option value="1">1 ngày</option><option value="2">2–3 ngày</option><option value="4">4–7 ngày</option></select></label><label>Số người<select value={plan.travellers} onChange={e=>setPlan({...plan,travellers:e.target.value})}><option>1</option><option>2</option><option>4</option></select></label><label>Nơi ở<select value={plan.stay} onChange={e=>setPlan({...plan,stay:e.target.value})}><option>Khách sạn hoặc homestay</option><option>Resort</option><option>Gần di tích</option></select></label><a className="plan-button" href={"/trips?destination="+encodeURIComponent(plan.destination)}>Tạo hành trình →</a></div></div><div className="services"><h3>Dịch vụ du lịch</h3>{["Khách sạn & Homestay","Vé tham quan di tích","Tour lịch sử","Ẩm thực địa phương","Di chuyển","Trải nghiệm"].map(x=><a href="/book" key={x}>{x}<b>→</b></a>)}</div></div></section>
   <div className="home-v6-stats container"><span><b>2.500+</b>Địa danh</span><span><b>10.000+</b>Câu chuyện</span><span><b>500+</b>Hành trình</span><span><b>100+</b>Quốc gia & vùng đất</span><blockquote>Mỗi vùng đất đều có một câu chuyện.<br/>Mỗi hành trình là một cách hiểu hơn về thế giới.</blockquote></div>
  </section>

  {journeys.length>0&&<section className="home-v6-section"><div className="container"><div className="section-head"><div><span className="kicker dark">HÀNH TRÌNH</span><h2>Những hành trình đáng đi</h2><p>Du lịch trước, lịch sử theo cùng bạn trên từng điểm dừng.</p></div><a href="/journeys">Xem tất cả →</a></div><div className="journey-grid">{journeys.slice(0,6).map((x,i)=><a href={"/journeys/"+x.slug} className="journey-card" key={x.id}><div className="media" style={journeyMediaUrl(x,i)?{backgroundImage:"linear-gradient(180deg,transparent 28%,rgba(0,0,0,.72)),url("+journeyMediaUrl(x,i)+")"}:undefined}><span>HÀNH TRÌNH</span>{(!x.heroMedia?.url)&&<small className="media-credit">Ảnh: {(curatedMedia(x)??CURATED_MEDIA[journeyFallbackKeys[i%journeyFallbackKeys.length]])!.credit} · {(curatedMedia(x)??CURATED_MEDIA[journeyFallbackKeys[i%journeyFallbackKeys.length]])!.license}</small>}</div><small>{i%2?"MIỀN TRUNG":"VIỆT NAM"}</small><h3>{x.title}</h3><p>Địa danh · trải nghiệm · câu chuyện lịch sử</p><b>Xem hành trình →</b></a>)}</div></div></section>}
  <section className="home-v6-section"><div className="container split"><div><span className="kicker dark">ĐIỂM ĐẾN</span><h2>Điểm đến đáng đi</h2><p>Những nơi mà chuyến đi và câu chuyện lịch sử gặp nhau.</p><a className="text-link" href="/explore">Khám phá tất cả →</a></div><div className="destination-grid">{context.slice(0,6).map((x:any)=><a href={hrefFor(x)} key={x.id} className={mediaUrl(x)?"has-media":""} style={mediaUrl(x)?{backgroundImage:"linear-gradient(180deg,transparent 25%,rgba(7,34,28,.18) 30%,rgba(7,34,28,.92)),url("+mediaUrl(x)+")"}:undefined}><strong>{x.name}</strong><small>{x.type??"Di sản & văn hóa"}</small>{curatedMedia(x)&&!x.heroMedia?.url&&<span className="media-credit">Ảnh: {curatedMedia(x)!.credit} · {curatedMedia(x)!.license}</span>}</a>)}</div></div></section>
  <section className="home-v6-section experience"><div className="container split"><div><span className="kicker dark">TRẢI NGHIỆM</span><h2>Không chỉ đến nơi — hãy sống ở đó.</h2><p>Ẩm thực, làng nghề, tour di tích và văn hóa địa phương gắn với câu chuyện của vùng đất.</p></div><div className="experience-grid">{["Ẩm thực địa phương","Làng nghề truyền thống","Tour di tích lịch sử","Văn hóa & đời sống"].map(x=><a href="/book/activity" key={x}><strong>{x}</strong><span>Khám phá trải nghiệm →</span></a>)}</div></div></section>
  <section className="history"><div className="container history-grid"><div><span className="kicker">HISTORY SIGNATURE</span><h2>Một nơi,<br/><em>nhiều lớp thời gian.</em></h2><p>Điểm đến chỉ là nơi bắt đầu. Dấu Việt cho bạn thấy những gì đã xảy ra ở đó, ai để lại dấu ấn và vì sao nơi ấy vẫn quan trọng hôm nay.</p><a className="gold-button" href="/stories">Đi vào câu chuyện →</a></div><div className="timeline"><span>Xa xưa</span><div><i/><i/><i/><i/><i/></div><span>Ngày nay</span><p>Then → Now · sự kiện · nhân vật · văn hóa · nguồn tư liệu</p></div></div></section>
  <section className="home-v6-section"><div className="container"><div className="section-head"><div><span className="kicker dark">CÂU CHUYỆN SAU NƠI BẠN ĐẾN</span><h2>Hiểu nơi mình đang đi</h2></div><a href="/stories">Xem tất cả →</a></div><div className="story-grid">{stories.slice(0,5).map(x=><a href={"/stories/"+x.slug} key={x.id} className="story-card" style={mediaUrl(x)?{backgroundImage:"linear-gradient(180deg,transparent 25%,rgba(8,28,23,.9)),url("+mediaUrl(x)+")"}:undefined}><small>{x.type??"CÂU CHUYỆN"}</small><h3>{x.title}</h3><p>Con người, sự kiện, văn hóa và những biến cố đã làm thay đổi vùng đất.</p></a>)}</div></div></section>
  <section className="cta"><div className="container"><span className="kicker">DẤU VIỆT</span><h2>Đi để thấy.<br/><em>Ở lại để hiểu.</em></h2><a className="gold-button" href="/explore">Bắt đầu khám phá →</a><a className="outline-button" href="/journeys">Chọn một hành trình</a></div></section>
 </div>
}
