import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { AppConfig } from '../../config/configuration';
import { evaluateIngestionAccess } from './ingestion-policy.util';
import { IngestionAccessResult, IngestionUsageIntent } from './ingestion-policy.types';

/**
 * The ONLY safe path any adapter/normalizer/promotion code may use to check
 * whether an ingestion operation is currently allowed (spec sections 4/53) -
 * mirrors `ProviderRegistryService.getExecutionContext` exactly: re-fetches
 * source + policy fresh from Postgres on every call, nothing cached, so an
 * admin disabling a source takes effect on the very next call with nothing
 * to invalidate.
 */
@Injectable()
export class IngestionPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  private hasCredentialFor(sourceCode: string): boolean {
    const cfg = this.config.get('ingestion', { infer: true });
    switch (sourceCode) {
      case 'WIKIDATA':
      case 'WIKIMEDIA_COMMONS':
        return Boolean(cfg.wikimediaUserAgent && cfg.wikimediaContact);
      case 'UNESCO':
        return true; // keyless public DataHub API
      case 'GEONAMES':
        return Boolean(cfg.geonamesUsername);
      case 'GOOGLE_PLACES':
        return Boolean(cfg.googlePlacesApiKey);
      case 'OPENSTREETMAP':
        return false; // permanently disabled - see G06_5_SOURCE_POLICY_RESEARCH.md section 5
      default:
        return false;
    }
  }

  async check(sourceCode: string, usage: IngestionUsageIntent): Promise<IngestionAccessResult> {
    const source = await this.prisma.ingestionSource.findUnique({ where: { code: sourceCode } });
    const policy = source ? await this.prisma.ingestionSourcePolicy.findUnique({ where: { sourceId: source.id } }) : null;

    // Master switch (KNOWLEDGE_INGESTION_ENABLED) gates everything, checked
    // before any DB-derived state - a disabled deployment never even
    // reveals whether a given source is otherwise configured.
    if (!this.config.get('ingestion', { infer: true }).enabled) {
      return { ok: false, code: 'INGESTION_SOURCE_DISABLED', message: 'Knowledge ingestion is disabled (KNOWLEDGE_INGESTION_ENABLED=false).' };
    }

    return evaluateIngestionAccess({
      source: source ? { id: source.id, code: source.code, name: source.name, sourceClass: source.sourceClass, enabled: source.enabled } : null,
      policy: policy
        ? {
            enabled: policy.enabled,
            authRequired: policy.authRequired,
            rateLimitPerSecond: policy.rateLimitPerSecond,
            rateLimitPerDay: policy.rateLimitPerDay,
            concurrencyLimit: policy.concurrencyLimit,
            maxRetries: policy.maxRetries,
            rawPayloadStorage: policy.rawPayloadStorage,
            normalizedStorageRight: policy.normalizedStorageRight,
            commercialUseRight: policy.commercialUseRight,
            mediaReusePolicy: policy.mediaReusePolicy,
            attributionRequirement: policy.attributionRequirement,
            licenseCode: policy.licenseCode,
            licenseUrl: policy.licenseUrl,
            sourceUrl: policy.sourceUrl,
            conditionalNotes: policy.conditionalNotes,
            cacheMaxAgeSeconds: policy.cacheMaxAgeSeconds,
            retentionDays: policy.retentionDays,
            policyVersion: policy.policyVersion,
          }
        : null,
      usage,
      hasCredential: source ? this.hasCredentialFor(source.code) : false,
    });
  }
}
