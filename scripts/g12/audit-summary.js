// G12 dependency-security summary: attributes every `pnpm audit --json` advisory to the workspace
// importers that actually pull it in, so backend (root + apps/api) exposure is separated from the
// frontend apps sharing the lockfile. Usage: node scripts/g12/audit-summary.js <audit.json>
const fs = require('fs');
const audit = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const rows = [];
for (const adv of Object.values(audit.advisories || {})) {
  const paths = (adv.findings || []).flatMap((f) => f.paths || []);
  const importers = new Set(paths.map((p) => p.split('>')[0]));
  const backend = [...importers].filter((i) => i === '.' || i === 'apps__api' || i === 'apps/api');
  const backendPaths = paths.filter((p) => backend.includes(p.split('>')[0]));
  rows.push({
    id: adv.github_advisory_id || adv.id,
    module: adv.module_name,
    severity: adv.severity,
    vulnerable: adv.vulnerable_versions,
    patched: adv.patched_versions,
    title: adv.title,
    importers: [...importers].sort(),
    backend: backend.length > 0,
    devOnlyInBackend: backend.length > 0 && (adv.findings || []).every((f) => f.dev || !(f.paths || []).some((p) => backend.includes(p.split('>')[0]))),
    sampleBackendPath: backendPaths.sort((a, b) => a.length - b.length)[0] || null,
  });
}
const order = { critical: 0, high: 1, moderate: 2, low: 3, info: 4 };
rows.sort((a, b) => order[a.severity] - order[b.severity] || a.module.localeCompare(b.module));
const backendRows = rows.filter((r) => r.backend);
const count = (rs) => rs.reduce((acc, r) => ({ ...acc, [r.severity]: (acc[r.severity] || 0) + 1 }), {});
console.log(JSON.stringify({ totalAdvisories: rows.length, bySeverity: count(rows), backendAdvisories: backendRows.length, backendBySeverity: count(backendRows), backend: backendRows }, null, 1));
