import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { FactEditorialStatus, MediaAssetStatus, ReviewDecision, StoryEditorialStatus } from '@prisma/client';
import { StoriesService } from './stories.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

function makePrismaStub() {
  return {
    story: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    storyPlace: { create: jest.fn() },
    storyPerson: { create: jest.fn() },
    storyEvent: { create: jest.fn() },
    storyFact: { create: jest.fn() },
    storyCitation: { create: jest.fn() },
    historicalFact: { findUnique: jest.fn() },
    citation: { findUnique: jest.fn() },
    mediaAsset: { findUnique: jest.fn(), findMany: jest.fn() },
    entityMedia: { findMany: jest.fn() },
    revision: { create: jest.fn() },
  };
}

function makeService(prisma = makePrismaStub()) {
  const audit = { log: jest.fn() };
  const service = new StoriesService(prisma as unknown as PrismaService, audit as unknown as AuditService);
  return { service, prisma, audit };
}

const baseTranslation = { id: 't1', locale: 'vi', title: 'Bach Dang 1288', method: 'ORIGINAL', status: 'PUBLISHED', content: [] };

const baseStory = {
  id: 'story-1',
  editorialStatus: StoryEditorialStatus.READY,
  translations: [baseTranslation],
  heroMedia: null,
  placeLinks: [],
  personLinks: [],
  eventLinks: [],
  factLinks: [],
  citationLinks: [],
  version: 0,
  createdById: 'editor-1',
};

/** Covers spec section 67 tests #1/#2/#3: a Story starts non-public and stays that way until PUBLISHED. */
describe('StoriesService.create / findBySlug', () => {
  it('creates a Story in DRAFT status', async () => {
    const { service, prisma } = makeService();
    prisma.story.create.mockResolvedValue({ id: 's1', translations: [baseTranslation] });
    // First call is ensureUniqueSlug's collision check (must resolve null to
    // terminate that loop); subsequent calls are the post-create snapshot.
    prisma.story.findUnique.mockResolvedValueOnce(null).mockResolvedValue({ ...baseStory, translations: [baseTranslation] });

    await service.create({ translations: [{ locale: 'vi', title: 'Bach Dang 1288' }] } as any, 'editor-1');
    expect(prisma.story.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ authorId: 'editor-1' }) }),
    );
    // no explicit status passed -> defaults to DRAFT at the schema level, not forced PUBLISHED here
    expect(prisma.story.create.mock.calls[0][0].data.editorialStatus).toBeUndefined();
  });

  it('never returns a DRAFT story from the public findBySlug path', async () => {
    const { service, prisma } = makeService();
    prisma.story.findUnique.mockResolvedValue({ ...baseStory, editorialStatus: StoryEditorialStatus.DRAFT });
    await expect(service.findBySlug('bach-dang-1288', 'vi')).rejects.toThrow(NotFoundException);
  });

  it('never returns an ARCHIVED story from the public findBySlug path', async () => {
    const { service, prisma } = makeService();
    prisma.story.findUnique.mockResolvedValue({ ...baseStory, editorialStatus: StoryEditorialStatus.ARCHIVED });
    await expect(service.findBySlug('bach-dang-1288', 'vi')).rejects.toThrow(NotFoundException);
  });

  it('returns a PUBLISHED story', async () => {
    const { service, prisma } = makeService();
    prisma.story.findUnique.mockResolvedValue({ ...baseStory, editorialStatus: StoryEditorialStatus.PUBLISHED, canonicalSlug: 'bach-dang-1288' });
    await expect(service.findBySlug('bach-dang-1288', 'vi')).resolves.toBeDefined();
  });
});

