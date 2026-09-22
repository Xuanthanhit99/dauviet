import * as fs from 'fs';
import * as path from 'path';
import { validateStoryBody } from '../../modules/stories/story-body.util';
// Cross-package import by design (same convention as golden-dataset.spec.ts) -
// asserts against the SAME pure data prisma/seed.ts actually loads, not a
// hand-copied duplicate. No live database is touched anywhere in this file
// (spec Phase 10 section 72/73 - PASS_GOLDEN_DATA_VALIDATION, not
// UNVERIFIED_LIVE_DB).
import { GOLDEN_DATASET_VERSION } from '../../../../../prisma/golden/helpers';
import { GOLDEN_PLACES } from '../../../../../prisma/golden/places';
import { GOLDEN_PEOPLE } from '../../../../../prisma/golden/people';
import { GOLDEN_EVENTS } from '../../../../../prisma/golden/events';
import { GOLDEN_ERAS, GOLDEN_DYNASTIES } from '../../../../../prisma/golden/eras';
import { GOLDEN_SOURCES } from '../../../../../prisma/golden/sources';
import { GOLDEN_FACTS } from '../../../../../prisma/golden/facts';
import { GOLDEN_STORIES } from '../../../../../prisma/golden/stories';
import { GOLDEN_JOURNEYS } from '../../../../../prisma/golden/journeys';
import { GOLDEN_EDITORIAL_SLOTS } from '../../../../../prisma/golden/editorial';

const seedSource = fs.readFileSync(path.resolve(__dirname, '../../../../../prisma/seed.ts'), 'utf8');

