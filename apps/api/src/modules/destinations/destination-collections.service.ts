import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PublicationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { resolveTranslation } from '../../common/translation/resolve-translation.util';
import { toSlug } from '../../common/util/slug.util';
import { GEOGRAPHY_ERROR_CODES } from '../../common/errors/geography-error-codes';
import { CreateDestinationCollectionDto, SetDestinationCollectionMembersDto, UpsertDestinationCollectionTranslationDto } from './dto/destination-collection.dto';

/**
 * Editorial Destination collections (spec section 24) - see
 * schema.prisma's DestinationCollection doc comment for why this exists
 * (EditorialSlot has no slug/translations/publication of its own). Not
 * personalized - every collection is a single, shared, editorially curated
 * page (e.g. "Ancient Capitals").
 */
@Injectable()
export class DestinationCollectionsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private async ensureUniqueCanonicalSlug(base: string): Promise<string> {
    let slug = base;
    let suffix = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const existing = await this.prisma.destinationCollection.findUnique({ where: { canonicalSlug: slug } });
      if (!existing) return slug;
      suffix += 1;
      slug = `${base}-${suffix}`;
    }
  }

  async create(dto: CreateDestinationCollectionDto, actorId: string) {
    if (dto.countryId) {
      const country = await this.prisma.country.findUnique({ where: { id: dto.countryId } });
      if (!country) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.COUNTRY_NOT_FOUND, message: `No Country with id ${dto.countryId}.` });
    }

    const canonical = dto.translations.find((t) => t.locale === 'vi') ?? dto.translations[0];
    if (!canonical) throw new BadRequestException('At least one translation is required.');
    const canonicalSlug = await this.ensureUniqueCanonicalSlug(toSlug(canonical.name));

    const collection = await this.prisma.destinationCollection.create({
      data: {
        countryId: dto.countryId,
        canonicalSlug,
        status: PublicationStatus.DRAFT,
        translations: {
          create: dto.translations.map((t) => ({
            locale: t.locale,
            name: t.name,
            slug: toSlug(t.name),
            summary: t.summary,
            description: t.description,
            method: t.method ?? 'ORIGINAL',
          })),
        },
      },
      include: { translations: true },
    });

    await this.audit.log({ actorId, action: 'destinationCollection.created', entityType: 'DESTINATION', entityId: collection.id });
    return collection;
  }

  async upsertTranslation(id: string, locale: string, dto: UpsertDestinationCollectionTranslationDto, actorId: string) {
    const collection = await this.prisma.destinationCollection.findUnique({ where: { id } });
    if (!collection) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.DESTINATION_COLLECTION_NOT_FOUND, message: 'Destination collection not found.' });

    const translation = await this.prisma.destinationCollectionTranslation.upsert({
      where: { collectionId_locale: { collectionId: id, locale } },
      update: { name: dto.name, slug: toSlug(dto.name), summary: dto.summary, description: dto.description, method: dto.method ?? 'ORIGINAL' },
      create: { collectionId: id, locale, name: dto.name, slug: toSlug(dto.name), summary: dto.summary, description: dto.description, method: dto.method ?? 'ORIGINAL' },
    });

    await this.audit.log({ actorId, action: 'destinationCollection.translation.upserted', entityType: 'DESTINATION', entityId: id, metadata: { locale } });
    return translation;
  }

  async setStatus(id: string, status: PublicationStatus, actorId: string) {
    const collection = await this.prisma.destinationCollection.findUnique({ where: { id }, include: { translations: true } });
    if (!collection) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.DESTINATION_COLLECTION_NOT_FOUND, message: 'Destination collection not found.' });
    if (status === PublicationStatus.PUBLISHED && collection.translations.length === 0) {
      throw new BadRequestException({ code: GEOGRAPHY_ERROR_CODES.GEOGRAPHY_CANNOT_PUBLISH_WITHOUT_TRANSLATION, message: 'Cannot publish a collection with no translations.' });
    }
    const updated = await this.prisma.destinationCollection.update({ where: { id }, data: { status } });
    await this.audit.log({ actorId, action: 'destinationCollection.status.changed', entityType: 'DESTINATION', entityId: id, metadata: { status } });
    return updated;
  }

  /** Transactional replace-style membership mutation (spec section 42), same pattern as DestinationsService.setPlaces et al. */
  async setMembers(id: string, dto: SetDestinationCollectionMembersDto, actorId: string) {
    const collection = await this.prisma.destinationCollection.findUnique({ where: { id } });
    if (!collection) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.DESTINATION_COLLECTION_NOT_FOUND, message: 'Destination collection not found.' });

    const destinationIds = dto.members.map((m) => m.destinationId);
    if (new Set(destinationIds).size !== destinationIds.length) throw new BadRequestException('Duplicate destinationId in request.');
    const destinations = await this.prisma.destination.findMany({ where: { id: { in: destinationIds } }, select: { id: true } });
    const foundIds = new Set(destinations.map((d) => d.id));
    for (const destId of destinationIds) {
      if (!foundIds.has(destId)) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.DESTINATION_NOT_FOUND, message: `Destination ${destId} not found.` });
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.destinationCollectionMember.deleteMany({ where: { collectionId: id } });
      const created = await Promise.all(
        dto.members.map((m) => tx.destinationCollectionMember.create({ data: { collectionId: id, destinationId: m.destinationId, sortOrder: m.sortOrder ?? 0 } })),
      );
      await this.audit.log({ actorId, action: 'destinationCollection.members.set', entityType: 'DESTINATION', entityId: id, metadata: { count: created.length } }, tx);
      return created;
    });
  }

  async list(locale: string, countryId?: string) {
    const collections = await this.prisma.destinationCollection.findMany({
      where: { status: PublicationStatus.PUBLISHED, countryId },
      include: { translations: true },
      orderBy: [{ canonicalSlug: 'asc' }],
    });
    return collections.map((c) => {
      const { translation } = resolveTranslation(c.translations, locale);
      return { id: c.id, slug: c.canonicalSlug, name: translation?.name ?? c.canonicalSlug, summary: translation?.summary ?? null };
    });
  }

  async findBySlug(slug: string, locale: string, includeUnpublished = false) {
    const collection = await this.prisma.destinationCollection.findUnique({
      where: { canonicalSlug: slug },
      include: {
        translations: true,
        country: true,
        members: {
          orderBy: { sortOrder: 'asc' },
          include: { destination: { include: { translations: true } } },
        },
      },
    });
    if (!collection) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.DESTINATION_COLLECTION_NOT_FOUND, message: 'Destination collection not found.' });
    if (!includeUnpublished && collection.status !== PublicationStatus.PUBLISHED) {
      throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.DESTINATION_COLLECTION_NOT_FOUND, message: 'Destination collection not found.' });
    }

    const { translation, resolvedLocale, fallbackApplied } = resolveTranslation(collection.translations, locale);
    const members = collection.members
      .filter((m) => m.destination.status === PublicationStatus.PUBLISHED || includeUnpublished)
      .map((m) => {
        const { translation: destTranslation } = resolveTranslation(m.destination.translations, locale);
        return { id: m.destination.id, slug: m.destination.canonicalSlug, type: m.destination.type, name: destTranslation?.name ?? m.destination.canonicalSlug, sortOrder: m.sortOrder };
      });

    return {
      id: collection.id,
      slug: collection.canonicalSlug,
      status: collection.status,
      country: collection.country ? { id: collection.country.id, slug: collection.country.canonicalSlug, iso2: collection.country.iso2 } : null,
      translation,
      members,
      meta: { requestedLocale: locale, resolvedLocale, fallbackApplied },
    };
  }
}
