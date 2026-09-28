/**
 * Open-redirect / header-injection defense (spec sections 12/13/73-75/89).
 * The client never supplies a URL anywhere in this module (spec section
 * 10-12) - only canonical internal identifiers. This validator runs against
 * an ADAPTER's own already-built output before it is ever stored/served, as
 * defense-in-depth against a future adapter bug, not as a filter on
 * attacker-controlled input (there is no HTTP input path that reaches this
 * function with raw user data at all - the strongest available defense is
 * eliminating that attack surface entirely).
 */

export class InvalidRedirectError extends Error {}

/** Full-string hostname equality only - never a suffix/subdomain match, which would admit `evil-booking.com` or `booking.com.evil.example` (spec section 89's "lookalike host"/"subdomain trick"). */
export function validateRedirectUrl(rawUrl: string, allowedHosts: readonly string[]): URL {
  // CRLF / control-character defense (spec section 74) - checked on the RAW
  // string before any parsing, since a URL parser may itself normalize/strip
  // these before we ever see them.
  if (/[\r\n\t\0]/.test(rawUrl)) {
    throw new InvalidRedirectError('Redirect URL contains a control character.');
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new InvalidRedirectError(`"${rawUrl}" is not a valid absolute URL.`);
  }

  // Only https: - never http:, javascript:, data:, or a protocol-relative
  // string (which `new URL` would in any case refuse to parse without a
  // base, surfacing as the malformed-URL branch above; the explicit check
  // here also rejects a syntactically-valid http:// URL, since spec section
  // 13 requires HTTPS specifically).
  if (url.protocol !== 'https:') {
    throw new InvalidRedirectError(`Protocol "${url.protocol}" is not allowed - only https: is permitted.`);
  }

  // No userinfo/credential URL (spec section 13/89) - e.g.
  // https://user:pass@evil.example or https://trusted.host@evil.example
  // (the latter is a classic lookalike trick: everything before the "@" is
  // userinfo, not the host).
  if (url.username || url.password) {
    throw new InvalidRedirectError('Redirect URL must not contain userinfo/credentials.');
  }

  const hostname = url.hostname.toLowerCase();
  const isAllowed = allowedHosts.some((allowed) => hostname === allowed.toLowerCase());
  if (!isAllowed) {
    throw new InvalidRedirectError(`Host "${hostname}" is not an approved redirect destination.`);
  }

  return url;
}
