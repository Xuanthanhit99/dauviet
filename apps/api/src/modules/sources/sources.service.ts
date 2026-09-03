import { Injectable, NotFoundException } from '@nestjs/common';
import { AccessPolicy } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateSourceDocumentDto, CreateSourceDto } from './dto/source.dto';

@Injectable()
export class SourcesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async create(dto: CreateSourceDto, actorId: string) {
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

    const doc = await this.prisma.sourceDocument.create({
      data: {
        sourceId,
        mediaAssetId: dto.mediaAssetId,
        pageCount: dto.pageCount,
        extractedText: dto.extractedText,
        usageRights: dto.usageRights,
        rightsHolder: dto.rightsHolder,
        accessPolicy: dto.accessPolicy ?? AccessPolicy.METADATA_ONLY,
      },
    });
    await this.audit.log({ actorId, action: 'sourceDocument.created', entityType: 'SOURCE', entityId: sourceId });
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

  async list(params: { sourceType?: string; q?: string }) {
    return this.prisma.source.findMany({
      where: {
        sourceType: params.sourceType as any,
        title: params.q ? { contains: params.q, mode: 'insensitive' } : undefined,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
