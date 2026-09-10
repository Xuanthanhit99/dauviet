import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PublicationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ProviderRegistryService } from '../providers/provider-registry.service';
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
import {
  CreateProviderRestaurantReferenceDto,
  CreateRestaurantDto,
  MapProviderRestaurantReferenceDto,
  UpsertRestaurantTranslationDto,
} from './dto/restaurant.dto';

export interface PublicRestaurantListFilter {
  country?: string;
  region?: string;
  city?: string;
  cuisine?: string;
  locale: string;
  page: number;
  pageSize: number;
}

@Injectable()
export class RestaurantsService {
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
      const existing = await this.prisma.restaurant.findUnique({ where: { canonicalSlug: slug } });
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

  async create(dto: CreateRestaurantDto, actorId: string) {
    await this.assertHierarchyConsistency(dto.countryId, dto.regionId, dto.cityId);
    const canonical = dto.translations.find((t) => t.locale === 'vi') ?? dto.translations[0];
    if (!canonical) throw new BadRequestException('At least one translation is required.');
    const canonicalSlug = await this.ensureUniqueCanonicalSlug(toSlug(canonical.name));

    const restaurant = await this.prisma.restaurant.create({
      data: {
        countryId: dto.countryId,
        regionId: dto.regionId,
        cityId: dto.cityId,
        latitude: dto.latitude,
        longitude: dto.longitude,
        canonicalSlug,
        status: PublicationStatus.DRAFT,
        translations: { create: dto.translations.map((t) => ({ locale: t.locale, name: t.name, slug: toSlug(t.name), summary: t.summary, description: t.description, method: t.method ?? 'ORIGINAL' })) },
      },
      include: { translations: true },
    });
    await this.audit.log({ actorId, action: 'restaurant.created', entityType: 'RESTAURANT', entityId: restaurant.id });
    return restaurant;
  }

