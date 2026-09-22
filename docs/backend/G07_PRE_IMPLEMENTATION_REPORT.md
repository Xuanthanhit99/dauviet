# G07 Pre-Implementation Report — Trip Collaboration

Status: **DRAFT FOR IMPLEMENTATION** (precedes any schema/migration/code change).

## 1. Branch/HEAD/working-tree state

Branch `main` @ `9a16e4a9880c38a1ff973ec1dd1fb069b1445c01`, identical to `origin/main` — same
baseline as the G06.5 closure pass. 39 pre-existing working-tree entries, already fully classified
in `docs/backend/G06_5_WORKING_TREE_MANIFEST.md`. This report respects that classification exactly:
`apps/web/*`, `docs/brand/*`, `packages/brand-contracts/*`, `pnpm-lock.yaml` (unrelated concurrent
work) and `pnpm-workspace.yaml` (unknown ownership) are not touched by G07.

## 2. Concurrent-owned files/directories (not touched by G07)

`apps/web/app/components/`, `apps/web/app/journeys/`, `apps/web/qa-evidence/`,
`apps/web/tests/journey-detail-v3.spec.ts`, `apps/web/.gitignore`, every modified `apps/web/*`/
`docs/brand/*`/`packages/brand-contracts/*` file, `pnpm-lock.yaml`, `pnpm-workspace.yaml`. G07 adds
no new npm dependency, so no genuine reason to touch any of these is expected to arise.

## 3. Current G06 Trip authorization architecture (audited)

- **Single choke point already exists**: `TripsService.getOwnedOrThrow(tripId, userId)` — fetch by
  bare id (404 if missing), then `trip.ownerId !== userId` → 403 (`TRIP_NOT_OWNER`). Existence is
  never hidden (Pattern B, matches `Contribution`/`Comment`). `getOwnedActiveOrThrow` adds an
  archived check. `assertMutable(trip, expectedVersion)` adds archive + optimistic-concurrency
  (`version`) checks.
- **Every sub-resource already funnels through it**, confirmed by direct grep — no duplicated
  ownership logic anywhere:
  - `TripsService` itself: `findOwned`, `update`, `archive`, `list` (list is `where: { ownerId }`,
    the one place list-scoping needs its own change, not a `getOwnedOrThrow` call).
  - `TripItineraryService.loadMutableTrip` (single private choke point) → `replaceDestinations`,
    `replaceDayItems`, `reorderDayItems`, `replaceTransportLegs`.
  - `TripCostEstimatesService.generate` (via `getOwnedActiveOrThrow`), `.list`/`.latest` (via
    `getOwnedOrThrow`).
- **Trip.ownerId → User is `onDelete: Cascade`** — the pre-existing, documented, non-blocking
  cascade-ordering risk (`docs/backend/BACKEND_HANDOFF.md` "Known deferred"). G07 does not touch
  this relation or its `onDelete` behavior, per brief section 60/61/89.
- `Trip.version: Int` (optimistic concurrency, 409 on mismatch) and `Trip.archivedAt: DateTime?`
  (non-destructive archive, independent of `TripStatus`) are exactly the primitives G07 reuses
  unchanged.

## 4. Token/hashing infrastructure (audited, directly reusable pattern)

`AuthService` already implements the *exact* pattern this brief asks for, for
`EmailVerificationToken`/`PasswordResetToken`:

```ts
private hashToken(token: string): string { return crypto.createHash('sha256').update(token).digest('hex'); }
private generateOpaqueToken(bytes = 32): string { return crypto.randomBytes(bytes).toString('base64url'); }
```

Raw token generated → delivered via `MailerService` → only `SHA-256(token)` persisted
(`tokenHash String @unique`) → lookup-by-hash on use → `consumedAt`/`expiresAt` checked → single-use
enforced by setting `consumedAt`. `requestPasswordReset` already demonstrates the exact
"do not reveal whether the account exists" discipline (brief section 90) this phase needs for
invitations. **G07 duplicates this ~10-line pattern locally in the new
`TripInvitationsService`** rather than refactoring `AuthService` to export it — `AuthService` is
locked V1/Phase-02 code; extracting a shared util for two call sites is not worth touching it.

## 5. Email infrastructure (audited)

`MailerService` (`modules/mailer/mailer.service.ts`) wraps `nodemailer`, reads SMTP config from
`AppConfig.smtp`, has two existing template methods (`sendEmailVerification`, `sendPasswordReset`),
each building a link from `AppConfig.appUrl` (never a client-supplied URL — satisfies brief section
96 automatically by following this exact precedent) and calling a private `send()` that
**swallows/logs send failures rather than throwing** — membership/invitation correctness must not
(and, following this precedent, will not) depend on email delivery succeeding (brief section 49). A
third method, `sendTripInvitation`, is added following the identical shape.

## 6. Auth/session/RBAC (audited)

