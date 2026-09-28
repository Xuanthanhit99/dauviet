import { randomBytes, createHash } from 'node:crypto';
import { BadRequestException, ForbiddenException, GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProviderEnvironment } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AppConfig } from '../../config/configuration';
import { ProviderRegistryService } from '../providers/provider-registry.service';
import { TripCapability, TripAuthorizationService } from '../trips/trip-authorization.service';
import { AFFILIATE_ERROR_CODES } from '../../common/errors/affiliate-error-codes';
import { AffiliateAdapterRegistry } from './affiliate-adapter-registry.service';
import { validateRedirectUrl, InvalidRedirectError } from './affiliate-redirect-security.util';
import { CreateAffiliateClickDto } from './dto/affiliate-click.dto';

const REDIRECT_TOKEN_BYTES = 32;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * DISCOVERY/TRIP -> G05 offer -> G02 policy gate -> AffiliateSession ->
 * AffiliateClick -> validated redirect (spec section 0). Every commercial
 * action goes through `ProviderRegistryService.getExecutionContext` - the
 * ONLY gate, never bypassed (spec section 16/17) - so a disabled provider/
 * suspended integration/revoked license/missing capability/missing
 * attribution fails closed on the very next request, nothing cached (spec
 * section 18, live-proven in the e2e policy-revocation test).
 */
@Injectable()
export class AffiliateClicksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ProviderRegistryService,
    private readonly adapters: AffiliateAdapterRegistry,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly tripAuthz: TripAuthorizationService,
  ) {}

  private get settings() {
    return this.config.get('affiliate', { infer: true });
  }

  /**
   * Self-only, anonymous-friendly (spec section 6). `userId` is whatever the
   * `OptionalJwtAuthGuard` resolved - may be `undefined`. If `dto.tripId` is
   * supplied, the caller must be a current accepted participant of that
   * trip (VIEW_TRIP is enough - reading trip context to build a redirect is
   * not a mutation) so an anonymous/unrelated user cannot use a trip id
   * they have no relationship to as free-form tracking context; this reuses
   * `TripAuthorizationService` rather than inventing a parallel check (spec
   * section 49 - "trip role does not grant commercial reporting access,"
   * the converse of which is that at minimum ordinary VIEW access is still
   * required to reference a trip at all).
   */
  async createClick(userId: string | undefined, dto: CreateAffiliateClickDto) {
    if (dto.tripId) {
      if (!userId) throw new ForbiddenException({ code: 'TRIP_PERMISSION_DENIED', message: 'Authentication is required to attribute a click to a trip.' });
      await this.tripAuthz.authorize(dto.tripId, userId, TripCapability.VIEW_TRIP);
    }

    const environment: ProviderEnvironment = this.settings.defaultEnvironment;
    const gate = await this.registry.getExecutionContext({
      providerCode: dto.providerCode,
      environment,
      capability: 'AFFILIATE_LINK',
      usage: 'commercialUse',
    });
    if (!gate.ok) {
      throw new ForbiddenException({ code: gate.code, message: gate.message });
    }

    const adapter = this.adapters.get(dto.providerCode);
    const session = await this.resolveOrCreateSession(gate.context.providerId, userId, dto);

    const built = adapter.buildAffiliateRedirect({ providerEntityReferenceId: dto.providerEntityReferenceId, providerOfferId: dto.providerOfferId, campaignKey: session.campaignKey }, gate.context);

    let validated;
    try {
      validated = validateRedirectUrl(built.redirectUrl, adapter.allowedRedirectHosts);
    } catch (err) {
      if (err instanceof InvalidRedirectError) {
        throw new BadRequestException({ code: AFFILIATE_ERROR_CODES.AFFILIATE_REDIRECT_INVALID, message: err.message });
      }
      throw err;
    }

    const rawToken = randomBytes(REDIRECT_TOKEN_BYTES).toString('base64url');
    const redirectTokenHash = hashToken(rawToken);
    const redirectTokenExpiresAt = new Date(Date.now() + this.settings.redirectTokenTtlSeconds * 1000);

    const click = await this.prisma.affiliateClick.create({
      data: {
        affiliateSessionId: session.id,
        providerId: gate.context.providerId,
        environment,
        entityKind: dto.entityKind,
        providerEntityReferenceId: dto.providerEntityReferenceId,
        providerOfferId: dto.providerOfferId,
        surface: dto.surface,
        placement: dto.placement,
        tripId: dto.tripId,
        destinationId: dto.destinationId,
        userId,
        campaignKey: session.campaignKey,
        redirectUrl: validated.toString(),
        redirectTokenHash,
        redirectTokenExpiresAt,
      },
    });

    return {
      sessionId: session.id,
      redirectToken: rawToken,
      expiresInSeconds: this.settings.redirectTokenTtlSeconds,
      clickId: click.id,
    };
  }

  private async resolveOrCreateSession(providerId: string, userId: string | undefined, dto: CreateAffiliateClickDto) {
    const now = new Date();
    if (dto.sessionId) {
      const existing = await this.prisma.affiliateSession.findUnique({ where: { id: dto.sessionId } });
      if (existing && existing.providerId === providerId && existing.expiresAt > now) {
        return existing;
      }
      // Unknown/expired/mismatched-provider session id - silently fall
      // through to creating a fresh one (spec section 6 - never require
      // auth/a specific prior state merely to follow a valid redirect).
    }
    return this.prisma.affiliateSession.create({
      data: {
        providerId,
        userId,
        tripId: dto.tripId,
        destinationId: dto.destinationId,
        sourceSurface: dto.surface,
        // Opaque, pseudonymous, high-entropy (spec section 57/76) - never
        // derived from userId/email/tripId.
        campaignKey: randomBytes(24).toString('base64url'),
        expiresAt: new Date(now.getTime() + this.settings.sessionTtlMinutes * 60_000),
      },
    });
  }

  /**
   * Resolves an opaque redirect token to its pre-validated destination
   * (spec section 14) - never re-derives or re-validates a URL from user
   * input at redirect time. Replay-safe within the TTL (documented
   * behavior, docs/backend/G10_PRE_IMPLEMENTATION_REPORT.md section 7):
   * repeated use resolves to the exact same stored URL, idempotently.
   */
  async resolveRedirect(rawToken: string): Promise<string> {
    const redirectTokenHash = hashToken(rawToken);
    const click = await this.prisma.affiliateClick.findUnique({ where: { redirectTokenHash }, include: { provider: { select: { code: true } } } });
    if (!click) {
      throw new NotFoundException({ code: AFFILIATE_ERROR_CODES.AFFILIATE_REDIRECT_TOKEN_INVALID, message: 'Invalid redirect token.' });
    }
    if (click.redirectTokenExpiresAt <= new Date()) {
      throw new GoneException({ code: AFFILIATE_ERROR_CODES.AFFILIATE_REDIRECT_TOKEN_EXPIRED, message: 'This redirect link has expired.' });
    }
    // G12: G02 stays the execution authority for EVERY redirect, not only for the click that minted
    // the token - otherwise a token issued just before a provider was disabled or its license revoked
    // would keep sending users to that provider for the rest of its TTL. Same environment/capability/
    // usage as createClick; nothing is cached, so the next request after a policy change sees it.
    const gate = await this.registry.getExecutionContext({
      providerCode: click.provider?.code ?? '',
      environment: click.environment,
      capability: 'AFFILIATE_LINK',
      usage: 'commercialUse',
    });
    if (!gate.ok) {
      throw new ForbiddenException({ code: gate.code, message: gate.message });
    }
    return click.redirectUrl;
  }
}
