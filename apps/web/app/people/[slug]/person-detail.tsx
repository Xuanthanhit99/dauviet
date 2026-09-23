"use client";

import PublishedMedia from "../../components/published-media";
import { RelatedSources, RelatedStories, useResource } from "../../components/editorial-related";
import { personCopy, type PersonLocale } from "./person-copy";

// Historical display strings are authoritative; numeric fields never synthesize dates or ages.
type HistoricalDate = { display?: string | null };
type Person = {
  id: string; slug: string; birth?: HistoricalDate | null; death?: HistoricalDate | null;
  translation?: { displayName?: string | null; alternateNames?: string | null; summary?: string | null; description?: string | null } | null;
  heroMedia?: { id: string } | null;
  places?: { id: string; slug: string; name?: string | null; role?: string | null }[];
  meta: { requestedLocale: string; resolvedLocale: string | null; fallbackApplied: boolean };
};
type ConnectedEvent = { id: string; slug: string; title?: string | null; date?: HistoricalDate | null };

export default function PersonDetail({ slug, locale }: { slug: string; locale: PersonLocale }) {
  const t = personCopy[locale];
  const resource = useResource<Person>(`/v1/people/${encodeURIComponent(slug)}?locale=${locale}`);
  if (resource.loading) return <main id="main" className="person-page person-state" lang={locale} aria-busy="true"><p role="status">{t.loading}</p></main>;
  const person = resource.data;
  if (resource.error !== null || !person) return <main id="main" className="person-page person-state" lang={locale}><p className="person-kicker">{t.person}</p><h1>{resource.error === 404 ? t.missing : t.error}</h1><p role="alert">{t.errorBody}</p><button onClick={resource.retry}>{t.retry}</button><a href="/map">{t.map}</a></main>;

  const content = person.translation;
  const contentLang = person.meta.resolvedLocale ?? undefined;
  const places = person.places ?? [];
  const canonicalSlug = person.slug || slug;
  return <div className="person-page" lang={locale}>
    <header className="person-topbar person-wrap"><a href="/" aria-label={`Dấu Việt Global — ${t.home}`}><img src="/brand/dvg-logo-horizontal-primary-light-v1.4.1.svg" width="230" height="48" alt="Dấu Việt Global" /></a><nav aria-label={t.language}><a href="?locale=vi" lang="vi" aria-current={locale === "vi" ? "page" : undefined}>VI</a><a href="?locale=en" lang="en" aria-current={locale === "en" ? "page" : undefined}>EN</a></nav></header>
    <main id="main">
      <header className="person-hero"><div className="person-wrap">
        <nav className="person-breadcrumb" aria-label={t.breadcrumb}><a href="/">Dấu Việt Global</a><span aria-hidden="true">/</span><span aria-current="page">{t.person}</span></nav>
        <div className="person-hero-grid"><div><p className="person-kicker">{t.person}</p><h1 lang={content?.displayName ? contentLang : undefined}>{content?.displayName || canonicalSlug}</h1>
          {!content?.displayName && <p className="person-small">{t.untitled}</p>}
          {content?.alternateNames && <details className="person-aliases"><summary>{t.alternateNames}</summary><p lang={contentLang}>{content.alternateNames}</p></details>}
          <p className="person-deck" lang={content?.summary ? contentLang : locale}>{content?.summary || t.noSummary}</p>
          {person.meta.fallbackApplied && <p className="person-fallback">{t.fallback}: {person.meta.resolvedLocale ?? t.unknown} · {t.requested}: {person.meta.requestedLocale}</p>}
          <a className="person-hero-link" href="#person-narrative">{t.understand}<span aria-hidden="true">↓</span></a>
        </div><aside className="person-date" aria-label={t.life}><p className="person-kicker">{t.life}</p><dl><div><dt>{t.birth}</dt><dd>{person.birth?.display || t.unknownDate}</dd></div><div><dt>{t.death}</dt><dd>{person.death?.display || t.unknownDate}</dd></div></dl><p>{t.dateNote}</p></aside></div>
        {!person.heroMedia?.id && <p className="person-no-media">{t.noMedia}</p>}
      </div></header>
      <nav className="person-jump person-wrap" aria-label={t.inside}><a href="#person-narrative">{t.understand}</a><a href="#person-places">{t.places}</a><a href="#person-timeline">{t.timeline}</a><a href="#person-stories">{t.stories}</a><a href="#person-sources">{t.sources}</a></nav>
      <section id="person-narrative" className="person-wrap person-section person-split" aria-labelledby="person-narrative-title"><div><p className="person-kicker">{t.narrative}</p><h2 id="person-narrative-title">{t.understand}</h2></div><div className="person-prose" lang={content?.description ? contentLang : locale}>{content?.description ? content.description.split(/\n\s*\n/).map((paragraph, i) => <p key={i}>{paragraph}</p>) : <p>{t.noDescription}</p>}</div></section>
      {person.heroMedia?.id && <section className="person-wrap person-media-section" aria-labelledby="person-media-title"><div><h2 id="person-media-title">{t.media}</h2><p>{t.mediaNote}</p></div><PublishedMedia key={person.heroMedia.id} id={person.heroMedia.id} locale={locale} /></section>}
      <section id="person-places" className="person-connections" aria-labelledby="person-places-title"><div className="person-wrap person-section person-split"><div><p className="person-kicker">{t.places}</p><h2 id="person-places-title">{t.places}</h2><p>{t.relationNote}</p></div><div>{places.length ? <ul className="person-link-list">{places.map((place, i) => <li key={`${place.id}-${place.role}-${i}`}><a href={`/places/${encodeURIComponent(place.slug)}`}><span>{place.name || place.slug}<small>{t.role}: {place.role || t.unknown}</small></span><span aria-hidden="true">↗</span></a></li>)}</ul> : <p className="person-empty">{t.noPlaces}</p>}<p className="person-small">{t.relationLocale}</p></div></div></section>
      <PersonTimeline key={`timeline-${canonicalSlug}-${locale}`} slug={canonicalSlug} locale={locale} />
      <RelatedStories key={`stories-${canonicalSlug}-${locale}`} entity="people" prefix="person" copy={t} slug={canonicalSlug} locale={locale} />
      <RelatedSources key={`sources-${canonicalSlug}`} entity="people" prefix="person" copy={t} slug={canonicalSlug} locale={locale} />
      <footer className="person-end"><div className="person-wrap"><p className="person-kicker">{t.continue}</p><a href="#person-timeline">{t.backEvents}<span aria-hidden="true">↑</span></a><a href="/map">{t.map}<span aria-hidden="true">↗</span></a><p>DẤU VIỆT GLOBAL · Explore Places. Understand Stories.</p></div></footer>
    </main>
  </div>;
}

function PersonTimeline({ slug, locale }: { slug: string; locale: PersonLocale }) {
  const t = personCopy[locale];
  const { data, loading, error, retry } = useResource<ConnectedEvent[]>(`/v1/people/${encodeURIComponent(slug)}/timeline?locale=${locale}`);
  return <section id="person-timeline" className="person-wrap person-section person-split" aria-labelledby="person-timeline-title"><div><p className="person-kicker">{t.timeline}</p><h2 id="person-timeline-title">{t.timeline}</h2><p>{t.timelineNote}</p><p className="person-small">{t.timelineLocale}</p></div><div aria-busy={loading}>{loading ? <p role="status">{t.supportLoading}</p> : error !== null ? <><p role="status">{t.timelineError}</p><button onClick={retry}>{t.retry}</button></> : data?.length ? <ol className="person-timeline">{data.map(event => <li key={event.id}><p className="person-timeline-date">{event.date?.display || t.unknownDate}</p><h3><a href={`/events/${encodeURIComponent(event.slug)}?locale=${locale}`}>{event.title || event.slug}<span aria-hidden="true">↗</span></a></h3></li>)}</ol> : <p className="person-empty">{t.timelineEmpty}</p>}</div></section>;
}
