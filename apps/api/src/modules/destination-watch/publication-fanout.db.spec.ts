import { randomUUID } from 'node:crypto';
import { DestinationType, PrismaClient, PublicationStatus } from '@prisma/client';
import { fanOutPublication } from './publication-fanout';

const u = (() => { try { return new URL(process.env.DATABASE_URL ?? ''); } catch { return null; } })();
const allowed = process.env.DESTINATION_WATCH_PHASE2_DB_QA === '1'
  && u?.hostname === '127.0.0.1' && u.port === '55435'
  && u.pathname === '/dauviet_qa' && u.searchParams.get('schema') === 'public';

(allowed ? describe : describe.skip)('Phase 3.1 PostgreSQL fan-out (isolated QA)', () => {
  const db = new PrismaClient();
  const s = randomUUID().replace(/-/g, '').slice(0, 16);
  const countryId = 'p31_c_' + s;
  const destId = 'p31_d_' + s;
  const eventId = 'p31_e_' + s;
  const ownerId = 'p31_o_' + s;
  const optOutId = 'p31_x_' + s;
  const lateId = 'p31_l_' + s;
  const key = 'HistoricalEvent:' + eventId + ':1:' + destId + ':eventUpdates';
  let outboxId: string;

  beforeAll(async () => {
    const identity = await db.$queryRaw<Array<{ db: string; port: number }>>`SELECT current_database() AS db, inet_server_port() AS port`;
    if (identity[0]?.db !== 'dauviet_qa' || identity[0]?.port !== 5432) throw new Error('QA identity mismatch');
    await db.user.createMany({ data: [ownerId, optOutId, lateId].map((id) => ({
      id, email: id + '@qa.invalid', displayName: 'QA fanout',
    })) });
    await db.country.create({ data: { id: countryId, canonicalSlug: countryId, iso2: 'Q' + s[0].toUpperCase(),
      iso3: 'QA' + s[0].toUpperCase(), defaultLocale: 'vi', defaultCurrency: 'VND' } });
    await db.destination.create({ data: { id: destId, canonicalSlug: destId, countryId,
      type: DestinationType.OTHER, status: PublicationStatus.PUBLISHED } });
    await db.historicalEvent.create({ data: { id: eventId, canonicalSlug: eventId,
      publicationStatus: PublicationStatus.PUBLISHED, publicationRevision: 1,
      translations: { create: { locale: 'vi', title: 'QA event', slug: eventId } } } });
    await db.destinationWatch.createMany({ data: [
      { userId: ownerId, destinationId: destId }, { userId: optOutId, destinationId: destId },
    ] });
    await db.watchPreference.create({ data: { userId: optOutId, eventUpdates: false } });
    const outbox = await db.notificationOutbox.create({ data: { eventKey: key, sourceType: 'HistoricalEvent',
      sourceId: eventId, sourceVersion: 1, destinationId: destId, kind: 'eventUpdates', payload: {} } });
    outboxId = outbox.id;
  });

  afterAll(async () => {
    try {
      await db.watchNotification.deleteMany({ where: { destinationId: destId } });
      await db.notificationOutbox.deleteMany({ where: { destinationId: destId } });
      await db.destinationWatch.deleteMany({ where: { destinationId: destId } });
      await db.watchPreference.deleteMany({ where: { userId: { in: [ownerId, optOutId, lateId] } } });
      await db.historicalEvent.deleteMany({ where: { id: eventId } });
      await db.destination.deleteMany({ where: { id: destId } });
      await db.country.deleteMany({ where: { id: countryId } });
      await db.user.deleteMany({ where: { id: { in: [ownerId, optOutId, lateId] } } });
    } finally { await db.$disconnect(); }
  });

  it('fan-out only to followers with event preference enabled; no delivery rows', async () => {
    expect(await fanOutPublication(db, outboxId)).toBe('PROCESSED');
    expect(await db.watchNotification.count({ where: { destinationId: destId } })).toBe(1);
    expect(await db.watchNotification.count({ where: { userId: ownerId, dedupeKey: key } })).toBe(1);
    expect(await db.watchNotification.count({ where: { userId: optOutId } })).toBe(0);
    expect(await db.notificationDelivery.count({ where: { notification: { destinationId: destId } } })).toBe(0);
  });

  it('repeat and concurrent invocation cannot duplicate inbox', async () => {
    expect(await Promise.all([fanOutPublication(db, outboxId), fanOutPublication(db, outboxId)]))
      .toEqual(['SKIPPED', 'SKIPPED']);
    expect(await db.watchNotification.count({ where: { destinationId: destId } })).toBe(1);
  });

  it('rolls back all inbox inserts and outbox status when a write fails; retry is safe', async () => {
    await db.notificationOutbox.update({ where: { id: outboxId }, data: { status: 'PENDING', processedAt: null } });
    await db.watchNotification.deleteMany({ where: { destinationId: destId } });
    await db.destinationWatch.create({ data: { userId: lateId, destinationId: destId } });
    // Force FK failure inside createMany, after a valid recipient, to prove atomic rollback.
    // Use a transaction-local trigger to force an error, then drop it after the test.
    await db.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION "p31_fail_${s}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'QA injected failure'; END; $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER "p31_trigger_${s}" BEFORE INSERT ON "WatchNotification" FOR EACH ROW EXECUTE FUNCTION "p31_fail_${s}"()`);
    try {
      await expect(fanOutPublication(db, outboxId)).rejects.toThrow();
      expect((await db.notificationOutbox.findUniqueOrThrow({ where: { id: outboxId } })).status).toBe('PENDING');
      expect(await db.watchNotification.count({ where: { destinationId: destId } })).toBe(0);
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "p31_trigger_${s}" ON "WatchNotification"`);
      await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "p31_fail_${s}"()`);
    }
    expect(await fanOutPublication(db, outboxId)).toBe('PROCESSED');
    expect(await db.watchNotification.count({ where: { destinationId: destId } })).toBe(2);
  });

  it('unfollowed users do not receive pending publications', async () => {
    await db.notificationOutbox.update({ where: { id: outboxId }, data: { status: 'PENDING', processedAt: null } });
    await db.watchNotification.deleteMany({ where: { destinationId: destId } });
    await db.destinationWatch.deleteMany({ where: { userId: lateId, destinationId: destId } });
    expect(await fanOutPublication(db, outboxId)).toBe('PROCESSED');
    expect(await db.watchNotification.count({ where: { userId: lateId } })).toBe(0);
  });

  it('unpublished source cancels pending outbox and creates no inbox', async () => {
    await db.notificationOutbox.update({ where: { id: outboxId }, data: { status: 'PENDING', processedAt: null } });
    await db.watchNotification.deleteMany({ where: { destinationId: destId } });
    await db.historicalEvent.update({ where: { id: eventId }, data: { publicationStatus: 'DRAFT' } });
    expect(await fanOutPublication(db, outboxId)).toBe('CANCELLED');
    expect(await db.watchNotification.count({ where: { destinationId: destId } })).toBe(0);
  });
});
