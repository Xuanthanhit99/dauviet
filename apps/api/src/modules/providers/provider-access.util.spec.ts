import { evaluateProviderAccess, EvaluateProviderAccessInput } from './provider-access.util';
import { PROVIDER_ERROR_CODES } from '../../common/errors/provider-error-codes';

/**
 * G02 spec section 55 (LICENSE/ATTRIBUTION/RETENTION/ACTIVATION coverage).
 * Pure-function tests - no Prisma/DB mocking needed, mirroring
 * `story-body.util.spec.ts`'s approach for trust-critical validation logic.
 */
describe('evaluateProviderAccess', () => {
  const NOW = new Date('2026-09-07T00:00:00.000Z');

  function baseInput(overrides: Partial<EvaluateProviderAccessInput> = {}): EvaluateProviderAccessInput {
    return {
      now: NOW,
      usage: 'display',
      requestedCapability: 'PLACE_DETAIL',
      provider: { id: 'prov-1', code: 'TEST_PROVIDER', status: 'ACTIVE', credentialMode: 'API_KEY' },
      capabilitySupported: true,
      integration: { id: 'integ-1', status: 'ACTIVE', credentialReference: 'TEST_PROVIDER_API_KEY' },
      integrationCapability: { approvedAt: new Date('2026-09-01T00:00:00.000Z') },
      license: {
        id: 'lic-1',
        status: 'APPROVED',
        rightsDisplay: 'ALLOWED',
        rightsCache: 'ALLOWED',
        rightsStore: 'UNKNOWN',
        rightsModify: 'PROHIBITED',
        rightsRedistribute: 'PROHIBITED',
        rightsCommercialUse: 'ALLOWED',
        conditionalNotes: null,
        attributionRequirement: 'NOT_REQUIRED',
        effectiveFrom: null,
        effectiveUntil: null,
      },
      dataPolicy: { cacheAllowed: 'ALLOWED', maxCacheSeconds: 3600, storeIdentityAllowed: 'ALLOWED', storeContentAllowed: 'UNKNOWN', persistentIdentifierAllowed: 'ALLOWED' },
      attributionRule: null,
      ...overrides,
    };
  }

  it('PROVIDER_NOT_FOUND when no provider row', () => {
    const result = evaluateProviderAccess(baseInput({ provider: null }));
    expect(result).toEqual(expect.objectContaining({ ok: false, code: PROVIDER_ERROR_CODES.PROVIDER_NOT_FOUND }));
  });

  it('PROVIDER_NOT_ACTIVE when provider status is DRAFT/SUSPENDED/etc', () => {
    const result = evaluateProviderAccess(baseInput({ provider: { id: 'p', code: 'X', status: 'DRAFT', credentialMode: 'NONE' } }));
    expect(result).toEqual(expect.objectContaining({ ok: false, code: PROVIDER_ERROR_CODES.PROVIDER_NOT_ACTIVE }));
  });

  it('PROVIDER_CAPABILITY_UNSUPPORTED when the provider never declared this capability', () => {
    const result = evaluateProviderAccess(baseInput({ capabilitySupported: false }));
    expect(result).toEqual(expect.objectContaining({ ok: false, code: PROVIDER_ERROR_CODES.PROVIDER_CAPABILITY_UNSUPPORTED }));
  });

  it('PROVIDER_INTEGRATION_NOT_CONFIGURED when no integration exists', () => {
    const result = evaluateProviderAccess(baseInput({ integration: null }));
    expect(result).toEqual(expect.objectContaining({ ok: false, code: PROVIDER_ERROR_CODES.PROVIDER_INTEGRATION_NOT_CONFIGURED }));
  });

  it('PROVIDER_INTEGRATION_NOT_CONFIGURED when integration status is PENDING_APPROVAL', () => {
    const result = evaluateProviderAccess(baseInput({ integration: { id: 'i', status: 'PENDING_APPROVAL', credentialReference: null } }));
    expect(result).toEqual(expect.objectContaining({ ok: false, code: PROVIDER_ERROR_CODES.PROVIDER_INTEGRATION_NOT_CONFIGURED }));
  });

  it('PROVIDER_INTEGRATION_SUSPENDED when integration status is SUSPENDED/FAILED/REVOKED', () => {
    for (const status of ['SUSPENDED', 'FAILED', 'REVOKED'] as const) {
      const result = evaluateProviderAccess(baseInput({ integration: { id: 'i', status, credentialReference: 'X' } }));
      expect(result).toEqual(expect.objectContaining({ ok: false, code: PROVIDER_ERROR_CODES.PROVIDER_INTEGRATION_SUSPENDED }));
    }
  });

  it('PROVIDER_CREDENTIALS_MISSING when credentialMode requires a reference and none is configured', () => {
    const result = evaluateProviderAccess(baseInput({ integration: { id: 'i', status: 'ACTIVE', credentialReference: null } }));
    expect(result).toEqual(expect.objectContaining({ ok: false, code: PROVIDER_ERROR_CODES.PROVIDER_CREDENTIALS_MISSING }));
  });

  it('does not require a credentialReference when the provider credentialMode is NONE', () => {
    const result = evaluateProviderAccess(
      baseInput({
        provider: { id: 'p', code: 'X', status: 'ACTIVE', credentialMode: 'NONE' },
        integration: { id: 'i', status: 'ACTIVE', credentialReference: null },
      }),
    );
    expect(result.ok).toBe(true);
  });

  it('PROVIDER_CAPABILITY_NOT_ENABLED when the account has not approved this capability', () => {
    const result = evaluateProviderAccess(baseInput({ integrationCapability: null }));
    expect(result).toEqual(expect.objectContaining({ ok: false, code: PROVIDER_ERROR_CODES.PROVIDER_CAPABILITY_NOT_ENABLED }));
  });

  it('PROVIDER_CAPABILITY_NOT_ENABLED when the row exists but was never actually approved (approvedAt null)', () => {
    const result = evaluateProviderAccess(baseInput({ integrationCapability: { approvedAt: null } }));
    expect(result).toEqual(expect.objectContaining({ ok: false, code: PROVIDER_ERROR_CODES.PROVIDER_CAPABILITY_NOT_ENABLED }));
  });

  it('PROVIDER_LICENSE_NOT_FOUND when no applicable license exists', () => {
    const result = evaluateProviderAccess(baseInput({ license: null }));
    expect(result).toEqual(expect.objectContaining({ ok: false, code: PROVIDER_ERROR_CODES.PROVIDER_LICENSE_NOT_FOUND }));
  });

  it('a DRAFT license cannot serve', () => {
    const result = evaluateProviderAccess(baseInput({ license: { ...baseInput().license!, status: 'DRAFT' } }));
    expect(result).toEqual(expect.objectContaining({ ok: false, code: PROVIDER_ERROR_CODES.PROVIDER_LICENSE_NOT_APPROVED }));
  });

  it('a REVOKED license blocks with a specific code, not the generic not-approved one', () => {
    const result = evaluateProviderAccess(baseInput({ license: { ...baseInput().license!, status: 'REVOKED' } }));
    expect(result).toEqual(expect.objectContaining({ ok: false, code: PROVIDER_ERROR_CODES.PROVIDER_LICENSE_REVOKED }));
  });

  it('an EXPIRED license (by status) blocks with a specific code', () => {
    const result = evaluateProviderAccess(baseInput({ license: { ...baseInput().license!, status: 'EXPIRED' } }));
    expect(result).toEqual(expect.objectContaining({ ok: false, code: PROVIDER_ERROR_CODES.PROVIDER_LICENSE_EXPIRED }));
  });

  it('an APPROVED license past its effectiveUntil date fails closed at runtime even though status column still says APPROVED (spec section 42 - no scheduler required)', () => {
    const result = evaluateProviderAccess(
      baseInput({ license: { ...baseInput().license!, status: 'APPROVED', effectiveUntil: new Date('2026-01-01T00:00:00.000Z') } }),
    );
    expect(result).toEqual(expect.objectContaining({ ok: false, code: PROVIDER_ERROR_CODES.PROVIDER_LICENSE_EXPIRED }));
  });

  it('an APPROVED license not yet within its effectiveFrom window fails closed', () => {
    const result = evaluateProviderAccess(
      baseInput({ license: { ...baseInput().license!, status: 'APPROVED', effectiveFrom: new Date('2030-01-01T00:00:00.000Z') } }),
    );
    expect(result).toEqual(expect.objectContaining({ ok: false, code: PROVIDER_ERROR_CODES.PROVIDER_LICENSE_NOT_APPROVED }));
  });

  it('UNKNOWN rights fail closed (spec section 20 - UNKNOWN must never silently pass)', () => {
    const result = evaluateProviderAccess(
      baseInput({ usage: 'store' }), // rightsStore is UNKNOWN in the base fixture
    );
    expect(result).toEqual(expect.objectContaining({ ok: false, code: PROVIDER_ERROR_CODES.PROVIDER_USAGE_NOT_ALLOWED }));
  });

  it('PROHIBITED rights block (spec section 55)', () => {
    const result = evaluateProviderAccess(baseInput({ usage: 'modify' }));
    expect(result).toEqual(expect.objectContaining({ ok: false, code: PROVIDER_ERROR_CODES.PROVIDER_USAGE_NOT_ALLOWED }));
  });

  it('ALLOWED + APPROVED serves successfully and returns a full execution context', () => {
    const result = evaluateProviderAccess(baseInput());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.context.providerCode).toBe('TEST_PROVIDER');
      expect(result.context.policy.display).toBe('ALLOWED');
      expect(result.context.credentialReference).toBe('TEST_PROVIDER_API_KEY');
    }
  });

  it('CONDITIONAL fails closed - G02 has no machine-evaluable condition checker, so it is never silently treated as ALLOWED (corrected during live QA)', () => {
    const result = evaluateProviderAccess(
      baseInput({ license: { ...baseInput().license!, rightsDisplay: 'CONDITIONAL', conditionalNotes: 'Attribution logo must be >= 24px.' } }),
    );
    expect(result).toEqual(expect.objectContaining({ ok: false, code: PROVIDER_ERROR_CODES.PROVIDER_USAGE_NOT_ALLOWED }));
    if (!result.ok) {
      expect(result.message).toContain('Attribution logo must be >= 24px.');
    }
  });

  it('PROVIDER_ATTRIBUTION_REQUIRED when attribution is REQUIRED but no rule/displayText is configured', () => {
    const result = evaluateProviderAccess(
      baseInput({ license: { ...baseInput().license!, attributionRequirement: 'REQUIRED' }, attributionRule: null }),
    );
    expect(result).toEqual(expect.objectContaining({ ok: false, code: PROVIDER_ERROR_CODES.PROVIDER_ATTRIBUTION_REQUIRED }));
  });

  it('attribution UNKNOWN also fails closed, same as REQUIRED, until a rule is configured', () => {
    const result = evaluateProviderAccess(
      baseInput({ license: { ...baseInput().license!, attributionRequirement: 'UNKNOWN' }, attributionRule: null }),
    );
    expect(result).toEqual(expect.objectContaining({ ok: false, code: PROVIDER_ERROR_CODES.PROVIDER_ATTRIBUTION_REQUIRED }));
  });

  it('a configured attribution rule with displayText satisfies a REQUIRED attribution requirement', () => {
    const result = evaluateProviderAccess(
      baseInput({
        license: { ...baseInput().license!, attributionRequirement: 'REQUIRED' },
        attributionRule: { requirement: 'REQUIRED', displayText: 'Data © Test Provider', logoRequired: false, linkUrl: null },
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.context.attribution.displayText).toBe('Data © Test Provider');
    }
  });

  it('resolves cache/store policy from ProviderDataPolicy, falling back to UNKNOWN when no policy row exists (fail-closed default, never assumes permission)', () => {
    const result = evaluateProviderAccess(baseInput({ dataPolicy: null }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.context.policy.cache).toBe('UNKNOWN');
      expect(result.context.policy.maxCacheSeconds).toBeNull();
      expect(result.context.policy.storeIdentity).toBe('UNKNOWN');
    }
  });
});
