import { createHash } from 'node:crypto';

const bible = 'Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED';
export const citationDirectory = `${bible}/04-Iconography/Dau-Viet-Global-Citation-Trust-Glyph-V1.0-CANDIDATE`;
export const citationSvg = `${citationDirectory}/dvg-trust-citation-v1.0.svg`;
export const citationQa = 'docs/brand/qa/citation-v1.0';
export const citationLeft = 'M8 6 H6.5 C5.67 6 5 6.67 5 7.5 V16.5 C5 17.33 5.67 18 6.5 18 H8';
export const citationRight = 'M16 6 H17.5 C18.33 6 19 6.67 19 7.5 V16.5 C19 17.33 18.33 18 17.5 18 H16';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const root = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" role="img" aria-labelledby="citation-title citation-desc">';
const geometry = `<path d="${citationLeft}"/>\n<path d="${citationRight}"/>\n<circle cx="12" cy="12" r="1.5"/>`;
export const citationGeometryHash = sha(geometry);
export const citationProductionDirectory = citationDirectory.replace('-CANDIDATE', '-PRODUCTION-LOCKED');
export const citationProductionSvg = `${citationProductionDirectory}/dvg-trust-citation-v1.0.svg`;
export const citationDistribution = 'packages/brand-icons/canonical/trust/dvg-trust-citation-v1.0.svg';
const approvedHash = 'db8d2a65ff86be3eb565af66dfa7da1fffb5806ebd8931b84b99002ef9ab9ad9';

