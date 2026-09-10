import { BadRequestException } from '@nestjs/common';
import { DateEra } from '@prisma/client';
import { TimelineService } from './timeline.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TimelineQueryDto } from './dto/timeline-query.dto';
import { toChronologyYearEnd, toChronologyYearStart } from '../../common/historical-date/historical-date.util';

/**
 * Spec section 26/58/60: the critical range-overlap regression, unknown-date
 * sort-last, and the max-range guard.
 *
 * G03 (revised): the authoritative ordering/range-filter fields are
 * `dateChronologyStart`/`dateChronologyEnd` (Event) and `chronologyStart`/
 * `chronologyEnd` (Era) - pure integer ordinals, NOT the legacy `dateSortStart`/
 * `dateSortEnd`/`sortStart`/`sortEnd` `Date` columns (see
 * historical-date.util.ts file header for why `Date.UTC` is not trustworthy
 * as an authoritative sort key). Expected ordinal values are computed via
 * the same `toChronologyYearStart`/`toChronologyYearEnd` helpers the service
 * itself uses, rather than hand-derived magic numbers.
 */
describe('TimelineService.getTimeline', () => {
  let prisma: any;
  let service: TimelineService;

  const baseEvent = {
    id: 'e1',
    canonicalSlug: 'tran-hung-dao-victory',
    dateYear: 1288,
    dateMonth: null,
    dateDay: null,
    datePrecision: 'YEAR',
    dateQualifier: null,
    dateEra: DateEra.CE,
    dateEndYear: null,
    dateEndMonth: null,
    dateEndDay: null,
    dateLabel: null,
    dateSortStart: new Date(Date.UTC(1288, 0, 1)),
    dateSortEnd: new Date(Date.UTC(1288, 11, 31)),
    dateChronologyStart: toChronologyYearStart(1288, DateEra.CE),
    dateChronologyEnd: toChronologyYearEnd(1288, DateEra.CE),
    importance: 8,
    translations: [{ locale: 'vi', title: 'Chien thang Bach Dang' }],
  };

  beforeEach(() => {
    prisma = {
      historicalEvent: { findMany: jest.fn().mockResolvedValue([]) },
      historicalEra: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new TimelineService(prisma as unknown as PrismaService);
  });

  const dto = (overrides: Partial<TimelineQueryDto> = {}): TimelineQueryDto => ({ ...overrides });

  it('rejects fromYear after toYear', async () => {
    await expect(service.getTimeline(dto({ fromYear: 1300, toYear: 1200 }), 'vi')).rejects.toThrow(BadRequestException);
  });

  it('rejects fromYear/fromEra chronologically after toYear/toEra even when the raw numbers alone would suggest otherwise (BCE: higher in-era year = earlier)', async () => {
    // 300 BCE is chronologically EARLIER than 200 BCE, despite 300 > 200 numerically.
    await expect(
      service.getTimeline(dto({ fromYear: 200, fromEra: DateEra.BCE, toYear: 300, toEra: DateEra.BCE }), 'vi'),
    ).rejects.toThrow(BadRequestException);
    // The chronologically-correct direction must NOT throw.
    await expect(
      service.getTimeline(dto({ fromYear: 300, fromEra: DateEra.BCE, toYear: 200, toEra: DateEra.BCE }), 'vi'),
    ).resolves.toBeDefined();
  });

  it('rejects a range exceeding the max span', async () => {
    await expect(service.getTimeline(dto({ fromYear: 5000, toYear: 5000, fromEra: DateEra.BCE, toEra: DateEra.CE }), 'vi')).rejects.toThrow(BadRequestException);
  });

  /**
   * G03 (2nd architecture review) - MAX_RANGE_YEARS is a whole-YEAR count
   * (chronologyYearSpan), not an ordinal span - a raw ordinal subtraction
   * would be off by up to 371 units (the "rest of the end year" baked into
   * toChronologyYearEnd) relative to a plain year-count. These boundary
   * cases pin the exact allowed span (6000 years, inclusive) across all
   * three era combinations.
   */
  describe('MAX_RANGE_YEARS boundary (exact whole-year span, inclusive of the limit)', () => {
    const MAX_RANGE_YEARS = 6000;

    it('CE -> CE: just below, exactly at, and just above the limit', async () => {
      await expect(service.getTimeline(dto({ fromYear: 1, toYear: 1 + (MAX_RANGE_YEARS - 1) }), 'vi')).resolves.toBeDefined();
      await expect(service.getTimeline(dto({ fromYear: 1, toYear: 1 + MAX_RANGE_YEARS }), 'vi')).resolves.toBeDefined();
      await expect(service.getTimeline(dto({ fromYear: 1, toYear: 1 + MAX_RANGE_YEARS + 1 }), 'vi')).rejects.toThrow(BadRequestException);
    });

    it('BCE -> BCE: just below, exactly at, and just above the limit', async () => {
      const under = { fromYear: MAX_RANGE_YEARS - 1 + 1, fromEra: DateEra.BCE, toYear: 1, toEra: DateEra.BCE };
      const at = { fromYear: MAX_RANGE_YEARS + 1, fromEra: DateEra.BCE, toYear: 1, toEra: DateEra.BCE };
      const over = { fromYear: MAX_RANGE_YEARS + 2, fromEra: DateEra.BCE, toYear: 1, toEra: DateEra.BCE };
      await expect(service.getTimeline(dto(under), 'vi')).resolves.toBeDefined();
      await expect(service.getTimeline(dto(at), 'vi')).resolves.toBeDefined();
      await expect(service.getTimeline(dto(over), 'vi')).rejects.toThrow(BadRequestException);
    });

    it('BCE -> CE: just below, exactly at, and just above the limit', async () => {
      // fromYear=1 BCE (astronomical year 0) as the fixed anchor; toYear=N CE gives a span of exactly N years.
      const under = { fromYear: 1, fromEra: DateEra.BCE, toYear: MAX_RANGE_YEARS - 1, toEra: DateEra.CE };
      const at = { fromYear: 1, fromEra: DateEra.BCE, toYear: MAX_RANGE_YEARS, toEra: DateEra.CE };
      const over = { fromYear: 1, fromEra: DateEra.BCE, toYear: MAX_RANGE_YEARS + 1, toEra: DateEra.CE };
      await expect(service.getTimeline(dto(under), 'vi')).resolves.toBeDefined();
      await expect(service.getTimeline(dto(at), 'vi')).resolves.toBeDefined();
      await expect(service.getTimeline(dto(over), 'vi')).rejects.toThrow(BadRequestException);
    });
  });

  it('uses OVERLAP semantics, not containment: an event spanning past the window end still matches when its start is within/before the window', async () => {
    await service.getTimeline(dto({ fromYear: 1200, toYear: 1300 }), 'vi');
    const where = prisma.historicalEvent.findMany.mock.calls[0][0].where;
    // Overlap: dateChronologyStart <= windowEnd AND dateChronologyEnd >= windowStart.
    expect(where.dateChronologyStart.lte).toBe(toChronologyYearEnd(1300, DateEra.CE));
    expect(where.dateChronologyEnd.gte).toBe(toChronologyYearStart(1200, DateEra.CE));
    // Explicitly NOT containment (which would require dateChronologyStart >= windowStart).
    expect(where.dateChronologyStart.gte).toBeUndefined();
  });

  it('a single-year query (fromYear=toYear) still overlaps an exact date within that year', async () => {
    await service.getTimeline(dto({ fromYear: 1288, toYear: 1288 }), 'vi');
    const where = prisma.historicalEvent.findMany.mock.calls[0][0].where;
    expect(where.dateChronologyStart.lte).toBe(toChronologyYearEnd(1288, DateEra.CE));
    expect(where.dateChronologyEnd.gte).toBe(toChronologyYearStart(1288, DateEra.CE));
  });

  it('excludes events with no known date when a range filter is applied', async () => {
    await service.getTimeline(dto({ fromYear: 1200, toYear: 1300 }), 'vi');
    const where = prisma.historicalEvent.findMany.mock.calls[0][0].where;
    // hasRangeFilter path: dateChronologyStart must be constrained (never `undefined`, which would admit unknown dates).
    expect(where.dateChronologyStart).toBeDefined();
  });

  it('does not filter on date at all when no range is given', async () => {
    await service.getTimeline(dto(), 'vi');
    const where = prisma.historicalEvent.findMany.mock.calls[0][0].where;
    expect(where.dateChronologyStart).toBeUndefined();
    expect(where.dateChronologyEnd).toBeUndefined();
  });

  it('sorts items with an unknown date last, not first', async () => {
    prisma.historicalEvent.findMany.mockResolvedValue([
      { ...baseEvent, id: 'known' },
      { ...baseEvent, id: 'unknown', dateSortStart: null, dateSortEnd: null, dateChronologyStart: null, dateChronologyEnd: null, datePrecision: 'UNKNOWN' },
    ]);
    const result = await service.getTimeline(dto(), 'vi');
    const ids = result.items.map((i) => i.id);
    expect(ids.indexOf('unknown')).toBeGreaterThan(ids.indexOf('known'));
  });

  it('merges ERA and EVENT items into a single chronologically-sorted list', async () => {
    prisma.historicalEvent.findMany.mockResolvedValue([
      { ...baseEvent, dateChronologyStart: toChronologyYearStart(1500, DateEra.CE), dateChronologyEnd: toChronologyYearEnd(1500, DateEra.CE) },
    ]);
    prisma.historicalEra.findMany.mockResolvedValue([
      {
        id: 'era1',
        canonicalSlug: 'thoi-ky-bac-thuoc',
        startYear: 100,
        startMonth: null,
        startDay: null,
        startPrecision: 'YEAR',
        startQualifier: null,
        startEra: DateEra.CE,
        dateLabel: null,
        sortStart: new Date(Date.UTC(100, 0, 1)),
        sortEnd: new Date(Date.UTC(900, 0, 1)),
        chronologyStart: toChronologyYearStart(100, DateEra.CE),
        chronologyEnd: toChronologyYearEnd(900, DateEra.CE),
        translations: [{ locale: 'vi', name: 'Thoi ky Bac thuoc' }],
      },
    ]);
    const result = await service.getTimeline(dto(), 'vi');
    expect(result.items.map((i) => i.kind)).toEqual(['ERA', 'EVENT']);
  });

  it('filters by theme via the EventTheme relation', async () => {
    await service.getTimeline(dto({ theme: 'resistance-wars' }), 'vi');
    const where = prisma.historicalEvent.findMany.mock.calls[0][0].where;
    expect(where.themeLinks).toEqual({ some: { theme: { slug: 'resistance-wars' } } });
  });

  it('filters by era, place, and person', async () => {
    await service.getTimeline(dto({ eraId: 'era1', placeId: 'place1', personId: 'person1' }), 'vi');
    const where = prisma.historicalEvent.findMany.mock.calls[0][0].where;
    expect(where.eraId).toBe('era1');
    expect(where.placeLinks).toEqual({ some: { placeId: 'place1' } });
    expect(where.personLinks).toEqual({ some: { personId: 'person1' } });
  });

  it('reports locale fallback metadata per item', async () => {
    prisma.historicalEvent.findMany.mockResolvedValue([{ ...baseEvent, translations: [{ locale: 'vi', title: 'Ten tieng Viet' }] }]);
    const result = await service.getTimeline(dto(), 'en');
    expect(result.items[0].meta).toEqual({ requestedLocale: 'en', resolvedLocale: 'vi', fallbackApplied: true });
  });

  it('caps the result limit at the maximum', async () => {
    await service.getTimeline(dto({ limit: 100000 }), 'vi');
    const call = prisma.historicalEvent.findMany.mock.calls[0][0];
    expect(call.take).toBeLessThanOrEqual(300);
  });

  it('only queries PUBLISHED events', async () => {
    await service.getTimeline(dto(), 'vi');
    const where = prisma.historicalEvent.findMany.mock.calls[0][0].where;
    expect(where.publicationStatus).toBe('PUBLISHED');
  });
});
