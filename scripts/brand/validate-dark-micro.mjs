import { createHash } from 'node:crypto';
const root = 'Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED';
export const darkMicroDirectory = `${root}/01-Logo-Master-Geometry/Dau-Viet-Global-Dark-Micro-V1.0-CANDIDATE`;
export const darkMicroV11Directory = `${root}/01-Logo-Master-Geometry/Dau-Viet-Global-Dark-Micro-V1.1-CANDIDATE`;
export const darkMicroProductionDirectory = `${root}/01-Logo-Master-Geometry/Dau-Viet-Global-Dark-Micro-V1.1-PRODUCTION-LOCKED`;
export const microSource = `${root}/01-Logo-Master-Geometry/dau-viet-global-time-trace-v3-micro-v1.3.svg`;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
// Passing integrity does not approve the retained failed visual candidate.
export function validateDarkMicro(files, registry) {
  const errors = [], read = p => files.get(p)?.toString('utf8') || '';
  let c, v;
  try { c = JSON.parse(read(`${darkMicroDirectory}/CANDIDATE.json`)); v = JSON.parse(read(`${darkMicroDirectory}/VALIDATION.json`)); }
  catch { return ['INVALID_DARK_MICRO_METADATA']; }
  const svgPath = `${darkMicroDirectory}/dvg-dark-micro-v1.0.svg`, source = read(microSource), svg = read(svgPath);
  if (c.lifecycle !== 'CANDIDATE' || c.distribution !== false || c.humanVisualApproval !== 'PENDING_HUMAN_APPROVAL' || c.status !== 'BLOCKED_RENDER_QA') errors.push('INVALID_DARK_MICRO_LIFECYCLE');
  if (c.sourceFile !== microSource || c.sourceSha256 !== sha(source) || c.candidateFile !== svgPath || c.candidateSha256 !== sha(svg)) errors.push('INVALID_DARK_MICRO_SOURCE');
  if ((source.match(/#062A24/g) || []).length !== 1 || svg !== source.replace('#062A24', '#EADDC7')) errors.push('DARK_MICRO_GEOMETRY_OR_COLOR_DRIFT');
  if (JSON.stringify(c.authorizedColorMapping) !== JSON.stringify({ '#062A24': '#EADDC7' }) || c.unauthorizedColorMappings !== 0) errors.push('UNAUTHORIZED_DARK_MICRO_MAPPING');
  if (JSON.stringify(c.permittedBackgrounds) !== JSON.stringify(['#062A24', '#18463C']) || JSON.stringify(c.sizesPx) !== '[16,24]') errors.push('INVALID_DARK_MICRO_USAGE');
  const gap = registry.gaps.find(g => g.gapId === 'dark-micro');
  if (registry.assets.some(a => a.sourceFile.startsWith(`${darkMicroDirectory}/`)) || (gap?.status !== 'CANONICAL_ASSET_GAP' && (!['CANDIDATE_READY_FOR_APPROVAL', 'RESOLVED'].includes(gap?.status) || gap?.candidateFile !== `${darkMicroV11Directory}/CANDIDATE.json`))) errors.push('DARK_MICRO_PREMATURE_PROMOTION');
  if (v.status !== 'BLOCKED' || v.renderQA?.length !== 4 || ![16, 24].every(size => v.renderQA.some(q => q.sizePx === size && q.background === '#18463C' && q.result === 'FAIL'))) errors.push('DARK_MICRO_QA_STATE_DRIFT');
  const ids = [...svg.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  for (const ref of ['title', 'desc', 'micro-cut']) if (ids.filter(id => id === ref).length !== 1) errors.push(`DARK_MICRO_BROKEN_REFERENCE ${ref}`);
  if (!svg.includes('role="img"') || !svg.includes('aria-labelledby="title desc"') || !/<title id="title">[^<]+<\/title>/.test(svg) || !/<desc id="desc">[^<]+<\/desc>/.test(svg)) errors.push('DARK_MICRO_ACCESSIBILITY');
  if (/<(?:[\w-]+:)?(?:text|image|filter|linearGradient|radialGradient)\b/i.test(svg)) errors.push('DARK_MICRO_FORBIDDEN_ELEMENT');
  const seen = new Set();
  for (const line of read(`${darkMicroDirectory}/MANIFEST.sha256`).trim().split(/\r?\n/)) {
    const m = line.match(/^([a-f0-9]{64})  ([\w.-]+)$/);
    if (!m || seen.has(m[2]) || !files.has(`${darkMicroDirectory}/${m[2]}`) || sha(files.get(`${darkMicroDirectory}/${m[2]}`)) !== m[1]) errors.push('DARK_MICRO_MANIFEST');
    if (m) seen.add(m[2]);
  }
  for (const file of files.keys()) if (file.startsWith(`${darkMicroDirectory}/`) && !file.endsWith('/MANIFEST.sha256') && !seen.has(file.slice(darkMicroDirectory.length + 1))) errors.push('DARK_MICRO_UNLISTED_FILE');
  for (const a of v.artifacts || []) if (!a.file.startsWith('docs/brand/qa/dark-micro-v1.0/') || !files.has(a.file) || sha(files.get(a.file)) !== a.sha256) errors.push('DARK_MICRO_QA_ARTIFACT_DRIFT');
  if (v.artifacts?.length !== 9) errors.push('DARK_MICRO_MISSING_QA_ARTIFACTS');
  return errors;
}

export function contrastRatio(a, b) {
  const luminance = hex => hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255)
    .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  return (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
}

export function validateDarkMicroProduction(files, registry) {
  const errors = [], dir = darkMicroProductionDirectory;
  const source = `${dir}/dvg-dark-micro-v1.1.svg`, dest = 'packages/brand-assets/logo/micro/dvg-dark-micro-v1.1.svg';
  const candidate = `${darkMicroV11Directory}/dvg-dark-micro-v1.1.svg`;
  const text = p => files.get(p)?.toString('utf8') || '';
  let lock, proof;
  try { lock = JSON.parse(text(`${dir}/LOCK.json`)); proof = JSON.parse(text(`${dir}/PRODUCTION-VALIDATION.json`)); }
  catch { return ['DARK_MICRO_PRODUCTION_METADATA']; }
  const matching = registry.assets.filter(a => a.roles?.includes('CANONICAL_DARK_MICRO'));
  const a = matching[0];
  if (matching.length !== 1 || a.assetId !== 'dvg-logo-dark-micro-v1.1' || a.assetClass !== 'logo' || a.semantic !== 'micro' || a.theme !== 'dark' || a.version !== '1.1' || a.status !== 'PRODUCTION_LOCKED' || a.distribution !== true || a.sourceFile !== source || a.productionPath !== dest || JSON.stringify(a.roles) !== '["CANONICAL_DARK_MICRO"]') errors.push('DARK_MICRO_PRODUCTION_REGISTRY');
  const mapping = { '#062A24': '#EADDC7', '#18463C': '#EADDC7' }, backgrounds = ['#062A24', '#18463C'];
  if (lock.status !== 'PRODUCTION_LOCKED' || lock.asset !== 'Dark Micro' || lock.canonicalFile !== 'dvg-dark-micro-v1.1.svg' || lock.colorsChangedFromSource !== true || lock.version !== '1.1' || lock.humanVisualApproval !== 'APPROVED' || lock.approvalDate !== '2026-09-17' || lock.distribution !== true || lock.approvedCandidate !== candidate || lock.geometryChanged !== false || lock.pathsChanged !== false || lock.visualCandidateChangedAfterApproval !== false) errors.push('DARK_MICRO_PRODUCTION_LOCK');
  for (const record of [lock, a]) {
    if (!record || JSON.stringify(record.authorizedColorMapping) !== JSON.stringify(mapping) || record.preservedGold !== '#D4AF7C' || record.geometryParent !== 'Time Trace V3 Micro V1.3' || record.geometrySource !== microSource || record.treatment !== 'Dark Micro Treatment V1.1') errors.push('DARK_MICRO_PRODUCTION_TREATMENT');
  }
  for (const usage of [lock, a?.usage]) if (JSON.stringify(usage?.sizesPx) !== '[16,24]' || JSON.stringify(usage?.permittedBackgrounds) !== JSON.stringify(backgrounds)) errors.push('DARK_MICRO_PRODUCTION_USAGE');
  if (!files.has(source) || !files.has(candidate) || !files.get(source)?.equals(files.get(candidate))) errors.push('DARK_MICRO_CANDIDATE_PRODUCTION_IDENTITY');
  if (!files.has(dest) || !files.has(source) || !files.get(dest)?.equals(files.get(source))) errors.push('DARK_MICRO_PRODUCTION_DISTRIBUTION_IDENTITY');
  if (text(source) !== text(microSource).replaceAll('#062A24', '#EADDC7').replaceAll('#18463C', '#EADDC7')) errors.push('DARK_MICRO_PRODUCTION_GEOMETRY_OR_COLOR');
  // Validate the approved lineage too: production cannot bless damaged candidate QA or SVGs.
  errors.push(...validateDarkMicroV11(files, registry));
  for (const key of ['microGeometryIdentity', 'authorizedColorMapping', 'svgAccessibility']) if (proof[key] !== 'PASS') errors.push('DARK_MICRO_PRODUCTION_PROOF');
  if (proof.unauthorizedColorMappings !== 0 || proof.preservedGold !== '#D4AF7C') errors.push('DARK_MICRO_PRODUCTION_PROOF');
  const expectedHash = sha(text(candidate));
  if (lock.approvedCandidateSha256 !== expectedHash || [proof.candidateSha256, proof.productionSha256, proof.distributionSha256].some(h => h !== expectedHash) || proof.status !== 'PASS' || proof.lifecycle !== 'PRODUCTION_LOCKED' || proof.humanVisualApproval !== 'APPROVED' || proof.approvalDate !== '2026-09-17' || proof.brokenReferences !== 0) errors.push('DARK_MICRO_PRODUCTION_PROOF');
  let historicalProof;
  try { historicalProof = JSON.parse(text(`${darkMicroV11Directory}/VALIDATION.json`)); } catch { errors.push('DARK_MICRO_PRODUCTION_QA'); }
  for (const key of ['renderQA', 'artifacts', 'geometryProof', 'contrast', 'colorDifferences']) if (JSON.stringify(proof[key]) !== JSON.stringify(historicalProof?.[key])) errors.push('DARK_MICRO_PRODUCTION_QA');
  const gap = registry.gaps.find(g => g.gapId === 'dark-micro');
  if (gap?.status !== 'RESOLVED' || JSON.stringify(gap.resolvedBy) !== '["dvg-logo-dark-micro-v1.1"]' || registry.actionableDesignGapIds.includes('dark-micro')) errors.push('DARK_MICRO_PRODUCTION_GAP');
  const lockFile = 'docs/brand/locks/dark-micro-v1.1.md';
  if (a?.repositoryLockFile !== lockFile || lock.repositoryLock !== lockFile || !files.has(lockFile) || !text(lockFile).includes('PRODUCTION_LOCKED')) errors.push('DARK_MICRO_REPOSITORY_LOCK');
  const manifestFile = `${dir}/MANIFEST.sha256`, record = registry.sourcePackages?.find(r => r.sourceDirectory === dir);
  if (record?.manifestFile !== manifestFile || record?.checksum?.value !== sha(text(manifestFile)) || record?.status !== 'PRODUCTION_LOCKED' || record?.distribution !== true) errors.push('DARK_MICRO_PRODUCTION_MANIFEST');
  const seen = new Set();
  for (const line of text(manifestFile).trim().split(/\r?\n/)) {
    const m = line.match(/^([a-f0-9]{64})  ([\w.-]+)$/);
    if (!m || seen.has(m[2]) || !files.has(`${dir}/${m[2]}`) || sha(files.get(`${dir}/${m[2]}`)) !== m[1]) errors.push('DARK_MICRO_PRODUCTION_MANIFEST');
    if (m) seen.add(m[2]);
  }
  if (seen.size !== 5) errors.push('DARK_MICRO_PRODUCTION_MANIFEST');
  for (const p of files.keys()) if (p.startsWith(`${dir}/`) && p !== manifestFile && !seen.has(p.slice(dir.length + 1))) errors.push('DARK_MICRO_PRODUCTION_MANIFEST');
  return errors;
}

export function validateDarkMicroV11(files, registry) {
  const errors = [], read = p => files.get(p)?.toString('utf8') || '';
  const dir = darkMicroV11Directory, qa = 'docs/brand/qa/dark-micro-v1.1';
  const tokenFile = `${root}/02-Color-Accessibility/dau-viet-global-color-system-final-validation-v1.1.json`;
  let c, v, tokens;
  try {
    c = JSON.parse(read(`${dir}/CANDIDATE.json`)); v = JSON.parse(read(`${dir}/VALIDATION.json`));
    tokens = JSON.parse(read(tokenFile)).primitive;
  } catch { return ['INVALID_DARK_MICRO_V11_METADATA']; }
  const svgFile = `${dir}/dvg-dark-micro-v1.1.svg`, source = read(microSource), svg = read(svgFile);
  if (c.version !== '1.1' || c.lifecycle !== 'CANDIDATE' || c.status !== 'CANDIDATE_READY_FOR_APPROVAL' || c.distribution !== false || c.humanVisualApproval !== 'PENDING_FINAL_VISUAL_APPROVAL' || c.treatment !== 'Dark Micro Treatment V1.1' || c.treatmentStatus !== 'APPROVED_TREATMENT_SPECIFICATION' || c.approvalDate !== '2026-09-17') errors.push('DARK_MICRO_V11_LIFECYCLE');
  if (c.sourceFile !== microSource || c.sourceSha256 !== sha(source) || c.candidateFile !== svgFile || c.candidateSha256 !== sha(svg)) errors.push('DARK_MICRO_V11_SOURCE');
  // Exact replacement equality protects every other byte, including gold and all mask paint.
  if ((source.match(/#062A24/g) || []).length !== 1 || (source.match(/#18463C/g) || []).length !== 2 || svg !== source.replaceAll('#062A24', '#EADDC7').replaceAll('#18463C', '#EADDC7')) errors.push('DARK_MICRO_V11_GEOMETRY_OR_COLOR_DRIFT');
  if (JSON.stringify(c.authorizedColorMapping) !== JSON.stringify({ '#062A24': '#EADDC7', '#18463C': '#EADDC7' }) || c.authorizedMappingCount !== 2 || c.changedFillOccurrences !== 3 || c.unauthorizedColorMappings !== 0 || c.preservedGold !== '#D4AF7C') errors.push('DARK_MICRO_V11_MAPPING');
  if (JSON.stringify(c.permittedBackgrounds) !== JSON.stringify(['#062A24', '#18463C']) || JSON.stringify(c.sizesPx) !== '[16,24]') errors.push('DARK_MICRO_V11_USAGE');
  const gap = registry.gaps.find(g => g.gapId === 'dark-micro');
  if (registry.assets.some(a => a.sourceFile.startsWith(`${dir}/`)) || !['CANDIDATE_READY_FOR_APPROVAL', 'RESOLVED'].includes(gap?.status) || gap?.candidateFile !== `${dir}/CANDIDATE.json` || files.has(`${dir}/PRODUCTION-LOCK.md`)) errors.push('DARK_MICRO_V11_PREMATURE_PRODUCTION_OR_GAP_DRIFT');
  const normalize = s => s.replace(/fill="#(?:062A24|18463C|EADDC7)"/g, 'fill="AUTHORIZED_REGION"');
  if (v.microGeometryIdentity !== 'PASS' || v.geometryProof?.sourceFingerprint !== sha(normalize(source)) || v.geometryProof?.candidateFingerprint !== sha(normalize(svg)) || v.geometryProof?.pathCountBefore !== 6 || v.geometryProof?.pathCountAfter !== 6) errors.push('DARK_MICRO_V11_GEOMETRY_PROOF');
  const ids = [...svg.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  for (const ref of ['title', 'desc', 'micro-cut']) if (ids.filter(id => id === ref).length !== 1) errors.push(`DARK_MICRO_V11_BROKEN_REFERENCE ${ref}`);
  if (!svg.includes('role="img"') || !svg.includes('aria-labelledby="title desc"') || !/<title id="title">[^<]+<\/title>/.test(svg) || !/<desc id="desc">[^<]+<\/desc>/.test(svg) || v.svgAccessibility !== 'PASS' || v.brokenReferences !== 0) errors.push('DARK_MICRO_V11_ACCESSIBILITY');
  if (/<(?:[\w-]+:)?(?:text|image|filter|linearGradient|radialGradient)\b/i.test(svg)) errors.push('DARK_MICRO_V11_FORBIDDEN_ELEMENT');
  if (v.contrast?.tokenFile !== tokenFile || v.contrast?.graphicalThreshold !== 3 || v.contrast?.result !== 'PASS') errors.push('DARK_MICRO_V11_CONTRAST');
  for (const bg of [tokens.forest_950, tokens.forest_700]) {
    const actual = contrastRatio(tokens.sand_100, bg);
    if (actual < 3 || Math.abs(actual - (v.contrast?.warmSandRatios?.[bg] ?? 0)) > 1e-10) errors.push('DARK_MICRO_V11_CONTRAST');
  }
  const expectedArtifacts = ['pixel-inspection-6x.png', 'render-board.png', 'render-input.html'];
  for (const size of [16, 24]) for (const bg of ['#062A24', '#18463C']) {
    if (v.renderQA?.filter(q => q.sizePx === size && q.background === bg && q.result === 'PASS').length !== 1) errors.push('DARK_MICRO_V11_RENDER_QA');
    const name = `dark-micro-${size}px-${bg.slice(1).toLowerCase()}.png`; expectedArtifacts.push(name);
    const png = files.get(`${qa}/${name}`);
    if (!png || png.length < 24 || png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || png.readUInt32BE(16) !== size || png.readUInt32BE(20) !== size) errors.push('DARK_MICRO_V11_RENDER_SIZE');
  }
  if (v.status !== 'PASS' || v.renderQA?.length !== 4) errors.push('DARK_MICRO_V11_RENDER_QA');
  const expectedPaths = expectedArtifacts.map(n => `${qa}/${n}`).sort();
  if (JSON.stringify(v.artifacts?.map(a => a.file).sort()) !== JSON.stringify(expectedPaths)) errors.push('DARK_MICRO_V11_ARTIFACT_LIST');
  for (const a of v.artifacts || []) if (!expectedPaths.includes(a.file) || !files.has(a.file) || sha(files.get(a.file)) !== a.sha256) errors.push('DARK_MICRO_V11_ARTIFACT_DRIFT');
  const embedded = [...read(`${qa}/render-input.html`).matchAll(/src="data:image\/svg\+xml;base64,([^"]+)"/g)].map(m => Buffer.from(m[1], 'base64').toString('utf8'));
  if (embedded.length !== 4 || embedded.some(s => s !== svg)) errors.push('DARK_MICRO_V11_RENDER_SOURCE');
  const seen = new Set();
  for (const line of read(`${dir}/MANIFEST.sha256`).trim().split(/\r?\n/)) {
    const m = line.match(/^([a-f0-9]{64})  ([\w.-]+)$/);
    if (!m || seen.has(m[2]) || !files.has(`${dir}/${m[2]}`) || sha(files.get(`${dir}/${m[2]}`)) !== m[1]) errors.push('DARK_MICRO_V11_MANIFEST');
    if (m) seen.add(m[2]);
  }
  for (const p of files.keys()) if (p.startsWith(`${dir}/`) && p !== `${dir}/MANIFEST.sha256` && !seen.has(p.slice(dir.length + 1))) errors.push('DARK_MICRO_V11_UNLISTED_FILE');
  if (seen.size !== 4) errors.push('DARK_MICRO_V11_MANIFEST');
  return errors;
}