/** Covers spec section 67 tests #7/#9/#10/#11: entity/fact link creation and existence validation. */
describe('StoriesService entity/fact/citation linking', () => {
  it('links a Place with an explicit role', async () => {
    const { service, prisma } = makeService();
    prisma.story.findUnique.mockResolvedValue(baseStory);
    prisma.storyPlace.create.mockResolvedValue({ id: 'l1', storyId: 'story-1', placeId: 'place-1', role: 'PRIMARY_SUBJECT' });

    const result = await service.linkEntity('story-1', 'place', { entityId: 'place-1', role: 'PRIMARY_SUBJECT' } as any, 'editor-1');
    expect(result.role).toBe('PRIMARY_SUBJECT');
    expect(prisma.storyPlace.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { storyId: 'story-1', placeId: 'place-1', role: 'PRIMARY_SUBJECT' } }),
    );
  });

  it('links a Person', async () => {
    const { service, prisma } = makeService();
    prisma.story.findUnique.mockResolvedValue(baseStory);
    prisma.storyPerson.create.mockResolvedValue({ id: 'l1' });
    await expect(service.linkEntity('story-1', 'person', { entityId: 'person-1' } as any, 'editor-1')).resolves.toBeDefined();
  });

  it('links an Event', async () => {
    const { service, prisma } = makeService();
    prisma.story.findUnique.mockResolvedValue(baseStory);
    prisma.storyEvent.create.mockResolvedValue({ id: 'l1' });
    await expect(service.linkEntity('story-1', 'event', { entityId: 'event-1' } as any, 'editor-1')).resolves.toBeDefined();
  });

  it('rejects a fact link referencing a Fact that does not exist', async () => {
    const { service, prisma } = makeService();
    prisma.story.findUnique.mockResolvedValue(baseStory);
    prisma.historicalFact.findUnique.mockResolvedValue(null);

    await expect(service.linkFact('story-1', { factId: 'missing' } as any, 'editor-1')).rejects.toThrow(BadRequestException);
    expect(prisma.storyFact.create).not.toHaveBeenCalled();
  });

  it('links a fact that exists', async () => {
    const { service, prisma } = makeService();
    prisma.story.findUnique.mockResolvedValue(baseStory);
    prisma.historicalFact.findUnique.mockResolvedValue({ id: 'fact-1' });
    prisma.storyFact.create.mockResolvedValue({ id: 'l1', storyId: 'story-1', factId: 'fact-1' });

    await expect(service.linkFact('story-1', { factId: 'fact-1' } as any, 'editor-1')).resolves.toBeDefined();
  });

  it('rejects a citation link referencing a Citation that does not exist', async () => {
    const { service, prisma } = makeService();
    prisma.story.findUnique.mockResolvedValue(baseStory);
    prisma.citation.findUnique.mockResolvedValue(null);

    await expect(service.linkCitation('story-1', { citationId: 'missing' } as any, 'editor-1')).rejects.toThrow(BadRequestException);
  });
});

/**
 * Covers spec section 2/67 tests #12/#13/#17: a Story can never present a
 * DRAFT Fact as verified support, and StoryCitation never substitutes for
 * the Fact/Citation trust invariant.
 */
