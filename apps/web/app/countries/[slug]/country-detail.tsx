"use client";

import { useEffect, useMemo, useState } from "react";

type Meta = { requestedLocale: string; resolvedLocale: string; fallbackApplied: boolean };
type Country = {
  id: string;
  slug: string;
  iso2: string;
  iso3?: string;
  defaultLocale?: string;
  defaultCurrency?: string;
  status?: string;
  location?: { latitude: number; longitude: number | null } | null;
  translation?: { name?: string; shortDescription?: string | null; description?: string | null } | null;
  meta: Meta;
};
type Region = { id: string; slug: string; type?: string; name?: string };
type City = { id: string; slug: string; timezone?: string; name?: string };
type Destination = { id: string; slug: string; type?: string; name?: string; tagline?: string | null; placeCount?: number; storyCount?: number };
type PageList<T> = { items: T[]; page: number; pageSize: number; total: number; totalPages: number };

const API = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, "");
const emptyList = <T,>(): PageList<T> => ({ items: [], page: 1, pageSize: 0, total: 0, totalPages: 0 });
const nameOf = (item: { name?: string; slug: string }) => item.name || item.slug;
const hasPoint = (country: Country | null) => !!country?.location && Number.isFinite(country.location.latitude) && Number.isFinite(country.location.longitude) && Math.abs(country.location.latitude) <= 90 && Math.abs(country.location.longitude!) <= 180;

async function readJson<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(`${API}${path}`, { credentials: "include", signal });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message ?? "Khong the tai du lieu quoc gia.");
  return (payload?.data ?? payload) as T;
}

