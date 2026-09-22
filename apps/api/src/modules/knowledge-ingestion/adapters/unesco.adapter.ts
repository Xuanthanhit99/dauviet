import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { OutboundHttpService } from '../outbound-http.service';
import { FetchedRecord, IngestionAdapter, NormalizedCandidate } from './adapter.types';

/**
 * Live adapter for UNESCO (spec section 8; policy research:
 * G06_5_SOURCE_POLICY_RESEARCH.md section 3). Uses the OFFICIAL
 * data.unesco.org DataHub Explore API v2.1 (`whc001` World Heritage List
 * dataset, CC BY-SA 4.0, keyless) - deliberately NOT the separate
 * whc.unesco.org XML syndication transport, which requires a paid license
 * this project does not have and was never called.
 *
 * The dataset has no Vietnamese-language field at all (confirmed live) -
 * this is exactly why VI canonical editorial text is never overwritten by
 * an external source (spec section 28): there is nothing to overwrite it
 * WITH here, only EN/FR/ES/RU/AR/ZH labels a reviewer may use as translation
 * candidates.
 */

interface UnescoRecord {
  id_no: string;
  uuid: string;
  name_en?: string;
  name_fr?: string;
  short_description_en?: string;
  description_en?: string;
  date_inscribed?: number;
  category?: string;
  states_names?: string;
  iso_codes?: string;
  coordinates?: { lat: number; lon: number };
  area_hectares?: number;
  main_image_url?: string;
  main_image_author?: string;
  main_image_copyright?: string;
}

@Injectable()
export class UnescoAdapter implements IngestionAdapter {
  readonly sourceCode = 'UNESCO';
  readonly adapterVersion = '1.0.0';
  readonly normalizationVersion = 1;

  constructor(private readonly http: OutboundHttpService) {}

  /** `ids` are UNESCO World Heritage `id_no` site numbers, e.g. "948" (Hoi An). Bounded IN-list query, never an unfiltered dump. */
  async fetchByIds(ids: string[]): Promise<FetchedRecord[]> {
    if (ids.length === 0) return [];
    if (ids.length > 100) {
      throw new Error('UNESCO id_no lookup is bounded to 100 ids per call - split into multiple jobs.');
    }
    return this.fetchByWhereClause(`id_no in (${ids.map((id) => `"${id}"`).join(',')})`, ids.length);
  }

  /** Bounded COUNTRY-scoped fetch (spec section 18's COUNTRY scope) - still capped by `limit`, never an unfiltered global dump. */
  async fetchByCountryIso(isoCode: string, limit = 50): Promise<FetchedRecord[]> {
    return this.fetchByWhereClause(`iso_codes like "${isoCode.toLowerCase()}"`, limit);
  }

  private async fetchByWhereClause(where: string, limit: number): Promise<FetchedRecord[]> {
    const url = new URL('https://data.unesco.org/api/explore/v2.1/catalog/datasets/whc001/records');
    url.searchParams.set('where', where);
    url.searchParams.set('limit', String(limit));

    const retrievedAt = new Date();
    const json = await this.http.getJson<{ total_count: number; results: UnescoRecord[] }>(url.toString());

    return (json.results ?? []).map((rec) => {
      const rawPayload = rec as unknown as Record<string, unknown>;
      const payloadHash = createHash('sha256').update(JSON.stringify(rawPayload)).digest('hex');
      return { externalId: rec.id_no, retrievedAt, rawPayload, payloadHash };
    });
  }

  normalize(record: FetchedRecord): NormalizedCandidate[] {
    const rec = record.rawPayload as unknown as UnescoRecord;

    const candidate: NormalizedCandidate = {
      candidateType: 'PLACE',
      normalizedData: {
        // No 'vi' key - UNESCO DataHub has no Vietnamese field (verified
        // live). English/French are candidate translations only, never
        // auto-promoted over existing VI canonical text (spec section 28).
        labels: { en: rec.name_en, ...(rec.name_fr ? {} : {}) },
        aliases: {},
        description: rec.short_description_en ?? rec.description_en,
        coordinates: rec.coordinates ? { lat: rec.coordinates.lat, lng: rec.coordinates.lon } : undefined,
        countryCode: rec.iso_codes?.split(',')[0]?.trim().toUpperCase(),
        externalIdentifiers: { unescoIdNo: rec.id_no, unescoUuid: rec.uuid },
        media: rec.main_image_url
          ? [{ url: rec.main_image_url, attributionText: [rec.main_image_author, rec.main_image_copyright].filter(Boolean).join(' / ') }]
          : undefined,
      },
      evidence: {
        externalRecordId: rec.id_no,
        sourceUrl: `https://whc.unesco.org/en/list/${rec.id_no}`,
        retrievedAt: record.retrievedAt,
        licenseCode: 'CC-BY-SA-4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
        attributionText: 'UNESCO World Heritage List',
      },
    };
    return [candidate];
  }
}
