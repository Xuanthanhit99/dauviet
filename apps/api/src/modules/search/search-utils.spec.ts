import { BadRequestException } from '@nestjs/common';
import { DateEra } from '@prisma/client';
import { cursorFingerprint, decodeCursor, encodeCursor, KIND_ORDER, SortKey } from './search-cursor.util';
import { resolvePeriod } from './search-period.util';
import { parseBbox } from '../../common/geo/bbox.util';
import { ORDINAL_FAR_FUTURE, ORDINAL_FAR_PAST, toChronologyYearEnd, toChronologyYearStart } from '../../common/historical-date/historical-date.util';

describe('search cursor (spec 32/33)', () => {
  const key: SortKey = { tier: 4, comm: 0, nameMiss: 0, negImportance: -9, localeMiss: 1, kindOrder: 5, entityId: 'abc' };

  it('round-trips a sort key for the query it was issued for', () => {
    const fp = cursorFingerprint({ nq: 'hoi an', locale: 'vi' });
    expect(decodeCursor(encodeCursor(fp, key), fp)).toEqual(key);
  });

  it('is bound to the exact query/filters/locale (a foreign fingerprint is rejected)', () => {
    const cursor = encodeCursor(cursorFingerprint({ nq: 'hoi an', locale: 'vi' }), key);
    expect(() => decodeCursor(cursor, cursorFingerprint({ nq: 'hoi an', locale: 'en' }))).toThrow(BadRequestException);
    expect(() => decodeCursor(cursor, cursorFingerprint({ nq: 'other', locale: 'vi' }))).toThrow(BadRequestException);
  });

  it.each([
    ['not base64 json', '@@@'],
    ['wrong version', Buffer.from(JSON.stringify({ v: 2, f: 'x', k: [1, 2, 3, 4, 5, 6, 'a'] })).toString('base64url')],
    ['wrong arity', Buffer.from(JSON.stringify({ v: 1, f: 'x', k: [1, 2] })).toString('base64url')],
    ['non-integer number', Buffer.from(JSON.stringify({ v: 1, f: 'x', k: [1.5, 0, 0, 0, 0, 1, 'a'] })).toString('base64url')],
    ['non-string id', Buffer.from(JSON.stringify({ v: 1, f: 'x', k: [1, 0, 0, 0, 0, 1, 7] })).toString('base64url')],
    ['huge id', Buffer.from(JSON.stringify({ v: 1, f: 'x', k: [1, 0, 0, 0, 0, 1, 'a'.repeat(200)] })).toString('base64url')],
  ])('rejects a tampered cursor: %s', (_label, cursor) => {
    expect(() => decodeCursor(cursor, 'x')).toThrow(BadRequestException);
  });

  it('every corpus kind has a distinct display order (total-order tie-break)', () => {
    const orders = Object.values(KIND_ORDER);
    expect(new Set(orders).size).toBe(orders.length);
  });
});

describe('resolvePeriod (spec 78-80)', () => {
  it('returns null when no period is requested', () => {
    expect(resolvePeriod({})).toBeNull();
  });

  it('converts an era-qualified range to chronology ordinals without any Date object (BCE-safe)', () => {
    const r = resolvePeriod({ fromYear: 300, fromEra: DateEra.BCE, toYear: 100, toEra: DateEra.BCE })!;
    expect(r.startOrdinal).toBe(toChronologyYearStart(300, DateEra.BCE));
    expect(r.endOrdinal).toBe(toChronologyYearEnd(100, DateEra.BCE));
    expect(r.startOrdinal).toBeLessThan(0);
  });

  it('orders BCE before CE by ordinal, never lexicographically', () => {
    const bce = resolvePeriod({ fromYear: 2, fromEra: DateEra.BCE, toYear: 1, toEra: DateEra.BCE })!;
    const ce = resolvePeriod({ fromYear: 1, toYear: 2 })!;
    expect(bce.endOrdinal).toBeLessThan(ce.startOrdinal);
  });

  it('treats a missing bound as open-ended (an explicit query choice)', () => {
    expect(resolvePeriod({ fromYear: 1000 })!.endOrdinal).toBe(ORDINAL_FAR_FUTURE);
    expect(resolvePeriod({ toYear: 1000 })!.startOrdinal).toBe(ORDINAL_FAR_PAST);
  });

  it('defaults to CE when no era is given', () => {
    expect(resolvePeriod({ fromYear: 1010, toYear: 1010 })).toEqual({ startOrdinal: toChronologyYearStart(1010, DateEra.CE), endOrdinal: toChronologyYearEnd(1010, DateEra.CE) });
  });

  it.each([
    ['start after end', { fromYear: 1300, toYear: 1200 }],
    ['CE year beyond the model range', { fromYear: 10000 }],
    ['BCE year beyond the model range', { fromYear: 100001, fromEra: DateEra.BCE }],
    ['year zero', { fromYear: 0 }],
    ['era without a year', { fromEra: DateEra.BCE }],
  ])('rejects %s', (_label, input) => {
    expect(() => resolvePeriod(input as any)).toThrow(BadRequestException);
  });
});

describe('parseBbox (spec 46)', () => {
  it('parses west,south,east,north', () => {
    expect(parseBbox('105.7,20.9,105.9,21.1', 'X')).toEqual({ minLng: 105.7, minLat: 20.9, maxLng: 105.9, maxLat: 21.1 });
  });

  it('explicitly rejects an antimeridian-crossing bbox (west > east) instead of mis-querying it', () => {
    expect(() => parseBbox('170,-10,-170,10', 'X')).toThrow(/antimeridian/);
  });

  it.each(['', undefined, '1,2,3', 'a,b,c,d', '0,0,1,NaN', '-181,0,10,10', '0,-91,10,10', '0,0,181,10', '0,0,10,91', '5,5,5,10', '0,10,10,5'])('rejects %p', (bbox) => {
    expect(() => parseBbox(bbox as string | undefined, 'X')).toThrow(BadRequestException);
  });

  it('uses the caller-supplied error code', () => {
    try {
      parseBbox('bad', 'SEARCH_INVALID_BBOX');
    } catch (e) {
      expect(((e as BadRequestException).getResponse() as any).code).toBe('SEARCH_INVALID_BBOX');
    }
  });
});
