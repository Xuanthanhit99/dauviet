import { Injectable } from '@nestjs/common';
import { EntityKind, IngestionCandidateType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NormalizedCandidate } from './adapters/adapter.types';

/** Diacritic-insensitive, case-insensitive, punctuation-collapsed name key - used ONLY as a matching signal, never as proof of identity by itself (spec section 25/84). */
export function normalizeNameKey(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export interface ResolutionSignals {
  nameMatches: { entityType: EntityKind; entityId: string; slug: string; matchedName: string }[];
  identityMatch: { entityType: EntityKind; entityId: string } | null;
}

export interface ResolutionDecision {
  outcome: 'EXACT_MATCH' | 'HIGH_CONFIDENCE_MATCH' | 'AMBIGUOUS' | 'NO_MATCH' | 'CONFLICT';
  matchedEntityType: EntityKind | null;
  matchedEntityId: string | null;
  signals: ResolutionSignals;
  autoResolved: boolean;
}

const CANDIDATE_TYPE_TO_ENTITY_KIND: Partial<Record<IngestionCandidateType, EntityKind>> = {
  COUNTRY: EntityKind.COUNTRY,
  CITY: EntityKind.CITY,
  DESTINATION: EntityKind.DESTINATION,
  PLACE: EntityKind.PLACE,
  PERSON: EntityKind.PERSON,
  EVENT: EntityKind.EVENT,
};

/**
 * Deterministic entity resolution (spec sections 25-27/84). Signals are
 * combined, never a single one trusted alone:
 * - an EXISTING ExternalEntityIdentity already resolved for this exact
 *   (sourceId, externalId) is the only signal that alone yields EXACT_MATCH
 *   (re-running the same bounded ingestion is idempotent - spec section 36).
 * - otherwise, normalized-name equality against canonical translations/
 *   aliases is the primary signal. Exactly one candidate-type-compatible
 *   match -> HIGH_CONFIDENCE_MATCH (never EXACT_MATCH - a name match alone
 *   is never treated as proof of identity, spec section 27). Zero matches
 *   -> NO_MATCH. More than one distinct canonical entity matching the same
 *   normalized name -> AMBIGUOUS (spec section 84's required proof - name
 *   similarity alone must never auto-merge).
 *
 * Only EXACT_MATCH is ever auto-resolved; HIGH_CONFIDENCE_MATCH still
 * requires human confirmation before promotion (candidate status stays
 * NEEDS_REVIEW either way - see IngestionCandidatesService).
 */
@Injectable()
export class EntityResolutionService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(params: { sourceId: string; externalId: string; candidate: NormalizedCandidate }): Promise<ResolutionDecision> {
    const { sourceId, externalId, candidate } = params;

    const existingIdentity = await this.prisma.externalEntityIdentity.findUnique({
      where: { sourceId_externalId: { sourceId, externalId } },
    });
    if (existingIdentity?.resolvedEntityId) {
      return {
        outcome: 'EXACT_MATCH',
        matchedEntityType: existingIdentity.entityType,
        matchedEntityId: existingIdentity.resolvedEntityId,
        signals: { nameMatches: [], identityMatch: { entityType: existingIdentity.entityType, entityId: existingIdentity.resolvedEntityId } },
        autoResolved: true,
      };
    }

    const entityKind = CANDIDATE_TYPE_TO_ENTITY_KIND[candidate.candidateType];
    if (!entityKind) {
      return { outcome: 'NO_MATCH', matchedEntityType: null, matchedEntityId: null, signals: { nameMatches: [], identityMatch: null }, autoResolved: false };
    }

    const nameVariants = new Set<string>();
    for (const label of Object.values(candidate.normalizedData.labels)) {
      if (label) nameVariants.add(normalizeNameKey(label));
    }
    for (const list of Object.values(candidate.normalizedData.aliases)) {
      for (const alias of list ?? []) nameVariants.add(normalizeNameKey(alias));
    }
    nameVariants.delete('');

    const nameMatches = await this.findNameMatches(entityKind, nameVariants);

    const distinctEntities = new Map(nameMatches.map((m) => [`${m.entityType}:${m.entityId}`, m]));
    if (distinctEntities.size === 0) {
      return { outcome: 'NO_MATCH', matchedEntityType: null, matchedEntityId: null, signals: { nameMatches, identityMatch: null }, autoResolved: false };
    }
    if (distinctEntities.size > 1) {
      return { outcome: 'AMBIGUOUS', matchedEntityType: null, matchedEntityId: null, signals: { nameMatches, identityMatch: null }, autoResolved: false };
    }
    const [only] = distinctEntities.values();
    return {
      outcome: 'HIGH_CONFIDENCE_MATCH',
      matchedEntityType: only.entityType,
      matchedEntityId: only.entityId,
      signals: { nameMatches, identityMatch: null },
      autoResolved: false,
    };
  }

  private async findNameMatches(entityKind: EntityKind, nameVariants: Set<string>): Promise<ResolutionSignals['nameMatches']> {
    if (nameVariants.size === 0) return [];
    const matches: ResolutionSignals['nameMatches'] = [];

    if (entityKind === EntityKind.PLACE) {
      const rows = await this.prisma.placeTranslation.findMany({
        include: { place: { select: { id: true, canonicalSlug: true } } },
      });
      for (const row of rows) {
        if (nameVariants.has(normalizeNameKey(row.name))) {
          matches.push({ entityType: EntityKind.PLACE, entityId: row.place.id, slug: row.place.canonicalSlug, matchedName: row.name });
        }
      }
    } else if (entityKind === EntityKind.CITY) {
      const rows = await this.prisma.cityTranslation.findMany({ include: { city: { select: { id: true, canonicalSlug: true } } } });
      for (const row of rows) {
        if (nameVariants.has(normalizeNameKey(row.name))) {
          matches.push({ entityType: EntityKind.CITY, entityId: row.city.id, slug: row.city.canonicalSlug, matchedName: row.name });
        }
      }
    } else if (entityKind === EntityKind.DESTINATION) {
      const rows = await this.prisma.destinationTranslation.findMany({ include: { destination: { select: { id: true, canonicalSlug: true } } } });
      for (const row of rows) {
        if (nameVariants.has(normalizeNameKey(row.name))) {
          matches.push({ entityType: EntityKind.DESTINATION, entityId: row.destination.id, slug: row.destination.canonicalSlug, matchedName: row.name });
        }
      }
    } else if (entityKind === EntityKind.COUNTRY) {
      const rows = await this.prisma.countryTranslation.findMany({ include: { country: { select: { id: true, iso2: true } } } });
      for (const row of rows) {
        if (nameVariants.has(normalizeNameKey(row.name))) {
          matches.push({ entityType: EntityKind.COUNTRY, entityId: row.country.id, slug: row.country.iso2, matchedName: row.name });
        }
      }
    }

    // EntityAlias is a cross-cutting signal for every entity kind (spec
    // section 24's alias table) - additive to translation-based matches.
    const aliasRows = await this.prisma.entityAlias.findMany({ where: { entityType: entityKind } });
    for (const row of aliasRows) {
      if (nameVariants.has(normalizeNameKey(row.alias))) {
        matches.push({ entityType: entityKind, entityId: row.entityId, slug: row.entityId, matchedName: row.alias });
      }
    }

    return matches;
  }
}
