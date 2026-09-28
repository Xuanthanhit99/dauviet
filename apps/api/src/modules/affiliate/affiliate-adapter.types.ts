import { ProviderExecutionContext } from '../providers/provider-access.types';

/**
 * Minimal adapter contract (spec section 15) - a typed extension point,
 * not a provider-conditional spread across services. Only one real
 * implementation exists this phase: the G10 fixture adapter (see
 * `docs/backend/G10_PRE_IMPLEMENTATION_REPORT.md` section 6 for why real
 * Booking.com/Agoda/Viator adapters are deliberately NOT implemented as
 * executable code this phase).
 */
export interface BuildRedirectInput {
  providerEntityReferenceId?: string;
  providerOfferId?: string;
  campaignKey: string;
}

export interface BuildRedirectResult {
  redirectUrl: string;
}

export interface NormalizedConversionInput {
  providerConversionId: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'REVERSED';
  rawProviderStatus?: string;
  bookingAmount?: string;
  bookingCurrency?: string;
  commissionAmount?: string;
  commissionCurrency?: string;
  providerOccurredAt: string;
  reportedAt: string;
  campaignKey?: string;
  externalBookingReference?: string;
}

export interface AffiliateProviderAdapter {
  readonly providerCode: string;
  /** The exact, full hostnames this adapter is ever allowed to redirect a browser to (spec section 73) - full-string match only, no suffix/subdomain matching. */
  readonly allowedRedirectHosts: readonly string[];
  buildAffiliateRedirect(input: BuildRedirectInput, context: ProviderExecutionContext): BuildRedirectResult;
  normalizeConversion(raw: unknown): NormalizedConversionInput;
}
