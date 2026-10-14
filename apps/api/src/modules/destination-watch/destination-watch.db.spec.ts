import { randomUUID } from 'node:crypto';
import { PrismaClient, PublicationStatus, DestinationType } from '@prisma/client';
import { DestinationWatchService } from './destination-watch.service';

// Explicit opt-in: never run against an arbitrary DATABASE_URL or production.
const url = process.env.DATABASE_URL;
const allowed = (() => {
  if (!url || process.env.DESTINATION_WATCH_DB_QA !== '1') return false;
  try {
    const parsed = new URL(url);
    return parsed.hostname === '127.0.0.1' &&
      parsed.port === '55433' &&
      parsed.pathname === '/dauviet_dw_v15_qa' &&
      parsed.searchParams.get('schema') === 'public';
  } catch { return false; }
})();
const qaDescribe = allowed ? describe : describe.skip;

qaDescribe('Destination Watch V1.5 PostgreSQL integration (isolated QA only)', () => {
  const prisma = new PrismaClient();
  const service = new DestinationWatchService(prisma as never);
  const suffix = randomUUID().replace(/-/g, '').slice(0, 16);
  const ownerId = 'dwqa_owner_' + suffix;
  const outsiderId = 'dwqa_outsider_' + suffix;
  const countryId = 'dwqa_country_' + suffix;
  const destinationId = 'dwqa_dest_' + suffix;

  beforeAll(async () => {
    const db = await prisma.$queryRaw<Array<{ db: string; port: number }>>`
      SELECT current_database() AS db, inet_server_port() AS port
    `;
    if (db[0]?.db !== 'dauviet_dw_v15_qa' || db[0]?.port !== 5432) {
      throw new Error('Destination Watch QA database identity mismatch');
    }
    await prisma.user.createMany({
      data: [
        { id: ownerId, email: suffix + '-owner@dwqa.invalid', displayName: 'DW QA owner' },
        { id: outsiderId, email: suffix + '-outsider@dwqa.invalid', displayName: 'DW QA outsider' },
      ],
    });
    await prisma.country.create({
      data: {
        id: countryId, canonicalSlug: 'dwqa-country-' + suffix,
        iso2: 'Q' + suffix.slice(0, 1).toUpperCase(),
        iso3: 'QA' + suffix.slice(0, 1).toUpperCase(),
        defaultLocale: 'vi', defaultCurrency: 'VND',
      },
    });
    await prisma.destination.create({
      data: {
        id: destinationId, canonicalSlug: 'dwqa-destination-' + suffix,
        countryId, type: DestinationType.OTHER, status: PublicationStatus.PUBLISHED,
      },
    });
  });

  afterAll(async () => {
    try {
      await prisma.watchNotification.deleteMany({ where: { destinationId } });
      await prisma.destinationWatch.deleteMany({ where: { destinationId } });
      await prisma.watchPreference.deleteMany({ where: { userId: { in: [ownerId, outsiderId] } } });
      await prisma.destination.deleteMany({ where: { id: destinationId } });
      await prisma.country.deleteMany({ where: { id: countryId } });
      await prisma.user.deleteMany({ where: { id: { in: [ownerId, outsiderId] } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('concurrent follows are idempotent and unique per owner/destination', async () => {
    const result = await Promise.all(
      Array.from({ length: 8 }, () => service.follow(ownerId, destinationId)),
    );
    expect(new Set(result.map((watch) => watch.id)).size).toBe(1);
    expect(await prisma.destinationWatch.count({ where: { userId: ownerId, destinationId } })).toBe(1);
    await expect(prisma.destinationWatch.create({
      data: { userId: ownerId, destinationId },
    })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('separates owners and prevents cross-owner unfollow', async () => {
    await service.follow(outsiderId, destinationId);
    await service.unfollow(outsiderId, destinationId);
    expect(await prisma.destinationWatch.count({ where: { userId: ownerId, destinationId } })).toBe(1);
    expect(await prisma.destinationWatch.count({ where: { userId: outsiderId, destinationId } })).toBe(0);
  });

  it('enforces one preference per user and independent defaults', async () => {
    expect(await service.getPreferences(outsiderId)).toEqual({ eventUpdates: true, editorialUpdates: false });
    await service.updatePreferences(ownerId, { editorialUpdates: true });
    expect(await service.getPreferences(ownerId)).toEqual({ eventUpdates: true, editorialUpdates: true });
    expect(await service.getPreferences(outsiderId)).toEqual({ eventUpdates: true, editorialUpdates: false });
    await expect(prisma.watchPreference.create({ data: { userId: ownerId } }))
      .rejects.toMatchObject({ code: 'P2002' });
  });

  it('dedupes notifications by owner and key; read ownership is enforced', async () => {
    const key = 'dwqa:' + suffix;
    const first = await prisma.watchNotification.create({
      data: { userId: ownerId, destinationId, dedupeKey: key, kind: 'EDITORIAL', title: 'QA notification' },
    });
    await expect(prisma.watchNotification.create({
      data: { userId: ownerId, destinationId, dedupeKey: key, kind: 'EDITORIAL', title: 'Duplicate' },
    })).rejects.toMatchObject({ code: 'P2002' });
    const second = await prisma.watchNotification.create({
      data: { userId: outsiderId, destinationId, dedupeKey: key, kind: 'EDITORIAL', title: 'Other owner' },
    });
    expect((await service.listNotifications(outsiderId, 20)).map((n) => n.id)).toContain(second.id);
    expect((await service.listNotifications(outsiderId, 20)).map((n) => n.id)).not.toContain(first.id);
    await expect(service.markRead(outsiderId, first.id)).rejects.toMatchObject({ status: 404 });
    expect((await prisma.watchNotification.findUnique({ where: { id: first.id } }))?.readAt).toBeNull();
    await service.markRead(ownerId, first.id);
    expect((await prisma.watchNotification.findUnique({ where: { id: first.id } }))?.readAt).not.toBeNull();
  });

  it('rejects nonexistent user and destination foreign keys', async () => {
    await expect(prisma.destinationWatch.create({
      data: { userId: 'missing_' + suffix, destinationId },
    })).rejects.toMatchObject({ code: 'P2003' });
    await expect(prisma.watchNotification.create({
      data: { userId: ownerId, destinationId: 'missing_' + suffix, dedupeKey: 'missing_' + suffix, kind: 'QA', title: 'QA' },
    })).rejects.toMatchObject({ code: 'P2003' });
  });

  it('restricts deleting destinations while notifications reference them', async () => {
    await expect(prisma.destination.delete({ where: { id: destinationId } }))
      .rejects.toMatchObject({ code: 'P2003' });
  });
});
