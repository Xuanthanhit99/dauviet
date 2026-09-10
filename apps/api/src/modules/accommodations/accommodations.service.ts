import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AccommodationType, Prisma, PublicationStatus } from '@prisma/client';
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
  CreateAccommodationDto,
  CreateProviderAccommodationReferenceDto,
  GetAccommodationOffersDto,
  MapProviderAccommodationReferenceDto,
  UpdateAccommodationDto,
  UpsertAccommodationTranslationDto,
} from './dto/accommodation.dto';

export interface AccommodationListFilter {
  countryId?: string;
  regionId?: string;
  cityId?: string;
  destinationId?: string;
  type?: AccommodationType;
  locale: string;
  page: number;
  pageSize: number;
}

export interface PublicAccommodationListFilter {
  country?: string;
  region?: string;
  city?: string;
  destination?: string;
  type?: AccommodationType;
  locale: string;
  page: number;
  pageSize: number;
}

async function resolvePublicDestinationId(prisma: PrismaService, value: string | undefined) {
  if (!value) return undefined;
  const destination = await prisma.destination.findFirst({
    where: { status: PublicationStatus.PUBLISHED, OR: [{ canonicalSlug: value }, { id: value }] },
  });
  return destination ? destination.id : GEOGRAPHY_FILTER_UNRESOLVED;
}

@Injectable()
export class AccommodationsService {
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
      const existing = await this.prisma.accommodation.findUnique({ where: { canonicalSlug: slug } });
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

  async create(dto: CreateAccommodationDto, actorId: string) {
    await this.assertHierarchyConsistency(dto.countryId, dto.regionId, dto.cityId);
    const canonical = dto.translations.find((t) => t.locale === 'vi') ?? dto.translations[0];
    if (!canonical) throw new BadRequestException('At least one translation is required.');
    const canonicalSlug = await this.ensureUniqueCanonicalSlug(toSlug(canonical.name));

    const accommodation = await this.prisma.accommodation.create({
      data: {
        countryId: dto.countryId,
        regionId: dto.regionId,
        cityId: dto.cityId,
        type: dto.type,
        latitude: dto.latitude,
        longitude: dto.longitude,
        heroMediaId: dto.heroMediaId,
        canonicalSlug,
        status: PublicationStatus.DRAFT,
        translations: {
          create: dto.translations.map((t) => ({
            locale: t.locale,
            name: t.name,
            slug: toSlug(t.name),
            summary: t.summary,
            description: t.description,
            seoTitle: t.seoTitle,
            seoDescription: t.seoDescription,
            method: t.method ?? 'ORIGINAL',
          })),
        },
      },
      include: { translations: true },
    });

    await this.audit.log({ actorId, action: 'accommodation.created', entityType: 'ACCOMMODATION', entityId: accommodation.id });
    return accommodation;
  }

