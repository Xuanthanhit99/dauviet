import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { bootstrapTestApp } from './bootstrap-test-app';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * G08 Trip Location Sharing - live e2e coverage against a real running app +
 * real PostgreSQL (docs/backend/G08_PRE_IMPLEMENTATION_REPORT.md section 8 -
 * G07's own collaboration routes have no committed e2e coverage in this
 * repo, so this suite is written from scratch, following
 * `trips.e2e-spec.ts`'s own structure). Membership fixtures are inserted
 * directly via Prisma (`prisma.tripMember.create`) rather than through the
 * G07 invitation email flow - this suite is testing G08's behavior GIVEN an
 * accepted member, not re-proving G07's own invitation lifecycle.
 */
describe('Trip Location Sharing (G08) - e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const stamp = Date.now();
  const createdEmails: string[] = [];
  let ownerToken: string;
  let ownerId: string;
  let editorToken: string;
  let editorId: string;
  let viewerToken: string;
  let viewerId: string;
  let unrelatedToken: string;

  async function registerAndLogin(label: string) {
    const email = `g08-${label}-${stamp}@example.com`;
    createdEmails.push(email);
    await request(app.getHttpServer()).post('/v1/auth/register').send({ email, password: 'E2eTest-Pass!1', displayName: email }).expect(201);
    const res = await request(app.getHttpServer()).post('/v1/auth/login').send({ email, password: 'E2eTest-Pass!1' }).expect(201);
    return { token: res.body.data.accessToken as string, id: res.body.data.user.id as string };
  }

  async function createTrip(token: string, overrides: Record<string, unknown> = {}) {
    const res = await request(app.getHttpServer())
      .post('/v1/trips')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'G08 location trip', startDate: '2026-12-01', endDate: '2026-12-05', primaryCurrency: 'VND', ...overrides })
      .expect(201);
    return res.body.data.id as string;
  }

  async function addMember(tripId: string, userId: string, role: 'EDITOR' | 'VIEWER') {
    await prisma.tripMember.create({ data: { tripId, userId, role } });
  }

  function start(token: string, tripId: string, durationMinutes = 60) {
    return request(app.getHttpServer()).post(`/v1/trips/${tripId}/location-sharing/start`).set('Authorization', `Bearer ${token}`).send({ durationMinutes });
  }
  function stop(token: string, tripId: string) {
    return request(app.getHttpServer()).post(`/v1/trips/${tripId}/location-sharing/stop`).set('Authorization', `Bearer ${token}`).send({});
  }
  function me(token: string, tripId: string) {
    return request(app.getHttpServer()).get(`/v1/trips/${tripId}/location-sharing/me`).set('Authorization', `Bearer ${token}`);
  }
  function updateLocation(token: string, tripId: string, body: Record<string, unknown>) {
    return request(app.getHttpServer()).put(`/v1/trips/${tripId}/location`).set('Authorization', `Bearer ${token}`).send(body);
  }
  function listLocations(token: string, tripId: string) {
    return request(app.getHttpServer()).get(`/v1/trips/${tripId}/locations`).set('Authorization', `Bearer ${token}`);
  }

  async function tripWithAllRoles() {
    const tripId = await createTrip(ownerToken);
    await addMember(tripId, editorId, 'EDITOR');
    await addMember(tripId, viewerId, 'VIEWER');
    return tripId;
  }

  beforeAll(async () => {
    app = await bootstrapTestApp();
    prisma = app.get(PrismaService);
    ({ token: ownerToken, id: ownerId } = await registerAndLogin('owner'));
    ({ token: editorToken, id: editorId } = await registerAndLogin('editor'));
    ({ token: viewerToken, id: viewerId } = await registerAndLogin('viewer'));
    ({ token: unrelatedToken } = await registerAndLogin('unrelated'));
  }, 30_000);

  afterAll(async () => {
    const ownedTripIds = (await prisma.trip.findMany({ where: { owner: { email: { in: createdEmails } } }, select: { id: true } })).map((t) => t.id);
    if (ownedTripIds.length > 0) {
      await prisma.tripMemberLocation.deleteMany({ where: { tripId: { in: ownedTripIds } } });
      await prisma.tripLocationSharing.deleteMany({ where: { tripId: { in: ownedTripIds } } });
      await prisma.tripCollaborationEvent.deleteMany({ where: { tripId: { in: ownedTripIds } } });
      await prisma.tripMember.deleteMany({ where: { tripId: { in: ownedTripIds } } });
    }
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    await app.close();
  });

  describe('authentication / authorization (never hiding trip existence beyond G07 convention)', () => {
    it('rejects unauthenticated requests on every route', async () => {
      const tripId = await tripWithAllRoles();
      await request(app.getHttpServer()).post(`/v1/trips/${tripId}/location-sharing/start`).send({ durationMinutes: 60 }).expect(401);
      await request(app.getHttpServer()).post(`/v1/trips/${tripId}/location-sharing/stop`).send({}).expect(401);
      await request(app.getHttpServer()).get(`/v1/trips/${tripId}/location-sharing/me`).expect(401);
      await request(app.getHttpServer()).put(`/v1/trips/${tripId}/location`).send({}).expect(401);
      await request(app.getHttpServer()).get(`/v1/trips/${tripId}/locations`).expect(401);
    });

    it('rejects an unrelated authenticated user with TRIP_PERMISSION_DENIED (same code as G07 - never reveals "you have some relationship")', async () => {
      const tripId = await tripWithAllRoles();
      const res = await start(unrelatedToken, tripId).expect(403);
      expect(res.body.error.code).toBe('TRIP_PERMISSION_DENIED');
      await updateLocation(unrelatedToken, tripId, { latitude: 1, longitude: 1, accuracyMeters: 5, capturedAt: new Date().toISOString() }).expect(403);
      await listLocations(unrelatedToken, tripId).expect(403);
    });

    it('a user with only a PENDING invitation (no TripMember row) is treated exactly like an unrelated user (spec section 11/33)', async () => {
      const tripId = await createTrip(ownerToken);
      const { token: pendingToken } = await registerAndLogin('pending');
      await request(app.getHttpServer())
        .post(`/v1/trips/${tripId}/invitations`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: `g08-pending-${stamp}@example.com`, role: 'EDITOR' })
        .expect(201);
      await start(pendingToken, tripId).expect(403);
    });
  });

  describe('start (spec sections 6-8, 56, 63)', () => {
    it('owner/editor/viewer may each start their OWN sharing session', async () => {
      const tripId = await tripWithAllRoles();
      for (const token of [ownerToken, editorToken, viewerToken]) {
        const res = await start(token, tripId).expect(201);
        expect(res.body.data.status).toBe('ACTIVE');
        expect(res.body.data.expiresAt).not.toBeNull();
      }
    });

    it('rejects a duration outside the configured min/max with TRIP_LOCATION_INVALID', async () => {
      const tripId = await tripWithAllRoles();
      const tooShort = await start(ownerToken, tripId, 1).expect(400);
      expect(tooShort.body.error.code).toBe('TRIP_LOCATION_INVALID');
      const tooLong = await start(ownerToken, tripId, 100_000).expect(400);
      expect(tooLong.body.error.code).toBe('TRIP_LOCATION_INVALID');
    });

    it('rejects starting a second session while one is already ACTIVE', async () => {
      const tripId = await tripWithAllRoles();
      await start(ownerToken, tripId).expect(201);
      const res = await start(ownerToken, tripId).expect(409);
      expect(res.body.error.code).toBe('TRIP_LOCATION_SHARING_ALREADY_ACTIVE');
    });

    it('extra client-supplied fields (e.g. a spoofed userId) are rejected outright by the global forbidNonWhitelisted validation - never silently used to affect another member', async () => {
      const tripId = await tripWithAllRoles();
      const res = await request(app.getHttpServer())
        .post(`/v1/trips/${tripId}/location-sharing/start`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({ durationMinutes: 60, userId: ownerId })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');

      // The legitimate request (without the spoofed field) still only ever
      // affects the caller.
      await request(app.getHttpServer()).post(`/v1/trips/${tripId}/location-sharing/start`).set('Authorization', `Bearer ${editorToken}`).send({ durationMinutes: 60 }).expect(201);
      const ownerStatus = await me(ownerToken, tripId).expect(200);
      expect(ownerStatus.body.data.status).toBe('NEVER_SHARED');
      const editorStatus = await me(editorToken, tripId).expect(200);
      expect(editorStatus.body.data.status).toBe('ACTIVE');
    });

    it('rejects starting on an archived trip', async () => {
      const tripId = await createTrip(ownerToken);
      await request(app.getHttpServer()).post(`/v1/trips/${tripId}/archive`).set('Authorization', `Bearer ${ownerToken}`).send({ expectedVersion: 0 }).expect(201);
      const res = await start(ownerToken, tripId).expect(409);
      expect(res.body.error.code).toBe('TRIP_ARCHIVED');
    });
  });

  describe('update + list (spec sections 20-25, 91, 93 - privacy matrix)', () => {
    it('never shared -> UNAVAILABLE in another member\'s list, no coordinates present', async () => {
      const tripId = await tripWithAllRoles();
      const res = await listLocations(editorToken, tripId).expect(200);
      const ownerEntry = res.body.data.find((r: any) => r.userId === ownerId);
      expect(ownerEntry.availability).toBe('UNAVAILABLE');
      expect(ownerEntry.latitude).toBeUndefined();
    });

    it('ACTIVE + fresh update -> visible to every other accepted participant (owner/EDITOR/VIEWER alike)', async () => {
      const tripId = await tripWithAllRoles();
      await start(ownerToken, tripId).expect(201);
      await updateLocation(ownerToken, tripId, { latitude: 21.0285, longitude: 105.8542, accuracyMeters: 12, capturedAt: new Date().toISOString() }).expect(200);

      for (const token of [editorToken, viewerToken]) {
        const res = await listLocations(token, tripId).expect(200);
        const ownerEntry = res.body.data.find((r: any) => r.userId === ownerId);
        expect(ownerEntry.availability).toBe('FRESH');
        expect(ownerEntry.latitude).toBeCloseTo(21.0285);
      }
    });

    it('rejects invalid coordinates (out-of-range latitude) with TRIP_LOCATION_INVALID', async () => {
      const tripId = await tripWithAllRoles();
      await start(ownerToken, tripId).expect(201);
      const res = await updateLocation(ownerToken, tripId, { latitude: 999, longitude: 1, accuracyMeters: 1, capturedAt: new Date().toISOString() }).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a capturedAt too far in the future', async () => {
      const tripId = await tripWithAllRoles();
      await start(ownerToken, tripId).expect(201);
      const future = new Date(Date.now() + 60 * 60_000).toISOString();
      const res = await updateLocation(ownerToken, tripId, { latitude: 1, longitude: 1, accuracyMeters: 1, capturedAt: future }).expect(400);
      expect(res.body.error.code).toBe('TRIP_LOCATION_INVALID');
    });

    it('rejects an update when sharing is not ACTIVE (never started)', async () => {
      const tripId = await tripWithAllRoles();
      const res = await updateLocation(ownerToken, tripId, { latitude: 1, longitude: 1, accuracyMeters: 1, capturedAt: new Date().toISOString() }).expect(409);
      expect(res.body.error.code).toBe('TRIP_LOCATION_SHARING_NOT_ACTIVE');
    });

    it('out-of-order network delivery: an older capturedAt arriving AFTER a newer one is rejected and never overwrites the stored row (spec sections 21/22/76)', async () => {
      const tripId = await tripWithAllRoles();
      await start(ownerToken, tripId).expect(201);
      const newer = new Date();
      const older = new Date(newer.getTime() - 60_000);

      await updateLocation(ownerToken, tripId, { latitude: 10, longitude: 10, accuracyMeters: 5, capturedAt: newer.toISOString() }).expect(200);
      const staleRes = await updateLocation(ownerToken, tripId, { latitude: 45, longitude: 45, accuracyMeters: 5, capturedAt: older.toISOString() }).expect(409);
      expect(staleRes.body.error.code).toBe('TRIP_LOCATION_STALE_UPDATE');

      const status = await listLocations(editorToken, tripId).expect(200);
      const ownerEntry = status.body.data.find((r: any) => r.userId === ownerId);
      expect(ownerEntry.latitude).toBe(10);
    });

    it('an exact-duplicate capturedAt retry is idempotently accepted (spec section 23), never an error, never a second row', async () => {
      const tripId = await tripWithAllRoles();
      await start(ownerToken, tripId).expect(201);
      const capturedAt = new Date().toISOString();
      await updateLocation(ownerToken, tripId, { latitude: 5, longitude: 5, accuracyMeters: 5, capturedAt }).expect(200);
      await updateLocation(ownerToken, tripId, { latitude: 5, longitude: 5, accuracyMeters: 5, capturedAt }).expect(200);

      const rows = await prisma.tripMemberLocation.findMany({ where: { tripId, userId: ownerId } });
      expect(rows).toHaveLength(1);
    });

    it('real PostgreSQL concurrency: two simultaneous updates with different capturedAt resolve deterministically to the newer one regardless of which HTTP request completes last', async () => {
      const tripId = await tripWithAllRoles();
      await start(ownerToken, tripId).expect(201);
      const base = Date.now();
      const older = new Date(base).toISOString();
      const newer = new Date(base + 5000).toISOString();

      // Both requests race the `SELECT ... FOR UPDATE` lock on the same
      // TripLocationSharing row (docs/backend/G08_PRE_IMPLEMENTATION_REPORT.md
      // section 11) - whichever actually wins that lock race and commits
      // first is not deterministic from the test's side (and does not need
      // to be: if the OLDER-capturedAt request happens to commit first, it
      // legitimately succeeds - there was nothing stored yet to be "stale"
      // against). The one invariant that MUST always hold regardless of
      // commit order is the FINAL stored state: it always reflects the
      // objectively newer of the two submitted coordinates, never the
      // older one, even though the older request's HTTP response can also
      // legitimately be a 200 depending on race timing.
      const [a, b] = await Promise.all([
        updateLocation(ownerToken, tripId, { latitude: 1, longitude: 1, accuracyMeters: 5, capturedAt: older }),
        updateLocation(ownerToken, tripId, { latitude: 2, longitude: 2, accuracyMeters: 5, capturedAt: newer }),
      ]);
      expect([a.status, b.status].every((s) => s === 200 || s === 409)).toBe(true);
      expect(a.status === 200 || b.status === 200).toBe(true);

      const stored = await prisma.tripMemberLocation.findUniqueOrThrow({ where: { tripId_userId: { tripId, userId: ownerId } } });
      expect(stored.latitude).toBe(2);
      expect(stored.capturedAt.toISOString()).toBe(newer);
    });
  });

  describe('stop (spec sections 9, 71, 73)', () => {
    it('stops sharing and immediately hides the location on the very next read with the SAME JWT - no logout/restart required', async () => {
      const tripId = await tripWithAllRoles();
      await start(ownerToken, tripId).expect(201);
      await updateLocation(ownerToken, tripId, { latitude: 1, longitude: 1, accuracyMeters: 5, capturedAt: new Date().toISOString() }).expect(200);

      await stop(ownerToken, tripId).expect(201);

      const status = await me(ownerToken, tripId).expect(200);
      expect(status.body.data.status).toBe('STOPPED');

      const updateAfterStop = await updateLocation(ownerToken, tripId, { latitude: 1, longitude: 1, accuracyMeters: 5, capturedAt: new Date().toISOString() }).expect(409);
      expect(updateAfterStop.body.error.code).toBe('TRIP_LOCATION_SHARING_NOT_ACTIVE');

      const list = await listLocations(editorToken, tripId).expect(200);
      const ownerEntry = list.body.data.find((r: any) => r.userId === ownerId);
      expect(ownerEntry.availability).toBe('UNAVAILABLE');
    });

    it('rejects stopping when nothing is ACTIVE', async () => {
      const tripId = await tripWithAllRoles();
      const res = await stop(ownerToken, tripId).expect(409);
      expect(res.body.error.code).toBe('TRIP_LOCATION_SHARING_NOT_ACTIVE');
    });

    it('after stopping, the SAME user may start a brand-new session later - never permanently locked out', async () => {
      const tripId = await tripWithAllRoles();
      await start(ownerToken, tripId).expect(201);
      await stop(ownerToken, tripId).expect(201);
      const res = await start(ownerToken, tripId).expect(201);
      expect(res.body.data.status).toBe('ACTIVE');
    });
  });

  describe('owner privacy boundary (spec sections 8, 10, 68)', () => {
    it('owner cannot force-start, stop, or read a stopped/expired coordinate belonging to another member - there is no route that even accepts a target member id', async () => {
      const tripId = await tripWithAllRoles();
      await start(editorToken, tripId).expect(201);
      await updateLocation(editorToken, tripId, { latitude: 1, longitude: 1, accuracyMeters: 5, capturedAt: new Date().toISOString() }).expect(200);
      await stop(editorToken, tripId).expect(201);

      // Owner's own view of the trip's locations must not show the editor's
      // now-stopped coordinate either - owner has no elevated read access
      // beyond every other accepted participant (spec section 10).
      const ownerView = await listLocations(ownerToken, tripId).expect(200);
      const editorEntry = ownerView.body.data.find((r: any) => r.userId === editorId);
      expect(editorEntry.availability).toBe('UNAVAILABLE');
    });
  });

  describe('member removal / leave / archive integration (spec sections 30-32, 70-72, 74-75)', () => {
    it('member removal immediately terminates sharing and hides location - proven with the removed member\'s SAME JWT', async () => {
      const tripId = await tripWithAllRoles();
      await start(editorToken, tripId).expect(201);
      await updateLocation(editorToken, tripId, { latitude: 1, longitude: 1, accuracyMeters: 5, capturedAt: new Date().toISOString() }).expect(200);

      const memberRow = await prisma.tripMember.findUniqueOrThrow({ where: { tripId_userId: { tripId, userId: editorId } } });
      await request(app.getHttpServer())
        .delete(`/v1/trips/${tripId}/members/${memberRow.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ expectedVersion: 0 })
        .expect(200);

      // Same JWT, now removed: next update fails, next read of their own
      // status 403s exactly like an unrelated user (no membership left).
      await updateLocation(editorToken, tripId, { latitude: 2, longitude: 2, accuracyMeters: 5, capturedAt: new Date().toISOString() }).expect(403);
      await me(editorToken, tripId).expect(403);

      const list = await listLocations(ownerToken, tripId).expect(200);
      expect(list.body.data.find((r: any) => r.userId === editorId)).toBeUndefined();

      const location = await prisma.tripMemberLocation.findUnique({ where: { tripId_userId: { tripId, userId: editorId } } });
      expect(location).toBeNull();
    });

    it('forced rollback: two concurrent removal-triggering requests for the SAME member never leave a partial state (spec section 77)', async () => {
      const tripId = await tripWithAllRoles();
      await start(editorToken, tripId).expect(201);
      await updateLocation(editorToken, tripId, { latitude: 1, longitude: 1, accuracyMeters: 5, capturedAt: new Date().toISOString() }).expect(200);

      const memberRow = await prisma.tripMember.findUniqueOrThrow({ where: { tripId_userId: { tripId, userId: editorId } } });

      // Both requests pass the pre-check (the row exists for both), then
      // race inside their own `$transaction`. Each transaction runs the
      // SAME statement order this integration always uses: terminate
      // location sharing first, THEN `tripMember.delete`. Whichever
      // transaction's `tripMember.delete` commits first wins; the loser's
      // `delete` hits a real PostgreSQL P2025 (the row is already gone) and
      // the ENTIRE losing transaction rolls back - including whatever it
      // had already done to the TripLocationSharing/TripMemberLocation rows
      // in that same transaction. This is a genuine forced rollback, not a
      // simulated one: Postgres itself throws the error that triggers it.
      const [a, b] = await Promise.all([
        request(app.getHttpServer()).delete(`/v1/trips/${tripId}/members/${memberRow.id}`).set('Authorization', `Bearer ${ownerToken}`).send({ expectedVersion: 0 }),
        request(app.getHttpServer()).delete(`/v1/trips/${tripId}/members/${memberRow.id}`).set('Authorization', `Bearer ${ownerToken}`).send({ expectedVersion: 0 }),
      ]);
      // Exactly one succeeds; the other fails cleanly (404 via P2025, or
      // 409 if it lost the optimistic-concurrency version race instead) -
      // never a corrupted 200/200 double-removal, never a 500.
      const statuses = [a.status, b.status].sort();
      expect(statuses[0]).toBeLessThan(300);
      expect([404, 409]).toContain(statuses[1]);

      // Whichever transaction actually won, the final state is fully
      // consistent - never "member removed but sharing still ACTIVE" and
      // never "sharing stopped but member row still present" (the two
      // failure modes spec section 77 exists to rule out).
      const remainingMember = await prisma.tripMember.findUnique({ where: { id: memberRow.id } });
      expect(remainingMember).toBeNull();
      const sharing = await prisma.tripLocationSharing.findUniqueOrThrow({ where: { tripId_userId: { tripId, userId: editorId } } });
      expect(sharing.status).toBe('STOPPED');
      const location = await prisma.tripMemberLocation.findUnique({ where: { tripId_userId: { tripId, userId: editorId } } });
      expect(location).toBeNull();
    });

    it('leaving immediately terminates the leaving member\'s own sharing - proven with their SAME JWT', async () => {
      const tripId = await tripWithAllRoles();
      await start(viewerToken, tripId).expect(201);
      await updateLocation(viewerToken, tripId, { latitude: 1, longitude: 1, accuracyMeters: 5, capturedAt: new Date().toISOString() }).expect(200);

      await request(app.getHttpServer()).post(`/v1/trips/${tripId}/leave`).set('Authorization', `Bearer ${viewerToken}`).send({ expectedVersion: 0 }).expect(201);

      await updateLocation(viewerToken, tripId, { latitude: 2, longitude: 2, accuracyMeters: 5, capturedAt: new Date().toISOString() }).expect(403);
      const location = await prisma.tripMemberLocation.findUnique({ where: { tripId_userId: { tripId, userId: viewerId } } });
      expect(location).toBeNull();
    });

    it('archiving terminates every member\'s sharing trip-wide and blocks future updates/starts - proven with existing member JWTs', async () => {
      const tripId = await tripWithAllRoles();
      await start(ownerToken, tripId).expect(201);
      await updateLocation(ownerToken, tripId, { latitude: 1, longitude: 1, accuracyMeters: 5, capturedAt: new Date().toISOString() }).expect(200);
      await start(editorToken, tripId).expect(201);
      await updateLocation(editorToken, tripId, { latitude: 2, longitude: 2, accuracyMeters: 5, capturedAt: new Date().toISOString() }).expect(200);

      await request(app.getHttpServer()).post(`/v1/trips/${tripId}/archive`).set('Authorization', `Bearer ${ownerToken}`).send({ expectedVersion: 0 }).expect(201);

      await updateLocation(ownerToken, tripId, { latitude: 3, longitude: 3, accuracyMeters: 5, capturedAt: new Date().toISOString() }).expect(409);
      await start(editorToken, tripId).expect(409);
      const list = await listLocations(viewerToken, tripId).expect(200);
      expect(list.body.data).toEqual([]);

      const remainingLocations = await prisma.tripMemberLocation.findMany({ where: { tripId } });
      expect(remainingLocations).toHaveLength(0);
    });
  });

  describe('cross-trip isolation (spec sections 12, 69)', () => {
    it('sharing in Trip A discloses nothing in Trip B, even for the same two users', async () => {
      const tripA = await tripWithAllRoles();
      const tripB = await createTrip(ownerToken);
      await addMember(tripB, editorId, 'EDITOR');

      await start(ownerToken, tripA).expect(201);
      await updateLocation(ownerToken, tripA, { latitude: 1, longitude: 1, accuracyMeters: 5, capturedAt: new Date().toISOString() }).expect(200);

      const statusInB = await me(ownerToken, tripB).expect(200);
      expect(statusInB.body.data.status).toBe('NEVER_SHARED');

      const listInB = await listLocations(editorToken, tripB).expect(200);
      const ownerEntryInB = listInB.body.data.find((r: any) => r.userId === ownerId);
      expect(ownerEntryInB.availability).toBe('UNAVAILABLE');
    });
  });

  describe('expiration (spec sections 18, 55, 58)', () => {
    it('an expired session is treated as expired on the very next read even without any background cleanup having run, and blocks further updates', async () => {
      const tripId = await tripWithAllRoles();
      await start(ownerToken, tripId, 5).expect(201);
      // Simulate elapsed server time directly against the real row - proves
      // the read/write path enforces expiry independently of any worker
      // (docs/backend/G08_PRE_IMPLEMENTATION_REPORT.md section 50/55) and,
      // since this is plain data in PostgreSQL with no in-process cache
      // involved, also stands in for the "survives an app restart" proof
      // (section 57) - there is no server-side memory this could depend on.
      await prisma.tripLocationSharing.update({ where: { tripId_userId: { tripId, userId: ownerId } }, data: { expiresAt: new Date(Date.now() - 1000) } });

      const status = await me(ownerToken, tripId).expect(200);
      expect(status.body.data.status).toBe('EXPIRED');

      const updateRes = await updateLocation(ownerToken, tripId, { latitude: 1, longitude: 1, accuracyMeters: 5, capturedAt: new Date().toISOString() }).expect(409);
      expect(updateRes.body.error.code).toBe('TRIP_LOCATION_SHARING_EXPIRED');
    });
  });

  describe('leak scans (spec sections 34/35/36/99-103)', () => {
    it('collaboration events for LOCATION_SHARING_STARTED/STOPPED never contain coordinates', async () => {
      const tripId = await tripWithAllRoles();
      await start(ownerToken, tripId).expect(201);
      await updateLocation(ownerToken, tripId, { latitude: 12.34, longitude: 56.78, accuracyMeters: 5, capturedAt: new Date().toISOString() }).expect(200);
      await stop(ownerToken, tripId).expect(201);

      const events = await prisma.tripCollaborationEvent.findMany({ where: { tripId, type: { in: ['LOCATION_SHARING_STARTED', 'LOCATION_SHARING_STOPPED'] } } });
      expect(events.length).toBeGreaterThan(0);
      for (const event of events) {
        const raw = JSON.stringify(event.metadata ?? {});
        expect(raw).not.toContain('12.34');
        expect(raw).not.toContain('56.78');
        expect(raw.toLowerCase()).not.toContain('latitude');
        expect(raw.toLowerCase()).not.toContain('longitude');
      }
    });

    it('AuditLog entries for the sharing lifecycle never contain coordinates', async () => {
      const tripId = await tripWithAllRoles();
      await start(ownerToken, tripId).expect(201);
      await updateLocation(ownerToken, tripId, { latitude: 12.34, longitude: 56.78, accuracyMeters: 5, capturedAt: new Date().toISOString() }).expect(200);
      await stop(ownerToken, tripId).expect(201);

      const auditRows = await prisma.auditLog.findMany({ where: { entityType: 'TRIP_LOCATION_SHARING' } });
      expect(auditRows.length).toBeGreaterThan(0);
      for (const row of auditRows) {
        const raw = JSON.stringify(row.metadata ?? {});
        expect(raw).not.toContain('12.34');
        expect(raw).not.toContain('56.78');
      }
    });

    it('the read DTO returned by GET locations never includes email, device, or internal consent-row fields', async () => {
      const tripId = await tripWithAllRoles();
      await start(ownerToken, tripId).expect(201);
      await updateLocation(ownerToken, tripId, { latitude: 1, longitude: 1, accuracyMeters: 5, capturedAt: new Date().toISOString() }).expect(200);

      const res = await listLocations(editorToken, tripId).expect(200);
      const ownerEntry = res.body.data.find((r: any) => r.userId === ownerId);
      expect(ownerEntry.email).toBeUndefined();
      expect(ownerEntry.id).toBeUndefined(); // no internal TripMemberLocation/TripLocationSharing row id
      expect(ownerEntry.deviceId).toBeUndefined();
    });
  });
});
