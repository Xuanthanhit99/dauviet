import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { SourcesService } from '../src/modules/sources/sources.service';
import { bootstrapTestApp } from './bootstrap-test-app';

/**
 * Phase 12.1 remediation - real-DB, real-HTTP proof of the Phase 09
 * contribution -> catalogue pipeline that Phase 12's freeze report did not
 * cover with live evidence. Requires the same live infra as
 * health.e2e-spec.ts (a reachable DATABASE_URL/REDIS_URL - see
 * docs/backend/LIVE_QA_REPORT.md's "Phase 12.1" section for the exact
 * commands this was run against).
 */
describe('Contribution catalogue pipeline (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sources: SourcesService;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    prisma = app.get(PrismaService);
    sources = app.get(SourcesService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerAndLogin(email: string, roles: string[]) {
    await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email, password: 'E2eTest-Pass!1', displayName: email })
      .expect(201);
    await prisma.user.update({ where: { email }, data: { roles: roles as any } });
    const res = await request(app.getHttpServer()).post('/v1/auth/login').send({ email, password: 'E2eTest-Pass!1' }).expect(201);
    return res.body.data.accessToken as string;
  }

  it('advances SUBMITTED -> ... -> ACCEPTED -> CATALOGUED via the real API, catalogues a Source exactly once (idempotent), and never creates a HistoricalFact/Citation', async () => {
    const stamp = Date.now();
    const contributorToken = await registerAndLogin(`e2e-contributor-${stamp}@dauviet.test`, ['USER', 'CONTRIBUTOR']);
    const editorToken = await registerAndLogin(`e2e-editor-${stamp}@dauviet.test`, ['USER', 'EDITOR']);
    const historianToken = await registerAndLogin(`e2e-historian-${stamp}@dauviet.test`, ['USER', 'HISTORIAN_REVIEWER']);

    const createRes = await request(app.getHttpServer())
      .post('/v1/contributions')
      .set('Authorization', `Bearer ${contributorToken}`)
      .send({ type: 'BOOK_REFERENCE', title: `E2E catalogue fixture ${stamp}`, submitterDeclaration: 'OWN_MATERIAL' })
      .expect(201);
    const id = createRes.body.data.id;
    expect(createRes.body.data.status).toBe('SUBMITTED');
    let version = createRes.body.data.version as number;

    // SUBMITTED -> TRIAGE -> PROVENANCE_REVIEW -> HISTORICAL_REVIEW (EDITOR completes all three)
    for (let i = 0; i < 3; i += 1) {
      const res = await request(app.getHttpServer())
        .post(`/v1/admin/contributions/${id}/reviews`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({ expectedVersion: version, decision: 'APPROVE' })
        .expect(201);
      version = res.body.data.version;
    }
    const midDetail = await request(app.getHttpServer())
      .get(`/v1/admin/contributions/${id}`)
      .set('Authorization', `Bearer ${historianToken}`)
      .expect(200);
    expect(midDetail.body.data.status).toBe('HISTORICAL_REVIEW');

    // The historical-accuracy checkpoint is stricter - EDITOR must be refused here.
    await request(app.getHttpServer())
      .post(`/v1/admin/contributions/${id}/reviews`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ expectedVersion: version, decision: 'APPROVE' })
      .expect(403);

    const acceptRes = await request(app.getHttpServer())
      .post(`/v1/admin/contributions/${id}/reviews`)
      .set('Authorization', `Bearer ${historianToken}`)
      .send({ expectedVersion: version, decision: 'APPROVE' })
      .expect(201);
    expect(acceptRes.body.data.status).toBe('ACCEPTED');
    version = acceptRes.body.data.version;

    // Cataloguing is refused until rights review is explicitly APPROVED_FOR_CATALOGUE.
    await request(app.getHttpServer())
      .post(`/v1/admin/contributions/${id}/catalogue/source`)
      .set('Authorization', `Bearer ${historianToken}`)
      .send({ expectedVersion: version, sourceType: 'BOOK', title: 'should be refused', credibilityLevel: 'SECONDARY' })
      .expect(400);

    const rightsRes = await request(app.getHttpServer())
      .patch(`/v1/admin/contributions/${id}/rights-review`)
      .set('Authorization', `Bearer ${historianToken}`)
      .send({ expectedVersion: version, rightsReviewState: 'APPROVED_FOR_CATALOGUE' })
      .expect(200);
    version = rightsRes.body.data.version;

    const [factCountBefore, citationCountBefore, sourceCountBefore] = await Promise.all([
      prisma.historicalFact.count(),
      prisma.citation.count(),
      prisma.source.count(),
    ]);

    const catalogueRes = await request(app.getHttpServer())
      .post(`/v1/admin/contributions/${id}/catalogue/source`)
      .set('Authorization', `Bearer ${historianToken}`)
      .send({ expectedVersion: version, sourceType: 'BOOK', title: `E2E catalogue source ${stamp}`, credibilityLevel: 'SECONDARY' })
      .expect(201);
    const resultId = catalogueRes.body.data.id;
    const sourceId = catalogueRes.body.data.sourceId;
    expect(sourceId).toBeTruthy();

    const detail = await request(app.getHttpServer())
      .get(`/v1/admin/contributions/${id}`)
      .set('Authorization', `Bearer ${historianToken}`)
      .expect(200);
    expect(detail.body.data.status).toBe('CATALOGUED');

    const [factCountAfter, citationCountAfter, sourceCountAfter] = await Promise.all([
      prisma.historicalFact.count(),
      prisma.citation.count(),
      prisma.source.count(),
    ]);
    expect(factCountAfter).toBe(factCountBefore); // trust boundary: CATALOGUED never implies a HistoricalFact
    expect(citationCountAfter).toBe(citationCountBefore); // never a Citation either
    expect(sourceCountAfter).toBe(sourceCountBefore + 1); // exactly one new Source

    // Idempotency: the same catalogue call again must return the identical
    // result and create nothing new, even with different (ignored) input.
    // The first catalogue call incremented the Contribution's version as
    // part of its own ACCEPTED -> CATALOGUED transition, so the version used
    // above is now stale - re-read it, exactly as a real reviewer client
    // would after seeing the first response.
    const postCatalogueVersion = detail.body.data.version as number;
    const secondRes = await request(app.getHttpServer())
      .post(`/v1/admin/contributions/${id}/catalogue/source`)
      .set('Authorization', `Bearer ${historianToken}`)
      .send({ expectedVersion: postCatalogueVersion, sourceType: 'BOOK', title: 'ignored on the idempotent path', credibilityLevel: 'PRIMARY' })
      .expect(201);
    expect(secondRes.body.data.id).toBe(resultId);
    expect(secondRes.body.data.sourceId).toBe(sourceId);

    const [sourceCountFinal, catalogueResultCount] = await Promise.all([
      prisma.source.count(),
      prisma.contributionCatalogueResult.count({ where: { contributionId: id } }),
    ]);
    expect(sourceCountFinal).toBe(sourceCountAfter); // no duplicate Source from the second call
    expect(catalogueResultCount).toBe(1); // no duplicate ContributionCatalogueResult row

    // Privacy boundary: an unrelated user must not be able to read this
    // contribution through the submitter-facing surface.
    const strangerToken = await registerAndLogin(`e2e-stranger-${stamp}@dauviet.test`, ['USER']);
    await request(app.getHttpServer())
      .get(`/v1/contributions/mine/${id}`)
      .set('Authorization', `Bearer ${strangerToken}`)
      .expect(403);

    // Public discovery boundary: the raw contribution must never surface
    // through public canonical discovery surfaces. Checked against the exact
    // Contribution title (not just the shared timestamp) because the
    // catalogued Source legitimately IS publicly searchable now - it has its
    // own, different title that happens to share the same stamp, which is
    // the whole point of cataloguing, not a leak.
    const contributionTitle = createRes.body.data.title as string;
    const searchRes = await request(app.getHttpServer()).get(`/v1/search`).query({ q: contributionTitle }).expect(200);
    expect(searchRes.body.data.results.some((r: { title: string }) => r.title === contributionTitle)).toBe(false);
  }, 60000);

  it('rolls back the entire catalogue-style transaction if a later write fails - no partial Source survives', async () => {
    const stamp = Date.now();
    const testTitle = `E2E rollback probe ${stamp}`;
    const sourceCountBefore = await prisma.source.count();
    const auditCountBefore = await prisma.auditLog.count({ where: { action: 'source.created' } });

    // A real, existing user id (not a throwaway string) - AuditLog.actorId
    // carries a real FK constraint, so a fake id would make
    // SourcesService.create's own audit write fail before this probe even
    // reaches its deliberate throw, which would prove nothing about the
    // catalogue transaction's own atomicity.
    const rollbackActor = await prisma.user.findFirstOrThrow({ select: { id: true } });

    await expect(
      prisma.$transaction(async (tx) => {
        // Exercises the exact tx-threading contract catalogueSource/
        // catalogueDocument/catalogueMedia rely on: SourcesService.create(dto,
        // actorId, tx) is expected to participate in the caller's transaction
        // rather than opening its own, so that a later failure in the same
        // transaction rolls the Source insert back too.
        await sources.create({ sourceType: 'BOOK', title: testTitle, credibilityLevel: 'SECONDARY' } as any, rollbackActor.id, tx);
        throw new Error('QA_FORCED_ROLLBACK_PROBE');
      }),
    ).rejects.toThrow('QA_FORCED_ROLLBACK_PROBE');

    const sourceCountAfter = await prisma.source.count();
    expect(sourceCountAfter).toBe(sourceCountBefore); // the Source insert itself was correctly rolled back
    const leaked = await prisma.source.findFirst({ where: { title: testTitle } });
    expect(leaked).toBeNull();

    // Phase 12.1 fix regression guard: this rollback probe originally proved
    // a real gap - AuditService.log always wrote through the ambient
    // PrismaService, never the `tx` SourcesService.create was handed, so the
    // `source.created` audit row survived even though the Source row it
    // described was rolled back. AuditService.log now accepts the same
    // `db`/`tx` parameter SourcesService/MediaService already did, and
    // SourcesService.create/addDocument + MediaService.promote now pass
    // their own `db` through - so the audit row must roll back too.
    const auditCountAfter = await prisma.auditLog.count({ where: { action: 'source.created' } });
    expect(auditCountAfter).toBe(auditCountBefore);
  });
});
