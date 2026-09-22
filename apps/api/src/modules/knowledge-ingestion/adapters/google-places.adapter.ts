import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { OutboundHttpService } from '../outbound-http.service';
import { AppConfig } from '../../../config/configuration';
import { FetchedRecord, IngestionAdapter, NormalizedCandidate } from './adapter.types';

/**
 * Contract-implemented, disabled-by-default adapter (spec section 11/12/47;
 * policy research: G06_5_SOURCE_POLICY_RESEARCH.md section 6). Requires a
 * real `GOOGLE_PLACES_API_KEY` - never a fake credential (spec section 51).
 *
 * Deliberate content restriction, not an oversight: Google's own policy
 * quote - "You must not pre-fetch, cache, or store Places API content
 * beyond the allowed exceptions" and "You cannot create alternate maps or
 * databases from Places API content" - means `normalize()` below persists
 * ONLY the Place ID (exempt from caching restrictions, storable
 * indefinitely) and coordinates (temporarily cacheable up to 30 days per
 * the Maps Platform Service Specific Terms - enforced via
 * `IngestionSourcePolicy.retentionDays`). Display name, formatted address,
 * ratings, reviews, phone numbers, and photos are deliberately NEVER
 * written into `normalizedData` here - a reviewer previewing a Google
 * Places candidate must do so via a live, uncached call at review time
 * (a future, narrower endpoint - out of scope for this normalize() step),
 * never from a stored copy. `IngestionSourcePolicy.rawPayloadStorage` for
 * this source is seeded PROHIBITED - the runner never writes
 * `IngestionRecord.rawPayload` for Google Places at all.
 */
@Injectable()
export class GooglePlacesAdapter implements IngestionAdapter {
  readonly sourceCode = 'GOOGLE_PLACES';
  readonly adapterVersion = '1.0.0';
  readonly normalizationVersion = 1;

  constructor(
    private readonly http: OutboundHttpService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /** `ids` are Google Place IDs. */
  async fetchByIds(ids: string[]): Promise<FetchedRecord[]> {
    const apiKey = this.config.get('ingestion', { infer: true }).googlePlacesApiKey;
    if (!apiKey) {
      throw new Error('GOOGLE_PLACES_API_KEY is not configured - Google Places adapter is disabled (spec section 51/52).');
    }
    const retrievedAt = new Date();
    const records: FetchedRecord[] = [];
    for (const placeId of ids) {
      const result = await this.http.get(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
        headers: {
          'X-Goog-Api-Key': apiKey,
          // Minimal field mask - never request more than this adapter is
          // allowed to persist (spec section 11).
          'X-Goog-FieldMask': 'id,location',
        },
      });
      const json = JSON.parse(result.body) as Record<string, unknown>;
      const payloadHash = createHash('sha256').update(JSON.stringify(json)).digest('hex');
      records.push({ externalId: placeId, retrievedAt, rawPayload: json, payloadHash });
    }
    return records;
  }

  normalize(record: FetchedRecord): NormalizedCandidate[] {
    const rec = record.rawPayload as Record<string, any>;
    const placeId = (rec.id as string) ?? record.externalId;
    const location = rec.location as { latitude?: number; longitude?: number } | undefined;

    const candidate: NormalizedCandidate = {
      candidateType: 'PLACE',
      normalizedData: {
        // Deliberately empty - see class doc comment. Coordinates only,
        // never displayName/formattedAddress/rating/photos.
        labels: {},
        aliases: {},
        coordinates: location?.latitude != null && location?.longitude != null ? { lat: location.latitude, lng: location.longitude } : undefined,
        externalIdentifiers: { googlePlaceId: placeId },
      },
      evidence: {
        externalRecordId: placeId,
        retrievedAt: record.retrievedAt,
        attributionText: 'Google',
      },
    };
    return [candidate];
  }
}
