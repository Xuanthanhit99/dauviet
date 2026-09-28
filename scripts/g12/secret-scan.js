// G12 secret scan. Walks the backend-relevant repository (tracked AND untracked files) and reports
// file:line + pattern NAME only - never the matched value. Usage: node scripts/g12/secret-scan.js
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', 'frontend-pass-10', '.next', '.expo', '.turbo', 'build']);
const SCAN_ROOTS = ['apps/api', 'prisma', 'scripts', 'docs', 'packages', '.'];
const PATTERNS = [
  ['aws-access-key-id', /\b(AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['private-key-block', /-----BEGIN (RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/],
  ['google-api-key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['github-token', /\bgh[pousr]_[0-9A-Za-z]{36,}\b/],
  ['slack-token', /\bxox[abprs]-[0-9A-Za-z-]{10,}\b/],
  ['stripe-live-key', /\b(sk|rk)_live_[0-9A-Za-z]{16,}\b/],
  ['jwt', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/],
  ['url-with-password', /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@'"`]+:([^\s@/'"`$<{]{3,})@[^\s'"`]+/i],
  ['assigned-secret', /\b(secret|password|passwd|api[_-]?key|access[_-]?key|token)\b\s*[:=]\s*['"][^'"\s]{12,}['"]/i],
];
// Known, reviewed NON-secrets: local docker-compose dev credentials, documented placeholders, synthetic test values.
const ALLOW = [
  /dauviet:dauviet@localhost/, /dauviet:dauviet@/, /dauviet123/, /change-me/i, /test-(access|refresh)-secret/, /E2eTest-Pass!1|G12-[A-Za-z0-9-]+!1|DevPassword123!/,
  /u:p@db|u:pw@h|user:pass@|test:test@localhost|dauviet:SUPERSECRETPW|dauviet:S3cr3t!@db|default:hunter2@cache|dauviet:\*\*\*@/,
  /eyJhbGciOiJIUzI1NiJ9\.eyJzdWIiOiJ1MSIsInNpZCI6InMxIn0/,
];
const hits = [];
let files = 0;
function walk(dir, top) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (top && dir === ROOT && !['apps', 'prisma', 'scripts', 'docs', 'packages'].includes(entry.name)) continue;
      if (dir === path.join(ROOT, 'apps') && entry.name !== 'api') continue;
      walk(full, false);
    } else if (/\.(ts|js|cjs|mjs|json|md|sql|prisma|ya?ml|toml|txt|env|example|sh)$|^\.env/.test(entry.name) && !entry.name.endsWith('pnpm-lock.yaml')) {
      files++;
      const text = fs.readFileSync(full, 'utf8');
      text.split(/\r?\n/).forEach((line, i) => {
        for (const [name, re] of PATTERNS) {
          if (re.test(line) && !ALLOW.some((a) => a.test(line))) hits.push({ file: path.relative(ROOT, full).replace(/\\/g, '/'), line: i + 1, pattern: name });
        }
      });
    }
  }
}
walk(ROOT, true);
const gitignored = (f) => /(^|\/)\.env$/.test(f);
console.log(JSON.stringify({ filesScanned: files, hits: hits.filter((h) => !gitignored(h.file)), gitignoredLocalEnvHits: hits.filter((h) => gitignored(h.file)).map((h) => `${h.file}:${h.line} ${h.pattern}`) }, null, 1));
