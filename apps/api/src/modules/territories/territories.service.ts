import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { resolveTranslation } from '../../common/translation/resolve-translation.util';
import { toSlug } from '../../common/util/slug.util';
import { CANONICAL_LOCALE } from '../../common/decorators/locale.decorator';
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

    const territory = await this.prisma.territory.create({
      data: {
        type: dto.type,
        canonicalSlug,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined,
        validTo: dto.validTo ? new Date(dto.validTo) : undefined,
        datePrecision: dto.datePrecision,
        dateLabel: dto.dateLabel,
        provenanceNote: dto.provenanceNote,
        translations: { create: dto.translations.map((t) => ({ locale: t.locale, name: t.name, slug: toSlug(t.name), summary: t.summary, description: t.description })) },
      },
      include: { translations: true },
    });

    if (dto.geometry) {
      await this.setGeometry(territory.id, dto.geometry);
    }

    await this.audit.log({ actorId, action: 'territory.created', entityType: 'TERRITORY', entityId: territory.id });
    return territory;
  }

  async setGeometry(territoryId: string, geometry: Record<string, unknown>) {
    const geoJson = JSON.stringify(geometry);
    await this.prisma.$executeRaw`
      UPDATE "Territory"
      SET "geometry" = ST_SetSRID(ST_GeomFromGeoJSON(${geoJson}), 4326),
          "geometryVersion" = "geometryVersion" + 1
      WHERE "id" = ${territoryId}
    `;
  }

  async findBySlug(slug: string, locale: string) {
    const territory = await this.prisma.territory.findUnique({
      where: { canonicalSlug: slug },
      include: { translations: true },
    });
    if (!territory) throw new NotFoundException('Territory not found.');

    const [geo] = await this.prisma.$queryRaw<{ geojson: string | null }[]>`
      SELECT ST_AsGeoJSON("geometry") as geojson FROM "Territory" WHERE "id" = ${territory.id}
    `;

    const { translation, resolvedLocale, fallbackApplied } = resolveTranslation(territory.translations, locale);
    return {
      id: territory.id,
      slug: territory.canonicalSlug,
      type: territory.type,
      validFrom: territory.validFrom,
      validTo: territory.validTo,
      datePrecision: territory.datePrecision,
      dateLabel: territory.dateLabel,
      provenanceNote: territory.provenanceNote,
      geometryVersion: territory.geometryVersion,
      geometry: geo?.geojson ? JSON.parse(geo.geojson) : null,
      translation,
      meta: { requestedLocale: locale, resolvedLocale, fallbackApplied },
    };
  }

  async list(locale: string) {
    const territories = await this.prisma.territory.findMany({ include: { translations: true }, orderBy: { validFrom: 'asc' } });
    return territories.map((t) => {
      const { translation } = resolveTranslation(t.translations, locale);
      return { id: t.id, slug: t.canonicalSlug, type: t.type, name: translation?.name ?? t.canonicalSlug, validFrom: t.validFrom, validTo: t.validTo };
    });
  }
}
