import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { OutboundHttpService } from '../outbound-http.service';
import { AppConfig } from '../../../config/configuration';
import { FetchedRecord, IngestionAdapter, NormalizedCandidate } from './adapter.types';

/**
 * Contract-implemented, disabled-by-default adapter (spec section 9; policy
 * research: G06_5_SOURCE_POLICY_RESEARCH.md section 4). Real, working
 * implementation against the GeoNames web service - but `IngestionSource
 * Policy.authRequired` gates it off unless the operator supplies a real
 * `GEONAMES_USERNAME` (never a fake credential against a real service -
 * spec section 51). `IngestionPolicyService.check('GEONAMES', 'fetch')`
 * must be called by the runner before this adapter is ever invoked.
 */
@Injectable()
export class GeonamesAdapter implements IngestionAdapter {
  readonly sourceCode = 'GEONAMES';
  readonly adapterVersion = '1.0.0';
  readonly normalizationVersion = 1;

  constructor(
    private readonly http: OutboundHttpService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /** `ids` are GeoNames numeric geonameIds as strings. */
  async fetchByIds(ids: string[]): Promise<FetchedRecord[]> {
    const username = this.config.get('ingestion', { infer: true }).geonamesUsername;
    if (!username) {
      throw new Error('GEONAMES_USERNAME is not configured - GeoNames adapter is disabled (spec section 51: never a fake credential).');
    }
    const retrievedAt = new Date();
    const records: FetchedRecord[] = [];
    // GeoNames' get/hierarchy endpoints are single-id, not batched - bounded
    // by the caller's explicit id list (spec section 6/18), never a crawl.
    for (const id of ids) {
      const url = new URL('https://api.geonames.org/getJSON');
      url.searchParams.set('geonameId', id);
      url.searchParams.set('username', username);
      const json = await this.http.getJson<Record<string, unknown>>(url.toString());
      const payloadHash = createHash('sha256').update(JSON.stringify(json)).digest('hex');
      records.push({ externalId: id, retrievedAt, rawPayload: json, payloadHash });
    }
    return records;
  }

  normalize(record: FetchedRecord): NormalizedCandidate[] {
    const rec = record.rawPayload as Record<string, any>;
    if (!rec.geonameId) return [];
    const candidate: NormalizedCandidate = {
      candidateType: rec.fcode === 'PCLI' ? 'COUNTRY' : 'CITY',
      normalizedData: {
        labels: { en: rec.name },
        aliases: {},
        coordinates: rec.lat && rec.lng ? { lat: Number(rec.lat), lng: Number(rec.lng) } : undefined,
        countryCode: rec.countryCode,
        externalIdentifiers: { geonameId: String(rec.geonameId) },
      },
      evidence: {
        externalRecordId: String(rec.geonameId),
        sourceUrl: `https://www.geonames.org/${rec.geonameId}`,
        retrievedAt: record.retrievedAt,
        licenseCode: 'CC-BY-4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
        attributionText: 'GeoNames',
      },
    };
    return [candidate];
  }
}
