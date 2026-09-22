import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { EntityKind, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { S3Service } from '../media/s3.service';
import { OutboundHttpService } from './outbound-http.service';
import { INGESTION_ERROR_CODES } from '../../common/errors/ingestion-error-codes';

type Db = PrismaService | Prisma.TransactionClient;

/**
 * Transactional candidate -> canonical-entity promotion (spec sections 29-
 * 32/34). Every write in a single promotion happens inside ONE
 * `$transaction` - a failure partway through (e.g. the S3 upload step)
 * leaves no partial canonical entity, no partial external identity, no
 * partial Source, no partial MediaAsset, and no orphan audit row (Phase
 * 12.1 discipline - `AuditService.log` is always passed the same `tx`).
 *
 * Adapter code NEVER calls any of this directly - only
 * `IngestionCandidatesService.approve` does, and only after a human has
 * already set `candidate.status = APPROVED`.
 */
@Injectable()
export class IngestionPromotionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly s3: S3Service,
    private readonly http: OutboundHttpService,
  ) {}

  async promote(candidateId: string, actorId: string) {
    const candidate = await this.prisma.ingestionCandidate.findUnique({
      where: { id: candidateId },
      include: { evidence: true, externalIdentities: true, source: true },
    });
    if (!candidate) throw new NotFoundException(INGESTION_ERROR_CODES.INGESTION_CANDIDATE_NOT_FOUND);
    // Reviewable-state check, NOT `status === 'APPROVED'` (spec section 34 -
    // atomicity): the status transition to APPROVED happens INSIDE this same
    // transaction below, alongside the entity creation/link, never before
    // it. A prior design flipped status to APPROVED in its own transaction
    // before calling this method - found live, during this phase's own
    // pilot, to leave a candidate permanently stuck ("not reviewable", not
    // "APPROVED-but-unpromoted") whenever the promotion step itself failed
    // after that separate commit (e.g. a real transient MinIO/S3
    // connection failure hit during the Commons media pilot proof). Fixed
    // by making the status write itself part of the one atomic promotion
    // transaction, so a failure leaves the candidate exactly where it was -
    // reviewable, retryable - never in an unretryable limbo state.
    if (!['NEEDS_REVIEW', 'AUTO_MATCHED', 'UNRESOLVED'].includes(candidate.status)) {
      throw new BadRequestException(INGESTION_ERROR_CODES.INGESTION_CANDIDATE_NOT_REVIEWABLE);
    }
    const evidence = candidate.evidence[0];
    if (!evidence) throw new BadRequestException(INGESTION_ERROR_CODES.INGESTION_PROMOTION_MISSING_EVIDENCE);

    return this.prisma.$transaction(async (tx) => {
      await tx.ingestionCandidate.update({ where: { id: candidateId }, data: { status: 'APPROVED', reviewedById: actorId, reviewedAt: new Date() } });

      // Case 1: resolution already links this candidate to an existing
      // canonical entity (EXACT_MATCH/HIGH_CONFIDENCE_MATCH, human-
      // confirmed) - promotion only strengthens the external identity link,
      // never creates a duplicate canonical row (spec section 25/31).
      if (candidate.resolvedEntityType && candidate.resolvedEntityId) {
        await this.linkIdentity(tx, candidate.sourceId, evidence.externalRecordId, candidate.resolvedEntityType, candidate.resolvedEntityId, candidateId);
        await this.audit.log(
          { actorId, action: 'ingestionCandidate.promoted.linked', entityType: EntityKind.INGESTION_CANDIDATE, entityId: candidateId, metadata: { resolvedEntityType: candidate.resolvedEntityType, resolvedEntityId: candidate.resolvedEntityId } },
          tx,
        );
        return { mode: 'linked' as const, entityType: candidate.resolvedEntityType, entityId: candidate.resolvedEntityId };
      }

      // Case 2: genuinely new entity.
      if (candidate.candidateType === 'PLACE') {
        const result = await this.promoteNewPlace(tx, candidate, evidence, actorId);
        await this.linkIdentity(tx, candidate.sourceId, evidence.externalRecordId, EntityKind.PLACE, result.id, candidateId);
        await this.audit.log({ actorId, action: 'ingestionCandidate.promoted.newPlace', entityType: EntityKind.INGESTION_CANDIDATE, entityId: candidateId, metadata: { placeId: result.id } }, tx);
        return { mode: 'created' as const, entityType: EntityKind.PLACE, entityId: result.id };
      }

      if (candidate.candidateType === 'MEDIA') {
        const result = await this.promoteNewMedia(tx, candidate, evidence, actorId);
        await this.linkIdentity(tx, candidate.sourceId, evidence.externalRecordId, EntityKind.MEDIA_ASSET, result.id, candidateId);
        await this.audit.log({ actorId, action: 'ingestionCandidate.promoted.newMedia', entityType: EntityKind.INGESTION_CANDIDATE, entityId: candidateId, metadata: { mediaAssetId: result.id } }, tx);
        return { mode: 'created' as const, entityType: EntityKind.MEDIA_ASSET, entityId: result.id };
      }

      // Scope exclusion (documented, not hidden - spec section 97): new-
      // entity promotion for COUNTRY/REGION/CITY/DESTINATION/PERSON/EVENT/
      // HISTORICAL_FACT is not implemented in this pass. Identity-linking
      // (Case 1 above) already covers the pilot's dominant real case (VN/JP
      // destinations that already exist in the Golden Dataset).
      throw new BadRequestException(INGESTION_ERROR_CODES.INGESTION_PROMOTION_TYPE_UNSUPPORTED);
    });
  }

  private async linkIdentity(tx: Prisma.TransactionClient, sourceId: string, externalId: string, entityType: EntityKind, entityId: string, candidateId: string) {
    await tx.externalEntityIdentity.updateMany({ where: { sourceId, externalId }, data: { resolvedEntityId: entityId, entityType, state: 'ACTIVE' } });
    await tx.ingestionCandidate.update({ where: { id: candidateId }, data: { resolvedEntityType: entityType, resolvedEntityId: entityId } });
  }

  /** Dedupe by URL (spec section 31) - never a blind duplicate Source row per ingestion run. */
  private async dedupeSource(tx: Prisma.TransactionClient, params: { url: string; title: string; sourceType: 'WEBSITE' | 'UNESCO_RECORD'; credibility: 'SECONDARY' | 'TERTIARY'; createdById: string }) {
    const existing = await tx.source.findFirst({ where: { url: params.url } });
    if (existing) return existing;
    return tx.source.create({
      data: { sourceType: params.sourceType, title: params.title, url: params.url, credibilityLevel: params.credibility, createdById: params.createdById },
    });
  }

  private async promoteNewPlace(
    tx: Prisma.TransactionClient,
    candidate: { normalizedData: Prisma.JsonValue },
    evidence: { sourceUrl: string | null; licenseCode: string | null; externalRecordId: string },
    actorId: string,
  ) {
    const data = candidate.normalizedData as any;
    const labels: Record<string, string> = data?.labels ?? {};
    const primaryLabel = labels.en ?? labels.vi ?? labels.ja ?? `Unnamed (${evidence.externalRecordId})`;
    const slugBase = primaryLabel
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const slug = `${slugBase}-${evidence.externalRecordId.toLowerCase()}`;

    if (evidence.sourceUrl) {
      await this.dedupeSource(tx, {
        url: evidence.sourceUrl,
        title: primaryLabel,
        sourceType: evidence.sourceUrl.includes('unesco.org') ? 'UNESCO_RECORD' : 'WEBSITE',
        credibility: evidence.sourceUrl.includes('unesco.org') ? 'SECONDARY' : 'TERTIARY',
        createdById: actorId,
      });
    }

    const place = await tx.place.create({
      data: {
        canonicalSlug: slug,
        // Conservative default (spec section 30 - never fabricate
        // certainty/classification an adapter can't actually support); a
        // reviewer refines the real PlaceType during editorial review.
        type: 'OTHER',
        historicalImportance: 1,
        publicationStatus: 'DRAFT',
      },
    });

    const translations = Object.entries(labels).filter(([, name]) => Boolean(name));
    for (const [locale, name] of translations) {
      await tx.placeTranslation.create({
        // TranslationMethod HUMAN, not ORIGINAL - this text was authored by
        // Wikidata's community contributors, not this project's own
        // editorial team (spec section 28 - external translations are
        // candidates/labeled honestly, never presented as in-house
        // original copy).
        data: { placeId: place.id, locale, name: name as string, slug, summary: data?.description, status: 'DRAFT', method: 'HUMAN' },
      });
    }

    return place;
  }

  private async promoteNewMedia(
    tx: Prisma.TransactionClient,
    candidate: { normalizedData: Prisma.JsonValue },
    evidence: { licenseCode: string | null; licenseUrl: string | null; attributionText: string | null; sourceUrl: string | null; externalRecordId: string },
    actorId: string,
  ) {
    // Media rights proof (spec section 32/55/86): never promote as
    // documentary media without a verified license.
    if (!evidence.licenseCode) {
      throw new BadRequestException(INGESTION_ERROR_CODES.INGESTION_PROMOTION_MEDIA_RIGHTS_UNVERIFIED);
    }
    const data = candidate.normalizedData as any;
    const mediaEntry = data?.media?.[0] as { url: string; license?: string; attributionText?: string } | undefined;
    if (!mediaEntry?.url) throw new BadRequestException(INGESTION_ERROR_CODES.INGESTION_PROMOTION_MISSING_EVIDENCE);

    const fetched = await this.http.get(mediaEntry.url, { maxResponseBytes: 20 * 1024 * 1024 });
    const bodyBuffer = Buffer.from(fetched.body, 'binary');
    const checksum = createHash('sha256').update(bodyBuffer).digest('hex');
    const contentType = fetched.headers.get('content-type') ?? 'application/octet-stream';
    const extension = contentType.split('/')[1]?.split(';')[0] ?? 'bin';
    const storageKey = `ingestion/${evidence.externalRecordId.replace(/[^a-zA-Z0-9]/g, '_')}-${checksum.slice(0, 12)}.${extension}`;

    await this.s3.putObject(storageKey, bodyBuffer, contentType);

    let sourceId: string | undefined;
    if (evidence.sourceUrl) {
      const source = await this.dedupeSource(tx, { url: evidence.sourceUrl, title: 'Wikimedia Commons', sourceType: 'WEBSITE', credibility: 'TERTIARY', createdById: actorId });
      sourceId = source.id;
    }

    const asset = await tx.mediaAsset.create({
      data: {
        // Commons-scope adapter fetches images only (spec section 7 -
        // metadata-only image candidates); PHOTO is the correct MediaType
        // for the whole G06.5 Commons pilot scope.
        type: 'PHOTO',
        status: 'READY',
        storageKey,
        mimeType: contentType,
        sizeBytes: bodyBuffer.byteLength,
        checksum,
        sourceId,
        license: evidence.licenseCode,
        rightsHolder: evidence.attributionText ?? undefined,
        rightsStatus: 'LICENSED',
        attributionText: evidence.attributionText ?? undefined,
        rightsReviewedById: actorId,
        rightsReviewedAt: new Date(),
        provenanceNote: `Promoted from Wikimedia Commons ingestion candidate (external id ${evidence.externalRecordId}).`,
        isHistorical: false,
        isAiGenerated: false,
        accessPolicy: 'PUBLIC',
      },
    });
    return asset;
  }
}
