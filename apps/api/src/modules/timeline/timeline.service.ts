import { Injectable } from '@nestjs/common';
import { PublicationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { resolveTranslation } from '../../common/translation/resolve-translation.util';
import { TimelineQueryDto } from './dto/timeline-query.dto';

const MAX_TIMELINE_ITEMS = 300;

/**
 * Timeline is deliberately not "one event = one year integer" (spec section
 * 26): every item carries dateStart/dateEnd/datePrecision/dateLabel so the
 * client can render uncertain or approximate dates honestly.
 */
@Injectable()
export class TimelineService {
  constructor(private readonly prisma: PrismaService) {}

  async getTimeline(query: TimelineQueryDto, locale: string) {
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;

    const events = await this.prisma.historicalEvent.findMany({
      where: {
        publicationStatus: PublicationStatus.PUBLISHED,
        eraId: query.eraId,
        importance: query.minImportance !== undefined ? { gte: query.minImportance } : undefined,
        dateStart: from ? { gte: from } : undefined,
        dateEnd: to ? { lte: to } : undefined,
        placeLinks: query.placeId ? { some: { placeId: query.placeId } } : undefined,
        personLinks: query.personId ? { some: { personId: query.personId } } : undefined,
      },
      include: { translations: true },
      orderBy: { dateStart: 'asc' },
      take: MAX_TIMELINE_ITEMS,
    });

    const eras = await this.prisma.historicalEra.findMany({
      where: {
        id: query.eraId,
        dateStart: from ? { gte: from } : undefined,
        dateEnd: to ? { lte: to } : undefined,
      },
      include: { translations: true },
      orderBy: { dateStart: 'asc' },
      take: 50,
    });

    const eventItems = events.map((e) => {
      const { translation } = resolveTranslation(e.translations, locale);
      return {
        kind: 'EVENT' as const,
        id: e.id,
        slug: e.canonicalSlug,
        title: translation?.title ?? e.canonicalSlug,
        dateStart: e.dateStart,
        dateEnd: e.dateEnd,
        datePrecision: e.datePrecision,
        dateLabel: e.dateLabel,
        importance: e.importance,
      };
    });

    const eraItems = eras.map((e) => {
      const { translation } = resolveTranslation(e.translations, locale);
      return {
        kind: 'ERA' as const,
        id: e.id,
        slug: e.canonicalSlug,
        title: translation?.name ?? e.canonicalSlug,
        dateStart: e.dateStart,
        dateEnd: e.dateEnd,
        datePrecision: e.datePrecision,
        dateLabel: e.dateLabel,
      };
    });

    return [...eraItems, ...eventItems].sort((a, b) => {
      const aTime = a.dateStart?.getTime() ?? 0;
      const bTime = b.dateStart?.getTime() ?? 0;
      return aTime - bTime;
    });
  }
}
