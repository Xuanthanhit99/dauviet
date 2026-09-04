import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AccessPolicy, EntityKind, MediaAssetStatus, PublicationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { resolveTranslation } from '../../common/translation/resolve-translation.util';
import { toSlug } from '../../common/util/slug.util';
import { CANONICAL_LOCALE } from '../../common/decorators/locale.decorator';
import { EDITORIAL_ERROR_CODES } from '../stories/editorial-error-codes';
import {
  AddJourneyStopDto,
  CreateJourneyDto,
  ReorderJourneyStopsDto,
} from './dto/journey.dto';

const FORWARD_TRANSITIONS: Record<PublicationStatus, PublicationStatus[]> = {
  DRAFT: [PublicationStatus.IN_REVIEW, PublicationStatus.DRAFT],
  IN_REVIEW: [PublicationStatus.PUBLISHED, PublicationStatus.DRAFT],
  PUBLISHED: [PublicationStatus.ARCHIVED, PublicationStatus.DRAFT],
  ARCHIVED: [PublicationStatus.DRAFT],
};

const JOURNEY_INCLUDE = {
  translations: true,
  heroMedia: true,
  stops: { orderBy: { order: 'asc' }, include: { place: { include: { translations: true } }, story: true, event: true } },
} satisfies Prisma.JourneyInclude;

