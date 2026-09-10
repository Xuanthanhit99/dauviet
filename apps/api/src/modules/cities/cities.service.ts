import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PublicationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { resolveTranslation } from '../../common/translation/resolve-translation.util';
import { toSlug } from '../../common/util/slug.util';
import { isValidIanaTimezone } from '../../common/util/timezone.util';
import { GEOGRAPHY_ERROR_CODES } from '../../common/errors/geography-error-codes';
import {
  assertSameCountry,
  GEOGRAPHY_FILTER_UNRESOLVED,
  resolvePublicCountryId,
  resolvePublicRegionId,
} from '../../common/geography/geography-consistency.util';
import { DestinationsService } from '../destinations/destinations.service';
import { CreateCityDto, UpdateCityDto, UpsertCityTranslationDto } from './dto/city.dto';

export interface CityListFilter {
  countryId?: string;
  regionId?: string;
  locale: string;
  page: number;
  pageSize: number;
}

export interface PublicCityListFilter {
  /** Country canonicalSlug/iso2/iso3, or the raw internal id (compatibility fallback). */
  country?: string;
  /** Region canonicalSlug, or the raw internal id (compatibility fallback). */
  region?: string;
  locale: string;
  page: number;
  pageSize: number;
}

@Injectable()
export class CitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly destinations: DestinationsService,
  ) {}

  private async ensureUniqueCanonicalSlug(base: string): Promise<string> {
    let slug = base;
    let suffix = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const existing = await this.prisma.city.findUnique({ where: { canonicalSlug: slug } });
      if (!existing) return slug;
      suffix += 1;
      slug = `${base}-${suffix}`;
    }
  }

  private assertValidTimezone(timezone: string) {
    if (!isValidIanaTimezone(timezone)) {
      throw new BadRequestException({
        code: GEOGRAPHY_ERROR_CODES.CITY_INVALID_TIMEZONE,
        message: `${timezone} is not a recognised IANA timezone identifier.`,
      });
    }
  }

  async create(dto: CreateCityDto, actorId: string) {
    this.assertValidTimezone(dto.timezone);

    const country = await this.prisma.country.findUnique({ where: { id: dto.countryId } });
    if (!country) {
      throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.COUNTRY_NOT_FOUND, message: `No Country with id ${dto.countryId}.` });
    }

    if (dto.regionId) {
      const region = await this.prisma.region.findUnique({ where: { id: dto.regionId } });
      if (!region) {
        throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.REGION_NOT_FOUND, message: `No Region with id ${dto.regionId}.` });
      }
      assertSameCountry(region, dto.countryId, 'regionId must belong to the same country as countryId.');
    }

    const canonical = dto.translations.find((t) => t.locale === 'vi') ?? dto.translations[0];
    if (!canonical) throw new BadRequestException('At least one translation is required.');
    const canonicalSlug = await this.ensureUniqueCanonicalSlug(toSlug(canonical.name));

    const city = await this.prisma.city.create({
      data: {
        countryId: dto.countryId,
        regionId: dto.regionId,
        timezone: dto.timezone,
        latitude: dto.latitude,
        longitude: dto.longitude,
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

    await this.audit.log({ actorId, action: 'city.created', entityType: 'CITY', entityId: city.id });
    return city;
  }

  async update(id: string, dto: UpdateCityDto, actorId: string) {
    const city = await this.prisma.city.findUnique({ where: { id } });
    if (!city) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.CITY_NOT_FOUND, message: 'City not found.' });

    if (dto.timezone) this.assertValidTimezone(dto.timezone);

    if (dto.regionId) {
      const region = await this.prisma.region.findUnique({ where: { id: dto.regionId } });
      if (!region) {
        throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.REGION_NOT_FOUND, message: `No Region with id ${dto.regionId}.` });
      }
      assertSameCountry(region, city.countryId, 'regionId must belong to the same country as countryId.');
    }

    const updated = await this.prisma.city.update({
      where: { id },
      // dto.regionId is `undefined` (leave unchanged), `null` (detach), or a
      // validated id (reassign) - Prisma treats `undefined` as "don't touch".
      data: { regionId: dto.regionId, timezone: dto.timezone, latitude: dto.latitude, longitude: dto.longitude },
    });

    await this.audit.log({ actorId, action: 'city.updated', entityType: 'CITY', entityId: id });
    return updated;
  }

  async upsertTranslation(id: string, locale: string, dto: UpsertCityTranslationDto, actorId: string) {
    const city = await this.prisma.city.findUnique({ where: { id } });
    if (!city) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.CITY_NOT_FOUND, message: 'City not found.' });

    const translation = await this.prisma.cityTranslation.upsert({
      where: { cityId_locale: { cityId: id, locale } },
      update: {
        name: dto.name,
        slug: toSlug(dto.name),
        summary: dto.summary,
        description: dto.description,
        seoTitle: dto.seoTitle,
        seoDescription: dto.seoDescription,
        method: dto.method ?? 'ORIGINAL',
      },
      create: {
        cityId: id,
        locale,
        name: dto.name,
        slug: toSlug(dto.name),
        summary: dto.summary,
        description: dto.description,
        seoTitle: dto.seoTitle,
        seoDescription: dto.seoDescription,
        method: dto.method ?? 'ORIGINAL',
      },
    });

    await this.audit.log({ actorId, action: 'city.translation.upserted', entityType: 'CITY', entityId: id, metadata: { locale } });
    return translation;
  }

  async setStatus(id: string, status: PublicationStatus, actorId: string) {
    const city = await this.prisma.city.findUnique({ where: { id }, include: { translations: true } });
    if (!city) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.CITY_NOT_FOUND, message: 'City not found.' });

    if (status === PublicationStatus.PUBLISHED && city.translations.length === 0) {
      throw new BadRequestException({
        code: GEOGRAPHY_ERROR_CODES.GEOGRAPHY_CANNOT_PUBLISH_WITHOUT_TRANSLATION,
        message: 'Cannot publish a city with no translations.',
      });
    }

    const updated = await this.prisma.city.update({ where: { id }, data: { status } });
    await this.audit.log({ actorId, action: 'city.status.changed', entityType: 'CITY', entityId: id, metadata: { status } });
    return updated;
  }

  async findBySlug(slug: string, locale: string, includeUnpublished = false) {
    const city = await this.prisma.city.findUnique({
      where: { canonicalSlug: slug },
      include: { translations: true, country: true, region: { include: { translations: true } } },
    });
    if (!city) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.CITY_NOT_FOUND, message: 'City not found.' });
    if (!includeUnpublished && city.status !== PublicationStatus.PUBLISHED) {
      throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.CITY_NOT_FOUND, message: 'City not found.' });
    }

    const { translation, resolvedLocale, fallbackApplied } = resolveTranslation(city.translations, locale);
    return {
      id: city.id,
      slug: city.canonicalSlug,
      timezone: city.timezone,
      status: city.status,
      country: { id: city.country.id, slug: city.country.canonicalSlug, iso2: city.country.iso2 },
      region: city.region ? { id: city.region.id, slug: city.region.canonicalSlug } : null,
      location: city.latitude != null ? { latitude: city.latitude, longitude: city.longitude } : null,
      translation,
      meta: { requestedLocale: locale, resolvedLocale, fallbackApplied },
    };
  }

  async getPublishedIdBySlug(slug: string) {
    const city = await this.prisma.city.findUnique({ where: { canonicalSlug: slug } });
    if (!city || city.status !== PublicationStatus.PUBLISHED) {
      throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.CITY_NOT_FOUND, message: 'City not found.' });
    }
    return city;
  }

  /**
   * Public entry point for `GET /v1/cities` (post-G04 API consistency
   * hardening - see docs/backend/POST_G04_API_CONSISTENCY_HARDENING.md).
   * `CitiesController.list()` used to pass `?country=`/`?region=` straight
   * through as `countryId`/`regionId` to `list()` below - the same defect
   * class G04 already fixed on `/v1/destinations`. Resolves each filter to
   * a real id (or 404s - never silently broadens/empties), then delegates
   * to the unchanged, id-based `list()`.
   */
  async listPublic(filter: PublicCityListFilter) {
    const { country, region, locale, page, pageSize } = filter;
    const [countryId, regionId] = await Promise.all([
      resolvePublicCountryId(this.prisma, country),
      resolvePublicRegionId(this.prisma, region),
    ]);
    if (countryId === GEOGRAPHY_FILTER_UNRESOLVED) {
      throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.COUNTRY_NOT_FOUND, message: 'Country not found.' });
    }
    if (regionId === GEOGRAPHY_FILTER_UNRESOLVED) {
      throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.REGION_NOT_FOUND, message: 'Region not found.' });
    }
    return this.list({ countryId, regionId, locale, page, pageSize });
  }

  /** Id-based filter contract for trusted internal callers - public slug/code/id resolution lives in `listPublic` above, never here. */
  async list(filter: CityListFilter) {
    const { countryId, regionId, locale, page, pageSize } = filter;
    const where: Prisma.CityWhereInput = { status: PublicationStatus.PUBLISHED, countryId, regionId };

    const [total, cities] = await this.prisma.$transaction([
      this.prisma.city.count({ where }),
      this.prisma.city.findMany({
        where,
        include: { translations: true },
        orderBy: { importance: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const items = cities.map((c) => {
      const { translation } = resolveTranslation(c.translations, locale);
      return { id: c.id, slug: c.canonicalSlug, timezone: c.timezone, name: translation?.name ?? c.canonicalSlug };
    });

    return { items, page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
  }

  /** Destinations that sit within this City (spec section 21) - PUBLISHED only. */
  async getDestinations(citySlug: string, locale: string, page: number, pageSize: number) {
    const city = await this.getPublishedIdBySlug(citySlug);
    return this.destinations.list({ cityId: city.id, locale, page, pageSize });
  }
}
