/**
 * Golden Dataset seed (spec sections 37-38).
 *
 * Trust-model discipline followed here, deliberately:
 * - Every Place/Person/Event/Era/Dynasty gets a short, uncontroversial,
 *   widely-known one-line `summary` (name, dates, basic classification) -
 *   the kind of statement that would appear in a gazetteer entry, not a
 *   contestable historical claim.
 * - The long-form `description` field is left EMPTY for every entity. Full
 *   narrative content must be authored editorially against real sources
 *   after this seed runs - it is not generated here.
 * - A handful of HistoricalFact rows are seeded to exercise the trust-layer
 *   schema end-to-end, but every one is left in DRAFT editorialStatus with
 *   NO citations attached. No source/citation metadata is fabricated. They
 *   cannot reach PUBLISHED until a real editor attaches and verifies a
 *   real citation (enforced by FactsService.setEditorialStatus).
 * - Hoang Sa and Truong Sa are seeded as real Place rows (type ARCHIPELAGO)
 *   with approximate real-world coordinates (public geographic knowledge,
 *   not a contested historical/territorial claim) - never hard-coded map
 *   labels (spec section 7).
 * - No Territory geometry is seeded - historical boundary polygons require
 *   real GIS/source material this seed does not fabricate (spec section 17).
 * - Historical dates use year/month/day + precision/qualifier, never a
 *   fabricated "YYYY-01-01" ISO string (spec section 3, CRITICAL) - see
 *   `HistoricalDateSeed` below and docs/backend/HISTORICAL_DOMAIN.md.
 */
import { PrismaClient, PlaceType, DatePrecision, DateQualifier, Role, AuthProvider, FactType, FactCertainty, PublicationStatus, ThemeCategory } from '@prisma/client';
import * as argon2 from 'argon2';
import slugify from 'slugify';
import { GOLDEN_PLACES } from './golden-dataset';

const prisma = new PrismaClient();

function slug(input: string) {
  return slugify(input, { lower: true, strict: true, locale: 'vi' });
}

/** Mirrors HistoricalDateInput (apps/api/src/common/historical-date) without importing across the package boundary. */
interface HistoricalDateSeed {
  year?: number;
  month?: number;
  day?: number;
  precision: DatePrecision;
  qualifier?: DateQualifier;
}

function yearOnly(year: number, qualifier: DateQualifier = DateQualifier.EXACT): HistoricalDateSeed {
  return { year, precision: DatePrecision.YEAR, qualifier };
}

function exactDate(year: number, month: number, day: number): HistoricalDateSeed {
  return { year, month, day, precision: DatePrecision.DAY, qualifier: DateQualifier.EXACT };
}

const UNKNOWN_DATE: HistoricalDateSeed = { precision: DatePrecision.UNKNOWN, qualifier: DateQualifier.UNCERTAIN };

/** Deterministic sort-only bounds - see apps/api's historical-date.util.ts for the authoritative (validated) version this mirrors. */
function sortBounds(d: HistoricalDateSeed): { start: Date | null; end: Date | null } {
  if (d.precision === DatePrecision.UNKNOWN || d.year == null) return { start: null, end: null };
  if (d.precision === DatePrecision.DAY) {
    const dt = new Date(Date.UTC(d.year, (d.month ?? 1) - 1, d.day ?? 1));
    return { start: dt, end: dt };
  }
  return { start: new Date(Date.UTC(d.year, 0, 1)), end: new Date(Date.UTC(d.year, 11, 31)) };
}