`AuthUser` (`{id, email, roles, sessionId}`) is re-derived **fresh from Postgres on every request**
by `JwtStrategy.validate` — the JWT itself carries only `sub`/`sid`, nothing role- or
membership-shaped. This means brief section 67/68/69's "no stale role cache, re-login not required"
requirement is satisfied **for free** by the existing architecture, as long as G07's own trip-role
resolution also queries fresh on every request (it does — see section 8 below) rather than caching
anything. Platform `Role` enum (`USER/CONTRIBUTOR/EDITOR/HISTORIAN_REVIEWER/MODERATOR/ADMIN`) is
unrelated to trip-scoped roles — reusing its `EDITOR` name for a trip role would be a confusing
collision, so G07 introduces its own `TripMemberRole` enum (see section 8).

## 7. Rate limiting (audited)

`ThrottlerModule` is already global (`app.module.ts`), default limits from `AppConfig.rateLimit`;
individual routes override via `@Throttle({ default: { limit: N, ttl: 60_000 } })` — auth's own
sensitive routes range from 3/min (`request-password-reset`) to 20/min (`login`). G07 mirrors this:
invitation creation and accept/decline get their own tight `@Throttle` overrides.

## 8. Proposed `TripMember` representation (decision, per brief section 7/8)

**Owner is NOT materialized as a `TripMember` row.** `Trip.ownerId` stays the sole ownership
authority (brief section 7's explicit permission to skip materialization when it "does not
materially simplify queries" — here it would only add a transactional-consistency burden with no
query benefit, since every existing owner check already reads `Trip.ownerId` directly). Consequence:
`TripMemberRole` (the DB enum) has exactly two values, `EDITOR | VIEWER` — never `OWNER`. Effective
role is resolved by a single rule: `userId === trip.ownerId → OWNER (virtual)`, else look up
`TripMember` → its `role`, else **no relationship** (view/edit denied, existence still not leaked
per section 11). This keeps exactly one ownership truth, exactly as section 7 mandates.

## 9. Proposed invitation token design

Mirrors section 4/15/16 exactly: `crypto.randomBytes(32).toString('base64url')` (256 bits of
entropy) generated once, delivered via email, **only** `SHA-256(token)` persisted as
`TripInvitation.tokenHash String @unique`. Never logged (checked at code-review time — no
`console.log`/`Logger` call anywhere touches the raw token or its hash). Never returned by any list/
detail API after creation (the create-invitation response DTO omits `tokenHash` entirely — see
section 75 discipline below). Single-use via `status` transition (not a separate `consumedAt`,
since invitations need 5 states, not a binary consumed flag — see section 14).

## 10. Proposed permission layer

New `TripAuthorizationService` (single new home for all trip-scoped authorization, addressing brief
section 10's explicit "centralize to prevent controller/service drift"):

```ts
enum TripCapability { VIEW_TRIP, EDIT_TRIP, GENERATE_ESTIMATE, MANAGE_MEMBERS, MANAGE_INVITATIONS, TRANSFER_OWNERSHIP, ARCHIVE_TRIP }

async authorize(tripId: string, userId: string, capability: TripCapability): Promise<{ trip: Trip; role: 'OWNER' | TripMemberRole }>
```

Fetches the trip fresh (404 if missing — existence never hidden), resolves effective role per
section 8's rule, checks the static permission matrix (section 9 of the brief, transcribed verbatim
into a `PERMISSION_MATRIX: Record<Role, Set<TripCapability>>` constant), throws
`TRIP_PERMISSION_DENIED` (new code) if the capability isn't granted. **`TripsService.getOwnedOrThrow`/
`getOwnedActiveOrThrow` become thin wrappers delegating to this service** (`getOwnedOrThrow(tripId,
userId, capability = VIEW_TRIP)`), preserving their exact existing call shape/name for
`TripItineraryService`/`TripCostEstimatesService` — only each call site's *capability argument*
changes (e.g. itinerary mutations pass `EDIT_TRIP`, estimate generation passes
`GENERATE_ESTIMATE`), never the surrounding control flow. This is the mechanical, low-risk way to
satisfy "do not replace every owner check with 'is member' mechanically" while still centralizing
the real decision in one new service.

## 11. Proposed collaboration event design

