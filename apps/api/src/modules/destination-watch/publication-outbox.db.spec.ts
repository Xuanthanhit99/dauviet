import { randomUUID } from 'node:crypto';
import { PrismaClient, PublicationStatus, DestinationType } from '@prisma/client';
import { EventsService } from '../events/events.service';
import { AuditService } from '../audit/audit.service';

// Hard guard: this suite must never use a remote or developer's normal database.
const url = process.env.DATABASE_URL;
const allowed = (() => {
  if (process.env.DESTINATION_WATCH_PHASE2_DB_QA !== '1' || !url) return false;
  try {
    const u = new URL(url);
    return ['127.0.0.1', 'localhost'].includes(u.hostname)
      && u.port === '55435' && u.pathname === '/dauviet_qa'
      && u.searchParams.get('schema') === 'public';
  } catch { return false; }
})();
const qaDescribe = allowed ? describe : describe.skip;

qaDescribe('Phase 2 publication/outbox PostgreSQL gate (isolated QA)', () => {
  const db = new PrismaClient();
  const suffix = randomUUID().replace(/-/g, '').slice(0, 16);
  const actorId = 'p2_actor_' + suffix;
  const countryId = 'p2_country_' + suffix;
  const destinationId = 'p2_destination_' + suffix;
  const destination2Id = 'p2_destination2_' + suffix;
  const eventId = 'p2_event_' + suffix;
  const audit = new AuditService(db as never);
  const service = new EventsService(db as never, audit, {} as never);
  const eventKey = (version: number, destination: string) =>
    `HistoricalEvent:${eventId}:${version}:${destination}:eventUpdates`;

  beforeAll(async () => {
    const identity = await db.$queryRaw<Array<{ db: string; port: number }>>`
      SELECT current_database() AS db, inet_server_port() AS port
    `;
    if (identity[0]?.db !== 'dauviet_qa' || identity[0]?.port !== 5432) {
      throw new Error('Wrong QA database identity');
    }
    await db.user.create({ data: { id: actorId, email: suffix + '@phase2.invalid', displayName: 'Phase2 QA' } });
    await db.country.create({
      data: { id: countryId, canonicalSlug: 'p2-country-' + suffix,
        iso2: 'Q' + suffix.slice(0, 1).toUpperCase(),
        iso3: 'QA' + suffix.slice(0, 1).toUpperCase(),
        defaultLocale: 'vi', defaultCurrency: 'VND' },
    });
    await db.destination.createMany({ data: [
      { id: destinationId, canonicalSlug: 'p2-dest-' + suffix, countryId, type: DestinationType.OTHER },
      { id: destination2Id, canonicalSlug: 'p2-dest2-' + suffix, countryId, type: DestinationType.OTHER },
    ] });
    await db.historicalEvent.create({
      data: { id: eventId, canonicalSlug: 'p2-event-' + suffix,
        translations: { create: { locale: 'vi', title: 'Phase 2 QA', slug: 'p2-event-' + suffix } } },
    });
    await db.destinationEvent.createMany({ data: [
      { eventId, destinationId }, { eventId, destinationId: destination2Id },
    ] });
  });

  afterAll(async () => {
    try {
      await db.notificationOutbox.deleteMany({ where: { sourceType: 'HistoricalEvent', sourceId: eventId } });
      await db.auditLog.deleteMany({ where: { entityId: eventId, action: 'event.publicationStatus.changed' } });
      await db.destinationEvent.deleteMany({ where: { eventId } });
      await db.historicalEvent.delete({ where: { id: eventId } }).catch(() => undefined);
      await db.destination.deleteMany({ where: { id: { in: [destinationId, destination2Id] } } });
      await db.country.delete({ where: { id: countryId } }).catch(() => undefined);
      await db.user.delete({ where: { id: actorId } }).catch(() => undefined);
    } finally { await db.$disconnect(); }
  });

  it('rolls back publication and audit if enqueue fails', async () => {
    // A duplicate eventKey for the upcoming version makes the second insert fail.
    await db.notificationOutbox.create({
      data: { eventKey: eventKey(1, destination2Id), sourceType: 'HistoricalEvent',
        sourceId: eventId, sourceVersion: 1, destinationId: destination2Id,
        kind: 'eventUpdates', payload: { qa: true } },
    });
    await expect(service.setPublicationStatus(eventId, PublicationStatus.PUBLISHED, actorId))
      .rejects.toMatchObject({ code: 'P2002' });
    expect((await db.historicalEvent.findUniqueOrThrow({ where: { id: eventId } })).publicationStatus)
      .toBe(PublicationStatus.DRAFT);
    expect(await db.auditLog.count({ where: { entityId: eventId, action: 'event.publicationStatus.changed' } }))
      .toBe(0);
    expect(await db.notificationOutbox.count({ where: { eventKey: eventKey(1, destinationId) } })).toBe(0);
    await db.notificationOutbox.delete({ where: { eventKey: eventKey(1, destination2Id) } });
  });

  it('concurrent publish creates exactly one outbox per destination', async () => {
    await Promise.all([
      service.setPublicationStatus(eventId, PublicationStatus.PUBLISHED, actorId),
      service.setPublicationStatus(eventId, PublicationStatus.PUBLISHED, actorId),
    ]);
    const event = await db.historicalEvent.findUniqueOrThrow({ where: { id: eventId } });
    expect(event.publicationRevision).toBe(1);
    expect(await db.notificationOutbox.count({ where: { sourceType: 'HistoricalEvent', sourceId: eventId, sourceVersion: 1 } })).toBe(2);
    expect(await db.auditLog.count({ where: { entityId: eventId, action: 'event.publicationStatus.changed' } })).toBe(1);
  });

  it('repeat publish does not create another outbox', async () => {
    await service.setPublicationStatus(eventId, PublicationStatus.PUBLISHED, actorId);
    expect(await db.notificationOutbox.count({ where: { sourceType: 'HistoricalEvent', sourceId: eventId } })).toBe(2);
  });

  it('enforces eventKey uniqueness at the database layer', async () => {
    await expect(db.notificationOutbox.create({
      data: { eventKey: eventKey(1, destinationId), sourceType: 'HistoricalEvent',
        sourceId: eventId, sourceVersion: 1, destinationId,
        kind: 'eventUpdates', payload: { qa: true } },
    })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('unpublish does not emit a new publication event', async () => {
    await service.setPublicationStatus(eventId, PublicationStatus.DRAFT, actorId);
    expect(await db.notificationOutbox.count({ where: { sourceType: 'HistoricalEvent', sourceId: eventId } })).toBe(2);
    expect((await db.historicalEvent.findUniqueOrThrow({ where: { id: eventId } })).publicationRevision).toBe(2);
  });

  it('unpublish cancels pending outbox rows (required policy)', async () => {
    const rows = await db.notificationOutbox.findMany({ where: { sourceType: 'HistoricalEvent', sourceId: eventId } });
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.status === 'CANCELLED')).toBe(true);
  });
});
