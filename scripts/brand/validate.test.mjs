import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { collectSnapshot, validateSnapshot, sourceDirectory, horizontalSource, horizontalParent, horizontalSvgErrors, visualFingerprint } from './validate.mjs';
import { getIconReference } from '../../packages/brand-icons/index.mjs';
import { darkMicroDirectory, darkMicroV11Directory, microSource, validateDarkMicro, validateDarkMicroV11, contrastRatio } from './validate-dark-micro.mjs';

const baseline = collectSnapshot(fileURLToPath(new URL('../../', import.meta.url)));
const registry = JSON.parse(baseline.get('packages/brand-contracts/brand-registry.json'));
const logo = registry.assets.find(asset => asset.assetClass === 'logo');

test('V1.1 applies exactly two mappings across three fills and preserves gold and geometry', () => {
  const p = `${darkMicroV11Directory}/dvg-dark-micro-v1.1.svg`, svg = baseline.get(p).toString();
  assert.equal(svg, baseline.get(microSource).toString().replaceAll('#062A24', '#EADDC7').replaceAll('#18463C', '#EADDC7'));
  assert.ok(svg.includes('fill="#D4AF7C"'));
  assert.deepEqual(validateDarkMicroV11(baseline, registry), []);
  for (const altered of [svg.replace('#D4AF7C', '#EADDC7'), svg.replace('M10.8', 'M11.8'), svg.replace('stroke-width="2.1"', 'stroke-width="2.2"')]) {
    const files = new Map(baseline); files.set(p, Buffer.from(altered));
    assert.ok(validateDarkMicroV11(files, registry).includes('DARK_MICRO_V11_GEOMETRY_OR_COLOR_DRIFT'));
  }
});
test('V1.1 cannot become production or broaden its background and size rules', () => {
  for (const [mutate, code] of [
    [c => { c.lifecycle = 'PRODUCTION_LOCKED'; }, 'DARK_MICRO_V11_LIFECYCLE'],
    [c => { c.distribution = true; }, 'DARK_MICRO_V11_LIFECYCLE'],
    [c => { c.humanVisualApproval = 'APPROVED'; }, 'DARK_MICRO_V11_LIFECYCLE'],
    [c => { c.permittedBackgrounds.push('#FFFFFF'); }, 'DARK_MICRO_V11_USAGE'],
    [c => { c.sizesPx.push(32); }, 'DARK_MICRO_V11_USAGE'],
  ]) {
    const files = new Map(baseline), p = `${darkMicroV11Directory}/CANDIDATE.json`, c = JSON.parse(files.get(p));
    mutate(c); files.set(p, Buffer.from(JSON.stringify(c)));
    assert.ok(validateDarkMicroV11(files, registry).includes(code));
  }
  const changed = structuredClone(registry); changed.gaps.find(g => g.gapId === 'dark-micro').status = 'RESOLVED';
  assert.ok(validateDarkMicroV11(baseline, changed).includes('DARK_MICRO_V11_PREMATURE_PRODUCTION_OR_GAP_DRIFT'));
});
test('V1.1 requires valid references and flat vector content', () => {
  const p = `${darkMicroV11Directory}/dvg-dark-micro-v1.1.svg`, svg = baseline.get(p).toString(), files = new Map(baseline);
  files.set(p, Buffer.from(svg.replace('id="desc"', 'id="absent"')));
  assert.ok(validateDarkMicroV11(files, registry).some(e => e.startsWith('DARK_MICRO_V11_BROKEN_REFERENCE')));
  for (const tag of ['text', 'image', 'filter', 'linearGradient', 'radialGradient']) {
    files.set(p, Buffer.from(svg.replace('</svg>', `<${tag}/></svg>`)));
    assert.ok(validateDarkMicroV11(files, registry).includes('DARK_MICRO_V11_FORBIDDEN_ELEMENT'));
  }
});
test('V1.1 contrast is recalculated and QA requires all four distinct combinations', () => {
  assert.ok(Math.abs(contrastRatio('#EADDC7', '#062A24') - 11.481765120536505) < 1e-10);
  assert.ok(Math.abs(contrastRatio('#EADDC7', '#18463C') - 7.911403799848775) < 1e-10);
  assert.equal(contrastRatio('#18463C', '#18463C'), 1);
  const p = `${darkMicroV11Directory}/VALIDATION.json`;
  for (const [mutate, code] of [
    [v => { v.contrast.warmSandRatios['#18463C'] = 12; }, 'DARK_MICRO_V11_CONTRAST'],
    [v => { v.renderQA[1] = v.renderQA[0]; }, 'DARK_MICRO_V11_RENDER_QA'],
    [v => { v.renderQA[2].result = 'FAIL'; }, 'DARK_MICRO_V11_RENDER_QA'],
  ]) {
    const files = new Map(baseline), v = JSON.parse(files.get(p)); mutate(v); files.set(p, Buffer.from(JSON.stringify(v)));
    assert.ok(validateDarkMicroV11(files, registry).includes(code));
  }
});
test('V1.1 QA requires native pixel dimensions and the actual candidate SVG', () => {
  const qa = 'docs/brand/qa/dark-micro-v1.1', files = new Map(baseline);
  const p = `${qa}/dark-micro-16px-18463c.png`, png = Buffer.from(files.get(p)); png.writeUInt32BE(32, 16); files.set(p, png);
  assert.ok(validateDarkMicroV11(files, registry).includes('DARK_MICRO_V11_RENDER_SIZE'));
  const missing = new Map(baseline); missing.delete(`${qa}/render-board.png`);
  assert.ok(validateDarkMicroV11(missing, registry).includes('DARK_MICRO_V11_ARTIFACT_DRIFT'));
  const wrong = new Map(baseline); wrong.set(`${qa}/render-input.html`, Buffer.from('<html>unrelated render</html>'));
  assert.ok(validateDarkMicroV11(wrong, registry).includes('DARK_MICRO_V11_RENDER_SOURCE'));
});

