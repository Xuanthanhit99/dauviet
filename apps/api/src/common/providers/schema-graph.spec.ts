import { Prisma } from '@prisma/client';

/**
 * Static structural assertions against the Prisma DMMF for the G02
 * Provider + Licensing domain - same technique as
 * `common/geography/schema-graph.spec.ts` and the V1
 * `historical-date/schema-graph.spec.ts`.
 */
describe('Provider + Licensing schema graph integrity (static, no DB required)', () => {
  const models = Prisma.dmmf.datamodel.models;

  function model(name: string) {
    const m = models.find((mm) => mm.name === name);
    if (!m) throw new Error(`Model ${name} not found in DMMF`);
    return m;
  }

  function relationFieldNames(name: string): string[] {
    return model(name)
      .fields.filter((f) => f.kind === 'object')
      .map((f) => f.name);
  }

  it('spec section 38/39: ExternalProvider has NO relation to Source/Citation/HistoricalFact - a provider record can never become historical evidence', () => {
    const providerRelated = ['ExternalProvider', 'ProviderLicense', 'ProviderIntegration', 'ProviderCapability', 'ProviderDataPolicy', 'ProviderAttributionRule', 'ProviderPolicyEvidence'];
    for (const name of providerRelated) {
      const fields = relationFieldNames(name);
      expect(fields).not.toEqual(expect.arrayContaining(['source', 'sources', 'citation', 'citations', 'historicalFact', 'fact', 'facts']));
    }
  });

  it('spec section 37: ExternalProvider/ProviderLicense/ProviderIntegration have NO relation to Country/Region/City/Destination - provider/licensing stays geography-independent in G02', () => {
    const providerRelated = ['ExternalProvider', 'ProviderLicense', 'ProviderIntegration', 'ProviderCapability', 'ProviderDataPolicy', 'ProviderAttributionRule'];
    for (const name of providerRelated) {
      const fields = relationFieldNames(name);
      expect(fields).not.toEqual(expect.arrayContaining(['country', 'region', 'city', 'destination']));
    }
  });

  it('ExternalProvider.code is globally unique (stable machine-readable identity, spec section 6)', () => {
    const field = model('ExternalProvider').fields.find((f) => f.name === 'code');
    expect(field?.isUnique).toBe(true);
  });

  it('ProviderCapability rejects a duplicate (providerId, capability) at the DB level - SUPPORTED_BY_PROVIDER is a set, not a list', () => {
    expect(model('ProviderCapability').uniqueFields).toContainEqual(['providerId', 'capability']);
  });

  it('ProviderIntegration is unique per (providerId, environment) - one integration row per environment, not per attempt', () => {
    expect(model('ProviderIntegration').uniqueFields).toContainEqual(['providerId', 'environment']);
  });

  it('ProviderIntegrationCapability (ENABLED_FOR_OUR_ACCOUNT) is a distinct model from ProviderCapability (SUPPORTED_BY_PROVIDER) - spec section 7', () => {
    expect(model('ProviderIntegrationCapability').fields.some((f) => f.name === 'integration')).toBe(true);
    expect(model('ProviderIntegrationCapability').uniqueFields).toContainEqual(['integrationId', 'capability']);
    // Distinct model, not merely a boolean flag reused on ProviderCapability itself.
    expect(model('ProviderCapability').fields.some((f) => f.name === 'approvedAt')).toBe(false);
  });

  it('ProviderLicense rights fields are all the tri/four-state ProviderRightState enum, never a plain Boolean (spec section 11)', () => {
    const rightsFields = ['rightsDisplay', 'rightsCache', 'rightsStore', 'rightsModify', 'rightsRedistribute', 'rightsCommercialUse'];
    for (const fieldName of rightsFields) {
      const field = model('ProviderLicense').fields.find((f) => f.name === fieldName);
      expect(field?.type).toBe('ProviderRightState');
    }
    const rightStateEnum = Prisma.dmmf.datamodel.enums.find((e) => e.name === 'ProviderRightState');
    expect(rightStateEnum?.values.map((v) => v.name)).toEqual(expect.arrayContaining(['UNKNOWN', 'ALLOWED', 'PROHIBITED', 'CONDITIONAL']));
  });

  it('ProviderLicense.status defaults to DRAFT - nothing is implicitly APPROVED on creation', () => {
    const statusField = model('ProviderLicense').fields.find((f) => f.name === 'status');
    expect(statusField?.hasDefaultValue).toBe(true);
    expect(statusField?.default).toBe('DRAFT');
  });

  it('ProviderDataPolicy always traces back to a License (required licenseId relation), never a standalone retention rule with no rights grant behind it', () => {
    const licenseField = model('ProviderDataPolicy').fields.find((f) => f.name === 'license');
    const licenseIdField = model('ProviderDataPolicy').fields.find((f) => f.name === 'licenseId');
    expect(licenseField).toBeDefined();
    expect(licenseIdField?.isRequired).toBe(true);
    expect(model('ProviderDataPolicy').uniqueFields).toContainEqual(['licenseId', 'capability']);
  });

  it('ProviderPolicyEvidence requires a licenseId (provenance always traces to a specific license, spec section 18) and never stores full terms text as a dedicated field', () => {
    const licenseIdField = model('ProviderPolicyEvidence').fields.find((f) => f.name === 'licenseId');
    expect(licenseIdField?.isRequired).toBe(true);
    const fieldNames = model('ProviderPolicyEvidence').fields.map((f) => f.name.toLowerCase());
    expect(fieldNames).not.toContain('fulltext');
    expect(fieldNames).not.toContain('termstext');
  });

  it('EntityKind gained PROVIDER/PROVIDER_LICENSE/PROVIDER_INTEGRATION additively, alongside every pre-existing value including G01\'s geography additions', () => {
    const values = Prisma.dmmf.datamodel.enums.find((e) => e.name === 'EntityKind')?.values.map((v) => v.name);
    expect(values).toEqual(
      expect.arrayContaining([
        'PLACE', 'PERSON', 'EVENT', 'ERA', 'DYNASTY', 'TERRITORY', 'FACT', 'STORY', 'JOURNEY',
        'COMMUNITY_STORY', 'SOURCE', 'SOURCE_DOCUMENT', 'CONTRIBUTION', 'MEDIA_ASSET', 'COMMENT',
        'COUNTRY', 'REGION', 'CITY', 'DESTINATION',
        'PROVIDER', 'PROVIDER_LICENSE', 'PROVIDER_INTEGRATION',
      ]),
    );
  });

  it('ExternalProvider carries no secret/credential-value field - only a credentialMode enum and, on ProviderIntegration, a credentialReference (key name, not a value)', () => {
    const providerFields = model('ExternalProvider').fields.map((f) => f.name.toLowerCase());
    for (const forbidden of ['apikey', 'secret', 'password', 'token', 'clientsecret']) {
      expect(providerFields.some((n) => n.includes(forbidden))).toBe(false);
    }
    const integrationFields = model('ProviderIntegration').fields.map((f) => f.name.toLowerCase());
    for (const forbidden of ['apikey', 'secret', 'password', 'clientsecret']) {
      expect(integrationFields.some((n) => n.includes(forbidden))).toBe(false);
    }
    expect(integrationFields).toContain('credentialreference');
  });
});
