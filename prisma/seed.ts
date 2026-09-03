/**
 * Golden Dataset seed (spec sections 50-52).
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
 *   labels (spec section 3).
 * - No Territory geometry is seeded - historical boundary polygons require
 *   real GIS/source material this seed does not fabricate (spec section 25).
 */
import { PrismaClient, PlaceType, DatePrecision, Role, AuthProvider, FactType, FactCertainty, PublicationStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import slugify from 'slugify';

const prisma = new PrismaClient();

function slug(input: string) {
  return slugify(input, { lower: true, strict: true, locale: 'vi' });
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
      const existing = await prisma.entityAlias.findFirst({ where: { entityType: 'PLACE', entityId: place.id, alias } });
      if (!existing) {
        await prisma.entityAlias.create({ data: { entityType: 'PLACE', entityId: place.id, alias, aliasType: 'ROMANIZATION' } });
      }
    }
  }

  return place;
}

async function upsertPerson(params: {
  vi: { name: string; summary?: string };
  en?: { name: string };
  birth?: { start?: string; precision: DatePrecision; label?: string };
  death?: { start?: string; precision: DatePrecision; label?: string };
}) {
  const canonicalSlug = slug(params.vi.name);
  return prisma.person.upsert({
    where: { canonicalSlug },
    update: {},
    create: {
      canonicalSlug,
      publicationStatus: PublicationStatus.PUBLISHED,
      birthDateStart: params.birth?.start ? new Date(params.birth.start) : undefined,
      birthDatePrecision: params.birth?.precision,
      birthDateLabel: params.birth?.label,
      deathDateStart: params.death?.start ? new Date(params.death.start) : undefined,
      deathDatePrecision: params.death?.precision,
      deathDateLabel: params.death?.label,
      translations: {
        create: [
          { locale: 'vi', displayName: params.vi.name, slug: slug(params.vi.name), summary: params.vi.summary, method: 'ORIGINAL' },
          ...(params.en ? [{ locale: 'en', displayName: params.en.name, slug: slug(params.en.name), method: 'HUMAN' as const }] : []),
        ],
      },
    },
  });
}

async function upsertEvent(params: {
  vi: { title: string; summary?: string };
  dateStart?: string;
  dateEnd?: string;
  precision: DatePrecision;
  label?: string;
  importance?: number;
}) {
  const canonicalSlug = slug(params.vi.title);
  return prisma.historicalEvent.upsert({
    where: { canonicalSlug },
    update: {},
    create: {
      canonicalSlug,
      publicationStatus: PublicationStatus.PUBLISHED,
      dateStart: params.dateStart ? new Date(params.dateStart) : undefined,
      dateEnd: params.dateEnd ? new Date(params.dateEnd) : undefined,
      datePrecision: params.precision,
      dateLabel: params.label,
      importance: params.importance ?? 5,
      translations: { create: [{ locale: 'vi', title: params.vi.title, slug: slug(params.vi.title), summary: params.vi.summary, method: 'ORIGINAL' }] },
    },
  });
}

async function upsertEra(params: { vi: { name: string; summary?: string }; dateStart?: string; dateEnd?: string; precision: DatePrecision }) {
  const canonicalSlug = slug(params.vi.name);
  return prisma.historicalEra.upsert({
    where: { canonicalSlug },
    update: {},
    create: {
      canonicalSlug,
      dateStart: params.dateStart ? new Date(params.dateStart) : undefined,
      dateEnd: params.dateEnd ? new Date(params.dateEnd) : undefined,
      datePrecision: params.precision,
      translations: { create: [{ locale: 'vi', name: params.vi.name, slug: slug(params.vi.name), summary: params.vi.summary }] },
    },
  });
}

