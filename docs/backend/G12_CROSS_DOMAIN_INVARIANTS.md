# G12 — Cross-Domain Invariant Matrix

Audience: the freeze reviewer. Each row is an invariant that only holds if two or more G00–G11
domains cooperate. "Proof" names the real-HTTP / real-PostgreSQL test in
`apps/api/test/g12-certification.e2e-spec.ts` (section §n), a G12 script, or the accepted phase
suite that already proves it (re-run green in the G12 full e2e run). Phase-local invariants that do
not cross a domain boundary stay with their phase reports.

## Domain interaction map

```
 G01 geography ──┬── G03 knowledge ── G11 search/map projection (read-only, rebuildable)
                 ├── G04 discovery ──┘         ▲
 G02 provider policy ── G05 offers ─┐          │ public corpus allowlist only
          │            G10 affiliate ┼── Trip (G06) ── G07 members ── G08 location
          └── G06.5 ingestion        │                     └────────── G09 expense/settlement
                                     └─ commission never enters G09
```

## Matrix

| # | Invariant | Domains | Proof | Result |
|---|---|---|---|---|
| X01 | Knowledge of an id is never authorization: unrelated user, pending invitee and removed member are denied on **every** trip route (29 routes incl. members, invitations, activity, location, expenses, settlements, estimates, itinerary), with no data in the body and no state change | G06–G09 | §2 IDOR sweep | PASS |
| X02 | Cross-trip sub-resource confusion: T2's owner addressing T1's expense/member/invitation/day ids through T2 paths gets 404 and T1 is untouched | G06–G09 | §2 | PASS |
| X03 | Trip role grants no commercial or admin authority (owner/editor/viewer → 403 on affiliate reporting, provider admin, search admin, audit) | G07, G10, G11 | §2 | PASS |
| X04 | A click may reference a trip only for a current participant (anonymous/unrelated/removed → 403) | G07, G10 | §2 | PASS |
| X05 | Same-JWT next-request revocation after role downgrade, member removal, trip archive, location stop, account suspension | G02 auth, G07, G08, G09 | §3 | PASS |
| X06 | G02 is the execution authority across domains: provider SUSPENDED → next G05 offer read empty **and** next G10 click 403; restore → both work; no restart | G02, G05, G10 | §3 | PASS |
| X07 | License revocation stops an already-issued redirect token on its next use (G12 fix) | G02, G10 | §6 race + unit | PASS |
| X08 | IngestionCandidate != canonical entity: an unaccepted candidate never appears in search, map, places, facts | G06.5, G03, G11 | §4 | PASS |
| X09 | PROVIDER DATA != VERIFIED KNOWLEDGE: no provider entity/offer kind exists in the search projection; provider reference ids are unsearchable | G05, G11 | §4 | PASS |
| X10 | Offer != click != conversion != booking != expense: click and redirect create no conversion; conversion creates no expense; commission/booking amounts never appear in the trip ledger | G05, G10, G09 | §4, smoke | PASS |
| X11 | Planned cost != actual expense != settlement: recording expenses never changes a cost estimate | G06, G09 | §4 | PASS |
| X12 | No implicit FX: per-currency totals and balances, conservation (sum of nets = 0, exact Decimal), suggestions never cross currencies | G09 | §4, smoke | PASS |
| X13 | Money integrity at the database: negative share / zero settlement / out-of-range coordinate rejected even for a direct writer (G12 CHECKs) and by the API (G12 fix) | G08, G09 | §4 | PASS |
| X14 | Trust workflow survives on a migration-built database: citation create writes its `EntityKind.FACT` audit row (G12 enum fix) | V1 trust, audit | §4, Path B smoke (500 before, 201 after) | PASS |
| X15 | Membership != location consent; a member who never started sharing has no coordinate | G07, G08 | §5 | PASS |
| X16 | Private G08 coordinate never reaches: public search (queried by its digits), map (tight bbox, every layer), trip activity, expense list/summary, affiliate responses, audit metadata, collaboration events, validation/error bodies, OpenAPI, logs | G08 × G09 × G10 × G11 × audit | §5, §10 | PASS |
| X17 | Private trips/expenses/affiliate rows are never searchable (title/id) | G06–G10, G11 | smoke, G11 privacy e2e | PASS |
| X18 | Removal is permanent and cleans location in the same transaction even when racing expense create and location update | G07, G08, G09 | §6 | PASS |
| X19 | Archive races location update / expense update: no 5xx; after archive nothing mutates | G06, G08, G09 | §6 | PASS |
| X20 | Ownership transfer racing removal of the new owner: never both, one owner, no 5xx, **no deadlock** (G12 lock-order fix) | G07 (× G09 lock order) | §6 | PASS |
| X21 | Lock-order stress (10 bursts × 7 concurrent mutations across Trip/TripMember/TripLocationSharing/TripMemberLocation/TripExpense/TripExpenseShare/TripSettlement): no deadlock surfaces, no 5xx, every expense's shares sum to its amount | G07, G08, G09 | §6 | PASS |
| X22 | Conversion ingestion idempotent under concurrent duplicates; older evidence cannot override newer | G10 | §6 | PASS |
| X23 | Search projection is disposable: rebuild racing publish/unpublish converges to publication state; rebuild never changes canonical data; wipe + rebuild converges | G03, G11 | §6, Path A | PASS |
| X24 | Current geography != historical territory; no sovereignty inference from centroid/bbox/nearest country/provider country | G01, G03, G11 | accepted G11 e2e (re-run green) | PASS |
| X25 | Chronology: UNKNOWN != active in every period; seeded events/eras/dynasties now filter correctly (before/overlap/after/boundary/ongoing) | G03, G11, seed | `g12-evidence/chronology-search-proof.txt`, parity spec | PASS |
| X26 | Redis is never an authority: wiping the app's Redis namespace changes no search/map result; Redis loss loses only queued media/ingestion jobs | G11, media, G06.5 | search-map e2e, Path D | PASS |
| X27 | Time semantics: date-only fields round-trip under UTC / Asia/Bangkok / America/New_York incl. a DST range; offset timestamps stored as the same UTC instant; capturedAt ≠ receivedAt | G06, G08, G09 | §8 under three TZ | PASS |
| X28 | Error contract uniform across domains (400/401/403/404/409/413/429/503/500 envelope with string message + requestId); no internals in 5xx | all | §7, filter spec | PASS |
