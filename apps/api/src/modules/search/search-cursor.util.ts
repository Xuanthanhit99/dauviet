import { createHash } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { SearchEntityKind } from '@prisma/client';
import { DISCOVERY_ERROR_CODES } from '../../common/errors/discovery-error-codes';

/**
 * Total, deterministic display order of the kinds inside an otherwise equal
 * ranking position (the last-but-one tie-break; `entityId` is the last).
 */
export const KIND_ORDER: Record<SearchEntityKind, number> = {
  COUNTRY: 1,
  REGION: 2,
  CITY: 3,
  DESTINATION: 4,
  PLACE: 5,
  PERSON: 6,
  EVENT: 7,
  ERA: 8,
  DYNASTY: 9,
  TERRITORY: 10,
  THEME: 11,
  STORY: 12,
  JOURNEY: 13,
  SOURCE: 14,
  COMMUNITY_STORY: 15,
};

/** Every sort column is ASCENDING (importance is stored negated), so a keyset row comparison is exact. */
export interface SortKey {
  tier: number;
  comm: number;
  nameMiss: number;
  negImportance: number;
  localeMiss: number;
  kindOrder: number;
  entityId: string;
}

const KEY_FIELDS: Array<keyof SortKey> = ['tier', 'comm', 'nameMiss', 'negImportance', 'localeMiss', 'kindOrder', 'entityId'];

/** Binds a cursor to one exact query so it cannot be replayed against different text/filters/locale. */
export function cursorFingerprint(parts: unknown): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 16);
}

export function encodeCursor(fingerprint: string, key: SortKey): string {
  return Buffer.from(JSON.stringify({ v: 1, f: fingerprint, k: KEY_FIELDS.map((f) => key[f]) })).toString('base64url');
}

const invalid = () => new BadRequestException({ code: DISCOVERY_ERROR_CODES.SEARCH_INVALID_CURSOR, message: 'cursor is invalid or does not belong to this query.' });

export function decodeCursor(cursor: string, fingerprint: string): SortKey {
  let parsed: any;
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw invalid();
  }
  if (!parsed || parsed.v !== 1 || parsed.f !== fingerprint || !Array.isArray(parsed.k) || parsed.k.length !== KEY_FIELDS.length) throw invalid();
  const numeric = parsed.k.slice(0, 6);
  const id = parsed.k[6];
  if (!numeric.every((n: unknown) => Number.isInteger(n) && Math.abs(n as number) < 1e9) || typeof id !== 'string' || id.length === 0 || id.length > 128) throw invalid();
  const [tier, comm, nameMiss, negImportance, localeMiss, kindOrder] = numeric as number[];
  return { tier, comm, nameMiss, negImportance, localeMiss, kindOrder, entityId: id };
}