async function upsertDynasty(params: { vi: { name: string; summary?: string }; dateStart?: string; dateEnd?: string; precision: DatePrecision }) {
  const canonicalSlug = slug(params.vi.name);
  return prisma.dynasty.upsert({
    where: { canonicalSlug },
    update: {},
    create: {
      canonicalSlug,
      dateStart: params.dateStart ? new Date(params.dateStart) : undefined,
      dateEnd: params.dateEnd ? new Date(params.dateEnd) : undefined,
      datePrecision: params.precision,
      translations: { create: [{ locale: 'vi', name: params.vi.name, slug: slug(params.vi.name), summary: params.vi.summary }] },
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
  const eraLy = await upsertEra({ vi: { name: 'Thoi Ly', summary: 'Trieu dai phong kien Viet Nam, kinh do tai Thang Long.' }, dateStart: '1009-01-01', dateEnd: '1225-12-31', precision: DatePrecision.YEAR });
  const eraTran = await upsertEra({ vi: { name: 'Thoi Tran' }, dateStart: '1225-01-01', dateEnd: '1400-12-31', precision: DatePrecision.YEAR });
  const eraLeSo = await upsertEra({ vi: { name: 'Thoi Le So' }, dateStart: '1428-01-01', dateEnd: '1527-12-31', precision: DatePrecision.YEAR });
  const eraTaySon = await upsertEra({ vi: { name: 'Thoi Tay Son' }, dateStart: '1778-01-01', dateEnd: '1802-12-31', precision: DatePrecision.YEAR });
  const eraNguyen = await upsertEra({ vi: { name: 'Thoi Nguyen' }, dateStart: '1802-01-01', dateEnd: '1945-12-31', precision: DatePrecision.YEAR });
  const eraModern = await upsertEra({ vi: { name: 'Thoi ky hien dai' }, dateStart: '1945-01-01', precision: DatePrecision.YEAR });

  await upsertDynasty({ vi: { name: 'Nha Ly' }, dateStart: '1009-01-01', dateEnd: '1225-12-31', precision: DatePrecision.YEAR });
  await upsertDynasty({ vi: { name: 'Nha Tran' }, dateStart: '1225-01-01', dateEnd: '1400-12-31', precision: DatePrecision.YEAR });
  await upsertDynasty({ vi: { name: 'Nha Nguyen' }, dateStart: '1802-01-01', dateEnd: '1945-12-31', precision: DatePrecision.YEAR });

  console.log('Seeding places...');
  const hoangThanh = await upsertPlace({
    type: PlaceType.CITADEL,
    vi: { name: 'Hoang thanh Thang Long', summary: 'Kinh do cua Viet Nam qua nhieu trieu dai, di san van hoa the gioi UNESCO.' },
    en: { name: 'Imperial Citadel of Thang Long' },
    lat: 21.0359, lng: 105.8402,
    aliases: ['Imperial Citadel of Thang Long', 'Thang Long'],
  });
  const vanMieu = await upsertPlace({
    type: PlaceType.TEMPLE,
    vi: { name: 'Van Mieu Quoc Tu Giam', summary: 'Van mieu va truong dai hoc dau tien cua Viet Nam, xay dung nam 1070.' },
    en: { name: 'Temple of Literature' },
    lat: 21.0288, lng: 105.8355,
  });
  const coLoa = await upsertPlace({
    type: PlaceType.ARCHAEOLOGICAL_SITE,
    vi: { name: 'Co Loa', summary: 'Kinh do cua nha nuoc Au Lac thoi An Duong Vuong.' },
    lat: 21.1000, lng: 105.8700,
  });
  const hoaLu = await upsertPlace({
    type: PlaceType.CITADEL,
    vi: { name: 'Hoa Lu', summary: 'Kinh do cua Viet Nam thoi nha Dinh va Tien Le.' },
    lat: 20.2650, lng: 105.9150,
  });
  const coDoHue = await upsertPlace({
    type: PlaceType.PALACE,
    vi: { name: 'Co do Hue', summary: 'Kinh do cua Viet Nam thoi nha Nguyen, di san van hoa the gioi UNESCO.' },
    en: { name: 'Hue Imperial City' },
    lat: 16.4674, lng: 107.5793,
    aliases: ['Hue', 'Imperial City of Hue'],
  });
  const myson = await upsertPlace({
    type: PlaceType.ARCHAEOLOGICAL_SITE,
    vi: { name: 'My Son', summary: 'Quan the den thap Champa, di san van hoa the gioi UNESCO.' },
    lat: 15.7639, lng: 108.1246,
  });
  const hoiAn = await upsertPlace({
    type: PlaceType.URBAN_AREA,
    vi: { name: 'Hoi An', summary: 'Do thi co, thuong cang lich su, di san van hoa the gioi UNESCO.' },
    lat: 15.8801, lng: 108.3380,
  });
  const dienBienPhu = await upsertPlace({
    type: PlaceType.BATTLEFIELD,
    vi: { name: 'Dien Bien Phu', summary: 'Dia diem chien dich Dien Bien Phu nam 1954.' },
    lat: 21.3860, lng: 103.0169,
  });
  const diaDaoCuChi = await upsertPlace({
    type: PlaceType.HISTORICAL_SITE,
    vi: { name: 'Dia dao Cu Chi', summary: 'He thong dia dao lich su tai Cu Chi, Thanh pho Ho Chi Minh.' },
    lat: 11.1400, lng: 106.4550,
  });
  const dinhDocLap = await upsertPlace({
    type: PlaceType.PALACE,
    vi: { name: 'Dinh Doc Lap', summary: 'Di tich lich su tai Thanh pho Ho Chi Minh.' },
    en: { name: 'Independence Palace' },
    lat: 10.7772, lng: 106.6953,
  });
  const hoangSa = await upsertPlace({
    type: PlaceType.ARCHIPELAGO,
    vi: { name: 'Hoang Sa', summary: 'Quan dao thuoc Bien Dong.' },
    en: { name: 'Hoang Sa (Paracel Islands)' },
    lat: 16.5, lng: 112.0,
    aliases: ['Paracel Islands'],
  });
  const truongSa = await upsertPlace({
    type: PlaceType.ARCHIPELAGO,
    vi: { name: 'Truong Sa', summary: 'Quan dao thuoc Bien Dong.' },
    en: { name: 'Truong Sa (Spratly Islands)' },
    lat: 8.6, lng: 111.9,
    aliases: ['Spratly Islands'],
  });

  console.log('Seeding people...');
  const lyCongUan = await upsertPerson({
    vi: { name: 'Ly Cong Uan', summary: 'Vi vua sang lap nha Ly, nguoi doi do ve Thang Long nam 1010.' },
    birth: { start: '0974-01-01', precision: DatePrecision.YEAR },
    death: { start: '1028-01-01', precision: DatePrecision.YEAR },
  });
  const tranHungDao = await upsertPerson({
    vi: { name: 'Tran Hung Dao', summary: 'Thong linh quan doi nha Tran trong khang chien chong Nguyen Mong.' },
    death: { start: '1300-01-01', precision: DatePrecision.YEAR },
  });
  const leLoi = await upsertPerson({
    vi: { name: 'Le Loi', summary: 'Nguoi lanh dao khoi nghia Lam Son, vi vua sang lap nha Le so.' },
    birth: { start: '1385-01-01', precision: DatePrecision.YEAR },
    death: { start: '1433-01-01', precision: DatePrecision.YEAR },
  });
  const quangTrung = await upsertPerson({
    vi: { name: 'Quang Trung', summary: 'Hoang de nha Tay Son, lanh dao chien thang Ngoc Hoi Dong Da.' },
    en: { name: 'Emperor Quang Trung' },
    birth: { start: '1753-01-01', precision: DatePrecision.YEAR },
    death: { start: '1792-01-01', precision: DatePrecision.YEAR },
  });
  const giaLong = await upsertPerson({
    vi: { name: 'Gia Long', summary: 'Vi vua sang lap nha Nguyen.' },
    birth: { start: '1762-01-01', precision: DatePrecision.YEAR },
    death: { start: '1820-01-01', precision: DatePrecision.YEAR },
  });
  const minhMang = await upsertPerson({
    vi: { name: 'Minh Mang', summary: 'Hoang de thu hai nha Nguyen.' },
    birth: { start: '1791-01-01', precision: DatePrecision.YEAR },
    death: { start: '1841-01-01', precision: DatePrecision.YEAR },
  });
  const hoChiMinh = await upsertPerson({
    vi: { name: 'Ho Chi Minh', summary: 'Nguoi sang lap nuoc Viet Nam Dan chu Cong hoa, doc Tuyen ngon Doc lap ngay 2/9/1945.' },
    birth: { start: '1890-05-19', precision: DatePrecision.EXACT },
    death: { start: '1969-09-02', precision: DatePrecision.EXACT },
  });
  const voNguyenGiap = await upsertPerson({
    vi: { name: 'Vo Nguyen Giap', summary: 'Dai tuong, tong tu lenh Quan doi nhan dan Viet Nam trong chien dich Dien Bien Phu.' },
    birth: { start: '1911-08-25', precision: DatePrecision.EXACT },
    death: { start: '2013-10-04', precision: DatePrecision.EXACT },
  });

  console.log('Seeding events...');
  const doiDo1010 = await upsertEvent({
    vi: { title: 'Doi do ve Thang Long nam 1010', summary: 'Ly Cong Uan doi kinh do tu Hoa Lu ve Dai La, doi ten thanh Thang Long.' },
    dateStart: '1010-01-01', precision: DatePrecision.YEAR, importance: 9,
  });
  const bachDang1288 = await upsertEvent({
    vi: { title: 'Chien thang Bach Dang 1288', summary: 'Chien thang cua quan doi nha Tran truoc quan Nguyen Mong tren song Bach Dang.' },
    dateStart: '1288-01-01', precision: DatePrecision.YEAR, importance: 9,
  });
  const lamSon = await upsertEvent({
    vi: { title: 'Khoi nghia Lam Son', summary: 'Cuoc khoi nghia do Le Loi lanh dao chong quan Minh, 1418-1427.' },
    dateStart: '1418-01-01', dateEnd: '1427-12-31', precision: DatePrecision.RANGE, importance: 8,
  });
  const ngocHoiDongDa = await upsertEvent({
    vi: { title: 'Ngoc Hoi Dong Da 1789', summary: 'Chien thang cua nghia quan Tay Son do Quang Trung lanh dao truoc quan Thanh.' },
    dateStart: '1789-01-01', precision: DatePrecision.YEAR, importance: 9,
  });
  const nguyenFounding = await upsertEvent({
    vi: { title: 'Thanh lap nha Nguyen', summary: 'Gia Long len ngoi, thanh lap trieu Nguyen nam 1802.' },
    dateStart: '1802-01-01', precision: DatePrecision.YEAR, importance: 7,
  });
  const tuyenNgon1945 = await upsertEvent({
    vi: { title: 'Tuyen ngon Doc lap 1945', summary: 'Ho Chi Minh doc Tuyen ngon Doc lap tai Quang truong Ba Dinh ngay 2/9/1945.' },
    dateStart: '1945-09-02', precision: DatePrecision.EXACT, importance: 10,
  });
  const dienBienPhu1954 = await upsertEvent({
    vi: { title: 'Chien thang Dien Bien Phu 1954', summary: 'Chien dich quyet dinh cham dut chien tranh Dong Duong lan thu nhat.' },
    dateStart: '1954-05-07', precision: DatePrecision.EXACT, importance: 10,
  });
  const ngay30thang4 = await upsertEvent({
    vi: { title: '30 thang 4 nam 1975', summary: 'Ngay thong nhat dat nuoc Viet Nam.' },
    dateStart: '1975-04-30', precision: DatePrecision.EXACT, importance: 10,
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
  const draftFact1 = await prisma.historicalFact.upsert({
    where: { id: 'seed-fact-doi-do-1010' },
    update: {},
    create: {
      id: 'seed-fact-doi-do-1010',
      factType: FactType.EVENT_DETAIL,
      dateStart: new Date('1010-01-01'),
      datePrecision: DatePrecision.YEAR,
      certainty: FactCertainty.HIGH_CONFIDENCE,
      createdById: editor.id,
      translations: {
        create: [{ locale: 'vi', statement: 'Ly Cong Uan ban "Chieu doi do", chuyen kinh do tu Hoa Lu ve thanh Dai La.', method: 'ORIGINAL' }],
      },
    },
  });
  await prisma.factEvent.upsert({ where: { factId_eventId: { factId: draftFact1.id, eventId: doiDo1010.id } }, update: {}, create: { factId: draftFact1.id, eventId: doiDo1010.id } });
  await prisma.factPerson.upsert({ where: { factId_personId: { factId: draftFact1.id, personId: lyCongUan.id } }, update: {}, create: { factId: draftFact1.id, personId: lyCongUan.id } });

  const draftFact2 = await prisma.historicalFact.upsert({
    where: { id: 'seed-fact-dbp-1954' },
    update: {},
    create: {
      id: 'seed-fact-dbp-1954',
      factType: FactType.MILITARY,
      dateStart: new Date('1954-05-07'),
      datePrecision: DatePrecision.EXACT,
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
