import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EntityKind, ReportCategory, ReportStatus } from '@prisma/client';
import { ReportsService } from './reports.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/** Spec Phase 08 section 37/38: reports must target something real and cannot be spammed as unlimited duplicates. */
describe('ReportsService.file', () => {
  let prisma: any;
  let service: ReportsService;

  beforeEach(() => {
    prisma = {
      communityStory: { findUnique: jest.fn() },
      comment: { findUnique: jest.fn() },
      report: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
    };
    service = new ReportsService(prisma as unknown as PrismaService, { log: jest.fn() } as unknown as AuditService);
  });

  it('rejects a report against an unsupported target type', async () => {
    await expect(service.file('u1', EntityKind.PLACE, 'place-1', ReportCategory.SPAM)).rejects.toThrow(BadRequestException);
  });

  it('404s a report against a nonexistent CommunityStory', async () => {
    prisma.communityStory.findUnique.mockResolvedValue(null);
    await expect(service.file('u1', EntityKind.COMMUNITY_STORY, 'missing', ReportCategory.SPAM)).rejects.toThrow(NotFoundException);
  });

  it('rejects a duplicate open report from the same user for the same target+category', async () => {
    prisma.communityStory.findUnique.mockResolvedValue({ id: 'cs1' });
    prisma.report.findFirst.mockResolvedValue({ id: 'existing-report' });
    await expect(service.file('u1', EntityKind.COMMUNITY_STORY, 'cs1', ReportCategory.SPAM)).rejects.toThrow(BadRequestException);
    expect(prisma.report.create).not.toHaveBeenCalled();
  });

  it('allows a report once the target and category are valid and no open duplicate exists', async () => {
    prisma.communityStory.findUnique.mockResolvedValue({ id: 'cs1' });
    prisma.report.create.mockResolvedValue({ id: 'r1' });
    await expect(service.file('u1', EntityKind.COMMUNITY_STORY, 'cs1', ReportCategory.MISINFORMATION)).resolves.toBeDefined();
  });
});

describe('ReportsService.queue', () => {
  let prisma: any;
  let service: ReportsService;

  beforeEach(() => {
    prisma = { report: { findMany: jest.fn().mockResolvedValue([]) } };
    service = new ReportsService(prisma as unknown as PrismaService, { log: jest.fn() } as unknown as AuditService);
  });

  it('filters by status, targetType, and category together', async () => {
    await service.queue({ status: ReportStatus.OPEN, targetType: EntityKind.COMMENT, category: ReportCategory.HARASSMENT });
    expect(prisma.report.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: ReportStatus.OPEN, targetType: EntityKind.COMMENT, category: ReportCategory.HARASSMENT }) }),
    );
  });
});
