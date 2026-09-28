"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const RegionMap = dynamic(() => import("./region-map"), { ssr: false });
const API = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, "");
type Locale = "vi" | "en";
type Region = {
  id: string; slug: string; type: string; code?: string | null;
  country: { id: string; slug: string; iso2: string };
  parentRegion?: { id: string; slug: string } | null;
  location?: { latitude: number; longitude: number | null } | null;
  translation?: { name?: string; summary?: string | null; description?: string | null } | null;
  meta: { requestedLocale: string; resolvedLocale: string | null; fallbackApplied: boolean };
};
type Entity = { id: string; slug: string; name?: string; type?: string; tagline?: string | null; timezone?: string | null };
type PageList = { items: Entity[]; page: number; pageSize: number; total: number; totalPages: number };
class ApiError extends Error { constructor(public status: number) { super(String(status)); } }
async function read<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(`${API}${path}`, { signal, credentials: "include" });
  if (!response.ok) throw new ApiError(response.status);
  const payload = await response.json();
  return payload.data ?? payload;
}
const copy = {
  vi: {
    world: "Thế giới", region: "Vùng", loading: "Đang mở hồ sơ vùng…", missing: "Không tìm thấy vùng", error: "Chưa thể mở hồ sơ vùng",
    errorBody: "Hồ sơ hiện chưa khả dụng. Bạn có thể thử lại hoặc tiếp tục khám phá.", retry: "Thử lại", map: "Khám phá bản đồ",
    understand: "Hiểu về vùng", geography: "Vị trí trong không gian", destinations: "Khám phá điểm đến", cities: "Thành phố trong vùng", children: "Các vùng trực thuộc",
    intro: "Đọc về nơi chốn", discovery: "Chọn nơi để đi tiếp", context: "Bối cảnh địa lý", notes: "Thông tin & nguồn", continue: "Tiếp tục khám phá",
    noSummary: "Vùng này chưa có tóm tắt được công bố.", noDescription: "Nội dung giới thiệu chi tiết chưa được công bố.",
    noMedia: "Chưa có hình ảnh tư liệu của vùng.", fallback: "Ngôn ngữ dự phòng", requested: "Ngôn ngữ yêu cầu", unknown: "Chưa cung cấp",
    country: "Quốc gia", parent: "Vùng cha", code: "Mã vùng", type: "Phân loại", representative: "Điểm đại diện",
    pointNote: "Vị trí này là điểm tham chiếu của vùng, không thể hiện ranh giới hành chính.", noPoint: "Chưa có tọa độ đại diện hợp lệ cho vùng này.",
    destinationsNote: "Từ vùng đến từng điểm đến: mở một hồ sơ để khám phá nội dung đã công bố.", citiesNote: "Các thành phố cung cấp bối cảnh địa lý; mỗi thành phố không mặc nhiên là một điểm đến.",
    empty: "Chưa có nội dung được công bố trong danh sách này.", listError: "Chưa tải được danh sách. Vui lòng thử lại.", more: "Xem thêm", shown: "Đang hiển thị", of: "trên",
    listLocale: "Tên trong danh sách được hiển thị theo bản dịch hiện có; ngôn ngữ từng mục chưa được cung cấp.",
    trust: "Hồ sơ còn đang được bổ sung", trustBody: "Chưa có nguồn trích dẫn hoặc đánh giá mức độ chắc chắn cho hồ sơ vùng này.",
    relations: "Địa điểm, câu chuyện, hành trình, con người, sự kiện và văn hóa chưa có liên kết trực tiếp trong hồ sơ. Bạn có thể tiếp tục từ các điểm đến đã công bố.",
    back: "Trở về quốc gia", home: "Trang chủ", locale: "Ngôn ngữ giao diện",
  },
  en: {
    world: "World", region: "Region", loading: "Opening region profile…", missing: "Region not found", error: "Region profile unavailable",
    errorBody: "This profile is currently unavailable. Try again or continue exploring.", retry: "Try again", map: "Explore the map",
    understand: "Understand the region", geography: "Geographic context", destinations: "Explore destinations", cities: "Cities in the region", children: "Subregions",
    intro: "Read about this place", discovery: "Choose where to go next", context: "Geographic context", notes: "Information & sources", continue: "Continue exploring",
    noSummary: "No published summary is available for this region.", noDescription: "A detailed introduction has not been published.",
    noMedia: "Documentary imagery for this region is not available.", fallback: "Fallback language", requested: "Requested language", unknown: "Not supplied",
    country: "Country", parent: "Parent region", code: "Region code", type: "Classification", representative: "Representative point",
    pointNote: "This point provides regional context. It does not represent an administrative boundary.", noPoint: "No valid representative coordinates are available for this region.",
    destinationsNote: "Continue from this region into a destination and explore its published profile.", citiesNote: "Cities provide geographic context. A city is not automatically a destination.",
    empty: "No published entries are available in this list.", listError: "The list could not be loaded. Please try again.", more: "Show more", shown: "Showing", of: "of",
    listLocale: "List names use available translations; individual language metadata is not supplied.",
    trust: "A profile still taking shape", trustBody: "Citations and confidence assessments are not available for this region profile.",
    relations: "Places, stories, journeys, people, events and culture are not directly linked in this profile. Continue through the published destinations to explore further.",
    back: "Return to country", home: "Home", locale: "Interface language",
  },
};

