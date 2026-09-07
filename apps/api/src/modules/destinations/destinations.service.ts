import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DestinationType, Prisma, PublicationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { resolveTranslation } from '../../common/translation/resolve-translation.util';
import { toSlug } from '../../common/util/slug.util';
import { GEOGRAPHY_ERROR_CODES } from '../../common/errors/geography-error-codes';
import { assertSameCountry } from '../../common/geography/geography-consistency.util';
import { CreateDestinationDto, UpdateDestinationDto, UpsertDestinationTranslationDto } from './dto/destination.dto';

export interface DestinationListFilter {
  countryId?: string;
  regionId?: string;
  cityId?: string;
  type?: DestinationType;
  locale: string;
  page: number;
  pageSize: number;
}

@Injectable()
export class DestinationsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private async ensureUniqueCanonicalSlug(base: string): Promise<string> {
    let slug = base;
    let suffix = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const existing = await this.prisma.destination.findUnique({ where: { canonicalSlug: slug } });
      if (!existing) return slug;
      suffix += 1;
      slug = `${base}-${suffix}`;
    }
  }

  /**
   * Cross-entity consistency (spec section 11/30): countryId is required and
   * authoritative; regionId/cityId are optional but, when present, must
   * belong to the same country, and when both are present must not
   * contradict each other (a City's own Region, if it has one, must match).
   */
  private async assertHierarchyConsistency(countryId: string, regionId?: string | null, cityId?: string | null) {
    const country = await this.prisma.country.findUnique({ where: { id: countryId } });
    if (!country) {
      throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.COUNTRY_NOT_FOUND, message: `No Country with id ${countryId}.` });
    }

    let city: { id: string; countryId: string; regionId: string | null } | null = null;
    if (cityId) {
      city = await this.prisma.city.findUnique({ where: { id: cityId } });
      if (!city) {
        throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.CITY_NOT_FOUND, message: `No City with id ${cityId}.` });
      }
      assertSameCountry(city, countryId, 'cityId must belong to the same country as countryId.');
    }

    if (regionId) {
      const region = await this.prisma.region.findUnique({ where: { id: regionId } });
      if (!region) {
        throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.REGION_NOT_FOUND, message: `No Region with id ${regionId}.` });
      }
      assertSameCountry(region, countryId, 'regionId must belong to the same country as countryId.');

      if (city?.regionId && city.regionId !== regionId) {
        throw new BadRequestException({
          code: GEOGRAPHY_ERROR_CODES.GEOGRAPHY_REGION_CITY_MISMATCH,
          message: "regionId does not match the city's own region.",
        });
      }
    }
  }

  async create(dto: CreateDestinationDto, actorId: string) {
    await this.assertHierarchyConsistency(dto.countryId, dto.regionId, dto.cityId);

    const canonical = dto.translations.find((t) => t.locale === 'vi') ?? dto.translations[0];
    if (!canonical) throw new BadRequestException('At least one translation is required.');
    const canonicalSlug = await this.ensureUniqueCanonicalSlug(toSlug(canonical.name));

    const destination = await this.prisma.destination.create({
      data: {
        countryId: dto.countryId,
        regionId: dto.regionId,
        cityId: dto.cityId,
        type: dto.type,
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

    await this.audit.log({ actorId, action: 'destination.created', entityType: 'DESTINATION', entityId: destination.id });
    return destination;
  }

  async update(id: string, dto: UpdateDestinationDto, actorId: string) {
    const destination = await this.prisma.destination.findUnique({ where: { id } });
    if (!destination) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.DESTINATION_NOT_FOUND, message: 'Destination not found.' });

    const nextRegionId = dto.regionId === undefined ? destination.regionId : dto.regionId;
    const nextCityId = dto.cityId === undefined ? destination.cityId : dto.cityId;
    if (dto.regionId !== undefined || dto.cityId !== undefined) {
      await this.assertHierarchyConsistency(destination.countryId, nextRegionId, nextCityId);
    }

    const updated = await this.prisma.destination.update({
      where: { id },
      data: {
        regionId: nextRegionId,
        cityId: nextCityId,
        type: dto.type,
        latitude: dto.latitude,
        longitude: dto.longitude,
      },
    });

    await this.audit.log({ actorId, action: 'destination.updated', entityType: 'DESTINATION', entityId: id });
    return updated;
  }

  async upsertTranslation(id: string, locale: string, dto: UpsertDestinationTranslationDto, actorId: string) {
    const destination = await this.prisma.destination.findUnique({ where: { id } });
    if (!destination) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.DESTINATION_NOT_FOUND, message: 'Destination not found.' });

    const translation = await this.prisma.destinationTranslation.upsert({
      where: { destinationId_locale: { destinationId: id, locale } },
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
        destinationId: id,
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

    await this.audit.log({ actorId, action: 'destination.translation.upserted', entityType: 'DESTINATION', entityId: id, metadata: { locale } });
    return translation;
  }

  async setStatus(id: string, status: PublicationStatus, actorId: string) {
    const destination = await this.prisma.destination.findUnique({ where: { id }, include: { translations: true } });
    if (!destination) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.DESTINATION_NOT_FOUND, message: 'Destination not found.' });

    if (status === PublicationStatus.PUBLISHED && destination.translations.length === 0) {
      throw new BadRequestException({
        code: GEOGRAPHY_ERROR_CODES.GEOGRAPHY_CANNOT_PUBLISH_WITHOUT_TRANSLATION,
        message: 'Cannot publish a destination with no translations.',
      });
    }

    const updated = await this.prisma.destination.update({ where: { id }, data: { status } });
    await this.audit.log({ actorId, action: 'destination.status.changed', entityType: 'DESTINATION', entityId: id, metadata: { status } });
    return updated;
  }

  async findBySlug(slug: string, locale: string, includeUnpublished = false) {
    const destination = await this.prisma.destination.findUnique({
      where: { canonicalSlug: slug },
      include: { translations: true, country: true, region: { include: { translations: true } }, city: { include: { translations: true } } },
    });
    if (!destination) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.DESTINATION_NOT_FOUND, message: 'Destination not found.' });
    if (!includeUnpublished && destination.status !== PublicationStatus.PUBLISHED) {
      throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.DESTINATION_NOT_FOUND, message: 'Destination not found.' });
    }

    const { translation, resolvedLocale, fallbackApplied } = resolveTranslation(destination.translations, locale);
    return {
      id: destination.id,
      slug: destination.canonicalSlug,
      type: destination.type,
      status: destination.status,
      country: { id: destination.country.id, slug: destination.country.canonicalSlug, iso2: destination.country.iso2 },
      region: destination.region ? { id: destination.region.id, slug: destination.region.canonicalSlug } : null,
      city: destination.city ? { id: destination.city.id, slug: destination.city.canonicalSlug } : null,
      location: destination.latitude != null ? { latitude: destination.latitude, longitude: destination.longitude } : null,
      translation,
      meta: { requestedLocale: locale, resolvedLocale, fallbackApplied },
    };
  }

  async list(filter: DestinationListFilter) {
    const { countryId, regionId, cityId, type, locale, page, pageSize } = filter;
    const where: Prisma.DestinationWhereInput = {
      status: PublicationStatus.PUBLISHED,
      countryId,
      regionId,
      cityId,
      type,
    };

    const [total, destinations] = await this.prisma.$transaction([
      this.prisma.destination.count({ where }),
      this.prisma.destination.findMany({
        where,
        include: { translations: true },
        orderBy: { importance: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const items = destinations.map((d) => {
      const { translation } = resolveTranslation(d.translations, locale);
      return { id: d.id, slug: d.canonicalSlug, type: d.type, name: translation?.name ?? d.canonicalSlug };
    });

    return { items, page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
  }
}
