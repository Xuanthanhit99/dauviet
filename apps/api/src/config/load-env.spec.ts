/**
 * Post-G03 operational hardening: regression coverage for the environment
 * precedence contract (docs/backend/BACKEND_HANDOFF.md "Environment
 * resolution"). Proves, without touching the real filesystem env or a real
 * Postgres, that `apps/api/.env` is read correctly and - critically - that
 * an already-set `process.env` value (standing in for a real shell export,
 * Docker/Compose injection, or production/CI secret) is NEVER overwritten.
 * This is the exact class of defect found live in G03 QA: a value that was
 * already correctly set lost to a later, unwanted `.env` read.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadApiLocalEnv, parseEnvFile } from './load-env';

describe('parseEnvFile', () => {
  it('parses plain, double-quoted, and single-quoted values', () => {
    const parsed = parseEnvFile('FOO=bar\nBAZ="quoted value"\nQUX=\'also quoted\'\n');
    expect(parsed).toEqual({ FOO: 'bar', BAZ: 'quoted value', QUX: 'also quoted' });
  });

  it('ignores blank lines and comments', () => {
    const parsed = parseEnvFile('# a comment\n\nFOO=bar\n   \n# another\nBAR=baz\n');
    expect(parsed).toEqual({ FOO: 'bar', BAR: 'baz' });
  });

  it('handles a value containing an "=" correctly (splits on the first one only)', () => {
    const parsed = parseEnvFile('DATABASE_URL=postgresql://user:pass@host:5432/db?schema=public\n');
    expect(parsed.DATABASE_URL).toBe('postgresql://user:pass@host:5432/db?schema=public');
  });

  it('returns an empty object for empty content', () => {
    expect(parseEnvFile('')).toEqual({});
  });
});

describe('loadApiLocalEnv - precedence contract', () => {
  let tmpFile: string;

  beforeEach(() => {
    tmpFile = path.join(os.tmpdir(), `load-env-spec-${Date.now()}-${Math.random().toString(36).slice(2)}.env`);
  });

  afterEach(() => {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  });

  it('sets a variable from the file when it is not already present in the target', () => {
    fs.writeFileSync(tmpFile, 'DATABASE_URL="postgresql://dauviet:dauviet@localhost:55432/dauviet_test?schema=public"\n');
    const target: NodeJS.ProcessEnv = {};
    const applied = loadApiLocalEnv(tmpFile, target);
    expect(target.DATABASE_URL).toBe('postgresql://dauviet:dauviet@localhost:55432/dauviet_test?schema=public');
    expect(applied).toEqual(['DATABASE_URL']);
  });

  it('CRITICAL: never overwrites a variable already present in the target (production/container/shell authority)', () => {
    fs.writeFileSync(tmpFile, 'DATABASE_URL="postgresql://wrong-host/wrong-db"\n');
    const target: NodeJS.ProcessEnv = { DATABASE_URL: 'postgresql://already-correct-host/already-correct-db' };
    const applied = loadApiLocalEnv(tmpFile, target);
    expect(target.DATABASE_URL).toBe('postgresql://already-correct-host/already-correct-db');
    expect(applied).toEqual([]);
  });

  it('sets only the keys that were missing, leaving pre-existing keys from the same file untouched', () => {
    fs.writeFileSync(tmpFile, 'DATABASE_URL=from-file\nREDIS_URL=from-file\n');
    const target: NodeJS.ProcessEnv = { REDIS_URL: 'already-set' };
    const applied = loadApiLocalEnv(tmpFile, target);
    expect(target.DATABASE_URL).toBe('from-file');
    expect(target.REDIS_URL).toBe('already-set');
    expect(applied).toEqual(['DATABASE_URL']);
  });

  it('is a silent no-op when the file does not exist (e.g. a container image with no apps/api/.env)', () => {
    const target: NodeJS.ProcessEnv = {};
    const applied = loadApiLocalEnv(path.join(os.tmpdir(), 'this-file-does-not-exist.env'), target);
    expect(applied).toEqual([]);
    expect(target).toEqual({});
  });
});
