import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { OpenStreetMapAdapter } from './openstreetmap.adapter';

/** Recursively lists every .ts source file under `dir`, skipping this spec file itself and node_modules/dist. */
function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...listSourceFiles(full));
    else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) out.push(full);
  }
  return out;
}

describe('OpenStreetMap/Nominatim safety (spec sections 10/96 - binding, not a default)', () => {
  it('fetchByIds NEVER issues a live request - throws immediately regardless of input', async () => {
    const adapter = new OpenStreetMapAdapter();
    await expect(adapter.fetchByIds(['123'])).rejects.toThrow(/permanently disabled/i);
    await expect(adapter.fetchByIds([])).rejects.toThrow(/permanently disabled/i);
  });

  it('no source file anywhere in apps/api/src references nominatim.openstreetmap.org outside this adapter\'s own doc comments and this spec file (repository-search proof, spec section 96)', () => {
    const srcRoot = join(__dirname, '..', '..', '..');
    const files = listSourceFiles(srcRoot);
    const offenders: string[] = [];
    for (const file of files) {
      if (file.endsWith('openstreetmap.adapter.ts') || file.endsWith('openstreetmap.adapter.spec.ts')) continue;
      const content = readFileSync(file, 'utf-8');
      if (/nominatim\.openstreetmap\.org/i.test(content)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it('the seeded OPENSTREETMAP IngestionSource policy is disabled with PROHIBITED storage rights (defense in depth alongside the adapter-level hard refusal)', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { GOLDEN_INGESTION_SOURCES } = require('../../../../../../prisma/golden/knowledge-ingestion');
    const osm = GOLDEN_INGESTION_SOURCES.find((s: { code: string }) => s.code === 'OPENSTREETMAP');
    expect(osm.enabled).toBe(false);
    expect(osm.policy.rawPayloadStorage).toBe('PROHIBITED');
    expect(osm.policy.normalizedStorageRight).toBe('PROHIBITED');
  });
});