describe('StoriesService.setEditorialStatus - publication validator', () => {
  const editor = { id: 'editor-1', email: 'e@dauviet.vn', roles: ['EDITOR'] };

  it('refuses to publish when a linked Fact is not PUBLISHED', async () => {
    const { service, prisma } = makeService();
    const story = {
      ...baseStory,
      factLinks: [{ factId: 'fact-1', fact: { id: 'fact-1', editorialStatus: FactEditorialStatus.DRAFT } }],
    };
    prisma.story.findUnique.mockResolvedValue(story);

    await expect(service.setEditorialStatus('story-1', StoryEditorialStatus.PUBLISHED, editor)).rejects.toThrow(BadRequestException);
    expect(prisma.story.update).not.toHaveBeenCalled();
  });

  it('publishes once every linked Fact is PUBLISHED', async () => {
    const { service, prisma } = makeService();
    const story = {
      ...baseStory,
      factLinks: [{ factId: 'fact-1', fact: { id: 'fact-1', editorialStatus: FactEditorialStatus.PUBLISHED } }],
    };
    prisma.story.findUnique.mockResolvedValue(story).mockResolvedValueOnce(story).mockResolvedValueOnce(story);
    prisma.story.update.mockResolvedValue({ ...story, editorialStatus: StoryEditorialStatus.PUBLISHED });

    await expect(service.setEditorialStatus('story-1', StoryEditorialStatus.PUBLISHED, editor)).resolves.toBeDefined();
  });

  it('refuses to publish with no translation at all', async () => {
    const { service, prisma } = makeService();
    prisma.story.findUnique.mockResolvedValue({ ...baseStory, translations: [] });
    await expect(service.setEditorialStatus('story-1', StoryEditorialStatus.PUBLISHED, editor)).rejects.toThrow(BadRequestException);
  });

  it('refuses to publish an AI-assisted translation that has not been human-reviewed', async () => {
    const { service, prisma } = makeService();
    prisma.story.findUnique.mockResolvedValue({
      ...baseStory,
      translations: [{ ...baseTranslation, method: 'AI_ASSISTED', status: 'DRAFT' }],
    });
    await expect(service.setEditorialStatus('story-1', StoryEditorialStatus.PUBLISHED, editor)).rejects.toThrow(BadRequestException);
  });

  it('allows an AI-assisted translation once it is HUMAN_REVIEWED', async () => {
    const { service, prisma } = makeService();
    const story = { ...baseStory, translations: [{ ...baseTranslation, method: 'AI_ASSISTED', status: 'HUMAN_REVIEWED' }] };
    prisma.story.findUnique.mockResolvedValue(story);
    prisma.story.update.mockResolvedValue({ ...story, editorialStatus: StoryEditorialStatus.PUBLISHED });
    await expect(service.setEditorialStatus('story-1', StoryEditorialStatus.PUBLISHED, editor)).resolves.toBeDefined();
  });

  it('refuses to publish with a non-READY hero media', async () => {
    const { service, prisma } = makeService();
    prisma.story.findUnique.mockResolvedValue({
      ...baseStory,
      heroMedia: { id: 'm1', status: MediaAssetStatus.PROCESSING, accessPolicy: 'PUBLIC' },
    });
    await expect(service.setEditorialStatus('story-1', StoryEditorialStatus.PUBLISHED, editor)).rejects.toThrow(BadRequestException);
  });

  it('refuses to publish with a RESTRICTED hero media even if READY', async () => {
    const { service, prisma } = makeService();
    prisma.story.findUnique.mockResolvedValue({
      ...baseStory,
      heroMedia: { id: 'm1', status: MediaAssetStatus.READY, accessPolicy: 'RESTRICTED' },
    });
    await expect(service.setEditorialStatus('story-1', StoryEditorialStatus.PUBLISHED, editor)).rejects.toThrow(BadRequestException);
  });

  it('refuses to publish when an inline body image is not READY', async () => {
    const { service, prisma } = makeService();
    prisma.story.findUnique.mockResolvedValue({
      ...baseStory,
      translations: [{ ...baseTranslation, content: [{ type: 'image', mediaAssetId: 'm1' }] }],
    });
    prisma.mediaAsset.findMany.mockResolvedValue([{ id: 'm1', status: MediaAssetStatus.PROCESSING }]);
    await expect(service.setEditorialStatus('story-1', StoryEditorialStatus.PUBLISHED, editor)).rejects.toThrow(BadRequestException);
  });

  it('refuses to publish when a cited source has been archived', async () => {
    const { service, prisma } = makeService();
    prisma.story.findUnique.mockResolvedValue({
      ...baseStory,
      citationLinks: [{ citation: { source: { archivedAt: new Date() } } }],
    });
    await expect(service.setEditorialStatus('story-1', StoryEditorialStatus.PUBLISHED, editor)).rejects.toThrow(BadRequestException);
  });
});

