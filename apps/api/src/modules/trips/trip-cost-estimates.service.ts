import { Injectable } from '@nestjs/common';
import { CostCategory, Prisma, Trip, TripDay, TripDestination, TripItem, TripItemType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ProviderRegistryService } from '../providers/provider-registry.service';
import { TripsService } from './trips.service';
import { resolveComponent } from './cost-engine/resolve-component';
import { aggregateEstimate } from './cost-engine/aggregate-estimate';
import { computeInputHash } from './cost-engine/input-hash';
import { COST_SCENARIOS, EstimateLineItem, OfferEvidence, ResolvedComponent, UnitQuantities } from './cost-engine/types';
import { AssumptionScopeContext, resolveAssumptionCandidates } from './resolve-assumption-candidates';

/**
 * Input to `resolveOfferEvidence` - a discriminated union so a STAY lookup
 * can never accidentally be called with activity-shaped occupancy fields
 * (participants) or vice versa (spec section 257-269's "context integrity"
 * requirement).
 */
type OfferEvidenceLookup =
  | { kind: 'STAY'; accommodationId: string | null; date: string; currency: string; guests: number; rooms: number }
  | { kind: 'ACTIVITY'; activityId: string | null; date: string; currency: string; participants: number };

/** Bumped only if the calculation semantics themselves change (spec section 47) - never for unrelated code changes. Persisted on every generation so a historical estimate stays interpretable after a future algorithm change. */
const ENGINE_VERSION = 'g06-v1';

type DestinationGeoRow = { id: string; countryId: string; regionId: string | null; cityId: string | null };

/**
 * Orchestrates the deterministic Cost Engine (pre-implementation report
 * section 3.5/3.5.2) - this file is the only place in G06 that touches both
 * Prisma AND the pure `cost-engine/` core; the core itself stays DB-free
 * (spec section 101). STAY/ACTIVITY line items resolve fresh G05 offer
 * evidence via `resolveOfferEvidence` (recovery spec gates 257-269), gated
 * through `ProviderRegistryService` exactly like G05's own read paths; every
 * other category, and STAY/ACTIVITY items with no eligible offer, still
 * degrade correctly to USER_INPUT/RULE_BASED_ESTIMATE/UNKNOWN per the
 * engine's own precedence rules (never a placeholder that fabricates a
 * number).
 */
