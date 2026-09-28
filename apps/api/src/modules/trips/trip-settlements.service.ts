import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityKind } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TRIP_ERROR_CODES } from '../../common/errors/trip-error-codes';
import { TripAuthorizationService, TripCapability } from './trip-authorization.service';
import { TripCollaborationEventService } from './trip-collaboration-event.service';
import { CreateTripSettlementDto, ListTripSettlementsQueryDto } from './dto/trip-expense.dto';
import { isPositive, parseMoney } from './split-money.util';
import { isCurrentTripParticipant, lockTripAndAssertMutable, withDeadlockRetry } from './trip-financial-guard.util';

/**
 * User-declared external settlements (spec sections 46-51) - "money was
 * settled outside Dấu Việt," never a payment transaction. Append-only: no
 * edit/delete route exists (see the model's own doc comment in
 * `schema.prisma`). Same transaction-internal re-validation discipline as
 * `TripExpensesService` (spec sections 36-38).
 */
@Injectable()
export class TripSettlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly authz: TripAuthorizationService,
    private readonly collaborationEvents: TripCollaborationEventService,
  ) {}

  async create(tripId: string, actorId: string, dto: CreateTripSettlementDto) {
    await this.authz.authorize(tripId, actorId, TripCapability.EDIT_TRIP);

    if (dto.fromUserId === dto.toUserId) {
      throw new BadRequestException({ code: TRIP_ERROR_CODES.TRIP_SETTLEMENT_INVALID, message: 'fromUserId and toUserId must differ.' });
    }
    let amount;
    try {
      amount = parseMoney(dto.amount);
    } catch {
      throw new BadRequestException({ code: TRIP_ERROR_CODES.TRIP_SETTLEMENT_INVALID, message: `"${dto.amount}" is not a valid amount.` });
    }
    if (!isPositive(amount)) {
      throw new BadRequestException({ code: TRIP_ERROR_CODES.TRIP_SETTLEMENT_INVALID, message: 'amount must be greater than 0.' });
    }

    return withDeadlockRetry(() =>
      this.prisma.$transaction(async (tx) => {
        const trip = await lockTripAndAssertMutable(tx, tripId, actorId);

        for (const userId of [dto.fromUserId, dto.toUserId]) {
          if (!(await isCurrentTripParticipant(tx, tripId, trip.ownerId, userId))) {
            throw new BadRequestException({ code: TRIP_ERROR_CODES.TRIP_SETTLEMENT_INVALID, message: `${userId} is not a current accepted participant of this trip.` });
          }
        }

        const settlement = await tx.tripSettlement.create({
          data: {
            tripId,
            fromUserId: dto.fromUserId,
            toUserId: dto.toUserId,
            amount,
            currency: dto.currency,
            settledAt: new Date(dto.settledAt),
            note: dto.note,
            createdByUserId: actorId,
          },
        });

        await this.audit.log(
          {
            actorId,
            action: 'tripSettlement.created',
            entityType: EntityKind.TRIP_SETTLEMENT,
            entityId: settlement.id,
            metadata: { currency: dto.currency, amount: amount.toString(), fromUserId: dto.fromUserId, toUserId: dto.toUserId },
          },
          tx,
        );
        await this.collaborationEvents.record({ tripId, type: 'SETTLEMENT_RECORDED', actorUserId: actorId, metadata: { currency: dto.currency } }, tx);

        return settlement;
      }),
    );
  }

  async list(tripId: string, actorId: string, query: ListTripSettlementsQueryDto) {
    await this.authz.authorize(tripId, actorId, TripCapability.VIEW_TRIP);
    const where = { tripId };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.tripSettlement.count({ where }),
      this.prisma.tripSettlement.findMany({
        where,
        orderBy: [{ settledAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }
}
