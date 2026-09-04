import { BadRequestException, Injectable } from '@nestjs/common';
import { PublicationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { resolveTranslation } from '../../common/translation/resolve-translation.util';
import { toHistoricalDateResponse } from '../../common/historical-date/historical-date.util';
import { DISCOVERY_ERROR_CODES } from '../../common/errors/discovery-error-codes';
import { TimelineQueryDto } from './dto/timeline-query.dto';

const MAX_TIMELINE_ITEMS = 300;
/** Generous but real guard against a pathological request (spec section 58/60) - Vietnamese history spans millennia, so this stays well clear of any real query. */
const MAX_RANGE_YEARS = 6000;

/**
 * Timeline is deliberately not "one event = one year integer" (spec section
 * 24): every item carries the full historical-date response (year/month/day/
 * precision/qualifier/display) so the client can render uncertain or
 * approximate dates honestly.
 *
 * Sorting rule (documented, not left implicit): items are ordered by
 * `dateSortStart`/`sortStart` - an internal, always-populated-when-known
 * DateTime computed from year/month/day/precision/qualifier (see
 * historical-date.util.ts). An item with no known date at all (UNKNOWN
 * precision) sorts last, not first - it is not "the beginning of time".
 *
 * Range semantics (spec section 26, fixed in Phase 07 - see
 * docs/backend/DISCOVERY_ARCHITECTURE.md "Timeline range overlap" for the
 * bug this replaced): `fromYear`/`toYear` use OVERLAP semantics, not
 * containment. An event spanning 1250-1310 matches `fromYear=1200&
 * toYear=1300` because its span overlaps the query window, even though its
 * end (1310) falls outside it.
 */
@Injectable()
export class TimelineService {
  constructor(private readonly prisma: PrismaService) {}

  async getTimeline(query: TimelineQueryDto, locale: string) {
    if (query.fromYear !== undefined && query.toYear !== undefined) {
      if (query.fromYear > query.toYear) {
        throw new BadRequestException({ code: DISCOVERY_ERROR_CODES.TIMELINE_INVALID_RANGE, message: 'fromYear must not be after toYear.' });
      }
      if (query.toYear - query.fromYear > MAX_RANGE_YEARS) {
        throw new BadRequestException({ code: DISCOVERY_ERROR_CODES.TIMELINE_RANGE_TOO_LARGE, message: `Range must not exceed ${MAX_RANGE_YEARS} years.` });
      }
    }

    // Query-window bounds, in the same "full span of the coarsest unit"
    // spirit as the internal sort-bound computation (HISTORICAL_DOMAIN.md
    // section 2) - fromYear's window starts Jan 1, toYear's window ends Dec
    // 31, so a single-year query (fromYear=toYear=1288) still overlaps an
    // EXACT 1288 date.
    const windowStart = query.fromYear !== undefined ? new Date(Date.UTC(query.fromYear, 0, 1)) : undefined;
    const windowEnd = query.toYear !== undefined ? new Date(Date.UTC(query.toYear, 11, 31, 23, 59, 59)) : undefined;
    const hasRangeFilter = windowStart !== undefined || windowEnd !== undefined;

    const limit = Math.min(query.limit ?? MAX_TIMELINE_ITEMS, MAX_TIMELINE_ITEMS);

    const events = await this.prisma.historicalEvent.findMany({
      where: {
        publicationStatus: PublicationStatus.PUBLISHED,
        eraId: query.eraId,
        importance: query.minImportance !== undefined ? { gte: query.minImportance } : undefined,
        // Overlap, not containment: the event's span must start at or
        // before the window's end, AND end at or after the window's start.
        dateSortStart: windowEnd ? { lte: windowEnd } : hasRangeFilter ? { not: null } : undefined,
        dateSortEnd: windowStart ? { gte: windowStart } : undefined,
        themeLinks: query.theme ? { some: { theme: { slug: query.theme } } } : undefined,
        placeLinks: query.placeId ? { some: { placeId: query.placeId } } : undefined,
        personLinks: query.personId ? { some: { personId: query.personId } } : undefined,
      },
      include: { translations: true },
      orderBy: { dateSortStart: 'asc' },
      take: limit,
    });

    const eras = await this.prisma.historicalEra.findMany({
      where: {
        id: query.eraId,
        sortStart: windowEnd ? { lte: windowEnd } : undefined,
        sortEnd: windowStart ? { gte: windowStart } : undefined,
      },
      include: { translations: true },
      orderBy: { sortStart: 'asc' },
      take: 50,
    });

    const eventItems = events.map((e) => {
      const { translation, resolvedLocale, fallbackApplied } = resolveTranslation(e.translations, locale);
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
        meta: { requestedLocale: locale, resolvedLocale, fallbackApplied },
      };
    });

    const eraItems = eras.map((e) => {
      const { translation, resolvedLocale, fallbackApplied } = resolveTranslation(e.translations, locale);
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
        meta: { requestedLocale: locale, resolvedLocale, fallbackApplied },
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

    return {
      items: merged.map((item) => ({
        kind: item.kind,
        id: item.id,
        slug: item.slug,
        title: item.title,
        date: item.date,
        ...(item.kind === 'EVENT' ? { importance: item.importance } : {}),
        meta: item.meta,
      })),
    };
  }
}
