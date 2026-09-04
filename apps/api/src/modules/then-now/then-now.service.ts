import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MediaAssetStatus, ModerationStatus, PublicationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MediaService } from '../media/media.service';
import { CreateThenNowComparisonDto } from './dto/then-now.dto';

/**
 * "Xua & Nay" (Then & Now) before/after comparisons (spec Phase 05 section
 * 27). Deliberately reuses `PublicationStatus` (editorial promotion gate,
 * same meaning as every other entity - see HISTORICAL_DOMAIN.md section 7)
 * and `ModerationStatus` (community visibility gate, same as CommunityStory)
 * rather than inventing a third status enum - a community-submitted pair
 * starts DRAFT/VISIBLE and only becomes public once explicitly PUBLISHED,
 * exactly like a CommunityStory only becomes trusted content through its
 * own explicit review endpoint (spec section 63).
 */
@Injectable()
export class ThenNowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
  ) {}

  async create(dto: CreateThenNowComparisonDto, actor: { id: string; roles: string[] }) {
    if (dto.beforeMediaId === dto.afterMediaId) {
      throw new BadRequestException('beforeMediaId and afterMediaId must be different media assets.');
    }

    // Ownership check (spec section 29/30) - the same guard as Contributions.
    await this.media.assertOwnedByOrPrivileged(dto.beforeMediaId, actor);
    await this.media.assertOwnedByOrPrivileged(dto.afterMediaId, actor);

    const [place, beforeMedia, afterMedia] = await Promise.all([
      this.prisma.place.findUnique({ where: { id: dto.placeId } }),
      this.prisma.mediaAsset.findUnique({ where: { id: dto.beforeMediaId } }),
      this.prisma.mediaAsset.findUnique({ where: { id: dto.afterMediaId } }),
    ]);
    if (!place) throw new BadRequestException('placeId does not reference an existing Place.');
    if (!beforeMedia || beforeMedia.status !== MediaAssetStatus.READY) {
      throw new BadRequestException('beforeMediaId must reference a READY media asset.');
    }
    if (!afterMedia || afterMedia.status !== MediaAssetStatus.READY) {
      throw new BadRequestException('afterMediaId must reference a READY media asset.');
    }

    const comparison = await this.prisma.thenNowComparison.create({
      data: {
        placeId: dto.placeId,
        beforeMediaId: dto.beforeMediaId,
        afterMediaId: dto.afterMediaId,
        historicalPeriod: dto.historicalPeriod,
        viewpointNote: dto.viewpointNote,
        createdById: actor.id,
        translations: dto.description
          ? { create: [{ locale: dto.locale ?? 'vi', description: dto.description, method: 'ORIGINAL' }] }
          : undefined,
      },
      include: { translations: true },
    });

    await this.audit.log({ actorId: actor.id, action: 'thenNow.created', entityType: 'PLACE', entityId: dto.placeId, metadata: { comparisonId: comparison.id } });
    return comparison;
  }

  async findById(id: string) {
    const comparison = await this.prisma.thenNowComparison.findUnique({
      where: { id },
      include: { beforeMedia: true, afterMedia: true, translations: true },
    });
    if (!comparison) throw new NotFoundException('Then & Now comparison not found.');
    return comparison;
  }

  /** Public read path - only PUBLISHED and not REMOVED (spec section 38). */
  async listPublic(placeId?: string) {
    return this.prisma.thenNowComparison.findMany({
      where: {
        placeId,
        publicationStatus: PublicationStatus.PUBLISHED,
        moderationStatus: { not: ModerationStatus.REMOVED },
      },
      include: { beforeMedia: true, afterMedia: true, translations: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async setPublicationStatus(id: string, status: PublicationStatus, actorId: string) {
    const comparison = await this.prisma.thenNowComparison.findUnique({ where: { id } });
    if (!comparison) throw new NotFoundException('Then & Now comparison not found.');

    const updated = await this.prisma.thenNowComparison.update({ where: { id }, data: { publicationStatus: status } });
    await this.audit.log({ actorId, action: 'thenNow.publicationStatus.changed', entityType: 'PLACE', entityId: comparison.placeId, metadata: { comparisonId: id, status } });
    return updated;
  }

  async setModerationStatus(id: string, status: ModerationStatus, actorId: string) {
    const comparison = await this.prisma.thenNowComparison.findUnique({ where: { id } });
    if (!comparison) throw new NotFoundException('Then & Now comparison not found.');

    const updated = await this.prisma.thenNowComparison.update({ where: { id }, data: { moderationStatus: status } });
    await this.audit.log({ actorId, action: 'thenNow.moderationStatus.changed', entityType: 'PLACE', entityId: comparison.placeId, metadata: { comparisonId: id, status } });
    return updated;
  }
}
