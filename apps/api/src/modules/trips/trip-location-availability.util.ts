/**
 * FRESH/STALE/UNAVAILABLE (spec section 17) is always computed at read
 * time from `now` - never persisted, never inferred from a background
 * job's last run. A stale coordinate is still disclosed (with a status the
 * client can render distinctly); an unavailable one is never returned at
 * all - see callers in `trip-locations.service.ts`/
 * `trip-location-sharing.service.ts`.
 */
export type TripLocationAvailability = 'FRESH' | 'STALE' | 'UNAVAILABLE';

export interface LocationFreshnessInput {
  /** Consent status as stored - `EXPIRED`/`STOPPED` are always UNAVAILABLE regardless of the location row. */
  sharingStatus: 'ACTIVE' | 'STOPPED' | 'EXPIRED';
  /** Consent expiry - compared against `now` independently of the stored `status` column (spec section 55 - "status should behave as expired even if lazy DB transition has not yet run"). */
  sharingExpiresAt: Date;
  /** Null when the member has never sent a location update yet. */
  location: { capturedAt: Date; expiresAt: Date } | null;
  now: Date;
  freshnessSeconds: number;
}

export function computeLocationAvailability(input: LocationFreshnessInput): TripLocationAvailability {
  const { sharingStatus, sharingExpiresAt, location, now, freshnessSeconds } = input;
  if (sharingStatus !== 'ACTIVE' || sharingExpiresAt <= now) return 'UNAVAILABLE';
  if (!location || location.expiresAt <= now) return 'UNAVAILABLE';
  const ageMs = now.getTime() - location.capturedAt.getTime();
  return ageMs <= freshnessSeconds * 1000 ? 'FRESH' : 'STALE';
}
