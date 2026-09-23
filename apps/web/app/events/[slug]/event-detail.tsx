"use client";

import { useEffect, useState } from "react";
import PublishedMedia from "../../components/published-media";
import { eventCopy, type EventLocale } from "./event-copy";

type Entity = { id: string; slug: string; name?: string | null };
type EventProfile = {
  id: string; slug: string;
  date?: { display?: string | null; year?: number | null; precision?: string; qualifier?: string; era?: string; rangeEnd?: unknown } | null;
  translation?: { title?: string | null; summary?: string | null; description?: string | null } | null;
  heroMedia?: { id: string } | null;
  countries?: (Entity & { iso2: string; role?: string | null })[];
  places?: Entity[];
  people?: (Entity & { displayName?: string | null })[];
  themes?: (Entity & { category?: string })[];
  era?: Entity | null; territory?: Entity | null;
  meta: { requestedLocale: string; resolvedLocale: string | null; fallbackApplied: boolean };
};
type Story = { id: string; slug: string; type?: string; title?: string | null };
type Source = { id: string; title?: string | null; sourceType?: string; author?: string | null; organization?: string | null; publisher?: string | null; publicationYear?: number | null; url?: string | null; credibilityLevel?: string | null };
const API = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** A failed supporting resource never replaces the primary event or another resource. */
function useResource<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null); setData(null);
    fetch(`${API}${path}`, { signal: controller.signal, credentials: "include" })
      .then(async response => {
        if (!response.ok) throw response.status;
        const payload = await response.json();
        if (!controller.signal.aborted) setData(payload.data ?? payload);
      })
      .catch(reason => { if (!controller.signal.aborted) setError(typeof reason === "number" ? reason : 0); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [path, attempt]);
  return { data, loading, error, retry: () => setAttempt(value => value + 1) };
}

