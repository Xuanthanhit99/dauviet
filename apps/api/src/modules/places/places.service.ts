import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FactEditorialStatus, Prisma, PublicationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { resolveTranslation } from '../../common/translation/resolve-translation.util';
import { toSlug } from '../../common/util/slug.util';
import { CreatePlaceDto, UpdatePlaceDto } from './dto/place.dto';
import { CANONICAL_LOCALE } from '../../common/decorators/locale.decorator';

@Injectable()
export class PlacesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private async ensureUniqueCanonicalSlug(base: string): Promise<string> {
    let slug = base;
    let suffix = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const existing = await this.prisma.place.findUnique({ where: { canonicalSlug: slug } });
      if (!existing) return slug;
      suffix += 1;
      slug = `${base}-${suffix}`;
    }
  }

  async create(dto: CreatePlaceDto, actorId: string) {
    const canonical = dto.translations.find((t) => t.locale === CANONICAL_LOCALE) ?? dto.translations[0];
    if (!canonical) throw new BadRequestException('At least one translation is required.');

    const canonicalSlug = await this.ensureUniqueCanonicalSlug(toSlug(canonical.name));

    const place = await this.prisma.place.create({
      data: {
        type: dto.type,
        canonicalSlug,
        parentPlaceId: dto.parentPlaceId,
        publicationStatus: PublicationStatus.DRAFT,
        translations: {
          create: dto.translations.map((t) => ({
            locale: t.locale,
            name: t.name,
            slug: toSlug(t.name),
            summary: t.summary,
            description: t.description,
            method: t.method ?? 'ORIGINAL',
          })),
        },
      },
      include: { translations: true },
    });

    if (dto.latitude !== undefined && dto.longitude !== undefined) {
      await this.setLocation(place.id, dto.latitude, dto.longitude);
    }

    await this.audit.log({ actorId, action: 'place.created', entityType: 'PLACE', entityId: place.id });
    return place;
  }

  async setLocation(placeId: string, latitude: number, longitude: number) {
    await this.prisma.$executeRaw`
      UPDATE "Place"
      SET "location" = ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)
      WHERE "id" = ${placeId}
    `;
  }

  async findBySlug(slug: string, locale: string, includeUnpublished = false) {
    const place = await this.prisma.place.findUnique({
      where: { canonicalSlug: slug },
      include: {
        translations: true,
        heroMedia: true,
        parentPlace: { include: { translations: true } },
      },
    });
    if (!place) throw new NotFoundException('Place not found.');
    if (!includeUnpublished && place.publicationStatus !== PublicationStatus.PUBLISHED) {
      throw new NotFoundException('Place not found.');
    }

    const { translation, resolvedLocale, fallbackApplied } = resolveTranslation(place.translations, locale);
    const [lngLat] = await this.prisma.$queryRaw<{ lng: number | null; lat: number | null }[]>`
      SELECT ST_X("location") as lng, ST_Y("location") as lat FROM "Place" WHERE "id" = ${place.id}
    `;

    return {
      id: place.id,
      slug: place.canonicalSlug,
      type: place.type,
      publicationStatus: place.publicationStatus,
      parentPlace: place.parentPlace
        ? { id: place.parentPlace.id, slug: place.parentPlace.canonicalSlug }
        : null,
      heroMedia: place.heroMedia,
      location: lngLat?.lat != null ? { latitude: lngLat.lat, longitude: lngLat.lng } : null,
      translation,
      meta: { requestedLocale: locale, resolvedLocale, fallbackApplied },
    };
  }

  async list(params: { type?: string; locale: string; cursor?: string; limit: number }) {
    const { type, locale, cursor, limit } = params;
    const places = await this.prisma.place.findMany({
      where: {
        publicationStatus: PublicationStatus.PUBLISHED,
        type: type as any,
      },
      include: { translations: true },
      orderBy: { id: 'asc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = places.length > limit;
    const page = places.slice(0, limit).map((p) => {
      const { translation } = resolveTranslation(p.translations, locale);
      return { id: p.id, slug: p.canonicalSlug, type: p.type, name: translation?.name ?? p.canonicalSlug };
    });

    return { items: page, nextCursor: hasMore ? places[limit].id : null, hasMore };
  }

  async update(id: string, dto: UpdatePlaceDto, actorId: string) {
    const place = await this.prisma.place.findUnique({ where: { id } });
    if (!place) throw new NotFoundException('Place not found.');

    const updated = await this.prisma.place.update({
      where: { id },
      data: { type: dto.type },
    });

    if (dto.latitude !== undefined && dto.longitude !== undefined) {
      await this.setLocation(id, dto.latitude, dto.longitude);
    }

    await this.audit.log({ actorId, action: 'place.updated', entityType: 'PLACE', entityId: id });
    return updated;
  }

  async setPublicationStatus(id: string, status: PublicationStatus, actorId: string) {
    const place = await this.prisma.place.findUnique({ where: { id }, include: { translations: true } });
    if (!place) throw new NotFoundException('Place not found.');

    if (status === PublicationStatus.PUBLISHED && place.translations.length === 0) {
      throw new BadRequestException('Cannot publish a place with no translations.');
    }

    const updated = await this.prisma.place.update({ where: { id }, data: { publicationStatus: status } });
    await this.audit.log({
      actorId,
      action: 'place.publicationStatus.changed',
      entityType: 'PLACE',
      entityId: id,
      metadata: { status },
    });
    return updated;
  }

  async getTimeline(slug: string, locale: string) {
    const place = await this.getPublishedIdBySlug(slug);
    const links = await this.prisma.eventPlace.findMany({
      where: { placeId: place.id },
      include: { event: { include: { translations: true } } },
    });
    return links
      .filter((l) => l.event.publicationStatus === PublicationStatus.PUBLISHED)
      .map((l) => {
        const { translation } = resolveTranslation(l.event.translations, locale);
        return {
          id: l.event.id,
          slug: l.event.canonicalSlug,
          title: translation?.title ?? l.event.canonicalSlug,
          dateStart: l.event.dateStart,
          dateEnd: l.event.dateEnd,
          datePrecision: l.event.datePrecision,
          dateLabel: l.event.dateLabel,
        };
      });
  }

  async getSources(slug: string) {
    const place = await this.getPublishedIdBySlug(slug);
    const factLinks = await this.prisma.factPlace.findMany({
      where: { placeId: place.id },
      include: {
        fact: {
          include: { citations: { include: { source: true } } },
        },
      },
    });

    const sourceMap = new Map<string, Prisma.SourceGetPayload<Record<string, never>>>();
    for (const link of factLinks) {
      if (link.fact.editorialStatus !== FactEditorialStatus.PUBLISHED) continue;
      for (const citation of link.fact.citations) {
        sourceMap.set(citation.source.id, citation.source);
      }
    }
    return Array.from(sourceMap.values());
  }

  async getMedia(slug: string) {
    const place = await this.getPublishedIdBySlug(slug);
    const gallery = await this.prisma.entityMedia.findMany({
      where: { entityType: 'PLACE', entityId: place.id },
      include: { mediaAsset: true },
      orderBy: { order: 'asc' },
    });
    return gallery.map((g) => g.mediaAsset);
  }

  async getCommunityStories(slug: string, locale: string) {
    const place = await this.getPublishedIdBySlug(slug);
    const links = await this.prisma.communityStoryPlace.findMany({
      where: { placeId: place.id },
      include: { story: { include: { translations: true } } },
    });
    return links
      .filter((l) => l.story.moderationStatus === 'VISIBLE')
      .map((l) => {
        const { translation } = resolveTranslation(l.story.translations, locale);
        return {
          id: l.story.id,
          slug: l.story.canonicalSlug,
          type: l.story.type,
          verificationState: l.story.verificationState,
          title: translation?.title ?? l.story.canonicalSlug,
        };
      });
  }

  private async getPublishedIdBySlug(slug: string) {
    const place = await this.prisma.place.findUnique({ where: { canonicalSlug: slug } });
    if (!place || place.publicationStatus !== PublicationStatus.PUBLISHED) {
      throw new NotFoundException('Place not found.');
    }
    return place;
  }

  async recordVisit(userId: string, slug: string, note?: string) {
    const place = await this.getPublishedIdBySlug(slug);
    return this.prisma.placeVisit.create({ data: { userId, placeId: place.id, note } });
  }
}
