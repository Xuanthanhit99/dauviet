import { NotFoundException } from '@nestjs/common';
import { PublicationStatus } from '@prisma/client';
import { PlacesService } from './places.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * Covers spec section 26/39 test #13: DRAFT/ARCHIVED entities must never
 * leak through a public read path, even if the caller doesn't filter
 * client-side. This is enforced server-side in the service, not left to the
 * frontend to hide.
 */
describe('PlacesService.findBySlug publication filtering', () => {
  let prisma: { place: { findUnique: jest.Mock }; $queryRaw: jest.Mock };
  let service: PlacesService;

  const basePlace = {
    id: 'place-1',
    canonicalSlug: 'co-do-hue',
    type: 'PALACE',
    translations: [{ id: 't1', locale: 'vi', name: 'Co do Hue' }],
    heroMedia: null,
    parentPlace: null,
  };

  beforeEach(() => {
    prisma = { place: { findUnique: jest.fn() }, $queryRaw: jest.fn().mockResolvedValue([{ lng: 107.5, lat: 16.4 }]) };
    service = new PlacesService(prisma as unknown as PrismaService, { log: jest.fn() } as unknown as AuditService);
  });

  it('404s a DRAFT place on the public path', async () => {
    prisma.place.findUnique.mockResolvedValue({ ...basePlace, publicationStatus: PublicationStatus.DRAFT });
    await expect(service.findBySlug('co-do-hue', 'vi')).rejects.toThrow(NotFoundException);
  });

  it('404s an ARCHIVED place on the public path', async () => {
    prisma.place.findUnique.mockResolvedValue({ ...basePlace, publicationStatus: PublicationStatus.ARCHIVED });
    await expect(service.findBySlug('co-do-hue', 'vi')).rejects.toThrow(NotFoundException);
  });

  it('returns a PUBLISHED place normally', async () => {
    prisma.place.findUnique.mockResolvedValue({ ...basePlace, publicationStatus: PublicationStatus.PUBLISHED });
    const result = await service.findBySlug('co-do-hue', 'vi');
    expect(result.slug).toBe('co-do-hue');
  });

  it('allows a DRAFT place through when includeUnpublished is set (admin path)', async () => {
    prisma.place.findUnique.mockResolvedValue({ ...basePlace, publicationStatus: PublicationStatus.DRAFT });
    const result = await service.findBySlug('co-do-hue', 'vi', true);
    expect(result.publicationStatus).toBe(PublicationStatus.DRAFT);
  });

  it('reports translation fallback status when the requested locale is missing', async () => {
    prisma.place.findUnique.mockResolvedValue({
      ...basePlace,
      publicationStatus: PublicationStatus.PUBLISHED,
      translations: [{ id: 't1', locale: 'vi', name: 'Co do Hue' }],
    });
    const result = await service.findBySlug('co-do-hue', 'en');
    expect(result.meta.requestedLocale).toBe('en');
    expect(result.meta.resolvedLocale).toBe('vi');
    expect(result.meta.fallbackApplied).toBe(true);
  });
});