/** Only explicit absolute web links are offered; no inferred Source detail route. */
function sourceHref(value?: string | null): string | null {
  if (!value || !/^https?:\/\//i.test(value)) return null;
  try { const parsed = new URL(value); return parsed.username || parsed.password ? null : parsed.href; } catch { return null; }
}

export default function EventDetail({ slug, locale }: { slug: string; locale: EventLocale }) {
  const t = eventCopy[locale];
  const resource = useResource<EventProfile>(`/v1/events/${encodeURIComponent(slug)}?locale=${locale}`);
  if (resource.loading) return <main id="main" className="event-page event-state" lang={locale} aria-busy="true"><p role="status">{t.loading}</p></main>;
  const event = resource.data;
  if (resource.error !== null || !event) return <main id="main" className="event-page event-state" lang={locale}><p className="event-kicker">{t.event}</p><h1>{resource.error === 404 ? t.missing : t.error}</h1><p role="alert">{t.errorBody}</p><button onClick={resource.retry}>{t.retry}</button><a href="/map">{t.map}</a></main>;

  const title = event.translation?.title || event.slug || slug;
  const contentLang = event.meta.resolvedLocale ?? undefined;
  const places = event.places ?? [], countries = event.countries ?? [], people = event.people ?? [], themes = event.themes ?? [];
  const hasContext = people.length || themes.length || event.era || event.territory;
  return <div className="event-page" lang={locale}>
    <header className="event-topbar event-wrap"><a href="/" aria-label={`Dấu Việt Global — ${t.home}`}><img src="/brand/dvg-logo-horizontal-primary-light-v1.4.1.svg" width="230" height="48" alt="Dấu Việt Global" /></a><nav aria-label={t.language}><a href="?locale=vi" lang="vi" aria-current={locale === "vi" ? "page" : undefined}>VI</a><a href="?locale=en" lang="en" aria-current={locale === "en" ? "page" : undefined}>EN</a></nav></header>
    <main id="main">
      <header className="event-hero"><div className="event-wrap">
        <nav className="event-breadcrumb" aria-label={t.breadcrumb}><a href="/">Dấu Việt Global</a><span aria-hidden="true">/</span><span aria-current="page">{t.event}</span></nav>
        <div className="event-hero-grid"><div><p className="event-kicker">{t.event}</p><h1 lang={event.translation?.title ? contentLang : undefined}>{title}</h1>{!event.translation?.title && <p className="event-small">{t.untitled}</p>}<p className="event-deck" lang={event.translation?.summary ? contentLang : locale}>{event.translation?.summary || t.noSummary}</p>
          {event.meta.fallbackApplied && <p className="event-fallback">{t.fallback}: {event.meta.resolvedLocale ?? t.unknown} · {t.requested}: {event.meta.requestedLocale}</p>}
          <a className="event-hero-link" href="#event-narrative">{t.understand}<span aria-hidden="true">↓</span></a>
        </div><aside className="event-date" aria-label={t.date}><p className="event-kicker">{t.date}</p><strong>{event.date?.display || t.unknownDate}</strong><p>{t.dateNote}</p></aside></div>
        {!event.heroMedia?.id && <p className="event-no-media">{t.noMedia}</p>}
      </div></header>
      <nav className="event-jump event-wrap" aria-label={t.inside}><a href="#event-narrative">{t.understand}</a><a href="#event-connections">{t.connections}</a><a href="#event-stories">{t.stories}</a><a href="#event-sources">{t.sources}</a></nav>
      <section id="event-narrative" className="event-wrap event-section event-split" aria-labelledby="event-narrative-title"><div><p className="event-kicker">{t.narrative}</p><h2 id="event-narrative-title">{t.understand}</h2></div><div className="event-prose" lang={event.translation?.description ? contentLang : locale}>{event.translation?.description ? event.translation.description.split(/\n\s*\n/).map((paragraph, i) => <p key={i}>{paragraph}</p>) : <p>{t.noDescription}</p>}</div></section>
      {event.heroMedia?.id && <section className="event-wrap event-media-section" aria-labelledby="event-media-title"><div><p className="event-kicker">{t.media}</p><h2 id="event-media-title">{t.media}</h2><p>{t.mediaNote}</p></div><PublishedMedia key={event.heroMedia.id} id={event.heroMedia.id} locale={locale} /></section>}
      <section id="event-connections" className="event-connections" aria-labelledby="event-connections-title"><div className="event-wrap event-section"><div className="event-section-head"><div><p className="event-kicker">{t.connections}</p><h2 id="event-connections-title">{t.connections}</h2></div><p>{t.relationNote}</p></div><div className="event-related-grid">
        <section aria-labelledby="event-places-title"><h3 id="event-places-title">{t.places}</h3>{places.length ? <ul className="event-link-list">{places.map(place => <li key={place.id}><a href={`/places/${encodeURIComponent(place.slug)}`}><span>{place.name || place.slug}</span><span aria-hidden="true">↗</span></a></li>)}</ul> : <p className="event-empty">{t.noPlaces}</p>}</section>
        <section aria-labelledby="event-countries-title"><h3 id="event-countries-title">{t.countries}</h3>{countries.length ? <ul className="event-link-list">{countries.map(country => <li key={country.id}><a href={`/countries/${encodeURIComponent(country.slug)}`}><span><strong>{country.iso2 || country.slug}</strong><small>{t.role}: {country.role || t.unknown}</small></span><span aria-hidden="true">↗</span></a></li>)}</ul> : <p className="event-empty">{t.noCountries}</p>}</section>
      </div></div></section>
      <section className="event-wrap event-section event-split" aria-labelledby="event-context-title"><div><p className="event-kicker">{t.context}</p><h2 id="event-context-title">{t.context}</h2><p className="event-small">{t.contextNote}</p></div><div>{hasContext ? <div className="event-context-grid">
        {!!people.length && <div><h3>{t.people}</h3><ul className="event-context-list">{people.map(person => <li key={person.id}>{person.displayName || person.slug}</li>)}</ul></div>}
        {!!themes.length && <div><h3>{t.themes}</h3><ul className="event-context-list">{themes.map(theme => <li key={theme.id}>{theme.name || theme.slug}{theme.category && <small>{theme.category}</small>}</li>)}</ul></div>}
        {event.era && <div><h3>{t.era}</h3><p>{event.era.slug}</p></div>}{event.territory && <div><h3>{t.territory}</h3><p>{event.territory.slug}</p></div>}
      </div> : <p className="event-empty">{t.noContext}</p>}<p className="event-small event-context-note">{t.relationLocale}</p></div></section>
      <EventStories key={`stories-${event.slug}-${locale}`} slug={event.slug || slug} locale={locale} />
      <EventSources key={`sources-${event.slug}`} slug={event.slug || slug} locale={locale} />
      <footer className="event-end"><div className="event-wrap"><p className="event-kicker">{t.continue}</p><a href="#event-stories">{t.backStories}<span aria-hidden="true">↑</span></a><a href="/map">{t.map}<span aria-hidden="true">↗</span></a><p>DẤU VIỆT GLOBAL · Explore Places. Understand Stories.</p></div></footer>
    </main>
  </div>;
}

function EventStories({ slug, locale }: { slug: string; locale: EventLocale }) {
  const t = eventCopy[locale];
  const { data, loading, error, retry } = useResource<Story[]>(`/v1/events/${encodeURIComponent(slug)}/stories?locale=${locale}`);
  return <section id="event-stories" className="event-stories" aria-labelledby="event-stories-title"><div className="event-wrap event-section event-split"><div><p className="event-kicker">Story Explorer</p><h2 id="event-stories-title">{t.stories}</h2><p>{t.storiesNote}</p></div><div aria-busy={loading}>{loading ? <p role="status">{t.supportLoading}</p> : error !== null ? <><p role="status">{t.storiesError}</p><button onClick={retry}>{t.retry}</button></> : data?.length ? <ul className="event-story-list">{data.map(story => <li key={story.id}><a href={`/stories/${encodeURIComponent(story.slug)}`}><div>{story.type && <small>{story.type}</small>}<h3>{story.title || story.slug}</h3></div><span aria-hidden="true">↗</span></a></li>)}</ul> : <p className="event-empty">{t.noStories}</p>}</div></div></section>;
}

function EventSources({ slug, locale }: { slug: string; locale: EventLocale }) {
  const t = eventCopy[locale];
  const { data, loading, error, retry } = useResource<Source[]>(`/v1/events/${encodeURIComponent(slug)}/sources`);
  return <section id="event-sources" className="event-wrap event-section" aria-labelledby="event-sources-title"><div className="event-section-head"><div><p className="event-kicker">{t.sources}</p><h2 id="event-sources-title">{t.sources}</h2></div><p>{t.sourceIntro}</p></div><div aria-busy={loading}>{loading ? <p role="status">{t.supportLoading}</p> : error !== null ? <><p role="status">{t.sourcesError}</p><button onClick={retry}>{t.retry}</button></> : data?.length ? <ul className="event-source-list">{data.map(source => {
    const href = sourceHref(source.url);
    const metadata = [[t.sourceType, source.sourceType], [t.author, source.author], [t.organization, source.organization], [t.publisher, source.publisher], [t.year, source.publicationYear], [t.credibility, source.credibilityLevel || t.unknownCredibility]];
    return <li key={source.id}><article><h3>{source.title || t.sourceUntitled}</h3><dl>{metadata.filter(([, value]) => value !== null && value !== undefined && value !== "").map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{href ? <a className="event-source-link" href={href} target="_blank" rel="noopener noreferrer" aria-label={`${t.external}: ${source.title || t.sourceUntitled}`}>{source.url}<span aria-hidden="true">↗</span></a> : source.url ? <p className="event-small">{t.sourceUrlUnavailable}</p> : null}</article></li>;
  })}</ul> : <p className="event-empty">{t.noSources}</p>}</div><aside className="event-trust" aria-labelledby="event-trust-title"><h3 id="event-trust-title">{t.trust}</h3><p>{t.trustNote}</p></aside></section>;
}
