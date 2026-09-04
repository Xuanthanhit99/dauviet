import { BadRequestException } from '@nestjs/common';
import { TimelineService } from './timeline.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TimelineQueryDto } from './dto/timeline-query.dto';

/**
 * Spec section 26/58/60: the critical range-overlap regression, unknown-date
 * sort-last, and the max-range guard.
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
    dateEndYear: null,
    dateEndMonth: null,
    dateEndDay: null,
    dateLabel: null,
    dateSortStart: new Date(Date.UTC(1288, 0, 1)),
    dateSortEnd: new Date(Date.UTC(1288, 11, 31)),
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

  it('rejects a range exceeding the max span', async () => {
    await expect(service.getTimeline(dto({ fromYear: -5000, toYear: 5000 }), 'vi')).rejects.toThrow(BadRequestException);
  });

  it('uses OVERLAP semantics, not containment: an event spanning past the window end still matches when its start is within/before the window', async () => {
    await service.getTimeline(dto({ fromYear: 1200, toYear: 1300 }), 'vi');
    const where = prisma.historicalEvent.findMany.mock.calls[0][0].where;
    // Overlap: dateSortStart <= windowEnd AND dateSortEnd >= windowStart.
    expect(where.dateSortStart.lte).toEqual(new Date(Date.UTC(1300, 11, 31, 23, 59, 59)));
    expect(where.dateSortEnd.gte).toEqual(new Date(Date.UTC(1200, 0, 1)));
    // Explicitly NOT containment (which would require dateSortStart >= windowStart).
    expect(where.dateSortStart.gte).toBeUndefined();
  });

  it('a single-year query (fromYear=toYear) still overlaps an exact date within that year', async () => {
    await service.getTimeline(dto({ fromYear: 1288, toYear: 1288 }), 'vi');
    const where = prisma.historicalEvent.findMany.mock.calls[0][0].where;
    expect(where.dateSortStart.lte).toEqual(new Date(Date.UTC(1288, 11, 31, 23, 59, 59)));
    expect(where.dateSortEnd.gte).toEqual(new Date(Date.UTC(1288, 0, 1)));
  });

  it('excludes events with no known date when a range filter is applied', async () => {
    await service.getTimeline(dto({ fromYear: 1200, toYear: 1300 }), 'vi');
    const where = prisma.historicalEvent.findMany.mock.calls[0][0].where;
    // hasRangeFilter path: dateSortStart must be constrained (never `undefined`, which would admit unknown dates).
    expect(where.dateSortStart).toBeDefined();
  });

  it('does not filter on date at all when no range is given', async () => {
    await service.getTimeline(dto(), 'vi');
    const where = prisma.historicalEvent.findMany.mock.calls[0][0].where;
    expect(where.dateSortStart).toBeUndefined();
    expect(where.dateSortEnd).toBeUndefined();
  });

  it('sorts items with an unknown date last, not first', async () => {
    prisma.historicalEvent.findMany.mockResolvedValue([
      { ...baseEvent, id: 'known', dateSortStart: new Date(Date.UTC(1288, 0, 1)) },
      { ...baseEvent, id: 'unknown', dateSortStart: null, dateSortEnd: null, datePrecision: 'UNKNOWN' },
    ]);
    const result = await service.getTimeline(dto(), 'vi');
    const ids = result.items.map((i) => i.id);
    expect(ids.indexOf('unknown')).toBeGreaterThan(ids.indexOf('known'));
  });

  it('merges ERA and EVENT items into a single chronologically-sorted list', async () => {
    prisma.historicalEvent.findMany.mockResolvedValue([{ ...baseEvent, dateSortStart: new Date(Date.UTC(1500, 0, 1)) }]);
    prisma.historicalEra.findMany.mockResolvedValue([
      {
        id: 'era1',
        canonicalSlug: 'thoi-ky-bac-thuoc',
        startYear: 100,
        startMonth: null,
        startDay: null,
        startPrecision: 'YEAR',
        startQualifier: null,
        dateLabel: null,
        sortStart: new Date(Date.UTC(100, 0, 1)),
        sortEnd: new Date(Date.UTC(900, 0, 1)),
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
