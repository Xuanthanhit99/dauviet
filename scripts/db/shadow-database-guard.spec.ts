// Regression test for the G06.5-incident safety guard (see
// docs/backend/G06_5_FINAL_REPORT.md's Incident Log). Run with:
//   npx tsx --test scripts/db/shadow-database-guard.spec.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertDistinctDatabaseTargets,
  parseDatabaseTarget,
  ShadowDatabaseSameAsRealError,
  InvalidDatabaseUrlError,
} from './shadow-database-guard';

const REAL = 'postgresql://dauviet:secret@localhost:55432/dauviet?schema=public';

test('throws when shadow URL is byte-identical to the real URL (the exact incident)', () => {
  assert.throws(() => assertDistinctDatabaseTargets(REAL, REAL), ShadowDatabaseSameAsRealError);
});

test('throws when shadow URL is the same target with different credentials/query order', () => {
  const sameTargetDifferentCreds = 'postgresql://otheruser:otherpass@localhost:55432/dauviet?schema=public';
  assert.throws(
    () => assertDistinctDatabaseTargets(REAL, sameTargetDifferentCreds),
    ShadowDatabaseSameAsRealError,
  );
});

test('throws when only the schema differs is NOT enough by itself to allow default (unspecified) vs explicit "public"', () => {
  // "public" is Postgres's default schema, so an unspecified schema and an
  // explicit ?schema=public both mean the same physical target.
  const noSchemaParam = 'postgresql://dauviet:secret@localhost:55432/dauviet';
  assert.throws(() => assertDistinctDatabaseTargets(REAL, noSchemaParam), ShadowDatabaseSameAsRealError);
});

test('allows a genuinely separate database name on the same host/port', () => {
  const distinctDb = 'postgresql://dauviet:secret@localhost:55432/dauviet_shadow?schema=public';
  assert.doesNotThrow(() => assertDistinctDatabaseTargets(REAL, distinctDb));
});

test('allows a genuinely separate host', () => {
  const distinctHost = 'postgresql://dauviet:secret@shadow-db-host:55432/dauviet?schema=public';
  assert.doesNotThrow(() => assertDistinctDatabaseTargets(REAL, distinctHost));
});

test('allows a genuinely separate port on the same host/database (e.g. root .env vs apps/api/.env drift)', () => {
  const distinctPort = 'postgresql://dauviet:secret@localhost:5432/dauviet?schema=public';
  assert.doesNotThrow(() => assertDistinctDatabaseTargets(REAL, distinctPort));
});

test('allows a distinct named schema on the same host/port/database', () => {
  const distinctSchema = 'postgresql://dauviet:secret@localhost:55432/dauviet?schema=shadow';
  assert.doesNotThrow(() => assertDistinctDatabaseTargets(REAL, distinctSchema));
});

test('rejects a malformed URL with a clear error rather than a cryptic parser exception', () => {
  assert.throws(() => parseDatabaseTarget('DATABASE_URL', 'not-a-url'), InvalidDatabaseUrlError);
});

test('rejects a non-postgres URL', () => {
  assert.throws(
    () => parseDatabaseTarget('DATABASE_URL', 'mysql://user:pass@localhost:3306/db'),
    InvalidDatabaseUrlError,
  );
});

test('normalizes host and database casing before comparing', () => {
  const upperCased = 'postgresql://dauviet:secret@LOCALHOST:55432/DAUVIET?schema=PUBLIC';
  assert.throws(() => assertDistinctDatabaseTargets(REAL, upperCased), ShadowDatabaseSameAsRealError);
});
