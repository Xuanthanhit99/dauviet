import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { resolveTranslation } from '../../common/translation/resolve-translation.util';
import { toSlug } from '../../common/util/slug.util';
import { CANONICAL_LOCALE } from '../../common/decorators/locale.decorator';
import { buildHistoricalPeriodColumns, toHistoricalPeriodResponse } from '../../common/historical-date/historical-date.util';
import { CreateDynastyDto } from './dto/dynasty.dto';

@Injectable()
export class DynastiesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private async ensureUniqueSlug(base: string): Promise<string> {
    let slug = base;
    let suffix = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const existing = await this.prisma.dynasty.findUnique({ where: { canonicalSlug: slug } });
      if (!existing) return slug;
      suffix += 1;
      slug = `${base}-${suffix}`;
    }
  }

  async create(dto: CreateDynastyDto, actorId: string) {
    const canonical = dto.translations.find((t) => t.locale === CANONICAL_LOCALE) ?? dto.translations[0];
    if (!canonical) throw new BadRequestException('At least one translation is required.');

    const canonicalSlug = await this.ensureUniqueSlug(toSlug(canonical.name));
    const period = buildHistoricalPeriodColumns(dto.start, dto.end, dto.dateLabel);

    const dynasty = await this.prisma.dynasty.create({
      data: {
        canonicalSlug,
        capitalPlaceId: dto.capitalPlaceId,
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
      },
      include: { translations: true },
    });

    await this.audit.log({ actorId, action: 'dynasty.created', entityType: 'DYNASTY', entityId: dynasty.id });
    return dynasty;
  }

  async findBySlug(slug: string, locale: string) {
    const dynasty = await this.prisma.dynasty.findUnique({
      where: { canonicalSlug: slug },
      include: { translations: true, personLinks: { include: { person: { include: { translations: true } } } } },
    });
    if (!dynasty) throw new NotFoundException('Dynasty not found.');

    const { translation, resolvedLocale, fallbackApplied } = resolveTranslation(dynasty.translations, locale);
    return {
      id: dynasty.id,
      slug: dynasty.canonicalSlug,
      period: toHistoricalPeriodResponse(
        {
          startYear: dynasty.startYear,
          startMonth: dynasty.startMonth,
          startDay: dynasty.startDay,
          startPrecision: dynasty.startPrecision,
          startQualifier: dynasty.startQualifier,
          startEra: dynasty.startEra,
          endYear: dynasty.endYear,
          endMonth: dynasty.endMonth,
          endDay: dynasty.endDay,
          endPrecision: dynasty.endPrecision,
          endQualifier: dynasty.endQualifier,
          endEra: dynasty.endEra,
          dateLabel: dynasty.dateLabel,
          sortStart: dynasty.sortStart,
          sortEnd: dynasty.sortEnd,
          chronologyStart: dynasty.chronologyStart,
          chronologyEnd: dynasty.chronologyEnd,
        },
        locale,
      ),
      people: dynasty.personLinks.map((l) => {
        const { translation: pt } = resolveTranslation(l.person.translations, locale);
        return { id: l.person.id, slug: l.person.canonicalSlug, displayName: pt?.displayName, role: l.role };
      }),
      translation,
      meta: { requestedLocale: locale, resolvedLocale, fallbackApplied },
    };
  }

  async list(locale: string) {
    const dynasties = await this.prisma.dynasty.findMany({ include: { translations: true }, orderBy: { chronologyStart: 'asc' } });
    return dynasties.map((d) => {
      const { translation } = resolveTranslation(d.translations, locale);
      return {
        id: d.id,
        slug: d.canonicalSlug,
        name: translation?.name ?? d.canonicalSlug,
        period: toHistoricalPeriodResponse(
          {
            startYear: d.startYear,
            startMonth: d.startMonth,
            startDay: d.startDay,
            startPrecision: d.startPrecision,
            startQualifier: d.startQualifier,
            startEra: d.startEra,
            endYear: d.endYear,
            endMonth: d.endMonth,
            endDay: d.endDay,
            endPrecision: d.endPrecision,
            endQualifier: d.endQualifier,
            endEra: d.endEra,
            dateLabel: d.dateLabel,
            sortStart: d.sortStart,
            sortEnd: d.sortEnd,
            chronologyStart: d.chronologyStart,
            chronologyEnd: d.chronologyEnd,
          },
          locale,
        ),
      };
    });
  }
}
