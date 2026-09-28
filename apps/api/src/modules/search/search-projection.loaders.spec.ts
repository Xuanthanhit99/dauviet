import * as fs from 'node:fs';
import * as path from 'node:path';
import { SearchEntityKind } from '@prisma/client';
import { ALIAS_KINDS, geometrySql, LOADERS } from './search-projection.loaders';

/** Builds a fake transaction client where `findUnique` returns a fixed record for one model. */
const txFor = (model: string, record: unknown, extras: Record<string, unknown> = {}) =>
  ({ [model]: { findUnique: jest.fn().mockResolvedValue(record) }, eventCountry: { findMany: jest.fn().mockResolvedValue([]) }, eraCountry: { findMany: jest.fn().mockResolvedValue([]) }, ...extras }) as any;

const tr = (over: Record<string, unknown> = {}) => ({ locale: 'vi', name: 'Tên', displayName: 'Tên', title: 'Tên', summary: 'Tóm tắt', shortDescription: 'ngắn', subtitle: null, tagline: null, ...over });

describe('search projection loaders - the public corpus allowlist (spec 6-10, 61-62)', () => {
  it('has a loader for every kind in the corpus and no other kind', () => {
    expect(Object.keys(LOADERS).sort()).toEqual(Object.values(SearchEntityKind).sort());
  });

  it('never reads a private, commercial, provider or ingestion table', () => {
    const src = fs.readFileSync(path.join(__dirname, 'search-projection.loaders.ts'), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const forbidden = [
      /\btx\.trip\w*/i, /tripMember/i, /tripInvitation/i, /tripLocation/i, /tripExpense/i, /tripSettlement/i,
      /affiliate/i, /providerBooking/i, /ingestion/i, /externalProvider/i, /accommodation/i, /restaurant/i, /activity\b/i,
      /\btx\.user\b/, /\btx\.session\b/, /contribution/i, /comment\b/i, /report\b/i,
    ];
    for (const re of forbidden) expect(code).not.toMatch(re);
    expect(code).not.toMatch(/"Trip|"Affiliate|"Ingestion|"Provider/);
  });

  describe.each([
    ['COUNTRY', 'country', { status: 'PUBLISHED' }, { status: 'DRAFT' }],
    ['REGION', 'region', { status: 'PUBLISHED' }, { status: 'IN_REVIEW' }],
    ['CITY', 'city', { status: 'PUBLISHED' }, { status: 'ARCHIVED' }],
    ['DESTINATION', 'destination', { status: 'PUBLISHED' }, { status: 'DRAFT' }],
    ['PLACE', 'place', { publicationStatus: 'PUBLISHED' }, { publicationStatus: 'DRAFT' }],
    ['PERSON', 'person', { publicationStatus: 'PUBLISHED' }, { publicationStatus: 'IN_REVIEW' }],
    ['EVENT', 'historicalEvent', { publicationStatus: 'PUBLISHED' }, { publicationStatus: 'ARCHIVED' }],
    ['STORY', 'story', { editorialStatus: 'PUBLISHED' }, { editorialStatus: 'SOURCE_CHECK' }],
    ['JOURNEY', 'journey', { editorialStatus: 'PUBLISHED' }, { editorialStatus: 'DRAFT' }],
    ['SOURCE', 'source', { archivedAt: null }, { archivedAt: new Date() }],
    ['COMMUNITY_STORY', 'communityStory', { moderationStatus: 'VISIBLE' }, { moderationStatus: 'REMOVED' }],
  ])('%s eligibility', (kind, model, publicFields, hiddenFields) => {
    const record = (fields: Record<string, unknown>) => ({ id: 'x', canonicalSlug: 'slug', type: 'T', sourceType: 'BOOK', title: 'Tên', importance: 3, historicalImportance: 3, translations: [tr()], ...fields });

    it('projects a public record', async () => {
      const loaded = await LOADERS[kind as SearchEntityKind](txFor(model, record(publicFields)), 'x');
      expect(loaded).not.toBeNull();
      expect(loaded!.translations.length).toBeGreaterThan(0);
    });

    it('returns null (=> the document is deleted, no ghost result) for a non-public record', async () => {
      expect(await LOADERS[kind as SearchEntityKind](txFor(model, record(hiddenFields)), 'x')).toBeNull();
    });

    it('returns null when the entity no longer exists', async () => {
      expect(await LOADERS[kind as SearchEntityKind](txFor(model, null), 'x')).toBeNull();
    });
  });

  it.each([
    ['ERA', 'historicalEra'],
    ['DYNASTY', 'dynasty'],
    ['TERRITORY', 'territory'],
    ['THEME', 'theme'],
  ])('%s has no publication gate (public by the existing read API) but a missing row is not projected', async (kind, model) => {
    const rec = { id: 'x', canonicalSlug: 's', slug: 's', type: 'KINGDOM', category: 'CULTURAL', translations: [tr()] };
    expect(await LOADERS[kind as SearchEntityKind](txFor(model, rec), 'x')).not.toBeNull();
    expect(await LOADERS[kind as SearchEntityKind](txFor(model, null), 'x')).toBeNull();
  });

  describe('trust classes (spec 10/28)', () => {
    const cls = async (kind: SearchEntityKind, model: string, fields: Record<string, unknown>) =>
      (await LOADERS[kind](txFor(model, { id: 'x', canonicalSlug: 's', type: 'T', sourceType: 'BOOK', title: 'T', translations: [tr()], ...fields }), 'x'))!.trustClass;

    it('classifies each family and never promotes community or source records to canonical', async () => {
      expect(await cls('PLACE', 'place', { publicationStatus: 'PUBLISHED' })).toBe('CANONICAL');
      expect(await cls('STORY', 'story', { editorialStatus: 'PUBLISHED' })).toBe('EDITORIAL');
      expect(await cls('JOURNEY', 'journey', { editorialStatus: 'PUBLISHED' })).toBe('EDITORIAL');
      expect(await cls('SOURCE', 'source', { archivedAt: null })).toBe('SOURCE_RECORD');
      expect(await cls('COMMUNITY_STORY', 'communityStory', { moderationStatus: 'LIMITED' })).toBe('COMMUNITY');
    });

    it('LOCKED community stories stay searchable, UNDER_REVIEW ones do not (PUBLIC_VISIBLE_STATUSES)', async () => {
      expect(await LOADERS.COMMUNITY_STORY(txFor('communityStory', { id: 'x', canonicalSlug: 's', type: 'T', moderationStatus: 'LOCKED', translations: [tr()] }), 'x')).not.toBeNull();
      expect(await LOADERS.COMMUNITY_STORY(txFor('communityStory', { id: 'x', canonicalSlug: 's', type: 'T', moderationStatus: 'UNDER_REVIEW', translations: [tr()] }), 'x')).toBeNull();
    });

    it('never projects the community story body (titles only)', async () => {
      const loaded = await LOADERS.COMMUNITY_STORY(txFor('communityStory', { id: 'x', canonicalSlug: 's', type: 'T', moderationStatus: 'VISIBLE', translations: [{ locale: 'vi', title: 'Tiêu đề', body: 'PRIVATE BODY' }] }), 'x');
      expect(JSON.stringify(loaded)).not.toContain('PRIVATE BODY');
      expect(loaded!.translations[0].summary).toBeNull();
    });
  });

  describe('current geography context is stored, never inferred (spec 24)', () => {
    it('a Place carries only its stored current country/region/city ids', async () => {
      const loaded = await LOADERS.PLACE(txFor('place', { id: 'p', canonicalSlug: 's', type: 'T', publicationStatus: 'PUBLISHED', historicalImportance: 9, currentCountryId: 'c1', currentRegionId: null, currentCityId: 'c2', translations: [tr()] }), 'p');
      expect(loaded).toMatchObject({ countryIds: ['c1'], regionIds: [], cityIds: ['c2'], importance: 9 });
    });

    it('an Event gets country ids only from explicit EventCountry links', async () => {
      const tx = txFor('historicalEvent', { id: 'e', canonicalSlug: 's', publicationStatus: 'PUBLISHED', importance: 5, dateChronologyStart: 10, dateChronologyEnd: 20, translations: [tr()] }, { eventCountry: { findMany: jest.fn().mockResolvedValue([{ countryId: 'b' }, { countryId: 'a' }, { countryId: 'a' }]) } });
      expect(await LOADERS.EVENT(tx, 'e')).toMatchObject({ countryIds: ['a', 'b'], chronologyStart: 10, chronologyEnd: 20 });
    });

    it('unknown chronology stays null (never "every period")', async () => {
      const loaded = await LOADERS.EVENT(txFor('historicalEvent', { id: 'e', canonicalSlug: 's', publicationStatus: 'PUBLISHED', importance: 1, dateChronologyStart: null, dateChronologyEnd: null, translations: [tr()] }), 'e');
      expect(loaded).toMatchObject({ chronologyStart: null, chronologyEnd: null });
    });
  });

  describe('geometry sources (spec 42-43, 55, 58)', () => {
    it('only Country/Region/City/Destination/Place/Territory/Event have a geometry source; nothing is geocoded', () => {
      const withGeometry = (Object.values(SearchEntityKind) as SearchEntityKind[]).filter((k) => geometrySql(k, 'x') !== null).sort();
      expect(withGeometry).toEqual(['CITY', 'COUNTRY', 'DESTINATION', 'EVENT', 'PLACE', 'REGION', 'TERRITORY']);
    });

    it('a Territory geometry is only projected when its geometry is PUBLISHED', () => {
      expect(geometrySql('TERRITORY', 'x')!.sql).toContain(`"geometryStatus" = 'PUBLISHED'`);
    });

    it('an Event geometry comes only from explicitly linked, PUBLISHED Place points', () => {
      const sql = geometrySql('EVENT', 'x')!.sql;
      expect(sql).toContain('"EventPlace"');
      expect(sql).toContain(`"publicationStatus" = 'PUBLISHED'`);
    });

    it('all projected geometry is SRID 4326', () => {
      for (const k of ['COUNTRY', 'REGION', 'CITY', 'DESTINATION'] as SearchEntityKind[]) expect(geometrySql(k, 'x')!.sql).toContain('4326');
    });
  });

  it('aliases are read only for kinds that own EntityAlias rows (Theme has none)', () => {
    expect(ALIAS_KINDS.has('THEME')).toBe(false);
    expect(ALIAS_KINDS.has('PLACE')).toBe(true);
  });
});