export function validateCitationProduction(files, registry) {
  const errors = [], dir = citationProductionDirectory, text = p => files.get(p)?.toString('utf8') || '';
  let lock, proof, candidate, historicalProof;
  try {
    lock = JSON.parse(text(`${dir}/LOCK.json`));
    proof = JSON.parse(text(`${dir}/PRODUCTION-VALIDATION.json`));
    candidate = JSON.parse(text(`${citationDirectory}/CANDIDATE.json`));
    historicalProof = JSON.parse(text(`${citationDirectory}/VALIDATION.json`));
  } catch { return ['CITATION_PRODUCTION_METADATA']; }
  errors.push(...validateCitation(files, registry, true));
  if (!files.has(citationSvg) || sha(files.get(citationSvg)) !== approvedHash) errors.push('CITATION_APPROVED_INTEGRITY');
  if (!files.has(citationProductionSvg) || !files.get(citationProductionSvg)?.equals(files.get(citationSvg) || Buffer.alloc(0))) errors.push('CITATION_PRODUCTION_BYTE_IDENTITY');
  if (!files.has(citationDistribution) || !files.has(citationProductionSvg) || !files.get(citationDistribution)?.equals(files.get(citationProductionSvg) || Buffer.alloc(0))) errors.push('CITATION_DISTRIBUTION_BYTE_IDENTITY');
  errors.push(...citationSvgErrors(text(citationProductionSvg)));
  const matches = registry.assets?.filter(a => a.semantic === 'citation' || a.assetId === 'dvg-trust-citation-v1.0') || [], a = matches[0];
  if (matches.length !== 1 || a?.assetId !== 'dvg-trust-citation-v1.0' || a?.assetClass !== 'trust-glyph' || a?.sourceFile !== citationProductionSvg || a?.productionPath !== citationDistribution || a?.checksum?.value !== approvedHash || a?.checksum?.algorithm !== 'sha256' || a?.bytes !== files.get(citationSvg)?.length || a?.lockSource !== `${dir}/LOCK.json` || a?.validationSource !== `${dir}/PRODUCTION-VALIDATION.json`) errors.push('CITATION_PRODUCTION_REGISTRY');
  for (const record of [lock, a]) {
    if (record?.status !== 'PRODUCTION_LOCKED' || record?.version !== '1.0' || record?.distribution !== true || record?.approvalDate !== '2026-09-18') errors.push('CITATION_PRODUCTION_LIFECYCLE');
    for (const key of ['family', 'semantic', 'semanticDefinition', 'metaphor', 'construction', 'grid', 'viewBox', 'strokeWidth', 'linecap', 'linejoin', 'fill', 'stroke', 'geometry', 'sizesPx', 'preferredSizePx', 'minimumSizePx', 'micro16', 'size16Status']) if (!equal(record?.[key], candidate[key])) errors.push('CITATION_PRODUCTION_POLICY');
  }
  if (lock.lifecycle !== 'PRODUCTION_LOCKED' || lock.asset !== 'Citation Trust Glyph' || lock.humanVisualApproval !== 'APPROVED' || lock.approvedCandidate !== citationSvg || lock.approvedCandidateSha256 !== approvedHash || lock.canonicalFile !== 'dvg-trust-citation-v1.0.svg' || lock.visualCandidateChangedAfterApproval !== false) errors.push('CITATION_PRODUCTION_LOCK');
  if (proof.lifecycle !== 'PRODUCTION_LOCKED' || proof.humanVisualApproval !== 'APPROVED' || proof.approvalDate !== '2026-09-18' || [proof.candidateSha256, proof.productionSha256, proof.distributionSha256].some(h => h !== approvedHash) || proof.candidateProductionByteIdentity !== 'PASS' || proof.productionDistributionByteIdentity !== 'PASS') errors.push('CITATION_PRODUCTION_PROOF');
  for (const [key, value] of Object.entries(historicalProof)) if (key !== 'humanVisualApproval' && !equal(proof[key], value)) errors.push('CITATION_PRODUCTION_QA');
  const lockFile = 'docs/brand/locks/citation-trust-glyph-v1.0.md';
  if (lock.repositoryLock !== lockFile || a?.repositoryLockFile !== lockFile || !text(lockFile).includes('PRODUCTION_LOCKED')) errors.push('CITATION_REPOSITORY_LOCK');
  const gap = registry.gaps?.find(g => g.gapId === 'glyph-citation');
  if (gap?.status !== 'RESOLVED' || !equal(gap.resolvedBy, ['dvg-trust-citation-v1.0']) || registry.actionableDesignGapIds?.includes('glyph-citation')) errors.push('CITATION_PRODUCTION_GAP');
  const manifest = `${dir}/MANIFEST.sha256`, record = registry.sourcePackages?.find(p => p.sourceDirectory === dir);
  if (record?.manifestFile !== manifest || record?.checksum?.value !== sha(text(manifest)) || record?.status !== 'PRODUCTION_LOCKED' || record?.distribution !== true) errors.push('CITATION_PRODUCTION_MANIFEST');
  const seen = new Set();
  for (const line of text(manifest).trim().split(/\r?\n/)) {
    const m = line.match(/^([a-f0-9]{64})  ([\w.-]+)$/);
    if (!m || seen.has(m[2]) || !files.has(`${dir}/${m[2]}`) || sha(files.get(`${dir}/${m[2]}`)) !== m[1]) errors.push('CITATION_PRODUCTION_MANIFEST');
    if (m) seen.add(m[2]);
  }
  if (!equal([...seen].sort(), ['LOCK.json', 'PRODUCTION-LOCK.md', 'PRODUCTION-VALIDATION.json', 'README.md', 'dvg-trust-citation-v1.0.svg'].sort())) errors.push('CITATION_PRODUCTION_MANIFEST');
  for (const p of files.keys()) if (p.startsWith(`${dir}/`) && p !== manifest && !seen.has(p.slice(dir.length + 1))) errors.push('CITATION_PRODUCTION_MANIFEST');
  return errors;
}

