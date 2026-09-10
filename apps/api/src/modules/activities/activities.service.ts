import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PublicationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ProviderRegistryService } from '../providers/provider-registry.service';
import { resolveTranslation } from '../../common/translation/resolve-translation.util';
import { toSlug } from '../../common/util/slug.util';
import { GEOGRAPHY_ERROR_CODES } from '../../common/errors/geography-error-codes';
import { STAY_FOOD_ACTIVITY_ERROR_CODES } from '../../common/errors/stay-food-activity-error-codes';
import { GEOGRAPHY_FILTER_UNRESOLVED, resolvePublicCountryId } from '../../common/geography/geography-consistency.util';
import {
  CreateActivityDto,
  CreateProviderActivityReferenceDto,
  GetActivityOffersDto,
  MapProviderActivityReferenceDto,
  UpsertActivityTranslationDto,
} from './dto/activity.dto';

export interface PublicActivityListFilter {
  country?: string;
  destination?: string;
  locale: string;
  page: number;
  pageSize: number;
}

@Injectable()
export class ActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly registry: ProviderRegistryService,
  ) {}

  private async ensureUniqueCanonicalSlug(base: string): Promise<string> {
    let slug = base;
    let suffix = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const existing = await this.prisma.activity.findUnique({ where: { canonicalSlug: slug } });
      if (!existing) return slug;
      suffix += 1;
      slug = `${base}-${suffix}`;
    }
  }

  async create(dto: CreateActivityDto, actorId: string) {
    const country = await this.prisma.country.findUnique({ where: { id: dto.countryId } });
    if (!country) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.COUNTRY_NOT_FOUND, message: `No Country with id ${dto.countryId}.` });
    if (dto.attractionId) {
      const attraction = await this.prisma.attraction.findUnique({ where: { id: dto.attractionId } });
      if (!attraction) throw new NotFoundException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.ATTRACTION_NOT_FOUND, message: `No Attraction with id ${dto.attractionId}.` });
    }
    const canonical = dto.translations.find((t) => t.locale === 'vi') ?? dto.translations[0];
    if (!canonical) throw new BadRequestException('At least one translation is required.');
    const canonicalSlug = await this.ensureUniqueCanonicalSlug(toSlug(canonical.name));

    const activity = await this.prisma.activity.create({
      data: {
        countryId: dto.countryId,
        regionId: dto.regionId,
        cityId: dto.cityId,
        attractionId: dto.attractionId,
        canonicalSlug,
        status: PublicationStatus.DRAFT,
        translations: { create: dto.translations.map((t) => ({ locale: t.locale, name: t.name, slug: toSlug(t.name), summary: t.summary, description: t.description, method: t.method ?? 'ORIGINAL' })) },
      },
      include: { translations: true },
    });
    await this.audit.log({ actorId, action: 'activity.created', entityType: 'ACTIVITY', entityId: activity.id });
    return activity;
  }

  async upsertTranslation(id: string, locale: string, dto: UpsertActivityTranslationDto, actorId: string) {
    const activity = await this.prisma.activity.findUnique({ where: { id } });
    if (!activity) throw new NotFoundException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.ACTIVITY_NOT_FOUND, message: 'Activity not found.' });
    const translation = await this.prisma.activityTranslation.upsert({
      where: { activityId_locale: { activityId: id, locale } },
      create: { activityId: id, locale, name: dto.name, slug: toSlug(dto.name), summary: dto.summary, description: dto.description, method: dto.method ?? 'ORIGINAL' },
      update: { name: dto.name, slug: toSlug(dto.name), summary: dto.summary, description: dto.description },
    });
    await this.audit.log({ actorId, action: 'activity.translation.upserted', entityType: 'ACTIVITY', entityId: id, metadata: { locale } });
    return translation;
  }

  async setStatus(id: string, status: PublicationStatus, actorId: string) {
    const activity = await this.prisma.activity.findUnique({ where: { id } });
    if (!activity) throw new NotFoundException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.ACTIVITY_NOT_FOUND, message: 'Activity not found.' });
    const updated = await this.prisma.activity.update({ where: { id }, data: { status } });
    await this.audit.log({ actorId, action: 'activity.status.changed', entityType: 'ACTIVITY', entityId: id, metadata: { status } });
    return updated;
  }

  async setDestinations(id: string, destinationIds: string[], actorId: string) {
    const activity = await this.prisma.activity.findUnique({ where: { id } });
    if (!activity) throw new NotFoundException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.ACTIVITY_NOT_FOUND, message: 'Activity not found.' });
    const uniqueIds = [...new Set(destinationIds)];
    if (uniqueIds.length) {
      const found = await this.prisma.destination.findMany({ where: { id: { in: uniqueIds } }, select: { id: true } });
      if (found.length !== uniqueIds.length) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.DESTINATION_NOT_FOUND, message: 'One or more destinationIds do not exist.' });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.destinationActivity.deleteMany({ where: { activityId: id } });
      if (uniqueIds.length) await tx.destinationActivity.createMany({ data: uniqueIds.map((destinationId, index) => ({ destinationId, activityId: id, sortOrder: index })) });
      await this.audit.log({ actorId, action: 'activity.destinations.set', entityType: 'ACTIVITY', entityId: id, metadata: { count: uniqueIds.length } }, tx);
    });
    return this.prisma.destinationActivity.findMany({ where: { activityId: id }, orderBy: { sortOrder: 'asc' } });
  }

  async listPublic(filter: PublicActivityListFilter) {
    const { country, destination, locale, page, pageSize } = filter;
    const [countryId, destinationRow] = await Promise.all([
      resolvePublicCountryId(this.prisma, country),
      destination ? this.prisma.destination.findFirst({ where: { status: PublicationStatus.PUBLISHED, OR: [{ canonicalSlug: destination }, { id: destination }] } }) : undefined,
    ]);
    if (countryId === GEOGRAPHY_FILTER_UNRESOLVED) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.COUNTRY_NOT_FOUND, message: 'Country not found.' });
    if (destination && !destinationRow) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.DESTINATION_NOT_FOUND, message: 'Destination not found.' });

    const where: Prisma.ActivityWhereInput = { status: PublicationStatus.PUBLISHED, countryId, destinationLinks: destinationRow ? { some: { destinationId: destinationRow.id } } : undefined };
    const [total, activities] = await this.prisma.$transaction([
      this.prisma.activity.count({ where }),
      this.prisma.activity.findMany({ where, include: { translations: true }, orderBy: [{ canonicalSlug: 'asc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    const items = activities.map((a) => {
      const { translation } = resolveTranslation(a.translations, locale);
      return { id: a.id, slug: a.canonicalSlug, name: translation?.name ?? a.canonicalSlug, summary: translation?.summary ?? null };
    });
    return { items, page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
  }

  async findBySlug(slug: string, locale: string, includeUnpublished = false) {
    const activity = await this.prisma.activity.findUnique({
      where: { canonicalSlug: slug },
      include: { translations: true, country: true, attraction: { include: { translations: true } }, providerReferences: { where: { status: 'ACTIVE' }, include: { provider: true } } },
    });
    if (!activity) throw new NotFoundException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.ACTIVITY_NOT_FOUND, message: 'Activity not found.' });
    if (!includeUnpublished && activity.status !== PublicationStatus.PUBLISHED) {
      throw new NotFoundException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.ACTIVITY_NOT_FOUND, message: 'Activity not found.' });
    }
    const { translation, resolvedLocale, fallbackApplied } = resolveTranslation(activity.translations, locale);
    const attraction =
      activity.attraction && activity.attraction.status === PublicationStatus.PUBLISHED ? { id: activity.attraction.id, slug: activity.attraction.canonicalSlug } : null;
    return {
      id: activity.id,
      slug: activity.canonicalSlug,
      status: activity.status,
      country: { id: activity.country.id, slug: activity.country.canonicalSlug },
      attraction,
      translation,
      providers: activity.providerReferences.map((r) => ({ providerCode: r.provider.code, externalUrl: r.externalUrl })),
      meta: { requestedLocale: locale, resolvedLocale, fallbackApplied },
    };
  }

  async upsertProviderReference(dto: CreateProviderActivityReferenceDto, actorId: string) {
    const access = await this.registry.getExecutionContext({ providerCode: dto.providerCode, environment: 'SANDBOX', capability: 'ACTIVITY_SEARCH', usage: 'store' });
    if (!access.ok) throw new NotFoundException({ code: access.code, message: access.message });
    const reference = await this.prisma.providerActivityReference.upsert({
      where: { providerId_externalEntityId: { providerId: access.context.providerId, externalEntityId: dto.externalEntityId } },
      create: { providerId: access.context.providerId, externalEntityId: dto.externalEntityId, externalUrl: dto.externalUrl, destinationId: dto.destinationId, lastSeenAt: new Date() },
      update: { externalUrl: dto.externalUrl, lastSeenAt: new Date() },
    });
    await this.audit.log({ actorId, action: 'activity.provider_reference.upserted', entityType: 'ACTIVITY', entityId: reference.id, metadata: { providerCode: dto.providerCode } });
    return reference;
  }

  async mapProviderReference(referenceId: string, dto: MapProviderActivityReferenceDto, actorId: string) {
    const reference = await this.prisma.providerActivityReference.findUnique({ where: { id: referenceId } });
    if (!reference) throw new NotFoundException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.PROVIDER_REFERENCE_NOT_FOUND, message: 'Provider reference not found.' });
    const activity = await this.prisma.activity.findUnique({ where: { id: dto.activityId } });
    if (!activity) throw new NotFoundException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.ACTIVITY_NOT_FOUND, message: 'Activity not found.' });
    const updated = await this.prisma.providerActivityReference.update({ where: { id: referenceId }, data: { activityId: dto.activityId, status: 'ACTIVE' } });
    await this.audit.log({
      actorId,
      action: 'activity.provider_reference.mapped',
      entityType: 'ACTIVITY',
      entityId: referenceId,
      metadata: { before: reference.activityId, after: dto.activityId },
    });
    return updated;
  }

  async getOffers(slug: string, dto: GetActivityOffersDto) {
    const date = new Date(`${dto.date}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) throw new BadRequestException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.OFFER_CONTEXT_INVALID, message: 'date must be a valid calendar date.' });
    if (dto.participants < 1) throw new BadRequestException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.INVALID_OCCUPANCY, message: 'participants must be at least 1.' });

    const activity = await this.prisma.activity.findUnique({ where: { canonicalSlug: slug }, include: { providerReferences: { where: { status: 'ACTIVE' }, include: { provider: true } } } });
    if (!activity || activity.status !== PublicationStatus.PUBLISHED) {
      throw new NotFoundException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.ACTIVITY_NOT_FOUND, message: 'Activity not found.' });
    }

    const now = new Date();
    const results: unknown[] = [];
    for (const reference of activity.providerReferences) {
      const access = await this.registry.getExecutionContext({ providerCode: reference.provider.code, environment: 'SANDBOX', capability: 'LIVE_PRICE' });
      if (!access.ok) continue; // fail-closed per reference, failure isolated (spec 59/93)
      const offers = await this.prisma.activityOffer.findMany({
        where: { providerReferenceId: reference.id, activityDate: date, currency: dto.currency, participants: { gte: dto.participants } },
        orderBy: { fetchedAt: 'desc' },
        take: 5,
      });
      for (const offer of offers) {
        if (offer.expiresAt && offer.expiresAt <= now) continue; // never present an expired offer as current
        results.push({
          providerCode: reference.provider.code,
          date: dto.date,
          currency: offer.currency,
          amount: offer.amount.toString(),
          durationMinutes: offer.durationMinutes,
          availability: offer.availability,
          bookingUrl: offer.bookingUrl,
          fetchedAt: offer.fetchedAt,
          attribution: { requirement: access.context.attribution.requirement, displayText: access.context.attribution.displayText, logoRequired: access.context.attribution.logoRequired },
        });
      }
    }
    return { activitySlug: slug, date: dto.date, participants: dto.participants, currency: dto.currency, offers: results };
  }
}
