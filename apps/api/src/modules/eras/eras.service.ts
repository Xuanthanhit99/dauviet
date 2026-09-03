import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { resolveTranslation } from '../../common/translation/resolve-translation.util';
import { toSlug } from '../../common/util/slug.util';
import { CANONICAL_LOCALE } from '../../common/decorators/locale.decorator';
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

  async create(dto: CreateEraDto, actorId: string) {
    const canonical = dto.translations.find((t) => t.locale === CANONICAL_LOCALE) ?? dto.translations[0];
    if (!canonical) throw new BadRequestException('At least one translation is required.');

    const canonicalSlug = await this.ensureUniqueSlug(toSlug(canonical.name));

    const era = await this.prisma.historicalEra.create({
      data: {
        canonicalSlug,
        parentEraId: dto.parentEraId,
        dateStart: dto.dateStart ? new Date(dto.dateStart) : undefined,
        dateEnd: dto.dateEnd ? new Date(dto.dateEnd) : undefined,
        datePrecision: dto.datePrecision,
        dateLabel: dto.dateLabel,
        translations: { create: dto.translations.map((t) => ({ locale: t.locale, name: t.name, slug: toSlug(t.name), summary: t.summary, description: t.description })) },
      },
      include: { translations: true },
    });

    await this.audit.log({ actorId, action: 'era.created', entityType: 'ERA', entityId: era.id });
    return era;
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
      dateStart: era.dateStart,
      dateEnd: era.dateEnd,
      datePrecision: era.datePrecision,
      dateLabel: era.dateLabel,
      parentEra: era.parentEra ? { id: era.parentEra.id, slug: era.parentEra.canonicalSlug } : null,
      childEras: era.childEras.map((c) => ({ id: c.id, slug: c.canonicalSlug })),
      translation,
      meta: { requestedLocale: locale, resolvedLocale, fallbackApplied },
    };
  }

  async list(locale: string) {
    const eras = await this.prisma.historicalEra.findMany({ include: { translations: true }, orderBy: { dateStart: 'asc' } });
    return eras.map((e) => {
      const { translation } = resolveTranslation(e.translations, locale);
      return { id: e.id, slug: e.canonicalSlug, name: translation?.name ?? e.canonicalSlug, dateStart: e.dateStart, dateEnd: e.dateEnd };
    });
  }
}
