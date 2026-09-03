import { Injectable } from '@nestjs/common';
import { PublicationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { resolveTranslation } from '../../common/translation/resolve-translation.util';
import { toHistoricalDateResponse } from '../../common/historical-date/historical-date.util';
import { TimelineQueryDto } from './dto/timeline-query.dto';

const MAX_TIMELINE_ITEMS = 300;

/**
 * Timeline is deliberately not "one event = one year integer" (spec section
 * 42): every item carries the full historical-date response (year/month/day/
 * precision/qualifier/display) so the client can render uncertain or
 * approximate dates honestly.
 *
 * Sorting rule (documented, not left implicit): items are ordered by
 * `dateSortStart`/`sortStart` - an internal, always-populated-when-known
 * DateTime computed from year/month/day/precision/qualifier (see
 * historical-date.util.ts). An item with no known date at all (UNKNOWN
 * precision) sorts last, not first - it is not "the beginning of time".
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
        dateSortStart: from ? { gte: from } : undefined,
        dateSortEnd: to ? { lte: to } : undefined,
        placeLinks: query.placeId ? { some: { placeId: query.placeId } } : undefined,
        personLinks: query.personId ? { some: { personId: query.personId } } : undefined,
      },
      include: { translations: true },
      orderBy: { dateSortStart: 'asc' },
      take: MAX_TIMELINE_ITEMS,
    });

    const eras = await this.prisma.historicalEra.findMany({
      where: {
        id: query.eraId,
        sortStart: from ? { gte: from } : undefined,
        sortEnd: to ? { lte: to } : undefined,
      },
      include: { translations: true },
      orderBy: { sortStart: 'asc' },
      take: 50,
    });

    const eventItems = events.map((e) => {
      const { translation } = resolveTranslation(e.translations, locale);
      return {
        kind: 'EVENT' as const,
        id: e.id,
        slug: e.canonicalSlug,
        title: translation?.title ?? e.canonicalSlug,
        date: toHistoricalDateResponse(
          {
            year: e.dateYear,
            month: e.dateMonth,
            day: e.dateDay,
            precision: e.datePrecision,
            qualifier: e.dateQualifier,
            endYear: e.dateEndYear,
            endMonth: e.dateEndMonth,
            endDay: e.dateEndDay,
            label: e.dateLabel,
            sortStart: e.dateSortStart,
            sortEnd: e.dateSortEnd,
          },
          locale,
        ),
        importance: e.importance,
        sortKey: e.dateSortStart,
      };
    });

    const eraItems = eras.map((e) => {
      const { translation } = resolveTranslation(e.translations, locale);
      return {
        kind: 'ERA' as const,
        id: e.id,
        slug: e.canonicalSlug,
        title: translation?.name ?? e.canonicalSlug,
        date: toHistoricalDateResponse(
          {
            year: e.startYear,
            month: e.startMonth,
            day: e.startDay,
            precision: e.startPrecision,
            qualifier: e.startQualifier,
            endYear: null,
            endMonth: null,
            endDay: null,
            label: e.dateLabel,
            sortStart: e.sortStart,
            sortEnd: e.sortEnd,
          },
          locale,
        ),
        sortKey: e.sortStart,
      };
    });

    const merged = [...eraItems, ...eventItems].sort((a, b) => {
      // Unknown dates (sortKey null) sort last, deterministically, rather
      // than defaulting to epoch/"year zero".
      if (a.sortKey === null && b.sortKey === null) return 0;
      if (a.sortKey === null) return 1;
      if (b.sortKey === null) return -1;
      return a.sortKey.getTime() - b.sortKey.getTime();
    });

    return merged.map((item) => ({
      kind: item.kind,
      id: item.id,
      slug: item.slug,
      title: item.title,
      date: item.date,
      ...(item.kind === 'EVENT' ? { importance: item.importance } : {}),
    }));
  }
}
