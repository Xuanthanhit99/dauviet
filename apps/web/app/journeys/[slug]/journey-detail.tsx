"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import PublishedMedia, { type MediaSummary } from "../../components/published-media";

export type JourneyStop = {
  order: number;
  place: { id: string; slug: string; name?: string | null; location?: { latitude: number; longitude: number | null } | null };
  stopTitle?: string | null; notes?: string | null; recommendedDurationMinutes?: number | null;
  story?: { id: string; slug: string } | null; event?: { id: string; slug: string } | null;
};
type Journey = {
  id: string; slug: string; durationMinutes?: number | null; distanceMeters?: number | null;
  difficulty?: string | null; region?: string | null; publishedAt?: string | null;
  heroMedia?: MediaSummary | null; routeGeometrySource?: string | null; stops: JourneyStop[];
  translation?: { title?: string; summary?: string | null; description?: string | null } | null;
  meta: { requestedLocale: string; resolvedLocale: string; fallbackApplied: boolean };
};
const JourneyMap = dynamic(() => import("./journey-map"), { ssr: false, loading: () => <p role="status">Đang mở bản đồ điểm dừng…</p> });
const API = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, "");
const formatNumber = (value: number) => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value);
const formatMinutes = (value: number) => value >= 60 ? `${Math.floor(value / 60)} giờ${value % 60 ? ` ${value % 60} phút` : ""}` : `${value} phút`;
const suppliedNumber = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
export function hasCoordinates(stop: JourneyStop): boolean {
  const point = stop.place.location;
  return !!point && typeof point.longitude === "number" && Number.isFinite(point.longitude) && Number.isFinite(point.latitude)
    && Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180;
}
export function stopName(stop: JourneyStop) { return stop.stopTitle || stop.place.name || stop.place.slug; }