export default function CountryDetail({ slug }: { slug: string }) {
  const [country, setCountry] = useState<Country | null>(null);
  const [regions, setRegions] = useState<PageList<Region>>(emptyList);
  const [cities, setCities] = useState<PageList<City>>(emptyList);
  const [destinations, setDestinations] = useState<PageList<Destination>>(emptyList);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setCountry(null); setRegions(emptyList()); setCities(emptyList()); setDestinations(emptyList());
    const countryPath = `/v1/countries/${encodeURIComponent(slug)}?locale=vi`;
    readJson<Country>(countryPath, controller.signal)
      .then(async value => {
        const base = `/v1/countries/${encodeURIComponent(value.slug || slug)}`;
        const [regionData, cityData, destinationData] = await Promise.all([
          readJson<PageList<Region>>(`${base}/regions?locale=vi&page=1&pageSize=24`, controller.signal).catch(() => emptyList<Region>()),
          readJson<PageList<City>>(`${base}/cities?locale=vi&page=1&pageSize=18`, controller.signal).catch(() => emptyList<City>()),
          readJson<PageList<Destination>>(`${base}/destinations?locale=vi&page=1&pageSize=12`, controller.signal).catch(() => emptyList<Destination>()),
        ]);
        if (!controller.signal.aborted) {
          setCountry(value);
          setRegions(regionData);
          setCities(cityData);
          setDestinations(destinationData);
        }
      })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Khong the tai du lieu quoc gia."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [slug, attempt]);

  const title = country?.translation?.name || country?.slug || slug;
  const description = country?.translation?.description || country?.translation?.shortDescription || "";
  const located = hasPoint(country);
  const continuation = useMemo(() => [
    { label: "Regions", value: regions.total, id: "country-regions" },
    { label: "Destinations", value: destinations.total, id: "country-destinations" },
    { label: "Places", value: null, id: "country-gaps" },
    { label: "Stories", value: null, id: "country-gaps" },
    { label: "Journeys", value: null, id: "country-gaps" },
  ], [regions.total, destinations.total]);

  if (loading) return <main id="main" className="country-state" aria-busy="true"><p role="status">Dang mo ho so quoc gia...</p></main>;
  if (error || !country) return <main id="main" className="country-state"><div className="eyebrow">Country</div><h1>Khong the mo quoc gia</h1><p role="alert">{error || "Khong tim thay quoc gia da xuat ban."}</p><div className="hero-actions"><button className="button button-gold" onClick={() => setAttempt(value => value + 1)}>Thu lai</button><a className="button" href="/map">Quay lai ban do</a></div></main>;

  return <main id="main" className="country-page">
    <header className="country-hero">
      <div className="container country-hero-inner">
        <nav className="country-breadcrumb" aria-label="Duong dan"><a href="/">Dau Viet Global</a><span aria-hidden="true">/</span><span>World</span><span aria-hidden="true">/</span><span>{country.iso2}</span></nav>
        <div className="eyebrow">Country Detail V1 · {country.iso2}{country.iso3 ? ` / ${country.iso3}` : ""}</div>
        <h1 lang={country.meta.resolvedLocale}>{title}</h1>
        <p className="country-deck" lang={country.meta.resolvedLocale}>{country.translation?.shortDescription || "Ho so quoc gia nay chua co tom tat da xuat ban."}</p>
        {country.meta.fallbackApplied && <p className="locale-fallback">Ngon ngu du phong: {country.meta.resolvedLocale}</p>}
        <div className="country-hero-grid" aria-label="Tong quan quan he">
          <a href="#country-regions"><strong>{regions.total}</strong><span>Regions da xuat ban</span></a>
          <a href="#country-destinations"><strong>{destinations.total}</strong><span>Destinations da xuat ban</span></a>
          <a href="#country-spatial"><strong>{located ? "1" : "0"}</strong><span>Diem toa do quoc gia</span></a>
        </div>
        <p className="country-media-empty">Country V1 khong co truong hero media cong khai. Man hinh nay khong dung anh thay the.</p>
      </div>
    </header>

    <nav className="country-jump container" aria-label="Trong quoc gia">
      <a href="#country-understand">Understand</a><a href="#country-regions">Regions</a><a href="#country-destinations">Destinations</a><a href="#country-spatial">Spatial context</a><a href="#country-gaps">Trust notes</a>
    </nav>

    <section id="country-understand" className="country-introduction container" aria-labelledby="country-understand-title">
      <div><div className="eyebrow">Understand this country</div><h2 id="country-understand-title">Doc tu du lieu da xuat ban</h2></div>
      <div className="country-description" lang={country.meta.resolvedLocale}>{description ? description.split(/\n\s*\n/).map((paragraph, index) => <p key={index}>{paragraph}</p>) : <p>Chua co mo ta hoac boi canh lich su da xuat ban cho quoc gia nay.</p>}</div>
      <aside className="country-facts" aria-label="Thong tin hop dong">
        <dl>
          <div><dt>Country code</dt><dd>{country.iso2}{country.iso3 ? ` / ${country.iso3}` : ""}</dd></div>
          <div><dt>Default locale</dt><dd>{country.defaultLocale || "Chua cung cap"}</dd></div>
          <div><dt>Default currency</dt><dd>{country.defaultCurrency || "Chua cung cap"}</dd></div>
        </dl>
      </aside>
    </section>

    <section id="country-regions" className="country-section" aria-labelledby="country-regions-title">
      <div className="container country-section-layout">
        <div><div className="eyebrow">World {">"} Country {">"} Regions</div><h2 id="country-regions-title">Cac vung da xuat ban</h2><p>Regions la lop dieu huong chinh khi backend cong khai chung cho quoc gia nay.</p></div>
        <EntityList items={regions.items} empty="Chua co region da xuat ban cho quoc gia nay." getHref={() => null} getMeta={item => item.type || "Region"} />
      </div>
    </section>

    <section id="country-destinations" className="country-section country-warm" aria-labelledby="country-destinations-title">
      <div className="container country-section-layout">
        <div><div className="eyebrow">Find destinations</div><h2 id="country-destinations-title">Destinations trong quoc gia</h2><p>Danh sach chi dung destination da xuat ban tu endpoint cua Country, khong sao chep noi dung cua Destination Detail.</p></div>
        <EntityList items={destinations.items} empty="Chua co destination da xuat ban cho quoc gia nay." getHref={item => `/destinations/${encodeURIComponent(item.slug)}`} getMeta={item => item.type || "Destination"} getDetail={item => item.tagline || [item.placeCount != null ? `${item.placeCount} places` : null, item.storyCount != null ? `${item.storyCount} stories` : null].filter(Boolean).join(" · ")} />
      </div>
    </section>

    <section className="country-section" aria-labelledby="country-cities-title">
      <div className="container country-section-layout">
        <div><div className="eyebrow">Geographic context</div><h2 id="country-cities-title">Cities neu duoc cong khai</h2><p>Cities giup lam ro cau truc dia ly hien dai. Chung khong thay the Region Detail hay Destination Detail.</p></div>
        <EntityList items={cities.items} empty="Chua co city da xuat ban cho quoc gia nay." getHref={() => null} getMeta={item => item.timezone || "City"} />
      </div>
    </section>

    <section id="country-spatial" className="country-spatial-section" aria-labelledby="country-spatial-title">
      <div className="container country-spatial-grid">
        <div><div className="eyebrow">Spatial context</div><h2 id="country-spatial-title">Khong gian khong bien gioi gia dinh</h2><p>Country API chi cong khai toa do diem dai dien khi co. Khong co hinh hoc lanh tho, nen trang nay khong ve duong bien gioi.</p></div>
        <div className="country-coordinate-panel" role="region" aria-label="Toa do quoc gia">
          {located ? <><strong>{title}</strong><p>{country.location!.latitude.toFixed(4)}, {country.location!.longitude!.toFixed(4)}</p><p>Diem nay la context bo sung; danh sach quan he o tren van la cach dieu huong chinh.</p></> : <p>Chua co toa do hop le cho quoc gia nay. Ban do duoc bo qua de tranh tao bien gioi hoac vi tri suy dien.</p>}
        </div>
      </div>
    </section>

    <section className="country-continuation container" aria-labelledby="country-continuation-title">
      <div><div className="eyebrow">Continue</div><h2 id="country-continuation-title">Di tiep theo cau truc san pham</h2></div>
      <div className="country-continuation-chain">{continuation.map(item => <a key={item.label} href={`#${item.id}`}><span>{item.label}</span><strong>{item.value == null ? "Chua duoc expose" : item.value}</strong></a>)}</div>
    </section>

    <section id="country-gaps" className="country-trust" aria-labelledby="country-trust-title">
      <div className="container country-trust-grid">
        <div><div className="eyebrow">Trust & contract gaps</div><h2 id="country-trust-title">Nhung gi Country V1 khong tu tao</h2></div>
        <div>
          <p>Backend Country Detail hien chi expose identity, translation, location point va cac list Regions, Cities, Destinations. Khong co Country hero media, Places, Stories, Journeys, People, Events, Culture, citations, provenance hay boundary geometry truc tiep.</p>
          <p>Trang nay khong dien population, area, capital, language, weather, visa, safety, ratings, best lists, historical dates, booking CTA, media thay the, route lines hoac territory borders.</p>
        </div>
      </div>
    </section>
  </main>;
}

function EntityList<T extends { id: string; slug: string; name?: string }>({ items, empty, getHref, getMeta, getDetail }: {
  items: T[];
  empty: string;
  getHref: (item: T) => string | null;
  getMeta: (item: T) => string;
  getDetail?: (item: T) => string | null | undefined;
}) {
  if (!items.length) return <p className="country-empty">{empty}</p>;
  return <div className="country-entity-list">{items.map(item => {
    const body = <><small>{getMeta(item)}</small><h3>{nameOf(item)}</h3>{getDetail?.(item) && <p>{getDetail(item)}</p>}</>;
    const href = getHref(item);
    return href ? <a key={item.id} className="country-entity" href={href}>{body}</a> : <article key={item.id} className="country-entity">{body}</article>;
  })}</div>;
}
