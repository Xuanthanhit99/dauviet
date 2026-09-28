import { BadRequestException } from '@nestjs/common';
import { AFFILIATE_ERROR_CODES } from '../../../common/errors/affiliate-error-codes';
import { AffiliateProviderAdapter, BuildRedirectInput, BuildRedirectResult, NormalizedConversionInput } from '../affiliate-adapter.types';

/**
 * Internal G10 fixture provider identity (spec section 63) - used ONLY by
 * unit/e2e tests to exercise the redirect/conversion flow deterministically.
 * Never seeded into the production Golden Dataset, never reachable in
 * production, and deliberately unlike any real vendor code (distinct from
 * G02's own `TEST_PROVIDER_G02_FIXTURE`) so it can never be mistaken for
 * Booking.com/Agoda/Viator.
 */
export const FIXTURE_AFFILIATE_PROVIDER_CODE = 'TEST_FIXTURE_PROVIDER_G10_AFFILIATE';

/** A fixed, fake, non-resolvable host - never a real provider's domain (spec section 63). Used only by tests, which never actually perform the HTTP redirect over the network. */
const FIXTURE_HOST = 'www.fixture-provider.example';

export class FixtureAffiliateAdapter implements AffiliateProviderAdapter {
  readonly providerCode = FIXTURE_AFFILIATE_PROVIDER_CODE;
  readonly allowedRedirectHosts = [FIXTURE_HOST] as const;

  buildAffiliateRedirect(input: BuildRedirectInput): BuildRedirectResult {
    if (!input.providerEntityReferenceId && !input.providerOfferId) {
      throw new BadRequestException({
        code: AFFILIATE_ERROR_CODES.AFFILIATE_PROVIDER_ENTITY_REQUIRED,
        message: 'providerEntityReferenceId or providerOfferId is required.',
      });
    }
    const url = new URL(`https://${FIXTURE_HOST}/deeplink`);
    if (input.providerEntityReferenceId) url.searchParams.set('ref', input.providerEntityReferenceId);
    if (input.providerOfferId) url.searchParams.set('offer', input.providerOfferId);
    // Pseudonymous tracking key only (spec section 20/21/76) - never a raw
    // email/userId/tripId/GPS value; `campaignKey` is always a random
    // opaque `AffiliateSession.campaignKey`, never derived from PII.
    url.searchParams.set('label', input.campaignKey);
    return { redirectUrl: url.toString() };
  }

  normalizeConversion(raw: unknown): NormalizedConversionInput {
    const r = raw as Record<string, unknown>;
    if (typeof r?.conversionId !== 'string' || typeof r?.status !== 'string' || typeof r?.providerOccurredAt !== 'string' || typeof r?.reportedAt !== 'string') {
      throw new BadRequestException({ code: AFFILIATE_ERROR_CODES.AFFILIATE_CONVERSION_INVALID, message: 'Fixture evidence is missing required fields.' });
    }
    const statusMap: Record<string, NormalizedConversionInput['status']> = {
      pending: 'PENDING',
      booked: 'CONFIRMED',
      confirmed: 'CONFIRMED',
      cancelled: 'CANCELLED',
      reversed: 'REVERSED',
    };
    const normalizedStatus = statusMap[r.status.toLowerCase()];
    if (!normalizedStatus) {
      throw new BadRequestException({ code: AFFILIATE_ERROR_CODES.AFFILIATE_CONVERSION_INVALID, message: `Unrecognized fixture status "${r.status}".` });
    }
    return {
      providerConversionId: r.conversionId,
      status: normalizedStatus,
      rawProviderStatus: r.status,
      bookingAmount: typeof r.bookingAmount === 'string' ? r.bookingAmount : undefined,
      bookingCurrency: typeof r.bookingCurrency === 'string' ? r.bookingCurrency : undefined,
      commissionAmount: typeof r.commissionAmount === 'string' ? r.commissionAmount : undefined,
      commissionCurrency: typeof r.commissionCurrency === 'string' ? r.commissionCurrency : undefined,
      providerOccurredAt: r.providerOccurredAt,
      reportedAt: r.reportedAt,
      campaignKey: typeof r.campaignKey === 'string' ? r.campaignKey : undefined,
      externalBookingReference: typeof r.bookingReference === 'string' ? r.bookingReference : undefined,
    };
  }
}
