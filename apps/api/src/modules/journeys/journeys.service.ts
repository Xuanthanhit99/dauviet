import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PublicationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { resolveTranslation } from '../../common/translation/resolve-translation.util';
import { toSlug } from '../../common/util/slug.util';
import { CANONICAL_LOCALE } from '../../common/decorators/locale.decorator';
import { AddJourneyStopDto, CreateJourneyDto } from './dto/journey.dto';

@Injectable()
export class JourneysService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private async ensureUniqueSlug(base: string): Promise<string> {
    let slug = base;
    let suffix = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const existing = await this.prisma.journey.findUnique({ where: { canonicalSlug: slug } });
      if (!existing) return slug;
      suffix += 1;
      slug = `${base}-${suffix}`;
    }
  }

  async create(dto: CreateJourneyDto, actorId: string) {
    const canonical = dto.translations.find((t) => t.locale === CANONICAL_LOCALE) ?? dto.translations[0];
    if (!canonical) throw new BadRequestException('At least one translation is required.');

    const canonicalSlug = await this.ensureUniqueSlug(toSlug(canonical.title));

    const journey = await this.prisma.journey.create({
      data: {
        canonicalSlug,
        durationMinutes: dto.durationMinutes,
        distanceMeters: dto.distanceMeters,
        difficulty: dto.difficulty,
        region: dto.region,
        translations: {
          create: dto.translations.map((t) => ({ locale: t.locale, title: t.title, slug: toSlug(t.title), summary: t.summary, description: t.description })),
        },
      },
      include: { translations: true },
    });

    await this.audit.log({ actorId, action: 'journey.created', entityType: 'JOURNEY', entityId: journey.id });
    return journey;
  }

  async addStop(journeyId: string, dto: AddJourneyStopDto) {
    return this.prisma.journeyStop.create({
      data: {
        journeyId,
        placeId: dto.placeId,
        order: dto.order,
        recommendedDurationMinutes: dto.recommendedDurationMinutes,
        notes: dto.notes,
      },
    });
  }

  async findBySlug(slug: string, locale: string) {
    const journey = await this.prisma.journey.findUnique({
      where: { canonicalSlug: slug },
      include: {
        translations: true,
        heroMedia: true,
        stops: { orderBy: { order: 'asc' }, include: { place: { include: { translations: true } } } },
      },
    });
    if (!journey || journey.editorialStatus !== PublicationStatus.PUBLISHED) {
      throw new NotFoundException('Journey not found.');
    }

    const { translation, resolvedLocale, fallbackApplied } = resolveTranslation(journey.translations, locale);
    return {
      id: journey.id,
      slug: journey.canonicalSlug,
      durationMinutes: journey.durationMinutes,
      distanceMeters: journey.distanceMeters,
      difficulty: journey.difficulty,
      region: journey.region,
      heroMedia: journey.heroMedia,
      stops: journey.stops.map((s) => {
        const { translation: pt } = resolveTranslation(s.place.translations, locale);
        return {
          order: s.order,
          place: { id: s.place.id, slug: s.place.canonicalSlug, name: pt?.name },
          recommendedDurationMinutes: s.recommendedDurationMinutes,
          notes: s.notes,
        };
      }),
      translation,
      meta: { requestedLocale: locale, resolvedLocale, fallbackApplied },
    };
  }

  async list(locale: string) {
    const journeys = await this.prisma.journey.findMany({
      where: { editorialStatus: PublicationStatus.PUBLISHED },
      include: { translations: true },
      orderBy: { publishedAt: 'desc' },
      take: 100,
    });
    return journeys.map((j) => {
      const { translation } = resolveTranslation(j.translations, locale);
      return { id: j.id, slug: j.canonicalSlug, title: translation?.title ?? j.canonicalSlug };
    });
  }

  async setEditorialStatus(id: string, status: PublicationStatus, actorId: string) {
    const journey = await this.prisma.journey.findUnique({ where: { id }, include: { translations: true, stops: true } });
    if (!journey) throw new NotFoundException('Journey not found.');
    if (status === PublicationStatus.PUBLISHED) {
      if (journey.translations.length === 0) throw new BadRequestException('Cannot publish a journey with no translations.');
      if (journey.stops.length === 0) throw new BadRequestException('Cannot publish a journey with no stops.');
    }
    const updated = await this.prisma.journey.update({
      where: { id },
      data: { editorialStatus: status, publishedAt: status === PublicationStatus.PUBLISHED ? new Date() : journey.publishedAt },
    });
    await this.audit.log({ actorId, action: 'journey.editorialStatus.changed', entityType: 'JOURNEY', entityId: id, metadata: { status } });
    return updated;
  }
}
