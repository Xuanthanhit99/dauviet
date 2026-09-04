import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AccessPolicy, FactEditorialStatus, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TRUST_ERROR_CODES } from '../../common/errors/trust-error-codes';
import { CreateSourceDocumentDto, CreateSourceDto } from './dto/source.dto';

const REVIEWER_OR_EDITOR_ROLES: Role[] = [Role.EDITOR, Role.HISTORIAN_REVIEWER, Role.ADMIN];

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
  private async assertNoDuplicateIdentifier(dto: CreateSourceDto) {
    if (dto.isbn) {
      const existing = await this.prisma.source.findFirst({ where: { isbn: dto.isbn, archivedAt: null } });
      if (existing) {
        throw new BadRequestException(`A source with ISBN ${dto.isbn} already exists (id: ${existing.id}).`);
      }
    }
    if (dto.issn) {
      const existing = await this.prisma.source.findFirst({ where: { issn: dto.issn, archivedAt: null } });
      if (existing) {
        throw new BadRequestException(`A source with ISSN ${dto.issn} already exists (id: ${existing.id}).`);
      }
    }
  }

  async create(dto: CreateSourceDto, actorId: string) {
    await this.assertNoDuplicateIdentifier(dto);

    const source = await this.prisma.source.create({
      data: {
        ...dto,
        accessedAt: dto.accessedAt ? new Date(dto.accessedAt) : undefined,
        createdById: actorId,
      },
    });
    await this.audit.log({ actorId, action: 'source.created', entityType: 'SOURCE', entityId: source.id });
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
  async addDocument(sourceId: string, dto: CreateSourceDocumentDto, actorId: string) {
    const source = await this.prisma.source.findUnique({ where: { id: sourceId } });
    if (!source) throw new NotFoundException('Source not found.');

    const accessPolicy = dto.accessPolicy ?? AccessPolicy.METADATA_ONLY;

    const doc = await this.prisma.$transaction(async (tx) => {
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
    });

    await this.audit.log({ actorId, action: 'sourceDocument.created', entityType: 'SOURCE', entityId: sourceId, metadata: { accessPolicy } });
    return doc;
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
