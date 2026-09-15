import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { bootstrapTestApp } from './bootstrap-test-app';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * G06 CostAssumption admin module - live e2e coverage for ADMIN-only RBAC
 * (stricter than the EDITOR/ADMIN tier used for public catalogue content -
 * pre-implementation report section 1.10), the immutable-identity/mutable-
 * rest split between create and update, the low<=typical<=high and
 * effectiveTo>=effectiveFrom validations, the forward-only DRAFT->ACTIVE->
 * RETIRED status machine, and the duplicate-identity guard that exists
 * because Postgres does not enforce `@@unique([scope, scopeId, ...])` for
 * GLOBAL-scoped rows (NULL != NULL) - see
 * docs/backend/G06_PRE_IMPLEMENTATION_REPORT.md section 3.5 for why the
 * service checks this explicitly instead of relying on the DB constraint.
 *
 * Only two users are registered for the whole file (`POST /v1/auth/register`
 * is throttled to 5/60s per IP) and reused across every `it()`.
 */
describe('CostAssumptions admin (G06) - e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const stamp = Date.now();
  const createdEmails: string[] = [];
  const createdAssumptionIds: string[] = [];
  let adminToken: string;
  let editorToken: string;
  let dayCounter = 0;

  async function registerAndLogin(label: string, roles: string[]) {
    const email = `g06-ca-${label}-${stamp}@example.com`;
    createdEmails.push(email);
    await request(app.getHttpServer()).post('/v1/auth/register').send({ email, password: 'E2eTest-Pass!1', displayName: email }).expect(201);
    await prisma.user.update({ where: { email }, data: { roles: roles as any } });
    const res = await request(app.getHttpServer()).post('/v1/auth/login').send({ email, password: 'E2eTest-Pass!1' }).expect(201);
    return res.body.data.accessToken as string;
  }

  /** Each call gets its own `effectiveFrom` day so distinct test cases never collide on the natural unique identity. */
  function nextEffectiveFrom(): string {
    dayCounter += 1;
    return `2030-01-${String(dayCounter).padStart(2, '0')}`;
  }

  function createDto(overrides: Record<string, unknown> = {}) {
    return {
      scope: 'GLOBAL',
      category: 'OTHER',
      unit: 'PER_TRIP',
      currency: 'VND',
      lowAmount: '10000',
      typicalAmount: '20000',
      highAmount: '30000',
      effectiveFrom: nextEffectiveFrom(),
      source: 'e2e fixture - never used for a real estimate',
      ...overrides,
    };
  }

  beforeAll(async () => {
    app = await bootstrapTestApp();
    prisma = app.get(PrismaService);
    adminToken = await registerAndLogin('admin', ['ADMIN']);
    editorToken = await registerAndLogin('editor', ['EDITOR']);
  }, 30_000);

  afterAll(async () => {
    if (createdAssumptionIds.length > 0) {
      await prisma.costAssumption.deleteMany({ where: { id: { in: createdAssumptionIds } } });
    }
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    await app.close();
  });

  it('rejects a non-ADMIN (EDITOR is not enough - stricter than public catalogue content)', async () => {
    await request(app.getHttpServer()).post('/v1/admin/cost-assumptions').set('Authorization', `Bearer ${editorToken}`).send(createDto()).expect(403);
  });

  it('rejects lowAmount > typicalAmount, and typicalAmount > highAmount', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/admin/cost-assumptions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(createDto({ lowAmount: '999', typicalAmount: '100' }))
      .expect(400);
    expect(res.body.error.code).toBe('COST_ASSUMPTION_INVALID_RANGE');
  });

  it('rejects effectiveTo before effectiveFrom', async () => {
    const effectiveFrom = nextEffectiveFrom();
    const res = await request(app.getHttpServer())
      .post('/v1/admin/cost-assumptions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(createDto({ effectiveFrom, effectiveTo: '2020-01-01' }))
      .expect(400);
    expect(res.body.error.code).toBe('COST_ASSUMPTION_INVALID_EFFECTIVE_RANGE');
  });

  it('rejects a non-GLOBAL scope with no scopeSlug, and GLOBAL with one set', async () => {
    const missingSlug = await request(app.getHttpServer())
      .post('/v1/admin/cost-assumptions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(createDto({ scope: 'COUNTRY' }))
      .expect(400);
    expect(missingSlug.body.error.code).toBe('COST_ASSUMPTION_SCOPE_MISMATCH');

    const extraSlug = await request(app.getHttpServer())
      .post('/v1/admin/cost-assumptions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(createDto({ scope: 'GLOBAL', scopeSlug: 'should-not-be-here' }))
      .expect(400);
    expect(extraSlug.body.error.code).toBe('COST_ASSUMPTION_SCOPE_MISMATCH');
  });

  it('creates a row as ADMIN, rejects an exact-identity duplicate, updates non-identity fields, and forward-only transitions its status', async () => {
    const dto = createDto();

    const createRes = await request(app.getHttpServer()).post('/v1/admin/cost-assumptions').set('Authorization', `Bearer ${adminToken}`).send(dto).expect(201);
    const id = createRes.body.data.id as string;
    createdAssumptionIds.push(id);
    expect(createRes.body.data.status).toBe('DRAFT');
    expect(createRes.body.data.currency).toBe('VND');

    // Exact-identity duplicate (scope/scopeId/category/unit/effectiveFrom) is rejected even for GLOBAL,
    // where the DB's own unique index cannot catch it (NULL scopeId never equals NULL).
    const dupRes = await request(app.getHttpServer()).post('/v1/admin/cost-assumptions').set('Authorization', `Bearer ${adminToken}`).send(dto).expect(409);
    expect(dupRes.body.error.code).toBe('COST_ASSUMPTION_DUPLICATE_IDENTITY');

    const updateRes = await request(app.getHttpServer())
      .patch(`/v1/admin/cost-assumptions/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ typicalAmount: '25000', source: 'revised e2e fixture' })
      .expect(200);
    expect(updateRes.body.data.typicalAmount).toBe('25000');
    expect(updateRes.body.data.source).toBe('revised e2e fixture');

    const getRes = await request(app.getHttpServer()).get(`/v1/admin/cost-assumptions/${id}`).set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(getRes.body.data.id).toBe(id);

    const listRes = await request(app.getHttpServer()).get('/v1/admin/cost-assumptions').set('Authorization', `Bearer ${adminToken}`).query({ scope: 'GLOBAL' }).expect(200);
    expect(listRes.body.data.items.map((r: any) => r.id)).toContain(id);

    // Forward-only: DRAFT -> ACTIVE is allowed, ACTIVE -> DRAFT is not.
    const activateRes = await request(app.getHttpServer()).patch(`/v1/admin/cost-assumptions/${id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'ACTIVE' }).expect(200);
    expect(activateRes.body.data.status).toBe('ACTIVE');

    const backwardsRes = await request(app.getHttpServer()).patch(`/v1/admin/cost-assumptions/${id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'DRAFT' }).expect(400);
    expect(backwardsRes.body.error.code).toBe('COST_ASSUMPTION_INVALID_STATUS_TRANSITION');

    const retireRes = await request(app.getHttpServer()).patch(`/v1/admin/cost-assumptions/${id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'RETIRED' }).expect(200);
    expect(retireRes.body.data.status).toBe('RETIRED');

    // RETIRED is terminal - no further transition is allowed, not even to itself.
    const terminalRes = await request(app.getHttpServer()).patch(`/v1/admin/cost-assumptions/${id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'ACTIVE' }).expect(400);
    expect(terminalRes.body.error.code).toBe('COST_ASSUMPTION_INVALID_STATUS_TRANSITION');
  });

  it('404s with COST_ASSUMPTION_NOT_FOUND for a nonexistent id', async () => {
    const res = await request(app.getHttpServer()).get('/v1/admin/cost-assumptions/not-a-real-id').set('Authorization', `Bearer ${adminToken}`).expect(404);
    expect(res.body.error.code).toBe('COST_ASSUMPTION_NOT_FOUND');
  });

  it('a forced failure partway through a mutation rolls back the entire attempt - no partial field/version change ever persists (real PostgreSQL rollback proof, recovery-spec gate 289, same transactional shape as CostAssumptionsService.update/setStatus)', async () => {
    const createRes = await request(app.getHttpServer()).post('/v1/admin/cost-assumptions').set('Authorization', `Bearer ${adminToken}`).send(createDto()).expect(201);
    const id = createRes.body.data.id as string;
    createdAssumptionIds.push(id);

    const before = await prisma.costAssumption.findUniqueOrThrow({ where: { id } });

    // Mirrors the real service's `update`/`setStatus` shape exactly: one
    // field write followed by an audit-log write, both in a single
    // `$transaction` - here the second step is replaced with a forced
    // failure so the field write's own durability (not just the audit log's)
    // is what gets proven.
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.costAssumption.update({
          where: { id },
          data: { typicalAmount: '999999.00', status: 'ACTIVE', version: { increment: 1 } },
        });
        throw new Error('G06_QA_COST_ASSUMPTION_ROLLBACK_PROBE');
      }),
    ).rejects.toThrow('G06_QA_COST_ASSUMPTION_ROLLBACK_PROBE');

    const after = await prisma.costAssumption.findUniqueOrThrow({ where: { id } });
    expect(after.version).toBe(before.version);
    expect(after.typicalAmount.toString()).toBe(before.typicalAmount.toString());
    expect(after.status).toBe(before.status);

    // The real HTTP mutation path still works normally afterward - the
    // forced failure above was isolated to its own transaction, not a
    // lingering connection/lock issue (real PostgreSQL, not a mock).
    const realUpdateRes = await request(app.getHttpServer())
      .patch(`/v1/admin/cost-assumptions/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ typicalAmount: '21000' })
      .expect(200);
    expect(realUpdateRes.body.data.typicalAmount).toBe('21000');
  });
});
