# DẤU VIỆT GLOBAL — PHASE 11
## Brand Governance, Asset Architecture & Production Handoff V1.0

### Status
**PRODUCTION CANDIDATE**

### Purpose
Phase 11 converts Production-Locked Phases 01–10 from a set of approved design decisions into an enforceable production system. Its job is to prevent drift between design, code, CMS, editorial, Web, iOS, Android and marketing.

### Source of truth
The canonical hierarchy is:
1. Brand Identity Bible + explicit phase lock records.
2. Versioned code tokens and canonical asset packages.
3. Backend/CMS MediaAsset records for real media/provenance.
4. Locked UX baselines for product structure.

A screenshot, generated mockup, campaign export, copied SVG or local public-folder asset **never becomes a new source of truth**.

### Asset Registry
Every production asset receives a canonical registry record with:
`assetId`, canonical name, class, phase owner, version, status, source file, exports, platform usage, locale/theme, provenance/rights when relevant, successor/deprecation metadata.

Asset classes include logo, app icon, favicon, color/type token, domain icon, map marker, motion token, media, editorial graphic, store/marketing asset and template.

Lifecycle:
**DRAFT → CANDIDATE → APPROVED → PRODUCTION_LOCKED → DEPRECATED → RETIRED**

Recommended naming:
`dvg-{class}-{semantic-name}-{variant}-v{major}.{minor}.{ext}`

### Ownership
**Brand/Design:** identity geometry, visual semantics, lock decisions.  
**Product/UX:** information architecture and experience hierarchy.  
**Engineering:** faithful implementation, token/asset consumption and runtime QA.  
**Editorial/Research:** historical claims, evidence and source approval.  
**Media/CMS:** entity relation, rights, classification and transformations.  
**Marketing:** approved external composition/copy inside Phase 10.

No team or agent silently overrides another owner's locked authority.

### Change control
**Patch:** implementation correction with no semantic, geometry or hierarchy change. Document + test.

**Minor:** backward-compatible addition or approved variant. Owner review + QA.

**Major:** changes locked geometry, semantic meaning, hierarchy or governing principle. Requires an explicit re-open decision plus impact review.

**Emergency:** legal, safety, truth or accessibility correction may move faster, but it must be documented and reconciled into the canonical baseline.

Silent redesign inside an implementation PR is prohibited.

### Design → Code handoff
Every implementation package should provide:
- token manifest,
- canonical SVG/icon sprite,
- responsive/state rules,
- locale contracts,
- accessibility rules,
- canonical IDs and version.

Implementation tickets reference canonical IDs/files, not screenshots alone.

### CMS → Frontend handoff
Evidence-sensitive media passes `MediaAsset ID + entity relation + media class + rights/provenance + disclosure + transformation history`. Frontend renders this contract and never invents missing provenance.

### Repository architecture
Recommended shared packages:
- `/packages/brand-tokens`
- `/packages/brand-assets`
- `/packages/brand-icons`
- `/packages/brand-motion`
- `/packages/brand-contracts`
- `/docs/brand/locks`
- `/docs/brand/qa`

Platform exports may be generated from canonical masters. Generated output is never manually edited as the new master.

### CI / production gates
CI should detect unknown logo assets, deprecated token usage, malformed canonical SVG/icon exports and critical visual regressions. Evidence-sensitive media cannot publish without required classification/provenance. Critical templates receive locale overflow/text-scaling and reduced-motion checks.

Release-critical canonical assets should be version/checksum verified.

### Exceptions
Every exception records owner, reason, affected surface, waived rule, risk, expiry/review date and approval. Exceptions are scoped and temporary. Repeated exceptions trigger a system review instead of becoming undocumented precedent.

### Deprecation
Never silently replace or delete a locked asset. Mark it deprecated, identify the successor, migrate consumers and then retire it. Major asset/token changes require migration notes.

### AI-agent production handoff
**Claude** owns backend/CMS/domain enforcement within the already locked implementation ownership. It consumes brand/content contracts and does not invent frontend visual semantics.

**Codex** consumes canonical assets/tokens plus locked UX baselines for Web/mobile implementation. It may correct implementation defects but cannot redesign Production-Locked phases.

Every agent prompt must state: locked baselines, canonical IDs/files, allowed changes, prohibited redesign and required QA evidence.

### Definition of Done
A brand-aware release is complete only when canonical IDs resolve, no unregistered/deprecated assets remain on production surfaces, accessibility/locale/theme checks pass, media provenance passes, critical visual regression is reviewed, exceptions are documented and the lock/version changelog is updated.

### Next validation
Run **Phase 11.1 — Governance, Drift Prevention & Handoff QA** before Production Lock.
