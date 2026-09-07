/**
 * Golden Dataset seed (Phase 10 - docs/backend/GOLDEN_DATASET.md).
 *
 * Trust-model discipline followed here, deliberately (spec section 3):
 * - Every HistoricalFact this seed marks PUBLISHED carries >=1 VERIFIED
 *   Citation to a real Source (see prisma/golden/facts.ts / sources.ts) -
 *   the exact same gate `FactsService.setEditorialStatus` enforces for a
 *   real API-driven publish, replicated here rather than bypassed.
 * - Sensitive facts (`sensitivity !== NORMAL`) get `reviewedById` set to a
 *   DIFFERENT dev account than `createdById`, mirroring the real
 *   separation-of-duties invariant (see `upsertFact` below), plus a real
 *   `FactReview` row - not just a status flag flip.
 * - Every Story/Journey this seed marks PUBLISHED was manually checked
 *   against its real service-layer publication validator's actual rules
 *   (StoriesService.validateForPublication / the Journey equivalent) before
 *   being written directly - no hero/inline media is referenced (so the
 *   MEDIA_NOT_READY checks are vacuously satisfied), every StoryFact link
 *   points only at a fact this same seed run marks PUBLISHED, and every
 *   Journey stop's Place is itself PUBLISHED (see docs/backend/
 *   GOLDEN_DATASET.md "Seed architecture" for the full reasoning).
 * - English translations authored in this phase are honestly classified
 *   `method: AI_ASSISTED` / `status: AI_ASSISTED` (spec section 25) - they
 *   were drafted by Claude as implementation assistance and have not been
 *   reviewed by a human editor. Vietnamese stays `method: ORIGINAL` (the
 *   canonical/source-language text, consistent with the existing
 *   established convention across every prior phase's seed data).
 * - Historical dates use year/month/day + precision/qualifier, never a
 *   fabricated "YYYY-01-01" ISO string (spec section 17, CRITICAL).
 * - No Territory geometry is seeded - historical boundary polygons require
 *   real GIS/source material this seed does not fabricate.
 * - Hoang Sa and Truong Sa are seeded as real Place rows (type ARCHIPELAGO);
 *   their dossier content lives in individually-cited HistoricalFact rows
 *   with `sensitivity: TERRITORIAL`, never an unqualified statement.
 * - No fake CommunityStory/Contribution rows are seeded (spec sections
 *   59/60) - those are covered by their own phases' unit-test fixtures.
 */
import {
  PrismaClient,
  Role,
  AuthProvider,
  PublicationStatus,
  StoryEditorialStatus,
  StoryLinkRole,
  FactEditorialStatus,
  CitationVerificationState,
  EntityKind,
} from '@prisma/client';
import * as argon2 from 'argon2';
import {
  GOLDEN_CITIES,
  GOLDEN_COUNTRIES,
  GOLDEN_DATASET_REVIEWED_AT,
  GOLDEN_DATASET_VERSION,
  GOLDEN_DESTINATIONS,
  GOLDEN_DYNASTIES,
  GOLDEN_EDITORIAL_SLOTS,
  GOLDEN_ERAS,
  GOLDEN_EVENTS,
  GOLDEN_FACTS,
  GOLDEN_JOURNEYS,
  GOLDEN_PEOPLE,
  GOLDEN_PLACES,
  GOLDEN_REGIONS,
  GOLDEN_SOURCES,
  GOLDEN_STORIES,
  GOLDEN_THEMES,
  HistoricalDateSeed,
  slug,
  sortBounds,
} from './golden';
import type { StoryBlockSeed } from './golden/stories';

const prisma = new PrismaClient();

