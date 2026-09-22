#!/usr/bin/env tsx
// Safe replacement for calling `prisma migrate diff` directly. Requirement D
// (docs/backend/G06_5_FINAL_REPORT.md "Shadow Database Safety Guard"):
// prefers a file-to-file schema diff by default, which needs no shadow
// database at all - this is the mode every G06.5+ migration should be
// generated with. A live-database-backed diff (`--from-migrations` replayed
// into a shadow database) is still supported for the rare case it's
// genuinely needed, but only through this wrapper, which refuses to run
// unless SHADOW_DATABASE_URL is explicitly set AND provably distinct from
// DATABASE_URL (see shadow-database-guard.ts).
//
// Usage:
//   tsx scripts/db/safe-migrate-diff.ts --from <git-ref-or-path> [--script]
//     Diffs prisma/schema.prisma at <git-ref-or-path> (default: HEAD) against
//     the current working tree - no database, no shadow database, ever.
//
//   tsx scripts/db/safe-migrate-diff.ts --from-migrations --shadow-database-url <url> [--script]
//     Diffs the full prisma/migrations history against the current schema,
//     replayed into SHADOW_DATABASE_URL. Refuses to run if that URL is the
//     same target as DATABASE_URL, or if DATABASE_URL/SHADOW_DATABASE_URL is
//     unset.

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertDistinctDatabaseTargets } from './shadow-database-guard';

// On Windows, `npx` is a .cmd shim - spawning it directly (even by its
// literal .cmd name) fails without shell:true, a known Node/Windows quirk.
const isWindows = process.platform === 'win32';
const npx = 'npx';

function run(args: string[]): void {
  const asScript = args.includes('--script');
  const passthrough = asScript ? ['--script'] : [];

  if (args.includes('--from-migrations')) {
    const shadowUrl = process.env.SHADOW_DATABASE_URL;
    const realUrl = process.env.DATABASE_URL;
    if (!shadowUrl) {
      throw new Error(
        'SHADOW_DATABASE_URL is required for --from-migrations mode and must point at a ' +
          'separate, empty, disposable database - never the real DATABASE_URL. Prefer the ' +
          'default file-to-file mode (--from <ref>) instead, which needs no shadow database.',
      );
    }
    if (!realUrl) {
      throw new Error('DATABASE_URL must be set so it can be compared against SHADOW_DATABASE_URL.');
    }
    // The one call in this whole codebase that is allowed to hand a shadow
    // database URL to Prisma - and it does so only after this check passes.
    assertDistinctDatabaseTargets(realUrl, shadowUrl);

    execFileSync(
      npx,
      [
        '--yes',
        'prisma',
        'migrate',
        'diff',
        '--from-migrations',
        'prisma/migrations',
        '--to-schema-datamodel',
        'prisma/schema.prisma',
        '--shadow-database-url',
        shadowUrl,
        ...passthrough,
      ],
      { stdio: 'inherit', shell: isWindows },
    );
    return;
  }

  // Default, preferred path: pure file-to-file diff, no database involved.
  const fromIdx = args.indexOf('--from');
  const fromRef = fromIdx >= 0 ? args[fromIdx + 1] : 'HEAD';

  const oldSchema = execFileSync('git', ['show', `${fromRef}:prisma/schema.prisma`], {
    encoding: 'utf-8',
  });
  const tmpDir = mkdtempSync(join(tmpdir(), 'dauviet-schema-diff-'));
  const oldSchemaPath = join(tmpDir, 'schema.prisma');
  writeFileSync(oldSchemaPath, oldSchema);

  execFileSync(
    npx,
    [
      '--yes',
      'prisma',
      'migrate',
      'diff',
      '--from-schema-datamodel',
      oldSchemaPath,
      '--to-schema-datamodel',
      'prisma/schema.prisma',
      ...passthrough,
    ],
    { stdio: 'inherit', shell: isWindows },
  );
}

run(process.argv.slice(2));
