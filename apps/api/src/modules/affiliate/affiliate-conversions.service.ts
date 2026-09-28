import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EntityKind, Prisma, ProviderEnvironment } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppConfig } from '../../config/configuration';
import { AFFILIATE_ERROR_CODES } from '../../common/errors/affiliate-error-codes';
import { ProviderRegistryService } from '../providers/provider-registry.service';
import { AffiliateAdapterRegistry } from './affiliate-adapter-registry.service';
import { parseMoney } from '../trips/split-money.util';
import { IngestAffiliateConversionDto } from './dto/affiliate-admin.dto';

interface UpsertResultRow {
  id: string;
  providerOccurredAt: Date;
}

/**
 * AffiliateConversion exists ONLY from provider-supplied/approved evidence
 * (spec section 27/29) - a click or a successful redirect never creates one
 * (proven live). Idempotency: `@@unique([providerId, providerConversionId])`
 * (spec section 36), enforced atomically via `INSERT ... ON CONFLICT ...
 * WHERE stored.providerOccurredAt <= EXCLUDED.providerOccurredAt` - the
 * exact newer-wins/idempotent-duplicate pattern
 * `TripLocationsService.update`/`TripExpensesService` already established
 * for their own out-of-order-evidence races (spec section 37/38/39).
 */
