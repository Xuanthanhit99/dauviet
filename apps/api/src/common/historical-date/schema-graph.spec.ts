import { Prisma } from '@prisma/client';

/**
 * Static structural assertions against the Prisma DMMF (spec section 39,
 * tests #6-#10) - these check that the knowledge-graph shape and
 * duplicate-relation guards actually exist in the schema, without touching
 * a live database. This is honest static verification, not a substitute
 * for the `UNVERIFIED_LIVE_DB` integration coverage documented elsewhere.
 */
describe('Schema graph integrity (static, no DB required)', () => {
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

  it('an Event can relate to multiple Places (via EventPlace) and multiple People (via EventPerson)', () => {
    expect(relationFieldNames('HistoricalEvent')).toEqual(expect.arrayContaining(['placeLinks', 'personLinks']));
    expect(model('EventPlace').fields.some((f) => f.name === 'place')).toBe(true);
    expect(model('EventPerson').fields.some((f) => f.name === 'person')).toBe(true);
  });

  it('a Person can relate to a Dynasty (via PersonDynasty)', () => {
    expect(relationFieldNames('Person')).toContain('dynastyLinks');
    expect(relationFieldNames('Dynasty')).toContain('personLinks');
  });

  it('an Event can relate to an Era, and a Territory', () => {
    const eventFields = model('HistoricalEvent').fields;
    expect(eventFields.some((f) => f.name === 'era')).toBe(true);
    expect(eventFields.some((f) => f.name === 'territory')).toBe(true);
  });

  it('Fact links exist for every core entity type and are each duplicate-proof', () => {
    const factJoinTables: Record<string, string[]> = {
      FactPlace: ['factId', 'placeId'],
      FactPerson: ['factId', 'personId'],
      FactEvent: ['factId', 'eventId'],
      FactEra: ['factId', 'eraId'],
      FactTerritory: ['factId', 'territoryId'],
    };
    for (const [table, expectedKey] of Object.entries(factJoinTables)) {
      const m = model(table);
      expect(m.uniqueFields).toContainEqual(expectedKey);
    }
  });

  it('EventPlace/EventPerson/PersonDynasty/EventTheme each reject a duplicate link at the DB level', () => {
    expect(model('EventPlace').uniqueFields).toContainEqual(['eventId', 'placeId']);
    expect(model('EventPerson').uniqueFields).toContainEqual(['eventId', 'personId']);
    expect(model('PersonDynasty').uniqueFields).toContainEqual(['personId', 'dynastyId']);
    expect(model('EventTheme').uniqueFields).toContainEqual(['eventId', 'themeId']);
  });

  it('an Event can carry more than one Theme (spec section 11 - not a single rigid enum)', () => {
    expect(relationFieldNames('HistoricalEvent')).toContain('themeLinks');
    expect(model('Theme').fields.some((f) => f.name === 'category')).toBe(true);
  });

  it('EntityAlias rejects a duplicate (entityType, entityId, locale, alias) combination', () => {
    expect(model('EntityAlias').uniqueFields).toContainEqual(['entityType', 'entityId', 'locale', 'alias']);
  });

  it('HistoricalEra hierarchy is self-referential and supports children', () => {
    expect(relationFieldNames('HistoricalEra')).toEqual(expect.arrayContaining(['parentEra', 'childEras']));
  });

  it('every browsable entity has a locale-scoped, slug-unique translation table', () => {
    const translationModels: Record<string, string> = {
      PlaceTranslation: 'placeId',
      PersonTranslation: 'personId',
      HistoricalEventTranslation: 'eventId',
      HistoricalEraTranslation: 'eraId',
      DynastyTranslation: 'dynastyId',
      TerritoryTranslation: 'territoryId',
    };
    for (const [translationModel, idField] of Object.entries(translationModels)) {
      const t = model(translationModel);
      expect(t.uniqueFields).toContainEqual([idField, 'locale']);
      expect(t.uniqueFields).toContainEqual(['locale', 'slug']);
    }
  });
});