export function citationSvgErrors(svg) {
  const errors = [];
  if (svg.split('\n')[0] !== root) errors.push('CITATION_STYLE');
  if (svg.split('</desc>\n')[1] !== `${geometry}\n</svg>\n`) errors.push('CITATION_GEOMETRY');
  const ids = [...svg.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  if (!equal(ids, ['citation-title', 'citation-desc']) || !svg.includes('role="img"') || !svg.includes('aria-labelledby="citation-title citation-desc"') || !/<title id="citation-title">[^<]+<\/title>/.test(svg) || !/<desc id="citation-desc">[^<]+<\/desc>/.test(svg)) errors.push('CITATION_ACCESSIBILITY');
  // Exact standalone skeleton also excludes extra geometry, attributes, external
  // references, embedded fonts, masks, clips, styling, effects and live text.
  const skeleton = `${root}\n<title id="citation-title">TITLE</title>\n<desc id="citation-desc">DESC</desc>\n${geometry}\n</svg>\n`;
  const normalized = svg.replace(/(<title id="citation-title">)[^<]+(<\/title>)/, '$1TITLE$2').replace(/(<desc id="citation-desc">)[^<]+(<\/desc>)/, '$1DESC$2');
  if (normalized !== skeleton) errors.push('CITATION_SVG_STRUCTURE');
  return errors;
}

export function validateCitation(files, registry, historical = false) {
  const errors = [], text = p => files.get(p)?.toString('utf8') || '';
  let c, v;
  try { c = JSON.parse(text(`${citationDirectory}/CANDIDATE.json`)); v = JSON.parse(text(`${citationDirectory}/VALIDATION.json`)); }
  catch { return ['CITATION_METADATA']; }
  const svg = text(citationSvg); errors.push(...citationSvgErrors(svg));
  if (!files.has(citationSvg) || c.candidateFile !== citationSvg || c.candidateSha256 !== sha(svg)) errors.push('CITATION_INTEGRITY');
  if (c.family !== 'trust-glyph' || c.semantic !== 'citation' || c.semanticDefinition !== 'source marker + accessible label' || c.metaphor !== 'Reference Brackets + Source Point' || c.construction !== 'Citation Trust Glyph Construction V1.0' || c.constructionApproval !== 'APPROVED' || c.approvalDate !== '2026-09-18') errors.push('CITATION_CONSTRUCTION');
  if (c.version !== '1.0' || c.lifecycle !== 'CANDIDATE' || c.status !== 'CANDIDATE_READY_FOR_APPROVAL' || c.distribution !== false || c.humanVisualApproval !== 'PENDING_FINAL_VISUAL_APPROVAL') errors.push('CITATION_LIFECYCLE');
  if (!equal(c.sizesPx, [20, 24, 32]) || c.preferredSizePx !== 24 || c.minimumSizePx !== 20 || c.micro16 !== false || c.size16Status !== 'NOT_SUPPORTED') errors.push('CITATION_SIZE_POLICY');
  if (c.grid !== 24 || c.viewBox !== '0 0 24 24' || c.strokeWidth !== 1.75 || c.linecap !== 'round' || c.linejoin !== 'round' || c.fill !== 'none' || c.stroke !== 'currentColor' || !equal(c.geometry, { left: citationLeft, right: citationRight, circle: { cx: 12, cy: 12, r: 1.5 } })) errors.push('CITATION_CONSTRUCTION');
  if (c.sourceEvidence?.length !== 3) errors.push('CITATION_SOURCE_EVIDENCE');
  for (const e of c.sourceEvidence || []) if (!e.file.startsWith(`${bible}/`) || !files.has(e.file) || sha(files.get(e.file)) !== e.sha256) errors.push('CITATION_SOURCE_EVIDENCE');
  if (v.status !== 'PASS' || v.geometryIdentity !== 'PASS' || v.geometryFingerprint !== citationGeometryHash || v.pathCount !== 2 || v.circleCount !== 1 || v.flatVector !== 'PASS' || v.svgAccessibility !== 'PASS' || v.brokenReferences !== 0 || v.humanVisualApproval !== 'PENDING_FINAL_VISUAL_APPROVAL') errors.push('CITATION_PROOF');
  const expectedArtifacts = ['render-input.html', 'render-board.png', 'pixel-inspection.png'];
  for (const size of [20, 24, 32]) {
    const name = `citation-${size}px.png`; expectedArtifacts.push(name);
    const png = files.get(`${citationQa}/${name}`);
    if (!png || png.length < 24 || png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || png.readUInt32BE(16) !== size || png.readUInt32BE(20) !== size) errors.push('CITATION_QA_SIZE');
    const q = v.renderQA?.filter(q => q.sizePx === size && q.result === 'PASS') || [];
    if (q.length !== 1 || q[0].file !== `${citationQa}/${name}` || q[0].foreground !== '#1A1A1A' || q[0].background !== '#FFFFFF') errors.push('CITATION_QA');
  }
  if (v.renderQA?.length !== 3 || v.qaColorPolicy !== 'QA_CONTEXT_ONLY_NOT_NEW_TOKENS') errors.push('CITATION_QA');
  const expected = expectedArtifacts.map(n => `${citationQa}/${n}`).sort();
  if (!equal(v.artifacts?.map(a => a.file).sort(), expected)) errors.push('CITATION_QA_ARTIFACTS');
  for (const e of v.artifacts || []) if (!expected.includes(e.file) || !files.has(e.file) || sha(files.get(e.file)) !== e.sha256) errors.push('CITATION_QA_ARTIFACTS');
  const wrapper = '<!doctype html><html><meta charset="utf-8"><style>html,body{margin:0;background:#FFFFFF;color:#1A1A1A}svg{display:block;width:100vw;height:100vh}</style>';
  const frames = [...text(`${citationQa}/render-input.html`).matchAll(/<iframe title="Citation (\d+)px actual candidate" width="(\d+)" height="(\d+)" style="left:(\d+)px" src="data:text\/html;base64,([^"]+)"><\/iframe>/g)];
  if (frames.length !== 3 || frames.some((m, i) => m[1] !== String([20, 24, 32][i]) || m[2] !== m[1] || m[3] !== m[1] || m[4] !== String(40 + i * 180) || Buffer.from(m[5], 'base64').toString('utf8') !== wrapper + svg + '</html>')) errors.push('CITATION_RENDER_SOURCE');
  const gap = registry.gaps?.find(g => g.gapId === 'glyph-citation');
  const productionApproved = !historical && gap?.status === 'RESOLVED' && validateCitationProduction(files, registry).length === 0;
  if (gap?.candidateFile !== `${citationDirectory}/CANDIDATE.json` || registry.assets?.some(a => a.sourceFile?.startsWith(`${citationDirectory}/`)) || files.has(`${citationDirectory}/PRODUCTION-LOCK.md`) || (!historical && !productionApproved && (gap?.status !== 'CANDIDATE_READY_FOR_APPROVAL' || gap.resolvedBy || !registry.actionableDesignGapIds?.includes('glyph-citation') || registry.assets?.some(a => a.semantic === 'citation')))) errors.push('CITATION_PREMATURE_PROMOTION');
  if (!historical) for (const [p, bytes] of files) if ((p.startsWith('packages/brand-icons/') || p.startsWith('packages/brand-assets/')) && (p.endsWith('.svg') && (p.includes('citation') || bytes.equals(files.get(citationSvg) || Buffer.alloc(0)))) && !(productionApproved && p === citationDistribution)) errors.push('CITATION_PREMATURE_DISTRIBUTION');
  const seen = new Set();
  for (const line of text(`${citationDirectory}/MANIFEST.sha256`).trim().split(/\r?\n/)) {
    const m = line.match(/^([a-f0-9]{64})  ([\w.-]+)$/);
    if (!m || seen.has(m[2]) || !files.has(`${citationDirectory}/${m[2]}`) || sha(files.get(`${citationDirectory}/${m[2]}`)) !== m[1]) errors.push('CITATION_MANIFEST');
    if (m) seen.add(m[2]);
  }
  if (!equal([...seen].sort(), ['CANDIDATE.json', 'README.md', 'VALIDATION.json', 'dvg-trust-citation-v1.0.svg'].sort())) errors.push('CITATION_MANIFEST');
  for (const p of files.keys()) if (p.startsWith(`${citationDirectory}/`) && !p.endsWith('/MANIFEST.sha256') && !seen.has(p.slice(citationDirectory.length + 1))) errors.push('CITATION_MANIFEST');
  return errors;
}