@Injectable()
export class AffiliateConversionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly registry: ProviderRegistryService,
    private readonly adapters: AffiliateAdapterRegistry,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async ingest(actorId: string, dto: IngestAffiliateConversionDto) {
    const environment: ProviderEnvironment = this.config.get('affiliate', { infer: true }).defaultEnvironment;
    const gate = await this.registry.getExecutionContext({
      providerCode: dto.providerCode,
      environment,
      capability: 'CONVERSION_REPORTING',
      usage: 'commercialUse',
    });
    if (!gate.ok) {
      throw new ForbiddenException({ code: gate.code, message: gate.message });
    }

    const adapter = this.adapters.get(dto.providerCode);
    const normalized = adapter.normalizeConversion(dto.evidence);

    const providerOccurredAt = new Date(normalized.providerOccurredAt);
    const reportedAt = new Date(normalized.reportedAt);
    if (Number.isNaN(providerOccurredAt.getTime()) || Number.isNaN(reportedAt.getTime())) {
      throw new BadRequestException({ code: AFFILIATE_ERROR_CODES.AFFILIATE_CONVERSION_INVALID, message: 'providerOccurredAt/reportedAt must be valid timestamps.' });
    }
    const bookingAmount = normalized.bookingAmount ? this.parseAmountOrThrow(normalized.bookingAmount) : null;
    const commissionAmount = normalized.commissionAmount ? this.parseAmountOrThrow(normalized.commissionAmount) : null;

    // Deterministic reconciliation only (spec section 40/41): the click is
    // resolved SOLELY via the provider-echoed campaignKey, scoped to this
    // provider. No fuzzy match on amount/date/destination/user is ever
    // attempted. No match -> retained with a null click (spec section 42),
    // never fabricated.
    const click = normalized.campaignKey
      ? await this.prisma.affiliateClick.findFirst({ where: { campaignKey: normalized.campaignKey, providerId: gate.context.providerId }, orderBy: { clickedAt: 'desc' } })
      : null;

    const evidenceHash = createHash('sha256').update(JSON.stringify(dto.evidence)).digest('hex');

    return this.prisma.$transaction(async (tx) => {
      let providerBookingReferenceId: string | null = null;
      if (normalized.externalBookingReference) {
        const bookingRef = await tx.providerBookingReference.upsert({
          where: { providerId_externalBookingReference: { providerId: gate.context.providerId, externalBookingReference: normalized.externalBookingReference } },
          update: { rawStatus: normalized.rawProviderStatus, observedAt: providerOccurredAt },
          create: {
            providerId: gate.context.providerId,
            externalBookingReference: normalized.externalBookingReference,
            observedAt: providerOccurredAt,
            rawStatus: normalized.rawProviderStatus,
          },
        });
        providerBookingReferenceId = bookingRef.id;
      }

      const id = randomUUID();
      const upserted = await tx.$queryRaw<UpsertResultRow[]>`
        INSERT INTO "AffiliateConversion"
          ("id", "providerId", "providerConversionId", "affiliateClickId", "affiliateSessionId", "providerBookingReferenceId",
           "status", "rawProviderStatus", "bookingAmount", "bookingCurrency", "commissionAmount", "commissionCurrency",
           "providerOccurredAt", "reportedAt", "ingestedAt", "evidenceType", "evidenceReference", "evidenceHash", "policyVersionRef",
           "createdAt", "updatedAt")
        VALUES
          (${id}, ${gate.context.providerId}, ${normalized.providerConversionId}, ${click?.id ?? null}, ${click?.affiliateSessionId ?? null}, ${providerBookingReferenceId},
           ${normalized.status}::"AffiliateConversionStatus", ${normalized.rawProviderStatus ?? null}, ${bookingAmount}, ${normalized.bookingCurrency ?? null},
           ${commissionAmount}, ${normalized.commissionCurrency ?? null},
           ${providerOccurredAt}, ${reportedAt}, NOW(), ${dto.evidenceType}::"AffiliateEvidenceType", ${dto.evidenceReference}, ${evidenceHash}, ${gate.context.licenseId},
           NOW(), NOW())
        ON CONFLICT ("providerId", "providerConversionId") DO UPDATE SET
          "status" = EXCLUDED."status",
          "rawProviderStatus" = EXCLUDED."rawProviderStatus",
          "bookingAmount" = EXCLUDED."bookingAmount",
          "bookingCurrency" = EXCLUDED."bookingCurrency",
          "commissionAmount" = EXCLUDED."commissionAmount",
          "commissionCurrency" = EXCLUDED."commissionCurrency",
          "providerOccurredAt" = EXCLUDED."providerOccurredAt",
          "reportedAt" = EXCLUDED."reportedAt",
          "evidenceType" = EXCLUDED."evidenceType",
          "evidenceReference" = EXCLUDED."evidenceReference",
          "evidenceHash" = EXCLUDED."evidenceHash",
          "policyVersionRef" = EXCLUDED."policyVersionRef",
          "affiliateClickId" = COALESCE(EXCLUDED."affiliateClickId", "AffiliateConversion"."affiliateClickId"),
          "affiliateSessionId" = COALESCE(EXCLUDED."affiliateSessionId", "AffiliateConversion"."affiliateSessionId"),
          "providerBookingReferenceId" = COALESCE(EXCLUDED."providerBookingReferenceId", "AffiliateConversion"."providerBookingReferenceId"),
          "updatedAt" = NOW()
        WHERE "AffiliateConversion"."providerOccurredAt" <= EXCLUDED."providerOccurredAt"
        RETURNING "id", "providerOccurredAt"
      `;

      let conversionId: string;
      if (upserted.length > 0) {
        conversionId = upserted[0].id;
      } else {
        const current = await tx.affiliateConversion.findUniqueOrThrow({ where: { providerId_providerConversionId: { providerId: gate.context.providerId, providerConversionId: normalized.providerConversionId } } });
        if (current.providerOccurredAt.getTime() === providerOccurredAt.getTime()) {
          // Idempotent duplicate delivery (spec section 37) - same event, no-op.
          conversionId = current.id;
        } else {
          throw new ConflictException({
            code: AFFILIATE_ERROR_CODES.AFFILIATE_CONVERSION_STALE_EVIDENCE,
            message: 'Older evidence cannot override newer authoritative conversion state.',
          });
        }
      }

      await this.audit.log(
        {
          actorId,
          action: 'affiliateConversion.ingested',
          entityType: EntityKind.AFFILIATE_CONVERSION,
          entityId: conversionId,
          metadata: { providerCode: dto.providerCode, status: normalized.status, evidenceType: dto.evidenceType, currency: normalized.bookingCurrency ?? null },
        },
        tx,
      );

      return tx.affiliateConversion.findUniqueOrThrow({ where: { id: conversionId } });
    });
  }

  private parseAmountOrThrow(input: string): Prisma.Decimal {
    try {
      return parseMoney(input);
    } catch {
      throw new BadRequestException({ code: AFFILIATE_ERROR_CODES.AFFILIATE_CONVERSION_INVALID, message: `"${input}" is not a valid amount.` });
    }
  }
}
