import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PublicationStatus } from '@prisma/client';
import { CitiesService } from './cities.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DestinationsService } from '../destinations/destinations.service';

/**
 * G01 spec section 42 (CITY coverage): country/region consistency,
 * timezone validation, coordinates, translations, scoped slug resolution.
 */
describe('CitiesService', () => {
  let prisma: any;
  let audit: { log: jest.Mock };
  let destinations: { list: jest.Mock };
  let service: CitiesService;

  beforeEach(() => {
    prisma = {
      country: { findUnique: jest.fn() },
      region: { findUnique: jest.fn() },
      city: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      cityTranslation: { upsert: jest.fn() },
      $transaction: jest.fn(),
    };
    audit = { log: jest.fn() };
    destinations = { list: jest.fn() };
    service = new CitiesService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      destinations as unknown as DestinationsService,
    );
  });

  const dto = {
    countryId: 'country-vn',
    timezone: 'Asia/Ho_Chi_Minh',
    translations: [{ locale: 'vi', name: 'Hà Nội' }],
  } as any;

  describe('create', () => {
    it('rejects an unrecognised IANA timezone', async () => {
      await expect(service.create({ ...dto, timezone: 'Not/A_Real_Zone' }, 'actor-1')).rejects.toThrow(BadRequestException);
      expect(prisma.country.findUnique).not.toHaveBeenCalled();
    });

    it('rejects a countryId that does not exist', async () => {
      prisma.country.findUnique.mockResolvedValue(null);
      await expect(service.create(dto, 'actor-1')).rejects.toThrow(NotFoundException);
    });

    it('rejects a regionId belonging to a different country', async () => {
      prisma.country.findUnique.mockResolvedValue({ id: 'country-vn' });
      prisma.region.findUnique.mockResolvedValue({ id: 'region-jp', countryId: 'country-jp' });
      await expect(service.create({ ...dto, regionId: 'region-jp' }, 'actor-1')).rejects.toThrow(BadRequestException);
    });

    it('creates a city with no region (Country -> City, no Region required) and logs an audit entry', async () => {
      prisma.country.findUnique.mockResolvedValue({ id: 'country-vn' });
      prisma.city.findUnique.mockResolvedValue(null); // slug free
      prisma.city.create.mockResolvedValue({ id: 'city-1', canonicalSlug: 'ha-noi', translations: [] });

      const result = await service.create(dto, 'actor-1');

      expect(result.id).toBe('city-1');
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'city.created', entityType: 'CITY' }));
    });

    it('creates a city with a same-country region successfully', async () => {
      prisma.country.findUnique.mockResolvedValue({ id: 'country-vn' });
      prisma.region.findUnique.mockResolvedValue({ id: 'region-hn', countryId: 'country-vn' });
      prisma.city.findUnique.mockResolvedValue(null);
      prisma.city.create.mockResolvedValue({ id: 'city-1', canonicalSlug: 'ha-noi', translations: [] });

      await expect(service.create({ ...dto, regionId: 'region-hn' }, 'actor-1')).resolves.toBeDefined();
    });
  });

  describe('findBySlug (public visibility)', () => {
    const base = {
      id: 'city-1',
      canonicalSlug: 'ha-noi',
      timezone: 'Asia/Ho_Chi_Minh',
      latitude: 21.0,
      longitude: 105.8,
      country: { id: 'country-vn', canonicalSlug: 'viet-nam', iso2: 'VN' },
      region: null,
      translations: [{ locale: 'vi', name: 'Hà Nội' }],
    };

    it('404s a DRAFT city on the public path', async () => {
      prisma.city.findUnique.mockResolvedValue({ ...base, status: PublicationStatus.DRAFT });
      await expect(service.findBySlug('ha-noi', 'vi')).rejects.toThrow(NotFoundException);
    });

    it('returns a PUBLISHED city with its timezone', async () => {
      prisma.city.findUnique.mockResolvedValue({ ...base, status: PublicationStatus.PUBLISHED });
      const result = await service.findBySlug('ha-noi', 'vi');
      expect(result.timezone).toBe('Asia/Ho_Chi_Minh');
    });
  });

  describe('getDestinations', () => {
    it('resolves the city by slug (published only) then delegates to DestinationsService scoped by cityId', async () => {
      prisma.city.findUnique.mockResolvedValue({ id: 'city-1', status: PublicationStatus.PUBLISHED });
      destinations.list.mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });

      await service.getDestinations('ha-noi', 'vi', 1, 20);

      expect(destinations.list).toHaveBeenCalledWith(expect.objectContaining({ cityId: 'city-1', locale: 'vi' }));
    });

    it('404s if the city is not published', async () => {
      prisma.city.findUnique.mockResolvedValue({ id: 'city-1', status: PublicationStatus.DRAFT });
      await expect(service.getDestinations('ha-noi', 'vi', 1, 20)).rejects.toThrow(NotFoundException);
    });
  });
});