async function upsertDevUser(email: string, displayName: string, roles: Role[]) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  const passwordHash = await argon2.hash('DevPassword123!', { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  return prisma.user.create({
    data: {
      email,
      displayName,
      roles,
      emailVerifiedAt: new Date(),
      authIdentities: { create: { provider: AuthProvider.PASSWORD, passwordHash } },
    },
  });
}

async function main() {
  console.log(`Seeding dev/test accounts (Golden Dataset ${GOLDEN_DATASET_VERSION})...`);
  await upsertDevUser('admin@dauviet.vn', 'Dau Viet Admin', [Role.ADMIN]);
  const editor = await upsertDevUser('editor@dauviet.vn', 'Dau Viet Editor', [Role.EDITOR]);
  const historian = await upsertDevUser('historian@dauviet.vn', 'Dau Viet Historian Reviewer', [Role.HISTORIAN_REVIEWER]);
  await upsertDevUser('moderator@dauviet.vn', 'Dau Viet Moderator', [Role.MODERATOR]);
  await upsertDevUser('contributor@dauviet.vn', 'Dau Viet Contributor', [Role.CONTRIBUTOR]);
  await upsertDevUser('user@dauviet.vn', 'Dau Viet Reader', [Role.USER]);

  // -----------------------------------------------------------------------
  // Eras / Dynasties / Themes
  // -----------------------------------------------------------------------
  console.log('Seeding eras...');
  const erasByKey = new Map<string, { id: string }>();
  for (const spec of GOLDEN_ERAS) {
    const canonicalSlug = slug(spec.vi.name);
    const startSort = sortBounds(spec.start);
    const endSort = spec.end ? sortBounds(spec.end) : null;
    const era = await prisma.historicalEra.upsert({
      where: { canonicalSlug },
      update: {},
      create: {
        canonicalSlug,
        startYear: spec.start.year,
        startMonth: spec.start.month,
        startDay: spec.start.day,
        startPrecision: spec.start.precision,
        startQualifier: spec.start.qualifier ?? 'EXACT',
        endYear: spec.end?.year,
        endMonth: spec.end?.month,
        endDay: spec.end?.day,
        endPrecision: spec.end?.precision,
        endQualifier: spec.end?.qualifier ?? (spec.end ? 'EXACT' : undefined),
        sortStart: startSort.start,
        sortEnd: endSort ? endSort.end : new Date(Date.UTC(9999, 11, 31)),
        translations: {
          create: [
            { locale: 'vi', name: spec.vi.name, slug: canonicalSlug, summary: spec.vi.summary, method: 'ORIGINAL' },
            ...(spec.en ? [{ locale: 'en', name: spec.en.name, slug: slug(spec.en.name), method: 'AI_ASSISTED' as const, status: 'AI_ASSISTED' as const }] : []),
          ],
        },
      },
    });
    erasByKey.set(spec.key, era);
  }

  console.log('Seeding dynasties...');
  const dynastiesByKey = new Map<string, { id: string }>();
  for (const spec of GOLDEN_DYNASTIES) {
    const canonicalSlug = slug(spec.vi.name);
    const startSort = sortBounds(spec.start);
    const endSort = spec.end ? sortBounds(spec.end) : null;
    const dynasty = await prisma.dynasty.upsert({
      where: { canonicalSlug },
      update: {},
      create: {
        canonicalSlug,
        startYear: spec.start.year,
        startMonth: spec.start.month,
        startDay: spec.start.day,
        startPrecision: spec.start.precision,
        startQualifier: spec.start.qualifier ?? 'EXACT',
        endYear: spec.end?.year,
        endMonth: spec.end?.month,
        endDay: spec.end?.day,
        endPrecision: spec.end?.precision,
        endQualifier: spec.end?.qualifier ?? (spec.end ? 'EXACT' : undefined),
        sortStart: startSort.start,
        sortEnd: endSort ? endSort.end : new Date(Date.UTC(9999, 11, 31)),
        translations: {
          create: [
            { locale: 'vi', name: spec.vi.name, slug: canonicalSlug, summary: spec.vi.summary, method: 'ORIGINAL' },
            ...(spec.en ? [{ locale: 'en', name: spec.en.name, slug: slug(spec.en.name), method: 'AI_ASSISTED' as const }] : []),
          ],
        },
      },
    });
    dynastiesByKey.set(spec.key, dynasty);
  }

  console.log('Seeding themes...');
  const themesByKey = new Map<string, { id: string }>();
  for (const spec of GOLDEN_THEMES) {
    const theme = await prisma.theme.upsert({
      where: { slug: spec.slug },
      update: {},
      create: {
        slug: spec.slug,
        category: spec.category,
        translations: {
          create: [
            { locale: 'vi', name: spec.vi },
            ...(spec.en ? [{ locale: 'en', name: spec.en }] : []),
          ],
        },
      },
    });
    themesByKey.set(spec.slug, theme);
  }

  // -----------------------------------------------------------------------
  // Places
  // -----------------------------------------------------------------------
  console.log('Seeding places from the golden dataset (see prisma/golden/places.ts)...');
  const placesByKey = new Map<string, { id: string }>();
  for (const spec of GOLDEN_PLACES) {
    const canonicalSlug = slug(spec.vi.name);
    const place = await prisma.place.upsert({
      where: { canonicalSlug },
      update: {},
      create: {
        type: spec.type,
        canonicalSlug,
        historicalImportance: spec.importance ?? 0,
        publicationStatus: PublicationStatus.PUBLISHED,
        translations: {
          create: [
            { locale: 'vi', name: spec.vi.name, slug: canonicalSlug, summary: spec.vi.summary, method: 'ORIGINAL' },
            ...(spec.en
              ? [{ locale: 'en', name: spec.en.name, slug: slug(spec.en.name), summary: spec.en.summary, method: 'AI_ASSISTED' as const, status: 'AI_ASSISTED' as const }]
              : []),
          ],
        },
      },
    });
    if (spec.lat !== undefined && spec.lng !== undefined) {
      await prisma.$executeRaw`UPDATE "Place" SET "location" = ST_SetSRID(ST_MakePoint(${spec.lng}, ${spec.lat}), 4326) WHERE "id" = ${place.id}`;
    }
    for (const alias of spec.aliases ?? []) {
      await prisma.entityAlias.upsert({
        where: { entityType_entityId_locale_alias: { entityType: 'PLACE', entityId: place.id, locale: '', alias } },
        update: {},
        create: { entityType: 'PLACE', entityId: place.id, alias, aliasType: 'ROMANIZATION' },
      });
    }
    placesByKey.set(spec.key, place);
  }

  // -----------------------------------------------------------------------
  // People
  // -----------------------------------------------------------------------
  console.log('Seeding people from the golden dataset (see prisma/golden/people.ts)...');
  const peopleByKey = new Map<string, { id: string }>();
  // Dynasty membership (spec section 27) - kept as a small explicit list here
  // rather than a field on PersonSeedSpec, since it is a relationship, not
  // an intrinsic person attribute.
  const PERSON_DYNASTY_LINKS: Record<string, string> = {
    PERSON_LY_CONG_UAN: 'DYNASTY_LY',
    PERSON_TRAN_HUNG_DAO: 'DYNASTY_TRAN',
    PERSON_GIA_LONG: 'DYNASTY_NGUYEN',
    PERSON_MINH_MANG: 'DYNASTY_NGUYEN',
  };
  for (const spec of GOLDEN_PEOPLE) {
    const canonicalSlug = slug(spec.vi.name);
    const birth = spec.birth ?? { precision: 'UNKNOWN' as const, qualifier: 'UNCERTAIN' as const };
    const death = spec.death ?? { precision: 'UNKNOWN' as const, qualifier: 'UNCERTAIN' as const };
    const birthSort = sortBounds(birth as HistoricalDateSeed);
    const deathSort = sortBounds(death as HistoricalDateSeed);

    const person = await prisma.person.upsert({
      where: { canonicalSlug },
      update: {},
      create: {
        canonicalSlug,
        publicationStatus: PublicationStatus.PUBLISHED,
        birthYear: birth.year,
        birthMonth: birth.month,
        birthDay: birth.day,
        birthPrecision: birth.precision,
        birthQualifier: birth.qualifier ?? 'EXACT',
        birthSortStart: birthSort.start,
        birthSortEnd: birthSort.end,
        deathYear: death.year,
        deathMonth: death.month,
        deathDay: death.day,
        deathPrecision: death.precision,
        deathQualifier: death.qualifier ?? 'EXACT',
        deathSortStart: deathSort.start,
        deathSortEnd: deathSort.end,
        translations: {
          create: [
            { locale: 'vi', displayName: spec.vi.name, slug: canonicalSlug, summary: spec.vi.summary, method: 'ORIGINAL' },
            ...(spec.en ? [{ locale: 'en', displayName: spec.en.name, slug: slug(spec.en.name), summary: spec.en.summary, method: 'AI_ASSISTED' as const, status: 'AI_ASSISTED' as const }] : []),
          ],
        },
      },
    });
    for (const a of spec.aliases ?? []) {
      await prisma.entityAlias.upsert({
        where: { entityType_entityId_locale_alias: { entityType: 'PERSON', entityId: person.id, locale: '', alias: a.alias } },
        update: {},
        create: { entityType: 'PERSON', entityId: person.id, alias: a.alias, aliasType: a.type },
      });
    }
    const dynastyKey = PERSON_DYNASTY_LINKS[spec.key];
    if (dynastyKey) {
      const dynasty = dynastiesByKey.get(dynastyKey);
      if (dynasty) {
        await prisma.personDynasty.upsert({
          where: { personId_dynastyId: { personId: person.id, dynastyId: dynasty.id } },
          update: {},
          create: { personId: person.id, dynastyId: dynasty.id },
        });
      }
    }
    peopleByKey.set(spec.key, person);
  }

  // -----------------------------------------------------------------------
  // Events
  // -----------------------------------------------------------------------
  console.log('Seeding events from the golden dataset (see prisma/golden/events.ts)...');
  const eventsByKey = new Map<string, { id: string }>();
  for (const spec of GOLDEN_EVENTS) {
    const canonicalSlug = slug(spec.vi.title);
    const qualifier = spec.rangeEndYear ? 'BETWEEN' : spec.date.qualifier ?? 'EXACT';
    const sort = sortBounds(spec.date);
    const sortEnd = spec.rangeEndYear ? new Date(Date.UTC(spec.rangeEndYear, 11, 31)) : sort.end;
    const era = erasByKey.get(spec.eraKey);

    const event = await prisma.historicalEvent.upsert({
      where: { canonicalSlug },
      update: {},
      create: {
        canonicalSlug,
        publicationStatus: PublicationStatus.PUBLISHED,
        dateYear: spec.date.year,
        dateMonth: spec.date.month,
        dateDay: spec.date.day,
        datePrecision: spec.date.precision,
        dateQualifier: qualifier,
        dateEndYear: spec.rangeEndYear,
        dateSortStart: sort.start,
        dateSortEnd: sortEnd,
        importance: spec.importance ?? 5,
        eraId: era?.id,
        translations: {
          create: [
            { locale: 'vi', title: spec.vi.title, slug: canonicalSlug, summary: spec.vi.summary, method: 'ORIGINAL' },
            ...(spec.en ? [{ locale: 'en', title: spec.en.title, slug: slug(spec.en.title), summary: spec.en.summary, method: 'AI_ASSISTED' as const, status: 'AI_ASSISTED' as const }] : []),
          ],
        },
      },
    });

    for (const placeKey of spec.placeKeys ?? []) {
      const place = placesByKey.get(placeKey);
      if (place) await prisma.eventPlace.upsert({ where: { eventId_placeId: { eventId: event.id, placeId: place.id } }, update: {}, create: { eventId: event.id, placeId: place.id } });
    }
    for (const personKey of spec.personKeys ?? []) {
      const person = peopleByKey.get(personKey);
      if (person) await prisma.eventPerson.upsert({ where: { eventId_personId: { eventId: event.id, personId: person.id } }, update: {}, create: { eventId: event.id, personId: person.id } });
    }
    for (const themeSlugKey of spec.themeKeys) {
      const theme = themesByKey.get(themeSlugKey);
      if (theme) await prisma.eventTheme.upsert({ where: { eventId_themeId: { eventId: event.id, themeId: theme.id } }, update: {}, create: { eventId: event.id, themeId: theme.id } });
    }
    eventsByKey.set(spec.key, event);
  }

  // -----------------------------------------------------------------------
  // Sources (spec sections 7-9) - stable custom `id` per source, so
  // relationships in facts.ts/stories.ts stay readable and reproducible.
  // -----------------------------------------------------------------------
  console.log('Seeding sources from the golden dataset (see prisma/golden/sources.ts)...');
  const sourcesByKey = new Map<string, { id: string }>();
  for (const spec of GOLDEN_SOURCES) {
    const source = await prisma.source.upsert({
      where: { id: spec.key },
      update: {},
      create: {
        id: spec.key,
        sourceType: spec.sourceType,
        title: spec.title,
        author: spec.author,
        organization: spec.organization,
        publisher: spec.publisher,
        publicationYear: spec.publicationYear,
        url: spec.url,
        originalLanguage: spec.originalLanguage,
        credibilityLevel: spec.credibilityLevel,
        notes: spec.notes,
        createdById: editor.id,
      },
    });
    sourcesByKey.set(spec.key, source);
  }

  // -----------------------------------------------------------------------
  // HistoricalFacts + Citations (+ FactReview for every published fact -
  // spec section 3: prove the trust workflow, don't bypass it)
  // -----------------------------------------------------------------------
  console.log('Seeding source-backed historical facts from the golden dataset (see prisma/golden/facts.ts)...');
  const citationIdByFactAndSource = new Map<string, string>();
  const factIdByKey = new Map<string, string>();
  const publishedFactKeys = new Set<string>();

  for (const spec of GOLDEN_FACTS) {
    const sensitivity = spec.sensitivity ?? 'NORMAL';
    // Separation of duties (docs/backend/TRUST_MODEL.md section 7): a
    // sensitive fact's reviewer must be a DIFFERENT account than its
    // creator, never merely a status flip.
    const createdById = editor.id;
    const reviewedById = sensitivity !== 'NORMAL' ? historian.id : undefined;

    const sort = sortBounds(spec.date);
    const fact = await prisma.historicalFact.upsert({
      where: { id: spec.key },
      update: {},
      create: {
        id: spec.key,
        factType: spec.factType,
        dateYear: spec.date.year,
        dateMonth: spec.date.month,
        dateDay: spec.date.day,
        datePrecision: spec.date.precision,
        dateQualifier: spec.date.qualifier ?? 'EXACT',
        dateSortStart: sort.start,
        dateSortEnd: sort.end,
        certainty: spec.certainty,
        sensitivity,
        createdById,
        translations: {
          create: [
            { locale: 'vi', statement: spec.vi, method: 'ORIGINAL' },
            ...(spec.en ? [{ locale: 'en', statement: spec.en, method: 'AI_ASSISTED' as const, status: 'AI_ASSISTED' as const }] : []),
          ],
        },
      },
    });
    factIdByKey.set(spec.key, fact.id);

    for (const eventKey of spec.eventKeys ?? []) {
      const event = eventsByKey.get(eventKey);
      if (event) await prisma.factEvent.upsert({ where: { factId_eventId: { factId: fact.id, eventId: event.id } }, update: {}, create: { factId: fact.id, eventId: event.id } });
    }
    for (const personKey of spec.personKeys ?? []) {
      const person = peopleByKey.get(personKey);
      if (person) await prisma.factPerson.upsert({ where: { factId_personId: { factId: fact.id, personId: person.id } }, update: {}, create: { factId: fact.id, personId: person.id } });
    }
    for (const placeKey of spec.placeKeys ?? []) {
      const place = placesByKey.get(placeKey);
      if (place) await prisma.factPlace.upsert({ where: { factId_placeId: { factId: fact.id, placeId: place.id } }, update: {}, create: { factId: fact.id, placeId: place.id } });
    }
    for (const eraKey of spec.eraKeys ?? []) {
      const era = erasByKey.get(eraKey);
      if (era) await prisma.factEra.upsert({ where: { factId_eraId: { factId: fact.id, eraId: era.id } }, update: {}, create: { factId: fact.id, eraId: era.id } });
    }

    let allVerified = spec.citations.length > 0;
    for (const c of spec.citations) {
      const source = sourcesByKey.get(c.sourceKey);
      if (!source) throw new Error(`Fact ${spec.key} cites unknown source ${c.sourceKey}`);
      const citationId = `${spec.key}::${c.sourceKey}`;
      const isVerified = c.verificationState === CitationVerificationState.VERIFIED;
      if (!isVerified) allVerified = false;
      const citation = await prisma.citation.upsert({
        where: { id: citationId },
        update: {},
        create: {
          id: citationId,
          factId: fact.id,
          sourceId: source.id,
          pageFrom: c.pageFrom,
          pageTo: c.pageTo,
          volume: c.volume,
          chapter: c.chapter,
          excerpt: c.excerpt,
          editorNote: c.editorNote,
          verificationState: c.verificationState,
          verifiedById: isVerified ? historian.id : undefined,
          verifiedAt: isVerified ? new Date() : undefined,
        },
      });
      citationIdByFactAndSource.set(citationId, citation.id);
    }

    // Faithful publish gate (spec section 3/20) - mirrors
    // FactsService.setEditorialStatus: >=1 citation, all intended
    // VERIFIED, and (for sensitive facts) a reviewer distinct from the
    // creator. A fact whose evidence didn't clear this bar stays DRAFT.
    if (spec.publish && allVerified) {
      await prisma.historicalFact.update({
        where: { id: fact.id },
        data: { editorialStatus: FactEditorialStatus.PUBLISHED, reviewedById: reviewedById ?? createdById, reviewedAt: new Date() },
      });
      await prisma.factReview.upsert({
        where: { id: `${spec.key}::review` },
        update: {},
        create: {
          id: `${spec.key}::review`,
          factId: fact.id,
          reviewerId: reviewedById ?? createdById,
          stage: FactEditorialStatus.PUBLISHED,
          decision: 'APPROVED',
          notes: 'Golden Dataset seed: source-backed fact reviewed and published (see docs/backend/golden-data/sources-manifest.md).',
        },
      });
      publishedFactKeys.add(spec.key);
    }
  }

  // -----------------------------------------------------------------------
  // Stories (spec sections 31-34) - every StoryFact link below points only
  // at a fact this same run just marked PUBLISHED (checked explicitly,
  // never assumed).
  // -----------------------------------------------------------------------
  console.log('Seeding editorial stories from the golden dataset (see prisma/golden/stories.ts)...');
  const storiesByKey = new Map<string, { id: string }>();
  function resolveStoryBody(blocks: StoryBlockSeed[]): unknown[] {
    return blocks.map((block) => {
      if (block.type === 'source_reference' && typeof block.citationId === 'string') {
        const resolved = citationIdByFactAndSource.get(block.citationId);
        if (!resolved) throw new Error(`Story body references unknown citation key ${block.citationId as string}`);
        return { ...block, citationId: resolved };
      }
      return block;
    });
  }
  for (const spec of GOLDEN_STORIES) {
    for (const factKey of spec.factKeys) {
      if (!publishedFactKeys.has(factKey)) {
        throw new Error(`Story ${spec.key} links Fact ${factKey}, which this seed did not mark PUBLISHED - refusing to seed (mirrors STORY_FACT_NOT_PUBLISHABLE).`);
      }
    }

    const story = await prisma.story.upsert({
      where: { canonicalSlug: spec.slug },
      update: {},
      create: {
        canonicalSlug: spec.slug,
        authorId: editor.id,
        featured: spec.featured ?? false,
        editorialStatus: StoryEditorialStatus.PUBLISHED,
        publishedAt: new Date(),
        translations: {
          create: [
            {
              locale: 'vi',
              title: spec.vi.title,
              slug: spec.slug,
              subtitle: spec.vi.subtitle,
              summary: spec.vi.summary,
              content: resolveStoryBody(spec.vi.body) as any,
              status: 'PUBLISHED',
              method: 'ORIGINAL',
            },
            {
              locale: 'en',
              title: spec.en.title,
              slug: slug(spec.en.title),
              summary: spec.en.summary,
              content: spec.en.body ? (resolveStoryBody(spec.en.body) as any) : undefined,
              status: 'AI_ASSISTED',
              method: 'AI_ASSISTED',
            },
          ],
        },
      },
    });
    storiesByKey.set(spec.key, story);

    for (const link of spec.placeLinks ?? []) {
      const place = placesByKey.get(link.key);
      if (place) await prisma.storyPlace.upsert({ where: { storyId_placeId: { storyId: story.id, placeId: place.id } }, update: {}, create: { storyId: story.id, placeId: place.id, role: link.role } });
    }
    for (const link of spec.personLinks ?? []) {
      const person = peopleByKey.get(link.key);
      if (person) await prisma.storyPerson.upsert({ where: { storyId_personId: { storyId: story.id, personId: person.id } }, update: {}, create: { storyId: story.id, personId: person.id, role: link.role } });
    }
    for (const link of spec.eventLinks ?? []) {
      const event = eventsByKey.get(link.key);
      if (event) await prisma.storyEvent.upsert({ where: { storyId_eventId: { storyId: story.id, eventId: event.id } }, update: {}, create: { storyId: story.id, eventId: event.id, role: link.role } });
    }
    for (const factKey of spec.factKeys) {
      const factId = factIdByKey.get(factKey)!;
      await prisma.storyFact.upsert({ where: { storyId_factId: { storyId: story.id, factId } }, update: {}, create: { storyId: story.id, factId } });
    }
    for (const ref of spec.citationRefs) {
      const citationId = citationIdByFactAndSource.get(`${ref.factKey}::${ref.sourceKey}`);
      if (!citationId) throw new Error(`Story ${spec.key} citationRef resolves to no known Citation (${ref.factKey}::${ref.sourceKey})`);
      await prisma.storyCitation.upsert({
        where: { storyId_citationId: { storyId: story.id, citationId } },
        update: {},
        create: { storyId: story.id, citationId, locator: ref.locator },
      });
    }
  }

  // -----------------------------------------------------------------------
  // Journeys (spec sections 35-37) - only real, PUBLISHED golden Places as
  // stops, no fabricated route geometry/distance.
  // -----------------------------------------------------------------------
  console.log('Seeding journeys from the golden dataset (see prisma/golden/journeys.ts)...');
  const journeysByKey = new Map<string, { id: string }>();
  for (const spec of GOLDEN_JOURNEYS) {
    if (spec.stops.length === 0) throw new Error(`Journey ${spec.key} has zero stops - refusing to seed (mirrors the zero-stop publication block).`);

    const journey = await prisma.journey.upsert({
      where: { canonicalSlug: spec.slug },
      update: {},
      create: {
        canonicalSlug: spec.slug,
        region: spec.region,
        editorialStatus: PublicationStatus.PUBLISHED,
        publishedAt: new Date(),
        translations: {
          create: [
            { locale: 'vi', title: spec.vi.title, slug: spec.slug, summary: spec.vi.summary, description: spec.vi.description, status: 'PUBLISHED', method: 'ORIGINAL' },
            { locale: 'en', title: spec.en.title, slug: slug(spec.en.title), summary: spec.en.summary, status: 'AI_ASSISTED', method: 'AI_ASSISTED' },
          ],
        },
      },
    });
    journeysByKey.set(spec.key, journey);

    for (const stop of spec.stops) {
      const place = placesByKey.get(stop.placeKey);
      if (!place) throw new Error(`Journey ${spec.key} references unknown place key ${stop.placeKey}`);
      await prisma.journeyStop.upsert({
        where: { journeyId_placeId: { journeyId: journey.id, placeId: place.id } },
        update: {},
        create: {
          journeyId: journey.id,
          placeId: place.id,
          order: stop.order,
          stopTitle: stop.stopTitle,
          recommendedDurationMinutes: stop.recommendedDurationMinutes,
          notes: stop.notes,
        },
      });
    }
  }

  // -----------------------------------------------------------------------
  // Editorial slots (spec section 38) - only real, published targets.
  // -----------------------------------------------------------------------
  console.log('Seeding editorial home slots from the golden dataset (see prisma/golden/editorial.ts)...');
  for (const spec of GOLDEN_EDITORIAL_SLOTS) {
    const targetMap = spec.entityKind === EntityKind.STORY ? storiesByKey : spec.entityKind === EntityKind.JOURNEY ? journeysByKey : placesByKey;
    const target = targetMap.get(spec.targetKey);
    if (!target) throw new Error(`Editorial slot ${spec.slotKey}#${spec.order} references unknown target ${spec.targetKey}`);
    await prisma.editorialSlot.upsert({
      where: { slotKey_order: { slotKey: spec.slotKey, order: spec.order } },
      update: { entityKind: spec.entityKind, entityId: target.id },
      create: { slotKey: spec.slotKey, order: spec.order, entityKind: spec.entityKind, entityId: target.id, createdById: editor.id },
    });
  }

  // -----------------------------------------------------------------------
  // Global Geography (G01 - Global Backend V2 Extension, additive to the
  // Vietnam-only historical domain above). See docs/backend/
  // GLOBAL_GEOGRAPHY.md and prisma/golden/geography.ts. `where: {
  // canonicalSlug }, update: {}` is the same idempotent-upsert convention
  // every prior golden-dataset entity above already uses - a second run
  // upserts the parent row as a no-op and never re-creates nested
  // translations/aliases.
  // -----------------------------------------------------------------------
  console.log('Seeding global geography from the golden dataset (see prisma/golden/geography.ts)...');

  const countriesByKey = new Map<string, { id: string }>();
  for (const spec of GOLDEN_COUNTRIES) {
    const canonicalSlug = slug(spec.vi.name);
    const country = await prisma.country.upsert({
      where: { canonicalSlug },
      update: {},
      create: {
        iso2: spec.iso2,
        iso3: spec.iso3,
        defaultLocale: spec.defaultLocale,
        defaultCurrency: spec.defaultCurrency,
        latitude: spec.lat,
        longitude: spec.lng,
        canonicalSlug,
        status: PublicationStatus.PUBLISHED,
        translations: {
          create: [
            { locale: 'vi', name: spec.vi.name, slug: canonicalSlug, shortDescription: spec.vi.shortDescription, method: 'ORIGINAL' },
            {
              locale: 'en',
              name: spec.en.name,
              slug: slug(spec.en.name),
              shortDescription: spec.en.shortDescription,
              method: 'AI_ASSISTED' as const,
              status: 'AI_ASSISTED' as const,
            },
          ],
        },
      },
    });
    countriesByKey.set(spec.key, country);

    for (const alias of spec.aliases ?? []) {
      await prisma.entityAlias.upsert({
        where: { entityType_entityId_locale_alias: { entityType: 'COUNTRY', entityId: country.id, locale: '', alias } },
        update: {},
        create: { entityType: 'COUNTRY', entityId: country.id, alias, aliasType: 'ROMANIZATION' },
      });
    }
    for (const la of spec.localizedAliases ?? []) {
      await prisma.entityAlias.upsert({
        where: { entityType_entityId_locale_alias: { entityType: 'COUNTRY', entityId: country.id, locale: la.locale, alias: la.alias } },
        update: {},
        create: { entityType: 'COUNTRY', entityId: country.id, locale: la.locale, alias: la.alias, aliasType: 'ALTERNATE_NAME' },
      });
    }
  }

  const regionsByKey = new Map<string, { id: string }>();
  for (const spec of GOLDEN_REGIONS) {
    const country = countriesByKey.get(spec.countryKey);
    if (!country) throw new Error(`Region ${spec.key} references unknown country ${spec.countryKey}`);
    const canonicalSlug = slug(spec.vi.name);
    const region = await prisma.region.upsert({
      where: { canonicalSlug },
      update: {},
      create: {
        countryId: country.id,
        type: spec.type,
        latitude: spec.lat,
        longitude: spec.lng,
        canonicalSlug,
        status: PublicationStatus.PUBLISHED,
        translations: {
          create: [
            { locale: 'vi', name: spec.vi.name, slug: canonicalSlug, method: 'ORIGINAL' },
            { locale: 'en', name: spec.en.name, slug: slug(spec.en.name), method: 'AI_ASSISTED' as const, status: 'AI_ASSISTED' as const },
          ],
        },
      },
    });
    regionsByKey.set(spec.key, region);
  }

  const citiesByKey = new Map<string, { id: string }>();
  for (const spec of GOLDEN_CITIES) {
    const country = countriesByKey.get(spec.countryKey);
    if (!country) throw new Error(`City ${spec.key} references unknown country ${spec.countryKey}`);
    const region = spec.regionKey ? regionsByKey.get(spec.regionKey) : undefined;
    if (spec.regionKey && !region) throw new Error(`City ${spec.key} references unknown region ${spec.regionKey}`);
    const canonicalSlug = slug(spec.vi.name);
    const city = await prisma.city.upsert({
      where: { canonicalSlug },
      update: {},
      create: {
        countryId: country.id,
        regionId: region?.id,
        timezone: spec.timezone,
        latitude: spec.lat,
        longitude: spec.lng,
        importance: spec.importance,
        canonicalSlug,
        status: PublicationStatus.PUBLISHED,
        translations: {
          create: [
            { locale: 'vi', name: spec.vi.name, slug: canonicalSlug, summary: spec.vi.summary, method: 'ORIGINAL' },
            {
              locale: 'en',
              name: spec.en.name,
              slug: slug(spec.en.name),
              summary: spec.en.summary,
              method: 'AI_ASSISTED' as const,
              status: 'AI_ASSISTED' as const,
            },
          ],
        },
      },
    });
    citiesByKey.set(spec.key, city);

    for (const alias of spec.aliases ?? []) {
      await prisma.entityAlias.upsert({
        where: { entityType_entityId_locale_alias: { entityType: 'CITY', entityId: city.id, locale: '', alias } },
        update: {},
        create: { entityType: 'CITY', entityId: city.id, alias, aliasType: 'ROMANIZATION' },
      });
    }
  }

  for (const spec of GOLDEN_DESTINATIONS) {
    const country = countriesByKey.get(spec.countryKey);
    if (!country) throw new Error(`Destination ${spec.key} references unknown country ${spec.countryKey}`);
    const region = spec.regionKey ? regionsByKey.get(spec.regionKey) : undefined;
    if (spec.regionKey && !region) throw new Error(`Destination ${spec.key} references unknown region ${spec.regionKey}`);
    const city = spec.cityKey ? citiesByKey.get(spec.cityKey) : undefined;
    if (spec.cityKey && !city) throw new Error(`Destination ${spec.key} references unknown city ${spec.cityKey}`);
    const canonicalSlug = slug(spec.vi.name);
    await prisma.destination.upsert({
      where: { canonicalSlug },
      update: {},
      create: {
        countryId: country.id,
        regionId: region?.id,
        cityId: city?.id,
        type: spec.type,
        latitude: spec.lat,
        longitude: spec.lng,
        importance: spec.importance,
        canonicalSlug,
        status: PublicationStatus.PUBLISHED,
        translations: {
          create: [
            { locale: 'vi', name: spec.vi.name, slug: canonicalSlug, summary: spec.vi.summary, method: 'ORIGINAL' },
            {
              locale: 'en',
              name: spec.en.name,
              slug: slug(spec.en.name),
              summary: spec.en.summary,
              method: 'AI_ASSISTED' as const,
              status: 'AI_ASSISTED' as const,
            },
          ],
        },
      },
    });
  }

  console.log(`Golden dataset seed complete (version ${GOLDEN_DATASET_VERSION}, reviewed ${GOLDEN_DATASET_REVIEWED_AT}).`);
  console.log(`Published ${publishedFactKeys.size}/${GOLDEN_FACTS.length} golden historical facts (100% of published facts carry >=1 VERIFIED citation - see docs/backend/GOLDEN_DATASET.md).`);
  console.log(
    `G01 Global Geography: ${GOLDEN_COUNTRIES.length} countries, ${GOLDEN_REGIONS.length} regions, ${GOLDEN_CITIES.length} cities, ${GOLDEN_DESTINATIONS.length} destinations.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
