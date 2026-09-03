# Dau Viet - Authentication & Session Architecture

Phase 02 deliverable. Read alongside `docs/backend/AUTHORIZATION_MATRIX.md` (roles/permissions) and the `auth` tag in Swagger (`/docs`) for the field-level contract.

## 1. Identity model

`User` (`prisma/schema.prisma`) holds account-level state: `email` (always normalized - see below), `displayName`, `avatarMediaId`, `status` (`ACTIVE` / `SUSPENDED` / `DISABLED` / `DELETED`), `roles` (a Postgres native array, see AUTHORIZATION_MATRIX.md), `locale`, timestamps. Credentials are never on `User` directly - they live in `AuthIdentity`, one row per `(userId, provider)`, so a `PASSWORD` identity and a `GOOGLE` identity for the same person share one `User` row (linked automatically by normalized email on first Google login if a password account already exists).

**Email normalization:** every read/write path funnels through `AuthService.normalizeEmail()` (trim + lowercase) before touching the database. There is no separate `emailNormalized` column - the single `email` field is always stored already-normalized, so the unique index on it is inherently case-insensitive. `"User@Example.com"` and `"  user@example.com"` collide as the same account.

**Account status is not just a label** - `SUSPENDED`/`DISABLED`/`DELETED` are enforced at two points: (1) `AuthService.validateCredentials` refuses login for a non-`ACTIVE` account *after* the password has been verified correct (so a legitimate-but-locked-out user gets told why, while a stranger guessing passwords learns nothing); (2) `JwtStrategy.validate` re-checks status on **every authenticated request**, not just at login - see "Access tokens" below.

## 2. Password hashing

Argon2id (`argon2` npm package, native binding - confirmed working in this sandbox: `argon2.hash`/`argon2.verify` round-trip tested directly). Parameters: `memoryCost: 19456` (~19 MiB), `timeCost: 2`, `parallelism: 1` - an OWASP-baseline interactive-login cost, tuned deliberately rather than left at library defaults (see `ARGON2_OPTIONS` in `auth.service.ts`). Passwords are never logged, never included in audit metadata, never echoed in any response or Swagger example.

`validateCredentials` always calls `argon2.verify()` exactly once per attempt - even for a nonexistent user or a user with no password identity, it verifies against a fixed, precomputed dummy hash (`DUMMY_HASH`) rather than short-circuiting. This closes the obvious timing side-channel that would otherwise let an attacker distinguish "no such account" from "wrong password" by response latency.

## 3. Access tokens (JWT)

Signed with `JWT_ACCESS_SECRET` (must be >=32 chars, validated at boot by `env.validation.ts`), short-lived (`JWT_ACCESS_TTL`, default 15m). **Payload is minimal on purpose: `{ sub: userId, sid: sessionId }`.** No email, no roles, no profile data.

This is a deliberate trade-off, not an oversight: `JwtStrategy.validate` runs on every authenticated request and re-reads both the `Session` row (by `sid`) and the `User` row (by `sub`) from the database, checking:

1. the session exists, belongs to that user, is not revoked, and has not expired;
2. the user's account `status` is `ACTIVE`.

The practical effect: revoking a session (logout, "revoke this device", suspending an account, a detected refresh-token-reuse attack) invalidates every access token issued under it **immediately** - not after up to 15 minutes of staleness, which is what you'd get from a purely stateless JWT that only embeds claims and never touches the database. The cost is one extra indexed lookup per request, which this API already pays elsewhere (e.g. Prisma queries per endpoint), so it was judged worth it for a product that includes account suspension and moderation as first-class concepts.

Role changes take effect on the *next* request for the same reason - roles are never embedded in the token, `RolesGuard` reads them from the `user` object `JwtStrategy.validate` attaches to the request, which is always freshly loaded.

## 4. Refresh tokens & sessions

Refresh tokens are **opaque** random values (`crypto.randomBytes(48)`, base64url), never JWTs. Only their SHA-256 hash is stored, on a `Session` row, alongside `platform` (`WEB`/`IOS`/`ANDROID`/`OTHER`), `userAgent`, `ip`, `deviceLabel`, `createdAt`, `lastUsedAt`, `expiresAt`, `revokedAt`, `revokedReason` (a short machine string like `"rotated"`/`"logout"`/`"password_changed"` - never a secret).

**Rotation + reuse detection** (`AuthService.refresh`): every refresh call revokes the token it was just given and issues a brand new one (single-use tokens). If a client ever presents a token whose session is *already* `revokedAt != null`, that can only mean the token was already used once before (normal rotation) and is now being replayed - which is the signature of a stolen refresh token. The response is to revoke **every** active session on that account (`revokeAllSessions(userId, 'refresh_token_reuse_detected')`) and log `auth.refreshTokenReuseDetected` to the audit trail, then reject the request. This is unit-tested (`auth.service.spec.ts`).

