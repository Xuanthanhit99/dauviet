import { NotFoundException } from '@nestjs/common';
import { PublicationStatus } from '@prisma/client';
import { PeopleService } from './people.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StoriesService } from '../stories/stories.service';

/**
 * Spec Phase 07 section 29: a Person's chronological event timeline, mirroring
 * `PlacesService.getTimeline`'s PUBLISHED-only, chronologically-sorted contract.
 */
describe('PeopleService.getTimeline', () => {
  let prisma: any;
  let service: PeopleService;

  const publishedPerson = { id: 'person-1', canonicalSlug: 'quang-trung', publicationStatus: PublicationStatus.PUBLISHED };

  const eventLink = (overrides: Partial<{ id: string; publicationStatus: PublicationStatus; dateSortStart: Date | null }> = {}) => ({
    event: {
      id: overrides.id ?? 'event-1',
      canonicalSlug: 'ngoc-hoi-dong-da',
      publicationStatus: overrides.publicationStatus ?? PublicationStatus.PUBLISHED,
      dateYear: 1789,
      dateMonth: null,
      dateDay: null,
      datePrecision: 'YEAR',
      dateQualifier: null,
      dateEndYear: null,
      dateEndMonth: null,
      dateEndDay: null,
      dateLabel: null,
      dateSortStart: overrides.dateSortStart !== undefined ? overrides.dateSortStart : new Date(Date.UTC(1789, 0, 1)),
      dateSortEnd: new Date(Date.UTC(1789, 11, 31)),
      translations: [{ locale: 'vi', title: 'Chien thang Ngoc Hoi - Dong Da' }],
    },
  });

  beforeEach(() => {
    prisma = {
      person: { findUnique: jest.fn().mockResolvedValue(publishedPerson) },
      eventPerson: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new PeopleService(
      prisma as unknown as PrismaService,
      { log: jest.fn() } as unknown as AuditService,
      {} as unknown as StoriesService,
    );
  });

  it('404s when the person does not exist', async () => {
    prisma.person.findUnique.mockResolvedValue(null);
    await expect(service.getTimeline('unknown', 'vi')).rejects.toThrow(NotFoundException);
  });

  it('404s a DRAFT person on the public timeline path', async () => {
    prisma.person.findUnique.mockResolvedValue({ ...publishedPerson, publicationStatus: PublicationStatus.DRAFT });
    await expect(service.getTimeline('quang-trung', 'vi')).rejects.toThrow(NotFoundException);
  });

  it('returns only PUBLISHED events linked to the person', async () => {
    prisma.eventPerson.findMany.mockResolvedValue([
      eventLink({ id: 'e-published', publicationStatus: PublicationStatus.PUBLISHED }),
      eventLink({ id: 'e-draft', publicationStatus: PublicationStatus.DRAFT }),
    ]);
    const result = await service.getTimeline('quang-trung', 'vi');
    expect(result.map((r) => r.id)).toEqual(['e-published']);
  });

  it('orders the underlying query chronologically by dateSortStart', async () => {
    await service.getTimeline('quang-trung', 'vi');
    expect(prisma.eventPerson.findMany.mock.calls[0][0].orderBy).toEqual({ event: { dateSortStart: 'asc' } });
  });

  it('carries a full HistoricalDateResponse per item, never a bare year', async () => {
    prisma.eventPerson.findMany.mockResolvedValue([eventLink()]);
    const result = await service.getTimeline('quang-trung', 'vi');
    expect(result[0].date).toEqual(expect.objectContaining({ year: 1789, precision: 'YEAR' }));
  });
});
