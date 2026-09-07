import { Prisma } from '@prisma/client';

/**
 * Static structural assertions against the Prisma DMMF for the G01 Global
 * Geography domain - same technique as the existing V1
 * `historical-date/schema-graph.spec.ts`, kept as an independent new file
 * rather than appended to that V1 spec (file-touch discipline: this domain
 * needs no change to the historical-date schema-graph assertions).
 */
describe('Global Geography schema graph integrity (static, no DB required)', () => {
  const models = Prisma.dmmf.datamodel.models;

  function model(name: string) {
    const m = models.find((mm) => mm.name === name);
    if (!m) throw new Error(`Model ${name} not found in DMMF`);
    return m;
  }

  it('every geography entity has a globally unique canonicalSlug, mirroring Place', () => {
    for (const name of ['Country', 'Region', 'City', 'Destination']) {
      const field = model(name).fields.find((f) => f.name === 'canonicalSlug');
      expect(field).toBeDefined();
      // Field-level `@unique` surfaces as `isUnique` on the DMMF field, not
      // in `model.uniqueFields` (which only reflects block-level `@@unique`).
      expect(field?.isUnique).toBe(true);
    }
  });

  it('Country keeps the V1 global (locale, slug) translation constraint - country-name collisions are not a realistic risk', () => {
    expect(model('CountryTranslation').uniqueFields).toContainEqual(['locale', 'slug']);
    expect(model('CountryTranslation').uniqueFields).toContainEqual(['countryId', 'locale']);
  });

  it('Region/City/Destination translations do NOT get a global (locale, slug) uniqueness constraint - spec section 14 (Springfield/Victoria/San Jose collide worldwide)', () => {
    for (const [translationModel, idField] of [
      ['RegionTranslation', 'regionId'],
      ['CityTranslation', 'cityId'],
      ['DestinationTranslation', 'destinationId'],
    ] as const) {
      const t = model(translationModel);
      expect(t.uniqueFields).toContainEqual([idField, 'locale']);
      expect(t.uniqueFields).not.toContainEqual(['locale', 'slug']);
    }
  });

  it('Country has no nameVi/nameEn-style column - all display text lives in CountryTranslation (spec section 5)', () => {
    const fieldNames = model('Country').fields.map((f) => f.name.toLowerCase());
    for (const forbidden of ['namevi', 'nameen', 'descriptionvi', 'descriptionen']) {
      expect(fieldNames).not.toContain(forbidden);
    }
  });

  it('Country.iso2/iso3 are each globally unique', () => {
    expect(model('Country').fields.find((f) => f.name === 'iso2')?.isUnique).toBe(true);
    expect(model('Country').fields.find((f) => f.name === 'iso3')?.isUnique).toBe(true);
  });

  it('Region has a self-referential parent/children hierarchy (spec section 7)', () => {
    const fields = model('Region').fields.map((f) => f.name);
    expect(fields).toEqual(expect.arrayContaining(['parentRegion', 'childRegions']));
  });

  it('City.regionId and Destination.regionId/cityId are all optional (nullable) - hierarchy is not a rigid mandatory chain (spec section 4)', () => {
    const cityRegion = model('City').fields.find((f) => f.name === 'regionId');
    const destRegion = model('Destination').fields.find((f) => f.name === 'regionId');
    const destCity = model('Destination').fields.find((f) => f.name === 'cityId');
    expect(cityRegion?.isRequired).toBe(false);
    expect(destRegion?.isRequired).toBe(false);
    expect(destCity?.isRequired).toBe(false);
  });

  it('Country/Region/City/Destination status reuses the existing PublicationStatus enum rather than a bespoke workflow', () => {
    for (const name of ['Country', 'Region', 'City', 'Destination']) {
      const statusField = model(name).fields.find((f) => f.name === 'status');
      expect(statusField?.type).toBe('PublicationStatus');
      expect(statusField?.hasDefaultValue).toBe(true);
      expect(statusField?.default).toBe('DRAFT');
    }
  });

  it('Destination is a distinct model from Place - no relation field aliases one as the other', () => {
    const destinationFields = model('Destination').fields.map((f) => f.name);
    const placeFields = model('Place').fields.map((f) => f.name);
    expect(destinationFields).not.toContain('place');
    expect(placeFields).not.toContain('destination');
  });

  it('EntityKind gained COUNTRY/REGION/CITY/DESTINATION additively, alongside every pre-existing V1 value', () => {
    const values = Prisma.dmmf.datamodel.enums.find((e) => e.name === 'EntityKind')?.values.map((v) => v.name);
    expect(values).toEqual(
      expect.arrayContaining([
        'PLACE',
        'PERSON',
        'EVENT',
        'ERA',
        'DYNASTY',
        'TERRITORY',
        'FACT',
        'STORY',
        'JOURNEY',
        'COMMUNITY_STORY',
        'SOURCE',
        'SOURCE_DOCUMENT',
        'CONTRIBUTION',
        'MEDIA_ASSET',
        'COMMENT',
        'COUNTRY',
        'REGION',
        'CITY',
        'DESTINATION',
      ]),
    );
  });

  it('City has no PostGIS geometry column - representative latitude/longitude only (spec section 15/16)', () => {
    for (const name of ['Country', 'Region', 'City', 'Destination']) {
      const fields = model(name).fields.map((f) => f.name.toLowerCase());
      expect(fields).not.toContain('geometry');
      expect(fields).not.toContain('location');
    }
  });
});