**Session endpoints** (all scoped to the caller's own `userId` - a user can never see or revoke another user's session, enforced by querying `WHERE id = :id AND userId = :callerId`, unit-tested):
- `GET /auth/sessions` - list active sessions/devices.
- `DELETE /auth/sessions/:id` - revoke one.
- `POST /auth/sessions/revoke-all` - revoke every session except the one making the call.

## 5. Web vs. mobile contract

One backend, one set of endpoints, branching behavior on a request header - not two parallel auth systems.

Send `X-Client-Platform: web` on `/auth/login`, `/auth/refresh`, `/auth/logout` to opt into **cookie mode**:
- The refresh token is set as an `httpOnly`, `SameSite=Lax`, `Secure` (in production) cookie named `dv_refresh`, scoped to `path=/{API_PREFIX}/auth` - and is **not** included in the JSON response body at all, reducing what an XSS payload could exfiltrate.
- A second, deliberately **non**-httpOnly cookie `dv_csrf` is set alongside it (see CSRF below).
- The access token is still returned in the JSON body - the SPA is expected to hold it in memory (not localStorage) and attach it as `Authorization: Bearer <token>`.

Any other value of the header, or its absence entirely (the default - what mobile/native and any existing API consumer gets), keeps the original **token-in-body mode**: both `accessToken` and `refreshToken` come back in the JSON response, for the client to store in platform-appropriate secure storage (iOS Keychain / Android Keystore) and send `refreshToken` explicitly in the request body on `/auth/refresh` and `/auth/logout`.

`/auth/login` and `/auth/refresh` responses both include `expiresIn` (seconds) alongside `accessToken` so either client type knows exactly when to refresh.

## 6. CSRF

Only cookie-mode `/auth/refresh` and `/auth/logout` need CSRF protection - every other endpoint authenticates via an `Authorization: Bearer` header, which a cross-site `<form>` or naive `fetch` cannot set without the browser first passing a CORS preflight this API's explicit `CORS_ORIGINS` allowlist would reject.

Defense used: **double-submit cookie**. `dv_csrf` is set as a normal (JS-readable) cookie at the same time as `dv_refresh`. The SPA reads it and must echo it back as an `X-CSRF-Token` header on `/auth/refresh`/`/auth/logout`; `CsrfService.verify()` rejects the request (`403 AUTH_CSRF_INVALID`) unless the header exactly matches the cookie. A cross-site attacker can trigger the cookie to be sent automatically, but cannot read its value to also set the matching header (same-origin policy), so the forged request fails. This only runs when a client is actually in cookie mode (i.e. the refresh token came from the cookie, not the request body) - token-in-body/mobile requests skip it entirely, since there is no cookie for CSRF to exploit.

## 7. CORS

