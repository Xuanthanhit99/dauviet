import { getPublicSourcesForEntity } from './fact-sources.util';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Covers spec section 57 tests #10/#11: the public `:slug/sources` surface
 * (Place/Person/Event) must never leak a source through a DRAFT, in-review,
 * or RETRACTED fact - only PUBLISHED facts contribute their citations'
 * sources. Shared by Places/People/Events, so one test covers all three.
 */
describe('getPublicSourcesForEntity', () => {
  function prismaWith(links: unknown[]) {
    return {
      factPlace: { findMany: jest.fn().mockResolvedValue(links) },
      factPerson: { findMany: jest.fn().mockResolvedValue(links) },
      factEvent: { findMany: jest.fn().mockResolvedValue(links) },
    } as unknown as PrismaService;
  }

  it('excludes sources reachable only through a DRAFT fact', async () => {
    const prisma = prismaWith([
      { fact: { editorialStatus: 'DRAFT', citations: [{ source: { id: 's1' } }] } },
    ]);
    const result = await getPublicSourcesForEntity(prisma, 'place', 'place-1');
    expect(result).toEqual([]);
  });

  it('excludes sources reachable only through a RETRACTED fact', async () => {
    const prisma = prismaWith([
      { fact: { editorialStatus: 'RETRACTED', citations: [{ source: { id: 's1' } }] } },
    ]);
    const result = await getPublicSourcesForEntity(prisma, 'person', 'person-1');
    expect(result).toEqual([]);
  });

  it('includes sources from a PUBLISHED fact, deduplicated', async () => {
    const source = { id: 's1', title: 'A Source' };
    const prisma = prismaWith([
      { fact: { editorialStatus: 'PUBLISHED', citations: [{ source }, { source }] } },
      { fact: { editorialStatus: 'DRAFT', citations: [{ source: { id: 's2' } }] } },
    ]);
    const result = await getPublicSourcesForEntity(prisma, 'event', 'event-1');
    expect(result).toEqual([source]);
  });
});
