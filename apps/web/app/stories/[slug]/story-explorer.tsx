"use client";

import { useEffect, useMemo, useState, type MouseEvent } from "react";
import PublishedMedia from "../../components/published-media";

type Block = { type: string; level?: 2 | 3 | 4; text?: string; attribution?: string; citationId?: string; mediaAssetId?: string; caption?: string; label?: string; entityKind?: string; entityId?: string; style?: string };
type Link = { id: string; slug: string; role?: string };
type Citation = { id: string; source: { id: string; title: string }; pageFrom?: number | null; pageTo?: number | null; locator?: string | null };
type Story = {
  id: string; slug: string; type: string; byline?: string | null; publishedAt?: string | null;
  heroMedia?: { id: string; type: string; isHistorical: boolean; isAiGenerated: boolean; aiDisclosure?: string | null; accessPolicy: string; status: string } | null;
  places: Link[]; people: Link[]; events: Link[];
  facts: Array<{ id: string; factType: string; certainty: string; editorialStatus: string }>;
  citations: Citation[];
  translation?: { title?: string; subtitle?: string | null; summary?: string | null; content?: Block[] } | null;
  meta: { requestedLocale: string; resolvedLocale: string; fallbackApplied: boolean };
};
const API = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

// Native anchors retain copy/open behavior; keyboard activation also moves focus.
function focusAnchor(event: MouseEvent<HTMLAnchorElement>) {
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  const target = document.getElementById(decodeURIComponent(event.currentTarget.hash.slice(1)));
  target?.focus({ preventScroll: true });
}