  async update(id: string, dto: UpdateAccommodationDto, actorId: string) {
    const accommodation = await this.prisma.accommodation.findUnique({ where: { id } });
    if (!accommodation) throw new NotFoundException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.ACCOMMODATION_NOT_FOUND, message: 'Accommodation not found.' });

    const nextRegionId = dto.regionId !== undefined ? dto.regionId : accommodation.regionId;
    const nextCityId = dto.cityId !== undefined ? dto.cityId : accommodation.cityId;
    await this.assertHierarchyConsistency(accommodation.countryId, nextRegionId, nextCityId);

    const updated = await this.prisma.accommodation.update({
      where: { id },
      data: { regionId: dto.regionId, cityId: dto.cityId, type: dto.type, latitude: dto.latitude, longitude: dto.longitude, heroMediaId: dto.heroMediaId },
    });
    await this.audit.log({ actorId, action: 'accommodation.updated', entityType: 'ACCOMMODATION', entityId: id });
    return updated;
  }

  async upsertTranslation(id: string, locale: string, dto: UpsertAccommodationTranslationDto, actorId: string) {
    const accommodation = await this.prisma.accommodation.findUnique({ where: { id } });
    if (!accommodation) throw new NotFoundException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.ACCOMMODATION_NOT_FOUND, message: 'Accommodation not found.' });

    const translation = await this.prisma.accommodationTranslation.upsert({
      where: { accommodationId_locale: { accommodationId: id, locale } },
      create: {
        accommodationId: id,
        locale,
        name: dto.name,
        slug: toSlug(dto.name),
        summary: dto.summary,
        description: dto.description,
        seoTitle: dto.seoTitle,
        seoDescription: dto.seoDescription,
        method: dto.method ?? 'ORIGINAL',
      },
      update: { name: dto.name, slug: toSlug(dto.name), summary: dto.summary, description: dto.description, seoTitle: dto.seoTitle, seoDescription: dto.seoDescription },
    });
    await this.audit.log({ actorId, action: 'accommodation.translation.upserted', entityType: 'ACCOMMODATION', entityId: id, metadata: { locale } });
    return translation;
  }

  async setStatus(id: string, status: PublicationStatus, actorId: string) {
    const accommodation = await this.prisma.accommodation.findUnique({ where: { id } });
    if (!accommodation) throw new NotFoundException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.ACCOMMODATION_NOT_FOUND, message: 'Accommodation not found.' });
    const updated = await this.prisma.accommodation.update({ where: { id }, data: { status } });
    await this.audit.log({ actorId, action: 'accommodation.status.changed', entityType: 'ACCOMMODATION', entityId: id, metadata: { status } });
    return updated;
  }

  /** Replace-style transactional composition (spec section 79/80), mirrors `DestinationsService.setPlaces` exactly. */
  async setDestinations(id: string, destinationIds: string[], actorId: string) {
    const accommodation = await this.prisma.accommodation.findUnique({ where: { id } });
    if (!accommodation) throw new NotFoundException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.ACCOMMODATION_NOT_FOUND, message: 'Accommodation not found.' });

    const uniqueIds = [...new Set(destinationIds)];
    if (uniqueIds.length) {
      const found = await this.prisma.destination.findMany({ where: { id: { in: uniqueIds } }, select: { id: true } });
      if (found.length !== uniqueIds.length) {
        throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.DESTINATION_NOT_FOUND, message: 'One or more destinationIds do not exist.' });
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.destinationAccommodation.deleteMany({ where: { accommodationId: id } });
      if (uniqueIds.length) {
        await tx.destinationAccommodation.createMany({
          data: uniqueIds.map((destinationId, index) => ({ destinationId, accommodationId: id, sortOrder: index })),
        });
      }
      await this.audit.log({ actorId, action: 'accommodation.destinations.set', entityType: 'ACCOMMODATION', entityId: id, metadata: { count: uniqueIds.length } }, tx);
    });

    return this.prisma.destinationAccommodation.findMany({ where: { accommodationId: id }, orderBy: { sortOrder: 'asc' } });
  }

  /** Public entry point (post-G04-hardening pattern) - resolves every filter to an id (or 404s), then delegates to the id-based `list()`. */
  async listPublic(filter: PublicAccommodationListFilter) {
    const { country, region, city, destination, type, locale, page, pageSize } = filter;
    const [countryId, regionId, cityId, destinationId] = await Promise.all([
      resolvePublicCountryId(this.prisma, country),
      resolvePublicRegionId(this.prisma, region),
      city ? this.prisma.city.findFirst({ where: { status: PublicationStatus.PUBLISHED, OR: [{ canonicalSlug: city }, { id: city }] } }).then((c) => c?.id ?? GEOGRAPHY_FILTER_UNRESOLVED) : undefined,
      resolvePublicDestinationId(this.prisma, destination),
    ]);
    if (countryId === GEOGRAPHY_FILTER_UNRESOLVED) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.COUNTRY_NOT_FOUND, message: 'Country not found.' });
    if (regionId === GEOGRAPHY_FILTER_UNRESOLVED) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.REGION_NOT_FOUND, message: 'Region not found.' });
    if (cityId === GEOGRAPHY_FILTER_UNRESOLVED) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.CITY_NOT_FOUND, message: 'City not found.' });
    if (destinationId === GEOGRAPHY_FILTER_UNRESOLVED) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.DESTINATION_NOT_FOUND, message: 'Destination not found.' });

    return this.list({ countryId, regionId, cityId, destinationId, type, locale, page, pageSize });
  }

  async list(filter: AccommodationListFilter) {
    const { countryId, regionId, cityId, destinationId, type, locale, page, pageSize } = filter;
    const where: Prisma.AccommodationWhereInput = {
      status: PublicationStatus.PUBLISHED,
      countryId,
      regionId,
      cityId,
      type,
      destinationLinks: destinationId ? { some: { destinationId } } : undefined,
    };

    const [total, accommodations] = await this.prisma.$transaction([
      this.prisma.accommodation.count({ where }),
      this.prisma.accommodation.findMany({
        where,
        include: { translations: true },
        orderBy: [{ importance: 'desc' }, { canonicalSlug: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const items = accommodations.map((a) => {
      const { translation } = resolveTranslation(a.translations, locale);
      return { id: a.id, slug: a.canonicalSlug, type: a.type, name: translation?.name ?? a.canonicalSlug, summary: translation?.summary ?? null, importance: a.importance };
    });

    return { items, page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
  }

  async findBySlug(slug: string, locale: string, includeUnpublished = false) {
    const accommodation = await this.prisma.accommodation.findUnique({
      where: { canonicalSlug: slug },
      include: {
        translations: true,
        country: { include: { translations: true } },
        region: true,
        city: true,
        providerReferences: { where: { status: 'ACTIVE' }, include: { provider: true } },
      },
    });
    if (!accommodation) throw new NotFoundException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.ACCOMMODATION_NOT_FOUND, message: 'Accommodation not found.' });
    if (!includeUnpublished && accommodation.status !== PublicationStatus.PUBLISHED) {
      throw new NotFoundException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.ACCOMMODATION_NOT_FOUND, message: 'Accommodation not found.' });
    }

    const { translation, resolvedLocale, fallbackApplied } = resolveTranslation(accommodation.translations, locale);

    return {
      id: accommodation.id,
      slug: accommodation.canonicalSlug,
      type: accommodation.type,
      status: accommodation.status,
      country: { id: accommodation.country.id, slug: accommodation.country.canonicalSlug, iso2: accommodation.country.iso2 },
      region: accommodation.region ? { id: accommodation.region.id, slug: accommodation.region.canonicalSlug } : null,
      city: accommodation.city ? { id: accommodation.city.id, slug: accommodation.city.canonicalSlug } : null,
      location: accommodation.latitude != null ? { latitude: accommodation.latitude, longitude: accommodation.longitude } : null,
      translation,
      // Provider references are surfaced only as "which providers list this
      // property," never their live price (spec section 65 - list/detail
      // never carries stale live pricing; offers are their own endpoint).
      providers: accommodation.providerReferences.map((r) => ({ providerCode: r.provider.code, externalUrl: r.externalUrl })),
      meta: { requestedLocale: locale, resolvedLocale, fallbackApplied },
    };
  }

  /**
   * Provider-backed mutation (spec section 9/18/19/85/86) - creates or
   * upserts (idempotent on providerId+externalEntityId, spec section 81/91)
   * a `ProviderAccommodationReference`. Gated through the same
   * `ProviderRegistryService` every real serve-path call uses - a
   * provider-backed WRITE is not exempt from the license/capability check
   * any more than a read is.
   */
  async upsertProviderReference(dto: CreateProviderAccommodationReferenceDto, actorId: string) {
    const access = await this.registry.getExecutionContext({ providerCode: dto.providerCode, environment: 'SANDBOX', capability: 'ACCOMMODATION_SEARCH', usage: 'store' });
    if (!access.ok) throw new NotFoundException({ code: access.code, message: access.message });

    const reference = await this.prisma.providerAccommodationReference.upsert({
      where: { providerId_externalEntityId: { providerId: access.context.providerId, externalEntityId: dto.externalEntityId } },
      create: { providerId: access.context.providerId, externalEntityId: dto.externalEntityId, externalUrl: dto.externalUrl, lastSeenAt: new Date() },
      update: { externalUrl: dto.externalUrl, lastSeenAt: new Date() },
    });
    await this.audit.log({ actorId, action: 'accommodation.provider_reference.upserted', entityType: 'ACCOMMODATION', entityId: reference.id, metadata: { providerCode: dto.providerCode } });
    return reference;
  }

  /** Explicit admin mapping only (spec section 19) - never fuzzy/automatic. */
  async mapProviderReference(referenceId: string, dto: MapProviderAccommodationReferenceDto, actorId: string) {
    const reference = await this.prisma.providerAccommodationReference.findUnique({ where: { id: referenceId } });
    if (!reference) throw new NotFoundException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.PROVIDER_REFERENCE_NOT_FOUND, message: 'Provider reference not found.' });
    const accommodation = await this.prisma.accommodation.findUnique({ where: { id: dto.accommodationId } });
    if (!accommodation) throw new NotFoundException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.ACCOMMODATION_NOT_FOUND, message: 'Accommodation not found.' });

    const updated = await this.prisma.providerAccommodationReference.update({
      where: { id: referenceId },
      data: { accommodationId: dto.accommodationId, status: 'ACTIVE' },
    });
    await this.audit.log({
      actorId,
      action: 'accommodation.provider_reference.mapped',
      entityType: 'ACCOMMODATION',
      entityId: referenceId,
      metadata: { before: reference.accommodationId, after: dto.accommodationId },
    });
    return updated;
  }

  /**
   * Public offer lookup (spec section 20/21/25/61/65) - date/occupancy/
   * currency context is mandatory, never optional. Re-checks the provider
   * gate at SERVE time (spec section 26/58/106), not merely at ingestion
   * time - a license revoked after ingestion must block serving
   * immediately, with nothing cached.
   */
  async getOffers(slug: string, dto: GetAccommodationOffersDto) {
    const checkIn = new Date(`${dto.checkIn}T00:00:00.000Z`);
    const checkOut = new Date(`${dto.checkOut}T00:00:00.000Z`);
    if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime())) {
      throw new BadRequestException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.OFFER_CONTEXT_INVALID, message: 'checkIn/checkOut must be valid calendar dates.' });
    }
    if (checkOut <= checkIn) {
      throw new BadRequestException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.INVALID_DATE_RANGE, message: 'checkOut must be after checkIn.' });
    }
    if (dto.guests < 1 || dto.rooms < 1) {
      throw new BadRequestException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.INVALID_OCCUPANCY, message: 'guests and rooms must each be at least 1.' });
    }

    const accommodation = await this.prisma.accommodation.findUnique({
      where: { canonicalSlug: slug },
      include: { providerReferences: { where: { status: 'ACTIVE' }, include: { provider: true } } },
    });
    if (!accommodation || accommodation.status !== PublicationStatus.PUBLISHED) {
      throw new NotFoundException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.ACCOMMODATION_NOT_FOUND, message: 'Accommodation not found.' });
    }

    const now = new Date();
    const results: unknown[] = [];
    for (const reference of accommodation.providerReferences) {
      const access = await this.registry.getExecutionContext({ providerCode: reference.provider.code, environment: 'SANDBOX', capability: 'LIVE_PRICE' });
      if (!access.ok) continue; // fail-closed per reference: gate failure means this provider's offers are skipped, not that the whole request 500s (spec section 59/93 failure isolation)

      const offers = await this.prisma.accommodationOffer.findMany({
        where: { providerReferenceId: reference.id, checkInDate: checkIn, checkOutDate: checkOut, currency: dto.currency, guests: { gte: dto.guests }, rooms: { gte: dto.rooms } },
        orderBy: { fetchedAt: 'desc' },
        take: 5,
      });
      for (const offer of offers) {
        const isExpired = Boolean(offer.expiresAt && offer.expiresAt <= now);
        if (isExpired) continue; // an expired offer is never presented as current (spec section 25/35/83/118)
        results.push({
          providerCode: reference.provider.code,
          checkInDate: dto.checkIn,
          checkOutDate: dto.checkOut,
          currency: offer.currency,
          amount: offer.amount.toString(),
          taxAmount: offer.taxAmount?.toString() ?? null,
          totalAmount: offer.totalAmount?.toString() ?? null,
          availability: offer.availability,
          bookingUrl: offer.bookingUrl,
          fetchedAt: offer.fetchedAt,
          attribution: { requirement: access.context.attribution.requirement, displayText: access.context.attribution.displayText, logoRequired: access.context.attribution.logoRequired },
        });
      }
    }

    return { accommodationSlug: slug, checkIn: dto.checkIn, checkOut: dto.checkOut, guests: dto.guests, rooms: dto.rooms, currency: dto.currency, offers: results };
  }
}
