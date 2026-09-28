import { AliasType, Prisma, SearchEntityKind, SearchTrustClass } from '@prisma/client';
import { PUBLIC_VISIBLE_STATUSES } from '../../common/moderation/public-visible-statuses.util';

/**
 * Per-kind canonical loaders for the G11 search projection. This file is the
 * EXPLICIT ALLOWLIST of what can ever be public search content: every loader
 * reads only its own public canonical tables and applies the kind's public
 * eligibility rule (the same rule the existing public read API applies).
 * Returning `null` means "not public" and makes the projection delete the
 * document - so unpublishing leaves no ghost result. No Trip*, location,
 * expense, affiliate, ingestion-candidate, provider or moderation-private
 * table is read anywhere in this file (asserted by a unit test).
 */
export type LoaderTx = Prisma.TransactionClient;

export interface LoadedTranslation {
  /** '' for content that carries no locale (e.g. Source.title). */
  locale: string;
  title: string;
  summary: string | null;
}

export interface LoadedAlias {
  locale: string;
  alias: string;
  aliasType: AliasType;
}

export interface LoadedEntity {
  slug: string;
  trustClass: SearchTrustClass;
  subtype: string | null;
  importance: number;
  translations: LoadedTranslation[];
  countryIds: string[];
  regionIds: string[];
  cityIds: string[];
  chronologyStart: number | null;
  chronologyEnd: number | null;
}

export type EntityLoader = (tx: LoaderTx, id: string) => Promise<LoadedEntity | null>;

const present = (...ids: Array<string | null | undefined>): string[] => ids.filter((v): v is string => typeof v === 'string' && v.length > 0);

const base = (over: Partial<LoadedEntity> & Pick<LoadedEntity, 'slug' | 'translations'>): LoadedEntity => ({
  trustClass: SearchTrustClass.CANONICAL,
  subtype: null,
  importance: 0,
  countryIds: [],
  regionIds: [],
  cityIds: [],
  chronologyStart: null,
  chronologyEnd: null,
  ...over,
});

