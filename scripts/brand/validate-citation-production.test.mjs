import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { collectSnapshot, validateSnapshot } from './validate.mjs';
import { validateCitationProduction as check, citationProductionDirectory as dir, citationProductionSvg as source, citationDistribution as dist, citationSvg as candidate } from './validate-citation.mjs';
import { getIconReference } from '../../packages/brand-icons/index.mjs';
const files = collectSnapshot(fileURLToPath(new URL('../../', import.meta.url)));
const registry = JSON.parse(files.get('packages/brand-contracts/brand-registry.json'));
function mutate(p, fn) { const f = new Map(files), j = JSON.parse(f.get(p)); fn(j); f.set(p, Buffer.from(JSON.stringify(j))); return f; }

test('Citation production package and canonical integration pass with immutable byte copies', () => {
  assert.deepEqual(check(files, registry), []); assert.deepEqual(validateSnapshot(files), []);
  assert.ok(files.get(candidate).equals(files.get(source))); assert.ok(files.get(source).equals(files.get(dist)));
});
test('Citation production rejects missing files and any byte changes including whitespace or accessibility', () => {
  for (const [p, code] of [[candidate, 'CITATION_APPROVED_INTEGRITY'], [source, 'CITATION_PRODUCTION_BYTE_IDENTITY'], [dist, 'CITATION_DISTRIBUTION_BYTE_IDENTITY']]) {
    const f = new Map(files); f.delete(p); assert.ok(check(f, registry).includes(code));
    for (const transform of [b => b + '\n', b => b.replace('citation-title', 'changed'), b => b.replace('M8 6', 'M9 6'), b => b.replace('1.75', '2'), b => b.replaceAll('\n', '\r\n')]) {
      f.set(p, Buffer.from(transform(files.get(p).toString()))); assert.ok(check(f, registry).includes(code));
    }
  }
});
test('Citation lock rejects lifecycle, approval, style, geometry and size policy drift', () => {
  for (const [key, value] of Object.entries({ status:'CANDIDATE', lifecycle:'CANDIDATE', distribution:false, humanVisualApproval:'PENDING', approvalDate:'2026-09-19', visualCandidateChangedAfterApproval:true, grid:32, strokeWidth:2, linecap:'butt', linejoin:'miter', fill:'currentColor', stroke:'red', sizesPx:[16,20,24,32], preferredSizePx:32, minimumSizePx:16, micro16:true, size16Status:'SUPPORTED', semantic:'source' })) {
    assert.ok(check(mutate(`${dir}/LOCK.json`, j => { j[key] = value; }), registry).length, key);
  }
});
test('Citation resolver distributes only standalone approved sizes and keeps other semantics distinct', () => {
  for (const size of [20,24,32]) assert.deepEqual(getIconReference('citation',size), { file:'trust/dvg-trust-citation-v1.0.svg', size });
  for (const size of [0,16,19,25,48]) assert.throws(() => getIconReference('citation',size), RangeError);
  for (const name of ['source','verified']) assert.notDeepEqual(getIconReference(name),getIconReference('citation'));
  for (const name of ['evidence','reconstruction','ai-translation','sensitive']) assert.throws(() => getIconReference(name),RangeError);
  const pkg=JSON.parse(files.get('packages/brand-icons/package.json'));
  assert.equal(pkg.exports['./trust/dvg-trust-citation-v1.0.svg'],'./canonical/trust/dvg-trust-citation-v1.0.svg');
});
test('Citation production registry rejects aliases, wrong paths, lifecycle or unsupported sizes', () => {
  for (const [key,value] of Object.entries({semantic:'source',family:'logo',assetClass:'icon-sprite',distribution:false,status:'CANDIDATE',sourceFile:candidate,productionPath:'packages/brand-assets/citation.svg',minimumSizePx:16,micro16:true})) {
    const r=structuredClone(registry); r.assets.find(a=>a.assetId==='dvg-trust-citation-v1.0')[key]=value; assert.ok(check(files,r).length,key);
  }
});
test('Citation complete manifests and inventory reject missing or altered production records', () => {
  for (const p of [`${dir}/MANIFEST.sha256`,`${dir}/README.md`]) { const f=new Map(files); f.delete(p); assert.ok(check(f,registry).includes('CITATION_PRODUCTION_MANIFEST')); }
  for (const p of ['packages/brand-contracts/source-inventory.json','packages/brand-contracts/source-manifest.json']) {
    const f=mutate(p,j=>{j.files=j.files.filter(e=>!source.endsWith(e.file));}); assert.ok(validateSnapshot(f).length);
  }
  const f=new Map(files); f.set(`${dir}/unapproved.svg`,files.get(source)); assert.ok(check(f,registry).includes('CITATION_PRODUCTION_MANIFEST'));
});
test('Citation production proof cannot replace approved real SVG QA or assert false approval', () => {
  for (const fn of [j=>{j.renderQA[0].result='FAIL';},j=>{j.brokenReferences=1;},j=>{j.humanVisualApproval='PENDING';},j=>{j.productionSha256='bad';},j=>{j.artifacts=[];}]) assert.ok(check(mutate(`${dir}/PRODUCTION-VALIDATION.json`,fn),registry).length);
});
test('Citation resolution requires production gates and leaves exactly four actionable gaps', () => {
  assert.deepEqual(registry.actionableDesignGapIds,['glyph-evidence','glyph-reconstruction','glyph-ai-translation','glyph-sensitive']);
  for (const id of registry.actionableDesignGapIds) assert.equal(registry.gaps.find(g=>g.gapId===id).status,id === 'glyph-evidence' ? 'CANDIDATE_READY_FOR_APPROVAL' : 'CANONICAL_ASSET_GAP');
  const r=structuredClone(registry); r.gaps.find(g=>g.gapId==='glyph-citation').status='CANDIDATE_READY_FOR_APPROVAL'; assert.ok(check(files,r).includes('CITATION_PRODUCTION_GAP'));
  const f=new Map(files); f.delete(`${dir}/LOCK.json`); assert.ok(validateSnapshot(f).includes('CITATION_PRODUCTION_METADATA'));
});
