import { AUTH_ERROR_CODES } from '../../modules/auth/auth-error-codes';
import { MEDIA_ERROR_CODES } from '../../modules/media/media-error-codes';
import { EDITORIAL_ERROR_CODES } from '../../modules/stories/editorial-error-codes';
import { TRUST_ERROR_CODES } from './trust-error-codes';
import { COMMUNITY_ERROR_CODES } from './community-error-codes';
import { DISCOVERY_ERROR_CODES } from './discovery-error-codes';
import { CONTRIBUTION_ERROR_CODES } from './contribution-error-codes';
import { GEOGRAPHY_ERROR_CODES } from './geography-error-codes';
import { PROVIDER_ERROR_CODES } from './provider-error-codes';
import { STAY_FOOD_ACTIVITY_ERROR_CODES } from './stay-food-activity-error-codes';
import { TRIP_ERROR_CODES } from './trip-error-codes';

/**
 * Phase 11 error-code inventory (spec section 9) - every domain error-code
 * registry in the codebase, in one place, checked for global uniqueness.
 * A duplicate `code` string across two registries would let one domain's
 * error be silently confused for another's on the frontend (same `code`,
 * different meaning/HTTP status) - this test fails the build the moment
 * that happens, rather than relying on a human catching it in review.
 */
const REGISTRIES: Record<string, Record<string, string>> = {
  AUTH: AUTH_ERROR_CODES,
  MEDIA: MEDIA_ERROR_CODES,
  EDITORIAL: EDITORIAL_ERROR_CODES,
  TRUST: TRUST_ERROR_CODES,
  COMMUNITY: COMMUNITY_ERROR_CODES,
  DISCOVERY: DISCOVERY_ERROR_CODES,
  CONTRIBUTION: CONTRIBUTION_ERROR_CODES,
  // Added G01 (Global Geography) / G02 (Provider + Licensing) - closes a
  // real pre-existing gap (these two registries existed but were never
  // wired into this global-uniqueness inventory) rather than opportunistic
  // cleanup unrelated to either phase's own error-code work.
  GEOGRAPHY: GEOGRAPHY_ERROR_CODES,
  PROVIDER: PROVIDER_ERROR_CODES,
  // Added G05 (Stay + Food + Activities).
  STAY_FOOD_ACTIVITY: STAY_FOOD_ACTIVITY_ERROR_CODES,
  // Added G06 (Trip Planner + Cost Engine).
  TRIP: TRIP_ERROR_CODES,
};

// Generic per-HTTP-status codes AllExceptionsFilter falls back to when a
// thrown exception carries no domain `code` (common/filters/
// http-exception.filter.ts's STATUS_CODES map) - reserved, a domain
// registry must never reuse one of these as its own specific code.
const RESERVED_GENERIC_CODES = new Set([
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'UNPROCESSABLE',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
  'ERROR',
  'CONFLICT',
  'DATABASE_ERROR',
]);

describe('Domain error code inventory (spec Phase 11 section 9)', () => {
  it('every registry has no internal duplicate value (a copy-paste error would otherwise silently alias two distinct error conditions)', () => {
    for (const [domain, registry] of Object.entries(REGISTRIES)) {
      const values = Object.values(registry);
      expect([domain, new Set(values).size]).toEqual([domain, values.length]);
    }
  });

  it('no two domain registries define the same code string', () => {
    const seen = new Map<string, string>();
    const duplicates: string[] = [];
    for (const [domain, registry] of Object.entries(REGISTRIES)) {
      for (const value of Object.values(registry)) {
        const owner = seen.get(value);
        if (owner && owner !== domain) duplicates.push(`${value} (${owner} vs ${domain})`);
        else seen.set(value, domain);
      }
    }
    expect(duplicates).toEqual([]);
  });

  it('no domain registry reuses a reserved generic per-HTTP-status code', () => {
    const offenders: string[] = [];
    for (const [domain, registry] of Object.entries(REGISTRIES)) {
      for (const value of Object.values(registry)) {
        if (RESERVED_GENERIC_CODES.has(value)) offenders.push(`${domain}: ${value}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every code is SCREAMING_SNAKE_CASE (stable, predictable machine-readable format)', () => {
    for (const registry of Object.values(REGISTRIES)) {
      for (const value of Object.values(registry)) {
        expect(value).toMatch(/^[A-Z][A-Z0-9_]*$/);
      }
    }
  });

  it('reports the total code count per domain (documentation cross-check)', () => {
    const counts = Object.fromEntries(Object.entries(REGISTRIES).map(([domain, registry]) => [domain, Object.keys(registry).length]));
    // eslint-disable-next-line no-console
    console.log('Error code counts by domain:', JSON.stringify(counts));
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(50);
  });
});