export default function JourneyDetail({ slug }: { slug: string }) {
  const [data, setData] = useState<Journey | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setData(null); setSelected(null);
    fetch(`${API}/v1/journeys/${encodeURIComponent(slug)}?locale=vi`, { credentials: "include", signal: controller.signal })
      .then(async response => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error?.message ?? "Không thể tải hành trình.");
        return payload?.data ?? payload;
      })
      .then(value => { if (!controller.signal.aborted) setData(value); })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Không thể tải hành trình."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [slug, attempt]);
  const stops = useMemo(() => [...(data?.stops ?? [])].sort((a, b) => a.order - b.order), [data]);
  const selectFromMap = useCallback((id: string) => {
    setSelected(id);
    const stop = document.getElementById(`stop-${id}`);
    stop?.focus({ preventScroll: true });
    stop?.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, []);
  function selectFromList(id: string) {
    setSelected(id);
    const spatial = document.getElementById("journey-spatial");
    spatial?.focus({ preventScroll: true });
    spatial?.scrollIntoView({ block: "start", behavior: "instant" });
  }
  if (loading) return <main id="main" className="journey-state" aria-busy="true"><p role="status">Đang mở hành trình…</p></main>;
  if (error || !data) return <main id="main" className="journey-state"><div className="eyebrow">Journey</div><h1>Không thể mở hành trình</h1><p role="alert">{error || "Không tìm thấy hành trình đã xuất bản."}</p><div className="hero-actions"><button className="button button-gold" onClick={() => setAttempt(value => value + 1)}>Thử lại</button><a className="button" href="/map">Khám phá bản đồ</a></div></main>;
  const translation = data.translation;
  const selectedStop = stops.find(stop => stop.place.id === selected);
  const locatedCount = stops.filter(hasCoordinates).length;
  return <main id="main" className="journey-page">
    <header className="journey-hero"><div className="container journey-hero-inner">
      <nav className="journey-breadcrumb" aria-label="Đường dẫn"><a href="/">Dấu Việt Global</a><span aria-hidden="true"> / </span><span>Hành trình</span></nav>
      <div className="eyebrow">Journey · {stops.length} điểm dừng{data.region ? ` · ${data.region}` : ""}</div>
      <h1 lang={data.meta.resolvedLocale}>{translation?.title || data.slug}</h1>
      {translation?.summary && <p className="journey-deck" lang={data.meta.resolvedLocale}>{translation.summary}</p>}
      {data.meta.fallbackApplied && <p className="locale-fallback">Ngôn ngữ dự phòng: {data.meta.resolvedLocale}</p>}
      <dl className="journey-metrics">
        <div><dt>Thời lượng hành trình</dt><dd>{suppliedNumber(data.durationMinutes) ? formatMinutes(data.durationMinutes) : "Chưa được cung cấp"}</dd></div>
        <div><dt>Khoảng cách</dt><dd>{suppliedNumber(data.distanceMeters) ? data.distanceMeters >= 1000 ? `${formatNumber(data.distanceMeters / 1000)} km` : `${formatNumber(data.distanceMeters)} m` : "Chưa được cung cấp"}</dd></div>
        <div><dt>Mức độ</dt><dd>{data.difficulty || "Chưa được cung cấp"}</dd></div>
      </dl>
      {stops.length > 0 && <a className="button button-gold journey-start" href="#journey-stops">Khám phá các điểm dừng</a>}
      {data.heroMedia ? <PublishedMedia key={data.heroMedia.id} id={data.heroMedia.id} summary={data.heroMedia}/> : <p className="journey-media-empty">Hành trình chưa có ảnh đại diện được công bố.</p>}
    </div></header>
    <nav className="journey-jump container" aria-label="Trong hành trình"><a href="#journey-context">Bối cảnh</a><a href="#journey-stops">Các điểm dừng</a><a href="#journey-spatial">Không gian</a><a href="#journey-evidence">Nguồn & lưu ý</a></nav>
    <section id="journey-context" className="container journey-introduction" aria-labelledby="journey-context-title">
      <div><div className="eyebrow">Understand the journey</div><h2 id="journey-context-title">Câu chuyện nối những điểm đến</h2></div>
      <div className="journey-description" lang={data.meta.resolvedLocale}>{translation?.description ? translation.description.split(/\n\s*\n/).map((paragraph, index) => <p key={index}>{paragraph}</p>) : <p>Chưa có mô tả bối cảnh được công bố cho hành trình này.</p>}</div>
    </section>
    <div className="container journey-workspace">
      <section id="journey-stops" aria-labelledby="journey-stops-title"><div className="eyebrow">Experience · {stops.length} stops</div><h2 id="journey-stops-title">Đi qua từng dấu vết</h2><p>Các điểm dừng theo thứ tự biên tập của hành trình.</p>
        {stops.length ? <ol className="journey-stops">{stops.map((stop, index) => <li key={stop.place.id}>
          <article id={`stop-${stop.place.id}`} className="journey-stop" tabIndex={-1} aria-labelledby={`stop-title-${stop.place.id}`} data-selected={selected === stop.place.id}>
            <span className="journey-stop-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            <div className="journey-stop-content"><h3 id={`stop-title-${stop.place.id}`}>{stopName(stop)}</h3>
              <a className="journey-place-link" href={`/places/${encodeURIComponent(stop.place.slug)}`}>Khám phá {stop.place.name || stop.place.slug}</a>
              {stop.notes ? <p className="journey-stop-notes">{stop.notes}</p> : <p className="journey-muted">Chưa có ghi chú cho điểm dừng này.</p>}
              {suppliedNumber(stop.recommendedDurationMinutes) && <p>Thời lượng gợi ý tại điểm: {formatMinutes(stop.recommendedDurationMinutes)}</p>}
              {hasCoordinates(stop) && <p className="journey-coordinates">Tọa độ: {stop.place.location!.latitude.toFixed(4)}, {stop.place.location!.longitude!.toFixed(4)}</p>}
              <div className="journey-stop-links">{stop.story && <a href={`/stories/${encodeURIComponent(stop.story.slug)}`}>Đọc câu chuyện · {stop.story.slug}</a>}{stop.event && <a href={`/events/${encodeURIComponent(stop.event.slug)}`}>Bối cảnh sự kiện · {stop.event.slug}</a>}</div>
              {!stop.story && !stop.event && <p className="journey-muted">Chưa có câu chuyện hoặc sự kiện được liên kết.</p>}
              {hasCoordinates(stop) ? <button className="journey-map-select" aria-pressed={selected === stop.place.id} onClick={() => selectFromList(stop.place.id)}>Xem điểm {index + 1} trên bản đồ</button> : <p className="journey-muted">Chưa có tọa độ cho điểm dừng này.</p>}
            </div>
          </article>
        </li>)}</ol> : <p className="journey-empty">Chưa có điểm dừng được công bố.</p>}
      </section>
      <aside id="journey-spatial" tabIndex={-1} className="journey-spatial" aria-labelledby="journey-spatial-title"><div className="eyebrow">Spatial context</div><h2 id="journey-spatial-title">Hành trình trong không gian</h2>
        <p>{locatedCount}/{stops.length} điểm dừng có tọa độ.</p>
        {locatedCount ? <JourneyMap stops={stops} selected={selected} onSelect={selectFromMap}/> : <p className="journey-empty">Chưa có tọa độ để hiển thị bản đồ. Bạn vẫn có thể khám phá từng địa điểm trong danh sách.</p>}
        <p className="journey-selection" role="status">{selectedStop ? `Đang chọn: ${stopName(selectedStop)}` : "Chọn một điểm dừng để xem vị trí."}</p>
        <p className="journey-map-note">Bản đồ thể hiện vị trí điểm dừng, không phải chỉ dẫn đường đi. Chưa có đường tuyến được cung cấp.</p>
      </aside>
    </div>
    <section id="journey-evidence" className="journey-evidence section" aria-labelledby="journey-evidence-title"><div className="container journey-evidence-inner"><div><div className="eyebrow">Trust & context</div><h2 id="journey-evidence-title">Trước khi trải nghiệm</h2>{data.publishedAt && <p>Xuất bản: <time dateTime={data.publishedAt}>{new Date(data.publishedAt).toLocaleDateString("vi-VN", { timeZone: "UTC" })}</time></p>}</div><div>
      <p>Các liên kết địa điểm và câu chuyện tại mỗi điểm dừng đưa bạn đến bối cảnh lịch sử và nguồn được công bố.</p>
      <p>Chưa có danh mục nguồn riêng cho hành trình. Nguồn của từng câu chuyện không tự xác minh toàn bộ hành trình.</p>
      {data.routeGeometrySource && <p>Nguồn tuyến được ghi nhận: {data.routeGeometrySource}. Chưa có dữ liệu đường tuyến để hiển thị.</p>}
      <p>Giờ mở cửa, giá vé, dịch vụ đặt chỗ và thời gian di chuyển giữa các điểm chưa được cung cấp.</p>
      <p>Ghi chú và tiêu đề điểm dừng giữ nguyên ngôn ngữ biên tập; chưa có thông tin bản dịch riêng.</p>
    </div></div></section>
  </main>;
}
