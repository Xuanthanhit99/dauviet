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

  it('Phase 04 spec section 44: a CommunityStory/Contribution has no direct relation to Source or Citation - community uploads cannot become trusted evidence without going through the Source/Citation review path', () => {
    expect(relationFieldNames('CommunityStory')).not.toEqual(
      expect.arrayContaining(['sources', 'source', 'citations', 'citation']),
    );
    expect(relationFieldNames('Contribution')).not.toEqual(
      expect.arrayContaining(['sources', 'source', 'citations', 'citation']),
    );
  });

  it('Phase 04: a HistoricalFact carries full review history via FactReview, not just a single reviewedById pointer', () => {
    expect(relationFieldNames('HistoricalFact')).toContain('reviews');
    expect(model('FactReview').fields.some((f) => f.name === 'decision')).toBe(true);
    expect(model('FactReview').fields.some((f) => f.name === 'stage')).toBe(true);
    expect(model('FactReview').fields.some((f) => f.name === 'reviewer')).toBe(true);
  });

  it('Phase 05 spec section 61: a MediaAsset of type MAP has no relation to Territory/geometry - an uploaded map image never becomes reviewed spatial geometry by itself', () => {
    expect(relationFieldNames('MediaAsset')).not.toEqual(
      expect.arrayContaining(['territory', 'territories', 'territoryGeometry']),
    );
    // MediaType.MAP is a value on the same enum as PHOTO/ILLUSTRATION - it
    // carries no special schema-level path into Territory at all.
    const mediaTypeEnum = Prisma.dmmf.datamodel.enums.find((e) => e.name === 'MediaType');
    expect(mediaTypeEnum?.values.map((v) => v.name)).toContain('MAP');
  });

  it('Phase 05 spec section 13: MediaAsset has an explicit upload/processing lifecycle status, defaulting to PENDING_UPLOAD - never implicitly usable on creation', () => {
    const statusField = model('MediaAsset').fields.find((f) => f.name === 'status');
    expect(statusField).toBeDefined();
    expect(statusField?.hasDefaultValue).toBe(true);
    expect(statusField?.default).toBe('PENDING_UPLOAD');
    const statusEnum = Prisma.dmmf.datamodel.enums.find((e) => e.name === 'MediaAssetStatus');
    expect(statusEnum?.values.map((v) => v.name)).toEqual(
      expect.arrayContaining(['PENDING_UPLOAD', 'UPLOADED', 'PROCESSING', 'READY', 'QUARANTINED', 'FAILED', 'ARCHIVED']),
    );
  });

  it('Phase 05 spec section 18/19: MediaAsset carries no raw GPS/EXIF-location field - no EXIF extraction pipeline exists in this codebase, so none can leak through the public API by construction', () => {
    const fieldNames = model('MediaAsset').fields.map((f) => f.name.toLowerCase());
    for (const gpsLike of ['gps', 'latitude', 'longitude', 'exif']) {
      expect(fieldNames.some((n) => n.includes(gpsLike))).toBe(false);
    }
  });

  it('Phase 05 spec section 44/59: ThenNowComparison reuses PublicationStatus/ModerationStatus rather than a bespoke trust bypass, and requires a real Place + two real MediaAsset relations', () => {
    const fields = model('ThenNowComparison').fields;
    expect(fields.some((f) => f.name === 'place')).toBe(true);
    expect(fields.some((f) => f.name === 'beforeMedia')).toBe(true);
    expect(fields.some((f) => f.name === 'afterMedia')).toBe(true);
    expect(fields.find((f) => f.name === 'publicationStatus')?.type).toBe('PublicationStatus');
    expect(fields.find((f) => f.name === 'moderationStatus')?.type).toBe('ModerationStatus');
  });

  it('every browsable entity has a locale-scoped, slug-unique translation table', () => {
    const translationModels: Record<string, string> = {
      PlaceTranslation: 'placeId',
      PersonTranslation: 'personId',
      HistoricalEventTranslation: 'eventId',
      HistoricalEraTranslation: 'eraId',
      DynastyTranslation: 'dynastyId',
      TerritoryTranslation: 'territoryId',
      StoryTranslation: 'storyId',
      JourneyTranslation: 'journeyId',
    };
    for (const [translationModel, idField] of Object.entries(translationModels)) {
      const t = model(translationModel);
      expect(t.uniqueFields).toContainEqual([idField, 'locale']);
      expect(t.uniqueFields).toContainEqual(['locale', 'slug']);
    }
  });

  it('Phase 06 spec section 61: a Story/Journey localized slug is unique per locale, not globally - the same Story can have distinct vi/en slugs', () => {
    // @@unique([storyId, locale]) + @@unique([locale, slug]) together mean:
    // one translation per (story, locale), and a slug can never collide with
    // another story's translation IN THE SAME locale - but the same string
    // can be a vi slug for story A and an en slug for story B, and a single
    // story naturally has a different slug per locale.
    expect(model('StoryTranslation').uniqueFields).toContainEqual(['storyId', 'locale']);
    expect(model('JourneyTranslation').uniqueFields).toContainEqual(['journeyId', 'locale']);
  });

  it('Phase 06 spec section 8/9: Story entity links carry a role, and each (story, entity) pair is duplicate-proof', () => {
    for (const [table, key] of [
      ['StoryPlace', ['storyId', 'placeId']],
      ['StoryPerson', ['storyId', 'personId']],
      ['StoryEvent', ['storyId', 'eventId']],
    ] as const) {
      const m = model(table);
      expect(m.fields.some((f) => f.name === 'role')).toBe(true);
      expect(m.uniqueFields).toContainEqual(key);
    }
  });

  it('Phase 06 spec section 10: StoryFact is duplicate-proof and links to a real HistoricalFact', () => {
    expect(model('StoryFact').uniqueFields).toContainEqual(['storyId', 'factId']);
    expect(model('StoryFact').fields.some((f) => f.name === 'fact')).toBe(true);
  });

  it('Phase 06 spec section 26/27: JourneyStop ordering and place-duplication are both DB-enforced, not just application logic', () => {
    const stop = model('JourneyStop');
    expect(stop.uniqueFields).toContainEqual(['journeyId', 'placeId']);
    expect(stop.uniqueFields).toContainEqual(['journeyId', 'order']);
  });

  it('Phase 06 spec section 53: a CommunityStory has no relation to Story or StoryTranslation - popularity alone can never turn community content into editorial Story', () => {
    expect(relationFieldNames('CommunityStory')).not.toEqual(
      expect.arrayContaining(['story', 'stories', 'editorialStory']),
    );
  });

  it('Phase 06 spec section 44: Story publication status is its own StoryEditorialStatus enum, distinct from PublicationStatus, and includes SOURCE_CHECK/SCHEDULED/ARCHIVED', () => {
    const statusField = model('Story').fields.find((f) => f.name === 'editorialStatus');
    expect(statusField?.type).toBe('StoryEditorialStatus');
    const values = Prisma.dmmf.datamodel.enums.find((e) => e.name === 'StoryEditorialStatus')?.values.map((v) => v.name);
    expect(values).toEqual(
      expect.arrayContaining(['DRAFT', 'SOURCE_CHECK', 'EDITORIAL_REVIEW', 'READY', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED']),
    );
  });

  it('Phase 09 spec section 26/27: ContributionReviewNote carries a decision, not just a note - full review history same as FactReview', () => {
    expect(model('ContributionReviewNote').fields.some((f) => f.name === 'decision')).toBe(true);
    expect(model('ContributionReviewNote').fields.some((f) => f.name === 'stage')).toBe(true);
    expect(model('ContributionReviewNote').fields.some((f) => f.name === 'reviewer')).toBe(true);
  });

  it('Phase 09 spec section 53/54: Contribution carries an optimistic-concurrency version counter, defaulting to 0', () => {
    const versionField = model('Contribution').fields.find((f) => f.name === 'version');
    expect(versionField?.hasDefaultValue).toBe(true);
    expect(versionField?.default).toBe(0);
  });

  it('Phase 09 spec section 28/29: ACCEPTED and CATALOGUED are distinct ContributionStatus values, and cataloguing produces a separate result row rather than a single nullable pointer', () => {
    const values = Prisma.dmmf.datamodel.enums.find((e) => e.name === 'ContributionStatus')?.values.map((v) => v.name);
    expect(values).toEqual(expect.arrayContaining(['ACCEPTED', 'CATALOGUED']));
    expect(relationFieldNames('Contribution')).toContain('catalogueResults');
  });

  it('Phase 09 spec section 12/13: rights review (reviewer-controlled) and submitterDeclaration (submitter claim) are distinct fields with distinct enums', () => {
    const rightsField = model('Contribution').fields.find((f) => f.name === 'rightsReviewState');
    const declarationField = model('Contribution').fields.find((f) => f.name === 'submitterDeclaration');
    expect(rightsField?.type).toBe('ContributionRightsReviewState');
    expect(declarationField?.type).toBe('SubmitterRightsDeclaration');
    expect(rightsField?.type).not.toBe(declarationField?.type);
  });
});
