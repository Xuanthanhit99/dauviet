import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { bootstrapTestApp } from './bootstrap-test-app';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * G06 Trip Planner (foundational aggregate root only - itinerary/transport/
 * cost-engine endpoints are not yet implemented) - live e2e coverage for the
 * ownership pattern (404-then-403, never hiding existence), optimistic
 * concurrency (409, deliberately not 400 - pre-implementation report
 * section 1.7), non-destructive archive semantics (spec correction: default
 * list excludes archived, mutation is blocked once archived, read stays
 * available, nothing is deleted), and calendar-date validation.
 *
 * Only two users are registered for the whole file (`POST /v1/auth/register`
 * is throttled to 5/60s per IP - see auth.controller.ts) and reused across
 * every `it()`, creating a fresh throwaway Trip per assertion instead of a
 * fresh user.
 */
describe('Trips (G06) - e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const stamp = Date.now();
  const createdEmails: string[] = [];
  let ownerToken: string;
  let otherToken: string;

  async function registerAndLogin(label: string) {
    const email = `g06-${label}-${stamp}@example.com`;
    createdEmails.push(email);
    await request(app.getHttpServer()).post('/v1/auth/register').send({ email, password: 'E2eTest-Pass!1', displayName: email }).expect(201);
    const res = await request(app.getHttpServer()).post('/v1/auth/login').send({ email, password: 'E2eTest-Pass!1' }).expect(201);
    return res.body.data.accessToken as string;
  }

  function createTrip(token: string, overrides: Record<string, unknown> = {}) {
    return request(app.getHttpServer())
      .post('/v1/trips')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Kyoto autumn trip', startDate: '2026-11-01', endDate: '2026-11-05', primaryCurrency: 'VND', ...overrides });
  }

  beforeAll(async () => {
    app = await bootstrapTestApp();
    prisma = app.get(PrismaService);
    ownerToken = await registerAndLogin('owner');
    otherToken = await registerAndLogin('other');
  }, 30_000);
  // ^ Explicit hook timeout (Jest's default is 5000ms): this hook does a full
  // Nest app bootstrap (Postgres + Redis/BullMQ connections) plus two real
  // register+login round trips, each hashing/verifying a password with
  // argon2 (deliberately expensive). Observed exceeding 5000ms specifically
  // when this suite was the first e2e file to run in a sequential
  // (--runInBand) session right after a fresh container start - a genuine
  // cold-start cost, not a hang (every other e2e suite in the same run
  // passed in 5-44s once already warm). 30s leaves generous headroom without
  // masking an actual regression.

  afterAll(async () => {
    // User.trips is `onDelete: Cascade` - deleting the throwaway test users
    // also removes every Trip (and its children) they created. The cost-
    // estimate tree is deleted explicitly first: a single `DELETE FROM
    // "User"` cascading through many paths at once (Trip -> TripDay/TripItem/
    // TripTransportLeg via CASCADE, and separately Trip -> Generation ->
    // TripCostEstimate -> TripCostEstimateItem via CASCADE, while
    // TripCostEstimateItem *also* holds SET NULL FKs back to TripDay/
    // TripItem/TripTransportLeg) hits a real, reproducible PostgreSQL
    // cascade-ordering conflict (confirmed live via a direct SQL repro:
    // "insert or update on table TripCostEstimateItem violates foreign key
    // constraint TripCostEstimateItem_estimateId_fkey" - the SET NULL update
    // from one path fires while the CASCADE delete from the other path is
    // mid-flight). This is not reachable through any current product route
    // (no Trip/User hard-delete endpoint exists yet - only archive/soft-
    // delete), so it is a test-cleanup-only concern; deleting each level in
    // its own statement, in dependency order, avoids the multi-path race
    // entirely. Not fixed via the migration/schema itself, since the G06
    // migration is accepted and this isn't a live defect.
    const ownedTripIds = (await prisma.trip.findMany({ where: { owner: { email: { in: createdEmails } } }, select: { id: true } })).map((t) => t.id);
    if (ownedTripIds.length > 0) {
      await prisma.tripCostEstimateItem.deleteMany({ where: { estimate: { generation: { tripId: { in: ownedTripIds } } } } });
      await prisma.tripCostEstimate.deleteMany({ where: { generation: { tripId: { in: ownedTripIds } } } });
      await prisma.tripCostEstimateGeneration.deleteMany({ where: { tripId: { in: ownedTripIds } } });
    }
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    await app.close();
  });

  it('rejects an unauthenticated request', async () => {
    await request(app.getHttpServer()).get('/v1/trips').expect(401);
  });

  it('rejects endDate before startDate with TRIP_INVALID_DATE_RANGE', async () => {
    const res = await createTrip(ownerToken, { startDate: '2026-11-05', endDate: '2026-11-01' }).expect(400);
    expect(res.body.error.code).toBe('TRIP_INVALID_DATE_RANGE');
  });

  it('creates a trip, uppercases-and-validates the currency, and defaults travelerCount to 1', async () => {
    const res = await createTrip(ownerToken, { primaryCurrency: 'jpy' }).expect(201);
    expect(res.body.data.primaryCurrency).toBe('JPY');
    expect(res.body.data.travelerCount).toBe(1);
    expect(res.body.data.version).toBe(0);
    expect(res.body.data.archivedAt).toBeNull();
  });

  it('allows a one-day trip where startDate === endDate', async () => {
    await createTrip(ownerToken, { startDate: '2026-11-01', endDate: '2026-11-01' }).expect(201);
  });

  describe('ownership (404-then-403, never hiding existence)', () => {
    it('404s for a trip id that does not exist at all', async () => {
      const res = await request(app.getHttpServer()).get('/v1/trips/not-a-real-id').set('Authorization', `Bearer ${ownerToken}`).expect(404);
      expect(res.body.error.code).toBe('TRIP_NOT_FOUND');
    });

    it("403s when a different authenticated user requests someone else's trip - TRIP_PERMISSION_DENIED (G07: the same code an under-privileged member would get, so the response never reveals 'you have some relationship, just not enough')", async () => {
      const createRes = await createTrip(ownerToken).expect(201);
      const tripId = createRes.body.data.id as string;

      const res = await request(app.getHttpServer()).get(`/v1/trips/${tripId}`).set('Authorization', `Bearer ${otherToken}`).expect(403);
      expect(res.body.error.code).toBe('TRIP_PERMISSION_DENIED');
    });
  });

  describe('optimistic concurrency (409, not 400 - deliberate divergence)', () => {
    it('409s with TRIP_VERSION_CONFLICT on a stale expectedVersion', async () => {
      const createRes = await createTrip(ownerToken).expect(201);
      const tripId = createRes.body.data.id as string;

      const res = await request(app.getHttpServer())
        .patch(`/v1/trips/${tripId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ expectedVersion: 99, title: 'renamed' })
        .expect(409);
      expect(res.body.error.code).toBe('TRIP_VERSION_CONFLICT');
    });

    it('succeeds and increments version with the correct expectedVersion', async () => {
      const createRes = await createTrip(ownerToken).expect(201);
      const tripId = createRes.body.data.id as string;

      const res = await request(app.getHttpServer())
        .patch(`/v1/trips/${tripId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ expectedVersion: 0, title: 'renamed' })
        .expect(200);
      expect(res.body.data.title).toBe('renamed');
      expect(res.body.data.version).toBe(1);
    });
  });

  describe('non-destructive archive (spec correction)', () => {
    it('excludes an archived trip from the default list but keeps it readable by id, and blocks further mutation', async () => {
      const createRes = await createTrip(ownerToken, { title: 'To be archived' }).expect(201);
      const tripId = createRes.body.data.id as string;

      const beforeList = await request(app.getHttpServer()).get('/v1/trips').set('Authorization', `Bearer ${ownerToken}`).expect(200);
      expect(beforeList.body.data.items.map((t: any) => t.id)).toContain(tripId);

      const archiveRes = await request(app.getHttpServer())
        .post(`/v1/trips/${tripId}/archive`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ expectedVersion: 0 })
        .expect(201);
      expect(archiveRes.body.data.archivedAt).not.toBeNull();

      const afterList = await request(app.getHttpServer()).get('/v1/trips').set('Authorization', `Bearer ${ownerToken}`).expect(200);
      expect(afterList.body.data.items.map((t: any) => t.id)).not.toContain(tripId);

      // Still readable by id - viewing history is exactly the use case archiving exists for.
      const detailRes = await request(app.getHttpServer()).get(`/v1/trips/${tripId}`).set('Authorization', `Bearer ${ownerToken}`).expect(200);
      expect(detailRes.body.data.id).toBe(tripId);

      // An archived trip is read-only.
      const updateRes = await request(app.getHttpServer())
        .patch(`/v1/trips/${tripId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ expectedVersion: 1, title: 'should not apply' })
        .expect(409);
      expect(updateRes.body.error.code).toBe('TRIP_ARCHIVED');

      // Archiving never deletes the row or its (currently nonexistent) children - the Trip itself still exists in the DB.
      const stillExists = await prisma.trip.findUnique({ where: { id: tripId } });
      expect(stillExists).not.toBeNull();
      expect(stillExists?.archivedAt).not.toBeNull();
    });

    it('is owner-only and audited, and 409s if archived twice', async () => {
      const createRes = await createTrip(ownerToken, { title: 'Archive twice' }).expect(201);
      const tripId = createRes.body.data.id as string;

      // Owner-only: a non-owner cannot archive it either.
      await request(app.getHttpServer())
        .post(`/v1/trips/${tripId}/archive`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ expectedVersion: 0 })
        .expect(403);

      await request(app.getHttpServer()).post(`/v1/trips/${tripId}/archive`).set('Authorization', `Bearer ${ownerToken}`).send({ expectedVersion: 0 }).expect(201);

      const secondArchive = await request(app.getHttpServer())
        .post(`/v1/trips/${tripId}/archive`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ expectedVersion: 1 })
        .expect(409);
      expect(secondArchive.body.error.code).toBe('TRIP_ARCHIVED');

      const auditRow = await prisma.auditLog.findFirst({ where: { entityType: 'TRIP', entityId: tripId, action: 'trip.archived' } });
      expect(auditRow).not.toBeNull();
    });
  });

  describe('itinerary sub-resources (TripDestination/TripDay/TripItem/TripTransportLeg)', () => {
    let destinationSlug: string;
    let activitySlug: string;

    beforeAll(async () => {
      const destination = await prisma.destination.findFirstOrThrow({ where: { status: 'PUBLISHED' } });
      destinationSlug = destination.canonicalSlug;
      const activity = await prisma.activity.findFirstOrThrow({ where: { status: 'PUBLISHED' } });
      activitySlug = activity.canonicalSlug;
    });

    it('materializes one TripDay per calendar day on create', async () => {
      const createRes = await createTrip(ownerToken, { startDate: '2026-11-01', endDate: '2026-11-03' }).expect(201);
      const tripId = createRes.body.data.id as string;
      const days = await prisma.tripDay.findMany({ where: { tripId }, orderBy: { dayNumber: 'asc' } });
      expect(days.map((d) => d.dayNumber)).toEqual([1, 2, 3]);
    });

    it('replaces the destination list, resolving a real published slug and rejecting an unresolvable one', async () => {
      const createRes = await createTrip(ownerToken).expect(201);
      const tripId = createRes.body.data.id as string;

      const badRes = await request(app.getHttpServer())
        .put(`/v1/trips/${tripId}/destinations`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ expectedVersion: 0, destinations: [{ destinationSlug: 'not-a-real-destination' }] })
        .expect(404);
      expect(badRes.body.error.code).toBe('DESTINATION_NOT_FOUND');

      const okRes = await request(app.getHttpServer())
        .put(`/v1/trips/${tripId}/destinations`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ expectedVersion: 0, destinations: [{ destinationSlug }] })
        .expect(200);
      expect(okRes.body.data).toHaveLength(1);
      expect(okRes.body.data[0].destinationId).toBe((await prisma.destination.findUnique({ where: { canonicalSlug: destinationSlug } }))?.id);
    });

    it('rejects a TripItem with two canonical target fields, then accepts a valid ACTIVITY item and enforces reorder-only afterward', async () => {
      const createRes = await createTrip(ownerToken, { startDate: '2026-11-01', endDate: '2026-11-01' }).expect(201);
      const tripId = createRes.body.data.id as string;
      const day = await prisma.tripDay.findFirstOrThrow({ where: { tripId } });

      const badRes = await request(app.getHttpServer())
        .put(`/v1/trips/${tripId}/days/${day.id}/items`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ expectedVersion: 0, items: [{ type: 'CUSTOM', title: 'x', placeSlug: 'y' }] })
        .expect(400);
      expect(badRes.body.error.code).toBe('TRIP_ITEM_TARGET_MISMATCH');

      const okRes = await request(app.getHttpServer())
        .put(`/v1/trips/${tripId}/days/${day.id}/items`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ expectedVersion: 0, items: [{ type: 'ACTIVITY', activitySlug }, { type: 'CUSTOM', title: 'Free time' }] })
        .expect(200);
      expect(okRes.body.data).toHaveLength(2);
      const [first, second] = okRes.body.data;

      const reorderRes = await request(app.getHttpServer())
        .patch(`/v1/trips/${tripId}/days/${day.id}/items/reorder`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ expectedVersion: 1, itemIds: [second.id, first.id] })
        .expect(200);
      expect(reorderRes.body.data.map((i: any) => i.id)).toEqual([second.id, first.id]);
    });

    it('replaces transport legs and rejects the replace once a TRANSPORT item references one', async () => {
      const createRes = await createTrip(ownerToken, { startDate: '2026-11-01', endDate: '2026-11-01' }).expect(201);
      const tripId = createRes.body.data.id as string;
      const day = await prisma.tripDay.findFirstOrThrow({ where: { tripId } });

      const legsRes = await request(app.getHttpServer())
        .put(`/v1/trips/${tripId}/transport-legs`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ expectedVersion: 0, transportLegs: [{ mode: 'TRAIN', fromLabel: 'A', toLabel: 'B', plannedAmount: '10000', plannedCurrency: 'VND' }] })
        .expect(200);
      const legId = legsRes.body.data[0].id as string;
      expect(legsRes.body.data[0].provenance).toBe('USER_INPUT');

      await request(app.getHttpServer())
        .put(`/v1/trips/${tripId}/days/${day.id}/items`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ expectedVersion: 1, items: [{ type: 'TRANSPORT', transportLegId: legId }] })
        .expect(200);

      const blockedRes = await request(app.getHttpServer())
        .put(`/v1/trips/${tripId}/transport-legs`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ expectedVersion: 2, transportLegs: [] })
        .expect(400);
      expect(blockedRes.body.error.code).toBe('TRIP_TRANSPORT_LEG_IN_USE');
    });
  });

  describe('cost estimate generation (pure engine wired to real data)', () => {
    let activitySlug: string;

    beforeAll(async () => {
      const activity = await prisma.activity.findFirstOrThrow({ where: { status: 'PUBLISHED' } });
      activitySlug = activity.canonicalSlug;
    });

    it('generates LOW/TYPICAL/HIGH scenarios (LOW <= TYPICAL <= HIGH) from a USER_INPUT-priced activity item, and is idempotent on an unchanged recalculation', async () => {
      const createRes = await createTrip(ownerToken, { startDate: '2026-11-01', endDate: '2026-11-01' }).expect(201);
      const tripId = createRes.body.data.id as string;
      const day = await prisma.tripDay.findFirstOrThrow({ where: { tripId } });

      await request(app.getHttpServer())
        .put(`/v1/trips/${tripId}/days/${day.id}/items`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ expectedVersion: 0, items: [{ type: 'ACTIVITY', activitySlug, plannedAmount: '120000', plannedCurrency: 'VND' }] })
        .expect(200);

      const firstRes = await request(app.getHttpServer()).post(`/v1/trips/${tripId}/estimates`).set('Authorization', `Bearer ${ownerToken}`).expect(201);
      const scenarios = firstRes.body.data.estimates as any[];
      expect(scenarios.map((s: any) => s.scenario).sort()).toEqual(['HIGH', 'LOW', 'TYPICAL']);
      const byScenario = Object.fromEntries(scenarios.map((s: any) => [s.scenario, Number(s.totalAmount)]));
      expect(byScenario.LOW).toBeLessThanOrEqual(byScenario.TYPICAL);
      expect(byScenario.TYPICAL).toBeLessThanOrEqual(byScenario.HIGH);
      // The one priced ACTIVITY item is USER_INPUT, identical across all three scenarios.
      expect(byScenario.LOW).toBe(120000);

      const secondRes = await request(app.getHttpServer()).post(`/v1/trips/${tripId}/estimates`).set('Authorization', `Bearer ${ownerToken}`).expect(201);
      expect(secondRes.body.data.id).toBe(firstRes.body.data.id);

      const latestRes = await request(app.getHttpServer()).get(`/v1/trips/${tripId}/estimates/latest`).set('Authorization', `Bearer ${ownerToken}`).expect(200);
      expect(latestRes.body.data.id).toBe(firstRes.body.data.id);

      const listRes = await request(app.getHttpServer()).get(`/v1/trips/${tripId}/estimates`).set('Authorization', `Bearer ${ownerToken}`).expect(200);
      expect(listRes.body.data.items.map((g: any) => g.id)).toContain(firstRes.body.data.id);
    });

    it('never coerces an itinerary with no priced/assumption-backed evidence to zero - reports UNKNOWN/PARTIAL instead', async () => {
      const createRes = await createTrip(ownerToken, { startDate: '2026-11-01', endDate: '2026-11-01' }).expect(201);
      const tripId = createRes.body.data.id as string;

      const res = await request(app.getHttpServer()).post(`/v1/trips/${tripId}/estimates`).set('Authorization', `Bearer ${ownerToken}`).expect(201);
      const typical = res.body.data.estimates.find((s: any) => s.scenario === 'TYPICAL');
      expect(typical.completeness).toBe('PARTIAL');
      expect(typical.unknownCount).toBeGreaterThan(0);
    });

    it('a forced failure partway through generation rolls back the entire attempt, including the transactional audit row - no partial LOW/TYPICAL/HIGH set, and no orphaned audit entry, ever persists (real PostgreSQL rollback proof, same transactional shape as TripCostEstimatesService.persistGeneration - recovery spec gates 287/288)', async () => {
      const createRes = await createTrip(ownerToken, { startDate: '2026-11-01', endDate: '2026-11-01' }).expect(201);
      const tripId = createRes.body.data.id as string;

      const generationCountBefore = await prisma.tripCostEstimateGeneration.count({ where: { tripId } });
      const auditAction = 'trip.estimate.generated.rollback-probe';

      await expect(
        prisma.$transaction(async (tx) => {
          // Mirrors the real service's exact order: create the generation,
          // then the first (LOW) scenario, then the audit row (exactly like
          // `persistGeneration`'s own `await this.audit.log({...}, tx)` call),
          // then fail before TYPICAL/HIGH or the transaction commit ever
          // happen.
          const generation = await tx.tripCostEstimateGeneration.create({ data: { tripId, tripVersion: 0, inputHash: 'g06-qa-rollback-probe', engineVersion: 'g06-v1' } });
          await tx.tripCostEstimate.create({
            data: { generationId: generation.id, scenario: 'LOW', currency: 'VND', totalAmount: '0', completeness: 'COMPLETE', confidence: 'LOW', unknownCount: 0 },
          });
          await tx.auditLog.create({ data: { action: auditAction, entityType: 'TRIP', entityId: tripId } });
          throw new Error('G06_QA_FORCED_ROLLBACK_PROBE');
        }),
      ).rejects.toThrow('G06_QA_FORCED_ROLLBACK_PROBE');

      // Even the generation row itself - the very first write in the
      // transaction - does not survive. This proves atomicity of the whole
      // attempt, not just protection against a partial 3-scenario set.
      const generationCountAfter = await prisma.tripCostEstimateGeneration.count({ where: { tripId } });
      expect(generationCountAfter).toBe(generationCountBefore);
      const orphanedEstimate = await prisma.tripCostEstimate.findFirst({ where: { generation: { tripId }, scenario: 'LOW' } });
      expect(orphanedEstimate).toBeNull();
      // The audit row written inside the same failed transaction does not
      // survive either - `AuditService.log`'s own `tx` parameter (added after
      // a real Phase-12.1 orphaned-audit-row defect) means an audit write is
      // never exempt from the transaction that produced it.
      const orphanedAudit = await prisma.auditLog.findFirst({ where: { action: auditAction, entityId: tripId } });
      expect(orphanedAudit).toBeNull();
    });

    it('two concurrent identical-input generation requests cannot corrupt estimate history (recovery spec gate 285, real PostgreSQL, real HTTP concurrency)', async () => {
      const createRes = await createTrip(ownerToken, { startDate: '2026-11-01', endDate: '2026-11-01' }).expect(201);
      const tripId = createRes.body.data.id as string;

      // Fired via Promise.all (both requests genuinely in flight before either
      // resolves), not sequentially - this is what actually exercises the
      // `findUnique`-then-`create` idempotency check's race window, not just
      // its happy path (already covered by the earlier "is idempotent" test).
      const [resA, resB] = await Promise.all([
        request(app.getHttpServer()).post(`/v1/trips/${tripId}/estimates`).set('Authorization', `Bearer ${ownerToken}`),
        request(app.getHttpServer()).post(`/v1/trips/${tripId}/estimates`).set('Authorization', `Bearer ${ownerToken}`),
      ]);

      // Either both raced into the same successful generation (harmless -
      // Prisma serializes the two `findUnique`+`create` sequences enough that
      // one simply sees the other's committed row first), or the DB's own
      // `@@unique([tripId, inputHash, engineVersion])` constraint caught a
      // genuine double-insert attempt and the global Prisma exception filter
      // mapped it to a clean 409 CONFLICT - never a raw 500, and never two
      // generation rows. Both outcomes are correct; only these two are.
      for (const res of [resA, resB]) {
        expect([201, 409]).toContain(res.status);
      }

      const generations = await prisma.tripCostEstimateGeneration.findMany({ where: { tripId } });
      expect(generations).toHaveLength(1);
    });

    it('is blocked once the trip is archived (TRIP_ARCHIVED), matching every other itinerary mutation', async () => {
      const createRes = await createTrip(ownerToken, { startDate: '2026-11-01', endDate: '2026-11-01' }).expect(201);
      const tripId = createRes.body.data.id as string;
      await request(app.getHttpServer()).post(`/v1/trips/${tripId}/archive`).set('Authorization', `Bearer ${ownerToken}`).send({ expectedVersion: 0 }).expect(201);

      const res = await request(app.getHttpServer()).post(`/v1/trips/${tripId}/estimates`).set('Authorization', `Bearer ${ownerToken}`).expect(409);
      expect(res.body.error.code).toBe('TRIP_ARCHIVED');
    });

    it('is owner-only (403 for a non-owner)', async () => {
      const createRes = await createTrip(ownerToken, { startDate: '2026-11-01', endDate: '2026-11-01' }).expect(201);
      const tripId = createRes.body.data.id as string;
      await request(app.getHttpServer()).post(`/v1/trips/${tripId}/estimates`).set('Authorization', `Bearer ${otherToken}`).expect(403);
    });
  });
});
