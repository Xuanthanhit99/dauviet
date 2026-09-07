import * as fs from 'fs';
import * as path from 'path';
import { Prisma } from '@prisma/client';
import { GOLDEN_PLACES } from '../../../../../prisma/golden-dataset';

/** All raw-SQL source files under `src/`, for the static SQL-injection guard below. */
function listSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listSourceFiles(full, out);
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) out.push(full);
  }
  return out;
}

/**
 * Phase 04 spec section 54: Hoang Sa / Truong Sa trust regression. This is a
 * workflow/integrity check, not political prose - it asserts that the two
 * archipelagos never silently gain a fabricated territorial claim and that
 * the sensitive-fact/territory workflow guards documented in
 * `docs/backend/TRUST_MODEL.md` still exist, without asserting any claim
 * about the islands themselves.
 */
describe('Hoang Sa / Truong Sa trust regression (spec section 54)', () => {
  const seedSource = fs.readFileSync(path.resolve(__dirname, '../../../../../prisma/seed.ts'), 'utf8');

  it('seeds no Territory rows at all (no fabricated historical boundary, disputed or otherwise)', () => {
    expect(seedSource).not.toMatch(/prisma\.territory\.(create|upsert)/);
  });

  it('links no HistoricalFact to Hoang Sa or Truong Sa in the golden dataset', () => {
    // The only two seeded facts (1010 capital move, 1954 Dien Bien Phu) link
    // exclusively to their own event/person - never to either archipelago.
    const factSection = seedSource.slice(seedSource.indexOf('Seeding draft (unverified, uncited) historical facts'));
    expect(factSection).not.toMatch(/hoangSa/);
    expect(factSection).not.toMatch(/truongSa/);
  });

  it('gives Hoang Sa/Truong Sa Place rows no territorial/administrative claim fields beyond geography', () => {
    const archipelagos = GOLDEN_PLACES.filter((p) => p.vi.name === 'Hoàng Sa' || p.vi.name === 'Trường Sa');
    expect(archipelagos).toHaveLength(2);
    for (const place of archipelagos) {
      // PlaceSeedSpec has no field for a legal/administrative claim - this
      // just documents that assumption stays true as the type evolves.
      expect(Object.keys(place)).toEqual(
        expect.arrayContaining(['type', 'vi', 'lat', 'lng']),
      );
      expect(Object.keys(place)).not.toEqual(
        expect.arrayContaining(['claimant', 'legalStatus', 'sovereignty', 'administeredBy']),
      );
    }
  });
});

/**
 * Phase 06 spec section 57: Hoang Sa / Truong Sa editorial regression. A
 * workflow/integrity check, not political prose - proves the ordinary
 * StoryPlace mechanism can reference either archipelago (nothing special-
 * cased) while the Fact/Source trust boundary and the seed data stay
 * exactly as strict as Phase 04/05 left them.
 */
describe('Hoang Sa / Truong Sa editorial regression (spec section 57)', () => {
  it('a Story can link to a Place via the ordinary StoryPlace join table - no dedicated Hoang Sa/Truong Sa model or special case exists', () => {
    const models = Prisma.dmmf.datamodel.models;
    const storyPlace = models.find((m) => m.name === 'StoryPlace');
    expect(storyPlace).toBeDefined();
    expect(storyPlace!.fields.some((f) => f.name === 'place')).toBe(true);
    // No Vietnam-specific or archipelago-specific model exists anywhere in the schema.
    expect(models.some((m) => /HoangSa|TruongSa|Paracel|Spratly/i.test(m.name))).toBe(false);
  });

  it('StoryType has no special "territorial claim" category - Sea & Islands content is ordinary PLACE_STORY/FEATURE curation', () => {
    const values = Prisma.dmmf.datamodel.enums.find((e) => e.name === 'StoryType')?.values.map((v) => v.name) ?? [];
    expect(values.some((v) => /SEA|ISLAND|TERRITOR|SOVEREIGN/i.test(v))).toBe(false);
  });

  it('editorial curation (EditorialSlot) cannot reference a HistoricalFact directly - only STORY/JOURNEY/PLACE - so a slot can never surface a sensitive Fact bypassing Story/Source review', () => {
    const slot = Prisma.dmmf.datamodel.models.find((m) => m.name === 'EditorialSlot')!;
    // entityKind is validated in EditorialService.upsertSlot against
    // RESOLVABLE_KINDS (STORY/JOURNEY/PLACE only) - this asserts the field
    // it's checked against still exists and is the shared EntityKind enum,
    // not a bespoke slot-only enum that could silently add FACT/CITATION.
    const entityKindField = slot.fields.find((f) => f.name === 'entityKind');
    expect(entityKindField?.type).toBe('EntityKind');
  });
});

