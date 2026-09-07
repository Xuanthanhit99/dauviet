/**
 * Internal test/fixture provider identity (spec section 28). Used ONLY by
 * integration/e2e tests to exercise the activation gate deterministically -
 * never seeded into the production Golden Dataset, never reachable in
 * production, and never allowed to masquerade as a real provider (its code
 * is deliberately unlike any real vendor code such as GOOGLE_PLACES/
 * BOOKING/AGODA/VIATOR).
 */
export const TEST_FIXTURE_PROVIDER_CODE = 'TEST_PROVIDER_G02_FIXTURE';