/**
 * Curated route domain (spec Phase 06 sections 24-34). A Journey is an
 * ordered sequence of real, published Places with deterministic ordering -
 * never an unordered id list. See docs/backend/EDITORIAL_CONTENT.md.
 */
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
          create: dto.translations.map((t) => ({
            locale: t.locale,
            title: t.title,
            slug: toSlug(t.title),
            summary: t.summary,
            description: t.description,
            seoTitle: t.seoTitle,
            seoDescription: t.seoDescription,
          })),
        },
      },
      include: { translations: true },
    });

    await this.snapshot(journey.id, actorId, 'journey.created');
    return journey;
  }

  async findById(id: string) {
    const journey = await this.prisma.journey.findUnique({ where: { id }, include: JOURNEY_INCLUDE });
    if (!journey) throw new NotFoundException('Journey not found.');
    return journey;
  }

  async preview(id: string, locale: string) {
    const journey = await this.findById(id);
    const dto = await this.toPublicDto(journey, locale);
    return dto;
  }

  async findBySlug(slug: string, locale: string) {
    const journey = await this.prisma.journey.findUnique({ where: { canonicalSlug: slug }, include: JOURNEY_INCLUDE });
    if (!journey || journey.editorialStatus !== PublicationStatus.PUBLISHED) {
      throw new NotFoundException('Journey not found.');
    }
    return this.toPublicDto(journey, locale);
  }

  /**
   * Map-friendly stop contract (spec section 29): ordered points with real
   * Place coordinates - never a fabricated route line. `routeGeometry`
   * (when present) always carries its `routeGeometrySource` provenance
   * (spec section 30) so a client never presents an editorial guess as an
   * actual road route.
   */
  private async toPublicDto(journey: Prisma.JourneyGetPayload<{ include: typeof JOURNEY_INCLUDE }>, locale: string) {
    const { translation, resolvedLocale, fallbackApplied } = resolveTranslation(journey.translations, locale);

    const stops = await Promise.all(
      journey.stops.map(async (s) => {
        const { translation: pt } = resolveTranslation(s.place.translations, locale);
        const [lngLat] = await this.prisma.$queryRaw<{ lng: number | null; lat: number | null }[]>`
          SELECT ST_X("location") as lng, ST_Y("location") as lat FROM "Place" WHERE "id" = ${s.placeId}
        `;
        return {
          order: s.order,
          place: {
            id: s.place.id,
            slug: s.place.canonicalSlug,
            name: pt?.name,
            location: lngLat?.lat != null ? { latitude: lngLat.lat, longitude: lngLat.lng } : null,
          },
          stopTitle: s.stopTitle,
          recommendedDurationMinutes: s.recommendedDurationMinutes,
          notes: s.notes,
          story: s.story ? { id: s.story.id, slug: s.story.canonicalSlug } : null,
          event: s.event ? { id: s.event.id, slug: s.event.canonicalSlug } : null,
        };
      }),
    );

    return {
      id: journey.id,
      slug: journey.canonicalSlug,
      durationMinutes: journey.durationMinutes,
      distanceMeters: journey.distanceMeters,
      difficulty: journey.difficulty,
      region: journey.region,
      editorialStatus: journey.editorialStatus,
      publishedAt: journey.publishedAt,
      heroMedia: journey.heroMedia
        ? {
            id: journey.heroMedia.id,
            type: journey.heroMedia.type,
            isAiGenerated: journey.heroMedia.isAiGenerated,
            aiDisclosure: journey.heroMedia.aiDisclosure,
            accessPolicy: journey.heroMedia.accessPolicy,
            status: journey.heroMedia.status,
          }
        : null,
      routeGeometrySource: journey.routeGeometrySource,
      stops,
      translation,
      meta: { requestedLocale: locale, resolvedLocale, fallbackApplied },
    };
  }

  async list(params: { locale: string; region?: string; cursor?: string; limit?: number }) {
    const limit = params.limit ?? 20;
    const journeys = await this.prisma.journey.findMany({
      where: { editorialStatus: PublicationStatus.PUBLISHED, region: params.region },
      include: { translations: true },
      orderBy: { publishedAt: 'desc' },
      take: limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    });
    const hasMore = journeys.length > limit;
    const page = journeys.slice(0, limit).map((j) => {
      const { translation } = resolveTranslation(j.translations, params.locale);
      return { id: j.id, slug: j.canonicalSlug, title: translation?.title ?? j.canonicalSlug };
    });
    return { items: page, nextCursor: hasMore ? journeys[limit].id : null, hasMore };
  }

  /** Used by Place `:slug/journeys` (spec section 43) - PUBLISHED only, one query. */
  async listForPlace(placeId: string, locale: string) {
    const journeys = await this.prisma.journey.findMany({
      where: { editorialStatus: PublicationStatus.PUBLISHED, stops: { some: { placeId } } },
      include: { translations: true },
      orderBy: { publishedAt: 'desc' },
      take: 50,
    });
    return journeys.map((j) => {
      const { translation } = resolveTranslation(j.translations, locale);
      return { id: j.id, slug: j.canonicalSlug, title: translation?.title ?? j.canonicalSlug };
    });
  }

  async setHeroMedia(journeyId: string, mediaAssetId: string, actorId: string) {
    const [journey, media] = await Promise.all([
      this.prisma.journey.findUnique({ where: { id: journeyId } }),
      this.prisma.mediaAsset.findUnique({ where: { id: mediaAssetId } }),
    ]);
    if (!journey) throw new NotFoundException('Journey not found.');
    if (!media) throw new BadRequestException('Hero media does not reference an existing MediaAsset.');

    const updated = await this.prisma.journey.update({ where: { id: journeyId }, data: { heroMediaId: mediaAssetId } });
    await this.audit.log({ actorId, action: 'journey.heroMedia.set', entityType: EntityKind.JOURNEY, entityId: journeyId, metadata: { mediaAssetId } });
    return updated;
  }

  /** Data-model-only scheduling (spec section 23) - no cron/scheduler is wired up; automatic execution at scheduledAt is UNVERIFIED_LIVE_DB/deferred. */
  async schedule(journeyId: string, scheduledAt: string, actorId: string) {
    const journey = await this.prisma.journey.findUnique({ where: { id: journeyId } });
    if (!journey) throw new NotFoundException('Journey not found.');
    if (journey.editorialStatus !== PublicationStatus.DRAFT && journey.editorialStatus !== PublicationStatus.IN_REVIEW) {
      throw new BadRequestException('Only a DRAFT or IN_REVIEW Journey can be scheduled.');
    }
    if (new Date(scheduledAt).getTime() <= Date.now()) {
      throw new BadRequestException('scheduledAt must be in the future.');
    }

    const updated = await this.prisma.journey.update({ where: { id: journeyId }, data: { scheduledAt: new Date(scheduledAt) } });
    await this.audit.log({ actorId, action: 'journey.scheduled', entityType: EntityKind.JOURNEY, entityId: journeyId, metadata: { scheduledAt } });
    return updated;
  }

  async addStop(journeyId: string, dto: AddJourneyStopDto, actorId: string) {
    const [journey, place, existing] = await Promise.all([
      this.prisma.journey.findUnique({ where: { id: journeyId } }),
      this.prisma.place.findUnique({ where: { id: dto.placeId } }),
      this.prisma.journeyStop.findMany({ where: { journeyId } }),
    ]);
    if (!journey) throw new NotFoundException('Journey not found.');
    if (!place) throw new BadRequestException('Journey stop references a Place that does not exist.');

    if (existing.some((s) => s.placeId === dto.placeId)) {
      throw new BadRequestException({
        code: EDITORIAL_ERROR_CODES.JOURNEY_DUPLICATE_STOP,
        message: 'This Place is already a stop on this Journey.',
      });
    }
    if (existing.some((s) => s.order === dto.order)) {
      throw new BadRequestException({
        code: EDITORIAL_ERROR_CODES.JOURNEY_INVALID_STOP_ORDER,
        message: `Stop order ${dto.order} is already used on this Journey.`,
      });
    }

    const stop = await this.prisma.journeyStop.create({
      data: {
        journeyId,
        placeId: dto.placeId,
        order: dto.order,
        stopTitle: dto.stopTitle,
        recommendedDurationMinutes: dto.recommendedDurationMinutes,
        notes: dto.notes,
        storyId: dto.storyId,
        eventId: dto.eventId,
      },
    });
    await this.snapshot(journeyId, actorId, 'journey.stop.added');
    return stop;
  }

  async removeStop(journeyId: string, stopId: string, actorId: string) {
    const stop = await this.prisma.journeyStop.findUnique({ where: { id: stopId } });
    if (!stop || stop.journeyId !== journeyId) throw new NotFoundException('Journey stop not found.');

    await this.prisma.journeyStop.delete({ where: { id: stopId } });
    await this.snapshot(journeyId, actorId, 'journey.stop.removed');
    return { removed: true };
  }

  /**
   * Deterministic reorder (spec section 26) using a two-phase write so the
   * `@@unique([journeyId, order])` constraint is never transiently violated:
   * every affected stop first moves to a unique negative placeholder order,
   * then each is set to its real final order - at every step no two rows
   * ever contend for the same order value.
   */
  async reorderStops(journeyId: string, dto: ReorderJourneyStopsDto, actorId: string) {
    const stops = await this.prisma.journeyStop.findMany({ where: { journeyId } });
    if (stops.length !== dto.stopIds.length || !stops.every((s) => dto.stopIds.includes(s.id))) {
      throw new BadRequestException({
        code: EDITORIAL_ERROR_CODES.JOURNEY_INVALID_STOP_ORDER,
        message: 'Reorder must include every existing stop for this Journey exactly once.',
      });
    }

    await this.prisma.$transaction(
      dto.stopIds.map((id, i) => this.prisma.journeyStop.update({ where: { id }, data: { order: -(i + 1) } })),
    );
    await this.prisma.$transaction(
      dto.stopIds.map((id, i) => this.prisma.journeyStop.update({ where: { id }, data: { order: i } })),
    );

    await this.snapshot(journeyId, actorId, 'journey.stops.reordered');
    return this.prisma.journeyStop.findMany({ where: { journeyId }, orderBy: { order: 'asc' } });
  }

  /** Structural publication checks (spec section 33) - never automated historical-truth verification. */
  private async validateForPublication(journey: Prisma.JourneyGetPayload<{ include: typeof JOURNEY_INCLUDE }>) {
    if (journey.translations.length === 0) {
      throw new BadRequestException('Cannot publish a Journey with no translations.');
    }
    if (journey.stops.length === 0) {
      throw new BadRequestException({ code: EDITORIAL_ERROR_CODES.JOURNEY_STOP_REQUIRED, message: 'Cannot publish a Journey with zero stops.' });
    }
    if (journey.heroMedia && (journey.heroMedia.status !== MediaAssetStatus.READY || journey.heroMedia.accessPolicy !== AccessPolicy.PUBLIC)) {
      throw new BadRequestException({ code: EDITORIAL_ERROR_CODES.JOURNEY_MEDIA_NOT_READY, message: 'Hero media must be READY and PUBLIC before the Journey can publish.' });
    }
    const unpublishedStopPlace = journey.stops.find((s) => s.place.publicationStatus !== PublicationStatus.PUBLISHED);
    if (unpublishedStopPlace) {
      throw new BadRequestException(`Cannot publish a Journey with a stop at an unpublished Place (${unpublishedStopPlace.placeId}).`);
    }
  }

  async setEditorialStatus(id: string, status: PublicationStatus, actorId: string, options: { notes?: string; expectedVersion?: number } = {}) {
    const journey = await this.prisma.journey.findUnique({ where: { id }, include: JOURNEY_INCLUDE });
    if (!journey) throw new NotFoundException('Journey not found.');

    if (options.expectedVersion !== undefined && options.expectedVersion !== journey.version) {
      throw new BadRequestException({
        code: EDITORIAL_ERROR_CODES.JOURNEY_VERSION_CONFLICT,
        message: `This Journey was edited by someone else (expected version ${options.expectedVersion}, current version ${journey.version}). Reload and retry.`,
      });
    }

    const allowed = FORWARD_TRANSITIONS[journey.editorialStatus] ?? [];
    if (!allowed.includes(status)) {
      throw new BadRequestException({
        code: EDITORIAL_ERROR_CODES.JOURNEY_INVALID_TRANSITION,
        message: `Cannot transition a Journey from ${journey.editorialStatus} to ${status}.`,
      });
    }

    if (status === PublicationStatus.PUBLISHED) {
      await this.validateForPublication(journey);
    }
    if (status === PublicationStatus.DRAFT && journey.editorialStatus !== PublicationStatus.DRAFT && !options.notes?.trim()) {
      throw new BadRequestException('Sending a Journey back to draft requires a documented reason.');
    }

    const updated = await this.prisma.journey.update({
      where: { id },
      data: {
        editorialStatus: status,
        version: { increment: 1 },
        publishedAt: status === PublicationStatus.PUBLISHED ? new Date() : journey.publishedAt,
        archivedAt: status === PublicationStatus.ARCHIVED ? new Date() : journey.archivedAt,
      },
    });
    await this.snapshot(id, actorId, `journey.editorialStatus.${status}`);
    return updated;
  }

  async archive(id: string, actorId: string, notes?: string) {
    return this.setEditorialStatus(id, PublicationStatus.ARCHIVED, actorId, { notes: notes ?? 'Archived by editorial decision.' });
  }

  private async snapshot(journeyId: string, actorId: string, note: string) {
    const journey = await this.prisma.journey.findUnique({ where: { id: journeyId }, include: JOURNEY_INCLUDE });
    await this.prisma.revision.create({
      data: {
        entityType: EntityKind.JOURNEY,
        entityId: journeyId,
        journeyId,
        snapshot: journey as unknown as Prisma.InputJsonValue,
        changeNote: note,
        changedById: actorId,
      },
    });
    await this.audit.log({ actorId, action: note, entityType: EntityKind.JOURNEY, entityId: journeyId });
  }
}
