// Permanent safety guard added after the G06.5 incident documented in
// docs/backend/G06_5_FINAL_REPORT.md's "Incident Log": `prisma migrate diff
// --shadow-database-url` was accidentally pointed at the real, live
// development database. Prisma treats its shadow-database target as
// disposable scratch space (it replays the full migration history into it,
// then tears the result down) - pointing that at a real database destroys
// its data. This module makes that specific mistake structurally impossible
// to repeat silently: every script in this repo that ever accepts a shadow
// database URL must call `assertDistinctDatabaseTargets` before using it.
//
// Comparison is on host + port + database name (+ schema, when present) -
// the parts that actually identify "which physical database/schema would be
// wiped" - not on the full connection string (which may differ in
// query-param ordering, credentials, etc. while still resolving to the same
// physical target).

export interface DatabaseTarget {
  host: string;
  port: string;
  database: string;
  // Postgres defaults an unqualified connection to the "public" schema, so
  // an absent ?schema= param and an explicit ?schema=public both resolve to
  // the same physical target - normalized to 'public' here rather than left
  // as null, so callers never have to special-case "unspecified."
  schema: string;
}

export class InvalidDatabaseUrlError extends Error {
  constructor(label: string, raw: string, cause: unknown) {
    super(`${label} is not a valid PostgreSQL connection URL: ${raw}`, { cause });
    this.name = 'InvalidDatabaseUrlError';
  }
}

export class ShadowDatabaseSameAsRealError extends Error {
  constructor(target: DatabaseTarget) {
    super(
      `Refusing to proceed: the shadow database URL resolves to the SAME target as the real ` +
        `database URL (host=${target.host}, port=${target.port}, database=${target.database}, ` +
        `schema=${target.schema}). A shadow database is treated as disposable ` +
        `scratch space and will be wiped - it must never be the real development database. ` +
        `See docs/backend/G06_5_FINAL_REPORT.md's Incident Log for what happens when this rule ` +
        `is violated. Point SHADOW_DATABASE_URL at a separate, empty, disposable database, or ` +
        `prefer a file-to-file schema diff (--from-schema-datamodel / --to-schema-datamodel) ` +
        `which needs no shadow database at all.`,
    );
    this.name = 'ShadowDatabaseSameAsRealError';
  }
}

export function parseDatabaseTarget(label: string, raw: string): DatabaseTarget {
  let url: URL;
  try {
    url = new URL(raw);
  } catch (cause) {
    throw new InvalidDatabaseUrlError(label, raw, cause);
  }
  if (!/^postgres(ql)?:$/.test(url.protocol)) {
    throw new InvalidDatabaseUrlError(label, raw, new Error(`unsupported protocol "${url.protocol}"`));
  }
  const database = url.pathname.replace(/^\//, '');
  if (!url.hostname || !database) {
    throw new InvalidDatabaseUrlError(label, raw, new Error('missing host or database name'));
  }
  return {
    host: url.hostname.toLowerCase(),
    port: url.port || '5432',
    database: database.toLowerCase(),
    schema: url.searchParams.get('schema')?.toLowerCase() ?? 'public',
  };
}

function sameTarget(a: DatabaseTarget, b: DatabaseTarget): boolean {
  // Distinct, explicitly-named schemas on the same host/port/database are
  // still treated as distinct targets (a shadow schema alongside the real
  // one is a legitimate, narrower pattern) - only an exact match counts as
  // the same target.
  return a.host === b.host && a.port === b.port && a.database === b.database && a.schema === b.schema;
}

// Requirement A/B/C (docs/backend/G06_5_FINAL_REPORT.md "Shadow Database
// Safety Guard"): fails closed the instant the two resolve to the same
// physical target. Call this before ever passing a shadow database URL to
// any Prisma command.
export function assertDistinctDatabaseTargets(realDatabaseUrl: string, shadowDatabaseUrl: string): void {
  const real = parseDatabaseTarget('DATABASE_URL', realDatabaseUrl);
  const shadow = parseDatabaseTarget('SHADOW_DATABASE_URL', shadowDatabaseUrl);
  if (sameTarget(real, shadow)) {
    throw new ShadowDatabaseSameAsRealError(real);
  }
}
