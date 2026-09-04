import { BadRequestException } from '@nestjs/common';
import { EntityKind, PublicationStatus, StoryEditorialStatus } from '@prisma/client';
import { EditorialService } from './editorial.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

function makeService() {
  const prisma = {
    story: { findUnique: jest.fn() },
    journey: { findUnique: jest.fn() },
    place: { findUnique: jest.fn() },
    editorialSlot: { upsert: jest.fn(), findUnique: jest.fn(), delete: jest.fn(), findMany: jest.fn() },
  };
  const audit = { log: jest.fn() };
  const service = new EditorialService(prisma as unknown as PrismaService, audit as unknown as AuditService);
  return { service, prisma, audit };
}

describe('EditorialService.upsertSlot', () => {
  it('rejects a slot referencing an entity that does not exist', async () => {
    const { service, prisma } = makeService();
    prisma.story.findUnique.mockResolvedValue(null);

    await expect(
      service.upsertSlot({ slotKey: 'HOME_FEATURED_STORY', entityKind: EntityKind.STORY, entityId: 'missing' } as any, 'editor-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects an entityKind this curation layer does not support', async () => {
    const { service } = makeService();
    await expect(
      service.upsertSlot({ slotKey: 'X', entityKind: EntityKind.COMMENT, entityId: 'c1' } as any, 'editor-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('upserts a valid slot', async () => {
    const { service, prisma } = makeService();
    prisma.story.findUnique.mockResolvedValue({ id: 'story-1' });
    prisma.editorialSlot.upsert.mockResolvedValue({ id: 'slot-1', slotKey: 'HOME_FEATURED_STORY', order: 0 });

    await expect(
      service.upsertSlot({ slotKey: 'HOME_FEATURED_STORY', entityKind: EntityKind.STORY, entityId: 'story-1' } as any, 'editor-1'),
    ).resolves.toBeDefined();
  });
});

/** Covers spec section 37: a stale slot pointing at an unpublished entity never leaks through the home contract. */
describe('EditorialService.getHome', () => {
  it('silently skips a slot whose Story is no longer PUBLISHED', async () => {
    const { service, prisma } = makeService();
    prisma.editorialSlot.findMany.mockResolvedValue([
      { slotKey: 'HOME_FEATURED_STORY', order: 0, entityKind: EntityKind.STORY, entityId: 'story-1' },
    ]);
    prisma.story.findUnique.mockResolvedValue({ id: 'story-1', editorialStatus: StoryEditorialStatus.DRAFT, translations: [] });

    const home = await service.getHome('vi');
    expect(home.HOME_FEATURED_STORY).toBeUndefined();
  });

  it('includes a slot whose entity is PUBLISHED', async () => {
    const { service, prisma } = makeService();
    prisma.editorialSlot.findMany.mockResolvedValue([
      { slotKey: 'HOME_FEATURED_STORY', order: 0, entityKind: EntityKind.STORY, entityId: 'story-1' },
    ]);
    prisma.story.findUnique.mockResolvedValue({
      id: 'story-1',
      canonicalSlug: 'bach-dang',
      editorialStatus: StoryEditorialStatus.PUBLISHED,
      translations: [{ locale: 'vi', title: 'Bach Dang' }],
    });

    const home = await service.getHome('vi');
    expect(home.HOME_FEATURED_STORY).toHaveLength(1);
  });

  it('resolves a PLACE slot only when the Place is PUBLISHED', async () => {
    const { service, prisma } = makeService();
    prisma.editorialSlot.findMany.mockResolvedValue([
      { slotKey: 'HOME_SEA_ISLANDS', order: 0, entityKind: EntityKind.PLACE, entityId: 'place-1' },
    ]);
    prisma.place.findUnique.mockResolvedValue({
      id: 'place-1',
      canonicalSlug: 'hoang-sa',
      publicationStatus: PublicationStatus.PUBLISHED,
      translations: [{ locale: 'vi', name: 'Hoang Sa' }],
    });

    const home = await service.getHome('vi');
    expect(home.HOME_SEA_ISLANDS[0]).toEqual(expect.objectContaining({ kind: 'PLACE', slug: 'hoang-sa' }));
  });
});
