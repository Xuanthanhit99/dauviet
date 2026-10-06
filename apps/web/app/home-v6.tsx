"use client";

import { useEffect, useMemo, useState } from "react";

type Media = { id: string; url: string | null; type?: string; isHistorical?: boolean; isAiGenerated?: boolean };
type Item = {
  id: string;
  slug: string;
  name?: string;
  title?: string;
  type?: string;
  summary?: string | null;
  tagline?: string | null;
  translation?: { name?: string; title?: string; summary?: string | null; tagline?: string | null; whyVisit?: string | null };
  heroMedia?: Media | null;
  durationMinutes?: number | null;
  difficulty?: string | null;
  featured?: boolean;
  priority?: number;
};
type Nearby = Item & { distanceMeters?: number };
type TimelineItem = { kind: "EVENT" | "ERA"; id: string; slug: string; title: string; date?: { label?: string | null; year?: number | null; era?: string | null } | null };
type MapFeature = { id?: string; kind?: string; slug?: string; title?: string; name?: string };

const API = process.env.NEXT_PUBLIC_API_URL || "https://dauvietapi-production.up.railway.app";

async function getJson(path: string) {
  const response = await fetch(API + path, { headers: { Accept: "application/json" }, cache: "no-store" });
  if (!response.ok) throw new Error("API " + response.status);
  const payload = await response.json();
  return payload?.data ?? payload;
}

