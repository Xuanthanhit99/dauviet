import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PublicationStatus } from '@prisma/client';
import { GEOGRAPHY_ERROR_CODES } from '../errors/geography-error-codes';
import { PrismaService } from '../../prisma/prisma.service';

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

/**
 * Post-G04 API consistency hardening: sentinel distinguishing "no filter
 * value was supplied" (`undefined`) from "a filter value was supplied but
 * did not resolve to anything" - the caller must 404, never silently drop
 * the filter (which would broaden the query) or silently return an empty
 * page (indistinguishable from a merely-empty result).
 */
export const GEOGRAPHY_FILTER_UNRESOLVED = Symbol('geography-filter-unresolved');

/**
 * Resolves a public `?country=` filter value to a real, PUBLISHED Country
 * id. Same defect class as G04's `DestinationsService.listPublic()` (see
 * docs/backend/POST_G04_API_CONSISTENCY_HARDENING.md): `RegionsController`/
 * `CitiesController`/`CountriesController`'s sibling routes used to pass
 * this raw query string straight through as `countryId`. Country gets a
 * wider accepted-form set than Region/City because `iso2`/`iso3` are
 * already real, unique, always-populated G01 identity columns (not a new
 * key system) - `canonicalSlug`, `iso2`, `iso3`, and the raw internal id
 * (compatibility fallback) all resolve. No case-folding: every other
 * slug/id lookup in this API is exact-match, and `iso2`/`iso3` are only
 * ever stored uppercase (`CreateCountryDto`'s `@Matches(/^[A-Z]{2}$/)` /
 * `/^[A-Z]{3}$/`) - adding case-insensitivity here would be a new,
 * un-requested normalization rule, not a preserved existing one.
 */
export async function resolvePublicCountryId(
  prisma: PrismaService,
  value: string | undefined,
): Promise<string | undefined | typeof GEOGRAPHY_FILTER_UNRESOLVED> {
  if (!value) return undefined;
  const country = await prisma.country.findFirst({
    where: { status: PublicationStatus.PUBLISHED, OR: [{ canonicalSlug: value }, { iso2: value }, { iso3: value }, { id: value }] },
  });
  return country ? country.id : GEOGRAPHY_FILTER_UNRESOLVED;
}

/**
 * Resolves a public `?region=`/`?parentRegion=` filter value to a real,
 * PUBLISHED Region id (`canonicalSlug` or the raw internal id fallback -
 * Region has no ISO-code equivalent). Same rationale as
 * `resolvePublicCountryId` above.
 */
export async function resolvePublicRegionId(
  prisma: PrismaService,
  value: string | undefined,
): Promise<string | undefined | typeof GEOGRAPHY_FILTER_UNRESOLVED> {
  if (!value) return undefined;
  const region = await prisma.region.findFirst({
    where: { status: PublicationStatus.PUBLISHED, OR: [{ canonicalSlug: value }, { id: value }] },
  });
  return region ? region.id : GEOGRAPHY_FILTER_UNRESOLVED;
}
