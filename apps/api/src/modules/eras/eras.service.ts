import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { resolveTranslation } from '../../common/translation/resolve-translation.util';
import { toSlug } from '../../common/util/slug.util';
import { CANONICAL_LOCALE } from '../../common/decorators/locale.decorator';
import { buildHistoricalPeriodColumns, toHistoricalPeriodResponse } from '../../common/historical-date/historical-date.util';
import { CreateEraDto } from './dto/era.dto';

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

  async create(dto: CreateEraDto, actorId: string) {
    const canonical = dto.translations.find((t) => t.locale === CANONICAL_LOCALE) ?? dto.translations[0];
    if (!canonical) throw new BadRequestException('At least one translation is required.');

    if (dto.parentEraId) {
      const parentExists = await this.prisma.historicalEra.findUnique({ where: { id: dto.parentEraId } });
      if (!parentExists) throw new BadRequestException('parentEraId does not reference an existing era.');
    }
    await this.assertNoCycle(undefined, dto.parentEraId);

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
        endYear: period.endYear,
        endMonth: period.endMonth,
        endDay: period.endDay,
        endPrecision: period.endPrecision,
        endQualifier: period.endQualifier,
        dateLabel: period.dateLabel,
        sortStart: period.sortStart,
        sortEnd: period.sortEnd,
        translations: { create: dto.translations.map((t) => ({ locale: t.locale, name: t.name, slug: toSlug(t.name), summary: t.summary, description: t.description })) },
      },
      include: { translations: true },
    });

    await this.audit.log({ actorId, action: 'era.created', entityType: 'ERA', entityId: era.id });
    return era;
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
      include: { translations: true, parentEra: { include: { translations: true } }, childEras: { include: { translations: true } } },
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
          endYear: era.endYear,
          endMonth: era.endMonth,
          endDay: era.endDay,
          endPrecision: era.endPrecision,
          endQualifier: era.endQualifier,
          dateLabel: era.dateLabel,
          sortStart: era.sortStart,
          sortEnd: era.sortEnd,
        },
        locale,
      ),
      parentEra: era.parentEra ? { id: era.parentEra.id, slug: era.parentEra.canonicalSlug } : null,
      childEras: era.childEras.map((c) => ({ id: c.id, slug: c.canonicalSlug })),
      translation,
      meta: { requestedLocale: locale, resolvedLocale, fallbackApplied },
    };
  }

  async list(locale: string) {
    const eras = await this.prisma.historicalEra.findMany({ include: { translations: true }, orderBy: { sortStart: 'asc' } });
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
            endYear: e.endYear,
            endMonth: e.endMonth,
            endDay: e.endDay,
            endPrecision: e.endPrecision,
            endQualifier: e.endQualifier,
            dateLabel: e.dateLabel,
            sortStart: e.sortStart,
            sortEnd: e.sortEnd,
          },
          locale,
        ),
      };
    });
  }
}
