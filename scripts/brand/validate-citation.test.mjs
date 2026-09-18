import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { collectSnapshot, validateSnapshot } from './validate.mjs';
import { getIconReference } from '../../packages/brand-icons/index.mjs';
import { validateCitation, citationSvgErrors, citationDirectory as dir, citationSvg as svg, citationQa as qa, citationLeft, citationRight } from './validate-citation.mjs';

const current = collectSnapshot(fileURLToPath(new URL('../../', import.meta.url)));
// Preserve all Pass #6.1 candidate-only rejection assertions against its historical snapshot.
const baseline = new Map(current);
for (const p of baseline.keys()) if (p.includes('Dau-Viet-Global-Citation-Trust-Glyph-V1.0-PRODUCTION-LOCKED/') || p === 'packages/brand-icons/canonical/trust/dvg-trust-citation-v1.0.svg') baseline.delete(p);
const registry = JSON.parse(baseline.get('packages/brand-contracts/brand-registry.json'));
registry.assets = registry.assets.filter(a => a.semantic !== 'citation');
registry.actionableDesignGapIds.unshift('glyph-citation');
const historicalGap = registry.gaps.find(g => g.gapId === 'glyph-citation');
historicalGap.status = 'CANDIDATE_READY_FOR_APPROVAL'; delete historicalGap.resolvedBy;
const mutateJson = (name, mutate) => {
  const files = new Map(baseline), p = `${dir}/${name}`, v = JSON.parse(files.get(p));
  mutate(v); files.set(p, Buffer.from(JSON.stringify(v))); return files;
};

test('Citation candidate is exact approved construction and passes complete integration', () => {
  assert.deepEqual(validateCitation(baseline, registry), []);
  assert.deepEqual(validateSnapshot(current), []);
  const text = baseline.get(svg).toString();
  assert.equal((text.match(/<path /g) || []).length, 2);
  assert.equal((text.match(/<circle /g) || []).length, 1);
  assert.ok(text.includes(`d="${citationLeft}"`)); assert.ok(text.includes(`d="${citationRight}"`));
  const missing = new Map(baseline); missing.delete(svg);
  assert.ok(validateCitation(missing, registry).includes('CITATION_INTEGRITY'));
});

test('Citation rejects every coordinate, circle, style or viewBox deviation', () => {
  const original = baseline.get(svg).toString();
  for (const [from, to] of [['M8 6', 'M8.1 6'], ['C18.33', 'C18.34'], ['cx="12"', 'cx="13"'], ['cy="12"', 'cy="13"'], ['r="1.5"', 'r="1.6"'], ['0 0 24 24', '0 0 32 32'], ['stroke-width="1.75"', 'stroke-width="2"'], ['stroke-linecap="round"', 'stroke-linecap="butt"'], ['stroke-linejoin="round"', 'stroke-linejoin="miter"'], ['fill="none"', 'fill="currentColor"'], ['stroke="currentColor"', 'stroke="#062A24"']]) {
    const changed = original.replace(from, to); assert.notEqual(changed, original);
    assert.ok(citationSvgErrors(changed).some(e => /CITATION_GEOMETRY|CITATION_STYLE/.test(e)));
  }
});

test('Citation stays candidate, pending and undistributed with exact size policy', () => {
  for (const [mutate, code] of [
    [c => { c.lifecycle = 'PRODUCTION_LOCKED'; }, 'CITATION_LIFECYCLE'],
    [c => { c.distribution = true; }, 'CITATION_LIFECYCLE'],
    [c => { c.humanVisualApproval = 'APPROVED'; }, 'CITATION_LIFECYCLE'],
    [c => { c.sizesPx.push(16); }, 'CITATION_SIZE_POLICY'],
    [c => { c.micro16 = true; }, 'CITATION_SIZE_POLICY'],
    [c => { c.minimumSizePx = 16; }, 'CITATION_SIZE_POLICY'],
    [c => { c.preferredSizePx = 32; }, 'CITATION_SIZE_POLICY'],
    [c => { c.size16Status = 'SUPPORTED'; }, 'CITATION_SIZE_POLICY'],
    [c => { c.geometry.circle.r = 2; }, 'CITATION_CONSTRUCTION'],
    [c => { c.semantic = 'source'; }, 'CITATION_CONSTRUCTION'],
  ]) assert.ok(validateCitation(mutateJson('CANDIDATE.json', mutate), registry).includes(code));
  assert.throws(() => getIconReference('citation', 16), RangeError);
  for (const size of [20, 24, 32]) assert.equal(getIconReference('citation', size).size, size);
});

