import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { bootstrapTestApp } from './bootstrap-test-app';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * G09 Trip Expense & Settlement - live e2e coverage against a real running
 * app + real PostgreSQL (docs/backend/G09_PRE_IMPLEMENTATION_REPORT.md).
 * Membership fixtures are inserted directly via Prisma
 * (`prisma.tripMember.create`), same convention `trip-location.e2e-spec.ts`
 * already established - this suite tests G09's behavior GIVEN accepted
 * members, not G07's own invitation lifecycle.
 */
describe('Trip Expense & Settlement (G09) - e2e', () => {
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
  let unrelatedId: string;

  async function registerAndLogin(label: string) {
    const email = `g09-${label}-${stamp}@example.com`;
    createdEmails.push(email);
    await request(app.getHttpServer()).post('/v1/auth/register').send({ email, password: 'E2eTest-Pass!1', displayName: email }).expect(201);
    const res = await request(app.getHttpServer()).post('/v1/auth/login').send({ email, password: 'E2eTest-Pass!1' }).expect(201);
    return { token: res.body.data.accessToken as string, id: res.body.data.user.id as string };
  }

  async function createTrip(token: string, overrides: Record<string, unknown> = {}) {
    const res = await request(app.getHttpServer())
      .post('/v1/trips')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'G09 expense trip', startDate: '2026-12-01', endDate: '2026-12-05', primaryCurrency: 'VND', ...overrides })
      .expect(201);
    return res.body.data.id as string;
  }

  async function addMember(tripId: string, userId: string, role: 'EDITOR' | 'VIEWER') {
    await prisma.tripMember.create({ data: { tripId, userId, role } });
  }

  async function tripWithAllRoles() {
    const tripId = await createTrip(ownerToken);
    await addMember(tripId, editorId, 'EDITOR');
    await addMember(tripId, viewerId, 'VIEWER');
    return tripId;
  }

  function createExpense(token: string, tripId: string, body: Record<string, unknown>) {
    return request(app.getHttpServer()).post(`/v1/trips/${tripId}/expenses`).set('Authorization', `Bearer ${token}`).send(body);
  }
  function updateExpense(token: string, tripId: string, expenseId: string, body: Record<string, unknown>) {
    return request(app.getHttpServer()).patch(`/v1/trips/${tripId}/expenses/${expenseId}`).set('Authorization', `Bearer ${token}`).send(body);
  }
  function deleteExpense(token: string, tripId: string, expenseId: string, expectedVersion: number) {
    return request(app.getHttpServer()).delete(`/v1/trips/${tripId}/expenses/${expenseId}`).set('Authorization', `Bearer ${token}`).send({ expectedVersion });
  }
  function listExpenses(token: string, tripId: string) {
    return request(app.getHttpServer()).get(`/v1/trips/${tripId}/expenses`).set('Authorization', `Bearer ${token}`);
  }
  function expenseDetail(token: string, tripId: string, expenseId: string) {
    return request(app.getHttpServer()).get(`/v1/trips/${tripId}/expenses/${expenseId}`).set('Authorization', `Bearer ${token}`);
  }
  function summary(token: string, tripId: string) {
    return request(app.getHttpServer()).get(`/v1/trips/${tripId}/expenses/summary`).set('Authorization', `Bearer ${token}`);
  }
  function suggestions(token: string, tripId: string) {
    return request(app.getHttpServer()).get(`/v1/trips/${tripId}/settlement-suggestions`).set('Authorization', `Bearer ${token}`);
  }
  function createSettlement(token: string, tripId: string, body: Record<string, unknown>) {
    return request(app.getHttpServer()).post(`/v1/trips/${tripId}/settlements`).set('Authorization', `Bearer ${token}`).send(body);
  }
  function listSettlements(token: string, tripId: string) {
    return request(app.getHttpServer()).get(`/v1/trips/${tripId}/settlements`).set('Authorization', `Bearer ${token}`);
  }

  function equalExpense(overrides: Record<string, unknown> = {}) {
    return {
      title: 'Dinner',
      category: 'FOOD',
      amount: '300.00',
      currency: 'USD',
      payerUserId: ownerId,
      splitMode: 'EQUAL',
      occurredOn: '2026-12-02',
      shares: [{ userId: ownerId }, { userId: editorId }, { userId: viewerId }],
      ...overrides,
    };
  }

  beforeAll(async () => {
    app = await bootstrapTestApp();
    prisma = app.get(PrismaService);
    ({ token: ownerToken, id: ownerId } = await registerAndLogin('owner'));
    ({ token: editorToken, id: editorId } = await registerAndLogin('editor'));
    ({ token: viewerToken, id: viewerId } = await registerAndLogin('viewer'));
    ({ token: unrelatedToken, id: unrelatedId } = await registerAndLogin('unrelated'));
  }, 30_000);

  afterAll(async () => {
    const ownedTripIds = (await prisma.trip.findMany({ where: { owner: { email: { in: createdEmails } } }, select: { id: true } })).map((t) => t.id);
    if (ownedTripIds.length > 0) {
      await prisma.tripExpenseShare.deleteMany({ where: { expense: { tripId: { in: ownedTripIds } } } });
      await prisma.tripExpense.deleteMany({ where: { tripId: { in: ownedTripIds } } });
      await prisma.tripSettlement.deleteMany({ where: { tripId: { in: ownedTripIds } } });
      await prisma.tripCollaborationEvent.deleteMany({ where: { tripId: { in: ownedTripIds } } });
      await prisma.tripMember.deleteMany({ where: { tripId: { in: ownedTripIds } } });
    }
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    await app.close();
  });

  describe('authentication / authorization matrix (spec section 28/88)', () => {
    it('rejects unauthenticated requests on every route', async () => {
      const tripId = await tripWithAllRoles();
      await request(app.getHttpServer()).get(`/v1/trips/${tripId}/expenses`).expect(401);
      await request(app.getHttpServer()).post(`/v1/trips/${tripId}/expenses`).send(equalExpense()).expect(401);
      await request(app.getHttpServer()).get(`/v1/trips/${tripId}/expenses/summary`).expect(401);
      await request(app.getHttpServer()).get(`/v1/trips/${tripId}/settlement-suggestions`).expect(401);
      await request(app.getHttpServer()).get(`/v1/trips/${tripId}/settlements`).expect(401);
    });

    it('rejects an unrelated authenticated user on every route with TRIP_PERMISSION_DENIED', async () => {
      const tripId = await tripWithAllRoles();
      expect((await listExpenses(unrelatedToken, tripId)).body.error.code).toBe('TRIP_PERMISSION_DENIED');
      expect((await createExpense(unrelatedToken, tripId, equalExpense())).body.error.code).toBe('TRIP_PERMISSION_DENIED');
      expect((await summary(unrelatedToken, tripId)).body.error.code).toBe('TRIP_PERMISSION_DENIED');
      expect((await suggestions(unrelatedToken, tripId)).body.error.code).toBe('TRIP_PERMISSION_DENIED');
    });

    it('a pending-invite-only user (no TripMember row) is treated exactly like an unrelated user', async () => {
      const tripId = await createTrip(ownerToken);
      const { token: pendingToken } = await registerAndLogin('pending');
      await request(app.getHttpServer())
        .post(`/v1/trips/${tripId}/invitations`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: `g09-pending-${stamp}@example.com`, role: 'EDITOR' })
        .expect(201);
      await request(app.getHttpServer()).get(`/v1/trips/${tripId}/expenses`).set('Authorization', `Bearer ${pendingToken}`).expect(403);
    });

    it('VIEWER may read (list/detail/summary/suggestions/settlements) but not mutate', async () => {
      const tripId = await tripWithAllRoles();
      const created = await createExpense(ownerToken, tripId, equalExpense()).expect(201);
      const expenseId = created.body.data.id;

      await listExpenses(viewerToken, tripId).expect(200);
      await expenseDetail(viewerToken, tripId, expenseId).expect(200);
      await summary(viewerToken, tripId).expect(200);
      await suggestions(viewerToken, tripId).expect(200);
      await listSettlements(viewerToken, tripId).expect(200);

      expect((await createExpense(viewerToken, tripId, equalExpense())).body.error.code).toBe('TRIP_PERMISSION_DENIED');
      expect((await updateExpense(viewerToken, tripId, expenseId, { ...equalExpense(), expectedVersion: 0 })).body.error.code).toBe('TRIP_PERMISSION_DENIED');
      expect((await deleteExpense(viewerToken, tripId, expenseId, 0)).body.error.code).toBe('TRIP_PERMISSION_DENIED');
      expect((await createSettlement(viewerToken, tripId, { fromUserId: ownerId, toUserId: editorId, amount: '1.00', currency: 'USD', settledAt: '2026-12-03' })).body.error.code).toBe(
        'TRIP_PERMISSION_DENIED',
      );
    });

    it('EDITOR may create/edit/delete expenses and record settlements, same as EDIT_TRIP everywhere else', async () => {
      const tripId = await tripWithAllRoles();
      const created = await createExpense(editorToken, tripId, equalExpense()).expect(201);
      await updateExpense(editorToken, tripId, created.body.data.id, { ...equalExpense(), title: 'Updated', expectedVersion: 0 }).expect(200);
      await deleteExpense(editorToken, tripId, created.body.data.id, 1).expect(200);
      await createSettlement(editorToken, tripId, { fromUserId: editorId, toUserId: ownerId, amount: '1.00', currency: 'USD', settledAt: '2026-12-03' }).expect(201);
    });
  });

  describe('create / split modes (spec sections 15-21)', () => {
    it('EQUAL split: payer included as a beneficiary - worked example from spec section 20 (A pays 900, A/B/C each 300)', async () => {
      const tripId = await tripWithAllRoles();
      await createExpense(ownerToken, tripId, equalExpense({ amount: '900.00', shares: [{ userId: ownerId }, { userId: editorId }, { userId: viewerId }] })).expect(201);

      const res = await summary(ownerToken, tripId).expect(200);
      const usd = res.body.data.balancesByCurrency.find((b: any) => b.currency === 'USD');
      const byUser = Object.fromEntries(usd.balances.map((b: any) => [b.userId, b.netAmount]));
      expect(byUser[ownerId]).toBe('600');
      expect(byUser[editorId]).toBe('-300');
      expect(byUser[viewerId]).toBe('-300');
    });

    it('payer may have zero share (spec section 21) - A pays for B/C only', async () => {
      const tripId = await tripWithAllRoles();
      await createExpense(ownerToken, tripId, equalExpense({ amount: '200.00', shares: [{ userId: editorId }, { userId: viewerId }] })).expect(201);
      const res = await summary(ownerToken, tripId).expect(200);
      const usd = res.body.data.balancesByCurrency.find((b: any) => b.currency === 'USD');
      const byUser = Object.fromEntries(usd.balances.map((b: any) => [b.userId, b.netAmount]));
      expect(byUser[ownerId]).toBe('200');
      expect(byUser[editorId]).toBe('-100');
      expect(byUser[viewerId]).toBe('-100');
    });

    it('EXACT split rejects a sum mismatch with TRIP_EXPENSE_SPLIT_INVALID, atomically (nothing persisted)', async () => {
      const tripId = await tripWithAllRoles();
      const res = await createExpense(ownerToken, tripId, equalExpense({ splitMode: 'EXACT', shares: [{ userId: ownerId, amount: '100.00' }, { userId: editorId, amount: '150.00' }] })).expect(
        400,
      );
      expect(res.body.error.code).toBe('TRIP_EXPENSE_SPLIT_INVALID');
      const list = await listExpenses(ownerToken, tripId).expect(200);
      expect(list.body.data.total).toBe(0);
    });

    it('PERCENTAGE split requires percentages to sum to exactly 100', async () => {
      const tripId = await tripWithAllRoles();
      const res = await createExpense(
        ownerToken,
        tripId,
        equalExpense({ splitMode: 'PERCENTAGE', shares: [{ userId: ownerId, percentage: '50' }, { userId: editorId, percentage: '40' }] }),
      ).expect(400);
      expect(res.body.error.code).toBe('TRIP_EXPENSE_SPLIT_INVALID');
    });

    it('PERCENTAGE split resolves 33.34/33.33/33.33 exactly, sum equals amount', async () => {
      const tripId = await tripWithAllRoles();
      const created = await createExpense(
        ownerToken,
        tripId,
        equalExpense({
          amount: '100.00',
          splitMode: 'PERCENTAGE',
          shares: [
            { userId: ownerId, percentage: '33.34' },
            { userId: editorId, percentage: '33.33' },
            { userId: viewerId, percentage: '33.33' },
          ],
        }),
      ).expect(201);
      const total = created.body.data.shares.reduce((acc: number, s: any) => acc + Number(s.amount), 0);
      expect(total).toBeCloseTo(100);
    });

    it('rejects a payer who is not a current trip participant (fail closed, spec section 24)', async () => {
      const tripId = await tripWithAllRoles();
      // Reuse the already-registered "unrelated" user (not a member of this
      // trip) rather than registering a fresh one - `/v1/auth/register` is
      // throttled to 5/60s per IP, and this suite already registers 5 users
      // in `beforeAll` (owner/editor/viewer/unrelated/pending, the last via
      // the "pending invitee" test below).
      const res = await createExpense(ownerToken, tripId, equalExpense({ payerUserId: unrelatedId })).expect(400);
      expect(res.body.error.code).toBe('TRIP_EXPENSE_PARTICIPANT_INVALID');
    });

    it('rejects a non-positive amount', async () => {
      const tripId = await tripWithAllRoles();
      const res = await createExpense(ownerToken, tripId, equalExpense({ amount: '0' })).expect(400);
      expect(res.body.error.code).toBe('TRIP_EXPENSE_INVALID');
    });

    it('currency is independent of Trip.primaryCurrency (trip is VND, expense is USD) - never assumed to match (spec section 11/13)', async () => {
      const tripId = await tripWithAllRoles(); // trip primaryCurrency = VND
      const created = await createExpense(ownerToken, tripId, equalExpense({ currency: 'USD' })).expect(201);
      expect(created.body.data.currency).toBe('USD');
    });
  });

  describe('edit / delete / optimistic concurrency (spec sections 31-35, 64)', () => {
    it('edit is a full replace; detail reflects the resolved shares', async () => {
      const tripId = await tripWithAllRoles();
      const created = await createExpense(ownerToken, tripId, equalExpense()).expect(201);
      const updated = await updateExpense(ownerToken, tripId, created.body.data.id, { ...equalExpense({ title: 'Lunch', amount: '150.00' }), expectedVersion: 0 }).expect(200);
      expect(updated.body.data.title).toBe('Lunch');
      expect(updated.body.data.version).toBe(1);
    });

    it('stale expectedVersion -> 409 TRIP_VERSION_CONFLICT', async () => {
      const tripId = await tripWithAllRoles();
      const created = await createExpense(ownerToken, tripId, equalExpense()).expect(201);
      const res = await updateExpense(ownerToken, tripId, created.body.data.id, { ...equalExpense(), expectedVersion: 99 }).expect(409);
      expect(res.body.error.code).toBe('TRIP_VERSION_CONFLICT');
    });

    it('soft delete: excluded from list, still readable by id, excluded from balance projection', async () => {
      const tripId = await tripWithAllRoles();
      const created = await createExpense(ownerToken, tripId, equalExpense()).expect(201);
      await deleteExpense(ownerToken, tripId, created.body.data.id, 0).expect(200);

      const list = await listExpenses(ownerToken, tripId).expect(200);
      expect(list.body.data.items.map((e: any) => e.id)).not.toContain(created.body.data.id);

      const detail = await expenseDetail(ownerToken, tripId, created.body.data.id).expect(200);
      expect(detail.body.data.deletedAt).not.toBeNull();

      const bal = await summary(ownerToken, tripId).expect(200);
      expect(bal.body.data.balancesByCurrency).toEqual([]);
    });

    it('real PostgreSQL edit/edit race: exactly one accepted, no lost update (spec section 34)', async () => {
      const tripId = await tripWithAllRoles();
      const created = await createExpense(ownerToken, tripId, equalExpense()).expect(201);
      const expenseId = created.body.data.id;

      const [a, b] = await Promise.all([
        updateExpense(ownerToken, tripId, expenseId, { ...equalExpense({ title: 'A wins?' }), expectedVersion: 0 }),
        updateExpense(ownerToken, tripId, expenseId, { ...equalExpense({ title: 'B wins?' }), expectedVersion: 0 }),
      ]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);

      const final = await prisma.tripExpense.findUniqueOrThrow({ where: { id: expenseId } });
      expect(final.version).toBe(1);
      expect(['A wins?', 'B wins?']).toContain(final.title);
    });

    it('real PostgreSQL edit/delete race: a deleted expense is never resurrected by a concurrent stale edit (spec section 35)', async () => {
      const tripId = await tripWithAllRoles();
      const created = await createExpense(ownerToken, tripId, equalExpense()).expect(201);
      const expenseId = created.body.data.id;

      const [editRes, deleteRes] = await Promise.all([
        updateExpense(ownerToken, tripId, expenseId, { ...equalExpense({ title: 'Should not resurrect' }), expectedVersion: 0 }),
        deleteExpense(ownerToken, tripId, expenseId, 0),
      ]);
      // Exactly one of the two wins; never both 200 (that would mean the
      // edit silently un-deleted the row, or the delete silently discarded
      // a committed edit without a version bump). If delete wins, edit's
      // own conditional updateMany then finds `deletedAt` already set and
      // correctly reports 404 (gone), not 409 (stale-but-editable) - a 409
      // would only be correct if edit lost to another EDIT, not a DELETE.
      expect(editRes.status === 200 || deleteRes.status === 200).toBe(true);
      expect(editRes.status === 200 && deleteRes.status === 200).toBe(false);
      if (deleteRes.status === 200) expect(editRes.status).toBe(404);
      if (editRes.status === 200) expect(deleteRes.status).toBe(409);

      const final = await prisma.tripExpense.findUniqueOrThrow({ where: { id: expenseId } });
      if (deleteRes.status === 200) {
        // Delete won: the expense must be deleted, and the edit's title must NEVER have applied.
        expect(final.deletedAt).not.toBeNull();
        expect(final.title).not.toBe('Should not resurrect');
      } else {
        // Edit won: the expense must NOT be deleted, and the title must reflect the edit.
        expect(final.deletedAt).toBeNull();
        expect(final.title).toBe('Should not resurrect');
      }
    });

    it('forced rollback: a real PostgreSQL unique-constraint violation mid-transaction reverts the expense field change AND the share change together (spec section 84)', async () => {
      const tripId = await tripWithAllRoles();
      const created = await createExpense(ownerToken, tripId, equalExpense({ title: 'Original title', amount: '300.00' })).expect(201);
      const expenseId = created.body.data.id;
      const originalShares = created.body.data.shares;

      // Mirrors TripExpensesService.update's exact statement sequence (edit
      // the expense fields, delete the old shares, insert new ones) but
      // deliberately inserts a DUPLICATE userId to trigger a genuine
      // Postgres unique-constraint violation (@@unique([expenseId,userId]))
      // on the LAST statement, after the expense field edit and the share
      // deletion have already executed within the same transaction.
      await expect(
        prisma.$transaction(async (tx) => {
          await tx.tripExpense.update({ where: { id: expenseId }, data: { title: 'Should be rolled back', version: { increment: 1 } } });
          await tx.tripExpenseShare.deleteMany({ where: { expenseId } });
          await tx.tripExpenseShare.createMany({
            data: [
              { expenseId, userId: ownerId, amount: '150.00' },
              { expenseId, userId: ownerId, amount: '150.00' }, // duplicate userId -> real P2002 unique violation
            ],
          });
        }),
      ).rejects.toThrow();

      // Prove EVERYTHING in that transaction rolled back, not just the failing statement.
      const final = await prisma.tripExpense.findUniqueOrThrow({ where: { id: expenseId }, include: { shares: true } });
      expect(final.title).toBe('Original title'); // expense field change reverted
      expect(final.version).toBe(0); // version bump reverted
      expect(final.shares).toHaveLength(originalShares.length); // share deletion reverted - originals still present
      expect(final.shares.map((s) => s.userId).sort()).toEqual(originalShares.map((s: any) => s.userId).sort());
    });
  });

  describe('former-member preservation (spec sections 23-26)', () => {
    it('financial history survives member removal; removed member loses API access but the ledger stays intact for current participants', async () => {
      const tripId = await tripWithAllRoles();
      const created = await createExpense(ownerToken, tripId, equalExpense({ payerUserId: editorId, shares: [{ userId: editorId }, { userId: ownerId }] })).expect(201);

      const memberRow = await prisma.tripMember.findUniqueOrThrow({ where: { tripId_userId: { tripId, userId: editorId } } });
      await request(app.getHttpServer())
        .delete(`/v1/trips/${tripId}/members/${memberRow.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ expectedVersion: 0 })
        .expect(200);

      // Removed member: same JWT, financial API now denied.
      await listExpenses(editorToken, tripId).expect(403);
      await createExpense(editorToken, tripId, equalExpense()).expect(403);

      // Current participant (owner): history intact, still references the removed editor by id.
      const detail = await expenseDetail(ownerToken, tripId, created.body.data.id).expect(200);
      expect(detail.body.data.payerUserId).toBe(editorId);
      const bal = await summary(ownerToken, tripId).expect(200);
      const usd = bal.body.data.balancesByCurrency.find((b: any) => b.currency === 'USD');
      expect(usd.balances.some((b: any) => b.userId === editorId)).toBe(true);
    });

    it('a current member cannot add a REMOVED user to a NEW expense (fail closed, spec section 24)', async () => {
      const tripId = await tripWithAllRoles();
      const memberRow = await prisma.tripMember.findUniqueOrThrow({ where: { tripId_userId: { tripId, userId: editorId } } });
      await request(app.getHttpServer())
        .delete(`/v1/trips/${tripId}/members/${memberRow.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ expectedVersion: 0 })
        .expect(200);

      const res = await createExpense(ownerToken, tripId, equalExpense({ shares: [{ userId: ownerId }, { userId: editorId }] })).expect(400);
      expect(res.body.error.code).toBe('TRIP_EXPENSE_PARTICIPANT_INVALID');
    });

    it('ownership transfer does not alter expenses/payer/shares/balances (spec section 27)', async () => {
      const tripId = await tripWithAllRoles();
      await createExpense(ownerToken, tripId, equalExpense()).expect(201);
      const before = await summary(ownerToken, tripId).expect(200);

      await request(app.getHttpServer())
        .post(`/v1/trips/${tripId}/transfer-ownership`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ newOwnerUserId: editorId, expectedVersion: 0 })
        .expect(201);

      const after = await summary(editorToken, tripId).expect(200);
      expect(after.body.data).toEqual(before.body.data);
    });
  });

  describe('real PostgreSQL races: member removal / role downgrade / archive vs financial mutation (spec sections 36-38)', () => {
    it('member-removal-vs-create race: no financial mutation by the removed user survives past removal; sequential follow-up proves the block is permanent', async () => {
      const tripId = await tripWithAllRoles();
      const memberRow = await prisma.tripMember.findUniqueOrThrow({ where: { tripId_userId: { tripId, userId: editorId } } });

      const [createRes, removeRes] = await Promise.all([
        createExpense(editorToken, tripId, equalExpense()),
        request(app.getHttpServer()).delete(`/v1/trips/${tripId}/members/${memberRow.id}`).set('Authorization', `Bearer ${ownerToken}`).send({ expectedVersion: 0 }),
      ]);
      expect(removeRes.status).toBe(200); // removal always eventually succeeds in this scenario
      expect([200, 201, 403]).toContain(createRes.status);

      // Sequential, definitely-non-racing follow-up: the removal has now
      // unambiguously taken effect - the SAME JWT must be denied every time.
      const followUp = await createExpense(editorToken, tripId, equalExpense());
      expect(followUp.status).toBe(403);
    });

    it('role-downgrade-vs-mutation race: no post-downgrade mutation succeeds using stale EDITOR authorization; sequential follow-up proves the block is permanent', async () => {
      const tripId = await tripWithAllRoles();
      const memberRow = await prisma.tripMember.findUniqueOrThrow({ where: { tripId_userId: { tripId, userId: editorId } } });

      const [createRes, downgradeRes] = await Promise.all([
        createExpense(editorToken, tripId, equalExpense()),
        request(app.getHttpServer()).patch(`/v1/trips/${tripId}/members/${memberRow.id}`).set('Authorization', `Bearer ${ownerToken}`).send({ role: 'VIEWER', expectedVersion: 0 }),
      ]);
      expect(downgradeRes.status).toBe(200);
      expect([200, 201, 403]).toContain(createRes.status);

      const followUp = await createExpense(editorToken, tripId, equalExpense());
      expect(followUp.status).toBe(403);
    });

    it('archive-vs-mutation race: no new mutable financial state commits after archive becomes authoritative; sequential follow-up proves the block is permanent', async () => {
      const tripId = await tripWithAllRoles();

      const [createRes, archiveRes] = await Promise.all([
        createExpense(ownerToken, tripId, equalExpense()),
        request(app.getHttpServer()).post(`/v1/trips/${tripId}/archive`).set('Authorization', `Bearer ${ownerToken}`).send({ expectedVersion: 0 }),
      ]);
      expect(archiveRes.status).toBe(201);
      expect([200, 201, 409]).toContain(createRes.status);

      const followUp = await createExpense(ownerToken, tripId, equalExpense());
      expect(followUp.status).toBe(409);
      expect(followUp.body.error.code).toBe('TRIP_ARCHIVED');
    });
  });

  describe('archive (spec sections 30, 91)', () => {
    it('archived trip: reads allowed, mutations denied, balances stable, history preserved', async () => {
      const tripId = await tripWithAllRoles();
      await createExpense(ownerToken, tripId, equalExpense()).expect(201);
      const before = await summary(ownerToken, tripId).expect(200);

      await request(app.getHttpServer()).post(`/v1/trips/${tripId}/archive`).set('Authorization', `Bearer ${ownerToken}`).send({ expectedVersion: 0 }).expect(201);

      await listExpenses(ownerToken, tripId).expect(200);
      const after = await summary(ownerToken, tripId).expect(200);
      expect(after.body.data).toEqual(before.body.data);

      const rejected = await createExpense(ownerToken, tripId, equalExpense()).expect(409);
      expect(rejected.body.error.code).toBe('TRIP_ARCHIVED');
      const rejectedSettlement = await createSettlement(ownerToken, tripId, { fromUserId: ownerId, toUserId: editorId, amount: '1.00', currency: 'USD', settledAt: '2026-12-03' }).expect(409);
      expect(rejectedSettlement.body.error.code).toBe('TRIP_ARCHIVED');
    });
  });

  describe('settlement (spec sections 46-51)', () => {
    it('rejects fromUserId === toUserId', async () => {
      const tripId = await tripWithAllRoles();
      const res = await createSettlement(ownerToken, tripId, { fromUserId: ownerId, toUserId: ownerId, amount: '10.00', currency: 'USD', settledAt: '2026-12-03' }).expect(400);
      expect(res.body.error.code).toBe('TRIP_SETTLEMENT_INVALID');
    });

    it('settlement moves both parties toward zero exactly (spec section 40/49 worked example)', async () => {
      const tripId = await tripWithAllRoles();
      await createExpense(ownerToken, tripId, equalExpense({ amount: '100.00', payerUserId: editorId, shares: [{ userId: ownerId }] })).expect(201);
      let bal = await summary(ownerToken, tripId).expect(200);
      let usd = bal.body.data.balancesByCurrency.find((b: any) => b.currency === 'USD');
      expect(Object.fromEntries(usd.balances.map((b: any) => [b.userId, b.netAmount]))[ownerId]).toBe('-100');

      await createSettlement(ownerToken, tripId, { fromUserId: ownerId, toUserId: editorId, amount: '100.00', currency: 'USD', settledAt: '2026-12-03' }).expect(201);

      bal = await summary(ownerToken, tripId).expect(200);
      usd = bal.body.data.balancesByCurrency.find((b: any) => b.currency === 'USD');
      const byUser = Object.fromEntries(usd.balances.map((b: any) => [b.userId, b.netAmount]));
      expect(byUser[ownerId]).toBe('0');
      expect(byUser[editorId]).toBe('0');
    });

    it('never clamps to the currently-suggested balance - an over-settlement is accepted structurally (spec section 50)', async () => {
      const tripId = await tripWithAllRoles();
      await createExpense(ownerToken, tripId, equalExpense({ amount: '50.00', payerUserId: editorId, shares: [{ userId: ownerId }] })).expect(201);
      // owner owes 50, but declares a 75 settlement - accepted, not clamped to 50.
      const res = await createSettlement(ownerToken, tripId, { fromUserId: ownerId, toUserId: editorId, amount: '75.00', currency: 'USD', settledAt: '2026-12-03' }).expect(201);
      expect(res.body.data.amount).toBe('75');
    });
  });

  describe('conservation test matrix (spec section 85)', () => {
    it('conserves across single expense / payer-included / payer-excluded / 3-way equal / exact / percentage / multiple expenses / settlement / former member / soft-deleted expense', async () => {
      const tripId = await tripWithAllRoles();

      await createExpense(ownerToken, tripId, equalExpense({ amount: '300.00', splitMode: 'EQUAL', shares: [{ userId: ownerId }, { userId: editorId }, { userId: viewerId }] })).expect(201);
      await createExpense(ownerToken, tripId, equalExpense({ amount: '90.00', payerUserId: editorId, splitMode: 'EQUAL', shares: [{ userId: viewerId }] })).expect(201);
      const toDelete = await createExpense(
        ownerToken,
        tripId,
        equalExpense({ amount: '999.00', splitMode: 'EXACT', shares: [{ userId: ownerId, amount: '999.00' }] }),
      ).expect(201);
      await deleteExpense(ownerToken, tripId, toDelete.body.data.id, 0).expect(200); // soft-deleted - must not affect conservation
      await createExpense(
        ownerToken,
        tripId,
        equalExpense({ amount: '100.00', splitMode: 'PERCENTAGE', shares: [{ userId: ownerId, percentage: '33.34' }, { userId: editorId, percentage: '33.33' }, { userId: viewerId, percentage: '33.33' }] }),
      ).expect(201);
      await createSettlement(ownerToken, tripId, { fromUserId: viewerId, toUserId: ownerId, amount: '25.00', currency: 'USD', settledAt: '2026-12-04' }).expect(201);

      // Former member: remove viewer after all the above.
      const memberRow = await prisma.tripMember.findUniqueOrThrow({ where: { tripId_userId: { tripId, userId: viewerId } } });
      await request(app.getHttpServer()).delete(`/v1/trips/${tripId}/members/${memberRow.id}`).set('Authorization', `Bearer ${ownerToken}`).send({ expectedVersion: 0 }).expect(200);

      const bal = await summary(ownerToken, tripId).expect(200);
      const usd = bal.body.data.balancesByCurrency.find((b: any) => b.currency === 'USD');
      const total = usd.balances.reduce((acc: number, b: any) => acc + Number(b.netAmount), 0);
      expect(total).toBeCloseTo(0, 6);
    });
  });

  describe('multi-currency isolation (spec sections 42/86)', () => {
    it('VND/JPY/USD ledgers stay fully separate, no conversion, no cross-currency total', async () => {
      const tripId = await tripWithAllRoles();
      await createExpense(ownerToken, tripId, equalExpense({ currency: 'VND', amount: '1000000.00' })).expect(201);
      await createExpense(ownerToken, tripId, equalExpense({ currency: 'JPY', amount: '15000.00' })).expect(201);
      await createExpense(ownerToken, tripId, equalExpense({ currency: 'USD', amount: '75.00' })).expect(201);

      const bal = await summary(ownerToken, tripId).expect(200);
      const currencies = bal.body.data.totalsByCurrency.map((t: any) => t.currency).sort();
      expect(currencies).toEqual(['JPY', 'USD', 'VND']);
      const vnd = bal.body.data.totalsByCurrency.find((t: any) => t.currency === 'VND');
      expect(vnd.totalAmount).toBe('1000000');
    });
  });

  describe('settlement suggestions (spec sections 44/45/87)', () => {
    it('deterministic, zeroes on conceptual application, no cross-currency suggestion', async () => {
      const tripId = await tripWithAllRoles();
      await createExpense(ownerToken, tripId, equalExpense({ amount: '300.00', shares: [{ userId: ownerId }, { userId: editorId }, { userId: viewerId }] })).expect(201);

      const first = await suggestions(ownerToken, tripId).expect(200);
      const second = await suggestions(ownerToken, tripId).expect(200);
      expect(first.body.data).toEqual(second.body.data);

      const usd = first.body.data.suggestionsByCurrency.find((s: any) => s.currency === 'USD');
      expect(usd.suggestions.length).toBeGreaterThan(0);
    });
  });

  describe('leak scans (spec sections 61-62, 78-79)', () => {
    it('collaboration events for expense/settlement lifecycle never contain the monetary amount', async () => {
      const tripId = await tripWithAllRoles();
      const created = await createExpense(ownerToken, tripId, equalExpense({ amount: '12345.67' })).expect(201);
      await updateExpense(ownerToken, tripId, created.body.data.id, { ...equalExpense({ amount: '999.99' }), expectedVersion: 0 }).expect(200);
      await deleteExpense(ownerToken, tripId, created.body.data.id, 1).expect(200);
      await createSettlement(ownerToken, tripId, { fromUserId: ownerId, toUserId: editorId, amount: '54321.00', currency: 'USD', settledAt: '2026-12-03' }).expect(201);

      const events = await prisma.tripCollaborationEvent.findMany({ where: { tripId, type: { in: ['EXPENSE_ADDED', 'EXPENSE_UPDATED', 'EXPENSE_DELETED', 'SETTLEMENT_RECORDED'] } } });
      expect(events.length).toBeGreaterThan(0);
      for (const event of events) {
        const raw = JSON.stringify(event.metadata ?? {});
        expect(raw).not.toContain('12345.67');
        expect(raw).not.toContain('999.99');
        expect(raw).not.toContain('54321');
        expect(raw.toLowerCase()).not.toContain('amount');
      }
    });

    it('audit log entries for expense/settlement lifecycle exist and never copy the free-text note', async () => {
      const tripId = await tripWithAllRoles();
      const secretNote = 'super-secret-personal-note-xyz';
      const created = await createExpense(ownerToken, tripId, equalExpense({ note: secretNote })).expect(201);

      const rows = await prisma.auditLog.findMany({ where: { entityType: 'TRIP_EXPENSE', entityId: created.body.data.id } });
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(JSON.stringify(row.metadata ?? {})).not.toContain(secretNote);
      }
    });

    it('the detail response never exposes a raw Prisma-internal shape beyond the intended fields (no unexpected email/internal ids leak)', async () => {
      const tripId = await tripWithAllRoles();
      const created = await createExpense(ownerToken, tripId, equalExpense()).expect(201);
      const detail = await expenseDetail(ownerToken, tripId, created.body.data.id).expect(200);
      expect(detail.body.data.payerEmail).toBeUndefined();
      expect(detail.body.data.createdByEmail).toBeUndefined();
    });
  });
});
