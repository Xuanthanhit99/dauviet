import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TripAuthorizationService, TripCapability } from './trip-authorization.service';
import { PrismaService } from '../../prisma/prisma.service';

function makePrismaStub() {
  return {
    trip: { findUnique: jest.fn() },
    tripMember: { findUnique: jest.fn() },
  } as any;
}

const TRIP = { id: 't1', ownerId: 'owner-1', archivedAt: null, version: 0 };

describe('TripAuthorizationService (spec sections 8-11 - the single centralized capability layer)', () => {
  let prisma: ReturnType<typeof makePrismaStub>;
  let service: TripAuthorizationService;

  beforeEach(() => {
    prisma = makePrismaStub();
    service = new TripAuthorizationService(prisma as unknown as PrismaService);
  });

  it('404s when the trip does not exist at all - existence never hidden (spec section 11)', async () => {
    prisma.trip.findUnique.mockResolvedValue(null);
    await expect(service.authorize('missing', 'user-1', TripCapability.VIEW_TRIP)).rejects.toThrow(NotFoundException);
  });

  it('OWNER (Trip.ownerId match) is granted every capability without any TripMember row lookup (spec section 7/8 - owner is virtual, never materialized)', async () => {
    prisma.trip.findUnique.mockResolvedValue(TRIP);
    for (const capability of Object.values(TripCapability)) {
      const result = await service.authorize('t1', 'owner-1', capability);
      expect(result.role).toBe('OWNER');
    }
    expect(prisma.tripMember.findUnique).not.toHaveBeenCalled();
  });

  it('a total stranger (no TripMember row, not the owner) is denied with TRIP_PERMISSION_DENIED, indistinguishable from an under-privileged member', async () => {
    prisma.trip.findUnique.mockResolvedValue(TRIP);
    prisma.tripMember.findUnique.mockResolvedValue(null);
    await expect(service.authorize('t1', 'stranger', TripCapability.VIEW_TRIP)).rejects.toMatchObject({
      response: { code: 'TRIP_PERMISSION_DENIED' },
    });
  });

  describe('EDITOR', () => {
    beforeEach(() => {
      prisma.trip.findUnique.mockResolvedValue(TRIP);
      prisma.tripMember.findUnique.mockResolvedValue({ tripId: 't1', userId: 'editor-1', role: 'EDITOR' });
    });

    it.each([TripCapability.VIEW_TRIP, TripCapability.EDIT_TRIP, TripCapability.GENERATE_ESTIMATE])('is granted %s', async (capability) => {
      const result = await service.authorize('t1', 'editor-1', capability);
      expect(result.role).toBe('EDITOR');
    });

    it.each([TripCapability.MANAGE_MEMBERS, TripCapability.MANAGE_INVITATIONS, TripCapability.TRANSFER_OWNERSHIP, TripCapability.ARCHIVE_TRIP])(
      'is DENIED %s - governance actions are owner-only (spec section 9)',
      async (capability) => {
        await expect(service.authorize('t1', 'editor-1', capability)).rejects.toThrow(ForbiddenException);
      },
    );
  });

  describe('VIEWER', () => {
    beforeEach(() => {
      prisma.trip.findUnique.mockResolvedValue(TRIP);
      prisma.tripMember.findUnique.mockResolvedValue({ tripId: 't1', userId: 'viewer-1', role: 'VIEWER' });
    });

    it('is granted VIEW_TRIP only', async () => {
      const result = await service.authorize('t1', 'viewer-1', TripCapability.VIEW_TRIP);
      expect(result.role).toBe('VIEWER');
    });

    it.each([TripCapability.EDIT_TRIP, TripCapability.GENERATE_ESTIMATE, TripCapability.MANAGE_MEMBERS, TripCapability.MANAGE_INVITATIONS, TripCapability.TRANSFER_OWNERSHIP, TripCapability.ARCHIVE_TRIP])(
      'is DENIED %s - a VIEWER never mutates planning content or generates estimates (spec section 9)',
      async (capability) => {
        await expect(service.authorize('t1', 'viewer-1', capability)).rejects.toThrow(ForbiddenException);
      },
    );
  });

  it('currentRole returns null (no throw) for a stranger - used by read paths that need "which role, if any" without gating', async () => {
    prisma.trip.findUnique.mockResolvedValue(TRIP);
    prisma.tripMember.findUnique.mockResolvedValue(null);
    await expect(service.currentRole('t1', 'stranger')).resolves.toBeNull();
  });

  it('currentRole still 404s for a genuinely missing trip', async () => {
    prisma.trip.findUnique.mockResolvedValue(null);
    await expect(service.currentRole('missing', 'user-1')).rejects.toThrow(NotFoundException);
  });
});
