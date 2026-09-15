import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { CostAssumptionScope, CostAssumptionStatus } from '@prisma/client';
import { CostAssumptionsService } from './cost-assumptions.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

function makePrismaStub() {
  const prisma: any = {
    costAssumption: { findUnique: jest.fn(), findFirst: jest.fn().mockResolvedValue(null), create: jest.fn(), update: jest.fn(), count: jest.fn(), findMany: jest.fn() },
    country: { findFirst: jest.fn() },
    region: { findFirst: jest.fn() },
    city: { findFirst: jest.fn() },
    destination: { findFirst: jest.fn() },
    $transaction: jest.fn((arg: unknown) => {
      if (Array.isArray(arg)) return Promise.all(arg as Promise<unknown>[]);
      return (arg as (tx: unknown) => Promise<unknown>)(prisma);
    }),
  };
  return prisma;
}

function makeService(prisma = makePrismaStub()) {
  const audit = { log: jest.fn() };
  const service = new CostAssumptionsService(prisma as unknown as PrismaService, audit as unknown as AuditService);
  return { service, prisma, audit };
}

const baseDto = {
  scope: CostAssumptionScope.GLOBAL,
  category: 'FOOD' as any,
  unit: 'PER_PERSON_PER_DAY' as any,
  currency: 'VND',
  lowAmount: '100000',
  typicalAmount: '150000',
  highAmount: '200000',
  effectiveFrom: '2026-01-01',
  source: 'editorial estimate',
};

describe('CostAssumptionsService.create', () => {
  it('rejects lowAmount > typicalAmount', async () => {
    const { service } = makeService();
    await expect(service.create({ ...baseDto, lowAmount: '999999' }, 'admin-1')).rejects.toThrow(BadRequestException);
  });

  it('rejects typicalAmount > highAmount', async () => {
    const { service } = makeService();
    await expect(service.create({ ...baseDto, typicalAmount: '999999' }, 'admin-1')).rejects.toThrow(BadRequestException);
  });

  it('accepts low === typical === high (a fixed, non-ranged assumption)', async () => {
    const { service, prisma } = makeService();
    prisma.costAssumption.create.mockResolvedValue({ id: 'ca1' });
    await expect(service.create({ ...baseDto, lowAmount: '100', typicalAmount: '100', highAmount: '100' }, 'admin-1')).resolves.toEqual({ id: 'ca1' });
  });

  it('rejects effectiveTo before effectiveFrom', async () => {
    const { service } = makeService();
    await expect(service.create({ ...baseDto, effectiveTo: '2025-12-31' }, 'admin-1')).rejects.toThrow(BadRequestException);
  });

  it('rejects GLOBAL scope with a scopeSlug set', async () => {
    const { service } = makeService();
    await expect(service.create({ ...baseDto, scopeSlug: 'japan' }, 'admin-1')).rejects.toThrow(BadRequestException);
  });

  it('rejects a non-GLOBAL scope with no scopeSlug', async () => {
    const { service } = makeService();
    await expect(service.create({ ...baseDto, scope: CostAssumptionScope.COUNTRY }, 'admin-1')).rejects.toThrow(BadRequestException);
  });

  it('404s with COUNTRY_NOT_FOUND for an unresolvable COUNTRY scopeSlug', async () => {
    const { service, prisma } = makeService();
    prisma.country.findFirst.mockResolvedValue(null);
    await expect(service.create({ ...baseDto, scope: CostAssumptionScope.COUNTRY, scopeSlug: 'nowhere' }, 'admin-1')).rejects.toThrow(NotFoundException);
  });

  it('resolves a real DESTINATION scopeSlug to its id and audits the creation inside the same transaction', async () => {
    const { service, prisma, audit } = makeService();
    prisma.destination.findFirst.mockResolvedValue({ id: 'dest-1' });
    prisma.costAssumption.create.mockResolvedValue({ id: 'ca1' });

    await service.create({ ...baseDto, scope: CostAssumptionScope.DESTINATION, scopeSlug: 'gion' }, 'admin-1');

    expect(prisma.costAssumption.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ scope: CostAssumptionScope.DESTINATION, scopeId: 'dest-1' }) }));
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'costAssumption.created', entityType: 'TRIP_COST_ASSUMPTION' }), prisma);
  });

  it('rejects an exact-identity duplicate even for GLOBAL scope (Postgres does not enforce this via the unique index because scopeId is null)', async () => {
    const { service, prisma } = makeService();
    prisma.costAssumption.findFirst.mockResolvedValue({ id: 'existing-ca' });
    await expect(service.create(baseDto, 'admin-1')).rejects.toThrow(ConflictException);
    expect(prisma.costAssumption.findFirst).toHaveBeenCalledWith({
      where: { scope: CostAssumptionScope.GLOBAL, scopeId: null, category: baseDto.category, unit: baseDto.unit, effectiveFrom: new Date(baseDto.effectiveFrom) },
    });
    expect(prisma.costAssumption.create).not.toHaveBeenCalled();
  });
});

