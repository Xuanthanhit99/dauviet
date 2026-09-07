import { BadRequestException, NotFoundException } from '@nestjs/common';
import { GEOGRAPHY_ERROR_CODES } from '../errors/geography-error-codes';

/**
 * Shared hierarchy-consistency checks for the G01 Global Geography domain
 * (spec section 30). Pure/small on purpose - each Regions/Cities/
 * Destinations service calls these after its own existence lookups rather
 * than duplicating the same cross-entity assertions three times.
 */

interface HasCountryId {
  id: string;
  countryId: string;
}

/** Throws GEOGRAPHY_COUNTRY_MISMATCH if `parent`'s country differs from `countryId`. */
export function assertSameCountry(
  parent: HasCountryId,
  countryId: string,
  message: string,
): void {
  if (parent.countryId !== countryId) {
    throw new BadRequestException({ code: GEOGRAPHY_ERROR_CODES.GEOGRAPHY_COUNTRY_MISMATCH, message });
  }
}

/**
 * Walks a Region's parent chain to reject a cycle before it can be written
 * (spec section 7/30) - a region can never become its own ancestor.
 * `regionId` is undefined when creating a brand-new region (nothing to
 * cycle back to yet, only existence of `candidateParentId` matters).
 */
export async function assertNoRegionParentCycle(
  findParent: (id: string) => Promise<{ id: string; parentRegionId: string | null } | null>,
  regionId: string | undefined,
  candidateParentId: string,
): Promise<void> {
  const MAX_DEPTH = 50;
  let currentId: string | null = candidateParentId;
  for (let depth = 0; depth < MAX_DEPTH; depth += 1) {
    if (currentId === null) return;
    if (regionId != null && currentId === regionId) {
      throw new BadRequestException({
        code: GEOGRAPHY_ERROR_CODES.REGION_PARENT_CYCLE,
        message: 'A region cannot be its own ancestor.',
      });
    }
    const parent: { id: string; parentRegionId: string | null } | null = await findParent(currentId);
    if (!parent) {
      throw new NotFoundException({
        code: GEOGRAPHY_ERROR_CODES.REGION_PARENT_NOT_FOUND,
        message: `No Region with id ${currentId}.`,
      });
    }
    currentId = parent.parentRegionId;
  }
  throw new BadRequestException({
    code: GEOGRAPHY_ERROR_CODES.REGION_PARENT_CYCLE,
    message: 'Region parent chain exceeds the maximum supported depth.',
  });
}
