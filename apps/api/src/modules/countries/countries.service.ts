import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DestinationType, Prisma, PublicationStatus, RegionType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { resolveTranslation } from '../../common/translation/resolve-translation.util';
import { toSlug } from '../../common/util/slug.util';
import { GEOGRAPHY_ERROR_CODES } from '../../common/errors/geography-error-codes';
import { RegionsService } from '../regions/regions.service';
import { CitiesService } from '../cities/cities.service';
import { DestinationsService } from '../destinations/destinations.service';
import { CreateCountryDto, UpdateCountryDto, UpsertCountryTranslationDto } from './dto/country.dto';

@Injectable()
export class CountriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly regions: RegionsService,
    private readonly cities: CitiesService,
    private readonly destinations: DestinationsService,
  ) {}

  private async ensureUniqueCanonicalSlug(base: string): Promise<string> {
    let slug = base;
    let suffix = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const existing = await this.prisma.country.findUnique({ where: { canonicalSlug: slug } });
      if (!existing) return slug;
      suffix += 1;
      slug = `${base}-${suffix}`;
    }
  }

  async create(dto: CreateCountryDto, actorId: string) {
    const canonical = dto.translations.find((t) => t.locale === 'vi') ?? dto.translations[0];
    if (!canonical) throw new BadRequestException('At least one translation is required.');
    const canonicalSlug = await this.ensureUniqueCanonicalSlug(toSlug(canonical.name));

    try {
      const country = await this.prisma.country.create({
        data: {
          iso2: dto.iso2,
          iso3: dto.iso3,
          defaultLocale: dto.defaultLocale,
          defaultCurrency: dto.defaultCurrency,
          latitude: dto.latitude,
          longitude: dto.longitude,
          canonicalSlug,
          status: PublicationStatus.DRAFT,
          translations: {
            create: dto.translations.map((t) => ({
              locale: t.locale,
              name: t.name,
              slug: toSlug(t.name),
              shortDescription: t.shortDescription,
              description: t.description,
              seoTitle: t.seoTitle,
              seoDescription: t.seoDescription,
              method: t.method ?? 'ORIGINAL',
            })),
          },
        },
        include: { translations: true },
      });

      await this.audit.log({ actorId, action: 'country.created', entityType: 'COUNTRY', entityId: country.id });
      return country;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({
          code: GEOGRAPHY_ERROR_CODES.COUNTRY_ISO_CONFLICT,
          message: 'A country with this iso2/iso3 code already exists.',
          details: err.meta,
        });
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateCountryDto, actorId: string) {
    const country = await this.prisma.country.findUnique({ where: { id } });
    if (!country) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.COUNTRY_NOT_FOUND, message: 'Country not found.' });

    const updated = await this.prisma.country.update({
      where: { id },
      data: {
        defaultLocale: dto.defaultLocale,
        defaultCurrency: dto.defaultCurrency,
        latitude: dto.latitude,
        longitude: dto.longitude,
      },
    });

    await this.audit.log({ actorId, action: 'country.updated', entityType: 'COUNTRY', entityId: id });
    return updated;
  }

  async upsertTranslation(id: string, locale: string, dto: UpsertCountryTranslationDto, actorId: string) {
    const country = await this.prisma.country.findUnique({ where: { id } });
    if (!country) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.COUNTRY_NOT_FOUND, message: 'Country not found.' });

    const translation = await this.prisma.countryTranslation.upsert({
      where: { countryId_locale: { countryId: id, locale } },
      update: {
        name: dto.name,
        slug: toSlug(dto.name),
        shortDescription: dto.shortDescription,
        description: dto.description,
        seoTitle: dto.seoTitle,
        seoDescription: dto.seoDescription,
        method: dto.method ?? 'ORIGINAL',
      },
      create: {
        countryId: id,
        locale,
        name: dto.name,
        slug: toSlug(dto.name),
        shortDescription: dto.shortDescription,
        description: dto.description,
        seoTitle: dto.seoTitle,
        seoDescription: dto.seoDescription,
        method: dto.method ?? 'ORIGINAL',
      },
    });

    await this.audit.log({ actorId, action: 'country.translation.upserted', entityType: 'COUNTRY', entityId: id, metadata: { locale } });
    return translation;
  }

  async setStatus(id: string, status: PublicationStatus, actorId: string) {
    const country = await this.prisma.country.findUnique({ where: { id }, include: { translations: true } });
    if (!country) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.COUNTRY_NOT_FOUND, message: 'Country not found.' });

    if (status === PublicationStatus.PUBLISHED && country.translations.length === 0) {
      throw new BadRequestException({
        code: GEOGRAPHY_ERROR_CODES.GEOGRAPHY_CANNOT_PUBLISH_WITHOUT_TRANSLATION,
        message: 'Cannot publish a country with no translations.',
      });
    }

    const updated = await this.prisma.country.update({ where: { id }, data: { status } });
    await this.audit.log({ actorId, action: 'country.status.changed', entityType: 'COUNTRY', entityId: id, metadata: { status } });
    return updated;
  }

  async findBySlug(slug: string, locale: string, includeUnpublished = false) {
    const country = await this.prisma.country.findUnique({ where: { canonicalSlug: slug }, include: { translations: true } });
    if (!country) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.COUNTRY_NOT_FOUND, message: 'Country not found.' });
    if (!includeUnpublished && country.status !== PublicationStatus.PUBLISHED) {
      throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.COUNTRY_NOT_FOUND, message: 'Country not found.' });
    }

    const { translation, resolvedLocale, fallbackApplied } = resolveTranslation(country.translations, locale);
    return {
      id: country.id,
      slug: country.canonicalSlug,
      iso2: country.iso2,
      iso3: country.iso3,
      defaultLocale: country.defaultLocale,
      defaultCurrency: country.defaultCurrency,
      status: country.status,
      location: country.latitude != null ? { latitude: country.latitude, longitude: country.longitude } : null,
      translation,
      meta: { requestedLocale: locale, resolvedLocale, fallbackApplied },
    };
  }

  async getPublishedIdBySlug(slug: string) {
    const country = await this.prisma.country.findUnique({ where: { canonicalSlug: slug } });
    if (!country || country.status !== PublicationStatus.PUBLISHED) {
      throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.COUNTRY_NOT_FOUND, message: 'Country not found.' });
    }
    return country;
  }

  async list(params: { locale: string; page: number; pageSize: number }) {
    const { locale, page, pageSize } = params;
    const where: Prisma.CountryWhereInput = { status: PublicationStatus.PUBLISHED };

    const [total, countries] = await this.prisma.$transaction([
      this.prisma.country.count({ where }),
      this.prisma.country.findMany({
        where,
        include: { translations: true },
        orderBy: { id: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const items = countries.map((c) => {
      const { translation } = resolveTranslation(c.translations, locale);
      return { id: c.id, slug: c.canonicalSlug, iso2: c.iso2, name: translation?.name ?? c.canonicalSlug };
    });

    return { items, page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
  }

  async getRegions(countrySlug: string, locale: string, page: number, pageSize: number, type?: RegionType) {
    const country = await this.getPublishedIdBySlug(countrySlug);
    return this.regions.list({ countryId: country.id, type, locale, page, pageSize });
  }

  /**
   * `region` here is a public canonicalSlug/id (post-G04 API consistency
   * hardening - see docs/backend/POST_G04_API_CONSISTENCY_HARDENING.md) -
   * this used to be forwarded straight through as `CityListFilter.regionId`
   * to the id-based `cities.list()`, so a real region slug silently matched
   * nothing. `country.id` is already known-good (resolved from the path
   * `:slug` above via `getPublishedIdBySlug`) and is passed through
   * `cities.listPublic()`'s id-fallback branch - one resolution boundary,
   * not two different calling conventions for the same method.
   */
  async getCities(countrySlug: string, locale: string, page: number, pageSize: number, region?: string) {
    const country = await this.getPublishedIdBySlug(countrySlug);
    return this.cities.listPublic({ country: country.id, region, locale, page, pageSize });
  }

  /** Same rationale as `getCities` above, for `region`/`city` via `destinations.listPublic()` (G04's already-fixed public boundary). */
  async getDestinations(
    countrySlug: string,
    locale: string,
    page: number,
    pageSize: number,
    region?: string,
    city?: string,
    type?: DestinationType,
  ) {
    const country = await this.getPublishedIdBySlug(countrySlug);
    return this.destinations.listPublic({ country: country.id, region, city, type, locale, page, pageSize });
  }
}