export default function RegionDetail({ slug, locale }: { slug: string; locale: Locale }) {
  const t = copy[locale];
  const [region, setRegion] = useState<Region | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error" | "missing">("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState("loading"); setRegion(null);
    read<Region>(`/v1/regions/${encodeURIComponent(slug)}?locale=${locale}`, controller.signal)
      .then(value => { if (!controller.signal.aborted) { setRegion(value); setState("ready"); } })
      .catch(error => { if (!controller.signal.aborted) setState(error instanceof ApiError && error.status === 404 ? "missing" : "error"); });
    return () => controller.abort();
  }, [slug, locale, attempt]);

  if (state === "loading") return <main id="main" className="region-page region-state" lang={locale} aria-busy="true"><p role="status">{t.loading}</p></main>;
  if (!region) return <main id="main" className="region-page region-state" lang={locale}><p className="region-kicker">{t.region}</p><h1>{state === "missing" ? t.missing : t.error}</h1><p role="alert">{t.errorBody}</p><button onClick={() => setAttempt(n => n + 1)}>{t.retry}</button><a href="/map">{t.map}</a></main>;

  const title = region.translation?.name || region.slug;
  const language = region.meta.resolvedLocale ?? undefined;
  const point = region.location;
  const validPoint = point && Number.isFinite(point.latitude) && typeof point.longitude === "number" && Number.isFinite(point.longitude) && Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180;
  const countryHref = region.country.slug ? `/countries/${encodeURIComponent(region.country.slug)}` : null;

  return <div className="region-page" lang={locale}>
    <div className="region-topbar region-wrap"><a href="/" aria-label={`Dấu Việt Global — ${t.home}`}><img src="/brand/dvg-logo-horizontal-primary-light-v1.4.1.svg" width="230" height="48" alt="Dấu Việt Global" /></a><nav aria-label={t.locale}><a href={`?locale=vi`} lang="vi" aria-current={locale === "vi" ? "page" : undefined}>VI</a><a href={`?locale=en`} lang="en" aria-current={locale === "en" ? "page" : undefined}>EN</a></nav></div>
    <main id="main">
      <header className="region-hero"><div className="region-wrap">
        <nav className="region-breadcrumb" aria-label={locale === "vi" ? "Đường dẫn" : "Breadcrumb"}><a href="/map">{t.world}</a><span aria-hidden="true">/</span>{countryHref ? <a href={countryHref}>{region.country.iso2}</a> : <span>{region.country.iso2}</span>}<span aria-hidden="true">/</span><span aria-current="page" lang={language}>{title}</span></nav>
        <div className="region-hero-grid"><div><p className="region-kicker">{t.region} · {region.country.iso2}</p><h1 lang={language}>{title}</h1><p className="region-deck" lang={region.translation?.summary ? language : locale}>{region.translation?.summary || t.noSummary}</p>
          {region.meta.fallbackApplied && <p className="region-fallback">{t.fallback}: <span lang="en">{region.meta.resolvedLocale ?? t.unknown}</span> · {t.requested}: {region.meta.requestedLocale}</p>}
          <a className="region-hero-link" href="#region-destinations">{t.destinations} <span aria-hidden="true">↗</span></a>
        </div><aside className="region-identity" aria-label={t.context}><dl><div><dt>{t.country}</dt><dd>{region.country.iso2}</dd></div>{region.code && <div><dt>{t.code}</dt><dd>{region.code}</dd></div>}<div><dt>{t.type}</dt><dd>{region.type}</dd></div>{region.parentRegion && <div><dt>{t.parent}</dt><dd><a href={`/regions/${encodeURIComponent(region.parentRegion.slug)}?locale=${locale}`}>{region.parentRegion.slug}</a></dd></div>}</dl><p>{t.noMedia}</p></aside></div>
      </div></header>
      <nav className="region-jump region-wrap" aria-label={locale === "vi" ? "Trong vùng" : "In this region"}><a href="#region-understand">{t.understand}</a><a href="#region-spatial">{t.geography}</a><a href="#region-destinations">{t.destinations}</a><a href="#region-context">{t.context}</a></nav>
      <section id="region-understand" className="region-wrap region-section region-split" aria-labelledby="region-understand-title"><div><p className="region-kicker">{t.intro}</p><h2 id="region-understand-title">{t.understand}</h2></div><div className="region-prose" lang={region.translation?.description ? language : locale}>{region.translation?.description ? region.translation.description.split(/\n\s*\n/).map((p, i) => <p key={i}>{p}</p>) : <p>{t.noDescription}</p>}</div></section>
      <section id="region-spatial" className="region-spatial" aria-labelledby="region-spatial-title"><div className="region-wrap region-section region-split"><div><p className="region-kicker">{t.context}</p><h2 id="region-spatial-title">{t.geography}</h2><p>{t.pointNote}</p></div><div>{validPoint ? <><div className="region-point"><strong>{t.representative}</strong><span lang={language}>{title}</span><span>{point.latitude.toFixed(4)}, {point.longitude!.toFixed(4)}</span></div><RegionMap latitude={point.latitude} longitude={point.longitude!} locale={locale} /></> : <p className="region-empty">{t.noPoint}</p>}</div></div></section>
      <section id="region-destinations" className="region-wrap region-section region-split" aria-labelledby="region-destinations-title"><div><p className="region-kicker">{t.discovery}</p><h2 id="region-destinations-title">{t.destinations}</h2><p>{t.destinationsNote}</p></div><Collection key={`destinations-${region.slug}-${locale}`} endpoint="destinations" filter="region" slug={region.slug} locale={locale} /></section>
      <section id="region-context" className="region-context"><div className="region-wrap region-section region-context-grid"><section aria-labelledby="region-cities-title"><p className="region-kicker">{t.context}</p><h2 id="region-cities-title">{t.cities}</h2><p>{t.citiesNote}</p><Collection key={`cities-${region.slug}-${locale}`} endpoint="cities" filter="region" slug={region.slug} locale={locale} /></section><section aria-labelledby="region-children-title"><p className="region-kicker">{t.region}</p><h2 id="region-children-title">{t.children}</h2><Collection key={`regions-${region.slug}-${locale}`} endpoint="regions" filter="parentRegion" slug={region.slug} locale={locale} /></section></div></section>
      <section className="region-wrap region-section region-split" aria-labelledby="region-trust-title"><div><p className="region-kicker">{t.notes}</p><h2 id="region-trust-title">{t.trust}</h2></div><div><p>{t.trustBody}</p><p>{t.relations}</p><p className="region-small">{t.listLocale}</p></div></section>
      <footer className="region-end"><div className="region-wrap"><p className="region-kicker">{t.continue}</p>{countryHref && <a href={countryHref}>{t.back} · {region.country.iso2} <span aria-hidden="true">↗</span></a>}<a href="/map">{t.map} <span aria-hidden="true">↗</span></a><p>DẤU VIỆT GLOBAL · Explore Places. Understand Stories.</p></div></footer>
    </main>
  </div>;
}

