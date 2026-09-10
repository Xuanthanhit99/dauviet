import { NotFoundException } from '@nestjs/common';
import { DateEra, DatePrecision, DateQualifier, PublicationStatus } from '@prisma/client';
import { EventsService } from './events.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * Covers spec section 26/39 test #13 for events, plus #12 (year precision
 * never becomes January 1st) end-to-end through the service's response
 * shape, not just the underlying util.
 */
describe('EventsService.findBySlug', () => {
  let prisma: { historicalEvent: { findUnique: jest.Mock } };
  let service: EventsService;

  const baseEvent = {
    id: 'event-1',
    canonicalSlug: 'bach-dang-1288',
    translations: [{ id: 't1', locale: 'vi', title: 'Chien thang Bach Dang 1288' }],
    heroMedia: null,
    era: null,
    territory: null,
    placeLinks: [],
    personLinks: [],
    themeLinks: [],
    countryLinks: [],
    dateYear: 1288,
    dateMonth: null,
    dateDay: null,
    datePrecision: DatePrecision.YEAR,
    dateQualifier: DateQualifier.EXACT,
    dateEra: DateEra.CE,
    dateEndYear: null,
    dateEndMonth: null,
    dateEndDay: null,
    dateLabel: null,
    dateSortStart: new Date(Date.UTC(1288, 0, 1)),
    dateSortEnd: new Date(Date.UTC(1288, 11, 31)),
    dateChronologyStart: 1288 * 372,
    dateChronologyEnd: 1288 * 372 + 371,
  };

  beforeEach(() => {
    prisma = { historicalEvent: { findUnique: jest.fn() } };
    service = new EventsService(prisma as unknown as PrismaService, { log: jest.fn() } as unknown as AuditService, {} as any);
  });

  it('404s a DRAFT event on the public path', async () => {
    prisma.historicalEvent.findUnique.mockResolvedValue({ ...baseEvent, publicationStatus: PublicationStatus.DRAFT });
    await expect(service.findBySlug('bach-dang-1288', 'vi')).rejects.toThrow(NotFoundException);
  });

  it('never reports a fabricated month/day for a YEAR-precision event', async () => {
    prisma.historicalEvent.findUnique.mockResolvedValue({ ...baseEvent, publicationStatus: PublicationStatus.PUBLISHED });
    const result = await service.findBySlug('bach-dang-1288', 'en');
    expect(result.date.year).toBe(1288);
    expect(result.date.month).toBeNull();
    expect(result.date.day).toBeNull();
    expect(result.date.display).toBe('1288');
  });
});
