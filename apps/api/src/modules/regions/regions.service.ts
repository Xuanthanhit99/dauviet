import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PublicationStatus, RegionType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { resolveTranslation } from '../../common/translation/resolve-translation.util';
import { toSlug } from '../../common/util/slug.util';
import { GEOGRAPHY_ERROR_CODES } from '../../common/errors/geography-error-codes';
import { assertNoRegionParentCycle, assertSameCountry } from '../../common/geography/geography-consistency.util';
import { CreateRegionDto, UpdateRegionDto, UpsertRegionTranslationDto } from './dto/region.dto';

export interface RegionListFilter {
  countryId?: string;
  parentRegionId?: string;
  type?: RegionType;
  locale: string;
  page: number;
  pageSize: number;
}

@Injectable()
export class RegionsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private async ensureUniqueCanonicalSlug(base: string): Promise<string> {
    let slug = base;
    let suffix = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const existing = await this.prisma.region.findUnique({ where: { canonicalSlug: slug } });
      if (!existing) return slug;
      suffix += 1;
      slug = `${base}-${suffix}`;
    }
  }

  private async assertCountryExists(countryId: string) {
    const country = await this.prisma.country.findUnique({ where: { id: countryId } });
    if (!country) {
      throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.COUNTRY_NOT_FOUND, message: `No Country with id ${countryId}.` });
    }
    return country;
  }

  async create(dto: CreateRegionDto, actorId: string) {
    await this.assertCountryExists(dto.countryId);

    if (dto.parentRegionId) {
      const parent = await this.prisma.region.findUnique({ where: { id: dto.parentRegionId } });
      if (!parent) {
        throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.REGION_PARENT_NOT_FOUND, message: `No Region with id ${dto.parentRegionId}.` });
      }
      assertSameCountry(parent, dto.countryId, 'parentRegionId must belong to the same country.');
      await assertNoRegionParentCycle(
        (id) => this.prisma.region.findUnique({ where: { id }, select: { id: true, parentRegionId: true } }),
        undefined,
        dto.parentRegionId,
      );
    }

    const canonical = dto.translations.find((t) => t.locale === 'vi') ?? dto.translations[0];
    if (!canonical) throw new BadRequestException('At least one translation is required.');
    const canonicalSlug = await this.ensureUniqueCanonicalSlug(toSlug(canonical.name));

    const region = await this.prisma.region.create({
      data: {
        countryId: dto.countryId,
        parentRegionId: dto.parentRegionId,
        type: dto.type,
        code: dto.code,
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

    await this.audit.log({ actorId, action: 'region.created', entityType: 'REGION', entityId: region.id });
    return region;
  }

  async update(id: string, dto: UpdateRegionDto, actorId: string) {
    const region = await this.prisma.region.findUnique({ where: { id } });
    if (!region) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.REGION_NOT_FOUND, message: 'Region not found.' });

    if (dto.parentRegionId) {
      const parent = await this.prisma.region.findUnique({ where: { id: dto.parentRegionId } });
      if (!parent) {
        throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.REGION_PARENT_NOT_FOUND, message: `No Region with id ${dto.parentRegionId}.` });
      }
      assertSameCountry(parent, region.countryId, 'parentRegionId must belong to the same country.');
      await assertNoRegionParentCycle(
        (rid) => this.prisma.region.findUnique({ where: { id: rid }, select: { id: true, parentRegionId: true } }),
        id,
        dto.parentRegionId,
      );
    }

    const updated = await this.prisma.region.update({
      where: { id },
      data: {
        // dto.parentRegionId is `undefined` (leave unchanged), `null`
        // (detach), or a validated id (reassign) - Prisma's `update` treats
        // an `undefined` field as "don't touch this column".
        parentRegionId: dto.parentRegionId,
        type: dto.type,
        code: dto.code,
        latitude: dto.latitude,
        longitude: dto.longitude,
      },
    });

    await this.audit.log({ actorId, action: 'region.updated', entityType: 'REGION', entityId: id });
    return updated;
  }

  async upsertTranslation(id: string, locale: string, dto: UpsertRegionTranslationDto, actorId: string) {
    const region = await this.prisma.region.findUnique({ where: { id } });
    if (!region) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.REGION_NOT_FOUND, message: 'Region not found.' });

    const translation = await this.prisma.regionTranslation.upsert({
      where: { regionId_locale: { regionId: id, locale } },
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
        regionId: id,
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

    await this.audit.log({ actorId, action: 'region.translation.upserted', entityType: 'REGION', entityId: id, metadata: { locale } });
    return translation;
  }

  async setStatus(id: string, status: PublicationStatus, actorId: string) {
    const region = await this.prisma.region.findUnique({ where: { id }, include: { translations: true } });
    if (!region) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.REGION_NOT_FOUND, message: 'Region not found.' });

    if (status === PublicationStatus.PUBLISHED && region.translations.length === 0) {
      throw new BadRequestException({
        code: GEOGRAPHY_ERROR_CODES.GEOGRAPHY_CANNOT_PUBLISH_WITHOUT_TRANSLATION,
        message: 'Cannot publish a region with no translations.',
      });
    }

    const updated = await this.prisma.region.update({ where: { id }, data: { status } });
    await this.audit.log({ actorId, action: 'region.status.changed', entityType: 'REGION', entityId: id, metadata: { status } });
    return updated;
  }

  async findBySlug(slug: string, locale: string, includeUnpublished = false) {
    const region = await this.prisma.region.findUnique({
      where: { canonicalSlug: slug },
      include: { translations: true, country: true, parentRegion: { include: { translations: true } } },
    });
    if (!region) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.REGION_NOT_FOUND, message: 'Region not found.' });
    if (!includeUnpublished && region.status !== PublicationStatus.PUBLISHED) {
      throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.REGION_NOT_FOUND, message: 'Region not found.' });
    }

    const { translation, resolvedLocale, fallbackApplied } = resolveTranslation(region.translations, locale);
    return {
      id: region.id,
      slug: region.canonicalSlug,
      type: region.type,
      code: region.code,
      status: region.status,
      country: { id: region.country.id, slug: region.country.canonicalSlug, iso2: region.country.iso2 },
      parentRegion: region.parentRegion ? { id: region.parentRegion.id, slug: region.parentRegion.canonicalSlug } : null,
      location: region.latitude != null ? { latitude: region.latitude, longitude: region.longitude } : null,
      translation,
      meta: { requestedLocale: locale, resolvedLocale, fallbackApplied },
    };
  }

  async getPublishedIdBySlug(slug: string) {
    const region = await this.prisma.region.findUnique({ where: { canonicalSlug: slug } });
    if (!region || region.status !== PublicationStatus.PUBLISHED) {
      throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.REGION_NOT_FOUND, message: 'Region not found.' });
    }
    return region;
  }

  async list(filter: RegionListFilter) {
    const { countryId, parentRegionId, type, locale, page, pageSize } = filter;
    const where: Prisma.RegionWhereInput = {
      status: PublicationStatus.PUBLISHED,
      countryId,
      parentRegionId,
      type,
    };

    const [total, regions] = await this.prisma.$transaction([
      this.prisma.region.count({ where }),
      this.prisma.region.findMany({
        where,
        include: { translations: true },
        orderBy: { id: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const items = regions.map((r) => {
      const { translation } = resolveTranslation(r.translations, locale);
      return { id: r.id, slug: r.canonicalSlug, type: r.type, name: translation?.name ?? r.canonicalSlug };
    });

    return { items, page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
  }
}
