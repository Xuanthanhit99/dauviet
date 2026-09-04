import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AccessPolicy, SourceType } from '@prisma/client';
import { SourcesService } from './sources.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/** Covers spec sections 40/41: an ISBN/ISSN collision is blocked before insert. */
describe('SourcesService.create duplicate-identifier guard', () => {
  let prisma: { source: { findFirst: jest.Mock; create: jest.Mock } };
  let audit: { log: jest.Mock };
  let service: SourcesService;

  beforeEach(() => {
    prisma = { source: { findFirst: jest.fn(), create: jest.fn() } };
    audit = { log: jest.fn() };
    service = new SourcesService(prisma as unknown as PrismaService, audit as unknown as AuditService);
  });

  it('rejects a second source with an already-used ISBN', async () => {
    prisma.source.findFirst.mockResolvedValue({ id: 'existing-1' });

    await expect(
      service.create({ sourceType: SourceType.BOOK, title: 'A Book', isbn: '978-0-00-000000-0' } as any, 'user-1'),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.source.create).not.toHaveBeenCalled();
  });

  it('allows a source with no ISBN (old archive records legitimately lack one)', async () => {
    prisma.source.create.mockResolvedValue({ id: 'new-1' });

    const result = await service.create({ sourceType: SourceType.ARCHIVAL_DOCUMENT, title: 'An archive record' } as any, 'user-1');
    expect(result.id).toBe('new-1');
    expect(prisma.source.findFirst).not.toHaveBeenCalled();
  });
});

/**
 * Covers spec section 57 tests #12/#13: a Source referenced by a published
 * fact cannot be archived out from under it, and RESTRICTED/METADATA_ONLY
 * documents are denied to unprivileged viewers server-side.
 */
/** Covers spec Phase 05.1 section 25: tightening a SourceDocument's access policy must also tighten any already-generated derivative MediaAsset rows, not just the original. */
describe('SourcesService.addDocument access-policy cascade', () => {
  let tx: { sourceDocument: { create: jest.Mock }; mediaAsset: { updateMany: jest.Mock } };
  let prisma: { source: { findUnique: jest.Mock }; $transaction: jest.Mock };
  let audit: { log: jest.Mock };
  let service: SourcesService;

  beforeEach(() => {
    tx = {
      sourceDocument: { create: jest.fn().mockResolvedValue({ id: 'doc-1' }) },
      mediaAsset: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    prisma = {
      source: { findUnique: jest.fn().mockResolvedValue({ id: 'source-1' }) },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(tx)),
    };
    audit = { log: jest.fn() };
    service = new SourcesService(prisma as unknown as PrismaService, audit as unknown as AuditService);
  });

  it('tightens both the original MediaAsset and any of its derivatives when the document is RESTRICTED', async () => {
    await service.addDocument('source-1', { mediaAssetId: 'media-1', accessPolicy: AccessPolicy.RESTRICTED } as any, 'editor-1');

    expect(tx.mediaAsset.updateMany).toHaveBeenCalledWith({
      where: { id: 'media-1', accessPolicy: AccessPolicy.PUBLIC },
      data: { accessPolicy: AccessPolicy.RESTRICTED },
    });
    expect(tx.mediaAsset.updateMany).toHaveBeenCalledWith({
      where: { parentAssetId: 'media-1', accessPolicy: AccessPolicy.PUBLIC },
      data: { accessPolicy: AccessPolicy.RESTRICTED },
    });
  });

  it('does not touch MediaAsset rows when the document is PUBLIC', async () => {
    await service.addDocument('source-1', { mediaAssetId: 'media-1', accessPolicy: AccessPolicy.PUBLIC } as any, 'editor-1');
    expect(tx.mediaAsset.updateMany).not.toHaveBeenCalled();
  });
});

