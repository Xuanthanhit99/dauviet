import { Injectable, NotFoundException } from '@nestjs/common';
import { EntityKind } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class BookmarksService {
  constructor(private readonly prisma: PrismaService) {}

  async add(userId: string, targetType: EntityKind, targetId: string) {
    return this.prisma.bookmark.upsert({
      where: { userId_targetType_targetId: { userId, targetType, targetId } },
      update: {},
      create: { userId, targetType, targetId },
    });
  }

  async remove(userId: string, targetType: EntityKind, targetId: string) {
    const existing = await this.prisma.bookmark.findUnique({
      where: { userId_targetType_targetId: { userId, targetType, targetId } },
    });
    if (!existing) throw new NotFoundException('Bookmark not found.');
    await this.prisma.bookmark.delete({ where: { id: existing.id } });
    return { removed: true };
  }

  async list(userId: string, targetType?: EntityKind) {
    return this.prisma.bookmark.findMany({
      where: { userId, targetType },
      orderBy: { createdAt: 'desc' },
    });
  }
}