`CORS_ORIGINS` (comma-separated) drives `app.enableCors()` in `main.ts`, with `credentials: true` (required for the cookie flow to work cross-origin between the web app's own origin and the API's origin). **In production, `CORS_ORIGINS` must be set to the exact web/admin origins** - the current default (empty -> reflects the request's Origin) is a development convenience only, called out again in `BACKEND_FREEZE_REPORT.md`. Mobile apps do not send an `Origin` header the same way browsers do and are unaffected by this configuration either way - native networking has no CORS concept, so nothing here weakens mobile security.

## 8. Email verification

- `POST /auth/register` automatically issues a verification token (24h expiry) and emails it (via Mailhog in dev).
- `POST /auth/email-verification/resend` (rate-limited, 5/min) re-issues one - always returns `{ requested: true }` whether or not the email exists or is already verified, to avoid account enumeration.
- `POST /auth/verify-email` consumes the token. Distinct error codes for an unknown token (`AUTH_TOKEN_INVALID`), an already-used one (`AUTH_TOKEN_ALREADY_USED`), and an expired one (`AUTH_TOKEN_EXPIRED`) - unit-tested.
- Login is **not** blocked for an unverified email (a deliberate UX choice, not an oversight - many products let a user browse/act while nudging them to verify; `emailVerified` is returned on `/auth/me` and the login response for the frontend to prompt with). Revisit this if the product requires stricter enforcement later.

Tokens are opaque random values, stored only as a SHA-256 hash (`EmailVerificationToken.tokenHash`) - the raw token is never persisted, only emailed once.

## 9. Password reset

- `POST /auth/request-password-reset` - always returns `{ requested: true }` regardless of whether the email exists (no enumeration). 1-hour token expiry.
- `POST /auth/reset-password` - consumes the token (same invalid/used/expired error codes as email verification), rehashes the password, and **revokes every active session on the account** (a full account-recovery flow assumes the old session state may be compromised, unlike a self-service change-password where the current session is trusted). Audited as `auth.passwordReset`.
- No development helper ever returns the raw reset/verification token in an API response - it only ever leaves the process via the mailer.

## 10. Change password (authenticated)

`POST /auth/change-password` - requires the current password (verified via Argon2, generic `AUTH_INVALID_CREDENTIALS` on mismatch, same as login). On success: rehashes, revokes every **other** active session, and explicitly keeps the session that made the request (`user.sessionId` from the JWT, threaded through). Audited as `auth.passwordChanged`.

## 11. Google OAuth

`passport-google-oauth20` strategy, registered unconditionally so the app still boots cleanly with no `GOOGLE_CLIENT_ID`/`SECRET` configured (the strategy just gets placeholder credentials and any real OAuth attempt fails at Google's end rather than crashing Nest at startup). `AuthService.findOrCreateGoogleUser` links to an existing password account by normalized email, or creates a new `User` with `emailVerifiedAt` set immediately (Google has already verified the address).

The callback (`GET /auth/google/callback`) is a browser-redirect flow: on success it sets the same httpOnly `dv_refresh` + readable `dv_csrf` cookies the web login path uses (tokens are **never** placed in the redirect URL's query string - that would leak through browser history, `Referer` headers, and server access logs) and redirects to `{APP_URL}/auth/callback?login=success`. The SPA landing on that page then calls `POST /auth/refresh` in cookie mode to mint its first access token.

**`> UNVERIFIED_EXTERNAL_CREDENTIAL`: this flow has not been exercised against a real Google Cloud OAuth app or real Google-issued tokens in this build session** - no credentials were configured, and Docker/network constraints in this sandbox (see `BACKEND_FREEZE_REPORT.md`) meant nothing end-to-end was run. The code is implemented and the account-linking logic is straightforward, but treat a first real Google login as needing manual verification before relying on it. A native-app (deep-link / AppAuth-style) Google flow is not implemented - only the browser-redirect flow above; that is a known gap for the mobile app team to raise if needed.

## 12. Rate limiting

`ThrottlerGuard` is registered globally via `APP_GUARD` (previously configured but **not actually applied** - this was a real gap found and fixed in this phase). Global default from `RATE_LIMIT_TTL`/`RATE_LIMIT_MAX` env vars (60s / 120 req). Sensitive auth endpoints get tighter, endpoint-specific overrides via `@Throttle()`:

| Endpoint | Limit |
|---|---|
| `POST /auth/register` | 5 / 60s |
| `POST /auth/login` | 10 / 60s |
| `POST /auth/refresh` | 20 / 60s |
| `POST /auth/email-verification/resend` | 5 / 60s |
| `POST /auth/request-password-reset` | 3 / 60s |
| `POST /auth/reset-password` | 5 / 60s |
| `POST /auth/change-password` | 5 / 60s |

These are per-IP by `ThrottlerGuard`'s default tracker (not per-account) since a pre-auth endpoint like `/login` has no authenticated identity to key on; this is a reasonable v1 default but does mean a shared-IP/NAT environment shares one bucket - worth revisiting with a smarter (IP+email composite) tracker if it causes false positives in practice.

## 13. Error codes

Every auth-specific error carries a machine-readable `code` in the standard error envelope (`{ success: false, error: { code, message } }`), defined in `auth-error-codes.ts`:

`AUTH_INVALID_CREDENTIALS`, `AUTH_EMAIL_NOT_VERIFIED` (reserved, not currently thrown - see section 8), `AUTH_EMAIL_ALREADY_REGISTERED`, `AUTH_SESSION_EXPIRED`, `AUTH_SESSION_REVOKED`, `AUTH_ACCOUNT_SUSPENDED`, `AUTH_ACCOUNT_DISABLED`, `AUTH_FORBIDDEN`, `AUTH_RATE_LIMITED` (thrown by `ThrottlerGuard`'s own default response), `AUTH_TOKEN_INVALID`, `AUTH_TOKEN_EXPIRED`, `AUTH_TOKEN_ALREADY_USED`, `AUTH_REFRESH_REUSE_DETECTED`, `AUTH_REFRESH_TOKEN_MISSING`, `AUTH_CSRF_INVALID`.

## 14. What is and isn't verified

Everything in this document is backed by unit tests run against a mocked Prisma client (`pnpm --filter @dauviet/api test` - 62/62 passing as of this phase, up from 17). **No live database, live Redis, or live Google OAuth exchange has been exercised** - see `BACKEND_FREEZE_REPORT.md` for exact command evidence and the Docker/WSL2 blocker. Treat this document as an accurate description of the code as written, not as proof it behaves identically against a real Postgres instance until the live checks listed there are actually run.
