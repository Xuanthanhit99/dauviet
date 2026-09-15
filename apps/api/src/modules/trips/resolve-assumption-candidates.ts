import { CostAssumptionScope, CostCategory } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AssumptionCandidate } from './cost-engine/types';

export interface AssumptionScopeContext {
  destinationId?: string | null;
  cityId?: string | null;
  regionId?: string | null;
  countryId?: string | null;
}

/**
 * Resolves the eligible `CostAssumption` candidates for one category/date,
 * already ordered most-specific-first (DESTINATION > CITY > REGION > COUNTRY
 * > GLOBAL - spec section 33/79) for `resolveComponent` (cost-engine/
 * resolve-component.ts) to consume unchanged - this is the DB-touching half
 * of precedence resolution; the pure half (picking `[0]` and applying the
 * unit multiplier) stays in the cost-engine directory with no Prisma
 * dependency, per its own purity doc comment (spec section 101).
 *
 * Only `ACTIVE` assumptions are eligible, and only ones whose effective
 * window actually covers `tripDate` (spec section 98: "Assumption selection
 * should consider trip dates... not always use newest row regardless of
 * travel date"): `effectiveFrom <= tripDate < (effectiveTo ?? +infinity)`.
 * Within one scope level, the newest `effectiveFrom` wins, then the highest
 * `version` (spec section 33 tie-break) - at most one candidate is returned
 * per scope level; if an admin ever leaves two equally-new ACTIVE rows at
 * the same scope/category (e.g. different units), this picks one
 * deterministically rather than returning both, since `resolveComponent`
 * only ever consumes `candidates[0]`.
 */
export async function resolveAssumptionCandidates(
  prisma: PrismaService,
  category: CostCategory,
  tripDate: string,
  scopeContext: AssumptionScopeContext,
): Promise<AssumptionCandidate[]> {
  const date = new Date(tripDate);
  const scopeLevels: { scope: CostAssumptionScope; scopeId: string | null | undefined }[] = [
    { scope: 'DESTINATION', scopeId: scopeContext.destinationId },
    { scope: 'CITY', scopeId: scopeContext.cityId },
    { scope: 'REGION', scopeId: scopeContext.regionId },
    { scope: 'COUNTRY', scopeId: scopeContext.countryId },
    { scope: 'GLOBAL', scopeId: null },
  ];

  const results = await Promise.all(
    scopeLevels.map(async ({ scope, scopeId }) => {
      if (scope !== 'GLOBAL' && !scopeId) return null;
      const row = await prisma.costAssumption.findFirst({
        where: {
          scope,
          scopeId: scope === 'GLOBAL' ? null : scopeId,
          category,
          status: 'ACTIVE',
          effectiveFrom: { lte: date },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: date } }],
        },
        orderBy: [{ effectiveFrom: 'desc' }, { version: 'desc' }],
      });
      return row;
    }),
  );

  return results.filter((row): row is NonNullable<typeof row> => row !== null);
}
