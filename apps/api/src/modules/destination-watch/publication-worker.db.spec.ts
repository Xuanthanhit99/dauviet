import { randomUUID } from 'node:crypto';
import { DestinationType, PrismaClient, PublicationStatus } from '@prisma/client';
import { claimPublicationOutbox, processClaimedPublication } from './publication-worker';

const u = (() => { try { return new URL(process.env.DATABASE_URL ?? ''); } catch { return null; } })();
const allowed = process.env.DESTINATION_WATCH_PHASE2_DB_QA === '1'
  && u?.hostname === '127.0.0.1' && u.port === '55435'
  && u.pathname === '/dauviet_qa' && u.searchParams.get('schema') === 'public';

(allowed ? describe : describe.skip)('Phase 3.2 PostgreSQL worker lease/fencing (isolated QA)', () => {
  const db = new PrismaClient();
  const s = randomUUID().replace(/-/g, '').slice(0, 16);
  const countryId = 'p32_c_' + s, destId = 'p32_d_' + s;
  const eventId = 'p32_e_' + s, userId = 'p32_u_' + s;
  let outboxId: string;

  beforeAll(async () => {
    const identity = await db.$queryRaw<Array<{ db: string; port: number }>>`SELECT current_database() AS db, inet_server_port() AS port`;
    if (identity[0]?.db !== 'dauviet_qa' || identity[0]?.port !== 5432) throw new Error('QA identity mismatch');
    await db.user.create({ data: { id: userId, email: userId + '@qa.invalid', displayName: 'Worker QA' } });
    await db.country.create({ data: { id: countryId, canonicalSlug: countryId, iso2: 'Q' + s[0].toUpperCase(),
      iso3: 'QA' + s[0].toUpperCase(), defaultLocale: 'vi', defaultCurrency: 'VND' } });
    await db.destination.create({ data: { id: destId, canonicalSlug: destId, countryId,
      type: DestinationType.OTHER, status: PublicationStatus.PUBLISHED } });
    await db.historicalEvent.create({ data: { id: eventId, canonicalSlug: eventId,
      publicationStatus: PublicationStatus.PUBLISHED, publicationRevision: 1,
      translations: { create: { locale: 'vi', title: 'Worker QA', slug: eventId } } } });
    await db.destinationWatch.create({ data: { userId, destinationId: destId } });
    const outbox = await db.notificationOutbox.create({ data: {
      eventKey: 'HistoricalEvent:' + eventId + ':1:' + destId + ':eventUpdates',
      sourceType: 'HistoricalEvent', sourceId: eventId, sourceVersion: 1,
      destinationId: destId, kind: 'eventUpdates', payload: {},
    } });
    outboxId = outbox.id;
  });

  afterAll(async () => {
    try {
      await db.watchNotification.deleteMany({ where: { destinationId: destId } });
      await db.notificationOutbox.deleteMany({ where: { destinationId: destId } });
      await db.destinationWatch.deleteMany({ where: { destinationId: destId } });
      await db.historicalEvent.deleteMany({ where: { id: eventId } });
      await db.destination.deleteMany({ where: { id: destId } });
      await db.country.deleteMany({ where: { id: countryId } });
      await db.user.deleteMany({ where: { id: userId } });
    } finally { await db.$disconnect(); }
  });

  it('only one of two simultaneous workers can claim the due row', async () => {
    const [a, b] = await Promise.all([
      claimPublicationOutbox(db, 'worker-a'), claimPublicationOutbox(db, 'worker-b'),
    ]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    const winner = a ?? b;
    expect(winner?.id).toBe(outboxId);
    expect(winner?.generation).toBe(1);
  });

  it('expired lease can be recovered; old generation cannot commit', async () => {
    const first = await db.notificationOutbox.findUniqueOrThrow({ where: { id: outboxId } });
    const stale = { id: outboxId, owner: first.leaseOwner!, generation: first.leaseGeneration };
    await db.notificationOutbox.update({ where: { id: outboxId }, data: { leaseUntil: new Date(Date.now() - 1000) } });
    const recovered = await claimPublicationOutbox(db, 'recovery-worker');
    expect(recovered).toMatchObject({ id: outboxId, owner: 'recovery-worker', generation: 2 });
    expect(await processClaimedPublication(db, stale)).toBe('SKIPPED');
    expect(await db.watchNotification.count({ where: { destinationId: destId } })).toBe(0);
    expect(await processClaimedPublication(db, recovered!)).toBe('PROCESSED');
    expect(await db.watchNotification.count({ where: { destinationId: destId } })).toBe(1);
  });

  it('processed outbox is not claimable and inbox is not duplicated', async () => {
    expect(await claimPublicationOutbox(db, 'another-worker')).toBeNull();
    expect(await db.watchNotification.count({ where: { destinationId: destId } })).toBe(1);
    expect((await db.notificationOutbox.findUniqueOrThrow({ where: { id: outboxId } })).status).toBe('PROCESSED');
  });
});