test('dark micro preserves every source byte except the single approved fill', () => {
  const p = `${darkMicroDirectory}/dvg-dark-micro-v1.0.svg`, svg = baseline.get(p).toString();
  assert.equal(svg, baseline.get(microSource).toString().replace('#062A24', '#EADDC7'));
  assert.deepEqual(validateDarkMicro(baseline, registry), []);
  for (const changed of [svg.replace('#18463C', '#FFFFFF'), svg.replace('M10.8', 'M11.8')]) {
    const files = new Map(baseline); files.set(p, Buffer.from(changed));
    assert.ok(validateDarkMicro(files, registry).includes('DARK_MICRO_GEOMETRY_OR_COLOR_DRIFT'));
  }
});
test('dark micro rejects promotion, expanded backgrounds and wrong sizes', () => {
  for (const mutate of [c => { c.lifecycle = 'PRODUCTION_LOCKED'; }, c => { c.distribution = true; }, c => { c.permittedBackgrounds.push('#FFFFFF'); }, c => { c.sizesPx.push(32); }]) {
    const files = new Map(baseline), p = `${darkMicroDirectory}/CANDIDATE.json`, c = JSON.parse(files.get(p));
    mutate(c); files.set(p, Buffer.from(JSON.stringify(c)));
    assert.ok(validateDarkMicro(files, registry).some(e => /INVALID_DARK_MICRO_LIFECYCLE|INVALID_DARK_MICRO_USAGE/.test(e)));
  }
});
test('dark micro rejects broken references and forbidden elements', () => {
  const p = `${darkMicroDirectory}/dvg-dark-micro-v1.0.svg`, svg = baseline.get(p).toString(), files = new Map(baseline);
  files.set(p, Buffer.from(svg.replace('id="title"', 'id="absent"')));
  assert.ok(validateDarkMicro(files, registry).some(e => e.startsWith('DARK_MICRO_BROKEN_REFERENCE')));
  for (const tag of ['text', 'image', 'filter', 'linearGradient', 'radialGradient']) {
    files.set(p, Buffer.from(svg.replace('</svg>', `<${tag}/></svg>`)));
    assert.ok(validateDarkMicro(files, registry).includes('DARK_MICRO_FORBIDDEN_ELEMENT'));
  }
});
test('failed dark micro QA cannot become ready or lose its render evidence', () => {
  const changed = structuredClone(registry); changed.gaps.find(g => g.gapId === 'dark-micro').status = 'CANDIDATE_READY_FOR_APPROVAL';
  changed.gaps.find(g => g.gapId === 'dark-micro').candidateFile = `${darkMicroDirectory}/CANDIDATE.json`;
  assert.ok(validateDarkMicro(baseline, changed).includes('DARK_MICRO_PREMATURE_PROMOTION'));
  const files = new Map(baseline), p = `${darkMicroDirectory}/VALIDATION.json`, v = JSON.parse(files.get(p));
  v.renderQA.forEach(q => { q.result = 'PASS'; }); files.set(p, Buffer.from(JSON.stringify(v)));
  assert.ok(validateDarkMicro(files, registry).includes('DARK_MICRO_QA_STATE_DRIFT'));
  const missing = new Map(baseline); missing.delete(v.artifacts[0].file);
  assert.ok(validateDarkMicro(missing, registry).includes('DARK_MICRO_QA_ARTIFACT_DRIFT'));
});

