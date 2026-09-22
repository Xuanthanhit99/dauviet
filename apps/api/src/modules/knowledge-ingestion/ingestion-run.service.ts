import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { EntityKind, IngestionCandidateStatus, IngestionRunStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { IngestionPolicyService } from './ingestion-policy.service';
import { EntityResolutionService } from './entity-resolution.service';
import { WikidataAdapter } from './adapters/wikidata.adapter';
import { WikimediaCommonsAdapter } from './adapters/wikimedia-commons.adapter';
import { UnescoAdapter } from './adapters/unesco.adapter';
import { GeonamesAdapter } from './adapters/geonames.adapter';
import { OpenStreetMapAdapter } from './adapters/openstreetmap.adapter';
import { GooglePlacesAdapter } from './adapters/google-places.adapter';
import { IngestionAdapter, NormalizedCandidate } from './adapters/adapter.types';

export interface RunCounts {
  fetched: number;
  recordsStored: number;
  recordsUnchanged: number;
  candidatesCreated: number;
  candidatesUnchanged: number;
  matched: number;
  errors: number;
}

/**
 * Orchestrates one bounded IngestionRun end to end (spec sections 6/19-27/
 * 36/37): policy gate -> adapter fetch -> idempotent record storage ->
 * normalize -> idempotent candidate upsert -> evidence -> external identity
 * -> entity resolution. Every mutating step is wrapped so a transient
 * per-record failure is classified into `IngestionError` and does not abort
 * the whole run (spec section 41/43 - PARTIAL is a real, distinct outcome
 * from FAILED).
 */
@Injectable()
export class IngestionRunService {
  private readonly logger = new Logger(IngestionRunService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly policy: IngestionPolicyService,
    private readonly resolution: EntityResolutionService,
    private readonly wikidata: WikidataAdapter,
    private readonly commons: WikimediaCommonsAdapter,
    private readonly unesco: UnescoAdapter,
    private readonly geonames: GeonamesAdapter,
    private readonly osm: OpenStreetMapAdapter,
    private readonly google: GooglePlacesAdapter,
  ) {}

  private adapterFor(sourceCode: string): IngestionAdapter {
    switch (sourceCode) {
      case 'WIKIDATA':
        return this.wikidata;
      case 'WIKIMEDIA_COMMONS':
        return this.commons;
      case 'UNESCO':
        return this.unesco;
      case 'GEONAMES':
        return this.geonames;
      case 'OPENSTREETMAP':
        return this.osm;
      case 'GOOGLE_PLACES':
        return this.google;
      default:
        throw new Error(`No adapter registered for source ${sourceCode}`);
    }
  }

  async runJob(jobId: string, triggeredById?: string): Promise<{ runId: string; status: IngestionRunStatus; counts: RunCounts }> {
    const job = await this.prisma.ingestionJob.findUnique({ where: { id: jobId }, include: { source: true } });
    if (!job) throw new Error(`Ingestion job ${jobId} not found.`);

    const access = await this.policy.check(job.source.code, 'fetch');
    const adapter = this.adapterFor(job.source.code);

    const run = await this.prisma.ingestionRun.create({
      data: {
        jobId: job.id,
        sourceId: job.sourceId,
        status: IngestionRunStatus.RUNNING,
        trigger: 'MANUAL',
        startedAt: new Date(),
        adapterVersion: adapter.adapterVersion,
        policyVersion: access.policy?.policyVersion ?? 0,
        counts: {},
        createdById: triggeredById,
      },
    });
    await this.audit.log({ actorId: triggeredById, action: 'ingestionRun.started', entityType: EntityKind.INGESTION_RUN, entityId: run.id });

    const counts: RunCounts = { fetched: 0, recordsStored: 0, recordsUnchanged: 0, candidatesCreated: 0, candidatesUnchanged: 0, matched: 0, errors: 0 };

    if (!access.ok) {
      await this.recordError(run.id, null, null, 'POLICY_REJECTED', access.message ?? 'Policy check failed');
      counts.errors++;
      return this.finalize(run.id, IngestionRunStatus.FAILED, counts, job.id);
    }

    const ids = this.resolveScopeIds(job.scopeType, job.scopeParams as any);
    let fetchedRecords;
    try {
      fetchedRecords =
        job.source.code === 'UNESCO' && (job.scopeParams as any)?.countryIso
          ? await this.unesco.fetchByCountryIso((job.scopeParams as any).countryIso, (job.scopeParams as any).limit ?? 50)
          : await adapter.fetchByIds(ids);
    } catch (err) {
      await this.recordError(run.id, null, null, 'TRANSIENT', (err as Error).message);
      counts.errors++;
      return this.finalize(run.id, IngestionRunStatus.FAILED, counts, job.id);
    }
    counts.fetched = fetchedRecords.length;

    const storeRawAccess = await this.policy.check(job.source.code, 'storeRaw');
    const storeNormalizedAccess = await this.policy.check(job.source.code, 'storeNormalized');

    // Resumability (spec section 42/89): a checkpoint left by a PREVIOUS,
    // never-finalized run of this job (worker crash mid-loop - see
    // `finalize` below, which clears the checkpoint only on a clean
    // terminal outcome) records which external ids were already fully
    // committed. This run skips them rather than restarting the whole
    // bounded job from zero - each is still individually protected by
    // IngestionRecord's idempotency key regardless, but skipping avoids
    // redundant adapter/normalization work for large jobs.
    const existingCheckpoint = await this.prisma.ingestionCheckpoint.findUnique({ where: { jobId: job.id } });
    const alreadyProcessed = new Set<string>((existingCheckpoint?.cursor as any)?.processedExternalIds ?? []);
    const processedThisRun: string[] = [...alreadyProcessed];

    for (const fetched of fetchedRecords) {
      if (alreadyProcessed.has(fetched.externalId)) {
        counts.recordsUnchanged++;
        continue;
      }
      try {
        const existingRecord = await this.prisma.ingestionRecord.findUnique({
          where: { sourceId_externalId_payloadHash: { sourceId: job.sourceId, externalId: fetched.externalId, payloadHash: fetched.payloadHash } },
        });
        if (existingRecord) {
          // Idempotency (spec section 20/36): identical external record
          // already ingested this exact version - no new record, no new
          // candidate work needed for it.
          counts.recordsUnchanged++;
          continue;
        }

        const record = await this.prisma.ingestionRecord.create({
          data: {
            runId: run.id,
            sourceId: job.sourceId,
            externalId: fetched.externalId,
            retrievedAt: fetched.retrievedAt,
            payloadHash: fetched.payloadHash,
            storageClassification: storeRawAccess.policy?.rawPayloadStorage ?? 'PROHIBITED',
            rawPayload: storeRawAccess.ok && storeRawAccess.policy?.rawPayloadStorage !== 'PROHIBITED' ? (fetched.rawPayload as any) : undefined,
            normalizationStatus: 'PENDING',
          },
        });
        counts.recordsStored++;

        const normalized = adapter.normalize(fetched);
        for (const candidate of normalized) {
          const outcome = await this.upsertCandidate({
            sourceId: job.sourceId,
            sourceCode: job.source.code,
            externalId: fetched.externalId,
            recordId: record.id,
            candidate,
            adapterVersion: adapter.adapterVersion,
            normalizationVersion: adapter.normalizationVersion,
            policyVersion: access.policy?.policyVersion ?? 0,
            storeNormalizedAllowed: storeNormalizedAccess.ok,
          });
          if (outcome === 'created') counts.candidatesCreated++;
          else counts.candidatesUnchanged++;
        }

        await this.prisma.ingestionRecord.update({ where: { id: record.id }, data: { normalizationStatus: 'NORMALIZED' } });

        processedThisRun.push(fetched.externalId);
        await this.prisma.ingestionCheckpoint.upsert({
          where: { jobId: job.id },
          create: { jobId: job.id, runId: run.id, cursor: { processedExternalIds: processedThisRun } },
          update: { runId: run.id, cursor: { processedExternalIds: processedThisRun } },
        });
      } catch (err) {
        await this.recordError(run.id, null, fetched.externalId, 'PERMANENT', (err as Error).message);
        counts.errors++;
      }
    }

    const status = counts.errors === 0 ? IngestionRunStatus.SUCCEEDED : counts.recordsStored > 0 ? IngestionRunStatus.PARTIAL : IngestionRunStatus.FAILED;
    return this.finalize(run.id, status, counts, job.id);
  }

  private resolveScopeIds(scopeType: string, scopeParams: { ids?: string[] }): string[] {
    if (scopeType === 'EXPLICIT_ENTITY_SET' || scopeType === 'EXTERNAL_IDS') {
      const ids = scopeParams?.ids;
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('Bounded job requires a non-empty explicit id list (spec section 18 - no accidental unscoped crawl).');
      }
      return ids;
    }
    return scopeParams?.ids ?? [];
  }

  private async upsertCandidate(params: {
    sourceId: string;
    sourceCode: string;
    externalId: string;
    recordId: string;
    candidate: NormalizedCandidate;
    adapterVersion: string;
    normalizationVersion: number;
    policyVersion: number;
    storeNormalizedAllowed: boolean;
  }): Promise<'created' | 'unchanged'> {
    const { sourceId, sourceCode, externalId, recordId, candidate, adapterVersion, normalizationVersion, policyVersion, storeNormalizedAllowed } = params;

    const dataHash = createHash('sha256').update(JSON.stringify(candidate.normalizedData)).digest('hex');

    let identity = await this.prisma.externalEntityIdentity.findUnique({ where: { sourceId_externalId: { sourceId, externalId } } });
    const existingCandidate = identity?.candidateId
      ? await this.prisma.ingestionCandidate.findUnique({ where: { id: identity.candidateId } })
      : null;

    if (existingCandidate) {
      const existingHash = createHash('sha256').update(JSON.stringify(existingCandidate.normalizedData)).digest('hex');
      await this.prisma.externalEntityIdentity.update({ where: { id: identity!.id }, data: { lastSeenAt: new Date(), state: 'ACTIVE' } });
      if (existingHash === dataHash) {
        // Change detection (spec section 36/37): source data has not
        // materially changed - no silent overwrite, nothing new to review.
        return 'unchanged';
      }
      // Changed source data creates fresh evidence + a reviewable diff
      // rather than silently overwriting the existing candidate (spec
      // section 37/74/75) - a new candidate row captures the update so the
      // prior approved/rejected decision on the old version is preserved.
    }

    const resolution = await this.resolution.resolve({ sourceId, externalId, candidate });
    const status: IngestionCandidateStatus = resolution.outcome === 'EXACT_MATCH' ? 'AUTO_MATCHED' : 'NEEDS_REVIEW';

    const created = await this.prisma.ingestionCandidate.create({
      data: {
        recordId,
        sourceId,
        candidateType: candidate.candidateType,
        normalizationVersion,
        normalizedData: storeNormalizedAllowed ? (candidate.normalizedData as any) : {},
        status,
        resolvedEntityType: resolution.matchedEntityType ?? undefined,
        resolvedEntityId: resolution.matchedEntityId ?? undefined,
      },
    });

    await this.prisma.entityResolution.create({
      data: {
        candidateId: created.id,
        outcome: resolution.outcome,
        matchedEntityType: resolution.matchedEntityType ?? undefined,
        matchedEntityId: resolution.matchedEntityId ?? undefined,
        signals: resolution.signals as any,
        autoResolved: resolution.autoResolved,
      },
    });

    await this.prisma.ingestionEvidence.create({
      data: {
        candidateId: created.id,
        sourceId,
        externalRecordId: candidate.evidence.externalRecordId,
        sourceUrl: candidate.evidence.sourceUrl,
        retrievedAt: candidate.evidence.retrievedAt,
        licenseCode: candidate.evidence.licenseCode,
        licenseUrl: candidate.evidence.licenseUrl,
        attributionText: candidate.evidence.attributionText,
        adapterVersion,
        payloadHash: createHash('sha256').update(JSON.stringify(candidate.evidence)).digest('hex'),
        policyVersion,
      },
    });

    if (identity) {
      await this.prisma.externalEntityIdentity.update({
        where: { id: identity.id },
        data: { candidateId: created.id, lastSeenAt: new Date(), state: 'ACTIVE' },
      });
    } else {
      identity = await this.prisma.externalEntityIdentity.create({
        data: {
          sourceId,
          externalId,
          entityType: this.entityKindFor(candidate.candidateType),
          candidateId: created.id,
        },
      });
    }

    await this.audit.log({
      action: 'ingestionCandidate.created',
      entityType: EntityKind.INGESTION_CANDIDATE,
      entityId: created.id,
      metadata: { sourceCode, externalId, resolutionOutcome: resolution.outcome },
    });

    return 'created';
  }

  private entityKindFor(candidateType: string): EntityKind {
    const map: Record<string, EntityKind> = {
      COUNTRY: EntityKind.COUNTRY,
      REGION: EntityKind.REGION,
      CITY: EntityKind.CITY,
      DESTINATION: EntityKind.DESTINATION,
      PLACE: EntityKind.PLACE,
      PERSON: EntityKind.PERSON,
      EVENT: EntityKind.EVENT,
      HISTORICAL_FACT: EntityKind.FACT,
      MEDIA: EntityKind.MEDIA_ASSET,
    };
    return map[candidateType] ?? EntityKind.PLACE;
  }

  private async recordError(runId: string, recordId: string | null, externalId: string | null, errorClass: string, message: string) {
    this.logger.warn(`Ingestion error (${errorClass}) run=${runId} externalId=${externalId ?? '(none)'}: ${message}`);
    await this.prisma.ingestionError.create({
      data: { runId, recordId: recordId ?? undefined, externalId: externalId ?? undefined, errorClass: errorClass as any, message },
    });
  }

  private async finalize(runId: string, status: IngestionRunStatus, counts: RunCounts, jobId?: string) {
    await this.prisma.ingestionRun.update({ where: { id: runId }, data: { status, finishedAt: new Date(), counts: counts as any } });
    await this.audit.log({ action: 'ingestionRun.finished', entityType: EntityKind.INGESTION_RUN, entityId: runId, metadata: { status, ...counts } });
    // Clear the resumability checkpoint only on a clean terminal outcome
    // (SUCCEEDED) - a FAILED/PARTIAL/CANCELLED run leaves it in place so
    // the next attempt at this job can resume rather than restart from
    // zero (spec section 42/89).
    if (jobId && status === IngestionRunStatus.SUCCEEDED) {
      await this.prisma.ingestionCheckpoint.deleteMany({ where: { jobId } });
    }
    return { runId, status, counts };
  }
}