describe('StoriesService.setEditorialStatus - workflow/separation of duties', () => {
  it('rejects an invalid transition', async () => {
    const { service, prisma } = makeService();
    prisma.story.findUnique.mockResolvedValue({ ...baseStory, editorialStatus: StoryEditorialStatus.DRAFT });
    await expect(
      service.setEditorialStatus('story-1', StoryEditorialStatus.PUBLISHED, { id: 'editor-1', email: 'e', roles: ['EDITOR'] }),
    ).rejects.toThrow(BadRequestException);
  });

  it('requires a historian reviewer to complete source review for a Story with linked Facts', async () => {
    const { service, prisma } = makeService();
    prisma.story.findUnique.mockResolvedValue({
      ...baseStory,
      editorialStatus: StoryEditorialStatus.SOURCE_CHECK,
      factLinks: [{ factId: 'f1', fact: { id: 'f1', editorialStatus: FactEditorialStatus.PUBLISHED } }],
    });
    await expect(
      service.setEditorialStatus('story-1', StoryEditorialStatus.EDITORIAL_REVIEW, { id: 'editor-1', email: 'e', roles: ['EDITOR'] }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows a plain EDITOR to complete review for a Story with no linked Facts (non-historical content)', async () => {
    const { service, prisma } = makeService();
    const story = { ...baseStory, editorialStatus: StoryEditorialStatus.SOURCE_CHECK, factLinks: [] };
    prisma.story.findUnique.mockResolvedValue(story);
    prisma.story.update.mockResolvedValue({ ...story, editorialStatus: StoryEditorialStatus.EDITORIAL_REVIEW });
    await expect(
      service.setEditorialStatus('story-1', StoryEditorialStatus.EDITORIAL_REVIEW, { id: 'editor-1', email: 'e', roles: ['EDITOR'] }),
    ).resolves.toBeDefined();
  });

  it('allows a HISTORIAN_REVIEWER to complete review for a Story with linked Facts', async () => {
    const { service, prisma } = makeService();
    const story = {
      ...baseStory,
      editorialStatus: StoryEditorialStatus.SOURCE_CHECK,
      factLinks: [{ factId: 'f1', fact: { id: 'f1', editorialStatus: FactEditorialStatus.PUBLISHED } }],
    };
    prisma.story.findUnique.mockResolvedValue(story);
    prisma.story.update.mockResolvedValue({ ...story, editorialStatus: StoryEditorialStatus.EDITORIAL_REVIEW });
    await expect(
      service.setEditorialStatus('story-1', StoryEditorialStatus.EDITORIAL_REVIEW, { id: 'hist-1', email: 'h', roles: ['HISTORIAN_REVIEWER'] }),
    ).resolves.toBeDefined();
  });

  it('requires a documented reason to send an in-progress Story back to DRAFT', async () => {
    const { service, prisma } = makeService();
    prisma.story.findUnique.mockResolvedValue({ ...baseStory, editorialStatus: StoryEditorialStatus.EDITORIAL_REVIEW });
    await expect(
      service.setEditorialStatus('story-1', StoryEditorialStatus.DRAFT, { id: 'editor-1', email: 'e', roles: ['EDITOR'] }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a version conflict (optimistic concurrency)', async () => {
    const { service, prisma } = makeService();
    prisma.story.findUnique.mockResolvedValue({ ...baseStory, version: 3 });
    await expect(
      service.setEditorialStatus('story-1', StoryEditorialStatus.DRAFT, { id: 'editor-1', email: 'e', roles: ['EDITOR'] }, { expectedVersion: 2, notes: 'x' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('creates a Revision snapshot on every successful transition', async () => {
    const { service, prisma } = makeService();
    const story = { ...baseStory, editorialStatus: StoryEditorialStatus.SOURCE_CHECK, factLinks: [] };
    prisma.story.findUnique.mockResolvedValue(story);
    prisma.story.update.mockResolvedValue({ ...story, editorialStatus: StoryEditorialStatus.EDITORIAL_REVIEW });

    await service.setEditorialStatus('story-1', StoryEditorialStatus.EDITORIAL_REVIEW, { id: 'editor-1', email: 'e', roles: ['EDITOR'] });
    expect(prisma.revision.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ storyId: 'story-1', entityType: 'STORY' }) }),
    );
  });

  it('archiving a PUBLISHED story removes it from public discovery but preserves the record (findBySlug 404s afterward)', async () => {
    const { service, prisma } = makeService();
    const published = { ...baseStory, editorialStatus: StoryEditorialStatus.PUBLISHED };
    prisma.story.findUnique.mockResolvedValueOnce(published).mockResolvedValueOnce({ ...published, editorialStatus: StoryEditorialStatus.ARCHIVED });
    prisma.story.update.mockResolvedValue({ ...published, editorialStatus: StoryEditorialStatus.ARCHIVED });

    await service.archive('story-1', { id: 'editor-1', email: 'e', roles: ['EDITOR'] });
    await expect(service.findBySlug('x', 'vi')).rejects.toThrow(NotFoundException);
  });

  it('requires scheduledAt to be in the future when moving to SCHEDULED', async () => {
    const { service, prisma } = makeService();
    prisma.story.findUnique.mockResolvedValue({ ...baseStory, editorialStatus: StoryEditorialStatus.READY });
    await expect(
      service.setEditorialStatus(
        'story-1',
        StoryEditorialStatus.SCHEDULED,
        { id: 'editor-1', email: 'e', roles: ['EDITOR'] },
        { scheduledAt: new Date(Date.now() - 1000).toISOString() },
      ),
    ).rejects.toThrow(BadRequestException);
  });
});

/** Covers spec section 69 tests #35/#36/#37: role/trust boundaries around Story editing. */
describe('StoriesService trust boundaries', () => {
  it('rejects decision APPROVED when regressing to DRAFT', async () => {
    const { service, prisma } = makeService();
    prisma.story.findUnique.mockResolvedValue({ ...baseStory, editorialStatus: StoryEditorialStatus.EDITORIAL_REVIEW });
    await expect(
      service.setEditorialStatus(
        'story-1',
        StoryEditorialStatus.DRAFT,
        { id: 'editor-1', email: 'e', roles: ['EDITOR'] },
        { notes: 'needs work', decision: ReviewDecision.APPROVED },
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
