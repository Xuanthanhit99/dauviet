"use client";

import { useEffect, useState } from "react";

type Story = { id: string; slug: string; type?: string; title?: string | null };
type Source = { id: string; title?: string | null; sourceType?: string; author?: string | null; organization?: string | null; publisher?: string | null; publicationYear?: number | null; url?: string | null; credibilityLevel?: string | null };
const API = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** A failed supporting resource never replaces the primary profile or another resource. */
export function useResource<T>(path: string) {
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

export type RelatedCopy = { stories: string; storiesNote: string; supportLoading: string; storiesError: string; retry: string; noStories: string; sources: string; sourceIntro: string; sourcesError: string; sourceType: string; author: string; organization: string; publisher: string; year: string; credibility: string; unknownCredibility: string; sourceUntitled: string; external: string; sourceUrlUnavailable: string; noSources: string; trust: string; trustNote: string };
type RelatedProps = { slug: string; locale: "vi" | "en"; entity: "events" | "people"; prefix: "event" | "person"; copy: RelatedCopy };

export function RelatedStories({ slug, locale, entity, prefix, copy: t }: RelatedProps) {
  const { data, loading, error, retry } = useResource<Story[]>(`/v1/${entity}/${encodeURIComponent(slug)}/stories?locale=${locale}`);
  return <section id={`${prefix}-stories`} className={`${prefix}-stories`} aria-labelledby={`${prefix}-stories-title`}><div className={`${prefix}-wrap ${prefix}-section ${prefix}-split`}><div><p className={`${prefix}-kicker`}>Story Explorer</p><h2 id={`${prefix}-stories-title`}>{t.stories}</h2><p>{t.storiesNote}</p></div><div aria-busy={loading}>{loading ? <p role="status">{t.supportLoading}</p> : error !== null ? <><p role="status">{t.storiesError}</p><button onClick={retry}>{t.retry}</button></> : data?.length ? <ul className={`${prefix}-story-list`}>{data.map(story => <li key={story.id}><a href={`/stories/${encodeURIComponent(story.slug)}`}><div>{story.type && <small>{story.type}</small>}<h3>{story.title || story.slug}</h3></div><span aria-hidden="true">↗</span></a></li>)}</ul> : <p className={`${prefix}-empty`}>{t.noStories}</p>}</div></div></section>;
}

export function RelatedSources({ slug, locale, entity, prefix, copy: t }: RelatedProps) {
  const { data, loading, error, retry } = useResource<Source[]>(`/v1/${entity}/${encodeURIComponent(slug)}/sources`);
  return <section id={`${prefix}-sources`} className={`${prefix}-wrap ${prefix}-section`} aria-labelledby={`${prefix}-sources-title`}><div className={`${prefix}-section-head`}><div><p className={`${prefix}-kicker`}>{t.sources}</p><h2 id={`${prefix}-sources-title`}>{t.sources}</h2></div><p>{t.sourceIntro}</p></div><div aria-busy={loading}>{loading ? <p role="status">{t.supportLoading}</p> : error !== null ? <><p role="status">{t.sourcesError}</p><button onClick={retry}>{t.retry}</button></> : data?.length ? <ul className={`${prefix}-source-list`}>{data.map(source => {
    const href = sourceHref(source.url);
    const metadata = [[t.sourceType, source.sourceType], [t.author, source.author], [t.organization, source.organization], [t.publisher, source.publisher], [t.year, source.publicationYear], [t.credibility, source.credibilityLevel || t.unknownCredibility]];
    return <li key={source.id}><article><h3>{source.title || t.sourceUntitled}</h3><dl>{metadata.filter(([, value]) => value !== null && value !== undefined && value !== "").map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{href ? <a className={`${prefix}-source-link`} href={href} target="_blank" rel="noopener noreferrer" aria-label={`${t.external}: ${source.title || t.sourceUntitled}`}>{source.url}<span aria-hidden="true">↗</span></a> : source.url ? <p className={`${prefix}-small`}>{t.sourceUrlUnavailable}</p> : null}</article></li>;
  })}</ul> : <p className={`${prefix}-empty`}>{t.noSources}</p>}</div><aside className={`${prefix}-trust`} aria-labelledby={`${prefix}-trust-title`}><h3 id={`${prefix}-trust-title`}>{t.trust}</h3><p>{t.trustNote}</p></aside></section>;
}
