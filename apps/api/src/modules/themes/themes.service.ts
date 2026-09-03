import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ThemeCategory } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { resolveTranslation } from '../../common/translation/resolve-translation.util';
import { toSlug } from '../../common/util/slug.util';
import { CANONICAL_LOCALE } from '../../common/decorators/locale.decorator';
import { CreateThemeDto } from './dto/theme.dto';

/**
 * Event classification (spec section 11): a catalog + M2M join rather than
 * a single rigid enum on HistoricalEvent, so an event can carry more than
 * one theme and new specific themes can be added without a migration. The
 * bounded `ThemeCategory` enum is only the coarse filter bucket.
 */
@Injectable()
export class ThemesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private async ensureUniqueSlug(base: string): Promise<string> {
    let slug = base;
    let suffix = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const existing = await this.prisma.theme.findUnique({ where: { slug } });
      if (!existing) return slug;
      suffix += 1;
      slug = `${base}-${suffix}`;
    }
  }

  async create(dto: CreateThemeDto, actorId: string) {
    const canonical = dto.translations.find((t) => t.locale === CANONICAL_LOCALE) ?? dto.translations[0];
    if (!canonical) throw new BadRequestException('At least one translation is required.');

    const slug = await this.ensureUniqueSlug(toSlug(canonical.name));
    const theme = await this.prisma.theme.create({
      data: {
        slug,
        category: dto.category,
        translations: { create: dto.translations.map((t) => ({ locale: t.locale, name: t.name })) },
      },
      include: { translations: true },
    });

    await this.audit.log({ actorId, action: 'theme.created', entityType: 'EVENT', entityId: theme.id, metadata: { category: dto.category } });
    return theme;
  }

  async list(locale: string, category?: ThemeCategory) {
    const themes = await this.prisma.theme.findMany({
      where: category ? { category } : undefined,
      include: { translations: true },
      orderBy: { slug: 'asc' },
    });
    return themes.map((t) => {
      const { translation } = resolveTranslation(t.translations, locale);
      return { id: t.id, slug: t.slug, category: t.category, name: translation?.name ?? t.slug };
    });
  }

  async linkToEvent(themeId: string, eventId: string, actorId: string) {
    const [theme, event] = await Promise.all([
      this.prisma.theme.findUnique({ where: { id: themeId } }),
      this.prisma.historicalEvent.findUnique({ where: { id: eventId } }),
    ]);
    if (!theme) throw new NotFoundException('Theme not found.');
    if (!event) throw new NotFoundException('Event not found.');

    try {
      const link = await this.prisma.eventTheme.create({ data: { themeId, eventId } });
      await this.audit.log({ actorId, action: 'theme.linked.event', entityType: 'EVENT', entityId: eventId, metadata: { themeId } });
      return link;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('This event already has this theme.');
      }
      throw err;
    }
  }

  async unlinkFromEvent(themeId: string, eventId: string, actorId: string) {
    await this.prisma.eventTheme.deleteMany({ where: { themeId, eventId } });
    await this.audit.log({ actorId, action: 'theme.unlinked.event', entityType: 'EVENT', entityId: eventId, metadata: { themeId } });
    return { themeId, eventId };
  }
}
