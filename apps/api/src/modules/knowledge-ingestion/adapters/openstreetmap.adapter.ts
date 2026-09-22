import { Injectable } from '@nestjs/common';
import { FetchedRecord, IngestionAdapter, NormalizedCandidate } from './adapter.types';

/**
 * PERMANENTLY DISABLED contract-only adapter (spec sections 10/96 - binding,
 * not merely a default). The public Nominatim usage policy
 * (https://operations.osmfoundation.org/policies/nominatim/) caps general
 * use at 1 request/second, explicitly PROHIBITS "systematic queries" and
 * auto-complete, and requires single-threaded/single-machine bulk use with
 * local caching - structurally incompatible with a queued, distributed,
 * bounded-job ingestion worker. `fetchByIds` therefore NEVER issues a live
 * HTTP request to nominatim.openstreetmap.org or any other OSM endpoint -
 * it throws immediately, every time, regardless of configuration. See
 * `openstreetmap.adapter.spec.ts` for the regression test proving this
 * (spec section 96's "no bulk-ingestion worker calls public Nominatim
 * systematically" repository-search proof).
 *
 * A future phase may introduce an approved bounded mechanism (an OSM
 * extract/import, or self-hosted Nominatim) without a schema change - this
 * class exists so that future adapter can satisfy the same `IngestionAdapter`
 * contract without redesigning the ingestion pipeline around it.
 */
@Injectable()
export class OpenStreetMapAdapter implements IngestionAdapter {
  readonly sourceCode = 'OPENSTREETMAP';
  readonly adapterVersion = '1.0.0';
  readonly normalizationVersion = 1;

  async fetchByIds(_ids: string[]): Promise<FetchedRecord[]> {
    throw new Error(
      'OpenStreetMap/Nominatim live ingestion is permanently disabled in this codebase - public Nominatim usage policy ' +
        'prohibits the bulk/systematic use this pipeline would otherwise require. See ' +
        'docs/backend/G06_5_SOURCE_POLICY_RESEARCH.md section 5.',
    );
  }

  normalize(_record: FetchedRecord): NormalizedCandidate[] {
    return [];
  }
}
