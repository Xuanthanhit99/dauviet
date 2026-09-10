/**
 * Deterministic environment resolution for the compiled/dev API process
 * (post-G03 operational hardening). MUST be the very first import in any
 * entrypoint that uses it (`main.ts`, `generate-openapi.ts`) - see
 * `docs/backend/BACKEND_HANDOFF.md` "Environment resolution" for the full
 * contract and the real G03 live-QA defect this closes: `@prisma/client`'s
 * own built-in `.env` auto-loading resolves relative to the directory
 * `prisma/schema.prisma` was generated from - the MONOREPO ROOT - and does
 * so as an import-time side effect inside `PrismaModule`'s own import
 * chain, which (in `app.module.ts`) is required *before* `ConfigModule.
 * forRoot()` ever runs its own (cwd-relative, i.e. `apps/api`-relative)
 * `.env` loading. Because neither loader overwrites an already-set
 * `process.env` value, whichever one runs first permanently wins for the
 * life of the process - and Prisma's own root-`.env` load was winning,
 * silently pointing a real `node dist/main.js` boot at whatever
 * `DATABASE_URL`/`REDIS_URL` the repository-root `.env` happens to define
 * (a file that exists for the Prisma CLI - `prisma migrate`/`db seed`,
 * always invoked from the repo root - not for this process).
 *
 * The fix: run first, deterministically, and read ONLY `apps/api/.env` -
 * never the repository root. A value already present in `process.env`
 * (a real shell export, a Docker/Compose `environment:` entry, or a
 * production/CI secret) is NEVER overwritten - that source is always
 * authoritative, exactly like `test-env-setup.ts`'s existing
 * `setDefault(...)` convention for the unit-test suite. If `apps/api/.env`
 * does not exist (a container image that only ever gets real environment
 * variables, for example), this is a silent no-op - never an error, and
 * never a reason a production boot would behave differently.
 *
 * No third-party `dotenv` dependency: `apps/api/package.json` never
 * declared one, and `@prisma/client`'s own transitive copy is not
 * resolvable here under this workspace's strict pnpm linking (the same
 * class of bug `docs/backend/LIVE_QA_REPORT.md` section 2 already
 * documents for `express`) - a tiny local parser avoids reintroducing it.
 * Deliberately supports only the plain `KEY=value` / `KEY="value"` /
 * `KEY='value'` / `# comment` shape every `.env`/`.env.example` file in
 * this repo already uses - no variable interpolation, no multiline values.
 */
import * as fs from 'fs';
import * as path from 'path';

export const API_LOCAL_ENV_PATH = path.resolve(__dirname, '../../.env');

/** Pure, unit-testable: parses `KEY=value` lines. Exported for load-env.spec.ts. */
export function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key) continue;
    let value = line.slice(eq + 1).trim();
    if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

/**
 * Applies `envPath`'s values to `target` (defaults to `process.env`), never
 * overwriting a key that already has a value there. Returns the keys it
 * actually set (for tests / diagnostics) - never logs values (spec
 * requirement: never expose secrets in logs).
 */
export function loadApiLocalEnv(envPath: string = API_LOCAL_ENV_PATH, target: NodeJS.ProcessEnv = process.env): string[] {
  if (!fs.existsSync(envPath)) return [];
  const parsed = parseEnvFile(fs.readFileSync(envPath, 'utf8'));
  const applied: string[] = [];
  for (const [key, value] of Object.entries(parsed)) {
    if (target[key] === undefined) {
      target[key] = value;
      applied.push(key);
    }
  }
  return applied;
}

loadApiLocalEnv();