describe('CostAssumptionsService.update', () => {
  const existing = {
    id: 'ca1',
    lowAmount: { toString: () => '100000' },
    typicalAmount: { toString: () => '150000' },
    highAmount: { toString: () => '200000' },
    effectiveFrom: new Date('2026-01-01'),
    effectiveTo: null,
  };

  it('404s when the assumption does not exist', async () => {
    const { service, prisma } = makeService();
    prisma.costAssumption.findUnique.mockResolvedValue(null);
    await expect(service.update('ca1', { source: 'x' }, 'admin-1')).rejects.toThrow(NotFoundException);
  });

  it('re-validates the amount range using the merged (existing + patch) values', async () => {
    const { service, prisma } = makeService();
    prisma.costAssumption.findUnique.mockResolvedValue(existing);
    await expect(service.update('ca1', { highAmount: '50000' }, 'admin-1')).rejects.toThrow(BadRequestException);
  });

  it('increments version and audits the update inside the same transaction', async () => {
    const { service, prisma, audit } = makeService();
    prisma.costAssumption.findUnique.mockResolvedValue(existing);
    prisma.costAssumption.update.mockResolvedValue({ ...existing, source: 'updated' });

    await service.update('ca1', { source: 'updated' }, 'admin-1');

    expect(prisma.costAssumption.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ version: { increment: 1 } }) }));
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'costAssumption.updated' }), prisma);
  });
});

describe('CostAssumptionsService.setStatus (spec section 97 - forward-only)', () => {
  it('allows DRAFT -> ACTIVE', async () => {
    const { service, prisma } = makeService();
    prisma.costAssumption.findUnique.mockResolvedValue({ id: 'ca1', status: CostAssumptionStatus.DRAFT });
    prisma.costAssumption.update.mockResolvedValue({ id: 'ca1', status: CostAssumptionStatus.ACTIVE });
    await expect(service.setStatus('ca1', { status: CostAssumptionStatus.ACTIVE }, 'admin-1')).resolves.toBeDefined();
  });

  it('allows DRAFT -> RETIRED directly (retiring a mistaken draft)', async () => {
    const { service, prisma } = makeService();
    prisma.costAssumption.findUnique.mockResolvedValue({ id: 'ca1', status: CostAssumptionStatus.DRAFT });
    prisma.costAssumption.update.mockResolvedValue({ id: 'ca1', status: CostAssumptionStatus.RETIRED });
    await expect(service.setStatus('ca1', { status: CostAssumptionStatus.RETIRED }, 'admin-1')).resolves.toBeDefined();
  });

  it('rejects ACTIVE -> DRAFT (never backward)', async () => {
    const { service, prisma } = makeService();
    prisma.costAssumption.findUnique.mockResolvedValue({ id: 'ca1', status: CostAssumptionStatus.ACTIVE });
    await expect(service.setStatus('ca1', { status: CostAssumptionStatus.DRAFT }, 'admin-1')).rejects.toThrow(BadRequestException);
  });

  it('rejects RETIRED -> anything (terminal state)', async () => {
    const { service, prisma } = makeService();
    prisma.costAssumption.findUnique.mockResolvedValue({ id: 'ca1', status: CostAssumptionStatus.RETIRED });
    await expect(service.setStatus('ca1', { status: CostAssumptionStatus.ACTIVE }, 'admin-1')).rejects.toThrow(BadRequestException);
  });
});

describe('CostAssumptionsService.list', () => {
  it('filters by scope/category/status and paginates', async () => {
    const { service, prisma } = makeService();
    prisma.costAssumption.count.mockResolvedValue(0);
    prisma.costAssumption.findMany.mockResolvedValue([]);
    await service.list({ page: 2, pageSize: 10, scope: CostAssumptionScope.GLOBAL } as any);
    expect(prisma.costAssumption.count).toHaveBeenCalledWith({ where: { scope: CostAssumptionScope.GLOBAL, category: undefined, status: undefined } });
  });
});
