import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AccessPolicy, FactEditorialStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TRUST_ERROR_CODES } from '../../common/errors/trust-error-codes';
import { CreateSourceDocumentDto, CreateSourceDto } from './dto/source.dto';

const REVIEWER_OR_EDITOR_ROLES: Role[] = [Role.EDITOR, Role.HISTORIAN_REVIEWER, Role.ADMIN];

/** Either the ambient PrismaService or an in-flight `$transaction` callback client - lets a caller (e.g. ContributionsService's catalogue actions, spec Phase 09 section 51) fold source creation into its own atomic transaction. */
type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class SourcesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  /**
   * Duplicate-prevention (spec section 40/41): ISBN/ISSN are the only fields
   * here that are globally unique identifiers, so a duplicate is caught
   * before insert. Never required (old archive records legitimately lack
   * one) and never fuzzy-matched by title/author - a real second edition can
   * share a title, so only an exact identifier collision is blocked, and
   * only against active (non-archived) sources.
   */
  private async assertNoDuplicateIdentifier(dto: CreateSourceDto, db: Db) {
    if (dto.isbn) {
      const existing = await db.source.findFirst({ where: { isbn: dto.isbn, archivedAt: null } });
      if (existing) {
        throw new BadRequestException(`A source with ISBN ${dto.isbn} already exists (id: ${existing.id}).`);
      }
    }
    if (dto.issn) {
      const existing = await db.source.findFirst({ where: { issn: dto.issn, archivedAt: null } });
      if (existing) {
        throw new BadRequestException(`A source with ISSN ${dto.issn} already exists (id: ${existing.id}).`);
      }
    }
  }

  /** `db` defaults to the ambient PrismaService; pass an in-flight `Prisma.TransactionClient` to make this insert part of a larger atomic transaction (e.g. Contribution cataloguing). */
  async create(dto: CreateSourceDto, actorId: string, db: Db = this.prisma) {
    await this.assertNoDuplicateIdentifier(dto, db);

    const source = await db.source.create({
      data: {
        ...dto,
        accessedAt: dto.accessedAt ? new Date(dto.accessedAt) : undefined,
        createdById: actorId,
      },
    });
    await this.audit.log({ actorId, action: 'source.created', entityType: 'SOURCE', entityId: source.id }, db);
    return source;
  }

  async findById(id: string) {
    const source = await this.prisma.source.findUnique({
      where: { id },
      include: { translations: true, sourceDocuments: true },
    });
    if (!source) throw new NotFoundException('Source not found.');
    return source;
  }

  /**
   * A SourceDocument may hold a digitized scan. Its accessPolicy (spec section
   * 18) governs what the public API is allowed to expose - full scans are
   * never returned just because they exist in object storage.
   */
  /** `db` defaults to the ambient PrismaService (opens its own transaction); pass an in-flight `Prisma.TransactionClient` to fold this into a larger atomic transaction (e.g. Contribution cataloguing) instead of nesting a second one. */
  async addDocument(sourceId: string, dto: CreateSourceDocumentDto, actorId: string, db: Db = this.prisma) {
    const source = await db.source.findUnique({ where: { id: sourceId } });
    if (!source) throw new NotFoundException('Source not found.');

    const accessPolicy = dto.accessPolicy ?? AccessPolicy.METADATA_ONLY;

    const runOps = async (tx: Db) => {
      const created = await tx.sourceDocument.create({
        data: {
          sourceId,
          mediaAssetId: dto.mediaAssetId,
          pageCount: dto.pageCount,
          extractedText: dto.extractedText,
          usageRights: dto.usageRights,
          rightsHolder: dto.rightsHolder,
          accessPolicy,
        },
      });
      // The underlying MediaAsset carries its own independent accessPolicy
      // (it can be attached to galleries, avatars, etc.) - without this, a
      // RESTRICTED/METADATA_ONLY SourceDocument could still be fetched in
      // full via `GET /media/:id` if the asset itself defaulted to PUBLIC.
      // Tighten the asset to match, never loosen it. Also tightens any
      // derivative MediaAsset rows already generated for it (spec Phase
      // 05.1 section 25) - a PREVIEW_ONLY/METADATA_ONLY/RESTRICTED document
      // must never leave a stale PUBLIC LARGE/MEDIUM derivative reachable.
      if (accessPolicy !== AccessPolicy.PUBLIC) {
        await tx.mediaAsset.updateMany({
          where: { id: dto.mediaAssetId, accessPolicy: AccessPolicy.PUBLIC },
          data: { accessPolicy },
        });
        await tx.mediaAsset.updateMany({
          where: { parentAssetId: dto.mediaAssetId, accessPolicy: AccessPolicy.PUBLIC },
          data: { accessPolicy },
        });
      }
      return created;
    };

    const doc = db === this.prisma ? await this.prisma.$transaction((tx) => runOps(tx)) : await runOps(db);

    await this.audit.log({ actorId, action: 'sourceDocument.created', entityType: 'SOURCE', entityId: sourceId, metadata: { accessPolicy } }, db);
    return doc;
  }

  /**
   * Strips internal workflow metadata before a Source reaches a public
   * response (spec Phase 11 section 6/49) - `createdById`/`archivedById`
   * are internal user-id pointers, and `archiveReason` is an editorial
   * workflow note, never bibliographic content a public reader needs.
   * Found during the Phase 11 private-field-leak audit: `GET /sources` and
   * `GET /sources/:id` previously returned the full Prisma row verbatim.
   */
  redactSourceForPublic<T extends { createdById?: string | null; archivedById?: string | null; archiveReason?: string | null }>(
    source: T,
  ): Omit<T, 'createdById' | 'archivedById' | 'archiveReason'> {
    const rest = { ...source } as Record<string, unknown>;
    delete rest.createdById;
    delete rest.archivedById;
    delete rest.archiveReason;
    return rest as Omit<T, 'createdById' | 'archivedById' | 'archiveReason'>;
  }

  /** Redacts extractedText/full asset details unless the document is PUBLIC. */
  redactDocumentForPublic<T extends { accessPolicy: AccessPolicy; extractedText: string | null }>(doc: T): T {
    if (doc.accessPolicy === AccessPolicy.PUBLIC) return doc;
    if (doc.accessPolicy === AccessPolicy.RESTRICTED) {
      return { ...doc, extractedText: null } as T;
    }
    return { ...doc, extractedText: doc.accessPolicy === AccessPolicy.PREVIEW_ONLY ? doc.extractedText : null } as T;
  }

  /**
   * Full-fidelity document access (spec sections 27/51) - only for callers
   * holding EDITOR/HISTORIAN_REVIEWER/ADMIN once the policy is stricter than
   * METADATA_ONLY/PUBLIC. Never relies on the frontend to hide a link.
   */
  async getDocumentForViewer(sourceId: string, documentId: string, viewerRoles: string[]) {
    const doc = await this.prisma.sourceDocument.findUnique({ where: { id: documentId } });
    if (!doc || doc.sourceId !== sourceId) throw new NotFoundException('Source document not found.');

    const needsPrivilege = doc.accessPolicy === AccessPolicy.RESTRICTED || doc.accessPolicy === AccessPolicy.METADATA_ONLY;
    if (needsPrivilege && !viewerRoles.some((r) => REVIEWER_OR_EDITOR_ROLES.includes(r as Role))) {
      throw new ForbiddenException({
        code: TRUST_ERROR_CODES.DOCUMENT_ACCESS_DENIED,
        message: `This document's access policy (${doc.accessPolicy}) requires an editor or reviewer role.`,
      });
    }
    return doc;
  }

  async list(params: { sourceType?: string; q?: string }) {
    return this.prisma.source.findMany({
      where: {
        sourceType: params.sourceType as any,
        title: params.q ? { contains: params.q, mode: 'insensitive' } : undefined,
        archivedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /**
   * Archive/deactivate rather than hard-delete (spec section 35). Refuses if
   * any citation on this source belongs to a currently PUBLISHED fact - that
   * would retroactively invalidate a live, trusted claim without a
   * retraction decision on the fact itself.
   */
  async archive(sourceId: string, actorId: string, reason: string) {
    const source = await this.findById(sourceId);
    if (source.archivedAt) return source;

    const referencedByPublished = await this.prisma.citation.findFirst({
      where: { sourceId, fact: { editorialStatus: FactEditorialStatus.PUBLISHED } },
    });
    if (referencedByPublished) {
      throw new BadRequestException({
        code: TRUST_ERROR_CODES.SOURCE_IN_USE,
        message: 'This source is cited by at least one published fact and cannot be archived directly - retract the fact(s) first.',
      });
    }

    const updated = await this.prisma.source.update({
      where: { id: sourceId },
      data: { archivedAt: new Date(), archivedById: actorId, archiveReason: reason },
    });
    await this.audit.log({ actorId, action: 'source.archived', entityType: 'SOURCE', entityId: sourceId, metadata: { reason } });
    return updated;
  }
}
