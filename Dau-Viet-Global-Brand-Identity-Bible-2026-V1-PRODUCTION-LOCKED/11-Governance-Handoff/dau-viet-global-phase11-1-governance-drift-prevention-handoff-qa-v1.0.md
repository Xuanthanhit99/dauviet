# DẤU VIỆT GLOBAL — PHASE 11.1
## Governance, Drift Prevention & Handoff QA V1.0

### Result
**PASS WITH IMPLEMENTATION RULES — READY FOR PHASE 11 PRODUCTION LOCK**

Phase 11 survives practical drift and handoff scenarios. The governance model is strong enough to protect Production-Locked Phases 01–10 without preventing legitimate implementation fixes.

### Drift scenario QA

| Scenario | Expected result | Governance behavior |
|---|---|---|
| Agent redraws locked logo | **BLOCK** | Major change requires explicit RE-OPEN; implementation agent has no redesign authority. |
| Developer copies/edits SVG locally | **BLOCK** | Consumer must reference canonical registered asset; copied derivative cannot become master. |
| Token fork inside app code | **BLOCK** | Semantic tokens must resolve to canonical package; local forks require approved exception or upstream change. |
| Deprecated asset still consumed | **BLOCK RELEASE** | CI/release gate identifies consumer and successor migration before retirement. |
| CMS evidence media lacks provenance | **BLOCK PUBLISH** | Required MediaAsset classification/provenance is a data/editorial issue; frontend cannot infer it. |
| Emergency accessibility/truth fix | **ALLOW + RECONCILE** | Ship scoped correction when necessary; document owner/risk and reconcile canonical baseline immediately after. |
| Generated iOS/Android export differs | **REGENERATE** | Platform exports derive from canonical master; generated outputs are not hand-edited. |
| Marketing uses old logo export | **BLOCK** | External package must resolve to current Production-Locked registry version. |
| Locale causes clipping | **FIX IMPLEMENTATION** | Reflow/layout correction is Patch if semantics/hierarchy stay unchanged; do not shrink below typography contract. |
| Reduced-motion regression | **BLOCK RELEASE** | Signature interactions must retain static/full factual meaning under reduced motion. |
| Visual regression from token update | **REVIEW** | Compare intended token change and affected locked surfaces; unexplained drift blocks release. |
| Temporary exception expires | **BLOCK / RENEW REVIEW** | Exception cannot silently become precedent; renew with owner/risk or remove. |

### Design → Code
**PASS.** Implementation handoff is canonical-ID driven: token manifest, canonical SVG/icon assets, state/responsive rules, locale contracts and accessibility notes. Screenshots may explain intent but cannot identify the production master by themselves.

### CMS → Frontend
**PASS WITH GATE.** Evidence-sensitive media must carry the required MediaAsset relation, classification, rights/provenance and disclosure. Missing provenance blocks publication rather than triggering frontend inference.

### Claude / Codex
**PASS WITH RULE.** Claude consumes backend/CMS/domain/content contracts and does not invent UI semantics. Codex consumes canonical assets/tokens plus locked UX baselines and may correct implementation defects but has no authority to redesign locked phases.

### Platform exports
**PASS WITH RULE.** iOS, Android and Web derivatives are generated from canonical masters. A platform-specific exported file may be replaced by regeneration, never by silently hand-editing it into a new master.

### Change-control test
**Patch:** allowed when semantic meaning, geometry and hierarchy remain unchanged and QA evidence exists.

**Minor:** compatible addition/variant with owner review and QA.

**Major:** locked geometry/semantics/hierarchy/governing principle changes require explicit **RE-OPEN** and impact review.

**Emergency:** legal, safety, truth or accessibility fixes may ship quickly but still require owner, documentation, follow-up QA and canonical reconciliation.

### Exception test
**PASS WITH RULE.** Exceptions are scoped, owned, risk-documented and time-bounded. An expired exception cannot silently become precedent; it must be removed or explicitly renewed.

### Release gates
A brand-aware release checks canonical asset resolution, deprecated usage, visual regression, locale/text scaling, reduced motion and provenance/disclosure. Registry snapshot, shipped versions, known exceptions and deprecations are reflected in release/changelog records.

### Required production rules for lock
1. Canonical registry ID + version, not filename or screenshot, determines production asset identity.
2. Production consumers may not create or promote local derivative masters of locked logo, icon, token or motion assets.
3. Any change to locked geometry, semantic meaning, product hierarchy or governing principle is Major and requires explicit RE-OPEN plus impact review.
4. Patch corrections are permitted only when they preserve locked semantics/hierarchy and include focused QA evidence.
5. Deprecated assets/tokens require a named successor and consumer migration; unresolved production consumers block retirement/release as applicable.
6. Evidence-sensitive media missing required classification, entity relation, rights/provenance or disclosure cannot be published, and frontend inference is prohibited.
7. Generated platform exports are reproducible derivatives of canonical masters and are regenerated rather than manually patched.
8. Exceptions are registered, scoped, owned, risk-documented and time-bounded; expiry requires removal or explicit renewal review.
9. Critical release gates include canonical asset resolution, deprecated usage, visual regression, locale/text scaling, reduced motion and provenance/disclosure.
10. Emergency legal, safety, truth or accessibility fixes may bypass normal cadence but not documentation, ownership, follow-up QA or canonical reconciliation.
11. Claude/Codex implementation prompts and tickets identify locked baselines, canonical IDs/files, allowed changes, prohibited redesign and required QA evidence.
12. A release is not brand-complete until the registry/changelog reflects shipped versions and all known exceptions/deprecations are reconciled or explicitly carried.

### Decision
**Phase 11 is READY FOR PRODUCTION LOCK** with all twelve rules included in the baseline.

With Phase 11 locked, Phases 01–11 form an enforceable core Brand Identity Bible rather than a collection of visual references.
