import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { IngestionCandidateType } from '@prisma/client';
import { OutboundHttpService } from '../outbound-http.service';
import { FetchedRecord, IngestionAdapter, NormalizedCandidate } from './adapter.types';

/**
 * Live adapter for Wikidata (spec section 6; policy research: docs/backend/
 * G06_5_SOURCE_POLICY_RESEARCH.md section 1 - CC0, keyless, User-Agent
 * policy enforced by OutboundHttpService). Uses the MediaWiki Action API's
 * `wbgetentities` action for a bounded, explicit set of QIDs - never
 * SPARQL, never an unbounded crawl (spec section 6's "no uncontrolled
 * broad SPARQL crawling").
 */

// A small, deliberately bounded classification table for this phase's VN/JP
// pilot scope (spec section 48/49) - not a general-purpose Wikidata
// ontology mapper. Extend only with genuinely-needed QIDs, never
// speculatively.
const INSTANCE_OF_CANDIDATE_TYPE: Record<string, IngestionCandidateType> = {
  Q6256: 'COUNTRY', // country
  Q515: 'CITY', // city
  Q1549591: 'CITY', // big city
  Q5: 'PERSON', // human
  Q1656682: 'EVENT', // event
  Q198: 'EVENT', // war
  Q2221906: 'PLACE', // geographic location
  Q839954: 'PLACE', // archaeological site
  Q9259: 'PLACE', // UNESCO World Heritage Site (also carries P31 in some items)
};

function classify(instanceOfQids: string[]): IngestionCandidateType {
  for (const qid of instanceOfQids) {
    const mapped = INSTANCE_OF_CANDIDATE_TYPE[qid];
    if (mapped) return mapped;
  }
  return 'PLACE'; // conservative default - never HISTORICAL_FACT/MEDIA from a Wikidata entity alone
}

interface WikidataEntity {
  id: string;
  labels?: Record<string, { value: string }>;
  aliases?: Record<string, { value: string }[]>;
  descriptions?: Record<string, { value: string }>;
  claims?: Record<string, { mainsnak: { datavalue?: { value: any } } }[]>;
}

@Injectable()
export class WikidataAdapter implements IngestionAdapter {
  readonly sourceCode = 'WIKIDATA';
  readonly adapterVersion = '1.0.0';
  readonly normalizationVersion = 1;

  constructor(private readonly http: OutboundHttpService) {}

  async fetchByIds(ids: string[]): Promise<FetchedRecord[]> {
    if (ids.length === 0) return [];
    if (ids.length > 50) {
      throw new Error('Wikidata wbgetentities is bounded to 50 ids per call - split into multiple jobs.');
    }
    const url = new URL('https://www.wikidata.org/w/api.php');
    url.searchParams.set('action', 'wbgetentities');
    url.searchParams.set('ids', ids.join('|'));
    url.searchParams.set('languages', 'vi|en|ja');
    url.searchParams.set('format', 'json');

    const retrievedAt = new Date();
    const json = await this.http.getJson<{ entities: Record<string, WikidataEntity> }>(url.toString());

    return Object.values(json.entities ?? {}).map((entity) => {
      const rawPayload = entity as unknown as Record<string, unknown>;
      const payloadHash = createHash('sha256').update(JSON.stringify(rawPayload)).digest('hex');
      return { externalId: entity.id, retrievedAt, rawPayload, payloadHash };
    });
  }

  normalize(record: FetchedRecord): NormalizedCandidate[] {
    const entity = record.rawPayload as unknown as WikidataEntity;

    const labels: NormalizedCandidate['normalizedData']['labels'] = {};
    for (const lang of ['vi', 'en', 'ja'] as const) {
      const label = entity.labels?.[lang]?.value;
      if (label) labels[lang] = label;
    }

    const aliases: NormalizedCandidate['normalizedData']['aliases'] = {};
    for (const lang of ['vi', 'en', 'ja'] as const) {
      const values = entity.aliases?.[lang]?.map((a) => a.value);
      if (values?.length) aliases[lang] = values;
    }

    const description = entity.descriptions?.en?.value ?? entity.descriptions?.vi?.value;

    const coordClaim = entity.claims?.P625?.[0]?.mainsnak.datavalue?.value;
    const coordinates = coordClaim ? { lat: coordClaim.latitude, lng: coordClaim.longitude } : undefined;

    const instanceOf = (entity.claims?.P31 ?? [])
      .map((c) => c.mainsnak.datavalue?.value?.id as string | undefined)
      .filter((v): v is string => Boolean(v));

    const countryClaim = entity.claims?.P17?.[0]?.mainsnak.datavalue?.value?.id as string | undefined;

    const candidate: NormalizedCandidate = {
      candidateType: classify(instanceOf),
      normalizedData: {
        labels,
        aliases,
        description,
        coordinates,
        instanceOf,
        externalIdentifiers: { wikidataQid: entity.id, ...(countryClaim ? { wikidataCountryQid: countryClaim } : {}) },
      },
      evidence: {
        externalRecordId: entity.id,
        sourceUrl: `https://www.wikidata.org/wiki/${entity.id}`,
        retrievedAt: record.retrievedAt,
        licenseCode: 'CC0',
        licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
        attributionText: 'Data from Wikidata',
      },
    };
    return [candidate];
  }
}