function Collection({ endpoint, filter, slug, locale }: { endpoint: "destinations" | "cities" | "regions"; filter: string; slug: string; locale: Locale }) {
  const t = copy[locale];
  const [data, setData] = useState<PageList | null>(null);
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setFailed(false);
    read<PageList>(`/v1/${endpoint}?${filter}=${encodeURIComponent(slug)}&locale=${locale}&page=${page}&pageSize=12`, controller.signal)
      .then(value => { if (!controller.signal.aborted) setData(previous => ({ ...value, items: page === 1 ? value.items : [...(previous?.items ?? []), ...value.items].filter((item, i, all) => all.findIndex(v => v.id === item.id) === i) })); })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [endpoint, filter, slug, locale, page, attempt]);
  return <div className={`region-collection region-collection-${endpoint}`} aria-busy={loading}>
    {!!data?.items.length && <ul>{data.items.map(item => <li key={item.id}>{endpoint === "cities" ? <div><h3>{item.name || item.slug}</h3>{item.timezone && <p>{item.timezone}</p>}</div> : <a href={`/${endpoint}/${encodeURIComponent(item.slug)}${endpoint === "regions" ? `?locale=${locale}` : ""}`}><div>{item.type && <small>{item.type}</small>}<h3>{item.name || item.slug}</h3>{item.tagline && <p>{item.tagline}</p>}</div><span aria-hidden="true">↗</span></a>}</li>)}</ul>}
    <div role="status">{loading ? <p>{t.loading}</p> : failed ? <p>{t.listError}</p> : data?.items.length ? <p className="region-small">{t.shown} {data.items.length} {t.of} {data.total}</p> : <p className="region-empty">{t.empty}</p>}</div>
    {failed ? <button onClick={() => setAttempt(n => n + 1)}>{t.retry}</button> : data && data.page < data.totalPages && <button disabled={loading} onClick={() => setPage(data.page + 1)}>{t.more}</button>}
  </div>;
}
