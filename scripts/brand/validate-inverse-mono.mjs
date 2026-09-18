import { createHash } from 'node:crypto';
import { contrastRatio } from './validate-dark-micro.mjs';

const bible = 'Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED';
export const inverseDirectory = `${bible}/01-Logo-Master-Geometry/Dau-Viet-Global-Inverse-Mono-V1.0-CANDIDATE`;
export const inverseSource = `${bible}/01-Logo-Master-Geometry/dau-viet-global-time-trace-v3-micro-v1.4-mono.svg`;
export const inverseSvg = `${inverseDirectory}/dvg-inverse-mono-v1.0.svg`;
export const inverseQa = 'docs/brand/qa/inverse-mono-v1.0';
const tokenFile = `${bible}/02-Color-Accessibility/dau-viet-global-color-system-final-validation-v1.1.json`;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const backgrounds = ['#062A24', '#18463C'];
const sourceHash = 'ca59b22908a2a245c5f66cf1b5f20df1575fa01ce1b0c30742e1beba4c785abf';

export const inverseProductionDirectory = `${bible}/01-Logo-Master-Geometry/Dau-Viet-Global-Inverse-Mono-V1.0-PRODUCTION-LOCKED`;
export const inverseDistribution = 'packages/brand-assets/logo/micro/dvg-inverse-mono-v1.0.svg';

