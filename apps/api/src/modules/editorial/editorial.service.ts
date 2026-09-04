import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EntityKind, PublicationStatus, StoryEditorialStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { resolveTranslation } from '../../common/translation/resolve-translation.util';
import { UpsertEditorialSlotDto } from './dto/editorial-slot.dto';

const RESOLVABLE_KINDS: EntityKind[] = [EntityKind.STORY, EntityKind.JOURNEY, EntityKind.PLACE];

/**
 * Lightweight home/editorial curation (spec Phase 06 section 35-37) - not a
 * CMS layout builder. One `EditorialSlot` row is one piece of content in
 * one named slot/position; `getHome` groups by `slotKey` and re-verifies
 * every entity's own publication status at read time, so a stale slot
 * pointing at a since-unpublished Story/Journey/Place never leaks a draft
 * through the home contract.
 */
@Injectable()
export class EditorialService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async upsertSlot(dto: UpsertEditorialSlotDto, actorId: string) {
    if (!RESOLVABLE_KINDS.includes(dto.entityKind)) {
      throw new BadRequestException(`Editorial slots do not support entityKind ${dto.entityKind} - only STORY, JOURNEY, or PLACE.`);
    }
    const exists = await this.entityExists(dto.entityKind, dto.entityId);
    if (!exists) throw new BadRequestException(`Editorial slot references a ${dto.entityKind} that does not exist.`);

    const slot = await this.prisma.editorialSlot.upsert({
      where: { slotKey_order: { slotKey: dto.slotKey, order: dto.order ?? 0 } },
      update: {
        entityKind: dto.entityKind,
        entityId: dto.entityId,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
      },
      create: {
        slotKey: dto.slotKey,
        order: dto.order ?? 0,
        entityKind: dto.entityKind,
        entityId: dto.entityId,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        createdById: actorId,
      },
    });
    await this.audit.log({ actorId, action: 'editorialSlot.upserted', entityType: dto.entityKind, entityId: dto.entityId, metadata: { slotKey: dto.slotKey, order: slot.order } });
    return slot;
  }

  async removeSlot(id: string, actorId: string) {
    const slot = await this.prisma.editorialSlot.findUnique({ where: { id } });
    if (!slot) throw new NotFoundException('Editorial slot not found.');

    await this.prisma.editorialSlot.delete({ where: { id } });
    await this.audit.log({ actorId, action: 'editorialSlot.removed', entityType: slot.entityKind, entityId: slot.entityId, metadata: { slotKey: slot.slotKey } });
    return { removed: true };
  }

  private async entityExists(kind: EntityKind, id: string): Promise<boolean> {
    if (kind === EntityKind.STORY) return !!(await this.prisma.story.findUnique({ where: { id }, select: { id: true } }));
    if (kind === EntityKind.JOURNEY) return !!(await this.prisma.journey.findUnique({ where: { id }, select: { id: true } }));
    if (kind === EntityKind.PLACE) return !!(await this.prisma.place.findUnique({ where: { id }, select: { id: true } }));
    return false;
  }

  /** GET /v1/editorial/home (spec section 37) - grouped by slotKey, each entity re-verified PUBLISHED at read time. */
  async getHome(locale: string) {
    const now = new Date();
    const slots = await this.prisma.editorialSlot.findMany({
      where: {
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      orderBy: [{ slotKey: 'asc' }, { order: 'asc' }],
    });

    const grouped: Record<string, unknown[]> = {};
    for (const slot of slots) {
      const item = await this.resolvePublicEntity(slot.entityKind, slot.entityId, locale);
      if (!item) continue; // stale/unpublished - silently skipped, never leaked
      grouped[slot.slotKey] = grouped[slot.slotKey] ?? [];
      grouped[slot.slotKey].push(item);
    }
    return grouped;
  }

  private async resolvePublicEntity(kind: EntityKind, id: string, locale: string) {
    if (kind === EntityKind.STORY) {
      const story = await this.prisma.story.findUnique({ where: { id }, include: { translations: true } });
      if (!story || story.editorialStatus !== StoryEditorialStatus.PUBLISHED) return null;
      const { translation } = resolveTranslation(story.translations, locale);
      return { kind: 'STORY', id: story.id, slug: story.canonicalSlug, title: translation?.title ?? story.canonicalSlug };
    }
    if (kind === EntityKind.JOURNEY) {
      const journey = await this.prisma.journey.findUnique({ where: { id }, include: { translations: true } });
      if (!journey || journey.editorialStatus !== PublicationStatus.PUBLISHED) return null;
      const { translation } = resolveTranslation(journey.translations, locale);
      return { kind: 'JOURNEY', id: journey.id, slug: journey.canonicalSlug, title: translation?.title ?? journey.canonicalSlug };
    }
    if (kind === EntityKind.PLACE) {
      const place = await this.prisma.place.findUnique({ where: { id }, include: { translations: true } });
      if (!place || place.publicationStatus !== PublicationStatus.PUBLISHED) return null;
      const { translation } = resolveTranslation(place.translations, locale);
      return { kind: 'PLACE', id: place.id, slug: place.canonicalSlug, name: translation?.name ?? place.canonicalSlug };
    }
    return null;
  }
}