@Injectable()
export class TripCostEstimatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly trips: TripsService,
    private readonly registry: ProviderRegistryService,
  ) {}

  private toDateOnly(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private quantitiesFor(trip: Trip): UnitQuantities {
    // Every line item below represents exactly one occurrence (one night,
    // one day, one leg) by construction (pre-implementation report section
    // 3.5.2) - `nights`/`days` are always 1 here; a multi-night stay or
    // multi-day trip is simply multiple line items, never one item scaled
    // by a larger count.
    return { travelerCount: trip.travelerCount, roomCount: trip.roomCount ?? 1, nights: 1, days: 1 };
  }

  /**
   * A `TripDay`'s location context (pre-implementation report section
   * 3.5.2): the first `TripDestination` (by `sortOrder`) whose
   * `[arrivalDate, departureDate]` covers this day, or the trip's first
   * `TripDestination` overall if none has matching dates, or `{}` (GLOBAL
   * only) if the trip has no destinations yet. Overlapping destinations on
   * the same day are not blended - first by `sortOrder` wins, deliberately.
   */
  private scopeContextForDay(day: TripDay, destinations: (TripDestination & { destination: DestinationGeoRow })[]): AssumptionScopeContext {
    const dateStr = this.toDateOnly(day.date);
    const covering = destinations.find((d) => {
      if (!d.arrivalDate || !d.departureDate) return false;
      const arrival = this.toDateOnly(d.arrivalDate);
      const departure = this.toDateOnly(d.departureDate);
      return dateStr >= arrival && dateStr <= departure;
    });
    const chosen = covering ?? destinations[0];
    if (!chosen) return {};
    return { destinationId: chosen.destination.id, countryId: chosen.destination.countryId, regionId: chosen.destination.regionId, cityId: chosen.destination.cityId };
  }

  private userOverride(amount: Prisma.Decimal | null, currency: string | null, targetCurrency: string) {
    if (amount === null) return undefined;
    return { amount, currency: currency ?? targetCurrency };
  }

  /**
   * The minimum G05 provider-evidence resolver (recovery spec gates
   * 257-269): STAY/ACTIVITY line items only, gated through
   * `ProviderRegistryService.getExecutionContext` exactly like G05's own
   * `AccommodationsService.getOffers`/`ActivitiesService.getOffers` (the
   * SERVE-time re-check, never cached - a license revoked or a provider
   * suspended after ingestion blocks the very next calculation, spec
   * section 20/42/43/106). Fails closed per reference, mirroring the exact
   * `if (!access.ok) continue` isolation those two services already use -
   * one bad/unlicensed reference never fails the whole estimate. Never
   * calls a real external provider and never persists raw offer payloads
   * or secrets; only `{offerId, amount, currency}` crosses into the pure
   * cost-engine core. An offer whose `currency` does not exactly equal the
   * caller's `currency` (trip's target currency) is simply not matched by
   * the query below - this is what keeps "currency mismatch is never
   * converted" true without any special-case branch (the query IS the
   * gate). FOOD/TRANSPORT/CUSTOM/PLACE/ATTRACTION never have G05 offer
   * evidence (no `ProviderActivityReference.attractionId`/restaurant-offer
   * linkage exists), and correctly resolve via `undefined` -> the caller's
   * `resolveComponent` degrades to CostAssumption/UNKNOWN, never zero.
   */
  private async resolveOfferEvidence(input: OfferEvidenceLookup): Promise<OfferEvidence | undefined> {
    const now = new Date();

    if (input.kind === 'STAY') {
      if (!input.accommodationId) return undefined;
      const references = await this.prisma.providerAccommodationReference.findMany({
        where: { accommodationId: input.accommodationId, status: 'ACTIVE' },
        include: { provider: true },
      });
      const checkInDate = new Date(`${input.date}T00:00:00.000Z`);
      const checkOutDate = new Date(checkInDate);
      checkOutDate.setUTCDate(checkOutDate.getUTCDate() + 1);

      for (const reference of references) {
        const access = await this.registry.getExecutionContext({ providerCode: reference.provider.code, environment: 'SANDBOX', capability: 'LIVE_PRICE', usage: 'display' });
        if (!access.ok) continue; // suspended integration / revoked or expired license / missing attribution all fail closed here, per-reference
        const offer = await this.prisma.accommodationOffer.findFirst({
          where: { providerReferenceId: reference.id, checkInDate, checkOutDate, currency: input.currency, guests: { gte: input.guests }, rooms: { gte: input.rooms } },
          orderBy: { fetchedAt: 'desc' },
        });
        if (!offer) continue;
        if (offer.expiresAt && offer.expiresAt <= now) continue; // an expired offer is never presented as current (matches G05's own convention)
        return { offerId: offer.id, amount: offer.amount, currency: offer.currency };
      }
      return undefined;
    }

    if (!input.activityId) return undefined;
    const references = await this.prisma.providerActivityReference.findMany({
      where: { activityId: input.activityId, status: 'ACTIVE' },
      include: { provider: true },
    });
    const activityDate = new Date(`${input.date}T00:00:00.000Z`);

    for (const reference of references) {
      const access = await this.registry.getExecutionContext({ providerCode: reference.provider.code, environment: 'SANDBOX', capability: 'LIVE_PRICE', usage: 'display' });
      if (!access.ok) continue;
      const offer = await this.prisma.activityOffer.findFirst({
        where: { providerReferenceId: reference.id, activityDate, currency: input.currency, participants: { gte: input.participants } },
        orderBy: { fetchedAt: 'desc' },
      });
      if (!offer) continue;
      if (offer.expiresAt && offer.expiresAt <= now) continue;
      return { offerId: offer.id, amount: offer.amount, currency: offer.currency };
    }
    return undefined;
  }

  async generate(tripId: string, ownerId: string) {
    const trip = await this.trips.getOwnedActiveOrThrow(tripId, ownerId);

    const [tripDestinationRows, days, items, transportLegs] = await Promise.all([
      this.prisma.tripDestination.findMany({
        where: { tripId },
        orderBy: { sortOrder: 'asc' },
        include: { destination: { select: { id: true, countryId: true, regionId: true, cityId: true } } },
      }),
      this.prisma.tripDay.findMany({ where: { tripId }, orderBy: { date: 'asc' } }),
      this.prisma.tripItem.findMany({ where: { tripId } }),
      this.prisma.tripTransportLeg.findMany({ where: { tripId } }),
    ]);

    const legDestinationIds = [...new Set(transportLegs.flatMap((leg) => [leg.fromDestinationId, leg.toDestinationId]).filter((id): id is string => id !== null))];
    const legDestinations = legDestinationIds.length
      ? await this.prisma.destination.findMany({ where: { id: { in: legDestinationIds } }, select: { id: true, countryId: true, regionId: true, cityId: true } })
      : [];
    const legDestinationById = new Map(legDestinations.map((d) => [d.id, d]));

    const quantities = this.quantitiesFor(trip);
    const targetCurrency = trip.primaryCurrency;
    const dayById = new Map(days.map((d) => [d.id, d]));
    const itemsByDay = new Map<string, TripItem[]>();
    for (const item of items) {
      itemsByDay.set(item.tripDayId, [...(itemsByDay.get(item.tripDayId) ?? []), item]);
    }

    const lineItems: EstimateLineItem[] = [];

    // STAY (per ACCOMMODATION TripItem) and ACTIVITY (per ACTIVITY/ATTRACTION TripItem).
    for (const item of items) {
      const day = dayById.get(item.tripDayId);
      if (!day) continue;
      const scopeContext = this.scopeContextForDay(day, tripDestinationRows);
      const dateStr = this.toDateOnly(day.date);

      if (item.type === TripItemType.ACCOMMODATION) {
        const [candidates, offer] = await Promise.all([
          resolveAssumptionCandidates(this.prisma, CostCategory.STAY, dateStr, scopeContext),
          this.resolveOfferEvidence({ kind: 'STAY', accommodationId: item.accommodationId, date: dateStr, currency: targetCurrency, guests: quantities.travelerCount, rooms: quantities.roomCount }),
        ]);
        const resolved = resolveComponent({
          userOverride: this.userOverride(item.plannedAmount, item.plannedCurrency, targetCurrency),
          offer,
          assumptionCandidates: candidates,
          quantities,
        });
        lineItems.push({ category: CostCategory.STAY, targetCurrency, resolved, tripDayId: item.tripDayId, tripItemId: item.id });
      } else if (item.type === TripItemType.ACTIVITY || item.type === TripItemType.ATTRACTION) {
        // Note: `ProviderActivityReference` links only to `Activity`, never
        // `Attraction` (no G05 provider-offer model exists for attractions)
        // - an ATTRACTION-type item's `activityId` is always null here, so
        // `resolveOfferEvidence` correctly returns `undefined` for it and
        // this line degrades to CostAssumption/UNKNOWN, exactly as it did
        // before this resolver existed.
        const [candidates, offer] = await Promise.all([
          resolveAssumptionCandidates(this.prisma, CostCategory.ACTIVITY, dateStr, scopeContext),
          this.resolveOfferEvidence({ kind: 'ACTIVITY', activityId: item.activityId, date: dateStr, currency: targetCurrency, participants: quantities.travelerCount }),
        ]);
        const resolved = resolveComponent({
          userOverride: this.userOverride(item.plannedAmount, item.plannedCurrency, targetCurrency),
          offer,
          assumptionCandidates: candidates,
          quantities,
        });
        lineItems.push({ category: CostCategory.ACTIVITY, targetCurrency, resolved, tripDayId: item.tripDayId, tripItemId: item.id });
      }
    }

    // FOOD (one line per TripDay - priced RESTAURANT items win, else a day-level assumption fallback, never both) and local TRANSPORT (one line per TripDay, always assumption-only).
    for (const day of days) {
      const scopeContext = this.scopeContextForDay(day, tripDestinationRows);
      const dateStr = this.toDateOnly(day.date);
      const dayItems = itemsByDay.get(day.id) ?? [];
      const pricedRestaurantItems = dayItems.filter((i) => i.type === TripItemType.RESTAURANT && i.plannedAmount !== null);

      let foodResolved: ResolvedComponent;
      if (pricedRestaurantItems.length > 0) {
        const currency = pricedRestaurantItems[0].plannedCurrency ?? targetCurrency;
        const total = pricedRestaurantItems.reduce((sum, i) => sum.plus(i.plannedAmount as Prisma.Decimal), new Prisma.Decimal(0));
        foodResolved = {
          provenance: 'USER_INPUT',
          currency,
          amounts: COST_SCENARIOS.reduce((acc, s) => ({ ...acc, [s]: total }), {} as ResolvedComponent['amounts']),
          assumptionId: null,
          assumptionScope: null,
          offerId: null,
        };
      } else {
        const candidates = await resolveAssumptionCandidates(this.prisma, CostCategory.FOOD, dateStr, scopeContext);
        foodResolved = resolveComponent({ assumptionCandidates: candidates, quantities });
      }
      lineItems.push({ category: CostCategory.FOOD, targetCurrency, resolved: foodResolved, tripDayId: day.id, description: 'Food (day total)' });

      const localTransportCandidates = await resolveAssumptionCandidates(this.prisma, CostCategory.TRANSPORT, dateStr, scopeContext);
      const localTransportResolved = resolveComponent({ assumptionCandidates: localTransportCandidates, quantities });
      lineItems.push({ category: CostCategory.TRANSPORT, targetCurrency, resolved: localTransportResolved, tripDayId: day.id, description: 'Local transport' });
    }

    // TRANSPORT (per TripTransportLeg - inter-destination movement, separate from local transport above).
    const tripStartDate = this.toDateOnly(trip.startDate);
    for (const leg of transportLegs) {
      const fromGeo = leg.fromDestinationId ? legDestinationById.get(leg.fromDestinationId) : undefined;
      const toGeo = leg.toDestinationId ? legDestinationById.get(leg.toDestinationId) : undefined;
      const geo = fromGeo ?? toGeo;
      const scopeContext: AssumptionScopeContext = geo ? { destinationId: geo.id, countryId: geo.countryId, regionId: geo.regionId, cityId: geo.cityId } : {};
      const dateStr = leg.plannedDate ? this.toDateOnly(leg.plannedDate) : tripStartDate;

      const candidates = await resolveAssumptionCandidates(this.prisma, CostCategory.TRANSPORT, dateStr, scopeContext);
      const resolved = resolveComponent({
        userOverride: this.userOverride(leg.plannedAmount, leg.plannedCurrency, targetCurrency),
        assumptionCandidates: candidates,
        quantities,
      });
      lineItems.push({ category: CostCategory.TRANSPORT, targetCurrency, resolved, transportLegId: leg.id, description: `${leg.fromLabel} -> ${leg.toLabel}` });
    }

    const aggregated = aggregateEstimate(targetCurrency, lineItems);
    const inputHash = computeInputHash({
      tripId,
      tripVersion: trip.version,
      engineVersion: ENGINE_VERSION,
      lineItems: lineItems.map((li) => ({
        category: li.category,
        tripDayId: li.tripDayId ?? null,
        tripItemId: li.tripItemId ?? null,
        transportLegId: li.transportLegId ?? null,
        provenance: li.resolved.provenance,
        currency: li.resolved.currency,
        amounts: li.resolved.amounts,
        assumptionId: li.resolved.assumptionId,
        offerId: li.resolved.offerId,
      })),
    });

    return this.persistGeneration(tripId, ownerId, trip.version, inputHash, lineItems, aggregated);
  }

  /** Idempotent on `[tripId, inputHash, engineVersion]` (spec section 93) - an identical recalculation returns the existing generation rather than creating a duplicate. Atomic: all 3 scenarios + every item write in one transaction (spec section 92) - a failure on HIGH rolls back LOW/TYPICAL too. */
  private async persistGeneration(
    tripId: string,
    ownerId: string,
    tripVersion: number,
    inputHash: string,
    lineItems: EstimateLineItem[],
    aggregated: ReturnType<typeof aggregateEstimate>,
  ) {
    const existing = await this.prisma.tripCostEstimateGeneration.findUnique({
      where: { tripId_inputHash_engineVersion: { tripId, inputHash, engineVersion: ENGINE_VERSION } },
      include: { estimates: { include: { items: true }, orderBy: { scenario: 'asc' } } },
    });
    if (existing) return existing;

    return this.prisma.$transaction(async (tx) => {
      const generation = await tx.tripCostEstimateGeneration.create({ data: { tripId, tripVersion, inputHash, engineVersion: ENGINE_VERSION } });

      for (const scenario of COST_SCENARIOS) {
        const scenarioTotal = aggregated.scenarios[scenario];
        const estimate = await tx.tripCostEstimate.create({
          data: {
            generationId: generation.id,
            scenario,
            currency: scenarioTotal.currency,
            totalAmount: scenarioTotal.totalAmount,
            completeness: scenarioTotal.completeness,
            confidence: scenarioTotal.confidence,
            unknownCount: scenarioTotal.unknownCount,
          },
        });
        await tx.tripCostEstimateItem.createMany({
          data: lineItems.map((li) => ({
            estimateId: estimate.id,
            category: li.category,
            tripDayId: li.tripDayId,
            tripItemId: li.tripItemId,
            transportLegId: li.transportLegId,
            currency: li.resolved.currency,
            amount: li.resolved.amounts[scenario],
            provenance: li.resolved.provenance,
            assumptionId: li.resolved.assumptionId,
            offerId: li.resolved.offerId,
            description: li.description,
          })),
        });
      }

      await this.audit.log({ actorId: ownerId, action: 'trip.estimate.generated', entityType: 'TRIP', entityId: tripId, metadata: { inputHash } }, tx);

      return tx.tripCostEstimateGeneration.findUniqueOrThrow({
        where: { id: generation.id },
        include: { estimates: { include: { items: true }, orderBy: { scenario: 'asc' } } },
      });
    });
  }

  /** Bounded history list (spec section 88) - newest first. */
  async list(tripId: string, ownerId: string, page: number, pageSize: number) {
    await this.trips.getOwnedOrThrow(tripId, ownerId);
    const where = { tripId };
    const [total, generations] = await this.prisma.$transaction([
      this.prisma.tripCostEstimateGeneration.count({ where }),
      this.prisma.tripCostEstimateGeneration.findMany({
        where,
        orderBy: { calculatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { estimates: { orderBy: { scenario: 'asc' } } },
      }),
    ]);
    return { items: generations, total, page, pageSize };
  }

  async latest(tripId: string, ownerId: string) {
    await this.trips.getOwnedOrThrow(tripId, ownerId);
    return this.prisma.tripCostEstimateGeneration.findFirst({
      where: { tripId },
      orderBy: { calculatedAt: 'desc' },
      include: { estimates: { include: { items: true }, orderBy: { scenario: 'asc' } } },
    });
  }
}