test('supplied source and selected package distribution pass', () => assert.deepEqual(validateSnapshot(baseline), []));
test('missing canonical file fails', () => {
  const files = new Map(baseline); files.delete(logo.productionPath);
  assert.ok(validateSnapshot(files).some(error => error.includes('MISSING_CANONICAL')));
});
test('altered SVG geometry fails even if syntactically valid', () => {
  const files = new Map(baseline);
  files.set(logo.productionPath, Buffer.from(files.get(logo.productionPath).toString().replace('M21.8', 'M22.8')));
  assert.ok(validateSnapshot(files).some(error => error.includes('CHECKSUM_MISMATCH')));
});
test('changed source cannot be approved by changing its manifest alone', () => {
  const files = new Map(baseline);
  const manifestPath = `${sourceDirectory}/MANIFEST.json`;
  const manifest = JSON.parse(files.get(manifestPath)); manifest.files.pop();
  files.set(manifestPath, Buffer.from(JSON.stringify(manifest)));
  assert.ok(validateSnapshot(files).some(error => error === `CHECKSUM_MISMATCH ${manifestPath}`));
});
test('unknown package and app logos fail', () => {
  const files = new Map(baseline);
  files.set('packages/brand-assets/logo/master/local-fork.svg', baseline.get(logo.productionPath));
  files.set('apps/web/public/logo.svg', baseline.get(logo.productionPath));
  const errors = validateSnapshot(files);
  assert.ok(errors.some(error => error.includes('UNREGISTERED_PRODUCTION_ASSET')));
  assert.ok(errors.some(error => error.includes('UNREGISTERED_LOCAL_BRAND_ASSET')));
});
test('unknown tokens, superseded aliases and local forks fail', () => {
  const files = new Map(baseline);
  files.set('apps/web/styles.css', Buffer.from('.button { --dv-action-primary: red; color: var(--dv-missing); background: var(--dv-action-primary-bg); }'));
  const errors = validateSnapshot(files);
  for (const code of ['LOCAL_TOKEN_FORK', 'INVALID_TOKEN_REFERENCE', 'SUPERSEDED_TOKEN']) assert.ok(errors.some(error => error.startsWith(code)));
});
test('broken CSS imports and historical source usage fail', () => {
  const files = new Map(baseline);
  files.set('apps/web/styles.css', Buffer.from('@import "./missing.css"; /* dau-viet-global-time-trace-v3-geometry-v1.1.svg */'));
  const errors = validateSnapshot(files);
  assert.ok(errors.some(error => error.includes('MISSING_CSS_IMPORT')));
  assert.ok(errors.some(error => error.includes('SOURCE_ONLY_ASSET_USAGE')));
});
test('registry cannot silently mark shipped assets deprecated', () => {
  const files = new Map(baseline); const changed = structuredClone(registry);
  changed.assets[0].deprecated = true;
  files.set('packages/brand-contracts/brand-registry.json', Buffer.from(JSON.stringify(changed)));
  assert.ok(validateSnapshot(files).some(error => error.includes('DEPRECATED_PRODUCTION_ASSET')));
});
test('all exposed icon references resolve to actual sprite symbols', () => {
  for (const name of ['place', 'people', 'event', 'culture', 'time', 'source', 'story', 'journey', 'verified', 'warning']) {
    for (const size of [20, 24, 32]) {
      const reference = getIconReference(name, size);
      const sprite = baseline.get(`packages/brand-icons/canonical/${reference.sprite}`).toString();
      assert.ok(sprite.includes(`id="${reference.symbolId}"`));
    }
  }
  for (const name of ['culture', 'source', 'story', 'journey']) assert.equal(getIconReference(name, 16).sprite, 'micro.svg');
});
test('missing trust glyphs and missing 16px variants never silently fall back', () => {
  for (const name of ['citation', 'evidence', 'reconstruction', 'ai-translation', 'sensitive']) assert.throws(() => getIconReference(name), RangeError);
  for (const name of ['people', 'event', 'time']) assert.throws(() => getIconReference(name, 16), RangeError);
  assert.throws(() => getIconReference('place', 12), RangeError);
});