test('Citation standalone references and flat-vector structure reject malformed additions', () => {
  const original = baseline.get(svg).toString();
  for (const id of ['citation-title', 'citation-desc']) assert.ok(citationSvgErrors(original.replace(`id="${id}"`, 'id="missing"')).includes('CITATION_ACCESSIBILITY'));
  for (const tag of ['path', 'circle', 'rect', 'mask', 'clipPath', 'text', 'image', 'filter', 'linearGradient', 'radialGradient', 'style', 'script', 'font', 'use']) assert.ok(citationSvgErrors(original.replace('</svg>', `<${tag}/></svg>`)).includes('CITATION_SVG_STRUCTURE'));
  for (const attribute of ['transform="translate(1)"', 'style="opacity:0.5"', 'href="https://example.invalid/icon"']) assert.ok(citationSvgErrors(original.replace('<circle ', `<circle ${attribute} `)).includes('CITATION_SVG_STRUCTURE'));
});

test('Citation QA requires three distinct native sizes and the real SVG embedded unchanged', () => {
  for (const mutate of [v => { v.renderQA[0] = v.renderQA[1]; }, v => { v.renderQA[0].result = 'FAIL'; }, v => { v.renderQA[0].sizePx = 16; }]) assert.ok(validateCitation(mutateJson('VALIDATION.json', mutate), registry).includes('CITATION_QA'));
  const files = new Map(baseline), p = `${qa}/citation-20px.png`, png = Buffer.from(files.get(p)); png.writeUInt32BE(16, 16); files.set(p, png);
  assert.ok(validateCitation(files, registry).includes('CITATION_QA_SIZE'));
  assert.ok(validateCitation(files, registry).includes('CITATION_QA_ARTIFACTS'));
  files.set(`${qa}/render-input.html`, Buffer.from('<html>substitute</html>'));
  assert.ok(validateCitation(files, registry).includes('CITATION_RENDER_SOURCE'));
  files.delete(`${qa}/pixel-inspection.png`);
  assert.ok(validateCitation(files, registry).includes('CITATION_QA_ARTIFACTS'));
});

test('Citation gap cannot resolve, alias another semantic or enter production early', () => {
  for (const status of ['RESOLVED', 'PRODUCTION_LOCKED', 'CANONICAL_ASSET_GAP']) {
    const r = structuredClone(registry); r.gaps.find(g => g.gapId === 'glyph-citation').status = status;
    assert.ok(validateCitation(baseline, r).includes('CITATION_PREMATURE_PROMOTION'));
  }
  const files = new Map(baseline); files.set('packages/brand-icons/citation.svg', files.get(svg));
  assert.ok(validateCitation(files, registry).includes('CITATION_PREMATURE_DISTRIBUTION'));
  files.set(`${dir}/PRODUCTION-LOCK.md`, Buffer.from('PRODUCTION_LOCKED'));
  assert.ok(validateCitation(files, registry).includes('CITATION_PREMATURE_PROMOTION'));
});

test('Citation source evidence and complete manifest cannot drift', () => {
  const c = JSON.parse(baseline.get(`${dir}/CANDIDATE.json`)), files = new Map(baseline);
  files.set(c.sourceEvidence[0].file, Buffer.from('altered locked evidence'));
  assert.ok(validateCitation(files, registry).includes('CITATION_SOURCE_EVIDENCE'));
  files.delete(`${dir}/MANIFEST.sha256`);
  assert.ok(validateCitation(files, registry).includes('CITATION_MANIFEST'));
  const extra = new Map(baseline); extra.set(`${dir}/citation-16px.svg`, baseline.get(svg));
  assert.ok(validateCitation(extra, registry).includes('CITATION_MANIFEST'));
});
