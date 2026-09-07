import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { ProviderRegistryService } from '../src/modules/providers/provider-registry.service';
import { TEST_FIXTURE_PROVIDER_CODE } from '../src/modules/providers/provider-test-fixture';
import { bootstrapTestApp } from './bootstrap-test-app';

/**
 * G02 spec section 56 - real-DB, real-HTTP proof of the full provider
 * activation gate: unconfigured/unlicensed access is rejected, every gate
 * requirement is satisfied one at a time, activation succeeds only once
 * all of them hold, and a later license revocation blocks access again
 * immediately - with nothing cached in between. Uses only the internal
 * `TEST_FIXTURE_PROVIDER_CODE` fixture (spec section 28) - no real
 * Google/Booking/Agoda/Viator API is ever called.
 */
describe('Provider activation gate (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let registry: ProviderRegistryService;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    prisma = app.get(PrismaService);
    registry = app.get(ProviderRegistryService);
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

  it('walks the full gate: unlicensed -> rejected -> every requirement satisfied -> activated -> context succeeds -> revoked -> immediately rejected again', async () => {
    const stamp = Date.now();
    const adminToken = await registerAndLogin(`e2e-provider-admin-${stamp}@dauviet.test`, ['USER', 'ADMIN']);
    const editorToken = await registerAndLogin(`e2e-provider-editor-${stamp}@dauviet.test`, ['USER', 'EDITOR']);
    const code = `${TEST_FIXTURE_PROVIDER_CODE}_${stamp}`;

    // A non-ADMIN authenticated user must be refused (spec section 23/55 RBAC).
    await request(app.getHttpServer())
      .post('/v1/admin/providers')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ code, name: 'G02 E2E Fixture Provider' })
      .expect(403);

    // 1. Create candidate Provider (DRAFT).
    const providerRes = await request(app.getHttpServer())
      .post('/v1/admin/providers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code, name: 'G02 E2E Fixture Provider', credentialMode: 'API_KEY' })
      .expect(201);
    const providerId = providerRes.body.data.id as string;
    expect(providerRes.body.data.status).toBe('DRAFT');

    // A DRAFT provider must fail closed on the runtime gate before anything else is configured.
    const preActivationCheck = await registry.getExecutionContext({ providerCode: code, environment: 'SANDBOX', capability: 'PLACE_DETAIL' });
    expect(preActivationCheck.ok).toBe(false);
    if (!preActivationCheck.ok) expect(preActivationCheck.code).toBe('PROVIDER_NOT_ACTIVE');

    // Provider must be ACTIVE for the gate to proceed past this checkpoint.
    await request(app.getHttpServer())
      .patch(`/v1/admin/providers/${providerId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'ACTIVE' })
      .expect(200);

    // 2. Declare a supported capability.
    await request(app.getHttpServer())
      .post(`/v1/admin/providers/${providerId}/capabilities`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ capability: 'PLACE_DETAIL' })
      .expect(201);

    // 3. Configure an integration (sandbox, with a credential reference - never a real secret).
    const integrationRes = await request(app.getHttpServer())
      .post(`/v1/admin/providers/${providerId}/integrations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ environment: 'SANDBOX', credentialReference: 'E2E_FIXTURE_API_KEY_REF' })
      .expect(201);
    const integrationId = integrationRes.body.data.id as string;

    await request(app.getHttpServer())
      .patch(`/v1/admin/provider-integrations/${integrationId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'ACTIVE' })
      .expect(200);

    // 4. Enable the capability for our account (ENABLED_FOR_OUR_ACCOUNT, spec
    // section 7) - deliberately ungated by license state; this must succeed
    // even with zero licenses configured anywhere.
    await request(app.getHttpServer())
      .post(`/v1/admin/provider-integrations/${integrationId}/capabilities/PLACE_DETAIL/enable`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    // Try activation without an approved license - must be rejected with the
    // SPECIFIC license-missing code (not a misleading "not enabled" - the
    // capability IS enabled per the previous step), and must NOT write the
    // activation audit row.
    const activateBeforeLicense = await request(app.getHttpServer())
      .post(`/v1/admin/provider-integrations/${integrationId}/capabilities/PLACE_DETAIL/activate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
    expect(activateBeforeLicense.body.error.code).toBe('PROVIDER_LICENSE_NOT_FOUND');

    const auditCountBeforeSuccess = await prisma.auditLog.count({ where: { action: 'provider.integration.capability.activated', entityId: integrationId } });
    expect(auditCountBeforeSuccess).toBe(0);

    // 5. Create a license (DRAFT).
    const licenseRes = await request(app.getHttpServer())
      .post(`/v1/admin/providers/${providerId}/licenses`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ datasetOrProduct: 'Fixture place data', capability: 'PLACE_DETAIL', termsUrl: 'https://example.test/terms' })
      .expect(201);
    const licenseId = licenseRes.body.data.id as string;

    // Approving before rights are reviewed must be refused.
    await request(app.getHttpServer())
      .patch(`/v1/admin/provider-licenses/${licenseId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'APPROVED' })
      .expect(400);

    // 6. Set rights (display ALLOWED).
    await request(app.getHttpServer())
      .patch(`/v1/admin/provider-licenses/${licenseId}/rights`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        rightsDisplay: 'ALLOWED',
        rightsCache: 'ALLOWED',
        rightsStore: 'PROHIBITED',
        rightsModify: 'PROHIBITED',
        rightsRedistribute: 'PROHIBITED',
        rightsCommercialUse: 'ALLOWED',
        attributionRequirement: 'REQUIRED',
      })
      .expect(200);

    // Activation must still fail: attribution is REQUIRED but not yet configured.
    await request(app.getHttpServer())
      .patch(`/v1/admin/provider-licenses/${licenseId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'APPROVED' })
      .expect(200);
    const preAttributionCheck = await registry.getExecutionContext({ providerCode: code, environment: 'SANDBOX', capability: 'PLACE_DETAIL' });
    expect(preAttributionCheck.ok).toBe(false);
    if (!preAttributionCheck.ok) expect(preAttributionCheck.code).toBe('PROVIDER_ATTRIBUTION_REQUIRED');

    // 7. Configure required attribution.
    await request(app.getHttpServer())
      .post(`/v1/admin/providers/${providerId}/attribution-rules`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ licenseId, capability: 'PLACE_DETAIL', requirement: 'REQUIRED', displayText: 'Data (c) G02 E2E Fixture Provider' })
      .expect(201);

    // 8. Activate -> succeeds, atomically, with an audit row.
    const activateRes = await request(app.getHttpServer())
      .post(`/v1/admin/provider-integrations/${integrationId}/capabilities/PLACE_DETAIL/activate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    expect(activateRes.body.data.integration.lastVerifiedAt).toBeTruthy();
    expect(activateRes.body.data.context.providerCode).toBe(code);

    const auditRow = await prisma.auditLog.findFirst({ where: { action: 'provider.integration.capability.activated', entityId: integrationId } });
    expect(auditRow).not.toBeNull();
    expect(auditRow?.actorId).toBeTruthy();

    // 9. Obtain a provider execution context -> succeeds, carries no raw secret.
    const successContext = await registry.getExecutionContext({ providerCode: code, environment: 'SANDBOX', capability: 'PLACE_DETAIL' });
    expect(successContext.ok).toBe(true);
    if (successContext.ok) {
      expect(successContext.context.credentialReference).toBe('E2E_FIXTURE_API_KEY_REF');
      expect(JSON.stringify(successContext.context)).not.toMatch(/sk_live|AIza|secret_/i);
      expect(successContext.context.attribution.displayText).toBe('Data (c) G02 E2E Fixture Provider');
    }

    // 10. Revoke the license.
    await request(app.getHttpServer())
      .patch(`/v1/admin/provider-licenses/${licenseId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'REVOKED' })
      .expect(200);

    // 11. Execution context -> immediately rejected, with NOTHING re-configured on the integration side (proves nothing was cached).
    const postRevokeContext = await registry.getExecutionContext({ providerCode: code, environment: 'SANDBOX', capability: 'PLACE_DETAIL' });
    expect(postRevokeContext.ok).toBe(false);
    if (!postRevokeContext.ok) expect(postRevokeContext.code).toBe('PROVIDER_LICENSE_REVOKED');

    // N. Restore: create and approve a fresh replacement license (a REVOKED
    // license is terminal, not reactivatable - a new one is the correct
    // real-world path) so the remaining checks have a valid license again.
    const secondLicenseRes = await request(app.getHttpServer())
      .post(`/v1/admin/providers/${providerId}/licenses`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ datasetOrProduct: 'Fixture place data (renewed)', capability: 'PLACE_DETAIL', termsUrl: 'https://example.test/terms' })
      .expect(201);
    const secondLicenseId = secondLicenseRes.body.data.id as string;
    await request(app.getHttpServer())
      .patch(`/v1/admin/provider-licenses/${secondLicenseId}/rights`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ rightsDisplay: 'ALLOWED', rightsCache: 'ALLOWED', rightsStore: 'PROHIBITED', rightsModify: 'PROHIBITED', rightsRedistribute: 'PROHIBITED', rightsCommercialUse: 'ALLOWED', attributionRequirement: 'REQUIRED' })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/v1/admin/provider-licenses/${secondLicenseId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'APPROVED' })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/v1/admin/providers/${providerId}/attribution-rules`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ licenseId: secondLicenseId, capability: 'PLACE_DETAIL', requirement: 'REQUIRED', displayText: 'Data (c) G02 E2E Fixture Provider (renewed)' })
      .expect(201);

    const restoredContext = await registry.getExecutionContext({ providerCode: code, environment: 'SANDBOX', capability: 'PLACE_DETAIL' });
    expect(restoredContext.ok).toBe(true);

    // O. Suspend the integration -> execution must be blocked INDEPENDENTLY
    // of the (now valid, approved) license state - two separate controls.
    await request(app.getHttpServer())
      .patch(`/v1/admin/provider-integrations/${integrationId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'SUSPENDED' })
      .expect(200);

    const suspendedContext = await registry.getExecutionContext({ providerCode: code, environment: 'SANDBOX', capability: 'PLACE_DETAIL' });
    expect(suspendedContext.ok).toBe(false);
    if (!suspendedContext.ok) expect(suspendedContext.code).toBe('PROVIDER_INTEGRATION_SUSPENDED');
  }, 60000);

  it('rolls back the activation transaction atomically if the audit write fails - no orphaned enablement row (Phase 12.1 lesson applied to G02)', async () => {
    const stamp = Date.now();
    const adminToken = await registerAndLogin(`e2e-provider-admin2-${stamp}@dauviet.test`, ['USER', 'ADMIN']);
    const code = `${TEST_FIXTURE_PROVIDER_CODE}_TX_${stamp}`;

    const providerRes = await request(app.getHttpServer())
      .post('/v1/admin/providers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code, name: 'G02 E2E Tx Fixture Provider', credentialMode: 'NONE' })
      .expect(201);
    const providerId = providerRes.body.data.id as string;
    await request(app.getHttpServer()).patch(`/v1/admin/providers/${providerId}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'ACTIVE' }).expect(200);
    await request(app.getHttpServer()).post(`/v1/admin/providers/${providerId}/capabilities`).set('Authorization', `Bearer ${adminToken}`).send({ capability: 'PLACE_DETAIL' }).expect(201);
    const integrationRes = await request(app.getHttpServer())
      .post(`/v1/admin/providers/${providerId}/integrations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ environment: 'SANDBOX' })
      .expect(201);
    const integrationId = integrationRes.body.data.id as string;
    await request(app.getHttpServer()).patch(`/v1/admin/provider-integrations/${integrationId}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'ACTIVE' }).expect(200);
    const licenseRes = await request(app.getHttpServer())
      .post(`/v1/admin/providers/${providerId}/licenses`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ datasetOrProduct: 'Fixture data', capability: 'PLACE_DETAIL', termsUrl: 'https://example.test/terms' })
      .expect(201);
    const licenseId = licenseRes.body.data.id as string;
    await request(app.getHttpServer())
      .patch(`/v1/admin/provider-licenses/${licenseId}/rights`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ rightsDisplay: 'ALLOWED', rightsCache: 'ALLOWED', rightsStore: 'ALLOWED', rightsModify: 'ALLOWED', rightsRedistribute: 'ALLOWED', rightsCommercialUse: 'ALLOWED', attributionRequirement: 'NOT_REQUIRED' })
      .expect(200);
    await request(app.getHttpServer()).patch(`/v1/admin/provider-licenses/${licenseId}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'APPROVED' }).expect(200);
    await request(app.getHttpServer())
      .post(`/v1/admin/provider-integrations/${integrationId}/capabilities/PLACE_DETAIL/enable`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    // Real database rollback probe, mirroring contribution-catalogue.e2e-spec.ts's own pattern:
    // force a failure inside the SAME shape of transaction
    // ProviderIntegrationsService.activateCapability actually uses
    // (ProviderIntegration.update({lastVerifiedAt}) + audit.log(tx)) and
    // confirm neither survives.
    const beforeIntegration = await prisma.providerIntegration.findUniqueOrThrow({ where: { id: integrationId } });
    const actor = await prisma.user.findFirstOrThrow({ select: { id: true } });
    const audit = app.get(AuditService);
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.providerIntegration.update({ where: { id: integrationId }, data: { lastVerifiedAt: new Date() } });
        await audit.log({ actorId: actor.id, action: 'provider.integration.capability.activated', entityType: 'PROVIDER_INTEGRATION', entityId: integrationId }, tx);
        throw new Error('G02_QA_FORCED_ROLLBACK_PROBE');
      }),
    ).rejects.toThrow('G02_QA_FORCED_ROLLBACK_PROBE');

    const afterIntegration = await prisma.providerIntegration.findUniqueOrThrow({ where: { id: integrationId } });
    expect(afterIntegration.lastVerifiedAt).toEqual(beforeIntegration.lastVerifiedAt); // the mutation itself was rolled back
    const auditRow = await prisma.auditLog.findFirst({ where: { action: 'provider.integration.capability.activated', entityId: integrationId } });
    expect(auditRow).toBeNull(); // and so was its audit entry - not orphaned
  }, 60000);

  /**
   * G02 live-QA defect #2 regression: `ProviderRegistryService` used to
   * pre-filter its license query to `status: APPROVED`, which made a
   * DRAFT/TERMS_REVIEW/LEGAL_REVIEW/EXPIRED/REVOKED license invisible to
   * the evaluator entirely - every one of those states collapsed to the
   * generic `PROVIDER_LICENSE_NOT_FOUND` instead of its own specific code.
   * This test drives every lifecycle-status branch through the REAL
   * registry query path (not the pure evaluator directly) to prove the fix
   * holds against actual Postgres rows. Also covers the CONDITIONAL-fails-
   * closed correction.
   */
  it('the real registry (not just the pure evaluator) returns the correct lifecycle-specific code for every license status, and CONDITIONAL fails closed', async () => {
    const stamp = Date.now();
    const adminToken = await registerAndLogin(`e2e-provider-matrix-${stamp}@dauviet.test`, ['USER', 'ADMIN']);
    const code = `${TEST_FIXTURE_PROVIDER_CODE}_MATRIX_${stamp}`;

    const providerRes = await request(app.getHttpServer())
      .post('/v1/admin/providers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code, name: 'G02 E2E Matrix Fixture', credentialMode: 'NONE' })
      .expect(201);
    const providerId = providerRes.body.data.id as string;
    await request(app.getHttpServer()).patch(`/v1/admin/providers/${providerId}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'ACTIVE' }).expect(200);
    await request(app.getHttpServer()).post(`/v1/admin/providers/${providerId}/capabilities`).set('Authorization', `Bearer ${adminToken}`).send({ capability: 'PLACE_DETAIL' }).expect(201);
    const integrationRes = await request(app.getHttpServer())
      .post(`/v1/admin/providers/${providerId}/integrations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ environment: 'SANDBOX' })
      .expect(201);
    const integrationId = integrationRes.body.data.id as string;
    await request(app.getHttpServer()).patch(`/v1/admin/provider-integrations/${integrationId}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'ACTIVE' }).expect(200);
    await request(app.getHttpServer())
      .post(`/v1/admin/provider-integrations/${integrationId}/capabilities/PLACE_DETAIL/enable`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    async function check() {
      const res = await registry.getExecutionContext({ providerCode: code, environment: 'SANDBOX', capability: 'PLACE_DETAIL' });
      return res;
    }

    async function makeLicense(overrides: Record<string, unknown> = {}) {
      const res = await request(app.getHttpServer())
        .post(`/v1/admin/providers/${providerId}/licenses`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ datasetOrProduct: `Matrix fixture ${Date.now()}`, capability: 'PLACE_DETAIL', termsUrl: 'https://example.test/terms', ...overrides })
        .expect(201);
      return res.body.data.id as string;
    }

    // Each lettered state below creates its own license row for PLACE_DETAIL.
    // The registry picks the single MOST RELEVANT license when several
    // exist for the same capability (APPROVED preferred, most-recently-
    // updated as tie-break - see ProviderRegistryService.pickLicense) - so
    // a prior step's still-APPROVED-status license (e.g. H's not-yet-
    // effective one, or I's already-expired one) must be explicitly retired
    // before the next step's check, or it can win the tie-break instead of
    // the license actually under test. `retire` makes that state isolation
    // explicit rather than relying on incidental timestamp ordering.
    async function retire(id: string) {
      await request(app.getHttpServer()).patch(`/v1/admin/provider-licenses/${id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'REJECTED' }).expect(200);
    }

    // A. No license at all.
    let result = await check();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('PROVIDER_LICENSE_NOT_FOUND');

    // B. License DRAFT (created, never reviewed/approved).
    await makeLicense();
    result = await check();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('PROVIDER_LICENSE_NOT_APPROVED');

    // C. License TERMS_REVIEW.
    let licenseId = await makeLicense();
    await request(app.getHttpServer())
      .patch(`/v1/admin/provider-licenses/${licenseId}/rights`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ rightsDisplay: 'ALLOWED', rightsCache: 'ALLOWED', rightsStore: 'ALLOWED', rightsModify: 'ALLOWED', rightsRedistribute: 'ALLOWED', rightsCommercialUse: 'ALLOWED', attributionRequirement: 'NOT_REQUIRED' })
      .expect(200);
    await request(app.getHttpServer()).patch(`/v1/admin/provider-licenses/${licenseId}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'TERMS_REVIEW' }).expect(200);
    result = await check();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('PROVIDER_LICENSE_NOT_APPROVED');

    // D. License LEGAL_REVIEW (most recently updated of the three so far -> picked by the registry's tie-break).
    await request(app.getHttpServer()).patch(`/v1/admin/provider-licenses/${licenseId}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'LEGAL_REVIEW' }).expect(200);
    result = await check();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('PROVIDER_LICENSE_NOT_APPROVED');

    // E. APPROVED but right UNKNOWN. (Rights were left ALLOWED from step C/D's
    // setup, so approving alone would pass here - the point of this state is
    // specifically the UNKNOWN right, set explicitly below before checking.)
    await request(app.getHttpServer()).patch(`/v1/admin/provider-licenses/${licenseId}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'APPROVED' }).expect(200);
    await request(app.getHttpServer())
      .patch(`/v1/admin/provider-licenses/${licenseId}/rights`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ rightsDisplay: 'UNKNOWN', rightsCache: 'UNKNOWN', rightsStore: 'UNKNOWN', rightsModify: 'UNKNOWN', rightsRedistribute: 'UNKNOWN', rightsCommercialUse: 'UNKNOWN', attributionRequirement: 'NOT_REQUIRED' })
      .expect(200);
    result = await check();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('PROVIDER_USAGE_NOT_ALLOWED');

    // F. APPROVED but right PROHIBITED.
    await request(app.getHttpServer())
      .patch(`/v1/admin/provider-licenses/${licenseId}/rights`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ rightsDisplay: 'PROHIBITED', rightsCache: 'ALLOWED', rightsStore: 'ALLOWED', rightsModify: 'ALLOWED', rightsRedistribute: 'ALLOWED', rightsCommercialUse: 'ALLOWED', attributionRequirement: 'NOT_REQUIRED' })
      .expect(200);
    result = await check();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('PROVIDER_USAGE_NOT_ALLOWED');

    // G. APPROVED but right CONDITIONAL - must fail closed (no condition evaluator in G02).
    await request(app.getHttpServer())
      .patch(`/v1/admin/provider-licenses/${licenseId}/rights`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ rightsDisplay: 'CONDITIONAL', rightsCache: 'ALLOWED', rightsStore: 'ALLOWED', rightsModify: 'ALLOWED', rightsRedistribute: 'ALLOWED', rightsCommercialUse: 'ALLOWED', conditionalNotes: 'requires manual legal sign-off', attributionRequirement: 'NOT_REQUIRED' })
      .expect(200);
    result = await check();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('PROVIDER_USAGE_NOT_ALLOWED');
    await retire(licenseId); // clear the board before the next isolated state

    // H. APPROVED, right ALLOWED, but effectiveFrom in the future.
    licenseId = await makeLicense({ effectiveFrom: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() });
    await request(app.getHttpServer())
      .patch(`/v1/admin/provider-licenses/${licenseId}/rights`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ rightsDisplay: 'ALLOWED', rightsCache: 'ALLOWED', rightsStore: 'ALLOWED', rightsModify: 'ALLOWED', rightsRedistribute: 'ALLOWED', rightsCommercialUse: 'ALLOWED', attributionRequirement: 'NOT_REQUIRED' })
      .expect(200);
    await request(app.getHttpServer()).patch(`/v1/admin/provider-licenses/${licenseId}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'APPROVED' }).expect(200);
    result = await check();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('PROVIDER_LICENSE_NOT_APPROVED');
    await retire(licenseId);

    // I. APPROVED, right ALLOWED, but effectiveUntil in the past - real DB-backed expiry check (not the pure evaluator).
    licenseId = await makeLicense({ effectiveUntil: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() });
    await request(app.getHttpServer())
      .patch(`/v1/admin/provider-licenses/${licenseId}/rights`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ rightsDisplay: 'ALLOWED', rightsCache: 'ALLOWED', rightsStore: 'ALLOWED', rightsModify: 'ALLOWED', rightsRedistribute: 'ALLOWED', rightsCommercialUse: 'ALLOWED', attributionRequirement: 'NOT_REQUIRED' })
      .expect(200);
    await request(app.getHttpServer()).patch(`/v1/admin/provider-licenses/${licenseId}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'APPROVED' }).expect(200);
    result = await check();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('PROVIDER_LICENSE_EXPIRED');
    await retire(licenseId);

    // J. A currently-valid license, then REVOKED - must produce the SPECIFIC revoked code, not "not found" (the exact live-QA defect #2 regression).
    licenseId = await makeLicense();
    await request(app.getHttpServer())
      .patch(`/v1/admin/provider-licenses/${licenseId}/rights`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ rightsDisplay: 'ALLOWED', rightsCache: 'ALLOWED', rightsStore: 'ALLOWED', rightsModify: 'ALLOWED', rightsRedistribute: 'ALLOWED', rightsCommercialUse: 'ALLOWED', attributionRequirement: 'NOT_REQUIRED' })
      .expect(200);
    await request(app.getHttpServer()).patch(`/v1/admin/provider-licenses/${licenseId}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'APPROVED' }).expect(200);
    result = await check();
    expect(result.ok).toBe(true); // valid at this point
    await request(app.getHttpServer()).patch(`/v1/admin/provider-licenses/${licenseId}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'REVOKED' }).expect(200);
    result = await check();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('PROVIDER_LICENSE_REVOKED');

    // K. Restore a valid license, then required attribution missing.
    licenseId = await makeLicense();
    await request(app.getHttpServer())
      .patch(`/v1/admin/provider-licenses/${licenseId}/rights`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ rightsDisplay: 'ALLOWED', rightsCache: 'ALLOWED', rightsStore: 'ALLOWED', rightsModify: 'ALLOWED', rightsRedistribute: 'ALLOWED', rightsCommercialUse: 'ALLOWED', attributionRequirement: 'REQUIRED' })
      .expect(200);
    await request(app.getHttpServer()).patch(`/v1/admin/provider-licenses/${licenseId}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'APPROVED' }).expect(200);
    result = await check();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('PROVIDER_ATTRIBUTION_REQUIRED');

    await request(app.getHttpServer())
      .post(`/v1/admin/providers/${providerId}/attribution-rules`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ licenseId, capability: 'PLACE_DETAIL', requirement: 'REQUIRED', displayText: 'Matrix fixture attribution' })
      .expect(201);

    // P. Fully valid state.
    result = await check();
    expect(result.ok).toBe(true);

    // L. Provider SUSPENDED blocks even though the license above is valid.
    await request(app.getHttpServer()).patch(`/v1/admin/providers/${providerId}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'SUSPENDED' }).expect(200);
    result = await check();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('PROVIDER_NOT_ACTIVE');
    await request(app.getHttpServer()).patch(`/v1/admin/providers/${providerId}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'ACTIVE' }).expect(200);

    // M. Integration SUSPENDED blocks independently too.
    await request(app.getHttpServer()).patch(`/v1/admin/provider-integrations/${integrationId}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'SUSPENDED' }).expect(200);
    result = await check();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('PROVIDER_INTEGRATION_SUSPENDED');
    await request(app.getHttpServer()).patch(`/v1/admin/provider-integrations/${integrationId}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'ACTIVE' }).expect(200);

    // Confirm restored to valid once both are ACTIVE again.
    result = await check();
    expect(result.ok).toBe(true);

    // N. A technically-unsupported capability.
    const unsupported = await registry.getExecutionContext({ providerCode: code, environment: 'SANDBOX', capability: 'FLIGHT_SEARCH' });
    expect(unsupported.ok).toBe(false);
    if (!unsupported.ok) expect(unsupported.code).toBe('PROVIDER_CAPABILITY_UNSUPPORTED');

    // O. Supported but never enabled for this integration.
    await request(app.getHttpServer()).post(`/v1/admin/providers/${providerId}/capabilities`).set('Authorization', `Bearer ${adminToken}`).send({ capability: 'REVIEWS' }).expect(201);
    const notEnabled = await registry.getExecutionContext({ providerCode: code, environment: 'SANDBOX', capability: 'REVIEWS' });
    expect(notEnabled.ok).toBe(false);
    if (!notEnabled.ok) expect(notEnabled.code).toBe('PROVIDER_CAPABILITY_NOT_ENABLED');
  }, 90000);
});