`TripCollaborationEvent` — `tripId`, `type` (11-value enum, verbatim from brief section 39),
`actorUserId` (nullable, `onDelete: SetNull` — never blocks a future user-lifecycle decision),
`actorSnapshotName` (the actor's `displayName` captured **at write time**, so history stays readable
after a member leaves — brief section 41), `metadata: Json?` (minimal structured data only, e.g.
`{newRole: "EDITOR"}` — never a full before/after Trip dump, brief section 83), `createdAt`. Written
in the *same* transaction as its triggering mutation wherever that mutation is
membership/security-relevant (join/leave/remove/role-change/ownership-transfer/invitation-accepted —
brief section 85), using the Phase 12.1 `AuditService`-style `db: Db = this.prisma` transaction-
threading pattern throughout (`TripCollaborationEventService.record(entry, db)`). Lower-value
planning events (`TRIP_UPDATED`/`DESTINATION_CHANGED`/`DAY_CHANGED`/`ITEM_CHANGED`/
`TRANSPORT_CHANGED`) are also written in the same transaction as their mutation for consistency
(no reason to treat them differently given the pattern already exists) but are explicitly documented
as non-critical — a hypothetical future failure there is not held to the same "must never silently
fail" bar as governance events.

## 12. Proposed migration

One new additive migration: 3 tables (`TripMember`, `TripInvitation`, `TripCollaborationEvent`), 3
new enums (`TripMemberRole`, `TripInvitationStatus`, `TripCollaborationEventType`), 3 additive
`EntityKind` values (`TRIP_MEMBER`, `TRIP_INVITATION`, `TRIP_COLLABORATION_EVENT`), plus one
hand-added partial unique index (`TripInvitation` — see below) the Prisma schema DSL cannot express
natively. No existing table/migration touched. Generated via the G06.5-incident-mandated
`scripts/db/safe-migrate-diff.ts` (file-to-file mode, no shadow database), per brief section 99.

**Documented invariant (brief section 57)**: at most one `PENDING` `TripInvitation` per
`(tripId, email)` pair, enforced by a partial unique index —
`CREATE UNIQUE INDEX ... ON "TripInvitation"("tripId", email) WHERE status = 'PENDING'` — hand-added
to the generated migration SQL (Prisma's schema DSL has no partial-unique-index primitive; this is
the standard, well-established Postgres pattern for "unique among only the active/pending subset").
`TripMember` uses a plain `@@unique([tripId, userId])` (brief section 6/56) — no partial index
needed since a membership row's mere existence *is* "active."

## 13. Expected API surface (repository-convention-driven, deviates from the brief's "conceptual" paths where justified)

```
GET    /v1/trips                              (evolves: OWNED + MEMBER trips, distinguished)
GET    /v1/trips/:id/members
PATCH  /v1/trips/:id/members/:memberId         (role change)
DELETE /v1/trips/:id/members/:memberId         (remove)
POST   /v1/trips/:id/leave
POST   /v1/trips/:id/transfer-ownership

POST   /v1/trips/:id/invitations
GET    /v1/trips/:id/invitations
DELETE /v1/trips/:id/invitations/:invitationId  (revoke)

POST   /v1/trip-invitations/accept              ({ token } in body)
POST   /v1/trip-invitations/decline             ({ token } in body)

GET    /v1/trips/:id/activity
```

**Deviation (documented, brief section 73/107 explicitly invite this)**: accept/decline take the
token in the **request body**, not the URL path. Verified against this repo's own existing
convention — `POST /verify-email` and `POST /reset-password` both already take their token in the
body (`VerifyEmailDto`/`ResetPasswordDto`), never in the URL, specifically so a bearer secret never
appears in an access log, browser history, or referrer header. G07's invitation token, being an
equally sensitive bearer secret, follows the exact same precedent rather than the brief's own
"conceptual" `:token` path-param sketch.

## 14. Risks

1. **Scope**: comparable to G06.5's own scope (full RBAC + secure token lifecycle + real Postgres
   concurrency proofs for ownership transfer + a full E2E authorization/invitation matrix). Proceeds
   in stages: schema → authorization service → membership/invitation services → itinerary/estimate
   call-site updates → controllers/DTOs → activity feed → live proofs → regression → docs.
2. **`getOwnedOrThrow` call-site churn**: touches `TripsService`, `TripItineraryService`,
   `TripCostEstimatesService` — small, mechanical, single-parameter changes at each site (add the
   right `TripCapability`), not a rewrite. Full existing G06 unit/e2e suite is the regression
   backstop.
3. **Partial unique index**: requires hand-editing generated migration SQL (same discipline already
   proven safe in G06.5's own migration). No risk to the safe-migrate-diff tooling itself.
4. **Real concurrency proofs** (ownership transfer race, concurrent invitation acceptance) require
   genuine two-in-flight-request tests against real Postgres — more involved to write correctly than
   a simple mocked unit test, budgeted accordingly.

## 15. Acceptance gate count

Estimated 115–130 gates (the brief's own ~130 numbered sections map close to 1:1), finalized as the
canonical `G07-GATE-001`-onward manifest once implementation specifics are concrete, in
`G07_FINAL_REPORT.md`, matching the G06.5 precedent.

---

Per the brief's section 124, implementation continues autonomously from here unless a genuine STOP
condition (ambiguous file ownership, a modified accepted migration, a discovered secret, evidence
contradicting a report, or unrelated-file entanglement) is hit.
