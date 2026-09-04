import { FactEditorialStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type FactLinkDelegate = 'factPlace' | 'factPerson' | 'factEvent' | 'factEra' | 'factTerritory';

const LINK_DELEGATE_BY_ENTITY: Record<'place' | 'person' | 'event' | 'era' | 'territory', FactLinkDelegate> = {
  place: 'factPlace',
  person: 'factPerson',
  event: 'factEvent',
  era: 'factEra',
  territory: 'factTerritory',
};

const LINK_FOREIGN_KEY: Record<'place' | 'person' | 'event' | 'era' | 'territory', string> = {
  place: 'placeId',
  person: 'personId',
  event: 'eventId',
  era: 'eraId',
  territory: 'territoryId',
};

/**
 * Shared by Place/Person/Event `GET :slug/sources` (spec section 31) - walks
 * fact links for the entity, keeps only PUBLISHED facts (never DRAFT/
 * SOURCE_CHECK/RETRACTED - spec section 38), and returns the distinct set of
 * Sources cited by them. A single query per entity, not N+1 per fact.
 */
export async function getPublicSourcesForEntity(
  prisma: PrismaService,
  entityKind: 'place' | 'person' | 'event' | 'era' | 'territory',
  entityId: string,
) {
  const delegate = LINK_DELEGATE_BY_ENTITY[entityKind];
  const foreignKey = LINK_FOREIGN_KEY[entityKind];

  const links = await (prisma[delegate] as any).findMany({
    where: { [foreignKey]: entityId },
    include: {
      fact: {
        include: { citations: { include: { source: true } } },
      },
    },
  });

  const sourceMap = new Map<string, Prisma.SourceGetPayload<Record<string, never>>>();
  for (const link of links as Array<{ fact: { editorialStatus: FactEditorialStatus; citations: Array<{ source: Prisma.SourceGetPayload<Record<string, never>> }> } }>) {
    if (link.fact.editorialStatus !== FactEditorialStatus.PUBLISHED) continue;
    for (const citation of link.fact.citations) {
      sourceMap.set(citation.source.id, citation.source);
    }
  }
  return Array.from(sourceMap.values());
}