export const LOADERS: Record<SearchEntityKind, EntityLoader> = {
  COUNTRY: async (tx, id) => {
    const c = await tx.country.findUnique({ where: { id }, include: { translations: true } });
    if (!c || c.status !== 'PUBLISHED') return null;
    return base({
      slug: c.canonicalSlug,
      countryIds: [c.id],
      translations: c.translations.map((t) => ({ locale: t.locale, title: t.name, summary: t.shortDescription })),
    });
  },
  REGION: async (tx, id) => {
    const r = await tx.region.findUnique({ where: { id }, include: { translations: true } });
    if (!r || r.status !== 'PUBLISHED') return null;
    return base({
      slug: r.canonicalSlug,
      subtype: r.type,
      countryIds: present(r.countryId),
      regionIds: [r.id],
      translations: r.translations.map((t) => ({ locale: t.locale, title: t.name, summary: t.summary })),
    });
  },
  CITY: async (tx, id) => {
    const c = await tx.city.findUnique({ where: { id }, include: { translations: true } });
    if (!c || c.status !== 'PUBLISHED') return null;
    return base({
      slug: c.canonicalSlug,
      importance: c.importance,
      countryIds: present(c.countryId),
      regionIds: present(c.regionId),
      cityIds: [c.id],
      translations: c.translations.map((t) => ({ locale: t.locale, title: t.name, summary: t.summary })),
    });
  },
  DESTINATION: async (tx, id) => {
    const d = await tx.destination.findUnique({ where: { id }, include: { translations: true } });
    if (!d || d.status !== 'PUBLISHED') return null;
    return base({
      slug: d.canonicalSlug,
      subtype: d.type,
      importance: d.importance,
      countryIds: present(d.countryId),
      regionIds: present(d.regionId),
      cityIds: present(d.cityId),
      translations: d.translations.map((t) => ({ locale: t.locale, title: t.name, summary: t.summary ?? t.tagline })),
    });
  },
  PLACE: async (tx, id) => {
    const p = await tx.place.findUnique({ where: { id }, include: { translations: true } });
    if (!p || p.publicationStatus !== 'PUBLISHED') return null;
    return base({
      slug: p.canonicalSlug,
      subtype: p.type,
      importance: p.historicalImportance,
      // Stored current-geography FKs only - never derived spatially (spec 24).
      countryIds: present(p.currentCountryId),
      regionIds: present(p.currentRegionId),
      cityIds: present(p.currentCityId),
      translations: p.translations.map((t) => ({ locale: t.locale, title: t.name, summary: t.summary })),
    });
  },
  PERSON: async (tx, id) => {
    const p = await tx.person.findUnique({ where: { id }, include: { translations: true } });
    if (!p || p.publicationStatus !== 'PUBLISHED') return null;
    return base({
      slug: p.canonicalSlug,
      importance: p.historicalImportance,
      translations: p.translations.map((t) => ({ locale: t.locale, title: t.displayName, summary: t.summary })),
    });
  },
  EVENT: async (tx, id) => {
    const e = await tx.historicalEvent.findUnique({ where: { id }, include: { translations: true } });
    if (!e || e.publicationStatus !== 'PUBLISHED') return null;
    const countries = await tx.eventCountry.findMany({ where: { eventId: id }, select: { countryId: true } });
    return base({
      slug: e.canonicalSlug,
      importance: e.importance,
      countryIds: [...new Set(countries.map((c) => c.countryId))].sort(),
      chronologyStart: e.dateChronologyStart,
      chronologyEnd: e.dateChronologyEnd,
      translations: e.translations.map((t) => ({ locale: t.locale, title: t.title, summary: t.summary })),
    });
  },
  ERA: async (tx, id) => {
    const e = await tx.historicalEra.findUnique({ where: { id }, include: { translations: true } });
    if (!e) return null;
    const countries = await tx.eraCountry.findMany({ where: { eraId: id }, select: { countryId: true } });
    return base({
      slug: e.canonicalSlug,
      countryIds: [...new Set(countries.map((c) => c.countryId))].sort(),
      chronologyStart: e.chronologyStart,
      chronologyEnd: e.chronologyEnd,
      translations: e.translations.map((t) => ({ locale: t.locale, title: t.name, summary: t.summary })),
    });
  },
  DYNASTY: async (tx, id) => {
    const d = await tx.dynasty.findUnique({ where: { id }, include: { translations: true } });
    if (!d) return null;
    return base({
      slug: d.canonicalSlug,
      chronologyStart: d.chronologyStart,
      chronologyEnd: d.chronologyEnd,
      translations: d.translations.map((t) => ({ locale: t.locale, title: t.name, summary: t.summary })),
    });
  },
  TERRITORY: async (tx, id) => {
    // The public Territory detail is readable regardless of geometryStatus (only its geometry is
    // withheld unless PUBLISHED), so the text is searchable; the projected `geom` is set only for
    // a PUBLISHED geometry (see refreshGeometry) - draft geometry can never leak through bbox.
    const t = await tx.territory.findUnique({ where: { id }, include: { translations: true } });
    if (!t) return null;
    return base({
      slug: t.canonicalSlug,
      subtype: t.type,
      chronologyStart: t.chronologyStart,
      chronologyEnd: t.chronologyEnd,
      translations: t.translations.map((x) => ({ locale: x.locale, title: x.name, summary: x.summary })),
    });
  },
  THEME: async (tx, id) => {
    const t = await tx.theme.findUnique({ where: { id }, include: { translations: true } });
    if (!t) return null;
    return base({
      slug: t.slug,
      subtype: t.category,
      translations: t.translations.map((x) => ({ locale: x.locale, title: x.name, summary: null })),
    });
  },
  STORY: async (tx, id) => {
    const s = await tx.story.findUnique({ where: { id }, include: { translations: true } });
    if (!s || s.editorialStatus !== 'PUBLISHED') return null;
    return base({
      slug: s.canonicalSlug,
      trustClass: SearchTrustClass.EDITORIAL,
      subtype: s.type,
      translations: s.translations.map((t) => ({ locale: t.locale, title: t.title, summary: t.summary ?? t.subtitle })),
    });
  },
  JOURNEY: async (tx, id) => {
    const j = await tx.journey.findUnique({ where: { id }, include: { translations: true } });
    if (!j || j.editorialStatus !== 'PUBLISHED') return null;
    return base({
      slug: j.canonicalSlug,
      trustClass: SearchTrustClass.EDITORIAL,
      translations: j.translations.map((t) => ({ locale: t.locale, title: t.title, summary: t.summary })),
    });
  },
  SOURCE: async (tx, id) => {
    const s = await tx.source.findUnique({ where: { id } });
    if (!s || s.archivedAt !== null) return null;
    return base({
      slug: s.id,
      trustClass: SearchTrustClass.SOURCE_RECORD,
      subtype: s.sourceType,
      translations: [{ locale: '', title: s.title, summary: null }],
    });
  },
  COMMUNITY_STORY: async (tx, id) => {
    const c = await tx.communityStory.findUnique({ where: { id }, include: { translations: true } });
    if (!c || !PUBLIC_VISIBLE_STATUSES.includes(c.moderationStatus)) return null;
    return base({
      slug: c.canonicalSlug,
      trustClass: SearchTrustClass.COMMUNITY,
      subtype: c.type,
      // Titles only; the community body is user-generated and never projected.
      translations: c.translations.map((t) => ({ locale: t.locale, title: t.title, summary: null })),
    });
  },
};

