import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { collectSnapshot, validateSnapshot } from './validate.mjs';
import { validateInverseMono, validateInverseProduction, inverseProductionDirectory as production, inverseDistribution as distribution, inverseDirectory as dir, inverseSource as source, inverseSvg as svg, inverseQa as qa } from './validate-inverse-mono.mjs';

const baseline = collectSnapshot(fileURLToPath(new URL('../../', import.meta.url)));
const registry = JSON.parse(baseline.get('packages/brand-contracts/brand-registry.json'));
const changedJson = (name, mutate) => {
  const files = new Map(baseline), path = `${dir}/${name}`, value = JSON.parse(files.get(path));
  mutate(value); files.set(path, Buffer.from(JSON.stringify(value))); return files;
};

test('inverse candidate has exact source geometry and only four authorized white fills', () => {
  assert.deepEqual(validateInverseMono(baseline, registry), []);
  assert.deepEqual(validateSnapshot(baseline), []);
  assert.equal(baseline.get(svg).toString(), baseline.get(source).toString().replaceAll('fill="#111111"', 'fill="#FFFFFF"'));
  for (const p of [source, svg]) {
    const files = new Map(baseline); files.delete(p);
    assert.ok(validateInverseMono(files, registry).some(e => /INVERSE_SOURCE|INVERSE_GEOMETRY/.test(e)));
  }
});

test('inverse rejects geometry, mask and second visible color changes', () => {
  for (const mutate of [s => s.replace('M10.8', 'M11.8'), s => s.replace('stroke-width="2.1"', 'stroke-width="2.2"'), s => s.replace('0 0 32 32', '0 0 33 32'), s => s.replace('fill="#FFFFFF"', 'fill="#D4AF7C"'), s => s.replace('fill="#FFFFFF"', 'fill="#EADDC7"')]) {
    const files = new Map(baseline); files.set(svg, Buffer.from(mutate(files.get(svg).toString())));
    assert.ok(validateInverseMono(files, registry).includes('INVERSE_GEOMETRY'));
  }
  const files = new Map(baseline); files.set(source, Buffer.from(files.get(source).toString().replace('#111111', '#000000')));
  assert.ok(validateInverseMono(files, registry).includes('INVERSE_SOURCE'));
  assert.ok(validateInverseMono(files, registry).includes('INVERSE_COLOR'));
});

test('inverse lifecycle stays pending and cannot broaden micro scope or surfaces', () => {
  for (const [mutate, code] of [
    [c => { c.lifecycle = 'PRODUCTION_LOCKED'; }, 'INVERSE_LIFECYCLE'],
    [c => { c.distribution = true; }, 'INVERSE_LIFECYCLE'],
    [c => { c.humanVisualApproval = 'APPROVED'; }, 'INVERSE_LIFECYCLE'],
    [c => { c.scope = 'master'; }, 'INVERSE_USAGE'],
    [c => { c.sizesPx.push(32); }, 'INVERSE_USAGE'],
    [c => { c.permittedBackgrounds.push('#FFFFFF'); }, 'INVERSE_USAGE'],
    [c => { c.authorizedColorMapping['#D4AF7C'] = '#FFFFFF'; }, 'INVERSE_COLOR'],
  ]) assert.ok(validateInverseMono(changedJson('CANDIDATE.json', mutate), registry).includes(code));
});

test('inverse rejects accessibility damage, missing mask IDs and effects', () => {
  for (const before of ['id="title"', 'id="desc"', 'id="micro-cut"']) {
    const files = new Map(baseline); files.set(svg, Buffer.from(files.get(svg).toString().replace(before, 'id="missing"')));
    assert.ok(validateInverseMono(files, registry).includes('INVERSE_ACCESSIBILITY'));
  }
  for (const tag of ['text', 'image', 'filter', 'linearGradient', 'radialGradient', 'script', 'style']) {
    const files = new Map(baseline); files.set(svg, Buffer.from(files.get(svg).toString().replace('</svg>', `<${tag}/></svg>`)));
    assert.ok(validateInverseMono(files, registry).includes('INVERSE_FORBIDDEN_ELEMENT'));
  }
});

