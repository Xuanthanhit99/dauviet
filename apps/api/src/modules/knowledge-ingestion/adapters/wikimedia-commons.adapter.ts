import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { OutboundHttpService } from '../outbound-http.service';
import { FetchedRecord, IngestionAdapter, NormalizedCandidate } from './adapter.types';

/**
 * Live adapter for Wikimedia Commons (spec section 7; policy research:
 * G06_5_SOURCE_POLICY_RESEARCH.md section 2). Metadata-only - never
 * downloads/stores the binary media file itself; that only happens through
 * the existing MediaAsset/S3 pipeline after a human review approves
 * promotion (spec section 32). Per-file license/attribution is read from
 * each file's own `imageinfo.extmetadata` - never assumed at the source
 * level, since Commons files carry different licenses file by file.
 */

interface CommonsImageInfo {
  url: string;
  user: string;
  size?: number;
  width?: number;
  height?: number;
  mime?: string;
  sha1?: string;
  extmetadata?: Record<string, { value: string }>;
}

interface CommonsPage {
  title: string;
  imageinfo?: CommonsImageInfo[];
}

@Injectable()
export class WikimediaCommonsAdapter implements IngestionAdapter {
  readonly sourceCode = 'WIKIMEDIA_COMMONS';
  readonly adapterVersion = '1.0.0';
  readonly normalizationVersion = 1;

  constructor(private readonly http: OutboundHttpService) {}

  /** `ids` are Commons file titles, e.g. "File:Hanoi Old Quarter 2019.jpg" - never a bare search term (spec section 7 - never random-match images to destinations). */
  async fetchByIds(ids: string[]): Promise<FetchedRecord[]> {
    if (ids.length === 0) return [];
    if (ids.length > 50) {
      throw new Error('Commons imageinfo lookup is bounded to 50 titles per call - split into multiple jobs.');
    }
    const url = new URL('https://commons.wikimedia.org/w/api.php');
    url.searchParams.set('action', 'query');
    url.searchParams.set('titles', ids.join('|'));
    url.searchParams.set('prop', 'imageinfo');
    url.searchParams.set('iiprop', 'url|user|extmetadata|size|mime|sha1');
    url.searchParams.set('format', 'json');

    const retrievedAt = new Date();
    const json = await this.http.getJson<{ query: { pages: Record<string, CommonsPage> } }>(url.toString());

    return Object.values(json.query?.pages ?? {})
      .filter((page) => page.imageinfo?.length)
      .map((page) => {
        const rawPayload = page as unknown as Record<string, unknown>;
        const payloadHash = createHash('sha256').update(JSON.stringify(rawPayload)).digest('hex');
        return { externalId: page.title, retrievedAt, rawPayload, payloadHash };
      });
  }

  normalize(record: FetchedRecord): NormalizedCandidate[] {
    const page = record.rawPayload as unknown as CommonsPage;
    const info = page.imageinfo?.[0];
    if (!info) return [];

    const meta = info.extmetadata ?? {};
    const licenseCode = meta.LicenseShortName?.value ?? meta.License?.value;
    const licenseUrl = meta.LicenseUrl?.value;
    // Attribution is always read from THIS file's own metadata - never a
    // blanket source-level string (spec section 7/55).
    const artist = meta.Artist?.value?.replace(/<[^>]+>/g, '').trim();
    const credit = meta.Credit?.value?.replace(/<[^>]+>/g, '').trim();
    const attributionText = artist || credit || info.user;

    const candidate: NormalizedCandidate = {
      candidateType: 'MEDIA',
      normalizedData: {
        labels: {},
        aliases: {},
        description: meta.ImageDescription?.value?.replace(/<[^>]+>/g, '').trim(),
        externalIdentifiers: { commonsTitle: page.title, sha1: info.sha1 ?? '' },
        media: [{ url: info.url, license: licenseCode, attributionText }],
      },
      evidence: {
        externalRecordId: page.title,
        sourceUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`,
        retrievedAt: record.retrievedAt,
        licenseCode,
        licenseUrl,
        attributionText,
      },
    };
    return [candidate];
  }
}