export function validateInverseMono(files, registry, historical = false) {
  const errors = [], text = p => files.get(p)?.toString('utf8') || '';
  let c, v, tokens;
  try {
    c = JSON.parse(text(`${inverseDirectory}/CANDIDATE.json`));
    v = JSON.parse(text(`${inverseDirectory}/VALIDATION.json`));
    tokens = JSON.parse(text(tokenFile)).primitive;
  } catch { return ['INVERSE_METADATA']; }
  const source = text(inverseSource), svg = text(inverseSvg);
  if (!files.has(inverseSource) || sha(files.get(inverseSource)) !== sourceHash || c.sourceFile !== inverseSource || c.sourceSha256 !== sourceHash || c.candidateFile !== inverseSvg || c.candidateSha256 !== sha(svg)) errors.push('INVERSE_SOURCE');
  if (c.lifecycle !== 'CANDIDATE' || c.status !== 'CANDIDATE_READY_FOR_APPROVAL' || c.distribution !== false || c.humanVisualApproval !== 'PENDING_FINAL_VISUAL_APPROVAL' || c.version !== '1.0' || c.treatment !== 'Inverse Mono Treatment V1.0' || c.treatmentStatus !== 'APPROVED_TREATMENT_SPECIFICATION' || c.approvalDate !== '2026-09-18') errors.push('INVERSE_LIFECYCLE');
  if (c.family !== 'logo' || c.semantic !== 'inverse-mono' || c.scope !== 'micro' || !equal(c.sizesPx, [16, 24]) || !equal(c.permittedBackgrounds, backgrounds)) errors.push('INVERSE_USAGE');
  // Exact replacement protects geometry, all mask paint/strokes, metadata and ordering.
  if (!svg || svg !== source.replaceAll('fill="#111111"', 'fill="#FFFFFF"') || v.microGeometryIdentity !== 'PASS') errors.push('INVERSE_GEOMETRY');
  const visible = s => [...(s.match(/<g mask="url\(#micro-cut\)">([\s\S]*?)<\/g>/)?.[1] || '').matchAll(/\b(?:fill|stroke)="([^"]+)"/g)].map(m => m[1]);
  if (!equal(visible(source), Array(4).fill('#111111')) || !equal(visible(svg), Array(4).fill('#FFFFFF')) || c.fill !== '#FFFFFF' || !equal(c.authorizedColorMapping, { '#111111': '#FFFFFF' }) || c.unauthorizedColorMappings !== 0 || c.changedFillOccurrences !== 4 || v.sourceVisibleColorCount !== 1 || v.candidateVisibleColorCount !== 1 || v.unauthorizedColorMappings !== 0 || v.authorizedColorMapping !== 'PASS') errors.push('INVERSE_COLOR');
  const normalize = s => s.replaceAll('fill="#111111"', 'fill="AUTHORIZED"').replaceAll('fill="#FFFFFF"', 'fill="AUTHORIZED"');
  if (v.geometryProof?.sourceFingerprint !== sha(normalize(source)) || v.geometryProof?.candidateFingerprint !== sha(normalize(svg)) || v.geometryProof?.pathCountBefore !== 6 || v.geometryProof?.pathCountAfter !== 6 || v.geometryProof?.metadataChanged !== false) errors.push('INVERSE_GEOMETRY_PROOF');
  const ids = [...svg.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  const references = [...svg.matchAll(/url\(#([^\)]+)\)/g)].map(m => m[1]);
  for (const m of svg.matchAll(/aria-(?:labelledby|describedby)="([^"]+)"/g)) references.push(...m[1].split(/\s+/));
  if (new Set(ids).size !== ids.length || references.some(id => ids.filter(i => i === id).length !== 1) || !svg.includes('role="img"') || !svg.includes('aria-labelledby="title desc"') || !/<title id="title">[^<]+<\/title>/.test(svg) || !/<desc id="desc">[^<]+<\/desc>/.test(svg) || v.svgAccessibility !== 'PASS' || v.brokenReferences !== 0) errors.push('INVERSE_ACCESSIBILITY');
  if (/<(?:[\w-]+:)?(?:text|image|filter|linearGradient|radialGradient|script|style)\b|\b(?:style|opacity|filter|mix-blend-mode)\s*=/i.test(svg)) errors.push('INVERSE_FORBIDDEN_ELEMENT');
  if (v.contrast?.tokenFile !== tokenFile || v.contrast?.graphicalThreshold !== 3 || v.contrast?.result !== 'PASS' || tokens.white !== '#FFFFFF' || !equal([tokens.forest_950, tokens.forest_700], backgrounds)) errors.push('INVERSE_CONTRAST');
  for (const bg of backgrounds) {
    const ratio = contrastRatio(tokens.white, bg);
    if (ratio < 3 || Math.abs(ratio - (v.contrast?.ratios?.[bg] ?? 0)) > 1e-10) errors.push('INVERSE_CONTRAST');
  }
  const artifacts = ['render-input.html', 'render-board.png', 'pixel-inspection-6x.png'];
  for (const size of [16, 24]) for (const bg of backgrounds) {
    const name = `inverse-mono-${size}px-${bg.slice(1).toLowerCase()}.png`; artifacts.push(name);
    const png = files.get(`${inverseQa}/${name}`);
    if (!png || png.length < 24 || png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || png.readUInt32BE(16) !== size || png.readUInt32BE(20) !== size) errors.push('INVERSE_RENDER_SIZE');
    const checks = v.renderQA?.filter(q => q.sizePx === size && q.background === bg && q.result === 'PASS') || [];
    if (checks.length !== 1 || checks[0].file !== `${inverseQa}/${name}`) errors.push('INVERSE_RENDER_QA');
  }
  if (v.status !== 'PASS' || v.renderQA?.length !== 4 || v.humanVisualApproval !== 'PENDING_FINAL_VISUAL_APPROVAL') errors.push('INVERSE_RENDER_QA');
  const expected = artifacts.map(n => `${inverseQa}/${n}`).sort();
  if (!equal(v.artifacts?.map(a => a.file).sort(), expected)) errors.push('INVERSE_ARTIFACT_LIST');
  for (const a of v.artifacts || []) if (!expected.includes(a.file) || !files.has(a.file) || sha(files.get(a.file)) !== a.sha256) errors.push('INVERSE_ARTIFACT_DRIFT');
  const embedded = [...text(`${inverseQa}/render-input.html`).matchAll(/src="data:image\/svg\+xml;base64,([^"]+)"/g)].map(m => Buffer.from(m[1], 'base64'));
  if (embedded.length !== 4 || embedded.some(bytes => !bytes.equals(files.get(inverseSvg) || Buffer.alloc(0)))) errors.push('INVERSE_RENDER_SOURCE');
  const gap = registry.gaps?.find(g => g.gapId === 'dark-monochrome');
  // Historical candidate bytes and lifecycle stay immutable. Only a separately
  // validated production lock can authorize its distribution and resolve the gap.
  const productionApproved = !historical && gap?.status === 'RESOLVED' && validateInverseProduction(files, registry).length === 0;
  if (gap?.candidateFile !== `${inverseDirectory}/CANDIDATE.json` || registry.assets?.some(a => a.sourceFile?.startsWith(`${inverseDirectory}/`)) || files.has(`${inverseDirectory}/PRODUCTION-LOCK.md`) || (!historical && !productionApproved && (gap?.status !== 'CANDIDATE_READY_FOR_APPROVAL' || !registry.actionableDesignGapIds?.includes('dark-monochrome') || gap.resolvedBy))) errors.push('INVERSE_PREMATURE_PROMOTION');
  if (!historical) for (const [file, bytes] of files) if (file.startsWith('packages/brand-assets/') && (file.includes('inverse-mono') || bytes.equals(files.get(inverseSvg) || Buffer.alloc(0))) && !(productionApproved && file === inverseDistribution)) errors.push('INVERSE_PRODUCTION_DISTRIBUTION');
  const seen = new Set();
  for (const line of text(`${inverseDirectory}/MANIFEST.sha256`).trim().split(/\r?\n/)) {
    const m = line.match(/^([a-f0-9]{64})  ([\w.-]+)$/);
    if (!m || seen.has(m[2]) || !files.has(`${inverseDirectory}/${m[2]}`) || sha(files.get(`${inverseDirectory}/${m[2]}`)) !== m[1]) errors.push('INVERSE_MANIFEST');
    if (m) seen.add(m[2]);
  }
  if (!equal([...seen].sort(), ['CANDIDATE.json', 'README.md', 'VALIDATION.json', 'dvg-inverse-mono-v1.0.svg'].sort())) errors.push('INVERSE_MANIFEST');
  for (const file of files.keys()) if (file.startsWith(`${inverseDirectory}/`) && !file.endsWith('/MANIFEST.sha256') && !seen.has(file.slice(inverseDirectory.length + 1))) errors.push('INVERSE_MANIFEST');
  return errors;
}

export function validateInverseProduction(files, registry) {
  const errors = [], dir = inverseProductionDirectory, source = `${dir}/dvg-inverse-mono-v1.0.svg`;
  const text = p => files.get(p)?.toString('utf8') || '';
  let lock, proof, historicalProof;
  try {
    lock = JSON.parse(text(`${dir}/LOCK.json`));
    proof = JSON.parse(text(`${dir}/PRODUCTION-VALIDATION.json`));
    historicalProof = JSON.parse(text(`${inverseDirectory}/VALIDATION.json`));
  } catch { return ['INVERSE_PRODUCTION_METADATA']; }
  errors.push(...validateInverseMono(files, registry, true));
  const hash = '4c8d3e0be650f5e5ac67c70e44b11fd6101e5bffcab81712aa57686abdd5cb64';
  if (!files.has(inverseSvg) || sha(files.get(inverseSvg)) !== hash) errors.push('INVERSE_APPROVED_CANDIDATE_INTEGRITY');
  if (!files.has(source) || !files.get(source)?.equals(files.get(inverseSvg) || Buffer.alloc(0))) errors.push('INVERSE_CANDIDATE_PRODUCTION_IDENTITY');
  if (!files.has(inverseDistribution) || !files.has(source) || !files.get(inverseDistribution)?.equals(files.get(source) || Buffer.alloc(0))) errors.push('INVERSE_PRODUCTION_DISTRIBUTION_IDENTITY');
  if (text(source) !== text(inverseSource).replaceAll('fill="#111111"', 'fill="#FFFFFF"')) errors.push('INVERSE_PRODUCTION_GEOMETRY_COLOR');
  const matching = registry.assets?.filter(a => a.assetId === 'dvg-logo-inverse-mono-v1.0' || a.roles?.includes('CANONICAL_INVERSE_MONO_MICRO')) || [];
  const a = matching[0];
  if (matching.length !== 1 || a?.assetId !== 'dvg-logo-inverse-mono-v1.0' || a?.assetClass !== 'logo' || a?.semantic !== 'inverse-mono' || a?.theme !== 'dark' || a?.sourceFile !== source || a?.productionPath !== inverseDistribution || !equal(a?.roles, ['CANONICAL_INVERSE_MONO_MICRO']) || a?.checksum?.value !== hash || a?.lockSource !== `${dir}/LOCK.json` || a?.validationSource !== `${dir}/PRODUCTION-VALIDATION.json`) errors.push('INVERSE_PRODUCTION_REGISTRY');
  for (const record of [lock, a]) {
    if (!record || record.status !== 'PRODUCTION_LOCKED' || record.version !== '1.0' || record.distribution !== true || record.approvalDate !== '2026-09-18') errors.push('INVERSE_PRODUCTION_LIFECYCLE');
    if (!record || record.scope !== 'micro' || record.fill !== '#FFFFFF' || record.visibleColorCount !== 1 || record.treatment !== 'Inverse Mono Treatment V1.0' || record.geometryParent !== 'Time Trace V3 Micro V1.4 Mono' || record.geometrySource !== inverseSource || !equal(record.authorizedColorMapping, { '#111111': '#FFFFFF' })) errors.push('INVERSE_PRODUCTION_TREATMENT');
  }
  for (const usage of [lock, a?.usage]) if (!equal(usage?.sizesPx, [16, 24]) || !equal(usage?.permittedBackgrounds, backgrounds)) errors.push('INVERSE_PRODUCTION_USAGE');
  if (lock.asset !== 'Inverse Mono' || lock.humanVisualApproval !== 'APPROVED' || lock.approvedCandidate !== inverseSvg || lock.approvedCandidateSha256 !== hash || lock.parentSha256 !== sourceHash || lock.canonicalFile !== 'dvg-inverse-mono-v1.0.svg' || lock.geometryChanged !== false || lock.pathsChanged !== false || lock.visualCandidateChangedAfterApproval !== false || lock.unauthorizedColorMappings !== 0) errors.push('INVERSE_PRODUCTION_LOCK');
  if (proof.status !== 'PASS' || proof.lifecycle !== 'PRODUCTION_LOCKED' || proof.humanVisualApproval !== 'APPROVED' || proof.approvalDate !== '2026-09-18' || [proof.candidateSha256, proof.productionSha256, proof.distributionSha256].some(h => h !== hash) || proof.candidateProductionByteIdentity !== 'PASS' || proof.productionDistributionByteIdentity !== 'PASS') errors.push('INVERSE_PRODUCTION_PROOF');
  for (const [key, value] of Object.entries(historicalProof)) if (key !== 'humanVisualApproval' && !equal(proof[key], value)) errors.push('INVERSE_PRODUCTION_EVIDENCE_DRIFT');
  const lockFile = 'docs/brand/locks/inverse-mono-v1.0.md';
  if (lock.repositoryLock !== lockFile || a?.repositoryLockFile !== lockFile || !text(lockFile).includes('PRODUCTION_LOCKED')) errors.push('INVERSE_REPOSITORY_LOCK');
  const gap = registry.gaps?.find(g => g.gapId === 'dark-monochrome');
  if (gap?.status !== 'RESOLVED' || !equal(gap.resolvedBy, ['dvg-logo-inverse-mono-v1.0']) || registry.actionableDesignGapIds?.includes('dark-monochrome')) errors.push('INVERSE_PRODUCTION_GAP');
  const manifest = `${dir}/MANIFEST.sha256`, record = registry.sourcePackages?.find(p => p.sourceDirectory === dir);
  if (record?.manifestFile !== manifest || record?.checksum?.value !== sha(text(manifest)) || record?.status !== 'PRODUCTION_LOCKED' || record?.distribution !== true) errors.push('INVERSE_PRODUCTION_MANIFEST');
  const seen = new Set();
  for (const line of text(manifest).trim().split(/\r?\n/)) {
    const m = line.match(/^([a-f0-9]{64})  ([\w.-]+)$/);
    if (!m || seen.has(m[2]) || !files.has(`${dir}/${m[2]}`) || sha(files.get(`${dir}/${m[2]}`)) !== m[1]) errors.push('INVERSE_PRODUCTION_MANIFEST');
    if (m) seen.add(m[2]);
  }
  if (!equal([...seen].sort(), ['LOCK.json', 'PRODUCTION-LOCK.md', 'PRODUCTION-VALIDATION.json', 'README.md', 'dvg-inverse-mono-v1.0.svg'].sort())) errors.push('INVERSE_PRODUCTION_MANIFEST');
  for (const file of files.keys()) if (file.startsWith(`${dir}/`) && file !== manifest && !seen.has(file.slice(dir.length + 1))) errors.push('INVERSE_PRODUCTION_MANIFEST');
  return errors;
}
