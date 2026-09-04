import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CitationVerificationState, EntityKind } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TRUST_ERROR_CODES } from '../../common/errors/trust-error-codes';
import { CreateCitationDto } from './dto/citation.dto';

@Injectable()
export class CitationsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async create(dto: CreateCitationDto, actorId: string) {
    const [fact, source] = await Promise.all([
      this.prisma.historicalFact.findUnique({ where: { id: dto.factId } }),
      this.prisma.source.findUnique({ where: { id: dto.sourceId } }),
    ]);
    if (!fact) throw new BadRequestException('Citation references a fact that does not exist.');
    if (!source) throw new BadRequestException('Citation references a source that does not exist.');
    if (source.archivedAt) {
      throw new BadRequestException({
        code: TRUST_ERROR_CODES.SOURCE_RESTRICTED,
        message: 'This source has been archived and can no longer be cited in new work.',
      });
    }

    const citation = await this.prisma.citation.create({
      data: {
        factId: dto.factId,
        sourceId: dto.sourceId,
        pageFrom: dto.pageFrom,
        pageTo: dto.pageTo,
        volume: dto.volume,
        chapter: dto.chapter,
        excerpt: dto.excerpt,
        editorNote: dto.editorNote,
      },
    });

    await this.audit.log({ actorId, action: 'citation.created', entityType: EntityKind.FACT, entityId: dto.factId, metadata: { citationId: citation.id, sourceId: dto.sourceId } });
    return citation;
  }

  async verify(citationId: string, actorId: string) {
    const citation = await this.prisma.citation.findUnique({ where: { id: citationId } });
    if (!citation) throw new NotFoundException('Citation not found.');
    if (citation.verificationState === CitationVerificationState.VERIFIED) {
      throw new ConflictException({
        code: TRUST_ERROR_CODES.CITATION_ALREADY_VERIFIED,
        message: 'This citation has already been verified.',
      });
    }

    const updated = await this.prisma.citation.update({
      where: { id: citationId },
      data: { verificationState: CitationVerificationState.VERIFIED, verifiedById: actorId, verifiedAt: new Date() },
    });
    await this.audit.log({ actorId, action: 'citation.verified', entityType: EntityKind.FACT, entityId: citation.factId, metadata: { citationId } });
    return updated;
  }

  /** Contested but not necessarily wrong - the source may still be legitimate (spec section 12). */
  async dispute(citationId: string, actorId: string) {
    const citation = await this.prisma.citation.findUnique({ where: { id: citationId } });
    if (!citation) throw new NotFoundException('Citation not found.');

    const updated = await this.prisma.citation.update({
      where: { id: citationId },
      data: { verificationState: CitationVerificationState.DISPUTED },
    });
    await this.audit.log({ actorId, action: 'citation.disputed', entityType: EntityKind.FACT, entityId: citation.factId, metadata: { citationId } });
    return updated;
  }

  /** Reviewed and found not to support the claim - never satisfies the publication gate (spec section 12). */
  async reject(citationId: string, actorId: string, reason?: string) {
    const citation = await this.prisma.citation.findUnique({ where: { id: citationId } });
    if (!citation) throw new NotFoundException('Citation not found.');

    const updated = await this.prisma.citation.update({
      where: { id: citationId },
      data: { verificationState: CitationVerificationState.REJECTED },
    });
    await this.audit.log({ actorId, action: 'citation.rejected', entityType: EntityKind.FACT, entityId: citation.factId, metadata: { citationId, reason } });
    return updated;
  }
}