test('source bytes are checked independently of the production copy', () => {
  const files = new Map(baseline);
  files.set(logo.sourceFile, Buffer.from('changed source'));
  assert.ok(validateSnapshot(files).includes(`CHECKSUM_MISMATCH ${logo.sourceFile}`));
});
test('duplicate IDs, unknown statuses, dangling variants and status-only deprecation fail', () => {
  for (const [mutate, code] of [
    [r => { r.assets[1].assetId = r.assets[0].assetId; }, 'INVALID_OR_DUPLICATE_ID'],
    [r => { r.assets[0].status = 'NEW_MASTER'; }, 'INVALID_ASSET_STATUS'],
    [r => { r.assets[0].variants.push('unknown'); }, 'UNRESOLVED_VARIANT'],
    [r => { r.assets[0].status = 'DEPRECATED'; }, 'DEPRECATED_PRODUCTION_ASSET'],
  ]) {
    const files = new Map(baseline); const changed = structuredClone(registry); mutate(changed);
    files.set('packages/brand-contracts/brand-registry.json', Buffer.from(JSON.stringify(changed)));
    assert.ok(validateSnapshot(files).some(error => error.startsWith(code)));
  }
});
test('registry paths cannot leave the package scope or redirect without inventory reconciliation', () => {
  for (const destination of ['apps/api/logo.svg', 'packages/brand-assets/../logo.svg', 'packages/brand-assets/logo/master/absent.svg']) {
    const files = new Map(baseline); const changed = structuredClone(registry); changed.assets[0].productionPath = destination;
    files.set('packages/brand-contracts/brand-registry.json', Buffer.from(JSON.stringify(changed)));
    assert.ok(validateSnapshot(files).some(error => /INVALID_PRODUCTION_PATH|MISSING_CANONICAL/.test(error)));
  }
});
test('gaps remain evidence-backed records rather than fabricated assets', () => {
  const files = new Map(baseline); const changed = structuredClone(registry);
  changed.gaps[0].evidence = ['absent.json']; changed.gaps[0].productionPath = 'invented.svg';
  files.set('packages/brand-contracts/brand-registry.json', Buffer.from(JSON.stringify(changed)));
  const errors = validateSnapshot(files);
  assert.ok(errors.some(error => error.startsWith('INVALID_GAP_RECORD')));
  assert.ok(errors.some(error => error.startsWith('MISSING_GAP_EVIDENCE')));
});
test('both micro logos remain available and retain the mask at their source checksum', () => {
  const assets = registry.assets.filter(asset => asset.assetClass === 'logo' && asset.productionPath.includes('/micro/'));
  assert.equal(assets.length, 2);
  for (const asset of assets) {
    assert.deepEqual(baseline.get(asset.productionPath), baseline.get(asset.sourceFile));
    assert.ok(baseline.get(asset.productionPath).toString().includes('mask="url(#micro-cut)"'));
    assert.deepEqual(asset.usage.sizesPx, [16, 24]);
  }
});

