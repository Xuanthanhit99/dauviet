import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { resolveTranslation } from '../../common/translation/resolve-translation.util';
import { toSlug } from '../../common/util/slug.util';
import { CANONICAL_LOCALE } from '../../common/decorators/locale.decorator';
import { buildHistoricalPeriodColumns, toHistoricalPeriodResponse } from '../../common/historical-date/historical-date.util';
import { CreateEraDto } from './dto/era.dto';
import { GEOGRAPHY_ERROR_CODES } from '../../common/errors/geography-error-codes';

@Injectable()
export class ErasService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private async ensureUniqueSlug(base: string): Promise<string> {
    let slug = base;
    let suffix = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const existing = await this.prisma.historicalEra.findUnique({ where: { canonicalSlug: slug } });
      if (!existing) return slug;
      suffix += 1;
      slug = `${base}-${suffix}`;
    }
  }

  /**
   * Cycle prevention (spec section 14): walk the candidate parent's own
   * ancestor chain and reject if the era being edited would appear in it.
   * Guards against both "parent = self" and deeper cycles introduced by
   * re-parenting an existing era.
   */
  private async assertNoCycle(eraId: string | undefined, parentEraId: string | null | undefined): Promise<void> {
    if (!parentEraId) return;
    if (eraId && parentEraId === eraId) {
      throw new BadRequestException('An era cannot be its own parent.');
    }

    let currentId: string | null = parentEraId;
    const visited = new Set<string>();
    while (currentId) {
      if (eraId && currentId === eraId) {
        throw new BadRequestException('This would create a cycle in the era hierarchy.');
      }
      if (visited.has(currentId)) break; // pre-existing cycle elsewhere - do not loop forever
      visited.add(currentId);
      const parent: { parentEraId: string | null } | null = await this.prisma.historicalEra.findUnique({
        where: { id: currentId },
        select: { parentEraId: true },
      });
      currentId = parent?.parentEraId ?? null;
    }
  }

  /** Rejects any countryId that does not reference an existing G01 Country (G03 - EraCountry is a real M:N: an era can cover more than one modern country). */
  private async assertCountriesExist(countryIds: string[]): Promise<void> {
    if (countryIds.length === 0) return;
    const found = await this.prisma.country.findMany({ where: { id: { in: countryIds } }, select: { id: true } });
    const foundIds = new Set(found.map((c) => c.id));
    const missing = countryIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.COUNTRY_NOT_FOUND, message: `No Country with id ${missing.join(', ')}.` });
    }
  }

  async create(dto: CreateEraDto, actorId: string) {
    const canonical = dto.translations.find((t) => t.locale === CANONICAL_LOCALE) ?? dto.translations[0];
    if (!canonical) throw new BadRequestException('At least one translation is required.');

    if (dto.parentEraId) {
      const parentExists = await this.prisma.historicalEra.findUnique({ where: { id: dto.parentEraId } });
      if (!parentExists) throw new BadRequestException('parentEraId does not reference an existing era.');
    }
    await this.assertNoCycle(undefined, dto.parentEraId);

    const countryIds = dto.countryIds ?? [];
    await this.assertCountriesExist(countryIds);

    const canonicalSlug = await this.ensureUniqueSlug(toSlug(canonical.name));
    const period = buildHistoricalPeriodColumns(dto.start, dto.end, dto.dateLabel);

    const era = await this.prisma.historicalEra.create({
      data: {
        canonicalSlug,
        parentEraId: dto.parentEraId,
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
        translations: { create: dto.translations.map((t) => ({ locale: t.locale, name: t.name, slug: toSlug(t.name), summary: t.summary, description: t.description })) },
        countryLinks: countryIds.length > 0 ? { create: countryIds.map((countryId) => ({ countryId })) } : undefined,
      },
      include: { translations: true },
    });

    await this.audit.log({ actorId, action: 'era.created', entityType: 'ERA', entityId: era.id });
    return era;
  }

  /** Replaces the full EraCountry set for this era (G03) - mirrors the setParent setter pattern already used in this service. */
  async setCountries(eraId: string, countryIds: string[], actorId: string) {
    const era = await this.prisma.historicalEra.findUnique({ where: { id: eraId } });
    if (!era) throw new NotFoundException('Era not found.');
    await this.assertCountriesExist(countryIds);

    await this.prisma.$transaction([
      this.prisma.eraCountry.deleteMany({ where: { eraId } }),
      ...(countryIds.length > 0
        ? [this.prisma.eraCountry.createMany({ data: countryIds.map((countryId) => ({ eraId, countryId })) })]
        : []),
    ]);

    await this.audit.log({ actorId, action: 'era.countries.changed', entityType: 'ERA', entityId: eraId, metadata: { countryIds } });
    return this.prisma.eraCountry.findMany({ where: { eraId }, include: { country: true } });
  }

  async setParent(eraId: string, parentEraId: string | null, actorId: string) {
    const era = await this.prisma.historicalEra.findUnique({ where: { id: eraId } });
    if (!era) throw new NotFoundException('Era not found.');
    await this.assertNoCycle(eraId, parentEraId);

    const updated = await this.prisma.historicalEra.update({ where: { id: eraId }, data: { parentEraId } });
    await this.audit.log({ actorId, action: 'era.parent.changed', entityType: 'ERA', entityId: eraId, metadata: { parentEraId } });
    return updated;
  }

  async findBySlug(slug: string, locale: string) {
    const era = await this.prisma.historicalEra.findUnique({
      where: { canonicalSlug: slug },
      include: {
        translations: true,
        parentEra: { include: { translations: true } },
        childEras: { include: { translations: true } },
        countryLinks: { include: { country: true } },
      },
    });
    if (!era) throw new NotFoundException('Era not found.');

    const { translation, resolvedLocale, fallbackApplied } = resolveTranslation(era.translations, locale);
    return {
      id: era.id,
      slug: era.canonicalSlug,
      period: toHistoricalPeriodResponse(
        {
          startYear: era.startYear,
          startMonth: era.startMonth,
          startDay: era.startDay,
          startPrecision: era.startPrecision,
          startQualifier: era.startQualifier,
          startEra: era.startEra,
          endYear: era.endYear,
          endMonth: era.endMonth,
          endDay: era.endDay,
          endPrecision: era.endPrecision,
          endQualifier: era.endQualifier,
          endEra: era.endEra,
          dateLabel: era.dateLabel,
          sortStart: era.sortStart,
          sortEnd: era.sortEnd,
          chronologyStart: era.chronologyStart,
          chronologyEnd: era.chronologyEnd,
        },
        locale,
      ),
      parentEra: era.parentEra ? { id: era.parentEra.id, slug: era.parentEra.canonicalSlug } : null,
      childEras: era.childEras.map((c) => ({ id: c.id, slug: c.canonicalSlug })),
      countries: era.countryLinks.map((l) => ({ id: l.country.id, slug: l.country.canonicalSlug, iso2: l.country.iso2 })),
      translation,
      meta: { requestedLocale: locale, resolvedLocale, fallbackApplied },
    };
  }

  async list(locale: string) {
    const eras = await this.prisma.historicalEra.findMany({ include: { translations: true }, orderBy: { chronologyStart: 'asc' } });
    return eras.map((e) => {
      const { translation } = resolveTranslation(e.translations, locale);
      return {
        id: e.id,
        slug: e.canonicalSlug,
        name: translation?.name ?? e.canonicalSlug,
        period: toHistoricalPeriodResponse(
          {
            startYear: e.startYear,
            startMonth: e.startMonth,
            startDay: e.startDay,
            startPrecision: e.startPrecision,
            startQualifier: e.startQualifier,
            startEra: e.startEra,
            endYear: e.endYear,
            endMonth: e.endMonth,
            endDay: e.endDay,
            endPrecision: e.endPrecision,
            endQualifier: e.endQualifier,
            endEra: e.endEra,
            dateLabel: e.dateLabel,
            sortStart: e.sortStart,
            sortEnd: e.sortEnd,
            chronologyStart: e.chronologyStart,
            chronologyEnd: e.chronologyEnd,
          },
          locale,
        ),
      };
    });
  }
}
