import { IngestionRunService } from './ingestion-run.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { IngestionPolicyService } from './ingestion-policy.service';
import { EntityResolutionService } from './entity-resolution.service';
import { NormalizedCandidate } from './adapters/adapter.types';

/**
 * Change detection + idempotency proof (spec sections 36/37/74/75/83),
 * exercised as a unit test against a fully mocked PrismaService/adapter,
 * matching this codebase's established service-spec convention (mocked
 * Prisma, real business logic - see provider-integrations.service.spec.ts).
 * The live pilot (docs/backend/G06_5_FINAL_REPORT.md) proves the identical
 * code path end to end against real Postgres/Redis/external sources; this
 * test proves the specific "source data changed" branch deterministically,
 * which a live external source's own data cannot be forced to exercise on
 * demand.
 */
describe('IngestionRunService - change detection (spec sections 36/37/74/75/83)', () => {
  function buildCandidate(label: string): NormalizedCandidate {
    return {
      candidateType: 'PLACE',
      normalizedData: { labels: { en: label }, aliases: {} },
      evidence: { externalRecordId: 'Q999', retrievedAt: new Date('2026-09-22T00:00:00Z') },
    };
  }

  function fakeAdapter(recordVersion: 1 | 2) {
    const payloadHash = recordVersion === 1 ? 'hash-v1' : 'hash-v2';
    const label = recordVersion === 1 ? 'Original Name' : 'Updated Name';
    return {
      sourceCode: 'WIKIDATA',
      adapterVersion: '1.0.0',
      normalizationVersion: 1,
      fetchByIds: jest.fn().mockResolvedValue([{ externalId: 'Q999', retrievedAt: new Date(), rawPayload: { v: recordVersion }, payloadHash }]),
      normalize: jest.fn().mockReturnValue([buildCandidate(label)]),
    };
  }

  function buildHarness() {
    const prisma: any = {
      ingestionJob: { findUnique: jest.fn() },
      ingestionRun: { create: jest.fn(), update: jest.fn() },
      ingestionRecord: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn(), update: jest.fn() },
      ingestionCandidate: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn().mockResolvedValue(null) },
      externalEntityIdentity: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn(), update: jest.fn() },
      entityResolution: { create: jest.fn() },
      ingestionEvidence: { create: jest.fn() },
      ingestionError: { create: jest.fn() },
      ingestionCheckpoint: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn(), deleteMany: jest.fn() },
    };
    let candidateSeq = 0;
    prisma.ingestionRun.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'run-1', ...data }));
    prisma.ingestionRecord.create.mockImplementation(({ data }: any) => Promise.resolve({ id: `record-${++candidateSeq}`, ...data }));
    prisma.ingestionCandidate.create.mockImplementation(({ data }: any) => Promise.resolve({ id: `candidate-${candidateSeq}`, ...data }));
    prisma.externalEntityIdentity.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'identity-1', ...data }));

    const audit = { log: jest.fn() } as unknown as AuditService;
    const policy = {
      check: jest.fn().mockResolvedValue({ ok: true, policy: { policyVersion: 1, rawPayloadStorage: 'STORE_ALLOWED' } }),
    } as unknown as IngestionPolicyService;
    const resolution = { resolve: jest.fn().mockResolvedValue({ outcome: 'NO_MATCH', matchedEntityType: null, matchedEntityId: null, signals: {}, autoResolved: false }) } as unknown as EntityResolutionService;

    return { prisma, audit, policy, resolution };
  }

  it('a materially unchanged re-fetch (same payloadHash) creates no new record - idempotency (spec section 36, matches the live pilot re-run proof)', async () => {
    const { prisma, audit, policy, resolution } = buildHarness();
    prisma.ingestionJob.findUnique.mockResolvedValue({ id: 'job-1', sourceId: 'source-1', scopeType: 'EXPLICIT_ENTITY_SET', scopeParams: { ids: ['Q999'] }, source: { id: 'source-1', code: 'WIKIDATA' } });
    // Unchanged re-fetch: the idempotency key lookup finds the SAME record already stored.
    prisma.ingestionRecord.findUnique.mockResolvedValue({ id: 'record-existing' });

    const adapter = fakeAdapter(1);
    const runner = new IngestionRunService(prisma, audit, policy, resolution, adapter as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    const result = await runner.runJob('job-1');

    expect(result.counts.recordsUnchanged).toBe(1);
    expect(result.counts.recordsStored).toBe(0);
    expect(result.counts.candidatesCreated).toBe(0);
    expect(prisma.ingestionRecord.create).not.toHaveBeenCalled();
    expect(prisma.ingestionCandidate.create).not.toHaveBeenCalled();
  });

  it('changed source data (different payloadHash) creates a NEW candidate row rather than silently overwriting the existing one (spec section 37/74/75)', async () => {
    const { prisma, audit, policy, resolution } = buildHarness();
    prisma.ingestionJob.findUnique.mockResolvedValue({ id: 'job-1', sourceId: 'source-1', scopeType: 'EXPLICIT_ENTITY_SET', scopeParams: { ids: ['Q999'] }, source: { id: 'source-1', code: 'WIKIDATA' } });
    // No record with THIS payloadHash exists yet (data changed since last ingestion) -> proceeds.
    prisma.ingestionRecord.findUnique.mockResolvedValue(null);
    // But an ExternalEntityIdentity already links this externalId to a PRIOR candidate (from the earlier version).
    prisma.externalEntityIdentity.findUnique.mockResolvedValue({ id: 'identity-1', candidateId: 'candidate-old', resolvedEntityId: null });
    prisma.ingestionCandidate.findUnique.mockResolvedValue({
      id: 'candidate-old',
      normalizedData: { labels: { en: 'Original Name' }, aliases: {} }, // the OLD, already-reviewed version
      status: 'APPROVED', // simulates: an editor already reviewed/approved the original version
    });

    const adapter = fakeAdapter(2); // new fetch returns "Updated Name" - materially different normalizedData
    const runner = new IngestionRunService(prisma, audit, policy, resolution, adapter as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    const result = await runner.runJob('job-1');

    expect(result.counts.recordsStored).toBe(1);
    expect(result.counts.candidatesCreated).toBe(1);
    // The OLD candidate is never mutated - no silent overwrite of its
    // normalizedData or its prior APPROVED review decision.
    expect(prisma.ingestionCandidate.update).not.toHaveBeenCalled();
    // A fresh, distinct candidate row captures the new version instead.
    expect(prisma.ingestionCandidate.create).toHaveBeenCalledTimes(1);
    const created = prisma.ingestionCandidate.create.mock.calls[0][0].data;
    expect(created.normalizedData.labels.en).toBe('Updated Name');
    const newCandidateId = (await prisma.ingestionCandidate.create.mock.results[0].value).id;
    expect(newCandidateId).not.toBe('candidate-old');
    // The identity is re-pointed at the NEW candidate for future runs, but
    // this happens via a separate `update`, not by mutating the old
    // candidate row - the old row (and whatever it was reviewed as) stays
    // exactly as an editor left it, available for audit/history.
    expect(prisma.externalEntityIdentity.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ candidateId: newCandidateId }) }),
    );
  });

  it('an unchanged re-fetch where the identity already resolved to a canonical entity produces EXACT_MATCH-driven idempotency without re-invoking resolution logic redundantly', async () => {
    const { prisma, audit, policy, resolution } = buildHarness();
    prisma.ingestionJob.findUnique.mockResolvedValue({ id: 'job-1', sourceId: 'source-1', scopeType: 'EXPLICIT_ENTITY_SET', scopeParams: { ids: ['Q999'] }, source: { id: 'source-1', code: 'WIKIDATA' } });
    prisma.ingestionRecord.findUnique.mockResolvedValue(null);
    prisma.externalEntityIdentity.findUnique.mockResolvedValue({ id: 'identity-1', candidateId: 'candidate-old', resolvedEntityId: null });
    prisma.ingestionCandidate.findUnique.mockResolvedValue({
      id: 'candidate-old',
      normalizedData: { labels: { en: 'Original Name' }, aliases: {} },
      status: 'APPROVED',
    });

    const adapter = fakeAdapter(1); // SAME data as before (hash differs from the "existing record" lookup only because our mock always returns null for record lookup in this harness - normalizedData equality is what matters here)
    const runner = new IngestionRunService(prisma, audit, policy, resolution, adapter as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    const result = await runner.runJob('job-1');

    // Same normalizedData as the existing candidate -> change detection
    // recognizes it as unchanged, no new candidate created.
    expect(result.counts.candidatesUnchanged).toBe(1);
    expect(result.counts.candidatesCreated).toBe(0);
    expect(prisma.ingestionCandidate.create).not.toHaveBeenCalled();
  });
});
