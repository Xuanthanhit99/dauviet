import { randomUUID } from 'crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PublicationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { resolveTranslation } from '../../common/translation/resolve-translation.util';
import { toSlug } from '../../common/util/slug.util';
import { CANONICAL_LOCALE } from '../../common/decorators/locale.decorator';
import { buildHistoricalPeriodColumns, toHistoricalPeriodResponse } from '../../common/historical-date/historical-date.util';
import { CreateTerritoryDto } from './dto/territory.dto';

@Injectable()
export class TerritoriesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private async ensureUniqueSlug(base: string): Promise<string> {
    let slug = base;
    let suffix = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const existing = await this.prisma.territory.findUnique({ where: { canonicalSlug: slug } });
      if (!existing) return slug;
      suffix += 1;
      slug = `${base}-${suffix}`;
    }
  }

  async create(dto: CreateTerritoryDto, actorId: string) {
    const canonical = dto.translations.find((t) => t.locale === CANONICAL_LOCALE) ?? dto.translations[0];
    if (!canonical) throw new BadRequestException('At least one translation is required.');

    const canonicalSlug = await this.ensureUniqueSlug(toSlug(canonical.name));
    const period = buildHistoricalPeriodColumns(dto.start, dto.end, dto.dateLabel);

    const territory = await this.prisma.territory.create({
      data: {
        type: dto.type,
        canonicalSlug,
        startYear: period.startYear,
        startMonth: period.startMonth,
        startDay: period.startDay,
        startPrecision: period.startPrecision,
        startQualifier: period.startQualifier,
        startEra: period.startEra,
        endYear: period.endYear,
        endMonth: period.endMonth,
        endDay: period.endDay,
        endPrecision: period.endPrecision,
        endQualifier: period.endQualifier,
        endEra: period.endEra,
        dateLabel: period.dateLabel,
        sortStart: period.sortStart,
        sortEnd: period.sortEnd,
        chronologyStart: period.chronologyStart,
        chronologyEnd: period.chronologyEnd,
        provenanceNote: dto.provenanceNote,
        translations: { create: dto.translations.map((t) => ({ locale: t.locale, name: t.name, slug: toSlug(t.name), summary: t.summary, description: t.description })) },
      },
      include: { translations: true },
    });

    if (dto.geometry) {
      await this.setGeometry(territory.id, dto.geometry, actorId);
    }

    await this.audit.log({ actorId, action: 'territory.created', entityType: 'TERRITORY', entityId: territory.id });
    return territory;
  }

  /**
   * Geometry provenance (spec section 17): a new revision is appended to
   * `TerritoryGeometryRevision` (never overwritten in place) before the live
   * `geometry` column is bumped, so a superseded/disputed shape stays
   * reconstructable. Publishing the new geometry still requires an explicit
   * `setGeometryStatus` call - editing geometry does not silently re-publish it.
   */
  async setGeometry(territoryId: string, geometry: Record<string, unknown>, actorId: string) {
    const territory = await this.prisma.territory.findUnique({ where: { id: territoryId } });
    if (!territory) throw new NotFoundException('Territory not found.');

    const geoJson = JSON.stringify(geometry);
    const nextVersion = territory.geometryVersion + 1;
    const revisionId = randomUUID();

    await this.prisma.$executeRaw`
      INSERT INTO "TerritoryGeometryRevision" ("id", "territoryId", "version", "geometry", "createdById")
      VALUES (${revisionId}, ${territoryId}, ${nextVersion}, ST_SetSRID(ST_GeomFromGeoJSON(${geoJson}), 4326), ${actorId})
    `;
    await this.prisma.$executeRaw`
      UPDATE "Territory"
      SET "geometry" = ST_SetSRID(ST_GeomFromGeoJSON(${geoJson}), 4326),
          "geometryVersion" = ${nextVersion},
          "geometryStatus" = 'DRAFT'
      WHERE "id" = ${territoryId}
    `;
  }

  async setGeometryStatus(territoryId: string, status: PublicationStatus, actorId: string) {
    const territory = await this.prisma.territory.findUnique({ where: { id: territoryId } });
    if (!territory) throw new NotFoundException('Territory not found.');

    const updated = await this.prisma.territory.update({
      where: { id: territoryId },
      data: { geometryStatus: status, geometryReviewedById: actorId, geometryReviewedAt: new Date() },
    });
    await this.audit.log({ actorId, action: 'territory.geometryStatus.changed', entityType: 'TERRITORY', entityId: territoryId, metadata: { status } });
    return updated;
  }

  async findBySlug(slug: string, locale: string) {
    const territory = await this.prisma.territory.findUnique({
      where: { canonicalSlug: slug },
      include: { translations: true },
    });
    if (!territory) throw new NotFoundException('Territory not found.');

    // Sensitive/unreviewed geometry must never leak through the public
    // contract (spec section 33) - only a PUBLISHED geometryStatus exposes
    // the actual shape here; draft/in-review geometry stays server-side.
    const geo =
      territory.geometryStatus === PublicationStatus.PUBLISHED
        ? await this.prisma.$queryRaw<{ geojson: string | null }[]>`
            SELECT ST_AsGeoJSON("geometry") as geojson FROM "Territory" WHERE "id" = ${territory.id}
          `
        : null;

    const { translation, resolvedLocale, fallbackApplied } = resolveTranslation(territory.translations, locale);
    return {
      id: territory.id,
      slug: territory.canonicalSlug,
      type: territory.type,
      period: toHistoricalPeriodResponse(
        {
          startYear: territory.startYear,
          startMonth: territory.startMonth,
          startDay: territory.startDay,
          startPrecision: territory.startPrecision,
          startQualifier: territory.startQualifier,
          startEra: territory.startEra,
          endYear: territory.endYear,
          endMonth: territory.endMonth,
          endDay: territory.endDay,
          endPrecision: territory.endPrecision,
          endQualifier: territory.endQualifier,
          endEra: territory.endEra,
          dateLabel: territory.dateLabel,
          sortStart: territory.sortStart,
          sortEnd: territory.sortEnd,
          chronologyStart: territory.chronologyStart,
          chronologyEnd: territory.chronologyEnd,
        },
        locale,
      ),
      provenanceNote: territory.provenanceNote,
      geometryVersion: territory.geometryVersion,
      geometryStatus: territory.geometryStatus,
      geometry: geo?.[0]?.geojson ? JSON.parse(geo[0].geojson) : null,
      translation,
      meta: { requestedLocale: locale, resolvedLocale, fallbackApplied },
    };
  }

  async list(locale: string) {
    const territories = await this.prisma.territory.findMany({ include: { translations: true }, orderBy: { chronologyStart: 'asc' } });
    return territories.map((t) => {
      const { translation } = resolveTranslation(t.translations, locale);
      return {
        id: t.id,
        slug: t.canonicalSlug,
        type: t.type,
        name: translation?.name ?? t.canonicalSlug,
        period: toHistoricalPeriodResponse(
          {
            startYear: t.startYear,
            startMonth: t.startMonth,
            startDay: t.startDay,
            startPrecision: t.startPrecision,
            startQualifier: t.startQualifier,
            startEra: t.startEra,
            endYear: t.endYear,
            endMonth: t.endMonth,
            endDay: t.endDay,
            endPrecision: t.endPrecision,
            endQualifier: t.endQualifier,
            endEra: t.endEra,
            dateLabel: t.dateLabel,
            sortStart: t.sortStart,
            sortEnd: t.sortEnd,
            chronologyStart: t.chronologyStart,
            chronologyEnd: t.chronologyEnd,
          },
          locale,
        ),
      };
    });
  }
}