export default function StoryExplorer({ slug }: { slug: string }) {
  const [data, setData] = useState<Story | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [returnTo, setReturnTo] = useState<Record<string, string>>({});
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setData(null); setReturnTo({});
    fetch(`${API}/v1/stories/${encodeURIComponent(slug)}?locale=vi`, { credentials: "include", signal: controller.signal })
      .then(async response => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error?.message ?? "Không thể tải câu chuyện.");
        return payload?.data ?? payload;
      })
      .then(value => { if (!controller.signal.aborted) setData(value); })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Không thể tải câu chuyện."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [slug, attempt]);
  const citations = useMemo(() => new Map((data?.citations ?? []).map(item => [item.id, item])), [data]);
  if (loading) return <main id="main" className="story-state" aria-busy="true"><p role="status">Đang mở câu chuyện…</p></main>;
  if (error || !data) return <main id="main" className="story-state"><div className="eyebrow">Story Explorer</div><h1>Không thể mở câu chuyện</h1><p role="alert">{error || "Không tìm thấy nội dung đã xuất bản."}</p><div className="hero-actions"><button className="button button-gold" onClick={() => setAttempt(value => value + 1)}>Thử lại</button><a className="button" href="/map">Quay lại khám phá</a></div></main>;
  const translation = data.translation ?? {};
  const blocks = translation.content ?? [];
  const entities: Record<string, { items: Link[]; base: string }> = {
    PLACE: { items: data.places, base: "/places" }, PERSON: { items: data.people, base: "/people" }, EVENT: { items: data.events, base: "/events" },
  };
  function citationLink(id: string, label: string, index: number) {
    if (!citations.has(id)) return <span className="story-unavailable">{label} — Nguồn tham chiếu chưa được cung cấp.</span>;
    return <a id={`reference-${index}`} href={`#citation-${id}`} onClick={event => {
      setReturnTo(previous => ({ ...previous, [id]: `reference-${index}` }));
      focusAnchor(event);
    }}>{label}</a>;
  }
  function renderBlock(block: Block, index: number) {
    if (block.type === "heading") {
      const Heading = block.level === 2 ? "h2" : block.level === 3 ? "h3" : "h4";
      return <Heading key={index}>{block.text}</Heading>;
    }
    if (block.type === "paragraph") return <p key={index}>{block.text}</p>;
    if (block.type === "quote") return <blockquote key={index}><p>{block.text}</p>{block.attribution && <cite>{block.attribution}</cite>}{block.citationId && citationLink(block.citationId, "Xem nguồn", index)}</blockquote>;
    if (block.type === "source_reference") return <div className="story-source-ref" key={index}>{citationLink(block.citationId ?? "", block.label ?? citations.get(block.citationId ?? "")?.source.title ?? "Nguồn tham chiếu", index)}</div>;
    if (block.type === "entity_reference") {
      const group = entities[block.entityKind ?? ""];
      const entity = group?.items.find(item => item.id === block.entityId);
      return <aside className="story-entity-ref" key={index}><strong>{block.entityKind}</strong>{entity ? <a href={`${group.base}/${encodeURIComponent(entity.slug)}`}>{block.text ?? entity.slug}</a> : <span>{block.text ?? "Thực thể liên quan"}</span>}</aside>;
    }
    if (block.type === "callout") return <aside className={`story-callout ${block.style ?? "info"}`} key={index}>{block.text}</aside>;
    if ((block.type === "image" || block.type === "audio") && block.mediaAssetId) return <PublishedMedia key={`${index}-${block.mediaAssetId}`} id={block.mediaAssetId} caption={block.caption} kind={block.type}/>;
    return null;
  }
  return <main id="main" className="story-page">
    <header className="story-hero"><div className="story-hero-inner container">
      <div className="eyebrow">{data.type} · Story Explorer</div>
      <h1 lang={data.meta.resolvedLocale}>{translation.title ?? data.slug}</h1>
      {translation.subtitle && <p className="story-subtitle" lang={data.meta.resolvedLocale}>{translation.subtitle}</p>}
      {translation.summary && <p className="story-deck" lang={data.meta.resolvedLocale}>{translation.summary}</p>}
      <div className="story-byline">{data.byline && <span>{data.byline}</span>}{data.publishedAt && <time dateTime={data.publishedAt}>{new Date(data.publishedAt).toLocaleDateString("vi-VN", { timeZone: "UTC" })}</time>}{data.meta.fallbackApplied && <span>Ngôn ngữ dự phòng: {data.meta.resolvedLocale}</span>}</div>
      {data.heroMedia && <PublishedMedia key={data.heroMedia.id} id={data.heroMedia.id} summary={data.heroMedia}/>}
      <a className="story-evidence-link" href="#sources" onClick={focusAnchor}>Đến nguồn và bằng chứng</a>
    </div></header>
    <div className="story-layout container">
      <article className="story-reading" aria-label="Nội dung câu chuyện" lang={data.meta.resolvedLocale}>{blocks.length ? blocks.map(renderBlock) : <p className="destination-empty">Câu chuyện chưa có nội dung đã xuất bản.</p>}</article>
      <aside className="story-context"><div className="eyebrow">Connections</div><h2>Câu chuyện này kết nối với</h2>
        <Connections title="Places" items={data.places} base="/places"/><Connections title="People" items={data.people} base="/people"/><Connections title="Events" items={data.events} base="/events"/>
        {!data.places.length && !data.people.length && !data.events.length && <p>Chưa có kết nối được công bố.</p>}
        <div className="story-trust"><strong>Evidence</strong><p>{data.facts.length} fact · {data.citations.length} citation</p><p>Nguồn tham chiếu không đồng nghĩa với mọi chi tiết đã được xác minh.</p></div>
      </aside>
    </div>
    <section id="sources" tabIndex={-1} aria-labelledby="sources-title" className="section story-evidence"><div className="container"><div className="eyebrow">Sources & Evidence</div><h2 id="sources-title">Nguồn đứng sau câu chuyện</h2>
      {data.citations.length ? <div className="source-list">{data.citations.map(item => <article id={`citation-${item.id}`} tabIndex={-1} key={item.id}><strong>{item.source.title}</strong><span>{[item.pageFrom != null ? `tr. ${item.pageFrom}` : null, item.pageTo != null ? `–${item.pageTo}` : null, item.locator].filter(Boolean).join(" ")}</span>{returnTo[item.id] && <a href={`#${returnTo[item.id]}`} onClick={focusAnchor}>Quay lại đoạn đang đọc</a>}</article>)}</div> : <p>Chưa có citation công khai được liên kết.</p>}
      {data.facts.length ? <div className="story-facts">{data.facts.map(item => <span key={item.id}>{item.factType} · {item.certainty}</span>)}</div> : <p>Chưa có dữ kiện lịch sử được liên kết.</p>}
    </div></section>
  </main>;
}

function Connections({ title, items, base }: { title: string; items: Link[]; base: string }) {
  if (!items.length) return null;
  return <div className="connection-group"><strong>{title}</strong>{items.map(item => <a key={item.id} href={`${base}/${encodeURIComponent(item.slug)}`}><span>{item.slug}</span><small>{item.role}</small></a>)}</div>;
}
