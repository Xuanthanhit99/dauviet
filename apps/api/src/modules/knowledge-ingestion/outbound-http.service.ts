import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';
import { INGESTION_ERROR_CODES } from '../../common/errors/ingestion-error-codes';

/**
 * The first genuine outbound-network client in this codebase (spec section
 * 57/72/90) - no prior phase ever made a real HTTP call to an external
 * system (G02's ProviderRegistryService is a pure DB gate; G05's "provider
 * ingestion" is an admin-submitted DTO upsert, never a live fetch). Every
 * live G06.5 adapter goes through this single service - nothing outside it
 * ever calls `fetch` directly, mirroring `S3Service`'s "one injectable
 * service owns the vendor transport" isolation pattern (spec section 38).
 *
 * Safety properties enforced here, not left to each adapter to remember:
 * - timeout (AbortController)
 * - bounded response size (streamed, aborted the instant the cap is exceeded
 *   - never buffered-then-checked, which would defeat the point)
 * - only http/https, and refuses IP-literal/loopback/link-local/private
 *   targets by default (SSRF hardening - spec section 56/57) unless a
 *   caller explicitly opts out for a source whose official API happens to
 *   resolve to a private-range test double (never the case for the six
 *   G06.5 sources in production)
 * - bounded redirect count, re-validated against the same SSRF rule on every
 *   hop (a redirect cannot be used to smuggle a request to a disallowed
 *   target)
 * - a descriptive, policy-compliant User-Agent injected on every request
 *   (Wikimedia Foundation User-Agent policy - see
 *   docs/backend/G06_5_SOURCE_POLICY_RESEARCH.md section 1)
 */

export class OutboundHttpError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'OutboundHttpError';
  }
}

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxResponseBytes?: number;
  maxRedirects?: number;
  headers?: Record<string, string>;
  /** Only for adapter contract tests against a local fixture server - never used by a live source. */
  allowPrivateNetworkTarget?: boolean;
}

export interface SafeFetchResult {
  status: number;
  headers: Headers;
  body: string;
  finalUrl: string;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024; // 5 MiB - generous for JSON metadata, never a full media binary
const DEFAULT_MAX_REDIRECTS = 3;

const PRIVATE_HOSTNAME_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./, // link-local, including the cloud metadata endpoint 169.254.169.254
  /^0\.0\.0\.0$/,
  /^\[?::1\]?$/,
  /^\[?fe80:/i,
  /^\[?fc00:/i,
  /^\[?fd00:/i,
];

function isDisallowedTarget(url: URL): boolean {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return true;
  return PRIVATE_HOSTNAME_PATTERNS.some((re) => re.test(url.hostname));
}

@Injectable()
export class OutboundHttpService {
  private readonly logger = new Logger(OutboundHttpService.name);

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  private userAgent(): string {
    const { wikimediaUserAgent } = this.config.get('ingestion', { infer: true });
    return wikimediaUserAgent || 'DauVietKnowledgeIngestion/0.1 (unconfigured contact)';
  }

  /**
   * Fetches `url`, returning the body as text once it is fully and safely
   * received. Never logs the response body (may contain untrusted external
   * content) or any secret query/header value.
   */
  async get(url: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxBytes = options.maxResponseBytes ?? DEFAULT_MAX_BYTES;
    const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;

    let currentUrl: URL;
    try {
      currentUrl = new URL(url);
    } catch (cause) {
      throw new OutboundHttpError(`Malformed URL`, INGESTION_ERROR_CODES.INGESTION_OUTBOUND_URL_REJECTED, cause);
    }

    for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount++) {
      // `allowPrivateNetworkTarget` (contract-test-only escape hatch) applies
      // ONLY to the original, explicitly-requested URL - never to a
      // redirect target. Found live by this class's own security test
      // (outbound-http.service.spec.ts): an earlier version checked this
      // flag unconditionally on every hop, so a test caller's opt-in for
      // its own local fixture server would ALSO have silently waived the
      // SSRF check for wherever that server's response redirected to -
      // exactly the smuggling attack this re-validation exists to prevent.
      const bypassAllowed = options.allowPrivateNetworkTarget && redirectCount === 0;
      if (!bypassAllowed && isDisallowedTarget(currentUrl)) {
        throw new OutboundHttpError(
          `Refusing to fetch disallowed target: ${currentUrl.protocol}//${currentUrl.hostname}`,
          INGESTION_ERROR_CODES.INGESTION_OUTBOUND_URL_REJECTED,
        );
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);

      let response: Response;
      try {
        response = await fetch(currentUrl, {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
          headers: {
            'User-Agent': this.userAgent(),
            'Accept-Encoding': 'gzip,deflate',
            ...options.headers,
          },
        });
      } catch (cause) {
        throw new OutboundHttpError(
          `Request failed: ${(cause as Error)?.message ?? cause}`,
          INGESTION_ERROR_CODES.INGESTION_ADAPTER_FETCH_FAILED,
          cause,
        );
      } finally {
        clearTimeout(timer);
      }

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) {
          throw new OutboundHttpError(
            `Redirect status ${response.status} with no Location header`,
            INGESTION_ERROR_CODES.INGESTION_ADAPTER_FETCH_FAILED,
          );
        }
        currentUrl = new URL(location, currentUrl);
        continue;
      }

      const body = await this.readBounded(response, maxBytes);
      return { status: response.status, headers: response.headers, body, finalUrl: currentUrl.toString() };
    }

    throw new OutboundHttpError(
      `Exceeded maximum of ${maxRedirects} redirects`,
      INGESTION_ERROR_CODES.INGESTION_ADAPTER_FETCH_FAILED,
    );
  }

  async getJson<T = unknown>(url: string, options: SafeFetchOptions = {}): Promise<T> {
    const result = await this.get(url, options);
    if (result.status < 200 || result.status >= 300) {
      throw new OutboundHttpError(
        `Non-2xx response (${result.status}) from ${result.finalUrl}`,
        INGESTION_ERROR_CODES.INGESTION_ADAPTER_FETCH_FAILED,
      );
    }
    try {
      return JSON.parse(result.body) as T;
    } catch (cause) {
      throw new OutboundHttpError(
        `Response from ${result.finalUrl} was not valid JSON`,
        INGESTION_ERROR_CODES.INGESTION_ADAPTER_FETCH_FAILED,
        cause,
      );
    }
  }

  /** Streams the body, aborting the instant the byte cap is exceeded - never buffers the whole thing first (spec section 56 - decompression/oversized-payload safety). */
  private async readBounded(response: Response, maxBytes: number): Promise<string> {
    const contentLength = response.headers.get('content-length');
    if (contentLength && Number(contentLength) > maxBytes) {
      throw new OutboundHttpError(
        `Response declares Content-Length ${contentLength} > cap ${maxBytes}`,
        INGESTION_ERROR_CODES.INGESTION_OUTBOUND_RESPONSE_TOO_LARGE,
      );
    }
    if (!response.body) return '';

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > maxBytes) {
          await reader.cancel();
          throw new OutboundHttpError(
            `Response exceeded ${maxBytes} byte cap`,
            INGESTION_ERROR_CODES.INGESTION_OUTBOUND_RESPONSE_TOO_LARGE,
          );
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock?.();
    }
    return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf-8');
  }
}