async function upsertPlace(params: {
  type: PlaceType;
  vi: { name: string; summary?: string };
  en?: { name: string; summary?: string };
  lat?: number;
  lng?: number;
  aliases?: string[];
}) {
  const canonicalSlug = slug(params.vi.name);
  const place = await prisma.place.upsert({
    where: { canonicalSlug },
    update: {},
    create: {
      type: params.type,
      canonicalSlug,
      publicationStatus: PublicationStatus.PUBLISHED,
      translations: {
        create: [
          { locale: 'vi', name: params.vi.name, slug: slug(params.vi.name), summary: params.vi.summary, method: 'ORIGINAL' },
          ...(params.en
            ? [{ locale: 'en', name: params.en.name, slug: slug(params.en.name), summary: params.en.summary, method: 'HUMAN' as const }]
            : []),
        ],
      },
    },
  });

  if (params.lat !== undefined && params.lng !== undefined) {
    await prisma.$executeRaw`UPDATE "Place" SET "location" = ST_SetSRID(ST_MakePoint(${params.lng}, ${params.lat}), 4326) WHERE "id" = ${place.id}`;
  }

  if (params.aliases) {
    for (const alias of params.aliases) {
      await prisma.entityAlias.upsert({
        where: { entityType_entityId_locale_alias: { entityType: 'PLACE', entityId: place.id, locale: '', alias } },
        update: {},
        create: { entityType: 'PLACE', entityId: place.id, alias, aliasType: 'ROMANIZATION' },
      });
    }
  }

  return place;
}

async function upsertPerson(params: {
  vi: { name: string; summary?: string };
  en?: { name: string };
  birth?: HistoricalDateSeed;
  death?: HistoricalDateSeed;
  aliases?: { alias: string; type: 'REGNAL_NAME' | 'TEMPLE_NAME' | 'BIRTH_NAME' | 'TITLE' | 'EPITHET' }[];
}) {
  const canonicalSlug = slug(params.vi.name);
  const birth = params.birth ?? UNKNOWN_DATE;
  const death = params.death ?? UNKNOWN_DATE;
  const birthSort = sortBounds(birth);
  const deathSort = sortBounds(death);

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
      birthQualifier: birth.qualifier ?? DateQualifier.EXACT,
      birthSortStart: birthSort.start,
      birthSortEnd: birthSort.end,
      deathYear: death.year,
      deathMonth: death.month,
      deathDay: death.day,
      deathPrecision: death.precision,
      deathQualifier: death.qualifier ?? DateQualifier.EXACT,
      deathSortStart: deathSort.start,
      deathSortEnd: deathSort.end,
      translations: {
        create: [
          { locale: 'vi', displayName: params.vi.name, slug: slug(params.vi.name), summary: params.vi.summary, method: 'ORIGINAL' },
          ...(params.en ? [{ locale: 'en', displayName: params.en.name, slug: slug(params.en.name), method: 'HUMAN' as const }] : []),
        ],
      },
    },
  });

  for (const a of params.aliases ?? []) {
    await prisma.entityAlias.upsert({
      where: { entityType_entityId_locale_alias: { entityType: 'PERSON', entityId: person.id, locale: '', alias: a.alias } },
      update: {},
      create: { entityType: 'PERSON', entityId: person.id, alias: a.alias, aliasType: a.type },
    });
  }

  return person;
}

async function upsertEvent(params: {
  vi: { title: string; summary?: string };
  date: HistoricalDateSeed;
  rangeEndYear?: number;
  importance?: number;
}) {
  const canonicalSlug = slug(params.vi.title);
  const qualifier = params.rangeEndYear ? DateQualifier.BETWEEN : params.date.qualifier ?? DateQualifier.EXACT;
  const sort = sortBounds(params.date);
  const sortEnd = params.rangeEndYear ? new Date(Date.UTC(params.rangeEndYear, 11, 31)) : sort.end;

  return prisma.historicalEvent.upsert({
    where: { canonicalSlug },
    update: {},
    create: {
      canonicalSlug,
      publicationStatus: PublicationStatus.PUBLISHED,
      dateYear: params.date.year,
      dateMonth: params.date.month,
      dateDay: params.date.day,
      datePrecision: params.date.precision,
      dateQualifier: qualifier,
      dateEndYear: params.rangeEndYear,
      dateSortStart: sort.start,
      dateSortEnd: sortEnd,
      importance: params.importance ?? 5,
      translations: { create: [{ locale: 'vi', title: params.vi.title, slug: slug(params.vi.title), summary: params.vi.summary, method: 'ORIGINAL' }] },
    },
  });
}