  async upsertTranslation(id: string, locale: string, dto: UpsertRestaurantTranslationDto, actorId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id } });
    if (!restaurant) throw new NotFoundException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.RESTAURANT_NOT_FOUND, message: 'Restaurant not found.' });
    const translation = await this.prisma.restaurantTranslation.upsert({
      where: { restaurantId_locale: { restaurantId: id, locale } },
      create: { restaurantId: id, locale, name: dto.name, slug: toSlug(dto.name), summary: dto.summary, description: dto.description, method: dto.method ?? 'ORIGINAL' },
      update: { name: dto.name, slug: toSlug(dto.name), summary: dto.summary, description: dto.description },
    });
    await this.audit.log({ actorId, action: 'restaurant.translation.upserted', entityType: 'RESTAURANT', entityId: id, metadata: { locale } });
    return translation;
  }

  async setStatus(id: string, status: PublicationStatus, actorId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id } });
    if (!restaurant) throw new NotFoundException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.RESTAURANT_NOT_FOUND, message: 'Restaurant not found.' });
    const updated = await this.prisma.restaurant.update({ where: { id }, data: { status } });
    await this.audit.log({ actorId, action: 'restaurant.status.changed', entityType: 'RESTAURANT', entityId: id, metadata: { status } });
    return updated;
  }

  async setCuisines(id: string, cuisineIds: string[], actorId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id } });
    if (!restaurant) throw new NotFoundException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.RESTAURANT_NOT_FOUND, message: 'Restaurant not found.' });
    const uniqueIds = [...new Set(cuisineIds)];
    if (uniqueIds.length) {
      const found = await this.prisma.cuisine.findMany({ where: { id: { in: uniqueIds } }, select: { id: true } });
      if (found.length !== uniqueIds.length) throw new NotFoundException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.CUISINE_NOT_FOUND, message: 'One or more cuisineIds do not exist.' });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.restaurantCuisine.deleteMany({ where: { restaurantId: id } });
      if (uniqueIds.length) await tx.restaurantCuisine.createMany({ data: uniqueIds.map((cuisineId) => ({ restaurantId: id, cuisineId })) });
      await this.audit.log({ actorId, action: 'restaurant.cuisines.set', entityType: 'RESTAURANT', entityId: id, metadata: { count: uniqueIds.length } }, tx);
    });
    return this.prisma.restaurantCuisine.findMany({ where: { restaurantId: id } });
  }

  async setDishes(id: string, dishIds: string[], actorId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id } });
    if (!restaurant) throw new NotFoundException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.RESTAURANT_NOT_FOUND, message: 'Restaurant not found.' });
    const uniqueIds = [...new Set(dishIds)];
    if (uniqueIds.length) {
      const found = await this.prisma.dish.findMany({ where: { id: { in: uniqueIds } }, select: { id: true } });
      if (found.length !== uniqueIds.length) throw new NotFoundException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.DISH_NOT_FOUND, message: 'One or more dishIds do not exist.' });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.restaurantDish.deleteMany({ where: { restaurantId: id } });
      if (uniqueIds.length) await tx.restaurantDish.createMany({ data: uniqueIds.map((dishId) => ({ restaurantId: id, dishId })) });
      await this.audit.log({ actorId, action: 'restaurant.dishes.set', entityType: 'RESTAURANT', entityId: id, metadata: { count: uniqueIds.length } }, tx);
    });
    return this.prisma.restaurantDish.findMany({ where: { restaurantId: id } });
  }

  async setDestinations(id: string, destinationIds: string[], actorId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id } });
    if (!restaurant) throw new NotFoundException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.RESTAURANT_NOT_FOUND, message: 'Restaurant not found.' });
    const uniqueIds = [...new Set(destinationIds)];
    if (uniqueIds.length) {
      const found = await this.prisma.destination.findMany({ where: { id: { in: uniqueIds } }, select: { id: true } });
      if (found.length !== uniqueIds.length) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.DESTINATION_NOT_FOUND, message: 'One or more destinationIds do not exist.' });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.destinationRestaurant.deleteMany({ where: { restaurantId: id } });
      if (uniqueIds.length) await tx.destinationRestaurant.createMany({ data: uniqueIds.map((destinationId, index) => ({ destinationId, restaurantId: id, sortOrder: index })) });
      await this.audit.log({ actorId, action: 'restaurant.destinations.set', entityType: 'RESTAURANT', entityId: id, metadata: { count: uniqueIds.length } }, tx);
    });
    return this.prisma.destinationRestaurant.findMany({ where: { restaurantId: id }, orderBy: { sortOrder: 'asc' } });
  }

  async listPublic(filter: PublicRestaurantListFilter) {
    const { country, region, city, cuisine, locale, page, pageSize } = filter;
    const [countryId, regionId, cityRow, cuisineRow] = await Promise.all([
      resolvePublicCountryId(this.prisma, country),
      resolvePublicRegionId(this.prisma, region),
      city ? this.prisma.city.findFirst({ where: { status: PublicationStatus.PUBLISHED, OR: [{ canonicalSlug: city }, { id: city }] } }) : undefined,
      cuisine ? this.prisma.cuisine.findFirst({ where: { status: PublicationStatus.PUBLISHED, OR: [{ canonicalSlug: cuisine }, { id: cuisine }] } }) : undefined,
    ]);
    if (countryId === GEOGRAPHY_FILTER_UNRESOLVED) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.COUNTRY_NOT_FOUND, message: 'Country not found.' });
    if (regionId === GEOGRAPHY_FILTER_UNRESOLVED) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.REGION_NOT_FOUND, message: 'Region not found.' });
    if (city && !cityRow) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.CITY_NOT_FOUND, message: 'City not found.' });
    if (cuisine && !cuisineRow) throw new NotFoundException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.CUISINE_NOT_FOUND, message: 'Cuisine not found.' });

    const where: Prisma.RestaurantWhereInput = {
      status: PublicationStatus.PUBLISHED,
      countryId,
      regionId,
      cityId: cityRow?.id,
      cuisineLinks: cuisineRow ? { some: { cuisineId: cuisineRow.id } } : undefined,
    };
    const [total, restaurants] = await this.prisma.$transaction([
      this.prisma.restaurant.count({ where }),
      this.prisma.restaurant.findMany({ where, include: { translations: true }, orderBy: [{ canonicalSlug: 'asc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    const items = restaurants.map((r) => {
      const { translation } = resolveTranslation(r.translations, locale);
      return { id: r.id, slug: r.canonicalSlug, name: translation?.name ?? r.canonicalSlug, summary: translation?.summary ?? null };
    });
    return { items, page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
  }

  async findBySlug(slug: string, locale: string, includeUnpublished = false) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { canonicalSlug: slug },
      include: {
        translations: true,
        country: true,
        region: true,
        city: true,
        cuisineLinks: { include: { cuisine: { include: { translations: true } } } },
        providerReferences: { where: { status: 'ACTIVE' }, include: { provider: true } },
      },
    });
    if (!restaurant) throw new NotFoundException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.RESTAURANT_NOT_FOUND, message: 'Restaurant not found.' });
    if (!includeUnpublished && restaurant.status !== PublicationStatus.PUBLISHED) {
      throw new NotFoundException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.RESTAURANT_NOT_FOUND, message: 'Restaurant not found.' });
    }
    const { translation, resolvedLocale, fallbackApplied } = resolveTranslation(restaurant.translations, locale);
    const cuisines = restaurant.cuisineLinks.map((link) => {
      const { translation: cuisineTranslation } = resolveTranslation(link.cuisine.translations, locale);
      return { id: link.cuisine.id, slug: link.cuisine.canonicalSlug, name: cuisineTranslation?.name ?? link.cuisine.canonicalSlug };
    });
    return {
      id: restaurant.id,
      slug: restaurant.canonicalSlug,
      status: restaurant.status,
      country: { id: restaurant.country.id, slug: restaurant.country.canonicalSlug },
      region: restaurant.region ? { id: restaurant.region.id, slug: restaurant.region.canonicalSlug } : null,
      city: restaurant.city ? { id: restaurant.city.id, slug: restaurant.city.canonicalSlug } : null,
      translation,
      cuisines,
      providers: restaurant.providerReferences.map((r) => ({ providerCode: r.provider.code, externalUrl: r.externalUrl })),
      meta: { requestedLocale: locale, resolvedLocale, fallbackApplied },
    };
  }

  async upsertProviderReference(dto: CreateProviderRestaurantReferenceDto, actorId: string) {
    const access = await this.registry.getExecutionContext({ providerCode: dto.providerCode, environment: 'SANDBOX', capability: 'RESTAURANT_SEARCH', usage: 'store' });
    if (!access.ok) throw new NotFoundException({ code: access.code, message: access.message });
    const reference = await this.prisma.providerRestaurantReference.upsert({
      where: { providerId_externalEntityId: { providerId: access.context.providerId, externalEntityId: dto.externalEntityId } },
      create: { providerId: access.context.providerId, externalEntityId: dto.externalEntityId, externalUrl: dto.externalUrl, lastSeenAt: new Date() },
      update: { externalUrl: dto.externalUrl, lastSeenAt: new Date() },
    });
    await this.audit.log({ actorId, action: 'restaurant.provider_reference.upserted', entityType: 'RESTAURANT', entityId: reference.id, metadata: { providerCode: dto.providerCode } });
    return reference;
  }

  async mapProviderReference(referenceId: string, dto: MapProviderRestaurantReferenceDto, actorId: string) {
    const reference = await this.prisma.providerRestaurantReference.findUnique({ where: { id: referenceId } });
    if (!reference) throw new NotFoundException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.PROVIDER_REFERENCE_NOT_FOUND, message: 'Provider reference not found.' });
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id: dto.restaurantId } });
    if (!restaurant) throw new NotFoundException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.RESTAURANT_NOT_FOUND, message: 'Restaurant not found.' });
    const updated = await this.prisma.providerRestaurantReference.update({ where: { id: referenceId }, data: { restaurantId: dto.restaurantId, status: 'ACTIVE' } });
    await this.audit.log({
      actorId,
      action: 'restaurant.provider_reference.mapped',
      entityType: 'RESTAURANT',
      entityId: referenceId,
      metadata: { before: reference.restaurantId, after: dto.restaurantId },
    });
    return updated;
  }

  /**
   * Operational snapshot (spec section 36-39/65) - gated at serve time,
   * never merges providers into one cross-provider rating (spec 38/50), and
   * never presents an expired snapshot as current (spec 25/35/83).
   */
  async getOperationalSnapshot(slug: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { canonicalSlug: slug },
      include: { providerReferences: { where: { status: 'ACTIVE' }, include: { provider: true, operationalSnapshots: { orderBy: { fetchedAt: 'desc' }, take: 1 } } } },
    });
    if (!restaurant || restaurant.status !== PublicationStatus.PUBLISHED) {
      throw new NotFoundException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.RESTAURANT_NOT_FOUND, message: 'Restaurant not found.' });
    }

    const now = new Date();
    const snapshots: unknown[] = [];
    for (const reference of restaurant.providerReferences) {
      const access = await this.registry.getExecutionContext({ providerCode: reference.provider.code, environment: 'SANDBOX', capability: 'RESTAURANT_DETAIL' });
      if (!access.ok) continue; // fail-closed per provider, failure isolated (spec 59/93)
      const snapshot = reference.operationalSnapshots[0];
      if (!snapshot) continue;
      if (snapshot.expiresAt && snapshot.expiresAt <= now) continue; // never present a stale snapshot as current
      snapshots.push({
        providerCode: reference.provider.code,
        address: snapshot.address,
        phone: snapshot.phone,
        website: snapshot.website,
        priceLevel: snapshot.priceLevel,
        openingHours: snapshot.openingHours,
        timezone: snapshot.timezone,
        temporaryClosure: snapshot.temporaryClosure,
        permanentlyClosed: snapshot.permanentlyClosed,
        providerRating: snapshot.providerRating,
        providerRatingCount: snapshot.providerRatingCount,
        fetchedAt: snapshot.fetchedAt,
        attribution: { requirement: access.context.attribution.requirement, displayText: access.context.attribution.displayText, logoRequired: access.context.attribution.logoRequired },
      });
    }
    return { restaurantSlug: slug, snapshots };
  }
}
