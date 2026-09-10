import { BadRequestException, Injectable } from '@nestjs/common';
import { DateEra, PublicationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { resolveTranslation } from '../../common/translation/resolve-translation.util';
import { chronologyYearSpan, toChronologyYearEnd, toChronologyYearStart, toHistoricalDateResponse } from '../../common/historical-date/historical-date.util';
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
 *
 * BCE/CE (G03, revised): the query window and every ordering/range-filter
 * below is computed in chronology ORDINAL space (`dateChronologyStart`/
 * `dateChronologyEnd`/`chronologyStart`/`chronologyEnd` - see
 * historical-date.util.ts), never `Date`/`dateSortStart`/`sortStart`. This
 * matters for correctness, not just consistency: `fromYear`/`toYear` are
 * always positive in-era numbers paired with an explicit `fromEra`/`toEra`
 * (defaulting to CE), so e.g. "300 BCE to 200 BCE" arrives as
 * `fromYear=300&toYear=200` - chronologically 300 BCE is EARLIER than 200
 * BCE despite 300 > 200 numerically. A raw numeric `fromYear > toYear`
 * check (or a raw `toYear - fromYear` range-size check) would silently
 * misvalidate exactly this case; comparing the resolved ordinals instead is
 * correct in every era combination, including a BCE->CE window.
 */
@Injectable()
export class TimelineService {
  constructor(private readonly prisma: PrismaService) {}

  async getTimeline(query: TimelineQueryDto, locale: string) {
    // Query-window bounds, in the same "full span of the coarsest unit"
    // spirit as the internal sort-bound computation (HISTORICAL_DOMAIN.md
    // section 2) - fromYear's window starts the year's first virtual day,
    // toYear's window ends its last, so a single-year query
    // (fromYear=toYear=1288) still overlaps an EXACT 1288 date.
    const windowStart = query.fromYear !== undefined ? toChronologyYearStart(query.fromYear, query.fromEra ?? DateEra.CE) : undefined;
    const windowEnd = query.toYear !== undefined ? toChronologyYearEnd(query.toYear, query.toEra ?? DateEra.CE) : undefined;

    if (windowStart !== undefined && windowEnd !== undefined) {
      if (windowStart > windowEnd) {
        throw new BadRequestException({ code: DISCOVERY_ERROR_CODES.TIMELINE_INVALID_RANGE, message: 'fromYear/fromEra must not be chronologically after toYear/toEra.' });
      }
      // Whole-year arithmetic (chronologyYearSpan), NOT ordinal subtraction:
      // chronology ordinals are not years (toChronologyYearEnd bakes in up
      // to +371 "rest of the end year"), so a raw ordinal-difference
      // comparison against `MAX_RANGE_YEARS * <ordinal units per year>`
      // would be off by up to a year at the boundary.
      const yearSpan = chronologyYearSpan(query.fromYear!, query.fromEra ?? DateEra.CE, query.toYear!, query.toEra ?? DateEra.CE);
      if (yearSpan > MAX_RANGE_YEARS) {
        throw new BadRequestException({ code: DISCOVERY_ERROR_CODES.TIMELINE_RANGE_TOO_LARGE, message: `Range must not exceed ${MAX_RANGE_YEARS} years.` });
      }
    }

    const hasRangeFilter = windowStart !== undefined || windowEnd !== undefined;

    const limit = Math.min(query.limit ?? MAX_TIMELINE_ITEMS, MAX_TIMELINE_ITEMS);

    const events = await this.prisma.historicalEvent.findMany({
      where: {
        publicationStatus: PublicationStatus.PUBLISHED,
        eraId: query.eraId,
        importance: query.minImportance !== undefined ? { gte: query.minImportance } : undefined,
        // Overlap, not containment: the event's span must start at or
        // before the window's end, AND end at or after the window's start.
        dateChronologyStart: windowEnd !== undefined ? { lte: windowEnd } : hasRangeFilter ? { not: null } : undefined,
        dateChronologyEnd: windowStart !== undefined ? { gte: windowStart } : undefined,
        themeLinks: query.theme ? { some: { theme: { slug: query.theme } } } : undefined,
        placeLinks: query.placeId ? { some: { placeId: query.placeId } } : undefined,
        personLinks: query.personId ? { some: { personId: query.personId } } : undefined,
      },
      include: { translations: true },
      orderBy: { dateChronologyStart: 'asc' },
      take: limit,
    });

    const eras = await this.prisma.historicalEra.findMany({
      where: {
        id: query.eraId,
        chronologyStart: windowEnd !== undefined ? { lte: windowEnd } : undefined,
        chronologyEnd: windowStart !== undefined ? { gte: windowStart } : undefined,
      },
      include: { translations: true },
      orderBy: { chronologyStart: 'asc' },
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
            era: e.dateEra,
            endYear: e.dateEndYear,
            endMonth: e.dateEndMonth,
            endDay: e.dateEndDay,
            label: e.dateLabel,
            sortStart: e.dateSortStart,
            sortEnd: e.dateSortEnd,
            chronologyStart: e.dateChronologyStart,
            chronologyEnd: e.dateChronologyEnd,
          },
          locale,
        ),
        importance: e.importance,
        sortKey: e.dateChronologyStart,
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
            era: e.startEra,
            endYear: null,
            endMonth: null,
            endDay: null,
            label: e.dateLabel,
            sortStart: e.sortStart,
            sortEnd: e.sortEnd,
            chronologyStart: e.chronologyStart,
            chronologyEnd: e.chronologyEnd,
          },
          locale,
        ),
        sortKey: e.chronologyStart,
        meta: { requestedLocale: locale, resolvedLocale, fallbackApplied },
      };
    });

    const merged = [...eraItems, ...eventItems].sort((a, b) => {
      // Unknown dates (sortKey null) sort last, deterministically, rather
      // than defaulting to epoch/"year zero".
      if (a.sortKey === null && b.sortKey === null) return 0;
      if (a.sortKey === null) return 1;
      if (b.sortKey === null) return -1;
      return a.sortKey - b.sortKey;
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