/** Kinds that own rows in EntityAlias (Theme has no alias entityType). */
export const ALIAS_KINDS: ReadonlySet<SearchEntityKind> = new Set<SearchEntityKind>([
  'COUNTRY', 'REGION', 'CITY', 'DESTINATION', 'PLACE', 'PERSON', 'EVENT', 'ERA', 'DYNASTY', 'TERRITORY', 'STORY', 'JOURNEY', 'SOURCE', 'COMMUNITY_STORY',
]);

/**
 * Canonical geometry for the optional search `bbox` filter, always SRID 4326. Returns the SQL
 * fragment producing the geometry (or NULL) for one entity. Only sources that are themselves
 * public contribute: a Territory geometry needs `geometryStatus = PUBLISHED`; an Event's geometry
 * is built ONLY from the points of PUBLISHED Places it is explicitly linked to (EventPlace) -
 * never geocoded from text.
 */
export function geometrySql(kind: SearchEntityKind, id: string): Prisma.Sql | null {
  switch (kind) {
    case 'COUNTRY':
      return Prisma.sql`SELECT ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326) FROM "Country" WHERE "id" = ${id} AND "latitude" IS NOT NULL AND "longitude" IS NOT NULL`;
    case 'REGION':
      return Prisma.sql`SELECT ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326) FROM "Region" WHERE "id" = ${id} AND "latitude" IS NOT NULL AND "longitude" IS NOT NULL`;
    case 'CITY':
      return Prisma.sql`SELECT ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326) FROM "City" WHERE "id" = ${id} AND "latitude" IS NOT NULL AND "longitude" IS NOT NULL`;
    case 'DESTINATION':
      return Prisma.sql`SELECT ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326) FROM "Destination" WHERE "id" = ${id} AND "latitude" IS NOT NULL AND "longitude" IS NOT NULL`;
    case 'PLACE':
      return Prisma.sql`SELECT COALESCE("location", "geometry") FROM "Place" WHERE "id" = ${id}`;
    case 'TERRITORY':
      return Prisma.sql`SELECT "geometry" FROM "Territory" WHERE "id" = ${id} AND "geometryStatus" = 'PUBLISHED'`;
    case 'EVENT':
      return Prisma.sql`SELECT ST_Collect(p."location") FROM "EventPlace" ep JOIN "Place" p ON p."id" = ep."placeId" WHERE ep."eventId" = ${id} AND p."publicationStatus" = 'PUBLISHED' AND p."location" IS NOT NULL`;
    default:
      return null;
  }
}
