import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TripDiscussionAccessService } from './trip-discussion-access.service';

@Injectable()
export class TripDiscussionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TripDiscussionAccessService,
  ) {}

  async list(tripId: string, userId: string) {
    await this.access.assertCanRead(tripId, userId);
    return this.prisma.tripDiscussionMessage.findMany({
      where: { tripId, deletedAt: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 50,
      select: { id: true, tripId: true, authorId: true, body: true, createdAt: true },
    });
  }

  async post(tripId: string, userId: string, body: string) {
    const normalized = body.trim();
    if (!normalized || normalized.length > 4000) {
      throw new BadRequestException('Message must contain 1 to 4000 non-whitespace characters.');
    }
    // Serialize posting against membership removal. Lock member first, then trip:
    // the same order used by TripMembersService.remove/transferOwnership.
    // A concurrent DELETE waits for this transaction; if DELETE committed
    // first, the missing member row denies the post before insertion.
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "TripMember" WHERE "tripId" = ${tripId} AND "userId" = ${userId} FOR SHARE`;
      await tx.$queryRaw`SELECT 1 FROM "Trip" WHERE "id" = ${tripId} FOR SHARE`;
      const trip = await tx.trip.findUnique({ where: { id: tripId }, select: { ownerId: true } });
      if (!trip) throw new NotFoundException('Trip not found.');
      if (trip.ownerId !== userId) {
        const member = await tx.tripMember.findUnique({ where: { tripId_userId: { tripId, userId } } });
        if (!member) throw new ForbiddenException('You do not have permission to post in this trip.');
      }
      return tx.tripDiscussionMessage.create({
        data: { tripId, authorId: userId, body: normalized },
        select: { id: true, tripId: true, authorId: true, body: true, createdAt: true },
      });
    });
  }
}