function listOf<T>(payload: any): T[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

function textOf(item: Item, field: "name" | "title" | "summary" | "tagline") {
  return item[field] ?? item.translation?.[field] ?? "";
}

function hrefFor(item: { slug?: string; type?: string }) {
  const type = String(item.type ?? "").toUpperCase();
  if (type === "JOURNEY") return "/journeys/" + item.slug;
  if (type === "STORY") return "/stories/" + item.slug;
  if (type === "DESTINATION") return "/destinations/" + item.slug;
  return "/places/" + item.slug;
}

function mediaUrl(item?: Item | null) {
  return item?.heroMedia?.url || null;
}

function dateLabel(date?: TimelineItem["date"]) {
  if (!date) return "";
  if (date.label) return date.label;
  if (date.year) return date.era === "BCE" ? date.year + " TCN" : String(date.year);
  return "";
}

export default function HomeV6() {
  const [destinations, setDestinations] = useState<Item[]>([]);
  const [journeys, setJourneys] = useState<Item[]>([]);
  const [stories, setStories] = useState<Item[]>([]);
  const [places, setPlaces] = useState<Item[]>([]);
  const [accommodations, setAccommodations] = useState<Item[]>([]);
  const [activities, setActivities] = useState<Item[]>([]);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [mapFeatures, setMapFeatures] = useState<MapFeature[]>([]);
  const [editorial, setEditorial] = useState<Record<string, Item[]>>({});
  const [mediaById, setMediaById] = useState<Record<string, Media>>({});
  const [location, setLocation] = useState<"idle" | "loading" | "granted" | "denied">("idle");
  const [nearby, setNearby] = useState<Nearby[]>([]);
  const [selectedDestination, setSelectedDestination] = useState("");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState({ destination: "", days: "2", travellers: "2", stay: "Khách sạn hoặc homestay" });

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const responses = await Promise.allSettled([
          getJson("/v1/destinations?page=1&pageSize=8"),
          getJson("/v1/journeys?limit=8"),
          getJson("/v1/stories?limit=8&featured=true"),
          getJson("/v1/places?limit=8"),
          getJson("/v1/accommodations?page=1&pageSize=6"),
          getJson("/v1/activities?page=1&pageSize=6"),
          getJson("/v1/timeline?limit=8&minImportance=7"),
          getJson("/v1/map/features?zoom=4&kinds=PLACE,EVENT,DESTINATION&locale=vi"),
          getJson("/v1/editorial/home")
        ]);
        if (!active) return;

        const valueAt = <T,>(index: number, fallback: T): T => {
          const result = responses[index];
          return result.status === "fulfilled" ? result.value : fallback;
        };

        const ds = listOf<Item>(valueAt(0, []));
        const js = listOf<Item>(valueAt(1, []));
        const ss = listOf<Item>(valueAt(2, []));
        const ps = listOf<Item>(valueAt(3, []));
        const acc = listOf<Item>(valueAt(4, []));
        const acts = listOf<Item>(valueAt(5, []));
        const tl = listOf<TimelineItem>(valueAt(6, []));
        const mf = listOf<MapFeature>(valueAt(7, []));
        const e = valueAt<Record<string, Item[]>>(8, {});

        setDestinations(ds);
        setJourneys(js);
        setStories(ss);
        setPlaces(ps);
        setAccommodations(acc);
        setActivities(acts);
        setTimeline(tl);
        setMapFeatures(mf);
        setEditorial(e && typeof e === "object" ? e : {});

        const detailTargets = [...ds, ...js, ...ss].slice(0, 18);
        const details = await Promise.all(detailTargets.map(async (item) => {
          try {
            const prefix = String(item.type ?? "").toUpperCase() === "JOURNEY" ? "/v1/journeys/" : String(item.type ?? "").toUpperCase() === "STORY" ? "/v1/stories/" : "/v1/destinations/";
            return await getJson(prefix + encodeURIComponent(item.slug));
          } catch { return null; }
        }));

        const normalized = details.filter(Boolean) as Item[];
        const mediaIds = normalized.map((x) => x.heroMedia?.id).filter(Boolean) as string[];
        if (mediaIds.length) {
          const media = await Promise.all([...new Set(mediaIds)].map(async (id) => {
            try { return await getJson("/v1/media/" + encodeURIComponent(id)); } catch { return null; }
          }));
          const map: Record<string, Media> = {};
          media.filter(Boolean).forEach((x: Media) => { map[x.id] = x; });
          if (active) setMediaById(map);
        }

        const withResolvedMedia = (items: Item[]) => items.map((item) => {
          const detail = normalized.find((x) => x.id === item.id || x.slug === item.slug);
          return detail?.heroMedia ? { ...item, heroMedia: detail.heroMedia } : item;
        });

        if (active) {
          setDestinations(withResolvedMedia(ds));
          setJourneys(withResolvedMedia(js));
          setStories(withResolvedMedia(ss));
          setLoading(false);
        }
      } catch {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const hydrated = (item?: any) =>
    item?.heroMedia?.url ? item : item?.heroMedia?.id && mediaById[item.heroMedia.id] ? { ...item, heroMedia: mediaById[item.heroMedia.id] } : item;

  const editorialJourneys = useMemo(() => listOf<Item>(editorial.HOME_JOURNEY), [editorial]);
  const editorialStories = useMemo(() => listOf<Item>(editorial.HOME_FEATURED_STORY), [editorial]);

  const featuredJourneys = useMemo(() => {
    const editorialSlugs = new Set(editorialJourneys.map((x) => x.slug));
    return [...editorialJourneys, ...journeys.filter((x) => !editorialSlugs.has(x.slug))].slice(0, 5).map(hydrated);
  }, [editorialJourneys, journeys, mediaById]);

  const featuredStories = useMemo(() => {
    const editorialSlugs = new Set(editorialStories.map((x) => x.slug));
    return [...editorialStories, ...stories.filter((x) => !editorialSlugs.has(x.slug))].slice(0, 4).map(hydrated);
  }, [editorialStories, stories, mediaById]);

  const hero = useMemo(() => {
    const selected = destinations.find((x) => x.slug === selectedDestination);
    return hydrated(selected ?? destinations.find((x) => mediaUrl(hydrated(x))) ?? destinations[0]);
  }, [destinations, selectedDestination, mediaById]);

  const context = location === "granted" && nearby.length ? nearby.slice(0, 3) : places.slice(0, 3);

  async function search(value: string) {
    setQ(value);
    if (value.trim().length < 2) { setResults([]); return; }
    try {
      const data = await getJson("/v1/search?q=" + encodeURIComponent(value.trim()) + "&limit=6");
      setResults(listOf<Item>(data));
    } catch { setResults([]); }
  }

  function locate() {
    if (!navigator.geolocation) { setLocation("denied"); return; }
    setLocation("loading");
    navigator.geolocation.getCurrentPosition(async (position) => {
      try {
        const data = await getJson("/v1/places/nearby?lat=" + position.coords.latitude + "&lng=" + position.coords.longitude + "&radius=25000&limit=8");
        setNearby(listOf<Nearby>(data));
        setLocation("granted");
      } catch { setLocation("denied"); }
    }, () => setLocation("denied"), { maximumAge: 300000, timeout: 8000 });
  }

  const heroStyle = mediaUrl(hero) ? {
    backgroundImage: "linear-gradient(90deg,rgba(4,24,20,.72),rgba(4,24,20,.16) 62%,rgba(4,24,20,.34)),url(" + mediaUrl(hero) + ")"
  } : undefined;

  const timelinePhoto = hydrated(places.find((x) => mediaUrl(hydrated(x))) ?? places[0]);
  const mapNames = mapFeatures.slice(0, 5).map((x) => x.title ?? x.name ?? x.slug).filter(Boolean) as string[];

  return (
    <div className="home-v6">
      <section className="home-v6-hero" style={heroStyle}>
        <header className="home-v6-nav container">
          <a href="/" className="home-v6-logo"><img src="/brand/dvg-logo-horizontal-primary-light-v1.4.1.svg" alt="Dấu Việt" /></a>
          <nav><a className="active" href="/explore">Khám phá</a><a href="/map">Bản đồ</a><a href="/stories">Câu chuyện</a><a href="/journeys">Hành trình</a><a href="/periods">Thời kỳ</a><a href="/people">Nhân vật</a><a href="/events">Sự kiện</a><a href="/themes">Chủ đề</a></nav>
          <div className="home-v6-actions"><span>VN</span><a href="/auth/login">Đăng nhập</a></div>
        </header>

        <div className="home-v6-hero-inner container">
          <div className="hero-media-credit">{hero?.heroMedia?.isHistorical ? "Tư liệu lịch sử · " : ""}{hero?.heroMedia?.isAiGenerated ? "AI · " : ""}{hero?.heroMedia?.type ?? ""}</div>
          <div className="home-v6-copy">
            <span className="kicker">DU LỊCH LỊCH SỬ</span><h1>Đi để khám phá.<br /><em>Ở lại để hiểu.</em></h1>
            <p>Những vùng đất, con người và biến cố đã tạo nên Việt Nam và thế giới — qua những hành trình có thể chạm tới.</p>
            <div className="home-v6-search"><span>⌕</span><input value={q} onChange={(e) => search(e.target.value)} placeholder="Bạn muốn đi đâu? Hà Nội, Huế, Hội An..." aria-label="Bạn muốn đi đâu?" /><button onClick={() => search(q)}>Tìm</button>
              {results.length > 0 && <div className="search-results">{results.map((item) => <a key={item.id} href={hrefFor(item)}><strong>{textOf(item, "name") || textOf(item, "title") || item.slug}</strong><small>{item.type ?? "Địa điểm"}</small></a>)}</div>}
            </div>
            <div className="home-v6-chips">{["Địa điểm","Hành trình","Nơi ở","Trải nghiệm","Câu chuyện","Nhân vật"].map((label) => <a key={label} href={label === "Hành trình" ? "/journeys" : label === "Địa điểm" ? "/explore" : label === "Câu chuyện" ? "/stories" : "/book"}>{label}</a>)}</div>
          </div>

          <aside className="context-card">
            <div className="context-head"><div><span>{location === "granted" ? "📍 GẦN BẠN" : "KHÁM PHÁ THEO VÙNG"}</span><strong>{location === "granted" ? "Những nơi quanh bạn" : "Những nơi đang có dữ liệu"}</strong></div><button onClick={locate}>{location === "loading" ? "Đang tìm..." : location === "granted" ? "Đã cập nhật" : "Dùng vị trí"}</button></div>
            <div className="context-list">{context.map((item) => <a key={item.id} href={hrefFor(item)}><span className="context-thumb">{mediaUrl(hydrated(item)) ? <img src={mediaUrl(hydrated(item))!} alt="" /> : <b>✦</b>}</span><span><strong>{textOf(item, "name") || textOf(item, "title")}</strong><small>{item.type ?? "Địa danh"}</small></span><i>→</i></a>)}</div>
            {location === "denied" && <p className="context-note">Không cần vị trí để khám phá. Bạn có thể chọn bất kỳ nơi nào trong ô tìm kiếm.</p>}
          </aside>
        </div>
      </section>

      <div className="home-v6-stats container">
        <span><b>{destinations.length ? destinations.length + "+" : "—"}</b>Điểm đến đã tải</span>
        <span><b>{journeys.length || "—"}</b>Hành trình hiện có</span>
        <span><b>{stories.length || "—"}</b>Câu chuyện hiện có</span>
        <blockquote>Dữ liệu hiển thị được lấy từ hệ thống nội dung đã xuất bản của Dấu Việt.</blockquote>
      </div>

      <section className="home-v6-section featured-journeys"><div className="container">
        <div className="section-head"><div><span className="kicker dark">HÀNH TRÌNH NỔI BẬT</span><h2>Hành trình nổi bật</h2><p>Những hành trình kết hợp giữa du lịch và khám phá lịch sử.</p></div><a href="/journeys">Xem tất cả →</a></div>
        <div className="journey-filters"><b>Tất cả</b><span>1 ngày</span><span>2–3 ngày</span><span>4–7 ngày</span><span>Theo vùng</span><span>Theo chủ đề</span></div>
        <div className="journey-grid">{featuredJourneys.map((item) => <a href={hrefFor({ ...item, type: "JOURNEY" })} className="journey-card" key={item.id}>
          <div className="media" style={mediaUrl(item) ? { backgroundImage: "linear-gradient(180deg,transparent 20%,rgba(0,0,0,.46)),url(" + mediaUrl(item) + ")" } : undefined}><span>{item.featured ? "NỔI BẬT" : "HÀNH TRÌNH"}</span></div>
          <small>HÀNH TRÌNH</small><h3>{textOf(item, "title") || textOf(item, "name") || item.slug}</h3><p>{textOf(item, "summary") || ""}</p>
          <div className="journey-meta">{item.durationMinutes ? <span>◷ {Math.ceil(item.durationMinutes / 1440)} ngày</span> : <span>◷ Chưa có thời lượng</span>}{item.difficulty ? <span>{item.difficulty}</span> : null}</div>
        </a>)}</div>
      </div></section>

      <section className="planner hero-planner"><div className="container planner-grid">
        <div className="planner-main"><span className="kicker dark">LÊN KẾ HOẠCH</span><h2>Lên kế hoạch hành trình của bạn</h2><p>Chọn nơi đến, thời gian, nơi ở và trải nghiệm. Bắt đầu từ du lịch, rồi đi sâu vào câu chuyện của vùng đất.</p>
          <div className="steps"><b>1 Chọn điểm đến</b><span>2 Thời gian</span><span>3 Nơi ở</span><span>4 Trải nghiệm</span></div>
          <div className="planner-form">
            <label>Đi đâu?<input list="home-destinations" value={plan.destination} onChange={(e) => { const value=e.target.value; setPlan({ ...plan, destination: value }); const match=destinations.find((d)=>textOf(d,"name")===value || d.slug===value); if(match) setSelectedDestination(match.slug); }} placeholder="Chọn điểm đến..." /></label>
            <label>Thời gian<select value={plan.days} onChange={(e) => setPlan({ ...plan, days: e.target.value })}><option value="1">1 ngày</option><option value="2">2–3 ngày</option><option value="4">4–7 ngày</option></select></label>
            <label>Số người<select value={plan.travellers} onChange={(e) => setPlan({ ...plan, travellers: e.target.value })}><option>1</option><option>2</option><option>4</option></select></label>
            <label>Nơi ở<select value={plan.stay} onChange={(e) => setPlan({ ...plan, stay: e.target.value })}><option>Khách sạn hoặc homestay</option><option>Resort</option><option>Gần di tích</option></select></label>
            <a className="plan-button" href={"/trips?destination=" + encodeURIComponent(plan.destination)}>Tạo hành trình →</a>
          </div>
          <datalist id="home-destinations">{destinations.map((item) => <option key={item.id} value={textOf(item, "name") || item.slug} />)}</datalist>
        </div>
        <div className="services"><h3>Dịch vụ du lịch</h3><a href="/book">Khách sạn & Homestay <b>→</b></a><a href="/book">Vé tham quan di tích <b>→</b></a><a href="/book">Tour lịch sử <b>→</b></a><a href="/book">Ẩm thực địa phương <b>→</b></a><a href="/book">Di chuyển <b>→</b></a><a href="/book">Trải nghiệm <b>→</b></a></div>
      </div></section>

      <section className="home-v6-section destinations-section"><div className="container">
        <div className="section-head"><div><span className="kicker dark">ĐIỂM ĐẾN</span><h2>Điểm đến đang được quan tâm</h2><p>Những vùng đất giàu giá trị lịch sử và trải nghiệm hấp dẫn.</p></div><a href="/explore">Xem tất cả →</a></div>
        <div className="destination-strip">{destinations.map((item) => <a key={item.id} href={hrefFor({ ...item, type: "DESTINATION" })} style={mediaUrl(hydrated(item)) ? { backgroundImage: "linear-gradient(180deg,transparent 20%,rgba(5,33,27,.72)),url(" + mediaUrl(hydrated(item)) + ")" } : undefined}><strong>{textOf(item, "name") || item.slug}</strong><small>{textOf(item, "tagline") || textOf(item, "summary") || "Điểm đến"}</small></a>)}</div>
      </div></section>

      <section className="home-v6-section stay-experience"><div className="container dual-discovery">
        <div><div className="section-head"><div><span className="kicker dark">NƠI Ở GỢI Ý</span><h2>Nơi ở gợi ý</h2><p>Dữ liệu lưu trú đang có trong hệ thống.</p></div><a href="/book">Xem tất cả →</a></div>
          <div className="mini-cards">{accommodations.slice(0,3).map((item) => <a href="/book" key={item.id}><strong>{textOf(item, "name") || item.slug}</strong><small>{textOf(item, "summary") || "Thông tin lưu trú"}</small></a>)}</div>
        </div>
        <div><div className="section-head"><div><span className="kicker dark">TRẢI NGHIỆM</span><h2>Trải nghiệm tại điểm đến</h2><p>Hoạt động đang có trong hệ thống.</p></div><a href="/book/activity">Xem tất cả →</a></div>
          <div className="mini-cards experience-mini">{activities.slice(0,3).map((item) => <a href="/book/activity" key={item.id}><strong>{textOf(item, "name") || item.slug}</strong><small>{textOf(item, "summary") || "Trải nghiệm"}</small></a>)}</div>
        </div>
      </div></section>

      <section className="history"><div className="container history-grid">
        <div><span className="kicker">DẤU ẤN LỊCH SỬ</span><h2>Một nơi,<br /><em>nhiều lớp thời gian.</em></h2><p>Những sự kiện và thời kỳ đã được xuất bản, để nhìn một vùng đất từ quá khứ đến hiện tại.</p><a className="gold-button" href="/stories">Khám phá dòng thời gian →</a></div>
        <div className="timeline-photo" style={mediaUrl(timelinePhoto) ? { backgroundImage: "linear-gradient(90deg,rgba(5,24,20,.58),rgba(5,24,20,.08)),url(" + mediaUrl(timelinePhoto) + ")" } : undefined}><div className="timeline-track">{timeline.slice(0,5).map((item) => <span key={item.id}>{dateLabel(item.date)}<br /><b>{item.title}</b></span>)}</div></div>
      </div></section>

      <section className="home-v6-section stories-section"><div className="container">
        <div className="section-head"><div><span className="kicker dark">CÂU CHUYỆN PHÍA SAU NƠI BẠN ĐẾN</span><h2>Câu chuyện phía sau nơi bạn đến</h2><p>Con người, sự kiện và những biến cố đã làm thay đổi vùng đất.</p></div><a href="/stories">Xem tất cả →</a></div>
        <div className="story-grid master-story-grid">{featuredStories.map((item) => <a href={hrefFor({ ...item, type: "STORY" })} key={item.id} className="story-card" style={mediaUrl(item) ? { backgroundImage: "linear-gradient(180deg,transparent 25%,rgba(8,28,23,.9)),url(" + mediaUrl(item) + ")" } : undefined}><small>CÂU CHUYỆN</small><h3>{textOf(item, "title") || item.slug}</h3><p>{textOf(item, "summary") || "Nội dung đã xuất bản."}</p></a>)}</div>
      </div></section>

      <section className="map-discovery-section"><div className="container map-discovery">
        <div className="map-copy"><span className="kicker dark">KHÁM PHÁ TRÊN BẢN ĐỒ</span><h2>Không chỉ là một chuyến đi.</h2><p>Dấu Việt nối địa điểm, sự kiện và điểm đến trên cùng một lớp khám phá.</p><a className="gold-button" href="/map">Mở bản đồ →</a></div>
        <div className="map-orbit">{mapNames.map((name) => <span key={name}>{name}</span>)}</div>
      </div></section>

      <section className="cta"><div className="container"><span className="kicker">DẤU VIỆT</span><h2>Đi để khám phá.<br /><em>Ở lại để hiểu.</em></h2><a className="gold-button" href="/explore">Bắt đầu khám phá →</a><a className="outline-button" href="/journeys">Chọn một hành trình</a></div></section>

      {loading && <div aria-live="polite" className="home-v6-loading">Đang tải dữ liệu Dấu Việt…</div>}
    </div>
  );
}
