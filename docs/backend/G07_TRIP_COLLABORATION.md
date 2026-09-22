# G07 — Trip Collaboration

Global Phase G07, Global Backend V2 Extension. Turns G06's private, single-owner `Trip` into a
controlled collaborative workspace. Full audit/design rationale:
`docs/backend/G07_PRE_IMPLEMENTATION_REPORT.md`. Full gate-by-gate evidence:
`docs/backend/G07_FINAL_REPORT.md`.

## 1. Canonical laws preserved

`Trip.ownerId` remains the sole ownership authority. The owner is **never** materialized as a
`TripMember` row — there is exactly one ownership truth, never two rows that could disagree.
Membership != invitation != public share link: a `PENDING` invitation grants zero access; only
`Trip.ownerId` or an `ACCEPTED`-derived `TripMember` row does. No public/anonymous trip link exists
anywhere in this phase.

## 2. Data model (additive — 3 tables, 3 enums, 3 `EntityKind` values)

- **`TripMember`** — `tripId`, `userId`, `role` (`EDITOR | VIEWER` — never `OWNER`), `joinedAt`.
  `@@unique([tripId, userId])`.
- **`TripInvitation`** — `tripId`, `inviterId`, `email` (normalized), `role`, `status`
  (`PENDING|ACCEPTED|DECLINED|REVOKED|EXPIRED`), `tokenHash` (`@unique`, SHA-256 of a 256-bit random
  token — the raw token is never persisted), `expiresAt`, `acceptedAt`/`acceptedByUserId`,
  `declinedAt`, `revokedAt`. A hand-added partial unique index enforces **at most one `PENDING`
  invitation per `(tripId, email)`** at the database level (Prisma's DSL has no native primitive for
  this).
- **`TripCollaborationEvent`** — member-facing activity history, explicitly distinct from the
  security `AuditLog`. `actorSnapshotName` captures the actor's display name at write time so
  history stays readable after that member leaves. `metadata` is minimal structured data, never a
  full before/after dump.

## 3. Authorization — `TripAuthorizationService`

The single centralized capability layer (`TripCapability`: `VIEW_TRIP`, `EDIT_TRIP`,
`GENERATE_ESTIMATE`, `MANAGE_MEMBERS`, `MANAGE_INVITATIONS`, `TRANSFER_OWNERSHIP`, `ARCHIVE_TRIP`).
Resolves an effective role fresh from Postgres on every call — `OWNER` (virtual, `trip.ownerId ===
userId`) or the caller's stored `TripMember.role` — and checks it against a fixed permission matrix.
Existence is never hidden: a missing trip is `404 TRIP_NOT_FOUND`; an existing trip the caller has
insufficient (or no) relationship to is `403 TRIP_PERMISSION_DENIED` — the *same* code either way,
so the response never reveals "you have some relationship, just not enough."

`TripsService.getOwnedOrThrow`/`getOwnedActiveOrThrow` are now capability-parameterized thin
wrappers around this service — every G06 call site (`TripItineraryService`,
`TripCostEstimatesService`) changed only its capability argument, never its control flow.

| Capability | OWNER | EDITOR | VIEWER |
|---|---|---|---|
| VIEW_TRIP | yes | yes | yes |
| EDIT_TRIP | yes | yes | no |
| GENERATE_ESTIMATE | yes | yes | no |
| MANAGE_MEMBERS | yes | no | no |
| MANAGE_INVITATIONS | yes | no | no |
| TRANSFER_OWNERSHIP | yes | no | no |
| ARCHIVE_TRIP | yes | no | no |

Self-promotion and owner-removal via the generic member endpoints are **structurally** impossible,
not merely blocked by an extra check: the owner never has a `TripMember` row to target.

## 4. Invitation lifecycle

Token pattern duplicates `AuthService`'s existing opaque-token/SHA-256-hash design locally (that
service is locked Phase-02 code, not touched). `POST /v1/trip-invitations/accept` and `.../decline`
take the token in the **request body** — a deliberate deviation from a path-param sketch, matching
this repo's own `/verify-email`/`/reset-password` precedent so a bearer secret never appears in a
URL/access log/referrer header.

Acceptance and decline both use a conditional `updateMany` (`WHERE status = 'PENDING'`) rather than
a read-then-write pair — this, not the earlier friendly pre-check, is what makes concurrent
double-accept structurally impossible (live-proven: two truly simultaneous accept requests for the
same token, exactly one succeeds, the other gets a clean `TRIP_INVITATION_NOT_PENDING`, and exactly
one `TripMember` row exists afterward). Recipient binding requires the accepting user's own email to
match the invitation's normalized target — never let a leaked invitation be accepted by the wrong
account. Expiry is evaluated lazily at touch time (checked server-side, transitions `PENDING` →
`EXPIRED` in the DB the first time a stale row is read) — no background scheduler needed.

## 5. Ownership transfer

`TripMembersService.transferOwnership` — atomic in one transaction, safety carried entirely by a
conditional `updateMany` (`WHERE id = tripId AND ownerId = <current caller> AND version =
<expected>`). Two concurrent transfer attempts can never both succeed: whichever commits first
changes `ownerId`/`version`, so the second's WHERE clause matches zero rows. Live-proven with two
truly simultaneous transfer requests from the same owner to two different targets — exactly one
succeeded, the other failed cleanly, and the resulting DB state had exactly one owner, the old owner
correctly demoted to a fresh `EDITOR` row, and the new owner correctly had no `TripMember` row of
their own.

## 6. Collaboration activity

Member-facing history (`TripCollaborationEventType`: `MEMBER_JOINED`, `MEMBER_LEFT`,
`MEMBER_REMOVED`, `ROLE_CHANGED`, `OWNERSHIP_TRANSFERRED`, `INVITATION_ACCEPTED`, `TRIP_UPDATED`,
`DESTINATION_CHANGED`, `DAY_CHANGED`, `ITEM_CHANGED`, `TRANSPORT_CHANGED`), written in the same
transaction as its triggering governance mutation. `GET /v1/trips/:id/activity` is `VIEW_TRIP`-gated
(a real gap found and fixed during implementation — the route was initially wired without this
check; see the Final Report's defect log), paginated `createdAt DESC` with a stable `id` tie-breaker,
never unbounded.

## 7. Archive interaction

Preserves G06's non-destructive archive semantics exactly. An archived trip: remains readable;
rejects new invitations (`409 TRIP_ARCHIVED`); rejects accepting an existing pending invitation
(`409 TRIP_ARCHIVED`); rejects planning edits and role/member mutations. Archiving never deletes
members or activity history — archive is not membership deletion.

## 8. Scope exclusions (explicit)

No G08 location fields anywhere in `TripMember`. No `Expense`/`Split`/`Settlement`/`Payment`/`Wallet`
models. No affiliate/booking tracking. No free-form chat — collaboration activity is structured
history, not messaging. New-canonical-entity creation is unaffected — G07 only adds *who can act on
an existing Trip*, never *what a Trip can reference*.