async function upsertEra(params: { vi: { name: string; summary?: string }; start: HistoricalDateSeed; end?: HistoricalDateSeed }) {
  const canonicalSlug = slug(params.vi.name);
  const startSort = sortBounds(params.start);
  const endSort = params.end ? sortBounds(params.end) : null;

  return prisma.historicalEra.upsert({
    where: { canonicalSlug },
    update: {},
    create: {
      canonicalSlug,
      startYear: params.start.year,
      startMonth: params.start.month,
      startDay: params.start.day,
      startPrecision: params.start.precision,
      startQualifier: params.start.qualifier ?? DateQualifier.EXACT,
      endYear: params.end?.year,
      endMonth: params.end?.month,
      endDay: params.end?.day,
      endPrecision: params.end?.precision,
      endQualifier: params.end?.qualifier ?? (params.end ? DateQualifier.EXACT : undefined),
      sortStart: startSort.start,
      sortEnd: endSort ? endSort.end : new Date(Date.UTC(9999, 11, 31)),
      translations: { create: [{ locale: 'vi', name: params.vi.name, slug: slug(params.vi.name), summary: params.vi.summary }] },
    },
  });
}

async function upsertDynasty(params: { vi: { name: string; summary?: string }; start: HistoricalDateSeed; end?: HistoricalDateSeed }) {
  const canonicalSlug = slug(params.vi.name);
  const startSort = sortBounds(params.start);
  const endSort = params.end ? sortBounds(params.end) : null;

  return prisma.dynasty.upsert({
    where: { canonicalSlug },
    update: {},
    create: {
      canonicalSlug,
      startYear: params.start.year,
      startMonth: params.start.month,
      startDay: params.start.day,
      startPrecision: params.start.precision,
      startQualifier: params.start.qualifier ?? DateQualifier.EXACT,
      endYear: params.end?.year,
      endMonth: params.end?.month,
      endDay: params.end?.day,
      endPrecision: params.end?.precision,
      endQualifier: params.end?.qualifier ?? (params.end ? DateQualifier.EXACT : undefined),
      sortStart: startSort.start,
      sortEnd: endSort ? endSort.end : new Date(Date.UTC(9999, 11, 31)),
      translations: { create: [{ locale: 'vi', name: params.vi.name, slug: slug(params.vi.name), summary: params.vi.summary }] },
    },
  });
}

