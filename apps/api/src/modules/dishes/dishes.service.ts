import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PublicationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { resolveTranslation } from '../../common/translation/resolve-translation.util';
import { toSlug } from '../../common/util/slug.util';
import { GEOGRAPHY_ERROR_CODES } from '../../common/errors/geography-error-codes';
import { STAY_FOOD_ACTIVITY_ERROR_CODES } from '../../common/errors/stay-food-activity-error-codes';
import { CreateDishDto, UpsertDishTranslationDto } from './dto/dish.dto';

export interface PublicDishListFilter {
  cuisine?: string;
  destination?: string;
  locale: string;
  page: number;
  pageSize: number;
}

@Injectable()
export class DishesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private async ensureUniqueCanonicalSlug(base: string): Promise<string> {
    let slug = base;
    let suffix = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const existing = await this.prisma.dish.findUnique({ where: { canonicalSlug: slug } });
      if (!existing) return slug;
      suffix += 1;
      slug = `${base}-${suffix}`;
    }
  }

  async create(dto: CreateDishDto, actorId: string) {
    const canonical = dto.translations.find((t) => t.locale === 'vi') ?? dto.translations[0];
    if (!canonical) throw new BadRequestException('At least one translation is required.');
    const canonicalSlug = await this.ensureUniqueCanonicalSlug(toSlug(canonical.name));
    const dish = await this.prisma.dish.create({
      data: {
        canonicalSlug,
        status: PublicationStatus.DRAFT,
        translations: { create: dto.translations.map((t) => ({ locale: t.locale, name: t.name, slug: toSlug(t.name), summary: t.summary, description: t.description, method: t.method ?? 'ORIGINAL' })) },
      },
      include: { translations: true },
    });
    await this.audit.log({ actorId, action: 'dish.created', entityType: 'DISH', entityId: dish.id });
    return dish;
  }

  async upsertTranslation(id: string, locale: string, dto: UpsertDishTranslationDto, actorId: string) {
    const dish = await this.prisma.dish.findUnique({ where: { id } });
    if (!dish) throw new NotFoundException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.DISH_NOT_FOUND, message: 'Dish not found.' });
    const translation = await this.prisma.dishTranslation.upsert({
      where: { dishId_locale: { dishId: id, locale } },
      create: { dishId: id, locale, name: dto.name, slug: toSlug(dto.name), summary: dto.summary, description: dto.description, method: dto.method ?? 'ORIGINAL' },
      update: { name: dto.name, slug: toSlug(dto.name), summary: dto.summary, description: dto.description },
    });
    await this.audit.log({ actorId, action: 'dish.translation.upserted', entityType: 'DISH', entityId: id, metadata: { locale } });
    return translation;
  }

  async setStatus(id: string, status: PublicationStatus, actorId: string) {
    const dish = await this.prisma.dish.findUnique({ where: { id } });
    if (!dish) throw new NotFoundException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.DISH_NOT_FOUND, message: 'Dish not found.' });
    const updated = await this.prisma.dish.update({ where: { id }, data: { status } });
    await this.audit.log({ actorId, action: 'dish.status.changed', entityType: 'DISH', entityId: id, metadata: { status } });
    return updated;
  }

  async setCuisines(id: string, cuisineIds: string[], actorId: string) {
    const dish = await this.prisma.dish.findUnique({ where: { id } });
    if (!dish) throw new NotFoundException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.DISH_NOT_FOUND, message: 'Dish not found.' });
    const uniqueIds = [...new Set(cuisineIds)];
    if (uniqueIds.length) {
      const found = await this.prisma.cuisine.findMany({ where: { id: { in: uniqueIds } }, select: { id: true } });
      if (found.length !== uniqueIds.length) throw new NotFoundException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.CUISINE_NOT_FOUND, message: 'One or more cuisineIds do not exist.' });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.dishCuisine.deleteMany({ where: { dishId: id } });
      if (uniqueIds.length) await tx.dishCuisine.createMany({ data: uniqueIds.map((cuisineId) => ({ dishId: id, cuisineId })) });
      await this.audit.log({ actorId, action: 'dish.cuisines.set', entityType: 'DISH', entityId: id, metadata: { count: uniqueIds.length } }, tx);
    });
    return this.prisma.dishCuisine.findMany({ where: { dishId: id } });
  }

  async setDestinations(id: string, destinationIds: string[], actorId: string) {
    const dish = await this.prisma.dish.findUnique({ where: { id } });
    if (!dish) throw new NotFoundException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.DISH_NOT_FOUND, message: 'Dish not found.' });
    const uniqueIds = [...new Set(destinationIds)];
    if (uniqueIds.length) {
      const found = await this.prisma.destination.findMany({ where: { id: { in: uniqueIds } }, select: { id: true } });
      if (found.length !== uniqueIds.length) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.DESTINATION_NOT_FOUND, message: 'One or more destinationIds do not exist.' });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.destinationDish.deleteMany({ where: { dishId: id } });
      if (uniqueIds.length) await tx.destinationDish.createMany({ data: uniqueIds.map((destinationId, index) => ({ destinationId, dishId: id, sortOrder: index })) });
      await this.audit.log({ actorId, action: 'dish.destinations.set', entityType: 'DISH', entityId: id, metadata: { count: uniqueIds.length } }, tx);
    });
    return this.prisma.destinationDish.findMany({ where: { dishId: id }, orderBy: { sortOrder: 'asc' } });
  }

  async listPublic(filter: PublicDishListFilter) {
    const { cuisine, destination, locale, page, pageSize } = filter;
    const [cuisineRow, destinationRow] = await Promise.all([
      cuisine ? this.prisma.cuisine.findFirst({ where: { status: PublicationStatus.PUBLISHED, OR: [{ canonicalSlug: cuisine }, { id: cuisine }] } }) : undefined,
      destination ? this.prisma.destination.findFirst({ where: { status: PublicationStatus.PUBLISHED, OR: [{ canonicalSlug: destination }, { id: destination }] } }) : undefined,
    ]);
    if (cuisine && !cuisineRow) throw new NotFoundException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.CUISINE_NOT_FOUND, message: 'Cuisine not found.' });
    if (destination && !destinationRow) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.DESTINATION_NOT_FOUND, message: 'Destination not found.' });

    const where: Prisma.DishWhereInput = {
      status: PublicationStatus.PUBLISHED,
      cuisineLinks: cuisineRow ? { some: { cuisineId: cuisineRow.id } } : undefined,
      destinationLinks: destinationRow ? { some: { destinationId: destinationRow.id } } : undefined,
    };
    const [total, dishes] = await this.prisma.$transaction([
      this.prisma.dish.count({ where }),
      this.prisma.dish.findMany({ where, include: { translations: true }, orderBy: [{ canonicalSlug: 'asc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    const items = dishes.map((d) => {
      const { translation } = resolveTranslation(d.translations, locale);
      return { id: d.id, slug: d.canonicalSlug, name: translation?.name ?? d.canonicalSlug, summary: translation?.summary ?? null };
    });
    return { items, page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
  }

  async findBySlug(slug: string, locale: string, includeUnpublished = false) {
    const dish = await this.prisma.dish.findUnique({
      where: { canonicalSlug: slug },
      include: { translations: true, cuisineLinks: { include: { cuisine: { include: { translations: true } } } } },
    });
    if (!dish) throw new NotFoundException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.DISH_NOT_FOUND, message: 'Dish not found.' });
    if (!includeUnpublished && dish.status !== PublicationStatus.PUBLISHED) {
      throw new NotFoundException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.DISH_NOT_FOUND, message: 'Dish not found.' });
    }
    const { translation, resolvedLocale, fallbackApplied } = resolveTranslation(dish.translations, locale);
    const cuisines = dish.cuisineLinks.map((link) => {
      const { translation: cuisineTranslation } = resolveTranslation(link.cuisine.translations, locale);
      return { id: link.cuisine.id, slug: link.cuisine.canonicalSlug, name: cuisineTranslation?.name ?? link.cuisine.canonicalSlug };
    });
    return { id: dish.id, slug: dish.canonicalSlug, translation, cuisines, meta: { requestedLocale: locale, resolvedLocale, fallbackApplied } };
  }
}
