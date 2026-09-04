import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MediaAssetStatus, PublicationStatus } from '@prisma/client';
import { JourneysService } from './journeys.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

function makePrismaStub() {
  return {
    journey: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    journeyStop: { findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(), findUnique: jest.fn() },
    place: { findUnique: jest.fn() },
    mediaAsset: { findUnique: jest.fn() },
    revision: { create: jest.fn() },
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
    $queryRaw: jest.fn().mockResolvedValue([{ lng: 105.8, lat: 21.0 }]),
  };
}

function makeService(prisma = makePrismaStub()) {
  const audit = { log: jest.fn() };
  const service = new JourneysService(prisma as unknown as PrismaService, audit as unknown as AuditService);
  return { service, prisma, audit };
}

const baseJourney = {
  id: 'journey-1',
  canonicalSlug: 'hue-imperial-trail',
  editorialStatus: PublicationStatus.IN_REVIEW,
  translations: [{ id: 't1', locale: 'vi', title: 'Duong xua Kinh thanh Hue' }],
  heroMedia: null,
  stops: [],
  version: 0,
  routeGeometrySource: null,
};

/** Covers spec section 68 tests #21/#22/#31: a Journey starts non-public, cannot publish with zero stops, and archive removes it from public discovery. */
describe('JourneysService publication', () => {
  it('creates a Journey (defaults to DRAFT at the schema level)', async () => {
    const { service, prisma } = makeService();
    prisma.journey.create.mockResolvedValue({ id: 'j1', translations: [] });
    await service.create({ translations: [{ locale: 'vi', title: 'Duong xua' }] } as any, 'editor-1');
    expect(prisma.journey.create.mock.calls[0][0].data.editorialStatus).toBeUndefined();
  });

  it('never returns a DRAFT journey publicly', async () => {
    const { service, prisma } = makeService();
    prisma.journey.findUnique.mockResolvedValue({ ...baseJourney, editorialStatus: PublicationStatus.DRAFT });
    await expect(service.findBySlug('hue-imperial-trail', 'vi')).rejects.toThrow(NotFoundException);
  });

  it('refuses to publish a Journey with zero stops', async () => {
    const { service, prisma } = makeService();
    prisma.journey.findUnique.mockResolvedValue({ ...baseJourney, stops: [] });
    await expect(service.setEditorialStatus('journey-1', PublicationStatus.PUBLISHED, 'editor-1')).rejects.toThrow(BadRequestException);
    expect(prisma.journey.update).not.toHaveBeenCalled();
  });

  it('publishes once at least one valid, PUBLISHED-place stop exists', async () => {
    const { service, prisma } = makeService();
    const journey = {
      ...baseJourney,
      stops: [{ id: 'stop-1', placeId: 'place-1', place: { publicationStatus: PublicationStatus.PUBLISHED } }],
    };
    prisma.journey.findUnique.mockResolvedValue(journey);
    prisma.journey.update.mockResolvedValue({ ...journey, editorialStatus: PublicationStatus.PUBLISHED });
    await expect(service.setEditorialStatus('journey-1', PublicationStatus.PUBLISHED, 'editor-1')).resolves.toBeDefined();
  });

  it('refuses to publish a Journey whose stop references an unpublished Place', async () => {
    const { service, prisma } = makeService();
    prisma.journey.findUnique.mockResolvedValue({
      ...baseJourney,
      stops: [{ id: 'stop-1', placeId: 'place-1', place: { publicationStatus: PublicationStatus.DRAFT } }],
    });
    await expect(service.setEditorialStatus('journey-1', PublicationStatus.PUBLISHED, 'editor-1')).rejects.toThrow(BadRequestException);
  });

  it('refuses to publish with a non-READY hero media', async () => {
    const { service, prisma } = makeService();
    prisma.journey.findUnique.mockResolvedValue({
      ...baseJourney,
      stops: [{ id: 'stop-1', placeId: 'place-1', place: { publicationStatus: PublicationStatus.PUBLISHED } }],
      heroMedia: { status: MediaAssetStatus.PROCESSING, accessPolicy: 'PUBLIC' },
    });
    await expect(service.setEditorialStatus('journey-1', PublicationStatus.PUBLISHED, 'editor-1')).rejects.toThrow(BadRequestException);
  });

  it('archives a published Journey, then it 404s publicly', async () => {
    const { service, prisma } = makeService();
    const published = { ...baseJourney, editorialStatus: PublicationStatus.PUBLISHED };
    prisma.journey.findUnique.mockResolvedValueOnce(published).mockResolvedValueOnce({ ...published, editorialStatus: PublicationStatus.ARCHIVED });
    prisma.journey.update.mockResolvedValue({ ...published, editorialStatus: PublicationStatus.ARCHIVED });

    await service.archive('journey-1', 'editor-1');
    await expect(service.findBySlug('x', 'vi')).rejects.toThrow(NotFoundException);
  });

  it('rejects a version conflict', async () => {
    const { service, prisma } = makeService();
    prisma.journey.findUnique.mockResolvedValue({ ...baseJourney, version: 5 });
    await expect(
      service.setEditorialStatus('journey-1', PublicationStatus.DRAFT, 'editor-1', { expectedVersion: 1, notes: 'x' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('creates a Revision snapshot on a published Journey mutation', async () => {
    const { service, prisma } = makeService();
    const journey = { ...baseJourney, stops: [{ id: 's1', placeId: 'p1', place: { publicationStatus: PublicationStatus.PUBLISHED } }] };
    prisma.journey.findUnique.mockResolvedValue(journey);
    prisma.journey.update.mockResolvedValue({ ...journey, editorialStatus: PublicationStatus.PUBLISHED });

    await service.setEditorialStatus('journey-1', PublicationStatus.PUBLISHED, 'editor-1');
    expect(prisma.revision.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ journeyId: 'journey-1', entityType: 'JOURNEY' }) }),
    );
  });
});

/** Covers spec section 68 tests #23/#24: stop integrity. */
describe('JourneysService.addStop', () => {
  it('rejects a stop referencing a Place that does not exist', async () => {
    const { service, prisma } = makeService();
    prisma.journey.findUnique.mockResolvedValue(baseJourney);
    prisma.place.findUnique.mockResolvedValue(null);
    prisma.journeyStop.findMany.mockResolvedValue([]);

    await expect(service.addStop('journey-1', { placeId: 'missing', order: 0 } as any, 'editor-1')).rejects.toThrow(BadRequestException);
  });

  it('rejects a duplicate Place stop on the same Journey', async () => {
    const { service, prisma } = makeService();
    prisma.journey.findUnique.mockResolvedValue(baseJourney);
    prisma.place.findUnique.mockResolvedValue({ id: 'place-1' });
    prisma.journeyStop.findMany.mockResolvedValue([{ id: 's1', placeId: 'place-1', order: 0 }]);

    await expect(service.addStop('journey-1', { placeId: 'place-1', order: 1 } as any, 'editor-1')).rejects.toThrow(BadRequestException);
  });

  it('rejects a duplicate order value on the same Journey', async () => {
    const { service, prisma } = makeService();
    prisma.journey.findUnique.mockResolvedValue(baseJourney);
    prisma.place.findUnique.mockResolvedValue({ id: 'place-2' });
    prisma.journeyStop.findMany.mockResolvedValue([{ id: 's1', placeId: 'place-1', order: 0 }]);

    await expect(service.addStop('journey-1', { placeId: 'place-2', order: 0 } as any, 'editor-1')).rejects.toThrow(BadRequestException);
  });

  it('adds a valid stop', async () => {
    const { service, prisma } = makeService();
    prisma.journey.findUnique.mockResolvedValue(baseJourney);
    prisma.place.findUnique.mockResolvedValue({ id: 'place-1' });
    prisma.journeyStop.findMany.mockResolvedValue([]);
    prisma.journeyStop.create.mockResolvedValue({ id: 'stop-1' });

    await expect(service.addStop('journey-1', { placeId: 'place-1', order: 0 } as any, 'editor-1')).resolves.toBeDefined();
  });
});

/** Covers spec section 68 tests #25/#26: deterministic ordering, reorder works. */
describe('JourneysService.reorderStops', () => {
  it('rejects a reorder that omits or adds a stop', async () => {
    const { service, prisma } = makeService();
    prisma.journeyStop.findMany.mockResolvedValue([{ id: 's1' }, { id: 's2' }]);
    await expect(service.reorderStops('journey-1', { stopIds: ['s1'] }, 'editor-1')).rejects.toThrow(BadRequestException);
  });

  it('reorders via a two-phase negative-then-final write, then returns stops in the new order', async () => {
    const { service, prisma } = makeService();
    prisma.journeyStop.findMany
      .mockResolvedValueOnce([{ id: 's1' }, { id: 's2' }])
      .mockResolvedValueOnce([{ id: 's2', order: 0 }, { id: 's1', order: 1 }]);

    const result = await service.reorderStops('journey-1', { stopIds: ['s2', 's1'] }, 'editor-1');
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(result[0].id).toBe('s2');
  });
});