test('inverse requires recalculated contrast and four distinct passing render combinations', () => {
  for (const [mutate, code] of [
    [v => { v.contrast.ratios['#18463C'] = 20; }, 'INVERSE_CONTRAST'],
    [v => { v.renderQA[0] = v.renderQA[1]; }, 'INVERSE_RENDER_QA'],
    [v => { v.renderQA[0].result = 'FAIL'; }, 'INVERSE_RENDER_QA'],
    [v => { v.candidateVisibleColorCount = 2; }, 'INVERSE_COLOR'],
    [v => { v.geometryProof.pathCountAfter = 7; }, 'INVERSE_GEOMETRY_PROOF'],
  ]) assert.ok(validateInverseMono(changedJson('VALIDATION.json', mutate), registry).includes(code));
});

test('inverse QA requires actual candidate embedding, native pixels and pinned evidence', () => {
  const files = new Map(baseline), p = `${qa}/inverse-mono-16px-062a24.png`;
  const png = Buffer.from(files.get(p)); png.writeUInt32BE(24, 16); files.set(p, png);
  assert.ok(validateInverseMono(files, registry).includes('INVERSE_RENDER_SIZE'));
  assert.ok(validateInverseMono(files, registry).includes('INVERSE_ARTIFACT_DRIFT'));
  const html = `${qa}/render-input.html`; files.set(html, Buffer.from(files.get(html).toString().replaceAll('data:image/svg+xml;base64,', 'data:image/png;base64,')));
  assert.ok(validateInverseMono(files, registry).includes('INVERSE_RENDER_SOURCE'));
  files.delete(`${qa}/pixel-inspection-6x.png`);
  assert.ok(validateInverseMono(files, registry).includes('INVERSE_ARTIFACT_DRIFT'));
});

test('inverse gap cannot resolve or become production distribution before approval', () => {
  for (const status of ['CANDIDATE_READY_FOR_APPROVAL', 'PRODUCTION_LOCKED', 'CANONICAL_ASSET_GAP']) {
    const r = structuredClone(registry); r.gaps.find(g => g.gapId === 'dark-monochrome').status = status;
    assert.ok(validateInverseMono(baseline, r).includes('INVERSE_PREMATURE_PROMOTION'));
  }
  const files = new Map(baseline); files.delete('Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED/01-Logo-Master-Geometry/Dau-Viet-Global-Inverse-Mono-V1.0-PRODUCTION-LOCKED/LOCK.json');
  files.set('packages/brand-assets/logo/micro/dvg-inverse-mono-v1.0.svg', files.get(svg));
  assert.ok(validateInverseMono(files, registry).includes('INVERSE_PRODUCTION_DISTRIBUTION'));
  files.set(`${dir}/PRODUCTION-LOCK.md`, Buffer.from('PRODUCTION_LOCKED'));
  assert.ok(validateInverseMono(files, registry).includes('INVERSE_PREMATURE_PROMOTION'));
});

test('inverse candidate manifest is complete and immutable against unrecorded changes', () => {
  const files = new Map(baseline); files.delete(`${dir}/MANIFEST.sha256`);
  assert.ok(validateInverseMono(files, registry).includes('INVERSE_MANIFEST'));
  const extra = new Map(baseline); extra.set(`${dir}/unapproved.svg`, baseline.get(svg));
  assert.ok(validateInverseMono(extra, registry).includes('INVERSE_MANIFEST'));
});

test('inverse production is the exact approved candidate with four remaining design gaps', () => {
  assert.deepEqual(validateInverseProduction(baseline, registry), []);
  assert.deepEqual(baseline.get(`${production}/dvg-inverse-mono-v1.0.svg`), baseline.get(svg));
  assert.deepEqual(baseline.get(distribution), baseline.get(svg));
  assert.deepEqual(registry.actionableDesignGapIds, ['glyph-evidence', 'glyph-reconstruction', 'glyph-ai-translation', 'glyph-sensitive']);
  for (const id of registry.actionableDesignGapIds) assert.equal(registry.gaps.find(g => g.gapId === id).status, id === 'glyph-evidence' ? 'CANDIDATE_READY_FOR_APPROVAL' : 'CANONICAL_ASSET_GAP');
});

test('inverse production rejects missing or byte-altered candidate, source and distribution', () => {
  for (const p of [svg, `${production}/dvg-inverse-mono-v1.0.svg`, distribution]) {
    const missing = new Map(baseline); missing.delete(p);
    assert.ok(validateInverseProduction(missing, registry).some(e => /IDENTITY|INTEGRITY/.test(e)));
    const altered = new Map(baseline); altered.set(p, Buffer.concat([baseline.get(p), Buffer.from('\n')]));
    assert.ok(validateInverseProduction(altered, registry).some(e => /IDENTITY|INTEGRITY/.test(e)));
  }
});

