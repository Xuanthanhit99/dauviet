import { Injectable } from '@nestjs/common';
import { ProviderCapabilityType, ProviderEnvironment } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { evaluateProviderAccess, ProviderAccessResult, AttributionRuleRow, LicenseRow } from './provider-access.util';
import { ProviderUsageIntent } from './provider-access.types';

/**
 * The ONLY safe path future G05 provider services should use to obtain a
 * `ProviderExecutionContext` (spec sections 27/46) - it is impossible to
 * bypass licensing through this path, since every field the gate needs is
 * re-fetched and re-evaluated on every call (spec sections 20/42/43): a
 * license revocation takes effect on the very next call, with nothing
 * cached and nothing to invalidate.
 */
@Injectable()
export class ProviderRegistryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Picks the single most relevant license among ALL of the provider's
   * licenses applicable to this capability - deliberately not pre-filtered
   * to `status: APPROVED` in the query (see the fetch below). Preference
   * order: exact capability match beats a dataset-wide (capability: null)
   * license; within the same specificity, an APPROVED license always beats
   * a non-approved one (so a valid replacement license is chosen over an
   * old revoked one for the same capability); ties broken by most
   * recently updated.
   *
   * Found via live QA: an earlier version of this query filtered
   * `status: 'APPROVED'` directly in SQL, which meant a DRAFT/TERMS_REVIEW/
   * LEGAL_REVIEW/EXPIRED/REVOKED license was invisible to this method
   * entirely - `evaluateProviderAccess` always saw `license: null` and
   * returned the generic `PROVIDER_LICENSE_NOT_FOUND`, never the specific
   * `PROVIDER_LICENSE_REVOKED`/`_EXPIRED`/`_NOT_APPROVED` codes those
   * branches exist for (confirmed live: revoking an active license
   * produced `PROVIDER_LICENSE_NOT_FOUND` instead of the expected
   * `PROVIDER_LICENSE_REVOKED`). Fixed by fetching every license
   * regardless of status and letting the pure evaluator's own status
   * checks - already correct and unit-tested - actually run.
   */
  private pickLicense(
    licenses: (LicenseRow & { capability: ProviderCapabilityType | null; status: string; updatedAt: Date })[],
    requestedCapability: ProviderCapabilityType,
  ): LicenseRow | null {
    const scored = licenses
      .map((l) => ({
        license: l,
        specificity: l.capability === requestedCapability ? 1 : 0,
        approved: l.status === 'APPROVED' ? 1 : 0,
      }))
      .filter((s) => s.specificity === 1 || s.license.capability === null)
      .sort((a, b) => b.specificity - a.specificity || b.approved - a.approved || b.license.updatedAt.getTime() - a.license.updatedAt.getTime());
    return scored[0]?.license ?? null;
  }

  /** Picks the most specific applicable attribution rule for the (optional) matched license + requested capability. */
  private pickAttributionRule<T extends AttributionRuleRow & { licenseId: string | null; capability: ProviderCapabilityType | null }>(
    rules: T[],
    licenseId: string | null,
    requestedCapability: ProviderCapabilityType,
  ): T | null {
    const applicable = rules.filter((r) => !r.licenseId || r.licenseId === licenseId);
    const scored = applicable
      .map((rule) => {
        let score = 0;
        if (rule.licenseId && rule.licenseId === licenseId) score += 2;
        if (rule.capability === requestedCapability) score += 1;
        return { rule, score };
      })
      .sort((a, b) => b.score - a.score);
    return scored[0]?.rule ?? null;
  }

  async getExecutionContext(params: {
    providerCode: string;
    environment: ProviderEnvironment;
    capability: ProviderCapabilityType;
    usage?: ProviderUsageIntent;
  }): Promise<ProviderAccessResult> {
    const { providerCode, environment, capability, usage = 'display' } = params;

    const provider = await this.prisma.externalProvider.findUnique({ where: { code: providerCode } });
    const capabilityRow = provider
      ? await this.prisma.providerCapability.findUnique({ where: { providerId_capability: { providerId: provider.id, capability } } })
      : null;
    const integration = provider
      ? await this.prisma.providerIntegration.findUnique({ where: { providerId_environment: { providerId: provider.id, environment } } })
      : null;
    const integrationCapability = integration
      ? await this.prisma.providerIntegrationCapability.findUnique({
          where: { integrationId_capability: { integrationId: integration.id, capability } },
        })
      : null;

    const licenses = provider
      ? await this.prisma.providerLicense.findMany({
          where: { providerId: provider.id, OR: [{ capability }, { capability: null }] },
        })
      : [];
    const license = this.pickLicense(licenses, capability);

    const dataPolicy = license
      ? await this.prisma.providerDataPolicy.findUnique({ where: { licenseId_capability: { licenseId: license.id, capability } } })
      : null;

    const attributionRules = provider ? await this.prisma.providerAttributionRule.findMany({ where: { providerId: provider.id } }) : [];
    const attributionRule = this.pickAttributionRule(attributionRules, license?.id ?? null, capability);

    return evaluateProviderAccess({
      now: new Date(),
      usage,
      requestedCapability: capability,
      provider: provider ? { id: provider.id, code: provider.code, status: provider.status, credentialMode: provider.credentialMode } : null,
      capabilitySupported: Boolean(capabilityRow),
      integration: integration ? { id: integration.id, status: integration.status, credentialReference: integration.credentialReference } : null,
      integrationCapability: integrationCapability ? { approvedAt: integrationCapability.approvedAt } : null,
      license,
      dataPolicy,
      attributionRule,
    });
  }
}
