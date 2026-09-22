import { EntityResolutionService, normalizeNameKey } from './entity-resolution.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NormalizedCandidate } from './adapters/adapter.types';

function candidate(overrides: Partial<NormalizedCandidate['normalizedData']> = {}): NormalizedCandidate {
  return {
    candidateType: 'PLACE',
    normalizedData: { labels: { en: 'Hue' }, aliases: {}, ...overrides },
    evidence: { externalRecordId: 'Q1', retrievedAt: new Date() },
  };
}

describe('EntityResolutionService (spec sections 25-27/84)', () => {
  let prisma: any;
  let service: EntityResolutionService;

  beforeEach(() => {
    prisma = {
      externalEntityIdentity: { findUnique: jest.fn().mockResolvedValue(null) },
      placeTranslation: { findMany: jest.fn().mockResolvedValue([]) },
      cityTranslation: { findMany: jest.fn().mockResolvedValue([]) },
      destinationTranslation: { findMany: jest.fn().mockResolvedValue([]) },
      countryTranslation: { findMany: jest.fn().mockResolvedValue([]) },
      entityAlias: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new EntityResolutionService(prisma as unknown as PrismaService);
  });

  it('normalizeNameKey strips diacritics, case, and punctuation deterministically', () => {
    expect(normalizeNameKey('Hà Nội')).toBe('ha noi');
    expect(normalizeNameKey('HÀ NỘI!')).toBe('ha noi');
    expect(normalizeNameKey('Đà Nẵng')).toBe('da nang');
  });

  it('returns EXACT_MATCH, auto-resolved, when an ExternalEntityIdentity is already resolved for this exact (source, externalId) - idempotent re-run (spec section 36)', async () => {
    prisma.externalEntityIdentity.findUnique.mockResolvedValue({ resolvedEntityId: 'place-1', entityType: 'PLACE' });
    const result = await service.resolve({ sourceId: 's1', externalId: 'Q1', candidate: candidate() });
    expect(result.outcome).toBe('EXACT_MATCH');
    expect(result.autoResolved).toBe(true);
    expect(result.matchedEntityId).toBe('place-1');
  });

  it('returns NO_MATCH when no canonical entity shares a normalized name - never auto-resolved', async () => {
    const result = await service.resolve({ sourceId: 's1', externalId: 'Q1', candidate: candidate({ labels: { en: 'Nonexistent Place Name' } }) });
    expect(result.outcome).toBe('NO_MATCH');
    expect(result.autoResolved).toBe(false);
    expect(result.matchedEntityId).toBeNull();
  });

  it('returns HIGH_CONFIDENCE_MATCH (never EXACT_MATCH) when exactly one canonical Place shares the normalized name - still requires human confirmation', async () => {
    prisma.placeTranslation.findMany.mockResolvedValue([{ name: 'Hue', place: { id: 'place-hue', canonicalSlug: 'hue' } }]);
    const result = await service.resolve({ sourceId: 's1', externalId: 'Q1', candidate: candidate() });
    expect(result.outcome).toBe('HIGH_CONFIDENCE_MATCH');
    expect(result.autoResolved).toBe(false);
    expect(result.matchedEntityId).toBe('place-hue');
  });

  it('AMBIGUOUS: two distinct canonical Places share the same normalized name - required proof (spec section 84) that name similarity alone never auto-merges', async () => {
    prisma.placeTranslation.findMany.mockResolvedValue([
      { name: 'Hue', place: { id: 'place-hue-vietnam', canonicalSlug: 'hue-vietnam' } },
      { name: 'Hue', place: { id: 'place-hue-other', canonicalSlug: 'hue-other-landmark' } },
    ]);
    const result = await service.resolve({ sourceId: 's1', externalId: 'Q1', candidate: candidate() });
    expect(result.outcome).toBe('AMBIGUOUS');
    expect(result.autoResolved).toBe(false);
    expect(result.matchedEntityId).toBeNull();
    expect(result.signals.nameMatches).toHaveLength(2);
  });

  it('matches are diacritic/case-insensitive (Vietnamese labels correctly match ASCII-normalized canonical translations)', async () => {
    prisma.placeTranslation.findMany.mockResolvedValue([{ name: 'Hue', place: { id: 'place-hue', canonicalSlug: 'hue' } }]);
    const result = await service.resolve({ sourceId: 's1', externalId: 'Q1', candidate: candidate({ labels: { vi: 'Huế' } }) });
    expect(result.outcome).toBe('HIGH_CONFIDENCE_MATCH');
  });

  it('EntityAlias rows are an additive matching signal alongside translations', async () => {
    prisma.entityAlias.findMany.mockResolvedValue([{ alias: 'Hue', entityId: 'place-via-alias' }]);
    const result = await service.resolve({ sourceId: 's1', externalId: 'Q1', candidate: candidate() });
    expect(result.outcome).toBe('HIGH_CONFIDENCE_MATCH');
    expect(result.matchedEntityId).toBe('place-via-alias');
  });

  it('an unsupported candidateType (e.g. an entity kind resolution cannot classify) returns NO_MATCH, never a false match', async () => {
    const weird: NormalizedCandidate = { ...candidate(), candidateType: 'HISTORICAL_FACT' };
    const result = await service.resolve({ sourceId: 's1', externalId: 'Q1', candidate: weird });
    expect(result.outcome).toBe('NO_MATCH');
  });
});