describe('SourcesService.archive', () => {
  let prisma: {
    source: { findUnique: jest.Mock; update: jest.Mock };
    citation: { findFirst: jest.Mock };
  };
  let audit: { log: jest.Mock };
  let service: SourcesService;

  beforeEach(() => {
    prisma = {
      source: { findUnique: jest.fn(), update: jest.fn() },
      citation: { findFirst: jest.fn() },
    };
    audit = { log: jest.fn() };
    service = new SourcesService(prisma as unknown as PrismaService, audit as unknown as AuditService);
  });

  it('refuses to archive a source cited by a published fact', async () => {
    prisma.source.findUnique.mockResolvedValue({ id: 's1', archivedAt: null, translations: [], sourceDocuments: [] });
    prisma.citation.findFirst.mockResolvedValue({ id: 'c1' });

    await expect(service.archive('s1', 'admin-1', 'duplicate record')).rejects.toThrow(BadRequestException);
    expect(prisma.source.update).not.toHaveBeenCalled();
  });

  it('archives a source with no published-fact citations', async () => {
    prisma.source.findUnique.mockResolvedValue({ id: 's1', archivedAt: null, translations: [], sourceDocuments: [] });
    prisma.citation.findFirst.mockResolvedValue(null);
    prisma.source.update.mockResolvedValue({ id: 's1', archivedAt: new Date() });

    const result = await service.archive('s1', 'admin-1', 'duplicate record');
    expect(result.archivedAt).toBeDefined();
    expect(prisma.source.update).toHaveBeenCalled();
  });

  it('is idempotent for an already-archived source', async () => {
    const archived = { id: 's1', archivedAt: new Date(), translations: [], sourceDocuments: [] };
    prisma.source.findUnique.mockResolvedValue(archived);

    const result = await service.archive('s1', 'admin-1', 'again');
    expect(result).toBe(archived);
    expect(prisma.source.update).not.toHaveBeenCalled();
  });
});

describe('SourcesService.getDocumentForViewer', () => {
  let prisma: { sourceDocument: { findUnique: jest.Mock } };
  let service: SourcesService;

  beforeEach(() => {
    prisma = { sourceDocument: { findUnique: jest.fn() } };
    service = new SourcesService(prisma as unknown as PrismaService, {} as AuditService);
  });

  it('throws NotFoundException for a document belonging to a different source', async () => {
    prisma.sourceDocument.findUnique.mockResolvedValue({ id: 'd1', sourceId: 'other-source', accessPolicy: AccessPolicy.PUBLIC });
    await expect(service.getDocumentForViewer('s1', 'd1', ['USER'])).rejects.toThrow(NotFoundException);
  });

  it('allows any authenticated viewer to read a PUBLIC document', async () => {
    prisma.sourceDocument.findUnique.mockResolvedValue({ id: 'd1', sourceId: 's1', accessPolicy: AccessPolicy.PUBLIC });
    await expect(service.getDocumentForViewer('s1', 'd1', ['USER'])).resolves.toBeDefined();
  });

  it('allows any authenticated viewer to read a PREVIEW_ONLY document', async () => {
    prisma.sourceDocument.findUnique.mockResolvedValue({ id: 'd1', sourceId: 's1', accessPolicy: AccessPolicy.PREVIEW_ONLY });
    await expect(service.getDocumentForViewer('s1', 'd1', ['USER'])).resolves.toBeDefined();
  });

  it('denies a plain USER access to a METADATA_ONLY document', async () => {
    prisma.sourceDocument.findUnique.mockResolvedValue({ id: 'd1', sourceId: 's1', accessPolicy: AccessPolicy.METADATA_ONLY });
    await expect(service.getDocumentForViewer('s1', 'd1', ['USER'])).rejects.toThrow(ForbiddenException);
  });

  it('denies a plain USER access to a RESTRICTED document', async () => {
    prisma.sourceDocument.findUnique.mockResolvedValue({ id: 'd1', sourceId: 's1', accessPolicy: AccessPolicy.RESTRICTED });
    await expect(service.getDocumentForViewer('s1', 'd1', ['USER'])).rejects.toThrow(ForbiddenException);
  });

  it('allows a HISTORIAN_REVIEWER to read a RESTRICTED document', async () => {
    prisma.sourceDocument.findUnique.mockResolvedValue({ id: 'd1', sourceId: 's1', accessPolicy: AccessPolicy.RESTRICTED });
    await expect(service.getDocumentForViewer('s1', 'd1', ['HISTORIAN_REVIEWER'])).resolves.toBeDefined();
  });
});
