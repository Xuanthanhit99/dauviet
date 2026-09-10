import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PublicationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { resolveTranslation } from '../../common/translation/resolve-translation.util';
import { toSlug } from '../../common/util/slug.util';
import { GEOGRAPHY_ERROR_CODES } from '../../common/errors/geography-error-codes';
import { STAY_FOOD_ACTIVITY_ERROR_CODES } from '../../common/errors/stay-food-activity-error-codes';
import { GEOGRAPHY_FILTER_UNRESOLVED, resolvePublicCountryId } from '../../common/geography/geography-consistency.util';
import { CreateCuisineDto, UpsertCuisineTranslationDto } from './dto/cuisine.dto';

export interface PublicCuisineListFilter {
  country?: string;
  locale: string;
  page: number;
  pageSize: number;
}

@Injectable()
export class CuisinesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private async ensureUniqueCanonicalSlug(base: string): Promise<string> {
    let slug = base;
    let suffix = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const existing = await this.prisma.cuisine.findUnique({ where: { canonicalSlug: slug } });
      if (!existing) return slug;
      suffix += 1;
      slug = `${base}-${suffix}`;
    }
  }

  async create(dto: CreateCuisineDto, actorId: string) {
    if (dto.regionId && !dto.countryId) {
      throw new BadRequestException('regionId requires countryId to be set (a Cuisine cannot be region-scoped without a country).');
    }
    const canonical = dto.translations.find((t) => t.locale === 'vi') ?? dto.translations[0];
    if (!canonical) throw new BadRequestException('At least one translation is required.');
    const canonicalSlug = await this.ensureUniqueCanonicalSlug(toSlug(canonical.name));

    const cuisine = await this.prisma.cuisine.create({
      data: {
        countryId: dto.countryId,
        regionId: dto.regionId,
        canonicalSlug,
        status: PublicationStatus.DRAFT,
        translations: { create: dto.translations.map((t) => ({ locale: t.locale, name: t.name, slug: toSlug(t.name), summary: t.summary, description: t.description, method: t.method ?? 'ORIGINAL' })) },
      },
      include: { translations: true },
    });
    await this.audit.log({ actorId, action: 'cuisine.created', entityType: 'CUISINE', entityId: cuisine.id });
    return cuisine;
  }

  async upsertTranslation(id: string, locale: string, dto: UpsertCuisineTranslationDto, actorId: string) {
    const cuisine = await this.prisma.cuisine.findUnique({ where: { id } });
    if (!cuisine) throw new NotFoundException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.CUISINE_NOT_FOUND, message: 'Cuisine not found.' });
    const translation = await this.prisma.cuisineTranslation.upsert({
      where: { cuisineId_locale: { cuisineId: id, locale } },
      create: { cuisineId: id, locale, name: dto.name, slug: toSlug(dto.name), summary: dto.summary, description: dto.description, method: dto.method ?? 'ORIGINAL' },
      update: { name: dto.name, slug: toSlug(dto.name), summary: dto.summary, description: dto.description },
    });
    await this.audit.log({ actorId, action: 'cuisine.translation.upserted', entityType: 'CUISINE', entityId: id, metadata: { locale } });
    return translation;
  }

  async setStatus(id: string, status: PublicationStatus, actorId: string) {
    const cuisine = await this.prisma.cuisine.findUnique({ where: { id } });
    if (!cuisine) throw new NotFoundException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.CUISINE_NOT_FOUND, message: 'Cuisine not found.' });
    const updated = await this.prisma.cuisine.update({ where: { id }, data: { status } });
    await this.audit.log({ actorId, action: 'cuisine.status.changed', entityType: 'CUISINE', entityId: id, metadata: { status } });
    return updated;
  }

  async listPublic(filter: PublicCuisineListFilter) {
    const { country, locale, page, pageSize } = filter;
    const countryId = await resolvePublicCountryId(this.prisma, country);
    if (countryId === GEOGRAPHY_FILTER_UNRESOLVED) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.COUNTRY_NOT_FOUND, message: 'Country not found.' });

    const where: Prisma.CuisineWhereInput = { status: PublicationStatus.PUBLISHED, countryId };
    const [total, cuisines] = await this.prisma.$transaction([
      this.prisma.cuisine.count({ where }),
      this.prisma.cuisine.findMany({ where, include: { translations: true }, orderBy: [{ canonicalSlug: 'asc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    const items = cuisines.map((c) => {
      const { translation } = resolveTranslation(c.translations, locale);
      return { id: c.id, slug: c.canonicalSlug, name: translation?.name ?? c.canonicalSlug, summary: translation?.summary ?? null };
    });
    return { items, page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
  }

  async findBySlug(slug: string, locale: string, includeUnpublished = false) {
    const cuisine = await this.prisma.cuisine.findUnique({ where: { canonicalSlug: slug }, include: { translations: true, country: true, region: true } });
    if (!cuisine) throw new NotFoundException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.CUISINE_NOT_FOUND, message: 'Cuisine not found.' });
    if (!includeUnpublished && cuisine.status !== PublicationStatus.PUBLISHED) {
      throw new NotFoundException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.CUISINE_NOT_FOUND, message: 'Cuisine not found.' });
    }
    const { translation, resolvedLocale, fallbackApplied } = resolveTranslation(cuisine.translations, locale);
    return {
      id: cuisine.id,
      slug: cuisine.canonicalSlug,
      country: cuisine.country ? { id: cuisine.country.id, slug: cuisine.country.canonicalSlug } : null,
      region: cuisine.region ? { id: cuisine.region.id, slug: cuisine.region.canonicalSlug } : null,
      translation,
      meta: { requestedLocale: locale, resolvedLocale, fallbackApplied },
    };
  }
}
