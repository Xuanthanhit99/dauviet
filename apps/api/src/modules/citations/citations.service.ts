import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CitationVerificationState, EntityKind } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
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

    const updated = await this.prisma.citation.update({
      where: { id: citationId },
      data: { verificationState: CitationVerificationState.VERIFIED, verifiedById: actorId, verifiedAt: new Date() },
    });
    await this.audit.log({ actorId, action: 'citation.verified', entityType: EntityKind.FACT, entityId: citation.factId, metadata: { citationId } });
    return updated;
  }

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
}