async function upsertTheme(params: { slug: string; category: ThemeCategory; vi: string; en?: string }) {
  return prisma.theme.upsert({
    where: { slug: params.slug },
    update: {},
    create: {
      slug: params.slug,
      category: params.category,
      translations: {
        create: [
          { locale: 'vi', name: params.vi },
          ...(params.en ? [{ locale: 'en', name: params.en }] : []),
        ],
      },
    },
  });
}

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
  console.log('Seeding dev/test accounts...');
  await upsertDevUser('admin@dauviet.vn', 'Dau Viet Admin', [Role.ADMIN]);
  const editor = await upsertDevUser('editor@dauviet.vn', 'Dau Viet Editor', [Role.EDITOR]);
  const historian = await upsertDevUser('historian@dauviet.vn', 'Dau Viet Historian Reviewer', [Role.HISTORIAN_REVIEWER]);
  await upsertDevUser('moderator@dauviet.vn', 'Dau Viet Moderator', [Role.MODERATOR]);
  await upsertDevUser('contributor@dauviet.vn', 'Dau Viet Contributor', [Role.CONTRIBUTOR]);
  await upsertDevUser('user@dauviet.vn', 'Dau Viet Reader', [Role.USER]);

  console.log('Seeding eras and dynasties...');
  const eraLy = await upsertEra({ vi: { name: 'Thoi Ly', summary: 'Trieu dai phong kien Viet Nam, kinh do tai Thang Long.' }, start: yearOnly(1009), end: yearOnly(1225) });
  const eraTran = await upsertEra({ vi: { name: 'Thoi Tran' }, start: yearOnly(1225), end: yearOnly(1400) });
  const eraLeSo = await upsertEra({ vi: { name: 'Thoi Le So' }, start: yearOnly(1428), end: yearOnly(1527) });
  const eraTaySon = await upsertEra({ vi: { name: 'Thoi Tay Son' }, start: yearOnly(1778), end: yearOnly(1802) });
  const eraNguyen = await upsertEra({ vi: { name: 'Thoi Nguyen' }, start: yearOnly(1802), end: yearOnly(1945) });
  const eraModern = await upsertEra({ vi: { name: 'Thoi ky hien dai' }, start: yearOnly(1945) }); // no `end`: still ongoing, not an unknown end

  await upsertDynasty({ vi: { name: 'Nha Ly' }, start: yearOnly(1009), end: yearOnly(1225) });
  await upsertDynasty({ vi: { name: 'Nha Tran' }, start: yearOnly(1225), end: yearOnly(1400) });
  await upsertDynasty({ vi: { name: 'Nha Nguyen' }, start: yearOnly(1802), end: yearOnly(1945) });

  console.log('Seeding places from the golden dataset (see prisma/golden-dataset.ts)...');
  const placesBySlug = new Map<string, Awaited<ReturnType<typeof upsertPlace>>>();
  for (const spec of GOLDEN_PLACES) {
    const place = await upsertPlace(spec);
    placesBySlug.set(slug(spec.vi.name), place);
  }
  const hoangThanh = placesBySlug.get(slug('Hoang thanh Thang Long'))!;
  const coDoHue = placesBySlug.get(slug('Co do Hue'))!;
  const dienBienPhu = placesBySlug.get(slug('Dien Bien Phu'))!;
  const dinhDocLap = placesBySlug.get(slug('Dinh Doc Lap'))!;

  console.log('Seeding people...');
  const lyCongUan = await upsertPerson({
    vi: { name: 'Ly Cong Uan', summary: 'Vi vua sang lap nha Ly, nguoi doi do ve Thang Long nam 1010.' },
    birth: yearOnly(974),
    death: yearOnly(1028),
  });
  const tranHungDao = await upsertPerson({
    vi: { name: 'Tran Hung Dao', summary: 'Thong linh quan doi nha Tran trong khang chien chong Nguyen Mong.' },
    death: yearOnly(1300),
    aliases: [{ alias: 'Hung Dao Dai Vuong', type: 'TITLE' }],
  });
  const leLoi = await upsertPerson({
    vi: { name: 'Le Loi', summary: 'Nguoi lanh dao khoi nghia Lam Son, vi vua sang lap nha Le so.' },
    birth: yearOnly(1385),
    death: yearOnly(1433),
  });
  const quangTrung = await upsertPerson({
    vi: { name: 'Quang Trung', summary: 'Hoang de nha Tay Son, lanh dao chien thang Ngoc Hoi Dong Da.' },
    en: { name: 'Emperor Quang Trung' },
    birth: yearOnly(1753),
    death: yearOnly(1792),
    aliases: [{ alias: 'Nguyen Hue', type: 'BIRTH_NAME' }],
  });
  const giaLong = await upsertPerson({
    vi: { name: 'Gia Long', summary: 'Vi vua sang lap nha Nguyen.' },
    birth: yearOnly(1762),
    death: yearOnly(1820),
    aliases: [{ alias: 'Nguyen Anh', type: 'BIRTH_NAME' }],
  });
  const minhMang = await upsertPerson({
    vi: { name: 'Minh Mang', summary: 'Hoang de thu hai nha Nguyen.' },
    birth: yearOnly(1791),
    death: yearOnly(1841),
  });
  const hoChiMinh = await upsertPerson({
    vi: { name: 'Ho Chi Minh', summary: 'Nguoi sang lap nuoc Viet Nam Dan chu Cong hoa, doc Tuyen ngon Doc lap ngay 2/9/1945.' },
    birth: exactDate(1890, 5, 19),
    death: exactDate(1969, 9, 2),
  });
  const voNguyenGiap = await upsertPerson({
    vi: { name: 'Vo Nguyen Giap', summary: 'Dai tuong, tong tu lenh Quan doi nhan dan Viet Nam trong chien dich Dien Bien Phu.' },
    birth: exactDate(1911, 8, 25),
    death: exactDate(2013, 10, 4),
  });

  console.log('Seeding events...');
  const doiDo1010 = await upsertEvent({
    vi: { title: 'Doi do ve Thang Long nam 1010', summary: 'Ly Cong Uan doi kinh do tu Hoa Lu ve Dai La, doi ten thanh Thang Long.' },
    date: yearOnly(1010), importance: 9,
  });
  const bachDang1288 = await upsertEvent({
    vi: { title: 'Chien thang Bach Dang 1288', summary: 'Chien thang cua quan doi nha Tran truoc quan Nguyen Mong tren song Bach Dang.' },
    date: yearOnly(1288), importance: 9,
  });
  const lamSon = await upsertEvent({
    vi: { title: 'Khoi nghia Lam Son', summary: 'Cuoc khoi nghia do Le Loi lanh dao chong quan Minh, 1418-1427.' },
    date: yearOnly(1418), rangeEndYear: 1427, importance: 8,
  });
  const ngocHoiDongDa = await upsertEvent({
    vi: { title: 'Ngoc Hoi Dong Da 1789', summary: 'Chien thang cua nghia quan Tay Son do Quang Trung lanh dao truoc quan Thanh.' },
    date: yearOnly(1789), importance: 9,
  });
  const nguyenFounding = await upsertEvent({
    vi: { title: 'Thanh lap nha Nguyen', summary: 'Gia Long len ngoi, thanh lap trieu Nguyen nam 1802.' },
    date: yearOnly(1802), importance: 7,
  });
  const tuyenNgon1945 = await upsertEvent({
    vi: { title: 'Tuyen ngon Doc lap 1945', summary: 'Ho Chi Minh doc Tuyen ngon Doc lap tai Quang truong Ba Dinh ngay 2/9/1945.' },
    date: exactDate(1945, 9, 2), importance: 10,
  });
  const dienBienPhu1954 = await upsertEvent({
    vi: { title: 'Chien thang Dien Bien Phu 1954', summary: 'Chien dich quyet dinh cham dut chien tranh Dong Duong lan thu nhat.' },
    date: exactDate(1954, 5, 7), importance: 10,
  });
  const ngay30thang4 = await upsertEvent({
    vi: { title: '30 thang 4 nam 1975', summary: 'Ngay thong nhat dat nuoc Viet Nam.' },
    date: exactDate(1975, 4, 30), importance: 10,
  });

  console.log('Linking events to eras/places/people...');
  await prisma.historicalEvent.update({ where: { id: doiDo1010.id }, data: { eraId: eraLy.id } });
  await prisma.historicalEvent.update({ where: { id: bachDang1288.id }, data: { eraId: eraTran.id } });
  await prisma.historicalEvent.update({ where: { id: lamSon.id }, data: { eraId: eraLeSo.id } });
  await prisma.historicalEvent.update({ where: { id: ngocHoiDongDa.id }, data: { eraId: eraTaySon.id } });
  await prisma.historicalEvent.update({ where: { id: nguyenFounding.id }, data: { eraId: eraNguyen.id } });
  await prisma.historicalEvent.update({ where: { id: tuyenNgon1945.id }, data: { eraId: eraModern.id } });
  await prisma.historicalEvent.update({ where: { id: dienBienPhu1954.id }, data: { eraId: eraModern.id } });
  await prisma.historicalEvent.update({ where: { id: ngay30thang4.id }, data: { eraId: eraModern.id } });

  const linkEventPlace = (eventId: string, placeId: string) =>
    prisma.eventPlace.upsert({ where: { eventId_placeId: { eventId, placeId } }, update: {}, create: { eventId, placeId } });
  const linkEventPerson = (eventId: string, personId: string) =>
    prisma.eventPerson.upsert({ where: { eventId_personId: { eventId, personId } }, update: {}, create: { eventId, personId } });

  await linkEventPlace(doiDo1010.id, hoangThanh.id);
  await linkEventPerson(doiDo1010.id, lyCongUan.id);
  await linkEventPerson(bachDang1288.id, tranHungDao.id);
  await linkEventPerson(lamSon.id, leLoi.id);
  await linkEventPerson(ngocHoiDongDa.id, quangTrung.id);
  await linkEventPerson(nguyenFounding.id, giaLong.id);
  await linkEventPlace(nguyenFounding.id, coDoHue.id);
  await linkEventPerson(tuyenNgon1945.id, hoChiMinh.id);
  await linkEventPlace(dienBienPhu1954.id, dienBienPhu.id);
  await linkEventPerson(dienBienPhu1954.id, voNguyenGiap.id);
  await linkEventPlace(ngay30thang4.id, dinhDocLap.id);

  console.log('Seeding event themes (spec section 11)...');
  const themePolitical = await upsertTheme({ slug: 'political', category: ThemeCategory.POLITICAL, vi: 'Chinh tri', en: 'Political' });
  const themeMilitary = await upsertTheme({ slug: 'military', category: ThemeCategory.MILITARY, vi: 'Quan su', en: 'Military' });
  const themeTerritorial = await upsertTheme({ slug: 'territorial', category: ThemeCategory.TERRITORIAL, vi: 'Lanh tho', en: 'Territorial' });
  const themeHeritage = await upsertTheme({ slug: 'heritage', category: ThemeCategory.HERITAGE, vi: 'Di san', en: 'Heritage' });

  const linkEventTheme = (eventId: string, themeId: string) =>
    prisma.eventTheme.upsert({ where: { eventId_themeId: { eventId, themeId } }, update: {}, create: { eventId, themeId } });

  await linkEventTheme(doiDo1010.id, themePolitical.id);
  await linkEventTheme(doiDo1010.id, themeHeritage.id);
  await linkEventTheme(bachDang1288.id, themeMilitary.id);
  await linkEventTheme(bachDang1288.id, themeTerritorial.id);
  await linkEventTheme(lamSon.id, themeMilitary.id);
  await linkEventTheme(ngocHoiDongDa.id, themeMilitary.id);
  await linkEventTheme(nguyenFounding.id, themePolitical.id);
  await linkEventTheme(tuyenNgon1945.id, themePolitical.id);
  await linkEventTheme(dienBienPhu1954.id, themeMilitary.id);
  await linkEventTheme(dienBienPhu1954.id, themeTerritorial.id);
  await linkEventTheme(ngay30thang4.id, themePolitical.id);

  const linkPersonDynasty = async (personId: string, dynastyName: string) => {
    const dynasty = await prisma.dynasty.findUnique({ where: { canonicalSlug: slug(dynastyName) } });
    if (!dynasty) return;
    await prisma.personDynasty.upsert({
      where: { personId_dynastyId: { personId, dynastyId: dynasty.id } },
      update: {},
      create: { personId, dynastyId: dynasty.id },
    });
  };
  await linkPersonDynasty(lyCongUan.id, 'Nha Ly');
  await linkPersonDynasty(tranHungDao.id, 'Nha Tran');
  await linkPersonDynasty(giaLong.id, 'Nha Nguyen');
  await linkPersonDynasty(minhMang.id, 'Nha Nguyen');

  console.log('Seeding draft (unverified, uncited) historical facts to exercise the trust layer...');
  const doiDo1010Date = yearOnly(1010);
  const doiDo1010Sort = sortBounds(doiDo1010Date);
  const draftFact1 = await prisma.historicalFact.upsert({
    where: { id: 'seed-fact-doi-do-1010' },
    update: {},
    create: {
      id: 'seed-fact-doi-do-1010',
      factType: FactType.EVENT_DETAIL,
      dateYear: doiDo1010Date.year,
      datePrecision: doiDo1010Date.precision,
      dateQualifier: doiDo1010Date.qualifier,
      dateSortStart: doiDo1010Sort.start,
      dateSortEnd: doiDo1010Sort.end,
      certainty: FactCertainty.HIGH_CONFIDENCE,
      createdById: editor.id,
      translations: {
        create: [{ locale: 'vi', statement: 'Ly Cong Uan ban "Chieu doi do", chuyen kinh do tu Hoa Lu ve thanh Dai La.', method: 'ORIGINAL' }],
      },
    },
  });
  await prisma.factEvent.upsert({ where: { factId_eventId: { factId: draftFact1.id, eventId: doiDo1010.id } }, update: {}, create: { factId: draftFact1.id, eventId: doiDo1010.id } });
  await prisma.factPerson.upsert({ where: { factId_personId: { factId: draftFact1.id, personId: lyCongUan.id } }, update: {}, create: { factId: draftFact1.id, personId: lyCongUan.id } });

  const dbp1954Date = exactDate(1954, 5, 7);
  const dbp1954Sort = sortBounds(dbp1954Date);
  const draftFact2 = await prisma.historicalFact.upsert({
    where: { id: 'seed-fact-dbp-1954' },
    update: {},
    create: {
      id: 'seed-fact-dbp-1954',
      factType: FactType.MILITARY,
      dateYear: dbp1954Date.year,
      dateMonth: dbp1954Date.month,
      dateDay: dbp1954Date.day,
      datePrecision: dbp1954Date.precision,
      dateQualifier: dbp1954Date.qualifier,
      dateSortStart: dbp1954Sort.start,
      dateSortEnd: dbp1954Sort.end,
      certainty: FactCertainty.CONFIRMED,
      createdById: historian.id,
      translations: {
        create: [{ locale: 'vi', statement: 'Chien dich Dien Bien Phu ket thuc ngay 7/5/1954 voi thang loi cua Quan doi nhan dan Viet Nam.', method: 'ORIGINAL' }],
      },
    },
  });
  await prisma.factEvent.upsert({ where: { factId_eventId: { factId: draftFact2.id, eventId: dienBienPhu1954.id } }, update: {}, create: { factId: draftFact2.id, eventId: dienBienPhu1954.id } });

  console.log('Seeding one editorial Story (product content, not a historical claim) to exercise the editorial pipeline...');
  const welcomeStory = await prisma.story.upsert({
    where: { canonicalSlug: 'chao-mung-den-voi-dau-viet' },
    update: {},
    create: {
      canonicalSlug: 'chao-mung-den-voi-dau-viet',
      authorId: editor.id,
      editorialStatus: PublicationStatus.PUBLISHED,
      publishedAt: new Date(),
      translations: {
        create: [
          {
            locale: 'vi',
            title: 'Chao mung den voi Dau Viet',
            slug: 'chao-mung-den-voi-dau-viet',
            summary: 'Theo dau Viet Nam qua thoi gian - ban do song dong ve lich su, con nguoi va vung dat Viet Nam.',
            status: 'PUBLISHED',
            method: 'ORIGINAL',
          },
        ],
      },
    },
  });
  await prisma.storyPlace.upsert({
    where: { storyId_placeId: { storyId: welcomeStory.id, placeId: hoangThanh.id } },
    update: {},
    create: { storyId: welcomeStory.id, placeId: hoangThanh.id },
  });

  console.log('Golden dataset seed complete.');
  console.log('NOTE: HistoricalFact rows seed_fact_doi_do_1010 and seed_fact_dbp_1954 are DRAFT with no citations.');
  console.log('They cannot be published until a real Source + verified Citation is attached by an editor.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
