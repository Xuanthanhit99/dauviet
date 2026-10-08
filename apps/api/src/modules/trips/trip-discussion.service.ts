import { BadRequestException, Injectable } from '@nestjs/common';
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
    await this.access.assertCanPost(tripId, userId);
    return this.prisma.tripDiscussionMessage.create({
      data: { tripId, authorId: userId, body: normalized },
      select: { id: true, tripId: true, authorId: true, body: true, createdAt: true },
    });
  }
}