test('inverse production rejects altered parent, geometry, white fill, effects and metadata', () => {
  const p = `${production}/dvg-inverse-mono-v1.0.svg`;
  for (const change of [s => s.replace('M10.8', 'M11.8'), s => s.replace('#FFFFFF', '#EADDC7'), s => s.replace('id="desc"', 'id="missing"'), s => s.replace('</svg>', '<filter/></svg>')]) {
    const files = new Map(baseline); files.set(p, Buffer.from(change(files.get(p).toString())));
    assert.ok(validateInverseProduction(files, registry).includes('INVERSE_PRODUCTION_GEOMETRY_COLOR'));
  }
  const files = new Map(baseline); files.set(source, Buffer.from('modified parent'));
  assert.ok(validateInverseProduction(files, registry).includes('INVERSE_SOURCE'));
});

test('inverse production requires approval and exact locked micro usage', () => {
  for (const [mutate, code] of [
    [l => { l.status = 'CANDIDATE'; }, 'INVERSE_PRODUCTION_LIFECYCLE'],
    [l => { l.distribution = false; }, 'INVERSE_PRODUCTION_LIFECYCLE'],
    [l => { l.humanVisualApproval = 'PENDING'; }, 'INVERSE_PRODUCTION_LOCK'],
    [l => { l.scope = 'master'; }, 'INVERSE_PRODUCTION_TREATMENT'],
    [l => { l.fill = '#EADDC7'; }, 'INVERSE_PRODUCTION_TREATMENT'],
    [l => { l.visibleColorCount = 2; }, 'INVERSE_PRODUCTION_TREATMENT'],
    [l => { l.sizesPx.push(32); }, 'INVERSE_PRODUCTION_USAGE'],
    [l => { l.permittedBackgrounds.push('#FFFFFF'); }, 'INVERSE_PRODUCTION_USAGE'],
  ]) {
    const files = new Map(baseline), p = `${production}/LOCK.json`, l = JSON.parse(files.get(p)); mutate(l); files.set(p, Buffer.from(JSON.stringify(l)));
    assert.ok(validateInverseProduction(files, registry).includes(code));
  }
});

test('inverse production registry cannot broaden classification or resolve without evidence', () => {
  for (const mutate of [a => { a.roles.push('CANONICAL_MASTER'); }, a => { a.distribution = false; }, a => { a.scope = 'master'; }, a => { a.usage.sizesPx = [32]; }, a => { a.usage.permittedBackgrounds.push('#EADDC7'); }, a => { a.sourceFile = svg; }]) {
    const r = structuredClone(registry); mutate(r.assets.find(a => a.assetId === 'dvg-logo-inverse-mono-v1.0'));
    assert.ok(validateInverseProduction(baseline, r).length > 0);
  }
  const r = structuredClone(registry); r.gaps.find(g => g.gapId === 'dark-monochrome').resolvedBy = [];
  assert.ok(validateInverseProduction(baseline, r).includes('INVERSE_PRODUCTION_GAP'));
  const missing = new Map(baseline); missing.delete(`${production}/LOCK.json`);
  assert.ok(validateInverseMono(missing, registry).includes('INVERSE_PREMATURE_PROMOTION'));
});

test('inverse production requires complete manifests and unchanged approved QA evidence', () => {
  const files = new Map(baseline); files.delete(`${production}/MANIFEST.sha256`);
  assert.ok(validateInverseProduction(files, registry).includes('INVERSE_PRODUCTION_MANIFEST'));
  const p = `${production}/PRODUCTION-VALIDATION.json`, proof = JSON.parse(baseline.get(p)); proof.renderQA[0].result = 'FAIL';
  files.set(p, Buffer.from(JSON.stringify(proof)));
  assert.ok(validateInverseProduction(files, registry).includes('INVERSE_PRODUCTION_EVIDENCE_DRIFT'));
  const qaMissing = new Map(baseline); qaMissing.delete(`${qa}/render-board.png`);
  assert.ok(validateInverseProduction(qaMissing, registry).includes('INVERSE_ARTIFACT_DRIFT'));
});