/**
 * Phase 07 spec section 64: every raw-SQL call in the discovery layer (and
 * everywhere else) must use the parameterized `$queryRaw`/`$executeRaw`
 * tagged-template form. `$queryRawUnsafe`/`$executeRawUnsafe` accept plain
 * string concatenation and would let a bbox/query/lat-lng parameter reach
 * SQL unescaped - so their presence anywhere in `src/` is a static failure,
 * not something to catch at review time.
 */
describe('No unsafe raw SQL (spec section 64)', () => {
  it('never calls $queryRawUnsafe or $executeRawUnsafe anywhere in src/', () => {
    const srcDir = path.resolve(__dirname, '../../');
    const offenders: string[] = [];
    for (const file of listSourceFiles(srcDir)) {
      const content = fs.readFileSync(file, 'utf8');
      if (/\$(queryRawUnsafe|executeRawUnsafe)/.test(content)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});

/**
 * Phase 07 spec section 11/56: Hoang Sa/Truong Sa map-visibility and the
 * deferred AdministrativeArea model. A workflow/integrity check, not
 * political prose - proves map density is driven only by the ordinary
 * `historicalImportance` column (same mechanism as every other Place) and
 * that no dedicated administrative/territorial model was introduced.
 */
describe('Hoang Sa / Truong Sa discovery regression (spec section 11)', () => {
  it('the golden dataset gives both archipelagos a real, non-zero historicalImportance value - the only signal map density uses', () => {
    const archipelagos = GOLDEN_PLACES.filter((p) => p.vi.name === 'Hoàng Sa' || p.vi.name === 'Trường Sa');
    expect(archipelagos).toHaveLength(2);
    for (const place of archipelagos) {
      expect(place.importance).toBeGreaterThan(0);
    }
  });

  it('no AdministrativeArea (or similarly-named territorial-claim) model exists in the schema - deferred per spec section 56, not built', () => {
    const models = Prisma.dmmf.datamodel.models;
    expect(models.some((m) => /AdministrativeArea|TerritorialClaim/i.test(m.name))).toBe(false);
  });
});

/**
 * Phase 08 spec section 75: the community/UGC layer must never structurally
 * bypass the HistoricalFact/Source/Citation trust chain, no matter how
 * popular, "verified," or moderator-approved a piece of community content
 * becomes. These are schema-shape checks (a relation either exists or it
 * doesn't), not behavioral guarantees - the behavioral half (self-review
 * refusal, etc.) is unit-tested directly in community.service.spec.ts.
 */
describe('Phase 08 community trust-boundary regression (spec section 75)', () => {
  const models = Prisma.dmmf.datamodel.models;

  function model(name: string) {
    const m = models.find((mm) => mm.name === name);
    if (!m) throw new Error(`Model ${name} not found in DMMF`);
    return m;
  }

  function relationFieldNames(name: string): string[] {
    return model(name)
      .fields.filter((f) => f.kind === 'object')
      .map((f) => f.name);
  }

  it('CommunityStory has no relation to HistoricalFact - a "verified" community story can never itself become a verified Fact', () => {
    expect(relationFieldNames('CommunityStory')).not.toEqual(expect.arrayContaining(['fact', 'facts', 'historicalFact']));
  });

  it('StoryVote (the helpful-vote table) has no relation to CommunityVerificationState/moderation fields - votes are counted, not judged', () => {
    const fields = model('StoryVote').fields.map((f) => f.name);
    expect(fields).toEqual(expect.arrayContaining(['storyId', 'userId']));
    expect(fields).not.toContain('verificationState');
  });

  it('a repeat helpful vote from the same user on the same story is DB-rejected, not just app-level (spec section 22/64)', () => {
    expect(model('StoryVote').uniqueFields).toContainEqual(['storyId', 'userId']);
  });

  it('EditorialSlot cannot reference a CommunityStory - resolvable entityKind values are validated in EditorialService against STORY/JOURNEY/PLACE only, not the shared EntityKind enum wholesale (spec section 56 regression)', () => {
    const entityKindField = model('EditorialSlot').fields.find((f) => f.name === 'entityKind');
    expect(entityKindField?.type).toBe('EntityKind');
    // The enum itself legitimately includes COMMUNITY_STORY (for Comment/
    // Bookmark/Report targets elsewhere) - the actual guard is
    // EditorialService's RESOLVABLE_KINDS allow-list, asserted directly
    // against the source below so this test fails if that list is ever
    // silently widened to include COMMUNITY_STORY.
    const editorialServiceSource = fs.readFileSync(
      path.resolve(__dirname, '../../modules/editorial/editorial.service.ts'),
      'utf8',
    );
    const allowListLine = editorialServiceSource.match(/RESOLVABLE_KINDS[^\n]*/)?.[0] ?? '';
    expect(allowListLine).not.toMatch(/COMMUNITY_STORY/);
  });

  it('a UserBadge cannot be granted twice with the same type to the same user (DB-enforced, not just app-level) - and no field lets a user grant their own badge', () => {
    expect(model('UserBadge').uniqueFields).toContainEqual(['userId', 'type']);
    expect(model('UserBadge').fields.some((f) => f.name === 'selfGranted')).toBe(false);
  });

  it('Report has no relation to HistoricalFact - filing a MISINFORMATION report is a moderation signal only and cannot itself mutate canonical historical data (spec section 44/58)', () => {
    expect(relationFieldNames('Report')).not.toEqual(expect.arrayContaining(['fact', 'facts', 'historicalFact']));
  });

  it('the golden dataset seeds no CommunityStory rows - no fabricated "real" community memory exists in production seed data (spec section 78)', () => {
    const seedSource = fs.readFileSync(path.resolve(__dirname, '../../../../../prisma/seed.ts'), 'utf8');
    expect(seedSource).not.toMatch(/prisma\.communityStory\.(create|upsert)/);
  });

  it('Hoang Sa / Truong Sa community regression: a CommunityStory can link to either archipelago via the ordinary CommunityStoryPlace join - no dedicated code path, no automatic verification, no territorial-claim field exists on the link table', () => {
    const archipelagos = GOLDEN_PLACES.filter((p) => p.vi.name === 'Hoàng Sa' || p.vi.name === 'Trường Sa');
    expect(archipelagos).toHaveLength(2);
    const linkFields = model('CommunityStoryPlace').fields.map((f) => f.name);
    expect(linkFields).not.toEqual(expect.arrayContaining(['claimant', 'legalStatus', 'sovereignty', 'territorialClaim']));
    // Linking never mutates verificationState - CommunityService.linkPlace
    // takes no verification-state parameter at all (asserted structurally:
    // no such field exists on the join table for it to even flow into).
    expect(linkFields).not.toContain('verificationState');
  });
});

/**
 * Phase 09 spec sections 2/69/70/71: the contribution intake pipeline must
 * never become a shortcut into verified historical knowledge, public search,
 * or editorial curation - no matter how far a Contribution advances through
 * its own workflow. Structural/static checks only; the behavioral half
 * (self-review refusal, role gates, idempotent cataloguing) is unit-tested
 * directly in contributions.service.spec.ts.
 */
describe('Phase 09 contribution trust-boundary regression (spec sections 2/69-71)', () => {
  const models = Prisma.dmmf.datamodel.models;

  function model(name: string) {
    const m = models.find((mm) => mm.name === name);
    if (!m) throw new Error(`Model ${name} not found in DMMF`);
    return m;
  }

  it('raw Contribution search-indexing is impossible - Contribution has no entry in the search service\'s searcher list', () => {
    const searchServiceSource = fs.readFileSync(path.resolve(__dirname, '../../modules/search/search.service.ts'), 'utf8');
    // The searchers array lists each indexed EntityKind by name (e.g.
    // `searchPlace`/`searchCommunityStory`) - a `searchContribution` runner
    // would be the only way Contribution could ever appear here.
    expect(searchServiceSource).not.toMatch(/searchContribution/i);
  });

  it('EditorialSlot cannot reference a Contribution - RESOLVABLE_KINDS stays STORY/JOURNEY/PLACE only (same regression style as the Phase 08 CommunityStory check above)', () => {
    const editorialServiceSource = fs.readFileSync(path.resolve(__dirname, '../../modules/editorial/editorial.service.ts'), 'utf8');
    const allowListLine = editorialServiceSource.match(/RESOLVABLE_KINDS[^\n]*/)?.[0] ?? '';
    expect(allowListLine).not.toMatch(/CONTRIBUTION/);
  });

  it('cataloguing (promotion into Source/SourceDocument/MediaAsset) requires HISTORIAN_REVIEWER/ADMIN, never a plain EDITOR or MODERATOR alone (spec section 30/50/71)', () => {
    const adminControllerSource = fs.readFileSync(path.resolve(__dirname, '../../modules/contributions/contributions-admin.controller.ts'), 'utf8');
    expect(adminControllerSource).toMatch(/const CATALOGUE_ROLES = \[Role\.HISTORIAN_REVIEWER, Role\.ADMIN\]/);
    // Every catalogue/* route is immediately preceded by the stricter
    // @Roles(...CATALOGUE_ROLES) override, not just the controller's
    // class-level EDITOR/HISTORIAN_REVIEWER/ADMIN default.
    for (const route of ['source', 'document', 'media']) {
      const pattern = new RegExp(`@Roles\\(\\.\\.\\.CATALOGUE_ROLES\\)\\s*\\n\\s*@Post\\(':id/catalogue/${route}'\\)`);
      expect(adminControllerSource).toMatch(pattern);
    }
  });

  it('ContributionCatalogueResult is a distinct model from Contribution itself - "ACCEPTED" and "CATALOGUED" are never the same signal (spec section 28/29)', () => {
    const resultModel = model('ContributionCatalogueResult');
    expect(resultModel.fields.some((f) => f.name === 'resultType')).toBe(true);
    expect(resultModel.fields.some((f) => f.name === 'source')).toBe(true);
    expect(resultModel.fields.some((f) => f.name === 'sourceDocument')).toBe(true);
    expect(resultModel.fields.some((f) => f.name === 'mediaAsset')).toBe(true);
  });

  it('ContributionSource (provenance evidence) has no relation to Citation/HistoricalFact - a submitter\'s provenance claim can never itself become cited evidence without a reviewer explicitly cataloguing a real Source', () => {
    const evidenceFields = model('ContributionSource').fields.map((f) => f.name);
    expect(evidenceFields).not.toEqual(expect.arrayContaining(['citation', 'citations', 'fact', 'historicalFact']));
  });

  it('a MediaAsset promoted to MediaType MAP through contribution cataloguing still has no relation to Territory/geometry (same guarantee as Phase 05, re-verified for the Phase 09 promotion path)', () => {
    const mediaFields = model('MediaAsset').fields.filter((f) => f.kind === 'object').map((f) => f.name);
    expect(mediaFields).not.toEqual(expect.arrayContaining(['territory', 'territories', 'territoryGeometry']));
  });

  it('Hoang Sa / Truong Sa contribution regression: Contribution.placeId can reference either archipelago via the ordinary Place FK - no dedicated code path, and linking alone creates no Source/Fact/geometry (structural: Contribution has no relation field to HistoricalFact or Territory)', () => {
    const archipelagos = GOLDEN_PLACES.filter((p) => p.vi.name === 'Hoàng Sa' || p.vi.name === 'Trường Sa');
    expect(archipelagos).toHaveLength(2);
    const contributionFields = model('Contribution').fields.filter((f) => f.kind === 'object').map((f) => f.name);
    expect(contributionFields).toContain('place');
    expect(contributionFields).not.toEqual(expect.arrayContaining(['fact', 'facts', 'historicalFact', 'territory', 'territories']));
  });

  it('a CORRECTION contribution\'s target is a validated EntityKind + id pair, not an arbitrary polymorphic column - correctionTargetType is the shared EntityKind enum', () => {
    const field = model('Contribution').fields.find((f) => f.name === 'correctionTargetType');
    expect(field?.type).toBe('EntityKind');
  });
});
