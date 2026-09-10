import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PublicationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { resolveTranslation } from '../../common/translation/resolve-translation.util';
import { toSlug } from '../../common/util/slug.util';
import { GEOGRAPHY_ERROR_CODES } from '../../common/errors/geography-error-codes';
import { STAY_FOOD_ACTIVITY_ERROR_CODES } from '../../common/errors/stay-food-activity-error-codes';
import {
  assertSameCountry,
  GEOGRAPHY_FILTER_UNRESOLVED,
  resolvePublicCountryId,
  resolvePublicRegionId,
} from '../../common/geography/geography-consistency.util';
import { CreateAttractionDto, UpsertAttractionTranslationDto } from './dto/attraction.dto';

export interface PublicAttractionListFilter {
  country?: string;
  region?: string;
  city?: string;
  locale: string;
  page: number;
  pageSize: number;
}

@Injectable()
export class AttractionsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private async ensureUniqueCanonicalSlug(base: string): Promise<string> {
    let slug = base;
    let suffix = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const existing = await this.prisma.attraction.findUnique({ where: { canonicalSlug: slug } });
      if (!existing) return slug;
      suffix += 1;
      slug = `${base}-${suffix}`;
    }
  }

  private async assertHierarchyConsistency(countryId: string, regionId?: string | null, cityId?: string | null) {
    const country = await this.prisma.country.findUnique({ where: { id: countryId } });
    if (!country) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.COUNTRY_NOT_FOUND, message: `No Country with id ${countryId}.` });
    if (cityId) {
      const city = await this.prisma.city.findUnique({ where: { id: cityId } });
      if (!city) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.CITY_NOT_FOUND, message: `No City with id ${cityId}.` });
      assertSameCountry(city, countryId, 'cityId must belong to the same country as countryId.');
    }
    if (regionId) {
      const region = await this.prisma.region.findUnique({ where: { id: regionId } });
      if (!region) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.REGION_NOT_FOUND, message: `No Region with id ${regionId}.` });
      assertSameCountry(region, countryId, 'regionId must belong to the same country as countryId.');
    }
  }

  async create(dto: CreateAttractionDto, actorId: string) {
    await this.assertHierarchyConsistency(dto.countryId, dto.regionId, dto.cityId);
    if (dto.placeId) {
      const place = await this.prisma.place.findUnique({ where: { id: dto.placeId } });
      if (!place) throw new NotFoundException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.ATTRACTION_PLACE_NOT_FOUND, message: `No Place with id ${dto.placeId}.` });
    }
    const canonical = dto.translations.find((t) => t.locale === 'vi') ?? dto.translations[0];
    if (!canonical) throw new BadRequestException('At least one translation is required.');
    const canonicalSlug = await this.ensureUniqueCanonicalSlug(toSlug(canonical.name));

    const attraction = await this.prisma.attraction.create({
      data: {
        countryId: dto.countryId,
        regionId: dto.regionId,
        cityId: dto.cityId,
        placeId: dto.placeId,
        latitude: dto.latitude,
        longitude: dto.longitude,
        canonicalSlug,
        status: PublicationStatus.DRAFT,
        translations: { create: dto.translations.map((t) => ({ locale: t.locale, name: t.name, slug: toSlug(t.name), summary: t.summary, description: t.description, method: t.method ?? 'ORIGINAL' })) },
      },
      include: { translations: true },
    });
    await this.audit.log({ actorId, action: 'attraction.created', entityType: 'ATTRACTION', entityId: attraction.id });
    return attraction;
  }

  async upsertTranslation(id: string, locale: string, dto: UpsertAttractionTranslationDto, actorId: string) {
    const attraction = await this.prisma.attraction.findUnique({ where: { id } });
    if (!attraction) throw new NotFoundException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.ATTRACTION_NOT_FOUND, message: 'Attraction not found.' });
    const translation = await this.prisma.attractionTranslation.upsert({
      where: { attractionId_locale: { attractionId: id, locale } },
      create: { attractionId: id, locale, name: dto.name, slug: toSlug(dto.name), summary: dto.summary, description: dto.description, method: dto.method ?? 'ORIGINAL' },
      update: { name: dto.name, slug: toSlug(dto.name), summary: dto.summary, description: dto.description },
    });
    await this.audit.log({ actorId, action: 'attraction.translation.upserted', entityType: 'ATTRACTION', entityId: id, metadata: { locale } });
    return translation;
  }

  async setStatus(id: string, status: PublicationStatus, actorId: string) {
    const attraction = await this.prisma.attraction.findUnique({ where: { id } });
    if (!attraction) throw new NotFoundException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.ATTRACTION_NOT_FOUND, message: 'Attraction not found.' });
    const updated = await this.prisma.attraction.update({ where: { id }, data: { status } });
    await this.audit.log({ actorId, action: 'attraction.status.changed', entityType: 'ATTRACTION', entityId: id, metadata: { status } });
    return updated;
  }

  async setDestinations(id: string, destinationIds: string[], actorId: string) {
    const attraction = await this.prisma.attraction.findUnique({ where: { id } });
    if (!attraction) throw new NotFoundException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.ATTRACTION_NOT_FOUND, message: 'Attraction not found.' });
    const uniqueIds = [...new Set(destinationIds)];
    if (uniqueIds.length) {
      const found = await this.prisma.destination.findMany({ where: { id: { in: uniqueIds } }, select: { id: true } });
      if (found.length !== uniqueIds.length) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.DESTINATION_NOT_FOUND, message: 'One or more destinationIds do not exist.' });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.destinationAttraction.deleteMany({ where: { attractionId: id } });
      if (uniqueIds.length) await tx.destinationAttraction.createMany({ data: uniqueIds.map((destinationId, index) => ({ destinationId, attractionId: id, sortOrder: index })) });
      await this.audit.log({ actorId, action: 'attraction.destinations.set', entityType: 'ATTRACTION', entityId: id, metadata: { count: uniqueIds.length } }, tx);
    });
    return this.prisma.destinationAttraction.findMany({ where: { attractionId: id }, orderBy: { sortOrder: 'asc' } });
  }

  async listPublic(filter: PublicAttractionListFilter) {
    const { country, region, city, locale, page, pageSize } = filter;
    const [countryId, regionId, cityRow] = await Promise.all([
      resolvePublicCountryId(this.prisma, country),
      resolvePublicRegionId(this.prisma, region),
      city ? this.prisma.city.findFirst({ where: { status: PublicationStatus.PUBLISHED, OR: [{ canonicalSlug: city }, { id: city }] } }) : undefined,
    ]);
    if (countryId === GEOGRAPHY_FILTER_UNRESOLVED) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.COUNTRY_NOT_FOUND, message: 'Country not found.' });
    if (regionId === GEOGRAPHY_FILTER_UNRESOLVED) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.REGION_NOT_FOUND, message: 'Region not found.' });
    if (city && !cityRow) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.CITY_NOT_FOUND, message: 'City not found.' });

    const where: Prisma.AttractionWhereInput = { status: PublicationStatus.PUBLISHED, countryId, regionId, cityId: cityRow?.id };
    const [total, attractions] = await this.prisma.$transaction([
      this.prisma.attraction.count({ where }),
      this.prisma.attraction.findMany({ where, include: { translations: true }, orderBy: [{ canonicalSlug: 'asc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    const items = attractions.map((a) => {
      const { translation } = resolveTranslation(a.translations, locale);
      return { id: a.id, slug: a.canonicalSlug, name: translation?.name ?? a.canonicalSlug, summary: translation?.summary ?? null };
    });
    return { items, page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
  }

  async findBySlug(slug: string, locale: string, includeUnpublished = false) {
    const attraction = await this.prisma.attraction.findUnique({
      where: { canonicalSlug: slug },
      include: { translations: true, country: true, region: true, city: true, place: { include: { translations: true } } },
    });
    if (!attraction) throw new NotFoundException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.ATTRACTION_NOT_FOUND, message: 'Attraction not found.' });
    if (!includeUnpublished && attraction.status !== PublicationStatus.PUBLISHED) {
      throw new NotFoundException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.ATTRACTION_NOT_FOUND, message: 'Attraction not found.' });
    }
    const { translation, resolvedLocale, fallbackApplied } = resolveTranslation(attraction.translations, locale);
    // Place link is a typed mapping only - never exposes HistoricalFact/
    // Citation internals here (that trust-critical content stays behind
    // Place's own public endpoint, spec section 42/56).
    const place = attraction.place && attraction.place.publicationStatus === PublicationStatus.PUBLISHED ? { id: attraction.place.id, slug: attraction.place.canonicalSlug } : null;
    return {
      id: attraction.id,
      slug: attraction.canonicalSlug,
      status: attraction.status,
      country: { id: attraction.country.id, slug: attraction.country.canonicalSlug },
      region: attraction.region ? { id: attraction.region.id, slug: attraction.region.canonicalSlug } : null,
      city: attraction.city ? { id: attraction.city.id, slug: attraction.city.canonicalSlug } : null,
      place,
      translation,
      meta: { requestedLocale: locale, resolvedLocale, fallbackApplied },
    };
  }
}