function slugFromName(name: string): string {
  // Mirrors prisma/golden/helpers.ts's slug() closely enough for a duplicate
  // check (strip diacritics, lowercase, hyphenate) - not the authoritative
  // implementation, just enough to catch an accidental collision here.
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Spec section 68: a deterministic dataset-summary count, copied into docs/backend/GOLDEN_DATASET.md and BACKEND_HANDOFF.md. */
describe('Golden Dataset summary counts (spec section 68)', () => {
  it('reports counts for every Golden collection', () => {
    const counts = {
      places: GOLDEN_PLACES.length,
      people: GOLDEN_PEOPLE.length,
      events: GOLDEN_EVENTS.length,
      eras: GOLDEN_ERAS.length,
      dynasties: GOLDEN_DYNASTIES.length,
      sources: GOLDEN_SOURCES.length,
      facts: GOLDEN_FACTS.length,
      stories: GOLDEN_STORIES.length,
      journeys: GOLDEN_JOURNEYS.length,
      editorialSlots: GOLDEN_EDITORIAL_SLOTS.length,
    };
    // eslint-disable-next-line no-console
    console.log('Golden Dataset summary:', JSON.stringify(counts));
    expect(counts.places).toBeGreaterThan(0);
    expect(counts.facts).toBeGreaterThanOrEqual(1);
  });
});

/** Spec section 47/67 test #1: a version identifier exists. */
describe('Golden Dataset version (spec section 52)', () => {
  it('declares a non-empty version identifier', () => {
    expect(typeof GOLDEN_DATASET_VERSION).toBe('string');
    expect(GOLDEN_DATASET_VERSION.length).toBeGreaterThan(0);
  });
});

/** Spec section 47/67 tests #2-#4: the required-core entity lists exist (Places already covered in detail by golden-dataset.spec.ts). */
describe('Golden Dataset required-core entities (spec section 4)', () => {
  it('includes the required-core People', () => {
    const names = GOLDEN_PEOPLE.map((p) => p.vi.name);
    for (const required of ['Lý Công Uẩn', 'Trần Hưng Đạo', 'Lê Lợi', 'Quang Trung', 'Gia Long', 'Minh Mạng', 'Hồ Chí Minh', 'Võ Nguyên Giáp']) {
      expect(names).toContain(required);
    }
  });

  it('includes the required-core Events', () => {
    const titles = GOLDEN_EVENTS.map((e) => e.vi.title);
    expect(titles.some((t) => t.includes('Dời đô'))).toBe(true);
    expect(titles.some((t) => t.includes('Bạch Đằng'))).toBe(true);
    expect(titles.some((t) => t.includes('Lam Sơn'))).toBe(true);
    expect(titles.some((t) => t.includes('Ngọc Hồi'))).toBe(true);
    expect(titles.some((t) => t.includes('Nguyễn'))).toBe(true);
    expect(titles.some((t) => t.includes('Tuyên ngôn Độc lập'))).toBe(true);
    expect(titles.some((t) => t.includes('Điện Biên Phủ'))).toBe(true);
    expect(titles.some((t) => t.includes('30 tháng 4'))).toBe(true);
  });
});

/** Spec section 47/67 tests #7/#8/#26/#58: no fabricated territorial geometry anywhere in this phase's data or seed script. */
describe('Golden Dataset territorial-geometry guard (spec sections 11/58)', () => {
  it('never calls prisma.territory.create/upsert from the seed script', () => {
    expect(seedSource).not.toMatch(/prisma\.territory\.(create|upsert)/);
  });

  it('no Golden Place/Fact data references TerritoryGeometry/TerritoryGeometryRevision', () => {
    const goldenDir = path.resolve(__dirname, '../../../../../prisma/golden');
    for (const file of fs.readdirSync(goldenDir)) {
      if (!file.endsWith('.ts')) continue;
      const content = fs.readFileSync(path.join(goldenDir, file), 'utf8');
      expect(content).not.toMatch(/TerritoryGeometry/);
    }
  });

  it('no SourceDocument metadata was fabricated in this phase (spec section 42 - only created where legally clear, none is yet)', () => {
    expect(seedSource).not.toMatch(/prisma\.sourceDocument\.(create|upsert)/);
  });
});

/** Spec section 47/67 tests #9-#11: citation coverage and source integrity. */
describe('Golden Dataset citation coverage (spec sections 3/20/69)', () => {
  const publishedFacts = GOLDEN_FACTS.filter((f) => f.publish);

  it('every fact marked publish:true carries at least one VERIFIED citation', () => {
    for (const fact of publishedFacts) {
      const hasVerified = fact.citations.some((c) => c.verificationState === 'VERIFIED');
      expect(hasVerified).toBe(true);
      expect(fact.citations.length).toBeGreaterThan(0);
    }
  });

  it('reports 100% citation coverage for published facts', () => {
    const cited = publishedFacts.filter((f) => f.citations.some((c) => c.verificationState === 'VERIFIED'));
    const coverage = publishedFacts.length === 0 ? 100 : Math.round((cited.length / publishedFacts.length) * 100);
    // eslint-disable-next-line no-console
    console.log(`PUBLISHED FACTS: ${publishedFacts.length}\nCITED PUBLISHED FACTS: ${cited.length}\nCOVERAGE: ${coverage}%`);
    expect(coverage).toBe(100);
  });

  it('every citation references a Source that actually exists in GOLDEN_SOURCES', () => {
    const sourceKeys = new Set(GOLDEN_SOURCES.map((s) => s.key));
    for (const fact of GOLDEN_FACTS) {
      for (const c of fact.citations) {
        expect(sourceKeys.has(c.sourceKey)).toBe(true);
      }
    }
  });

  it('has no duplicate Source keys', () => {
    const keys = GOLDEN_SOURCES.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('never uses a blog/travel-guide/Wikipedia/Fandom domain as a Source url (spec section 1)', () => {
    const bannedPatterns = [/wikipedia\.org/i, /fandom\.com/i, /vinpearl\.com/i, /oxalisadventure/i, /tripadvisor/i, /lonelyplanet/i];
    for (const source of GOLDEN_SOURCES) {
      if (!source.url) continue;
      for (const pattern of bannedPatterns) {
        expect(source.url).not.toMatch(pattern);
      }
    }
  });
});

/** Spec section 47/67 test #12: no duplicate locale slug within any single Golden collection. */
describe('Golden Dataset slug uniqueness (spec section 47)', () => {
  it('has no duplicate Place slug', () => {
    const slugs = GOLDEN_PLACES.map((p) => slugFromName(p.vi.name));
    expect(new Set(slugs).size).toBe(slugs.length);
  });
  it('has no duplicate Person slug', () => {
    const slugs = GOLDEN_PEOPLE.map((p) => slugFromName(p.vi.name));
    expect(new Set(slugs).size).toBe(slugs.length);
  });
  it('has no duplicate Event slug', () => {
    const slugs = GOLDEN_EVENTS.map((e) => slugFromName(e.vi.title));
    expect(new Set(slugs).size).toBe(slugs.length);
  });
  it('has no duplicate Story slug', () => {
    const slugs = GOLDEN_STORIES.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
  it('has no duplicate Journey slug', () => {
    const slugs = GOLDEN_JOURNEYS.map((j) => j.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

/** Spec section 47/67 test #13: no fabricated Jan-1 conversion - a YEAR-precision date never carries a month/day. */
describe('Golden Dataset date integrity (spec section 17, CRITICAL)', () => {
  function assertNoFakeDay(date: { precision: string; month?: number; day?: number }, label: string) {
    if (date.precision === 'YEAR' || date.precision === 'UNKNOWN' || date.precision === 'CENTURY' || date.precision === 'DECADE') {
      expect([label, date.month]).toEqual([label, undefined]);
      expect([label, date.day]).toEqual([label, undefined]);
    }
  }

  it('every Golden Fact date is honest about its precision', () => {
    for (const fact of GOLDEN_FACTS) assertNoFakeDay(fact.date, fact.key);
  });
  it('every Golden Event date is honest about its precision', () => {
    for (const event of GOLDEN_EVENTS) assertNoFakeDay(event.date, event.key);
  });
  it('every Golden Person birth/death date is honest about its precision', () => {
    for (const person of GOLDEN_PEOPLE) {
      if (person.birth) assertNoFakeDay(person.birth, `${person.key} birth`);
      if (person.death) assertNoFakeDay(person.death, `${person.key} death`);
    }
  });
});

/** Spec section 47/67 test #14: aliases deduplicate within each entity. */
describe('Golden Dataset alias integrity (spec section 15)', () => {
  it('Place aliases have no internal duplicates', () => {
    for (const place of GOLDEN_PLACES) {
      const aliases = place.aliases ?? [];
      expect(new Set(aliases).size).toBe(aliases.length);
    }
  });
  it('Person aliases have no internal duplicates', () => {
    for (const person of GOLDEN_PEOPLE) {
      const aliases = (person.aliases ?? []).map((a) => a.alias);
      expect(new Set(aliases).size).toBe(aliases.length);
    }
  });
});

/** Spec section 47/67 test #15/#16: VI/EN resolve the same entity, and representative search-coverage cases are seeded. */
describe('Golden Dataset translation & search-alias coverage (spec section 23/24/30)', () => {
  it('every Place/Person with an English name has non-empty text (never placeholder)', () => {
    for (const place of GOLDEN_PLACES) {
      if (place.en) expect(place.en.name.trim().length).toBeGreaterThan(0);
    }
    for (const person of GOLDEN_PEOPLE) {
      if (person.en) expect(person.en.name.trim().length).toBeGreaterThan(0);
    }
  });

  it('Thang Long, Tran Hung Dao, and Hoang Sa/Truong Sa carry the representative search aliases named in spec section 30', () => {
    const thangLong = GOLDEN_PLACES.find((p) => p.key === 'PLACE_THANG_LONG')!;
    expect(thangLong.aliases).toEqual(expect.arrayContaining(['Thang Long Imperial Citadel']));

    const tranHungDao = GOLDEN_PEOPLE.find((p) => p.key === 'PERSON_TRAN_HUNG_DAO')!;
    expect((tranHungDao.aliases ?? []).map((a) => a.alias)).toEqual(expect.arrayContaining(['Trần Quốc Tuấn']));

    const hoangSa = GOLDEN_PLACES.find((p) => p.key === 'PLACE_HOANG_SA')!;
    expect(hoangSa.aliases).toEqual(expect.arrayContaining(['Paracel Islands']));
    const truongSa = GOLDEN_PLACES.find((p) => p.key === 'PLACE_TRUONG_SA')!;
    expect(truongSa.aliases).toEqual(expect.arrayContaining(['Spratly Islands']));
  });

  it('canonical Vietnamese names carry real diacritics (not a diacritic-stripped placeholder) - diacritic and non-diacritic queries both resolve through the unaccent search index, not a separate stored alias', () => {
    const thangLong = GOLDEN_PLACES.find((p) => p.key === 'PLACE_THANG_LONG')!;
    expect(thangLong.vi.name).toBe('Hoàng thành Thăng Long');
    expect(/[À-ỹ]/.test(thangLong.vi.name)).toBe(true);
  });
});

/** Spec section 47/67 tests #17-#19: Story trust/structure. */
describe('Golden Dataset Story trust boundary (spec sections 33/34)', () => {
  const publishedFactKeys = new Set(GOLDEN_FACTS.filter((f) => f.publish).map((f) => f.key));

  it('every Story fact link points only at a fact this dataset marks publish:true', () => {
    for (const story of GOLDEN_STORIES) {
      for (const factKey of story.factKeys) {
        expect(publishedFactKeys.has(factKey)).toBe(true);
      }
    }
  });

  it('every Story body (vi and en, where present) validates against the real, production story-body schema', () => {
    for (const story of GOLDEN_STORIES) {
      expect(() => validateStoryBody(story.vi.body)).not.toThrow();
      if (story.en.body) expect(() => validateStoryBody(story.en.body)).not.toThrow();
    }
  });

  it('every Story references at least one real Golden Fact - no story is pure unsupported narrative', () => {
    for (const story of GOLDEN_STORIES) {
      expect(story.factKeys.length).toBeGreaterThan(0);
    }
  });
});

/** Spec section 47/67 tests #20-#22: Journey structure. */
describe('Golden Dataset Journey structure (spec sections 35-37)', () => {
  const placeKeys = new Set(GOLDEN_PLACES.map((p) => p.key));

  it('every Journey has at least one stop', () => {
    for (const journey of GOLDEN_JOURNEYS) {
      expect(journey.stops.length).toBeGreaterThan(0);
    }
  });

  it('every Journey stop references a Place that exists in the Golden Place list', () => {
    for (const journey of GOLDEN_JOURNEYS) {
      for (const stop of journey.stops) {
        expect(placeKeys.has(stop.placeKey)).toBe(true);
      }
    }
  });

  it('every Journey has a deterministic, gapless stop order starting at 1', () => {
    for (const journey of GOLDEN_JOURNEYS) {
      const orders = journey.stops.map((s) => s.order).sort((a, b) => a - b);
      expect(orders).toEqual(Array.from({ length: orders.length }, (_, i) => i + 1));
    }
  });
});

/** Spec section 47/67 test #23: EditorialSlot targets only real, published entities. */
describe('Golden Dataset EditorialSlot targets (spec section 38)', () => {
  it('every slot target resolves to a real Golden Story, Journey, or Place key', () => {
    const storyKeys = new Set(GOLDEN_STORIES.map((s) => s.key));
    const journeyKeys = new Set(GOLDEN_JOURNEYS.map((j) => j.key));
    const placeKeys = new Set(GOLDEN_PLACES.map((p) => p.key));
    for (const slot of GOLDEN_EDITORIAL_SLOTS) {
      const resolvable =
        (slot.entityKind === 'STORY' && storyKeys.has(slot.targetKey)) ||
        (slot.entityKind === 'JOURNEY' && journeyKeys.has(slot.targetKey)) ||
        (slot.entityKind === 'PLACE' && placeKeys.has(slot.targetKey));
      expect(resolvable).toBe(true);
    }
  });
});

/** Spec section 47/67 tests #24/#25: no raw Contribution or fake CommunityStory rows in the Golden seed. */
describe('Golden Dataset production-seed safety (spec sections 59/60)', () => {
  it('the seed script never creates a Contribution row', () => {
    expect(seedSource).not.toMatch(/prisma\.contribution\.(create|upsert)/);
  });
  it('the seed script never creates a CommunityStory row', () => {
    expect(seedSource).not.toMatch(/prisma\.communityStory\.(create|upsert)/);
  });
});

/**
 * Spec section 47/67 test #29, extended per Phase 11 section 76: every
 * *relationship* write (translations, aliases, entity joins, StoryFact/
 * StoryCitation, JourneyStop, EditorialSlot, EventTheme/EventPlace/
 * EventPerson/PersonDynasty/FactPlace/FactPerson/FactEvent/FactEra) must
 * also be idempotent on a second seed run, not just top-level entities.
 * Rather than re-enumerate every join-table model by hand (fragile - a new
 * join added later could slip through unlisted), this sweeps *every*
 * `prisma.<model>.` call in the seed script and fails if any resolves to a
 * bare `.create(` - the one documented, deliberate exception is
 * `prisma.user.create`, which is idempotent through its own explicit
 * find-then-create guard in `upsertDevUser` (see prisma/seed.ts), not
 * through `.upsert()`. G05 added two more of the same documented exception:
 * `ProviderAttributionRule` and `RestaurantOperationalSnapshot` have no
 * natural unique key `.upsert()` could target (a provider can legitimately
 * gain a second attribution rule or operational snapshot over time), so
 * both use the identical explicit `findFirst` guard before `.create(` -
 * never a bare, unguarded create. G06 adds a fourth: `CostAssumption`'s
 * `@@unique([scope, scopeId, category, unit, effectiveFrom])` does not
 * actually enforce uniqueness for GLOBAL-scoped rows (Postgres treats every
 * NULL as distinct in a unique index, and `scopeId` is always null for
 * GLOBAL), so a native `.upsert()` would silently insert a duplicate row on
 * every seed run - the seed script uses the same explicit `findFirst`-then-
 * conditional-`create` guard instead (see
 * `CostAssumptionsService.assertNoDuplicateIdentity`'s doc comment in
 * apps/api/src/modules/cost-assumptions/cost-assumptions.service.ts for the
 * full explanation of why the DB constraint alone is insufficient here).
 */
describe('Golden Dataset idempotency (spec sections 45/76)', () => {
  const ALLOWED_BARE_CREATE_MODELS = new Set([
    'user',
    'providerAttributionRule',
    'restaurantOperationalSnapshot',
    'costAssumption',
    // G06.5 - find-then-create guarded (see the dedicated guard test below),
    // same pattern as the other exceptions here: IngestionSourcePolicyEvidence
    // has no natural single-column unique key to upsert() against (evidence
    // is scoped by sourcePolicyId + sourceUrl together), so idempotency is
    // enforced by an explicit existence check instead.
    'ingestionSourcePolicyEvidence',
  ]);

  it('every prisma.<model>.create( call in the seed script is either an allowed documented exception or does not exist - upsert() is used everywhere else', () => {
    const matches = [...seedSource.matchAll(/prisma\.(\w+)\.create\(/g)].map((m) => m[1]);
    const undocumented = matches.filter((model) => !ALLOWED_BARE_CREATE_MODELS.has(model));
    expect(undocumented).toEqual([]);
  });

  it('the one allowed bare create (User) is itself guarded by an explicit find-then-create idempotency check, not left bare', () => {
    expect(seedSource).toMatch(/const existing = await prisma\.user\.findUnique[\s\S]{0,80}if \(existing\) return existing;/);
  });

  it('the G06.5 IngestionSourcePolicyEvidence bare create is itself guarded by an explicit find-then-create idempotency check, not left bare', () => {
    expect(seedSource).toMatch(/const existingEvidence = await prisma\.ingestionSourcePolicyEvidence\.findFirst[\s\S]{0,120}if \(!existingEvidence\) \{/);
  });
});
