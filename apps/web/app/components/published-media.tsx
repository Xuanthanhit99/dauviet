"use client";

import { useEffect, useState } from "react";

export type MediaSummary = { id: string; type: string; isHistorical?: boolean; isAiGenerated: boolean; aiDisclosure?: string | null; accessPolicy: string; status: string };
type MediaAsset = MediaSummary & {
  url?: string | null; mimeType?: string; altText?: string | null; caption?: string | null;
  title?: string | null; creatorName?: string | null; license?: string | null;
  rightsHolder?: string | null; rightsStatus?: string; attributionText?: string | null;
  provenanceNote?: string | null; sourceId?: string | null; captureYear?: number | null;
};
const API = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** Resolve only the exact CMS reference. Never infer a storage URL or a substitute asset. */
export default function PublishedMedia({ id, summary, caption, kind = "image" }: {
  id: string; summary?: MediaSummary; caption?: string; kind?: "image" | "audio";
}) {
  const [asset, setAsset] = useState<MediaAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setAsset(null); setLoading(true); setFailed(false);
    fetch(`${API}/v1/media/${encodeURIComponent(id)}`, { credentials: "include", signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error("Media unavailable"); return response.json(); })
      .then(payload => { if (!controller.signal.aborted) { const value = payload?.data ?? payload; if (value?.id === id) setAsset(value); } })
      .catch(() => { /* Metadata/reference stays readable when delivery is unavailable. */ })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id]);
  const media = asset ?? summary;
  const permittedRights = ["PUBLIC_DOMAIN", "LICENSED", "PERMISSION_GRANTED", "COMMUNITY_OWNED"].includes(asset?.rightsStatus ?? "");
  const hasProvenance = !!(asset?.provenanceNote || asset?.sourceId);
  const publicUrl = asset?.url && /^https?:\/\//i.test(asset.url) ? asset.url : null;
  const available = !failed && asset?.status === "READY" && asset.accessPolicy === "PUBLIC" && permittedRights && hasProvenance && publicUrl;
  const isImage = !!asset?.mimeType?.startsWith("image/") && ["PHOTO", "ARCHIVAL_PHOTO", "DOCUMENT_SCAN", "MAP", "ILLUSTRATION", "RECONSTRUCTION"].includes(asset.type);
  const isAudio = asset?.type === "AUDIO" && asset.mimeType?.startsWith("audio/");
  const label = caption ?? asset?.caption ?? asset?.title;
  return <figure className="published-media">
    {available && kind === "image" && isImage ? <img src={publicUrl!} alt={asset?.altText ?? label ?? "Media chưa có mô tả thay thế."} onError={() => setFailed(true)} />
      : available && kind === "audio" && isAudio ? <audio controls preload="none" src={publicUrl!} aria-label={label ?? "Âm thanh câu chuyện"} onError={() => setFailed(true)} />
      : <p className="published-media-fallback" role="status">{loading ? "Đang tải media…" : "Media chưa khả dụng hoặc chưa đủ thông tin quyền sử dụng / nguồn gốc để hiển thị."}</p>}
    <figcaption>
      {label && <p>{label}</p>}
      {media && <div className="published-media-disclosure"><strong>{media.type}</strong>{media.isHistorical && <span>Historical media</span>}{media.isAiGenerated && <span>AI / Reconstruction{media.aiDisclosure ? `: ${media.aiDisclosure}` : ""}</span>}{!media.isAiGenerated && media.aiDisclosure && <span>{media.aiDisclosure}</span>}{media.type === "RECONSTRUCTION" && !media.isAiGenerated && <span>Tái dựng — không phải ảnh tư liệu.</span>}</div>}
      {asset && <div className="published-media-provenance">
        {asset.attributionText && <p>{asset.attributionText}</p>}
        {asset.creatorName && <p>Tác giả: {asset.creatorName}</p>}
        {asset.rightsHolder && <p>Chủ thể quyền: {asset.rightsHolder}</p>}
        <p>Quyền sử dụng: {asset.license ?? asset.rightsStatus ?? "Chưa được cung cấp"}</p>
        <p>Nguồn gốc: {asset.provenanceNote ?? "Chưa có mô tả nguồn gốc."}</p>
        {asset.captureYear != null && <p>Năm ghi nhận: {asset.captureYear}</p>}
      </div>}
      {media?.isAiGenerated && <p>Nội dung AI không phải bằng chứng tư liệu.</p>}
      {kind === "audio" && available && <p>Chưa có bản chép lời đi kèm.</p>}
    </figcaption>
  </figure>;
}
