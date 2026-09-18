import { createHash } from 'node:crypto';

const bible = 'Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED';
export const evidenceDirectory = `${bible}/04-Iconography/Dau-Viet-Global-Evidence-Trust-Glyph-V1.0-CANDIDATE`;
export const evidenceSvg = `${evidenceDirectory}/dvg-trust-evidence-v1.0.svg`;
export const evidenceQa = 'docs/brand/qa/evidence-v1.0';
export const evidencePaths = ['M6.5 4.5 H13 L16.5 8 V11', 'M13 4.5 V8 H16.5', 'M6.5 4.5 V19.5 H11', 'M17 17.5 L20 20.5'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const root = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" role="img" aria-labelledby="evidence-title evidence-desc">';
const geometry = `<path d="${evidencePaths[0]}"/>\n<path d="${evidencePaths[1]}"/>\n<path d="${evidencePaths[2]}"/>\n<circle cx="14.5" cy="15" r="3.5"/>\n<path d="${evidencePaths[3]}"/>`;
export const evidenceGeometryHash = sha(geometry);
export function evidenceSvgErrors(svg) {
  const errors = [];
  if (svg.split('\n')[0] !== root) errors.push('EVIDENCE_STYLE');
  if (svg.split('</desc>\n')[1] !== `${geometry}\n</svg>\n`) errors.push('EVIDENCE_GEOMETRY');
  const ids = [...svg.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  if (!equal(ids, ['evidence-title', 'evidence-desc']) || !svg.includes('role="img"') || !svg.includes('aria-labelledby="evidence-title evidence-desc"') || !/<title id="evidence-title">[^<]+<\/title>/.test(svg) || !/<desc id="evidence-desc">[^<]+<\/desc>/.test(svg)) errors.push('EVIDENCE_ACCESSIBILITY');
  // Exact standalone skeleton also excludes extra geometry, attributes, external
  // references, embedded fonts, masks, clips, styling, effects and live text.
  const skeleton = `${root}\n<title id="evidence-title">TITLE</title>\n<desc id="evidence-desc">DESC</desc>\n${geometry}\n</svg>\n`;
  const normalized = svg.replace(/(<title id="evidence-title">)[^<]+(<\/title>)/, '$1TITLE$2').replace(/(<desc id="evidence-desc">)[^<]+(<\/desc>)/, '$1DESC$2');
  if (normalized !== skeleton) errors.push('EVIDENCE_SVG_STRUCTURE');
  return errors;
}

export function validateEvidence(files, registry) {
  const errors = [], text = p => files.get(p)?.toString('utf8') || '';
  let c, v;
  try { c = JSON.parse(text(`${evidenceDirectory}/CANDIDATE.json`)); v = JSON.parse(text(`${evidenceDirectory}/VALIDATION.json`)); }
  catch { return ['EVIDENCE_METADATA']; }
  const svg = text(evidenceSvg); errors.push(...evidenceSvgErrors(svg));
  if (!files.has(evidenceSvg) || c.candidateFile !== evidenceSvg || c.candidateSha256 !== sha(svg)) errors.push('EVIDENCE_INTEGRITY');
  if (c.family !== 'trust-glyph' || c.semantic !== 'evidence' || c.semanticDefinition !== 'Supporting historical material/document/artifact that can be inspected with identity, provenance and citation context.' || c.metaphor !== 'Document + Inspection Lens' || c.construction !== 'Evidence Trust Glyph Construction V1.0' || c.constructionApproval !== 'APPROVED' || c.approvalDate !== '2026-09-18') errors.push('EVIDENCE_CONSTRUCTION');
  if (c.version !== '1.0' || c.lifecycle !== 'CANDIDATE' || c.status !== 'CANDIDATE_READY_FOR_APPROVAL' || c.distribution !== false || c.humanVisualApproval !== 'PENDING_FINAL_VISUAL_APPROVAL') errors.push('EVIDENCE_LIFECYCLE');
  if (!equal(c.sizesPx, [20, 24, 32]) || c.preferredSizePx !== 24 || c.minimumSizePx !== 20 || c.micro16 !== false || c.size16Status !== 'NOT_SUPPORTED') errors.push('EVIDENCE_SIZE_POLICY');
  if (c.grid !== 24 || c.viewBox !== '0 0 24 24' || c.strokeWidth !== 1.75 || c.linecap !== 'round' || c.linejoin !== 'round' || c.fill !== 'none' || c.stroke !== 'currentColor' || !equal(c.geometry, { paths: evidencePaths, circle: { cx: 14.5, cy: 15, r: 3.5 }, order: ['path1', 'path2', 'path3', 'circle', 'path4'], intentionalOpenDocument: true })) errors.push('EVIDENCE_CONSTRUCTION');
  if (c.sourceEvidence?.length !== 3) errors.push('EVIDENCE_SOURCE_EVIDENCE');
  for (const e of c.sourceEvidence || []) if (!e.file.startsWith(`${bible}/`) || !files.has(e.file) || sha(files.get(e.file)) !== e.sha256) errors.push('EVIDENCE_SOURCE_EVIDENCE');
  if (v.status !== 'PASS' || v.geometryIdentity !== 'PASS' || v.geometryFingerprint !== evidenceGeometryHash || v.pathCount !== 4 || v.circleCount !== 1 || v.flatVector !== 'PASS' || v.svgAccessibility !== 'PASS' || v.brokenReferences !== 0 || v.humanVisualApproval !== 'PENDING_FINAL_VISUAL_APPROVAL') errors.push('EVIDENCE_PROOF');
  const expectedArtifacts = ['render-input.html', 'render-board.png', 'pixel-inspection.png'];
  for (const size of [20, 24, 32]) {
    const name = `evidence-${size}px.png`; expectedArtifacts.push(name);
    const png = files.get(`${evidenceQa}/${name}`);
    if (!png || png.length < 24 || png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || png.readUInt32BE(16) !== size || png.readUInt32BE(20) !== size) errors.push('EVIDENCE_QA_SIZE');
    const q = v.renderQA?.filter(q => q.sizePx === size && q.result === 'PASS') || [];
    if (q.length !== 1 || q[0].file !== `${evidenceQa}/${name}` || q[0].foreground !== '#1A1A1A' || q[0].background !== '#FFFFFF') errors.push('EVIDENCE_QA');
  }
  if (v.renderQA?.length !== 3 || v.qaColorPolicy !== 'QA_CONTEXT_ONLY_NOT_NEW_TOKENS') errors.push('EVIDENCE_QA');
  const expected = expectedArtifacts.map(n => `${evidenceQa}/${n}`).sort();
  if (!equal(v.artifacts?.map(a => a.file).sort(), expected)) errors.push('EVIDENCE_QA_ARTIFACTS');
  for (const e of v.artifacts || []) if (!expected.includes(e.file) || !files.has(e.file) || sha(files.get(e.file)) !== e.sha256) errors.push('EVIDENCE_QA_ARTIFACTS');
  const wrapper = '<!doctype html><html><meta charset="utf-8"><style>html,body{margin:0;background:#FFFFFF;color:#1A1A1A}svg{display:block;width:100vw;height:100vh}</style>';
  const frames = [...text(`${evidenceQa}/render-input.html`).matchAll(/<iframe title="Evidence (\d+)px actual candidate" width="(\d+)" height="(\d+)" style="left:(\d+)px" src="data:text\/html;base64,([^"]+)"><\/iframe>/g)];
  if (frames.length !== 3 || frames.some((m, i) => m[1] !== String([20, 24, 32][i]) || m[2] !== m[1] || m[3] !== m[1] || m[4] !== String(40 + i * 180) || Buffer.from(m[5], 'base64').toString('utf8') !== wrapper + svg + '</html>')) errors.push('EVIDENCE_RENDER_SOURCE');
  const gap = registry.gaps?.find(g => g.gapId === 'glyph-evidence');
  if (gap?.status !== 'CANDIDATE_READY_FOR_APPROVAL' || gap.candidateFile !== `${evidenceDirectory}/CANDIDATE.json` || gap.resolvedBy || !registry.actionableDesignGapIds?.includes('glyph-evidence') || registry.assets?.some(a => a.sourceFile?.startsWith(`${evidenceDirectory}/`) || a.semantic === 'evidence') || files.has(`${evidenceDirectory}/PRODUCTION-LOCK.md`)) errors.push('EVIDENCE_PREMATURE_PROMOTION');
  for (const [p, bytes] of files) if ((p.startsWith('packages/brand-icons/') || p.startsWith('packages/brand-assets/')) && (p.includes('evidence') || bytes.equals(files.get(evidenceSvg) || Buffer.alloc(0)))) errors.push('EVIDENCE_PREMATURE_DISTRIBUTION');
  const seen = new Set();
  for (const line of text(`${evidenceDirectory}/MANIFEST.sha256`).trim().split(/\r?\n/)) {
    const m = line.match(/^([a-f0-9]{64})  ([\w.-]+)$/);
    if (!m || seen.has(m[2]) || !files.has(`${evidenceDirectory}/${m[2]}`) || sha(files.get(`${evidenceDirectory}/${m[2]}`)) !== m[1]) errors.push('EVIDENCE_MANIFEST');
    if (m) seen.add(m[2]);
  }
  if (!equal([...seen].sort(), ['CANDIDATE.json', 'README.md', 'VALIDATION.json', 'dvg-trust-evidence-v1.0.svg'].sort())) errors.push('EVIDENCE_MANIFEST');
  for (const p of files.keys()) if (p.startsWith(`${evidenceDirectory}/`) && !p.endsWith('/MANIFEST.sha256') && !seen.has(p.slice(evidenceDirectory.length + 1))) errors.push('EVIDENCE_MANIFEST');
  return errors;
}
