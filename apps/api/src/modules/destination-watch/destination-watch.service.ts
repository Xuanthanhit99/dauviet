import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PublicationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateWatchPreferencesDto } from './destination-watch.dto';

@Injectable()
export class DestinationWatchService {
  constructor(private readonly prisma: PrismaService) {}

  async listWatches(userId: string) {
    return this.prisma.destinationWatch.findMany({
      where: { userId, destination: { status: PublicationStatus.PUBLISHED } },
      select: {
        id: true,
        destinationId: true,
        createdAt: true,
        destination: { select: { canonicalSlug: true, type: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
    });
  }

  async follow(userId: string, destinationId: string) {
    const destination = await this.prisma.destination.findFirst({
      where: { id: destinationId, status: PublicationStatus.PUBLISHED },
      select: { id: true },
    });
    if (!destination) throw new NotFoundException('Published destination not found');

    try {
      return await this.prisma.destinationWatch.upsert({
        where: { userId_destinationId: { userId, destinationId } },
        create: { userId, destinationId },
        update: {},
        select: { id: true, destinationId: true, createdAt: true },
      });
    } catch (error) {
      // Concurrent first-time upserts can race on PostgreSQL. The unique key
      // is the source of truth; retrieve the winner instead of creating twice.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.destinationWatch.findUnique({
          where: { userId_destinationId: { userId, destinationId } },
          select: { id: true, destinationId: true, createdAt: true },
        });
        if (existing) return existing;
      }
      throw error;
    }
  }

  async unfollow(userId: string, destinationId: string) {
    await this.prisma.destinationWatch.deleteMany({ where: { userId, destinationId } });
    return { following: false, destinationId };
  }

  async getPreferences(userId: string) {
    const current = await this.prisma.watchPreference.findUnique({
      where: { userId },
      select: { eventUpdates: true, editorialUpdates: true },
    });
    return current ?? { eventUpdates: true, editorialUpdates: false };
  }

  async updatePreferences(userId: string, dto: UpdateWatchPreferencesDto) {
    if (dto.eventUpdates === undefined && dto.editorialUpdates === undefined) {
      throw new BadRequestException('At least one preference must be provided');
    }
    return this.prisma.watchPreference.upsert({
      where: { userId },
      create: {
        userId,
        eventUpdates: dto.eventUpdates ?? true,
        editorialUpdates: dto.editorialUpdates ?? false,
      },
      update: {
        ...(dto.eventUpdates !== undefined ? { eventUpdates: dto.eventUpdates } : {}),
        ...(dto.editorialUpdates !== undefined ? { editorialUpdates: dto.editorialUpdates } : {}),
      },
      select: { eventUpdates: true, editorialUpdates: true },
    });
  }

  async listNotifications(userId: string, limit: number) {
    return this.prisma.watchNotification.findMany({
      where: { userId },
      select: {
        id: true,
        destinationId: true,
        kind: true,
        title: true,
        summary: true,
        createdAt: true,
        readAt: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
  }

  async markRead(userId: string, notificationId: string) {
    const result = await this.prisma.watchNotification.updateMany({
      where: { id: notificationId, userId, readAt: null },
      data: { readAt: new Date() },
    });
    if (result.count === 0) {
      const owned = await this.prisma.watchNotification.findFirst({
        where: { id: notificationId, userId },
        select: { id: true },
      });
      if (!owned) throw new NotFoundException('Notification not found');
    }
    return { id: notificationId, read: true };
  }
}
