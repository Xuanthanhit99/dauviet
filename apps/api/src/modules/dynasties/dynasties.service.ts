import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { resolveTranslation } from '../../common/translation/resolve-translation.util';
import { toSlug } from '../../common/util/slug.util';
import { CANONICAL_LOCALE } from '../../common/decorators/locale.decorator';
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

    const dynasty = await this.prisma.dynasty.create({
      data: {
        canonicalSlug,
        capitalPlaceId: dto.capitalPlaceId,
        dateStart: dto.dateStart ? new Date(dto.dateStart) : undefined,
        dateEnd: dto.dateEnd ? new Date(dto.dateEnd) : undefined,
        datePrecision: dto.datePrecision,
        dateLabel: dto.dateLabel,
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
      dateStart: dynasty.dateStart,
      dateEnd: dynasty.dateEnd,
      datePrecision: dynasty.datePrecision,
      dateLabel: dynasty.dateLabel,
      people: dynasty.personLinks.map((l) => {
        const { translation: pt } = resolveTranslation(l.person.translations, locale);
        return { id: l.person.id, slug: l.person.canonicalSlug, displayName: pt?.displayName, role: l.role };
      }),
      translation,
      meta: { requestedLocale: locale, resolvedLocale, fallbackApplied },
    };
  }

  async list(locale: string) {
    const dynasties = await this.prisma.dynasty.findMany({ include: { translations: true }, orderBy: { dateStart: 'asc' } });
    return dynasties.map((d) => {
      const { translation } = resolveTranslation(d.translations, locale);
      return { id: d.id, slug: d.canonicalSlug, name: translation?.name ?? d.canonicalSlug, dateStart: d.dateStart, dateEnd: d.dateEnd };
    });
  }
}