test('all three corrective variants preserve every non-metadata byte and reject the historical broken references', () => {
  for (const variant of ['light', 'dark', 'mono']) {
    const name = `dvg-logo-horizontal-primary-${variant}`;
    const parent = baseline.get(`${horizontalParent}/${name}-v1.4.svg`).toString();
    const corrected = baseline.get(`${horizontalSource}/${name}-v1.4.1.svg`).toString();
    assert.ok(horizontalSvgErrors(parent).some(error => error.startsWith('BROKEN_REFERENCE')));
    assert.deepEqual(horizontalSvgErrors(corrected), []);
    assert.equal(visualFingerprint(parent), visualFingerprint(corrected));
    assert.equal(corrected.replace('<title id="title">', '<title>').replace('<desc id="desc">', '<desc>'), parent);
    assert.deepEqual(baseline.get(`packages/brand-assets/logo/horizontal/${name}-v1.4.1.svg`), Buffer.from(corrected));
  }
});

test('horizontal resolution rejects missing variants and invalid lifecycle or distribution', () => {
  for (const mutate of [
    asset => { asset.roles = []; },
    asset => { asset.version = '1.4'; },
    asset => { asset.distribution = false; },
    asset => { asset.correction = 'VISUAL'; },
  ]) {
    const files = new Map(baseline); const changed = structuredClone(registry);
    mutate(changed.assets.find(asset => asset.roles?.includes('primary-horizontal-light')));
    files.set('packages/brand-contracts/brand-registry.json', Buffer.from(JSON.stringify(changed)));
    assert.ok(validateSnapshot(files).some(error => /HORIZONTAL_RESOLUTION|INVALID_HORIZONTAL_RECORD/.test(error)));
  }
});

test('horizontal metadata, geometry and byte identity cannot drift silently', () => {
  const asset = registry.assets.find(asset => asset.roles?.includes('primary-horizontal-light'));
  const svg = baseline.get(asset.sourceFile).toString();
  const broken = svg.replace('id="title"', 'id="missing-title"');
  assert.ok(horizontalSvgErrors(broken).some(error => error.startsWith('BROKEN_REFERENCE')));
  assert.notEqual(visualFingerprint(svg), visualFingerprint(svg.replace('viewBox="', 'viewBox="1 ')));
  for (const tag of ['text', 'image', 'filter', 'linearGradient', 'radialGradient']) {
    assert.ok(horizontalSvgErrors(svg.replace('</svg>', `<${tag}/></svg>`)).some(error => error.startsWith('FORBIDDEN_HORIZONTAL_ELEMENT')));
  }
  const files = new Map(baseline); files.set(asset.productionPath, Buffer.from(broken));
  assert.ok(validateSnapshot(files).some(error => error.startsWith('HORIZONTAL_BYTE_IDENTITY')));
});

test('supplemental historical sources remain pinned and unknown source files fail', () => {
  const files = new Map(baseline);
  const parentFile = `${horizontalParent}/dvg-logo-horizontal-primary-light-v1.4.svg`;
  files.set(parentFile, Buffer.from('changed historical evidence'));
  assert.ok(validateSnapshot(files).some(error => error.includes('CHECKSUM_MISMATCH') && error.includes(parentFile)));
  const unknown = new Map(baseline); unknown.set(`${horizontalParent}/README-unapproved.svg`, Buffer.from('<svg/>'));
  assert.ok(validateSnapshot(unknown).some(error => error.startsWith('UNREGISTERED_SOURCE')));
});

test('horizontal resolution leaves exactly seven design gaps and the existing micro policy', () => {
  assert.equal(registry.assets.length, 39);
  assert.equal(registry.gaps.find(gap => gap.gapId === 'horizontal-logo').status, 'RESOLVED');
  assert.deepEqual(registry.actionableDesignGapIds, ['dark-micro', 'dark-monochrome', 'glyph-citation', 'glyph-evidence', 'glyph-reconstruction', 'glyph-ai-translation', 'glyph-sensitive']);
  for (const id of registry.actionableDesignGapIds) assert.equal(registry.gaps.find(gap => gap.gapId === id).status, id === 'dark-micro' ? 'CANDIDATE_READY_FOR_APPROVAL' : 'CANONICAL_ASSET_GAP');
  for (const name of ['people', 'event', 'time']) assert.throws(() => getIconReference(name, 16), RangeError);
});
