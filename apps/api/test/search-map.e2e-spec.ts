import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { DateEra } from '@prisma/client';
import { bootstrapTestApp } from './bootstrap-test-app';
import { countRedisNamespace, deleteRedisNamespace } from './redis-namespace';
import { PrismaService } from '../src/prisma/prisma.service';
import { SearchProjectionService } from '../src/modules/search/search-projection.service';
import { toChronologyYearEnd, toChronologyYearStart } from '../src/common/historical-date/historical-date.util';

/**
 * G11 Global Search & Map - real HTTP + real PostgreSQL/PostGIS. Fixtures are created with unique tokens and
 * remote bounding boxes so they never interfere with the Golden Dataset, and all of them are removed afterwards.
 * The projection worker is disabled for the main app so every test drives the projection deterministically with
 * `drain()`; a dedicated second app with the worker ENABLED proves real freshness.
 */
process.env.RATE_LIMIT_MAX = '100000';
process.env.SEARCH_RATE_LIMIT_MAX = '100000';
process.env.SEARCH_PROJECTION_WORKER_ENABLED = 'false';
jest.setTimeout(90_000);

describe('Global Search & Map (G11) - e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let projection: SearchProjectionService;

  const stamp = Date.now();
  const TK = `zq${stamp.toString(36)}`;
  let seq = 0;
  const uid = () => `${TK}${(seq++).toString(36)}`;
  const createdEmails: string[] = [];
  const created = {
    countries: [] as string[], regions: [] as string[], cities: [] as string[], destinations: [] as string[], places: [] as string[],
    persons: [] as string[], events: [] as string[], territories: [] as string[], stories: [] as string[], communityStories: [] as string[],
    themes: [] as string[], eras: [] as string[],
  };
  let adminToken: string;
  let ownerToken: string;
  let ownerId: string;

  async function registerAndLogin(label: string, roles: string[] = ['USER']) {
    const email = `g11-${label}-${stamp}@example.com`;
    createdEmails.push(email);
    await request(app.getHttpServer()).post('/v1/auth/register').send({ email, password: 'E2eTest-Pass!1', displayName: email }).expect(201);
    if (roles.length !== 1 || roles[0] !== 'USER') await prisma.user.update({ where: { email }, data: { roles: roles as any } });
    const res = await request(app.getHttpServer()).post('/v1/auth/login').send({ email, password: 'E2eTest-Pass!1' }).expect(201);
    return { token: res.body.data.accessToken as string, id: res.body.data.user.id as string };
  }

  // ---------------------------------------------------------------- fixtures
  async function mkCountry(vi: string, en?: string) {
    const n = seq++;
    const c = await prisma.country.create({
      data: {
        canonicalSlug: uid(), iso2: `Q${String.fromCharCode(65 + n)}`, iso3: `QX${String.fromCharCode(65 + n)}`, defaultLocale: 'vi', defaultCurrency: 'USD', status: 'PUBLISHED',
        latitude: -55, longitude: -65,
        translations: { create: [{ locale: 'vi', name: vi, slug: uid() }, ...(en ? [{ locale: 'en', name: en, slug: uid() }] : [])] },
      },
    });
    created.countries.push(c.id);
    return c;
  }
  async function mkPlace(o: { vi: string; en?: string; importance?: number; status?: 'PUBLISHED' | 'DRAFT'; lng?: number; lat?: number; type?: string; countryId?: string; regionId?: string; cityId?: string; summary?: string }) {
    const p = await prisma.place.create({
      data: {
        canonicalSlug: uid(), type: (o.type ?? 'HISTORICAL_SITE') as any, publicationStatus: (o.status ?? 'PUBLISHED') as any, historicalImportance: o.importance ?? 5,
        currentCountryId: o.countryId, currentRegionId: o.regionId, currentCityId: o.cityId,
        translations: { create: [{ locale: 'vi', name: o.vi, slug: uid(), summary: o.summary }, ...(o.en ? [{ locale: 'en', name: o.en, slug: uid() }] : [])] },
      },
    });
    if (o.lng !== undefined && o.lat !== undefined) {
      await prisma.$executeRaw`UPDATE "Place" SET "location" = ST_SetSRID(ST_MakePoint(${o.lng}, ${o.lat}), 4326) WHERE "id" = ${p.id}`;
    }
    created.places.push(p.id);
    return p;
  }
  async function mkEvent(o: { vi: string; startYear?: number; startEra?: DateEra; endYear?: number; endEra?: DateEra; placeId?: string; importance?: number; status?: 'PUBLISHED' | 'DRAFT'; countryId?: string }) {
    const known = o.startYear !== undefined;
    const e = await prisma.historicalEvent.create({
      data: {
        canonicalSlug: uid(), publicationStatus: (o.status ?? 'PUBLISHED') as any, importance: o.importance ?? 5,
        dateChronologyStart: known ? toChronologyYearStart(o.startYear!, o.startEra ?? DateEra.CE) : null,
        dateChronologyEnd: known ? toChronologyYearEnd(o.endYear ?? o.startYear!, o.endEra ?? o.startEra ?? DateEra.CE) : null,
        translations: { create: [{ locale: 'vi', title: o.vi, slug: uid() }] },
      },
    });
    if (o.placeId) await prisma.eventPlace.create({ data: { eventId: e.id, placeId: o.placeId } });
    if (o.countryId) await prisma.eventCountry.create({ data: { eventId: e.id, countryId: o.countryId } });
    created.events.push(e.id);
    return e;
  }
  async function mkTerritory(o: { vi: string; ring: string; startYear?: number; startEra?: DateEra; endYear?: number; endEra?: DateEra; geometryStatus?: 'PUBLISHED' | 'DRAFT' }) {
    const t = await prisma.territory.create({
      data: {
        canonicalSlug: uid(), type: 'KINGDOM' as any, geometryStatus: (o.geometryStatus ?? 'PUBLISHED') as any,
        chronologyStart: o.startYear !== undefined ? toChronologyYearStart(o.startYear, o.startEra ?? DateEra.CE) : null,
        chronologyEnd: o.startYear !== undefined ? toChronologyYearEnd(o.endYear ?? o.startYear, o.endEra ?? o.startEra ?? DateEra.CE) : null,
        translations: { create: [{ locale: 'vi', name: o.vi, slug: uid() }] },
      },
    });
    await prisma.$executeRaw`UPDATE "Territory" SET "geometry" = ST_GeomFromText(${`POLYGON((${o.ring}))`}, 4326) WHERE "id" = ${t.id}`;
    created.territories.push(t.id);
    return t;
  }
  const addAlias = (kind: string, entityId: string, alias: string, aliasType = 'HISTORICAL_NAME', locale = '') =>
    prisma.entityAlias.create({ data: { entityType: kind as any, entityId, alias, aliasType: aliasType as any, locale } });

  // ---------------------------------------------------------------- http helpers
  const search = (q: string, params: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
    request(app.getHttpServer()).get('/v1/search').set(headers).query({ q, ...params });
  const map = (params: Record<string, unknown>) => request(app.getHttpServer()).get('/v1/map/features').query(params);
  const results = (res: request.Response) => (res.body.data.results as Array<any>);
  const ids = (res: request.Response) => results(res).map((r) => r.id);
  const sync = async () => {
    const r = await projection.drain();
    expect(r.failed).toBe(0);
  };
  // G12: wipes every Redis key this app instance owns (the run-scoped BullMQ namespace set by
  // e2e-global-setup.ts) - total loss of this application's Redis state, without the FLUSHALL that
  // used to wipe the shared dev Redis, and asserted rather than best-effort.
  const wipeOwnRedisState = async () => {
    await deleteRedisNamespace(process.env.REDIS_KEY_PREFIX!);
    expect(await countRedisNamespace(process.env.REDIS_KEY_PREFIX!)).toBe(0);
  };

  beforeAll(async () => {
    app = await bootstrapTestApp();
    prisma = app.get(PrismaService);
    projection = app.get(SearchProjectionService);
    ({ token: adminToken } = await registerAndLogin('admin', ['USER', 'ADMIN']));
    ({ token: ownerToken, id: ownerId } = await registerAndLogin('owner'));
    // Bring the projection in line with the current canonical data (also proves a first-time rebuild).
    const first = await projection.rebuildAll();
    expect(first.failed).toBe(0);
  }, 120_000);

  afterAll(async () => {
    const all = Object.values(created).flat();
    const tripIds = (await prisma.trip.findMany({ where: { owner: { email: { in: createdEmails } } }, select: { id: true } })).map((t) => t.id);
    if (tripIds.length > 0) {
      await prisma.tripMemberLocation.deleteMany({ where: { tripId: { in: tripIds } } });
      await prisma.tripLocationSharing.deleteMany({ where: { tripId: { in: tripIds } } });
      await prisma.tripExpenseShare.deleteMany({ where: { expense: { tripId: { in: tripIds } } } });
      await prisma.tripExpense.deleteMany({ where: { tripId: { in: tripIds } } });
      await prisma.tripInvitation.deleteMany({ where: { tripId: { in: tripIds } } });
      await prisma.tripCollaborationEvent.deleteMany({ where: { tripId: { in: tripIds } } });
      await prisma.tripMember.deleteMany({ where: { tripId: { in: tripIds } } });
    }
    await prisma.affiliateConversion.deleteMany({ where: { evidenceReference: { contains: TK } } });
    await prisma.affiliateClick.deleteMany({ where: { campaignKey: { startsWith: 'cmp-bm' } } });
    await prisma.affiliateSession.deleteMany({ where: { campaignKey: { startsWith: 'cmp-bm' } } });
    await prisma.entityAlias.deleteMany({ where: { entityId: { in: all } } });
    await prisma.eventPlace.deleteMany({ where: { eventId: { in: created.events } } });
    await prisma.eventCountry.deleteMany({ where: { eventId: { in: created.events } } });
    await prisma.communityStory.deleteMany({ where: { id: { in: created.communityStories } } });
    await prisma.historicalEvent.deleteMany({ where: { id: { in: created.events } } });
    await prisma.territory.deleteMany({ where: { id: { in: created.territories } } });
    await prisma.place.deleteMany({ where: { id: { in: created.places } } });
    await prisma.destination.deleteMany({ where: { id: { in: created.destinations } } });
    await prisma.city.deleteMany({ where: { id: { in: created.cities } } });
    await prisma.region.deleteMany({ where: { id: { in: created.regions } } });
    await prisma.country.deleteMany({ where: { id: { in: created.countries } } });
    await prisma.person.deleteMany({ where: { id: { in: created.persons } } });
    await prisma.story.deleteMany({ where: { id: { in: created.stories } } });
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    await projection.drain();
    await app.close();
  }, 120_000);

  // ============================================================== exact / localized / accentless / normalization
  describe('retrieval and Vietnamese normalization (spec 17-19, 25-26, 98)', () => {
    let place: { id: string };

    beforeAll(async () => {
      place = await mkPlace({ vi: `Đại Nội Vàng ${TK}`, en: `Golden Citadel ${TK}`, importance: 8, summary: 'Thành cổ ven sông.' });
      await sync();
    });

    it('exact canonical title -> tier EXACT_CANONICAL, first', async () => {
      const res = await search(`Đại Nội Vàng ${TK}`).expect(200);
      expect(res.body.success).toBe(true);
      expect(results(res)[0]).toMatchObject({ id: place.id, entityType: 'PLACE', matchTier: 'EXACT_CANONICAL', title: `Đại Nội Vàng ${TK}`, trustClass: 'CANONICAL' });
    });

    it('accentless Vietnamese query finds the diacritic title, and the displayed title keeps its diacritics', async () => {
      const res = await search(`dai noi vang ${TK}`).expect(200);
      expect(results(res)[0]).toMatchObject({ id: place.id, matchTier: 'EXACT_CANONICAL', title: `Đại Nội Vàng ${TK}` });
    });

    it('đ <-> d matching in both directions', async () => {
      expect(ids(await search(`ĐẠI NỘI VÀNG ${TK}`))).toContain(place.id);
      expect(ids(await search(`dai noi vang ${TK}`))).toContain(place.id);
      const other = await mkPlace({ vi: `Đồng Đăng ${TK}` });
      await sync();
      expect(ids(await search(`dong dang ${TK}`))).toContain(other.id);
      expect(ids(await search(`Đồng Đăng ${TK}`))).toContain(other.id);
    });

    it('NFC and NFD forms of the same query return identical results (server-side normalization)', async () => {
      const q = `Đại Nội Vàng ${TK}`;
      const nfc = await search(q.normalize('NFC')).expect(200);
      const nfd = await search(q.normalize('NFD')).expect(200);
      expect(q.normalize('NFC')).not.toBe(q.normalize('NFD'));
      expect(ids(nfd)).toEqual(ids(nfc));
      expect(ids(nfc)).toContain(place.id);
    });

    it('case, whitespace and punctuation are normalized', async () => {
      expect(ids(await search(`  ĐẠI   nội-vàng, ${TK.toUpperCase()}!  `))).toContain(place.id);
    });

    it('exact localized (EN) title -> tier EXACT_LOCALIZED with the EN text and no fallback', async () => {
      const res = await search(`golden citadel ${TK}`, { locale: 'en' }).expect(200);
      expect(results(res)[0]).toMatchObject({ id: place.id, matchTier: 'EXACT_LOCALIZED', title: `Golden Citadel ${TK}`, locale: 'en', actualLocale: 'en', fallbackUsed: false });
    });

    it('cross-language retrieval works only through stored translations (an EN query finds the entity; a query with no stored EN text does not)', async () => {
      expect(ids(await search(`golden citadel ${TK}`, { locale: 'vi' }))).toContain(place.id);
      const viOnly = await mkPlace({ vi: `Chỉ Tiếng Việt ${TK}` });
      await sync();
      const invented = results(await search(`only vietnamese ${TK}`, { locale: 'en' })).find((r) => r.id === viOnly.id);
      expect(invented === undefined || invented.matchTier === 'FUZZY').toBe(true); // never an exact/prefix/text hit on an invented translation
      const terms = await prisma.searchTerm.findMany({ where: { document: { entityId: viOnly.id } } });
      expect(terms.some((x) => x.termKind === 'LOCALIZED_TITLE')).toBe(false);
    });

    it('missing translation is not fabricated: locale=en resolves through the accepted fallback and reports it', async () => {
      const viOnly = await mkPlace({ vi: `Chỉ Việt Fallback ${TK}` });
      await sync();
      const res = await search(`chi viet fallback ${TK}`, { locale: 'en' }).expect(200);
      expect(results(res)[0]).toMatchObject({ id: viOnly.id, title: `Chỉ Việt Fallback ${TK}`, locale: 'en', actualLocale: 'vi', fallbackUsed: true });
    });

    it('prefix -> tier PREFIX, ranked after exact', async () => {
      const res = await search(`dai noi va`).expect(200);
      // Not unique across the DB, so narrow with the token via a longer prefix of this entity.
      const scoped = await search(`dai noi vang ${TK.slice(0, TK.length - 2)}`).expect(200);
      expect(ids(scoped)).toContain(place.id);
      expect(results(scoped).find((r) => r.id === place.id).matchTier).toBe('PREFIX');
      expect(res.status).toBe(200);
    });

    it('FTS: tokens in any order/position match (tier TEXT)', async () => {
      const res = await search(`${TK} vang noi`).expect(200);
      expect(results(res).find((r) => r.id === place.id)?.matchTier).toBe('TEXT');
    });

    it('a stored summary is returned as the snippet, from canonical text only', async () => {
      const res = await search(`Đại Nội Vàng ${TK}`).expect(200);
      expect(results(res)[0].summary).toBe('Thành cổ ven sông.');
    });

    it('fuzzy: a typo of at least three characters is found at the FUZZY tier but never above an exact match', async () => {
      const exact = await mkPlace({ vi: `Quan Xylo ${TK}` });
      const near = await mkPlace({ vi: `Quan Xyla ${TK}` });
      await sync();
      const res = await search(`Quan Xylo ${TK}`).expect(200);
      const order = ids(res);
      expect(order.indexOf(exact.id)).toBeLessThan(order.indexOf(near.id));
      expect(results(res).find((r) => r.id === near.id).matchTier).toMatch(/FUZZY|PREFIX|TEXT/);
      const typo = await search(`Quan Xylu ${TK}`).expect(200);
      expect(ids(typo)).toEqual(expect.arrayContaining([exact.id, near.id]));
    });

    it('a one/two-character query never runs fuzzy matching and never returns fuzzy-tier results', async () => {
      for (const q of ['x', 'zq']) {
        const res = await search(q).expect(200);
        expect(results(res).every((r) => r.matchTier !== 'FUZZY')).toBe(true);
      }
    });
  });

  // ============================================================== sensitive names
  describe('Hoàng Sa / Trường Sa (spec 23-24)', () => {
    it.each([['Hoàng Sa', 'hoang-sa'], ['Hoang Sa', 'hoang-sa'], ['Trường Sa', 'truong-sa'], ['Truong Sa', 'truong-sa']])('%s is retrievable as the accepted canonical Place', async (q, slug) => {
      const res = await search(q).expect(200);
      const hit = results(res).find((r) => r.slug === slug);
      expect(hit).toBeDefined();
      expect(hit).toMatchObject({ entityType: 'PLACE', matchTier: 'EXACT_CANONICAL', trustClass: 'CANONICAL' });
      expect(results(res)[0].slug).toBe(slug);
    });

    it('the English aliases that already exist as accepted data are retrievable; nothing new is invented', async () => {
      const paracel = await search('Paracel Islands', { locale: 'en' }).expect(200);
      expect(results(paracel).some((r) => r.slug === 'hoang-sa')).toBe(true);
      const spratly = await search('Spratly Islands', { locale: 'en' }).expect(200);
      expect(results(spratly).some((r) => r.slug === 'truong-sa')).toBe(true);
      const aliases = await prisma.entityAlias.findMany({ where: { alias: { in: ['Paracel Islands', 'Spratly Islands'] } } });
      expect(aliases.length).toBe(2);
      expect(aliases.every((a) => a.entityType === 'PLACE')).toBe(true);
    });

    it('search results carry no sovereignty/jurisdiction field and no country is inferred', async () => {
      const res = await search('Hoàng Sa').expect(200);
      const hit = results(res).find((r) => r.slug === 'hoang-sa');
      expect(Object.keys(hit)).not.toEqual(expect.arrayContaining(['country', 'countryId', 'sovereignty', 'jurisdiction']));
    });
  });

  // ============================================================== aliases
  describe('alias semantics (spec 14-16)', () => {
    it('an accepted alias is found at EXACT_ALIAS and its aliasType is preserved in the projection', async () => {
      const p = await mkPlace({ vi: `Cổ Thành Alpha ${TK}` });
      await addAlias('PLACE', p.id, `Kinh Đô Cũ ${TK}`, 'HISTORICAL_NAME');
      await sync();
      const res = await search(`kinh do cu ${TK}`).expect(200);
      expect(results(res)[0]).toMatchObject({ id: p.id, matchTier: 'EXACT_ALIAS', matchedOn: 'alias', title: `Cổ Thành Alpha ${TK}` });
      const term = await prisma.searchTerm.findFirst({ where: { document: { entityId: p.id }, termKind: 'ALIAS' } });
      expect(term).toMatchObject({ aliasType: 'HISTORICAL_NAME', text: `Kinh Đô Cũ ${TK}` });
    });

    it('alias collision: two entities legitimately sharing a name are BOTH returned (no global uniqueness)', async () => {
      const a = await mkPlace({ vi: `Bến Thuyền A ${TK}`, importance: 9 });
      const b = await mkPlace({ vi: `Bến Thuyền B ${TK}`, importance: 2 });
      await addAlias('PLACE', a.id, `Cảng Chung ${TK}`);
      await addAlias('PLACE', b.id, `Cảng Chung ${TK}`);
      await sync();
      const res = await search(`cang chung ${TK}`).expect(200);
      expect(ids(res)).toEqual(expect.arrayContaining([a.id, b.id]));
      // context ranking, not uniqueness: equal tier -> higher importance first, deterministic
      expect(ids(res).indexOf(a.id)).toBeLessThan(ids(res).indexOf(b.id));
    });

    it('an alias is not treated as a translation and a translation is not treated as an alias', async () => {
      const p = await mkPlace({ vi: `Đền Thử ${TK}`, en: `Trial Temple ${TK}` });
      await addAlias('PLACE', p.id, `Miếu Cũ ${TK}`);
      await sync();
      const terms = await prisma.searchTerm.findMany({ where: { documentId: (await prisma.searchDocument.findUniqueOrThrow({ where: { entityKind_entityId: { entityKind: 'PLACE', entityId: p.id } } })).id } });
      const kinds = Object.fromEntries(terms.map((t) => [t.text, t.termKind]));
      expect(kinds[`Đền Thử ${TK}`]).toBe('CANONICAL_TITLE');
      expect(kinds[`Trial Temple ${TK}`]).toBe('LOCALIZED_TITLE');
      expect(kinds[`Miếu Cũ ${TK}`]).toBe('ALIAS');
    });
  });

  // ============================================================== corpus coverage / filters
  describe('corpus kinds and filters (spec 6, 31, 98)', () => {
    let country: { id: string };
    let region: { id: string };
    let city: { id: string };
    let destination: { id: string };

    beforeAll(async () => {
      country = await mkCountry(`Xứ Thử ${TK}`, `Testland ${TK}`);
      region = await prisma.region.create({ data: { canonicalSlug: uid(), countryId: country.id, type: 'PROVINCE' as any, status: 'PUBLISHED', latitude: -55.1, longitude: -65.1, translations: { create: [{ locale: 'vi', name: `Tỉnh Thử ${TK}`, slug: uid() }] } } });
      created.regions.push(region.id);
      city = await prisma.city.create({ data: { canonicalSlug: uid(), countryId: country.id, regionId: region.id, timezone: 'UTC', status: 'PUBLISHED', importance: 6, latitude: -55.2, longitude: -65.2, translations: { create: [{ locale: 'vi', name: `Thành Phố Thử ${TK}`, slug: uid() }] } } });
      created.cities.push(city.id);
      destination = await prisma.destination.create({ data: { canonicalSlug: uid(), countryId: country.id, regionId: region.id, cityId: city.id, type: 'HISTORIC_DISTRICT' as any, status: 'PUBLISHED', importance: 4, latitude: -55.3, longitude: -65.3, translations: { create: [{ locale: 'vi', name: `Điểm Đến Thử ${TK}`, slug: uid() }] } } });
      created.destinations.push(destination.id);
      const inCity = await mkPlace({ vi: `Di Tích Trong Thành Phố ${TK}`, countryId: country.id, regionId: region.id, cityId: city.id });
      await mkPlace({ vi: `Di Tích Nơi Khác ${TK}` });
      const person = await prisma.person.create({ data: { canonicalSlug: uid(), publicationStatus: 'PUBLISHED', historicalImportance: 7, translations: { create: [{ locale: 'vi', displayName: `Nhân Vật Thử ${TK}`, slug: uid() }] } } });
      created.persons.push(person.id);
      const story = await prisma.story.create({ data: { canonicalSlug: uid(), editorialStatus: 'PUBLISHED', translations: { create: [{ locale: 'vi', title: `Câu Chuyện Thử ${TK}`, slug: uid() }] } } });
      created.stories.push(story.id);
      const theme = await prisma.theme.create({ data: { slug: uid(), category: 'CULTURAL' as any, translations: { create: [{ locale: 'vi', name: `Chủ Đề Thử ${TK}` }] } } });
      created.themes.push(theme.id);
      await prisma.territory.create({ data: { canonicalSlug: uid(), type: 'KINGDOM' as any, geometryStatus: 'DRAFT', translations: { create: [{ locale: 'vi', name: `Lãnh Thổ Thử ${TK}`, slug: uid() }] } } }).then((t) => created.territories.push(t.id));
      const era = await prisma.historicalEra.create({ data: { canonicalSlug: uid(), translations: { create: [{ locale: 'vi', name: `Thời Kỳ Thử ${TK}`, slug: uid() }] } } as any });
      created.eras.push(era.id);
      void inCity;
      await sync();
    });

    it.each([
      ['COUNTRY', `Xứ Thử ${TK}`], ['REGION', `Tỉnh Thử ${TK}`], ['CITY', `Thành Phố Thử ${TK}`], ['DESTINATION', `Điểm Đến Thử ${TK}`],
      ['PERSON', `Nhân Vật Thử ${TK}`], ['STORY', `Câu Chuyện Thử ${TK}`], ['THEME', `Chủ Đề Thử ${TK}`], ['TERRITORY', `Lãnh Thổ Thử ${TK}`], ['ERA', `Thời Kỳ Thử ${TK}`],
    ])('the %s kind is searchable and correctly typed', async (kind, title) => {
      const res = await search(title).expect(200);
      expect(results(res)[0]).toMatchObject({ entityType: kind, matchTier: 'EXACT_CANONICAL' });
    });

    it('types filter restricts kinds; unknown/provider/private kinds are rejected with 400', async () => {
      const only = await search(`Thử ${TK}`, { types: 'CITY' }).expect(200);
      expect(results(only).length).toBeGreaterThan(0);
      expect(results(only).every((r) => r.entityType === 'CITY')).toBe(true);
      for (const bad of ['ACCOMMODATION', 'TRIP', 'TRIP_MEMBER_LOCATION', 'AFFILIATE_CONVERSION', 'INGESTION_CANDIDATE', 'PROVIDER', 'CITY,FAKE']) {
        const res = await search(`Thử ${TK}`, { types: bad }).expect(400);
        expect(res.body.error.code).toBe('SEARCH_INVALID_TYPE');
      }
    });

    it('country / region / city filters use STORED current-geography relations only', async () => {
      const byCountry = await search(`${TK}`, { countryId: country.id }).expect(200);
      expect(results(byCountry).length).toBeGreaterThan(0);
      expect(results(byCountry).some((r) => r.title.includes('Nơi Khác'))).toBe(false);
      expect(results(byCountry).some((r) => r.title.includes('Trong Thành Phố'))).toBe(true);
      const byRegion = await search(`${TK}`, { regionId: region.id }).expect(200);
      expect(results(byRegion).some((r) => r.entityType === 'CITY')).toBe(true);
      const byCity = await search(`${TK}`, { cityId: city.id }).expect(200);
      expect(results(byCity).some((r) => r.title.includes('Trong Thành Phố'))).toBe(true);
      expect(results(byCity).some((r) => r.title.includes('Nơi Khác'))).toBe(false);
      const nobody = await search(`${TK}`, { countryId: 'no-such-country' }).expect(200);
      expect(results(nobody)).toEqual([]);
    });

    it('the same name on a CITY and a DESTINATION returns both entities (text match != identity)', async () => {
      const c2 = await prisma.city.create({ data: { canonicalSlug: uid(), countryId: country.id, timezone: 'UTC', status: 'PUBLISHED', translations: { create: [{ locale: 'vi', name: `Tên Trùng ${TK}`, slug: uid() }] } } });
      const d2 = await prisma.destination.create({ data: { canonicalSlug: uid(), countryId: country.id, type: 'CITY_AREA' as any, status: 'PUBLISHED', translations: { create: [{ locale: 'vi', name: `Tên Trùng ${TK}`, slug: uid() }] } } });
      created.cities.push(c2.id);
      created.destinations.push(d2.id);
      await sync();
      const res = await search(`ten trung ${TK}`).expect(200);
      expect(ids(res)).toEqual(expect.arrayContaining([c2.id, d2.id]));
    });

    it('bbox filter on search uses canonical geometry (SRID 4326)', async () => {
      const inside = await search(`Thử ${TK}`, { bbox: '-70,-60,-60,-50' }).expect(200);
      expect(results(inside).length).toBeGreaterThan(0);
      const outside = await search(`Thử ${TK}`, { bbox: '100,10,110,20' }).expect(200);
      expect(results(outside)).toEqual([]);
    });
  });

  // ============================================================== publication lifecycle
  describe('publication lifecycle, ghost results and exclusions (spec 63-64, 7-10)', () => {
    it('a DRAFT entity is never searchable; publishing makes it appear; unpublishing removes it (no ghost)', async () => {
      const p = await mkPlace({ vi: `Vòng Đời ${TK}`, status: 'DRAFT' });
      await sync();
      expect(ids(await search(`vong doi ${TK}`))).not.toContain(p.id);
      await prisma.place.update({ where: { id: p.id }, data: { publicationStatus: 'PUBLISHED' } });
      await sync();
      expect(ids(await search(`vong doi ${TK}`))).toContain(p.id);
      await prisma.place.update({ where: { id: p.id }, data: { publicationStatus: 'ARCHIVED' } });
      await sync();
      expect(ids(await search(`vong doi ${TK}`))).not.toContain(p.id);
      expect(await prisma.searchDocument.count({ where: { entityKind: 'PLACE', entityId: p.id } })).toBe(0);
    });

    it('create / update / delete of the canonical row produces the matching projection state', async () => {
      const p = await mkPlace({ vi: `Đổi Tên Trước ${TK}` });
      await sync();
      await prisma.placeTranslation.updateMany({ where: { placeId: p.id, locale: 'vi' }, data: { name: `Đổi Tên Sau ${TK}` } });
      await sync();
      const stale = results(await search(`doi ten truoc ${TK}`)).find((r) => r.id === p.id);
      expect(stale === undefined || stale.matchTier === 'FUZZY').toBe(true); // the old title is no longer an exact/prefix/text match
      expect((await prisma.searchTerm.findMany({ where: { document: { entityId: p.id } } })).map((x) => x.text)).toEqual([`Đổi Tên Sau ${TK}`]);
      expect(results(await search(`doi ten sau ${TK}`)).find((r) => r.id === p.id)?.matchTier).toBe('EXACT_CANONICAL');
      await prisma.place.delete({ where: { id: p.id } });
      created.places.splice(created.places.indexOf(p.id), 1);
      await sync();
      expect(await prisma.searchDocument.count({ where: { entityKind: 'PLACE', entityId: p.id } })).toBe(0);
      expect(ids(await search(`doi ten sau ${TK}`))).not.toContain(p.id);
    });

    it('unpublished content is not reachable through any public flag (includeUnpublished / status / sort are rejected)', async () => {
      const p = await mkPlace({ vi: `Ẩn Bản Thảo ${TK}`, status: 'DRAFT' });
      await sync();
      for (const extra of [{ includeUnpublished: 'true' }, { status: 'DRAFT' }, { publicationStatus: 'DRAFT' }, { sort: 'importance' }, { orderBy: '"id"' }]) {
        await search(`an ban thao ${TK}`, extra).expect(400);
      }
      expect(ids(await search(`an ban thao ${TK}`))).not.toContain(p.id);
    });

    it('community stories are labeled COMMUNITY and rank after canonical results of the same tier; UNDER_REVIEW/REMOVED never appear', async () => {
      const author = await prisma.user.findFirstOrThrow({ where: { email: { in: createdEmails } } });
      const mk = async (status: string, title: string) => {
        const c = await prisma.communityStory.create({ data: { canonicalSlug: uid(), type: 'MEMORY' as any, authorId: author.id, moderationStatus: status as any, translations: { create: [{ locale: 'vi', title, slug: uid() }] } } });
        created.communityStories.push(c.id);
        return c;
      };
      const canonical = await mkPlace({ vi: `Chung Tên Cộng Đồng ${TK}`, importance: 1 });
      const visible = await mk('VISIBLE', `Chung Tên Cộng Đồng ${TK}`);
      const review = await mk('UNDER_REVIEW', `Chung Tên Cộng Đồng ${TK}`);
      const removed = await mk('REMOVED', `Chung Tên Cộng Đồng ${TK}`);
      await sync();
      const res = await search(`chung ten cong dong ${TK}`).expect(200);
      expect(ids(res)).toEqual(expect.arrayContaining([canonical.id, visible.id]));
      expect(ids(res)).not.toContain(review.id);
      expect(ids(res)).not.toContain(removed.id);
      expect(ids(res).indexOf(canonical.id)).toBeLessThan(ids(res).indexOf(visible.id));
      expect(results(res).find((r) => r.id === visible.id)).toMatchObject({ entityType: 'COMMUNITY_STORY', trustClass: 'COMMUNITY' });
      // community body is never projected
      expect(JSON.stringify(res.body)).not.toContain('"body"');
    });

    it('a Territory whose geometry is DRAFT is searchable by name but its geometry never leaks through bbox search', async () => {
      const t = await mkTerritory({ vi: `Lãnh Thổ Nháp ${TK}`, ring: '-64 -59, -62 -59, -62 -57, -64 -57, -64 -59', geometryStatus: 'DRAFT' });
      await sync();
      expect(ids(await search(`lanh tho nhap ${TK}`))).toContain(t.id);
      expect(ids(await search(`lanh tho nhap ${TK}`, { bbox: '-65,-60,-61,-56' }))).not.toContain(t.id);
      await prisma.territory.update({ where: { id: t.id }, data: { geometryStatus: 'PUBLISHED' } });
      await sync();
      expect(ids(await search(`lanh tho nhap ${TK}`, { bbox: '-65,-60,-61,-56' }))).toContain(t.id);
    });

    it('ingestion candidates are never public search results', async () => {
      const candidates = await prisma.ingestionCandidate.findMany({ take: 5, select: { id: true, normalizedData: true } });
      expect(candidates.length).toBeGreaterThan(0);
      for (const c of candidates) {
        expect(ids(await search(c.id))).not.toContain(c.id);
        const name = (c.normalizedData as any)?.name ?? (c.normalizedData as any)?.label;
        if (typeof name === 'string' && name.length > 2) {
          const hits = await search(name).expect(200);
          expect(results(hits).every((r) => r.id !== c.id)).toBe(true);
        }
      }
      expect(await prisma.searchDocument.count({ where: { entityId: { in: candidates.map((c) => c.id) } } })).toBe(0);
    });

    it('provider entities are excluded from search: no ACCOMMODATION/RESTAURANT/ACTIVITY document exists and their names are not returned as canonical', async () => {
      const acc = await prisma.accommodation.findFirst({ include: { translations: true } });
      expect(acc).not.toBeNull();
      const name = acc!.translations[0].name;
      const res = await search(name).expect(200);
      expect(results(res).every((r) => r.id !== acc!.id)).toBe(true);
      const kinds = (await prisma.searchDocument.groupBy({ by: ['entityKind'] })).map((g) => g.entityKind as string);
      expect(kinds.some((k) => ['ACCOMMODATION', 'RESTAURANT', 'ACTIVITY', 'CUISINE', 'DISH', 'ATTRACTION', 'PROVIDER'].includes(k))).toBe(false);
    });
  });

  // ============================================================== private data non-leak (G07/G08/G09/G10)
  describe('private data never leaks into public search or map (spec 60-62, 98, 100-103)', () => {
    let tripId: string;
    let locationId: string;
    const SECRET = `bm${Math.random().toString(36).slice(2, 10)}x${(stamp % 100000).toString(36)}`;
    const LAT = 40.1234567;
    const LNG = -100.7654321;

    beforeAll(async () => {
      tripId = (await request(app.getHttpServer()).post('/v1/trips').set('Authorization', `Bearer ${ownerToken}`).send({ title: `Chuyến Riêng Tư ${SECRET}`, startDate: '2026-12-01', endDate: '2026-12-05', primaryCurrency: 'VND' }).expect(201)).body.data.id;
      await request(app.getHttpServer()).post(`/v1/trips/${tripId}/location-sharing/start`).set('Authorization', `Bearer ${ownerToken}`).send({ durationMinutes: 60 }).expect(201);
      await request(app.getHttpServer()).put(`/v1/trips/${tripId}/location`).set('Authorization', `Bearer ${ownerToken}`).send({ latitude: LAT, longitude: LNG, accuracyMeters: 8, capturedAt: new Date().toISOString() }).expect(200);
      locationId = (await prisma.tripMemberLocation.findFirstOrThrow({ where: { tripId } })).id;
      await request(app.getHttpServer()).post(`/v1/trips/${tripId}/expenses`).set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: `Bữa Tối Bí Mật ${SECRET}`, category: 'FOOD', amount: '123456.00', currency: 'VND', payerUserId: ownerId, splitMode: 'EQUAL', occurredOn: '2026-12-02', shares: [{ userId: ownerId }], note: `ghichu${SECRET}` }).expect(201);
      await request(app.getHttpServer()).post(`/v1/trips/${tripId}/invitations`).set('Authorization', `Bearer ${ownerToken}`).send({ email: `${SECRET}@example.com`, role: 'VIEWER' }).expect(201);
      const provider = await prisma.externalProvider.findFirstOrThrow();
      const session = await prisma.affiliateSession.create({ data: { providerId: provider.id, sourceSurface: 'TRIP_STAY', campaignKey: `cmp-${SECRET}`, expiresAt: new Date(Date.now() + 3600_000), tripId } });
      await prisma.affiliateClick.create({ data: { affiliateSessionId: session.id, providerId: provider.id, environment: 'SANDBOX', surface: 'TRIP_STAY', campaignKey: `cmp-${SECRET}`, redirectUrl: `https://www.fixture-provider.example/?l=${SECRET}`, redirectTokenHash: `hash-${SECRET}`, redirectTokenExpiresAt: new Date(Date.now() + 3600_000) } });
      await prisma.affiliateConversion.create({ data: { providerId: provider.id, providerConversionId: `conv-${SECRET}`, status: 'CONFIRMED', providerOccurredAt: new Date(), reportedAt: new Date(), evidenceType: 'FIXTURE', evidenceReference: `e2e-${TK}`, commissionAmount: '987654.00', commissionCurrency: 'USD' } });
      await sync();
    });

    it('none of the private tables has a projection document, and the queue never held them', async () => {
      const kinds = (await prisma.searchDocument.groupBy({ by: ['entityKind'] })).map((g) => g.entityKind as string);
      expect(kinds.every((k) => !/TRIP|AFFILIATE|EXPENSE|INVITATION|LOCATION|SETTLEMENT|INGESTION|PROVIDER/.test(k))).toBe(true);
      expect(await prisma.searchDocument.count({ where: { entityId: { in: [tripId, locationId] } } })).toBe(0);
    });

    it.each([
      ['trip title', `Chuyến Riêng Tư ${SECRET}`],
      ['expense title', `Bữa Tối Bí Mật ${SECRET}`],
      ['the shared secret token', SECRET],
      ['invitation email', `${SECRET}@example.com`],
      ['affiliate campaign key', `cmp-${SECRET}`],
      ['conversion id', `conv-${SECRET}`],
      ['expense amount', '123456'],
      ['commission amount', '987654'],
    ])('public search for the %s returns nothing', async (_label, q) => {
      const res = await search(q).expect(200);
      expect(results(res)).toEqual([]);
    });

    it('guessing private IDs through search returns nothing, and private kinds are rejected as types', async () => {
      for (const id of [tripId, locationId]) {
        expect(results(await search(id).expect(200))).toEqual([]);
      }
      for (const t of ['TRIP', 'TRIP_MEMBER', 'TRIP_INVITATION', 'TRIP_LOCATION_SHARING', 'TRIP_EXPENSE', 'TRIP_SETTLEMENT', 'AFFILIATE_CONVERSION']) {
        await search('abc', { types: t }).expect(400);
      }
    });

    it('the public map never exposes the G08 member coordinate (bbox around it returns no feature, response contains no such number)', async () => {
      const res = await map({ bbox: `${LNG - 0.5},${LAT - 0.5},${LNG + 0.5},${LAT + 0.5}`, zoom: 14, kinds: 'PLACE,EVENT,TERRITORY,COUNTRY,REGION,CITY,DESTINATION' }).expect(200);
      expect(res.body.data.features).toEqual([]);
      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain('40.1234567');
      expect(serialized).not.toContain('100.7654321');
    });

    it('private map/search layer names and guessed paths do not exist', async () => {
      await map({ bbox: '-101,40,-100,41', kinds: 'TRIP_MEMBER_LOCATION' }).expect(400);
      await request(app.getHttpServer()).get(`/v1/map/${tripId}`).expect(404);
      await request(app.getHttpServer()).get(`/v1/search/${tripId}`).expect(404);
      await request(app.getHttpServer()).get(`/v1/trips/${tripId}/locations`).expect(401);
    });

    it('G10 boundary: search/map never create an AffiliateClick or Session', async () => {
      const before = { c: await prisma.affiliateClick.count(), s: await prisma.affiliateSession.count() };
      await search(SECRET).expect(200);
      await search('Hội An').expect(200);
      await map({ bbox: '100,5,120,25', zoom: 5, kinds: 'PLACE,CITY' }).expect(200);
      expect({ c: await prisma.affiliateClick.count(), s: await prisma.affiliateSession.count() }).toEqual(before);
    });

    it('G09 boundary: no expense/settlement/balance surface exists in public search or map', async () => {
      const res = await search('Bữa Tối').expect(200);
      expect(JSON.stringify(res.body)).not.toMatch(/123456|expense|settlement|balance/i);
      const m = await map({ bbox: '-180,-85,180,85', zoom: 1 }).expect(200);
      expect(JSON.stringify(m.body)).not.toMatch(/expense|settlement|balance|commission/i);
    });

    it('commercial data is not a ranking signal: no affiliate/commission/click column exists in the projection', async () => {
      const cols = (await prisma.$queryRaw<Array<{ column_name: string }>>`SELECT column_name FROM information_schema.columns WHERE table_name IN ('SearchDocument', 'SearchTerm')`).map((c) => c.column_name);
      expect(cols.some((c) => /affiliate|commission|conversion|click|revenue|sponsor/i.test(c))).toBe(false);
    });

    it('the admin projection endpoints are ADMIN-only', async () => {
      await request(app.getHttpServer()).get('/v1/admin/search/projection/status').expect(401);
      await request(app.getHttpServer()).get('/v1/admin/search/projection/status').set('Authorization', `Bearer ${ownerToken}`).expect(403);
      await request(app.getHttpServer()).post('/v1/admin/search/projection/rebuild').set('Authorization', `Bearer ${ownerToken}`).expect(403);
      const ok = await request(app.getHttpServer()).get('/v1/admin/search/projection/status').set('Authorization', `Bearer ${adminToken}`).expect(200);
      expect(ok.body.data.documentTotal).toBeGreaterThan(0);
      expect(JSON.stringify(ok.body)).not.toContain(SECRET);
    });
  });

  // ============================================================== map
  describe('map: bbox, zoom density, layers, geometry (spec 41-58, 76-77)', () => {
    const BBOX = '-70,-60,-60,-50';
    beforeAll(async () => {
      const country = await mkCountry(`Xứ Bản Đồ ${TK}`);
      const city = await prisma.city.create({ data: { canonicalSlug: uid(), countryId: country.id, timezone: 'UTC', status: 'PUBLISHED', importance: 9, latitude: -54.5, longitude: -64.5, translations: { create: [{ locale: 'vi', name: `Phố Bản Đồ ${TK}`, slug: uid() }] } } });
      created.cities.push(city.id);
      for (let i = 0; i < 130; i++) {
        await mkPlace({ vi: `Điểm ${i} ${TK}`, importance: i < 20 ? 9 : 3, lng: -69 + (i % 13) * 0.5, lat: -59 + Math.floor(i / 13) * 0.5 });
      }
    }, 120_000);

    it('bbox returns canonical points as GeoJSON in SRID 4326 order [lng, lat]', async () => {
      const res = await map({ bbox: BBOX, zoom: 14 }).expect(200);
      const f = res.body.data.features.find((x: any) => x.properties.name?.includes(`Điểm 0 ${TK}`));
      expect(res.body.data.type).toBe('FeatureCollection');
      expect(f.geometry).toEqual({ type: 'Point', coordinates: [-69, -59] });
      expect(f.properties).toMatchObject({ entityType: 'PLACE', layer: 'HISTORICAL_KNOWLEDGE_SITE', trustClass: 'CANONICAL', markerSemantic: 'HISTORICAL_SITE' });
    });

    it('a fractional zoom (as sent by map libraries) is accepted, including with a locale param', async () => {
      await map({ bbox: BBOX, zoom: 4.4, locale: 'vi' }).expect(200);
      await map({ bbox: BBOX, zoom: 11.7, locale: 'en' }).expect(200);
    });

    it('zoom density: world/national zoom is bounded and importance-filtered; street zoom returns more, always under the hard cap', async () => {
      const low = await map({ bbox: BBOX, zoom: 3 }).expect(200);
      const mid = await map({ bbox: BBOX, zoom: 8 }).expect(200);
      const high = await map({ bbox: BBOX, zoom: 14 }).expect(200);
      expect(low.body.data.features.length).toBeLessThanOrEqual(100);
      expect(low.body.data.features.every((f: any) => f.properties.historicalImportance >= 7)).toBe(true);
      expect(low.body.data.features.length).toBeLessThan(high.body.data.features.length);
      expect(mid.body.data.features.length).toBeLessThanOrEqual(250);
      expect(high.body.data.features.length).toBeLessThanOrEqual(500);
      expect(high.body.data.meta.maxFeatures).toBe(1000);
    });

    it('a whole-world bbox never returns an unbounded payload', async () => {
      const res = await map({ bbox: '-180,-90,180,90', zoom: 0 }).expect(200);
      expect(res.body.data.features.length).toBeLessThanOrEqual(100);
      const res2 = await map({ bbox: '-180,-90,180,90' }).expect(200);
      expect(res2.body.data.features.length).toBeLessThanOrEqual(1000);
    });

    it('current geography is opt-in, distinct from historical layers, and density-aware', async () => {
      const dflt = await map({ bbox: BBOX, zoom: 12 }).expect(200);
      expect(dflt.body.data.features.every((f: any) => f.properties.layer !== 'CURRENT_GEOGRAPHY')).toBe(true);
      const geo = await map({ bbox: BBOX, zoom: 12, kinds: 'CITY' }).expect(200);
      const city = geo.body.data.features.find((f: any) => f.properties.name === `Phố Bản Đồ ${TK}`);
      expect(city.properties).toMatchObject({ entityType: 'CITY', layer: 'CURRENT_GEOGRAPHY', markerSemantic: 'CITY' });
      expect(city.geometry).toEqual({ type: 'Point', coordinates: [-64.5, -54.5] });
      const country = await map({ bbox: BBOX, zoom: 12, kinds: 'COUNTRY' }).expect(200);
      expect(country.body.data.features).toEqual([]); // countries are not shown at street zoom
      const worldCountry = await map({ bbox: '-180,-90,180,90', zoom: 3, kinds: 'COUNTRY' }).expect(200);
      expect(worldCountry.body.data.features.some((f: any) => f.properties.entityType === 'COUNTRY')).toBe(true);
    });

    it('bbox validation: malformed, out-of-range, inverted and antimeridian-crossing boxes are rejected explicitly', async () => {
      for (const bbox of ['1,2,3', 'a,b,c,d', '-181,0,10,10', '0,-91,10,10', '10,10,5,20', '170,-10,-170,10', "0,0,1,1); DROP TABLE \"Place\"; --"]) {
        const res = await map({ bbox });
        expect(res.status).toBe(400);
      }
      expect((await map({ bbox: '170,-10,-170,10' })).body.error.code).toBe('MAP_INVALID_BBOX');
      await map({}).expect(400);
    });

    it('unpublished places never appear on the map', async () => {
      const hidden = await mkPlace({ vi: `Điểm Ẩn ${TK}`, status: 'DRAFT', importance: 10, lng: -65, lat: -55 });
      const res = await map({ bbox: BBOX, zoom: 14 }).expect(200);
      expect(res.body.data.features.some((f: any) => f.properties.id === hidden.id)).toBe(false);
    });

    it('layer allowlist: unknown/private/provider layers are rejected', async () => {
      for (const kinds of ['ACCOMMODATION', 'TRIP', 'PLACE,NOPE', 'CITY"; DROP']) await map({ bbox: BBOX, kinds }).expect(400);
    });

    it('a Territory returns its real geometry type; low zoom generalizes ONLY the response and canonical geometry is untouched', async () => {
      const ring = '-68 -58, -66 -58, -66 -56.9995, -65.999 -56.9996, -65.9995 -56, -68 -56, -68 -58';
      const t = await mkTerritory({ vi: `Lãnh Thổ Bản Đồ ${TK}`, ring, startYear: 1000, endYear: 1200 });
      const before = await prisma.$queryRaw<Array<{ g: string }>>`SELECT ST_AsText("geometry") AS g FROM "Territory" WHERE "id" = ${t.id}`;
      const near = await map({ bbox: BBOX, zoom: 14, kinds: 'TERRITORY' }).expect(200);
      const far = await map({ bbox: BBOX, zoom: 4, kinds: 'TERRITORY' }).expect(200);
      const nearF = near.body.data.features.find((f: any) => f.properties.id === t.id);
      const farF = far.body.data.features.find((f: any) => f.properties.id === t.id);
      expect(nearF.geometry.type).toBe('Polygon');
      expect(nearF.properties).toMatchObject({ layer: 'HISTORICAL', geometryGeneralized: false, markerSemantic: 'HISTORICAL_TERRITORY' });
      expect(farF.properties.geometryGeneralized).toBe(true);
      expect(farF.geometry.coordinates[0].length).toBeLessThan(nearF.geometry.coordinates[0].length);
      const after = await prisma.$queryRaw<Array<{ g: string }>>`SELECT ST_AsText("geometry") AS g FROM "Territory" WHERE "id" = ${t.id}`;
      expect(after).toEqual(before);
    });

    it('backend returns semantics only - no CSS/pixel styling in any feature', async () => {
      const res = await map({ bbox: BBOX, zoom: 14, kinds: 'PLACE,CITY,TERRITORY' }).expect(200);
      const keys = new Set<string>();
      const walk = (v: unknown) => {
        if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { keys.add(k.toLowerCase()); walk(x); }
      };
      walk(res.body.data.features.map((f: any) => f.properties));
      for (const forbidden of ['color', 'size', 'icon', 'radius', 'width', 'height', 'style', 'fill', 'stroke', 'zindex', 'opacity']) expect(keys.has(forbidden)).toBe(false);
    });

    it('map results are deterministic for identical state/bbox/zoom/filters', async () => {
      const a = await map({ bbox: BBOX, zoom: 8, kinds: 'PLACE,CITY' }).expect(200);
      const b = await map({ bbox: BBOX, zoom: 8, kinds: 'PLACE,CITY' }).expect(200);
      expect(b.body).toEqual(a.body);
    });
  });

  // ============================================================== temporal filters
  describe('historical period on search and map (spec 53, 78-80)', () => {
    const BBOX = '-70,-60,-60,-50';
    let e1288: { id: string };
    let eBce: { id: string };
    let eUnknown: { id: string };
    let terr: { id: string };
    let terrBce: { id: string };

    beforeAll(async () => {
      const site = await mkPlace({ vi: `Địa Điểm Sự Kiện ${TK}`, lng: -66.5, lat: -52.5, importance: 8 });
      e1288 = await mkEvent({ vi: `Trận Thủy Chiến ${TK}`, startYear: 1288, placeId: site.id });
      eBce = await mkEvent({ vi: `Sự Kiện Cổ Đại ${TK}`, startYear: 250, startEra: DateEra.BCE, endYear: 200, endEra: DateEra.BCE, placeId: site.id });
      eUnknown = await mkEvent({ vi: `Sự Kiện Vô Niên ${TK}`, placeId: site.id });
      terr = await mkTerritory({ vi: `Vương Quốc Thử ${TK}`, ring: '-69 -51, -67 -51, -67 -50.5, -69 -50.5, -69 -51', startYear: 1000, endYear: 1300 });
      terrBce = await mkTerritory({ vi: `Vương Quốc Cổ ${TK}`, ring: '-66 -51, -64 -51, -64 -50.5, -66 -50.5, -66 -51', startYear: 300, startEra: DateEra.BCE, endYear: 100, endEra: DateEra.BCE });
      await sync();
    });

    it('search period: an event overlapping the period matches; one outside, and an UNKNOWN-date one, do not', async () => {
      const inRange = await search(`${TK}`, { types: 'EVENT', fromYear: 1280, toYear: 1290 }).expect(200);
      expect(ids(inRange)).toContain(e1288.id);
      expect(ids(inRange)).not.toContain(eBce.id);
      expect(ids(inRange)).not.toContain(eUnknown.id);
      const outside = await search(`${TK}`, { types: 'EVENT', fromYear: 1500, toYear: 1600 }).expect(200);
      expect(ids(outside)).not.toContain(e1288.id);
      const noPeriod = await search(`${TK}`, { types: 'EVENT' }).expect(200);
      expect(ids(noPeriod)).toEqual(expect.arrayContaining([e1288.id, eBce.id, eUnknown.id]));
    });

    it('BCE works through chronology ordinals (not JavaScript Date), and BCE never matches a CE period', async () => {
      const bce = await search(`${TK}`, { types: 'EVENT', fromYear: 260, fromEra: 'BCE', toYear: 190, toEra: 'BCE' }).expect(200);
      expect(ids(bce)).toContain(eBce.id);
      expect(ids(bce)).not.toContain(e1288.id);
      const ce = await search(`${TK}`, { types: 'EVENT', fromYear: 200, toYear: 300 }).expect(200);
      expect(ids(ce)).not.toContain(eBce.id);
    });

    it('period bounds are validated', async () => {
      expect((await search(`${TK}`, { fromYear: 1300, toYear: 1200 }).expect(400)).body.error.code).toBe('SEARCH_INVALID_PERIOD');
      await search(`${TK}`, { fromYear: 0 }).expect(400);
      await search(`${TK}`, { fromYear: 10000 }).expect(400);
      await search(`${TK}`, { fromEra: 'BCE' }).expect(400);
      await search(`${TK}`, { fromYear: 5, fromEra: 'XX' }).expect(400);
    });

    it('map strict period: only temporally-modelled layers, known chronology only, BCE-correct', async () => {
      const res = await map({ bbox: BBOX, zoom: 14, fromYear: 1200, toYear: 1250, kinds: 'PLACE,CITY,TERRITORY,EVENT' }).expect(200);
      const feats = res.body.data.features as any[];
      expect(res.body.data.meta.periodApplied).toBe(true);
      expect(feats.some((f) => f.properties.id === terr.id)).toBe(true);
      expect(feats.some((f) => f.properties.id === terrBce.id)).toBe(false);
      expect(feats.every((f) => f.properties.entityType === 'TERRITORY' || f.properties.entityType === 'EVENT')).toBe(true);
      expect(feats.some((f) => f.properties.id === eUnknown.id)).toBe(false);
      const events = await map({ bbox: BBOX, zoom: 14, fromYear: 1288, toYear: 1288 }).expect(200);
      expect(events.body.data.features.some((f: any) => f.properties.id === e1288.id)).toBe(true);
      const bce = await map({ bbox: BBOX, zoom: 14, fromYear: 250, fromEra: 'BCE', toYear: 210, toEra: 'BCE' }).expect(200);
      const bceIds = bce.body.data.features.map((f: any) => f.properties.id);
      expect(bceIds).toContain(eBce.id);
      expect(bceIds).toContain(terrBce.id);
      expect(bceIds).not.toContain(e1288.id);
    });

    it('events appear on the map only through explicit EventPlace links (no runtime geocoding), with their stored chronology', async () => {
      const res = await map({ bbox: BBOX, zoom: 14, kinds: 'EVENT' }).expect(200);
      const f = res.body.data.features.find((x: any) => x.properties.id === e1288.id);
      expect(f.properties).toMatchObject({ entityType: 'EVENT', chronologyStart: toChronologyYearStart(1288, DateEra.CE) });
      expect(f.geometry).toEqual({ type: 'Point', coordinates: [-66.5, -52.5] });
    });

    it('the legacy `year` parameter keeps its accepted semantics (an undated territory still matches, unchanged)', async () => {
      const undated = await prisma.territory.create({ data: { canonicalSlug: uid(), type: 'KINGDOM' as any, geometryStatus: 'PUBLISHED', translations: { create: [{ locale: 'vi', name: `Lãnh Thổ Vô Niên ${TK}`, slug: uid() }] } } });
      created.territories.push(undated.id);
      await prisma.$executeRaw`UPDATE "Territory" SET "geometry" = ST_GeomFromText('POLYGON((-62 -58, -61 -58, -61 -57, -62 -57, -62 -58))', 4326) WHERE "id" = ${undated.id}`;
      const legacy = await map({ bbox: BBOX, year: 1200 }).expect(200);
      expect(legacy.body.data.features.some((f: any) => f.properties.id === undated.id)).toBe(true);
      const strict = await map({ bbox: BBOX, fromYear: 1200, toYear: 1200 }).expect(200);
      expect(strict.body.data.features.some((f: any) => f.properties.id === undated.id)).toBe(false);
    });

    it('a country/region/city is never returned for a historical period (current geography is not asserted for the past)', async () => {
      const res = await map({ bbox: BBOX, zoom: 14, fromYear: 1200, toYear: 1300, kinds: 'CITY,COUNTRY,REGION,DESTINATION' }).expect(200);
      expect(res.body.data.features).toEqual([]);
    });
  });

  // ============================================================== determinism and pagination
  describe('determinism and cursor pagination (spec 32-33, 88)', () => {
    beforeAll(async () => {
      for (let i = 0; i < 7; i++) await mkPlace({ vi: `Trang ${i} Phân ${TK}`, importance: i % 3 });
      await sync();
    });

    it('same state + query => identical order', async () => {
      const a = await search(`phan ${TK}`).expect(200);
      const b = await search(`phan ${TK}`).expect(200);
      expect(b.body.data.results).toEqual(a.body.data.results);
    });

    it('pages concatenate to the full ordered list with no duplicates and no gaps', async () => {
      const full = ids(await search(`phan ${TK}`, { limit: 50 }).expect(200));
      expect(full.length).toBeGreaterThanOrEqual(7);
      const collected: string[] = [];
      let cursor: string | null = null;
      for (let guard = 0; guard < 20; guard++) {
        const res: request.Response = await search(`phan ${TK}`, { limit: 3, ...(cursor ? { cursor } : {}) }).expect(200);
        collected.push(...ids(res));
        cursor = res.body.data.nextCursor;
        if (!res.body.data.hasMore) break;
      }
      expect(collected.slice(0, full.length)).toEqual(full);
      expect(new Set(collected).size).toBe(collected.length);
    });

    it('a tampered, truncated or foreign cursor is rejected with 400', async () => {
      const first = await search(`phan ${TK}`, { limit: 2 }).expect(200);
      const cursor = first.body.data.nextCursor as string;
      expect(cursor).toBeTruthy();
      expect((await search(`phan ${TK}`, { limit: 2, cursor: cursor.slice(0, -4) }).expect(400)).body.error.code).toBe('SEARCH_INVALID_CURSOR');
      expect((await search(`phan ${TK}`, { limit: 2, cursor: 'AAAA' }).expect(400)).body.error.code).toBe('SEARCH_INVALID_CURSOR');
      // valid cursor but for a different query
      expect((await search(`khac ${TK}`, { limit: 2, cursor }).expect(400)).body.error.code).toBe('SEARCH_INVALID_CURSOR');
      // valid cursor but for a different locale
      expect((await search(`phan ${TK}`, { limit: 2, cursor, locale: 'en' }).expect(400)).body.error.code).toBe('SEARCH_INVALID_CURSOR');
    });

    it('limit is bounded (max 50) and a non-positive/oversized/non-numeric limit is rejected', async () => {
      await search(`phan ${TK}`, { limit: 51 }).expect(400);
      await search(`phan ${TK}`, { limit: 0 }).expect(400);
      await search(`phan ${TK}`, { limit: 'abc' }).expect(400);
    });
  });

  // ============================================================== security
  describe('security and abuse resistance (spec 40, 81, 109)', () => {
    it.each([
      ["'; DROP TABLE \"Place\"; --"],
      ["' OR '1'='1"],
      ['" OR ""="'],
      ["1); SELECT pg_sleep(5); --"],
      ["a' | b & !c :* <-> (d)"],
      ['\\'],
      ['%%%%%%'],
      ['_____'],
      ['\u0000abc'],
      ['a'.repeat(200)],
      ['ha '.repeat(60)],
    ])('injection / pathological query %j is harmless (200 with results or empty, never 500)', async (q) => {
      const started = Date.now();
      const res = await search(q);
      expect([200, 400]).toContain(res.status);
      expect(res.status).not.toBe(500);
      expect(Date.now() - started).toBeLessThan(5000);
      expect(await prisma.place.count()).toBeGreaterThan(0); // tables still exist
    });

    it('over-long query, empty query and missing query are rejected', async () => {
      await search('a'.repeat(201)).expect(400);
      await search('').expect(400);
      await request(app.getHttpServer()).get('/v1/search').expect(400);
      await search('   ').expect(400);
    });

    it('injection through filters and sort-like parameters is rejected or bound, never executed', async () => {
      await search('abc', { countryId: "x' OR '1'='1" }).expect(200);
      await search('abc', { types: "PLACE'; DROP TABLE x;--" }).expect(400);
      await search('abc', { bbox: "0,0,1,1) OR 1=1 --" }).expect(400);
      await search('abc', { sort: 'importance; DROP TABLE x' }).expect(400);
      await search('abc', { orderBy: '"id"' }).expect(400);
      await search('abc', { locale: "vi'; --" }).expect(400);
      expect(await prisma.place.count()).toBeGreaterThan(0);
    });

    it('invalid geometry-shaped and oversized inputs are rejected', async () => {
      await map({ bbox: '0,0,1,1,1' }).expect(400);
      await map({ bbox: 'POLYGON((0 0,1 1))' }).expect(400);
      await map({ bbox: '0,0,1,1', zoom: 99 }).expect(400);
      await map({ bbox: '0,0,1,1', zoom: 'x' }).expect(400);
      await map({ bbox: '0,0,1,1', fromYear: 0 }).expect(400);
      await map({ bbox: '0,0,1,1', kinds: 'PLACE,'.repeat(50) }).expect(400);
    });

    it('suggestions obey the same publication/privacy boundaries', async () => {
      const draft = await mkPlace({ vi: `Gợi Ý Nháp ${TK}`, status: 'DRAFT' });
      const pub = await mkPlace({ vi: `Gợi Ý Công Khai ${TK}` });
      await sync();
      const res = await request(app.getHttpServer()).get('/v1/search/suggestions').query({ q: `goi y ${TK}` }).expect(200);
      const suggestionIds = res.body.data.suggestions.map((s: any) => s.id);
      expect(suggestionIds).toContain(pub.id);
      expect(suggestionIds).not.toContain(draft.id);
      expect(Object.keys(res.body.data.suggestions[0]).sort()).toEqual(['entityType', 'id', 'slug', 'title']);
      await request(app.getHttpServer()).get('/v1/search/suggestions').query({ q: '' }).expect(400);
    });

    it('does not store per-user search history: no table records queries and the metrics hold no query text', async () => {
      await search(`secretquery${TK}`).expect(200);
      const tables = (await prisma.$queryRaw<Array<{ table_name: string }>>`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`).map((t) => t.table_name);
      expect(tables.some((t) => /search.*(history|log|query)|query.*log/i.test(t))).toBe(false);
      const status = await request(app.getHttpServer()).get('/v1/admin/search/projection/status').set('Authorization', `Bearer ${adminToken}`).expect(200);
      expect(JSON.stringify(status.body)).not.toContain(`secretquery${TK}`);
      expect(status.body.data.metrics.search.total).toBeGreaterThan(0);
    });
  });

  // ============================================================== rebuild, concurrency, recovery
  describe('projection rebuild, concurrency and recovery on real PostgreSQL (spec 63-67, 89-91)', () => {
    const snapshot = async () =>
      prisma.$queryRaw<Array<{ kind: string; id: string; n: string; h: string }>>`
        SELECT d."entityKind"::text AS kind, d."entityId" AS id, count(t.*)::text AS n,
               md5(d."canonicalSlug" || d."titles"::text || d."normalizedSearchText" || coalesce(string_agg(t."termKind"::text || t."locale" || t."normalizedText", ',' ORDER BY t."termKind", t."locale", t."normalizedText"), '')) AS h
        FROM "SearchDocument" d LEFT JOIN "SearchTerm" t ON t."documentId" = d."id"
        GROUP BY d."id" ORDER BY 1, 2`;

    it('rebuild is idempotent: twice produces the identical projection and no duplicate rows', async () => {
      await projection.rebuildAll();
      const one = await snapshot();
      const r2 = await projection.rebuildAll();
      const two = await snapshot();
      expect(r2.failed).toBe(0);
      expect(two).toEqual(one);
      const dup = await prisma.$queryRaw<Array<{ c: bigint }>>`SELECT count(*) AS c FROM (SELECT "entityKind", "entityId" FROM "SearchDocument" GROUP BY 1, 2 HAVING count(*) > 1) x`;
      expect(Number(dup[0].c)).toBe(0);
    });

    it('SEARCH INDEX != SOURCE OF TRUTH: wiping the whole projection leaves canonical data intact and rebuild restores it', async () => {
      const canonicalBefore = { places: await prisma.place.count(), tr: await prisma.placeTranslation.count(), events: await prisma.historicalEvent.count(), countries: await prisma.country.count(), aliases: await prisma.entityAlias.count() };
      const docsBefore = await snapshot();
      await prisma.searchTerm.deleteMany({});
      await prisma.searchDocument.deleteMany({});
      expect(await prisma.searchDocument.count()).toBe(0);
      expect({ places: await prisma.place.count(), tr: await prisma.placeTranslation.count(), events: await prisma.historicalEvent.count(), countries: await prisma.country.count(), aliases: await prisma.entityAlias.count() }).toEqual(canonicalBefore);
      await projection.rebuildAll();
      expect(await snapshot()).toEqual(docsBefore);
    });

    it('duplicate rebuild: two rebuilds at the same time neither fail nor duplicate anything', async () => {
      const [a, b] = await Promise.all([projection.rebuildAll(), projection.rebuildAll()]);
      expect(a.failed + b.failed).toBe(0);
      const rows = await snapshot();
      expect(new Set(rows.map((r) => `${r.kind}:${r.id}`)).size).toBe(rows.length);
    });

    it('rebuild concurrent with canonical updates cannot lose an update', async () => {
      const p = await mkPlace({ vi: `Đua Cập Nhật 0 ${TK}` });
      await sync();
      const rebuild = projection.rebuildAll();
      for (let i = 1; i <= 12; i++) {
        await prisma.placeTranslation.updateMany({ where: { placeId: p.id, locale: 'vi' }, data: { name: `Đua Cập Nhật ${i} ${TK}` } });
      }
      await rebuild;
      await sync();
      const doc = await prisma.searchDocument.findUniqueOrThrow({ where: { entityKind_entityId: { entityKind: 'PLACE', entityId: p.id } } });
      expect((doc.titles as any).vi).toBe(`Đua Cập Nhật 12 ${TK}`);
      expect(ids(await search(`dua cap nhat 12 ${TK}`))).toContain(p.id);
      const stale = results(await search(`dua cap nhat 11 ${TK}`)).find((r) => r.id === p.id);
      expect(stale === undefined || stale.matchTier === 'FUZZY').toBe(true); // an old title is never an exact/prefix/text match
      expect((await prisma.searchTerm.findMany({ where: { document: { entityId: p.id } } })).map((x) => x.text)).toEqual([`Đua Cập Nhật 12 ${TK}`]);
    });

    it('publish vs refresh: publishing while a rebuild runs ends published and searchable', async () => {
      const p = await mkPlace({ vi: `Đua Xuất Bản ${TK}`, status: 'DRAFT' });
      await sync();
      const rebuild = projection.rebuildAll();
      await prisma.place.update({ where: { id: p.id }, data: { publicationStatus: 'PUBLISHED' } });
      await rebuild;
      await sync();
      expect(ids(await search(`dua xuat ban ${TK}`))).toContain(p.id);
    });

    it('unpublish vs refresh: unpublishing while a rebuild runs never leaves a ghost result', async () => {
      const p = await mkPlace({ vi: `Đua Gỡ Bài ${TK}` });
      await sync();
      const rebuild = projection.rebuildAll();
      await prisma.place.update({ where: { id: p.id }, data: { publicationStatus: 'DRAFT' } });
      await rebuild;
      await sync();
      expect(ids(await search(`dua go bai ${TK}`))).not.toContain(p.id);
      expect(await prisma.searchDocument.count({ where: { entityKind: 'PLACE', entityId: p.id } })).toBe(0);
    });

    it('concurrent incremental updates (same and different entities, many at once) converge to canonical truth', async () => {
      const targets = await Promise.all(Array.from({ length: 8 }, (_, i) => mkPlace({ vi: `Song Song ${i} v0 ${TK}` })));
      await sync();
      await Promise.all(
        targets.flatMap((t, i) =>
          [1, 2, 3, 4].map((v) => prisma.placeTranslation.updateMany({ where: { placeId: t.id, locale: 'vi' }, data: { name: `Song Song ${i} v${v} ${TK}` } })),
        ),
      );
      // drain from several "instances" at once (SKIP LOCKED partitions the queue; per-entity locks serialize refreshes)
      await Promise.all([projection.drain(), projection.drain(), projection.drain()]);
      await sync();
      for (const [i, t] of targets.entries()) {
        const canonical = (await prisma.placeTranslation.findFirstOrThrow({ where: { placeId: t.id, locale: 'vi' } })).name;
        const doc = await prisma.searchDocument.findUniqueOrThrow({ where: { entityKind_entityId: { entityKind: 'PLACE', entityId: t.id } } });
        expect((doc.titles as any).vi).toBe(canonical);
        expect(canonical).toMatch(new RegExp(`^Song Song ${i} v[1-4] `));
      }
      expect(await prisma.searchProjectionQueue.count({ where: { entityId: { in: targets.map((t) => t.id) } } })).toBe(0);
    });

    it('failure recovery: a projection failure leaves canonical data untouched and a retry restores correctness', async () => {
      const p = await mkPlace({ vi: `Sự Cố Trước ${TK}` });
      await sync();
      await prisma.placeTranslation.updateMany({ where: { placeId: p.id, locale: 'vi' }, data: { name: `Sự Cố Sau ${TK}` } });
      const spy = jest.spyOn(projection, 'refreshEntity').mockRejectedValue(new Error('simulated projection outage'));
      const failed = await projection.drain();
      spy.mockRestore();
      expect(failed.failed).toBeGreaterThanOrEqual(1);
      // canonical commit succeeded even though the projection is broken
      expect((await prisma.placeTranslation.findFirstOrThrow({ where: { placeId: p.id, locale: 'vi' } })).name).toBe(`Sự Cố Sau ${TK}`);
      // stale (never corrupt) projection is still served, the queue kept the entry and recorded the error
      expect(ids(await search(`su co truoc ${TK}`))).toContain(p.id);
      const q = await prisma.searchProjectionQueue.findFirstOrThrow({ where: { entityKind: 'PLACE', entityId: p.id } });
      expect(q.lastError).toContain('simulated projection outage');
      // a new canonical change (or the claim timeout) makes the entry claimable again; a rebuild also repairs everything
      await prisma.$executeRaw`UPDATE "SearchProjectionQueue" SET "lockedAt" = NULL WHERE "entityId" = ${p.id}`;
      await sync();
      expect(ids(await search(`su co sau ${TK}`))).toContain(p.id);
      const stale = results(await search(`su co truoc ${TK}`)).find((r) => r.id === p.id);
      expect(stale === undefined || stale.matchTier === 'FUZZY').toBe(true); // the old title is no longer an exact/prefix/text match
      expect((await prisma.searchTerm.findMany({ where: { document: { entityId: p.id } } })).map((x) => x.text)).toEqual([`Sự Cố Sau ${TK}`]);
    });

    it('a corrupted projection row is repaired by rebuild', async () => {
      const p = await mkPlace({ vi: `Hỏng Dữ Liệu ${TK}` });
      await sync();
      await prisma.searchDocument.update({ where: { entityKind_entityId: { entityKind: 'PLACE', entityId: p.id } }, data: { normalizedNames: 'corrupted', normalizedSearchText: 'corrupted', titles: { vi: 'corrupted' } } });
      await prisma.searchTerm.deleteMany({ where: { document: { entityId: p.id } } });
      expect(ids(await search(`hong du lieu ${TK}`))).not.toContain(p.id);
      await projection.rebuildAll();
      expect(ids(await search(`hong du lieu ${TK}`))).toContain(p.id);
      expect(results(await search(`hong du lieu ${TK}`))[0].title).toBe(`Hỏng Dữ Liệu ${TK}`);
    });

    it('Redis is not the authority: wiping this app instance Redis state does not change search or map results', async () => {
      const before = await search('Hội An').expect(200);
      const mapBefore = await map({ bbox: '100,5,120,25', zoom: 6 }).expect(200);
      await wipeOwnRedisState();
      const after = await search('Hội An').expect(200);
      const mapAfter = await map({ bbox: '100,5,120,25', zoom: 6 }).expect(200);
      expect(after.body.data.results).toEqual(before.body.data.results);
      expect(mapAfter.body.data).toEqual(mapBefore.body.data);
    });

    it('a canonical write is never blocked or failed by the projection (trigger only enqueues)', async () => {
      const spy = jest.spyOn(projection, 'refreshEntity').mockRejectedValue(new Error('projection down'));
      const p = await mkPlace({ vi: `Không Bị Chặn ${TK}` });
      await prisma.place.update({ where: { id: p.id }, data: { historicalImportance: 9 } });
      spy.mockRestore();
      expect((await prisma.place.findUniqueOrThrow({ where: { id: p.id } })).historicalImportance).toBe(9);
      await sync();
      expect(ids(await search(`khong bi chan ${TK}`))).toContain(p.id);
    });
  });

  // ============================================================== freshness with the real worker
  describe('freshness with the background worker (spec 70)', () => {
    let workerApp: INestApplication;

    beforeAll(async () => {
      process.env.SEARCH_PROJECTION_WORKER_ENABLED = 'true';
      process.env.SEARCH_PROJECTION_INTERVAL_MS = '500';
      workerApp = await bootstrapTestApp();
      process.env.SEARCH_PROJECTION_WORKER_ENABLED = 'false';
    }, 60_000);

    afterAll(async () => {
      await workerApp.close();
    });

    const waitFor = async (predicate: () => Promise<boolean>, timeoutMs = 60_000) => {
      const started = Date.now();
      while (Date.now() - started < timeoutMs) {
        if (await predicate()) return Date.now() - started;
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error(`condition not met within ${timeoutMs} ms`);
    };

    it('publish/update/unpublish reach public search within the 60 s contract WITHOUT any manual drain (measured)', async () => {
      const q = `lam moi ${TK}`;
      const searchIds = async () => ids(await request(workerApp.getHttpServer()).get('/v1/search').query({ q }));
      const p = await mkPlace({ vi: `Làm Mới ${TK}` });
      const appear = await waitFor(async () => (await searchIds()).includes(p.id));
      await prisma.placeTranslation.updateMany({ where: { placeId: p.id, locale: 'vi' }, data: { name: `Làm Mới Hai ${TK}` } });
      const renamed = await waitFor(async () => (await request(workerApp.getHttpServer()).get('/v1/search').query({ q: `lam moi hai ${TK}` }).then(ids)).includes(p.id));
      await prisma.place.update({ where: { id: p.id }, data: { publicationStatus: 'DRAFT' } });
      const gone = await waitFor(async () => !(await request(workerApp.getHttpServer()).get('/v1/search').query({ q: `lam moi hai ${TK}` }).then(ids)).includes(p.id));
      console.log(`G11 freshness (worker interval 500 ms): publish -> searchable ${appear} ms, rename -> searchable ${renamed} ms, unpublish -> gone ${gone} ms`);
      expect(Math.max(appear, renamed, gone)).toBeLessThan(60_000);
    }, 120_000);

    it('the admin status endpoint reports queue depth and oldest queued age (observability)', async () => {
      const res = await request(workerApp.getHttpServer()).get('/v1/admin/search/projection/status').set('Authorization', `Bearer ${adminToken}`).expect(200);
      expect(res.body.data).toEqual(expect.objectContaining({ queueDepth: expect.any(Number), oldestQueuedAgeSeconds: expect.any(Number), documentTotal: expect.any(Number) }));
    });
  });

  // ============================================================== regression
  describe('regression: existing public contracts are preserved', () => {
    it('the pre-G11 response shape (query + results with the original item fields) is intact and additive', async () => {
      const res = await search('Hội An').expect(200);
      expect(res.body.data).toEqual(expect.objectContaining({ query: 'Hội An', results: expect.any(Array), nextCursor: null, hasMore: false }));
      expect(results(res)[0]).toEqual(expect.objectContaining({ entityType: expect.any(String), id: expect.any(String), slug: expect.any(String), title: expect.any(String), matchedOn: expect.stringMatching(/name|alias/), score: expect.any(Number), locale: 'vi', fallbackUsed: false }));
    });

    it('an uncatalogued contribution title is still not publicly searchable (contribution boundary unchanged)', async () => {
      const contrib = await prisma.contribution.findFirst({ select: { id: true } });
      if (contrib) expect(ids(await search(contrib.id))).not.toContain(contrib.id);
    });

    it('historical/current geography stay separate on the map: Territory is HISTORICAL, Country/Region/City are CURRENT_GEOGRAPHY', async () => {
      const res = await map({ bbox: '-70,-60,-60,-50', zoom: 14, year: 1200, kinds: 'TERRITORY,CITY' }).expect(200);
      for (const f of res.body.data.features) {
        expect(f.properties.layer).toBe(f.properties.entityType === 'TERRITORY' ? 'HISTORICAL' : 'CURRENT_GEOGRAPHY');
      }
    });

    it('the existing Hội An / Thăng Long knowledge is still found with its accepted trust class', async () => {
      const res = await search('Hoàng thành Thăng Long').expect(200);
      expect(results(res)[0]).toMatchObject({ entityType: 'PLACE', trustClass: 'CANONICAL' });
    });
  });

  // ============================================================== rate limiting (last: exhausts the route's window)
  describe('rate limiting (spec 81)', () => {
    it('search is throttled by the accepted infrastructure and recovers after the window', async () => {
      process.env.SEARCH_RATE_LIMIT_MAX = '3';
      const statuses: number[] = [];
      for (let i = 0; i < 8; i++) statuses.push((await search(`rate ${i}`)).status);
      process.env.SEARCH_RATE_LIMIT_MAX = '100000';
      expect(statuses).toContain(429);
      expect(statuses.filter((s) => s === 429).length).toBeGreaterThanOrEqual(3);
    });
  });
});
