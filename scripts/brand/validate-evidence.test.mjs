import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { collectSnapshot, validateSnapshot } from './validate.mjs';
import { getIconReference } from '../../packages/brand-icons/index.mjs';
import { validateEvidence, evidenceSvgErrors, evidenceDirectory as dir, evidenceSvg as svg, evidenceQa as qa, evidencePaths } from './validate-evidence.mjs';
const baseline = collectSnapshot(fileURLToPath(new URL('../../', import.meta.url)));
const registry = JSON.parse(baseline.get('packages/brand-contracts/brand-registry.json'));
function mutate(name, fn) { const f = new Map(baseline), p = `${dir}/${name}`, j = JSON.parse(f.get(p)); fn(j); f.set(p, Buffer.from(JSON.stringify(j))); return f; }

test('Evidence candidate exists, exact 4 paths/1 circle and full integration pass', () => {
  assert.deepEqual(validateEvidence(baseline, registry), []); assert.deepEqual(validateSnapshot(baseline), []);
  const s = baseline.get(svg).toString(); assert.equal((s.match(/<path /g)||[]).length,4); assert.equal((s.match(/<circle /g)||[]).length,1);
  for (const p of evidencePaths) assert.ok(s.includes(`d="${p}"`));
  const f=new Map(baseline); f.delete(svg); assert.ok(validateEvidence(f,registry).includes('EVIDENCE_INTEGRITY'));
});
test('Evidence rejects coordinate, fold, circle, handle, open contour and element-order changes', () => {
  const original=baseline.get(svg).toString();
  for (const [from,to] of [['M6.5 4.5','M6.6 4.5'],['H13','H14'],['L16.5 8','L16.5 9'],['V11','V12'],['M13 4.5','M13 5'],['V8 H16.5','V9 H16.5'],['V19.5 H11','V19.5 H11 Z'],['cx="14.5"','cx="14"'],['cy="15"','cy="16"'],['r="3.5"','r="4"'],['M17 17.5 L20 20.5','M17 17.5 L21 20.5']]) assert.ok(evidenceSvgErrors(original.replace(from,to)).includes('EVIDENCE_GEOMETRY'));
  const p1=`<path d="${evidencePaths[0]}"/>`,p2=`<path d="${evidencePaths[1]}"/>`;
  assert.ok(evidenceSvgErrors(original.replace(p1+'\n'+p2,p2+'\n'+p1)).includes('EVIDENCE_GEOMETRY'));
});
test('Evidence exact style and flat-vector skeleton reject extra effects and geometry', () => {
  const original=baseline.get(svg).toString();
  for(const [from,to] of [['0 0 24 24','0 0 32 32'],['1.75','2'],['stroke-linecap="round"','stroke-linecap="butt"'],['stroke-linejoin="round"','stroke-linejoin="miter"'],['fill="none"','fill="currentColor"'],['stroke="currentColor"','stroke="red"']]) assert.ok(evidenceSvgErrors(original.replace(from,to)).includes('EVIDENCE_STYLE'));
  for(const tag of ['path','circle','rect','image','filter','linearGradient','radialGradient','mask','clipPath','text','font','style','script','use']) assert.ok(evidenceSvgErrors(original.replace('</svg>',`<${tag}/></svg>`)).includes('EVIDENCE_SVG_STRUCTURE'));
  for(const attr of ['transform="translate(1)"','href="https://example.invalid/x"','style="opacity:0.5"']) assert.ok(evidenceSvgErrors(original.replace('<circle ',`<circle ${attr} `)).includes('EVIDENCE_SVG_STRUCTURE'));
});
test('Evidence accessibility rejects missing names and broken or duplicate internal IDs', () => {
  const s=baseline.get(svg).toString();
  for(const id of ['evidence-title','evidence-desc']) assert.ok(evidenceSvgErrors(s.replace(`id="${id}"`,'id="wrong"')).includes('EVIDENCE_ACCESSIBILITY'));
  assert.ok(evidenceSvgErrors(s.replace('role="img"','role="none"')).includes('EVIDENCE_ACCESSIBILITY'));
  assert.ok(evidenceSvgErrors(s.replace(/<title[^>]*>.*<\/title>/,'')).includes('EVIDENCE_ACCESSIBILITY'));
});
test('Evidence retains candidate/pending/undistributed lifecycle and exact sizes without16px', () => {
  for(const [key,value] of Object.entries({lifecycle:'PRODUCTION_LOCKED',status:'RESOLVED',distribution:true,humanVisualApproval:'APPROVED',sizesPx:[16,20,24,32],minimumSizePx:16,preferredSizePx:32,micro16:true,size16Status:'SUPPORTED',semantic:'citation',metaphor:'checkmark'})) assert.ok(validateEvidence(mutate('CANDIDATE.json',c=>{c[key]=value;}),registry).length,key);
  assert.ok(validateEvidence(mutate('CANDIDATE.json',c=>{c.geometry.intentionalOpenDocument=false;}),registry).includes('EVIDENCE_CONSTRUCTION'));
  for(const size of [16,20,24,32]) assert.throws(()=>getIconReference('evidence',size),RangeError);
});
test('Evidence QA requires native distinct sizes, pinned pixels and the actual unchanged SVG', () => {
  for(const fn of [v=>{v.renderQA[0]=v.renderQA[1];},v=>{v.renderQA[0].result='FAIL';},v=>{v.renderQA[0].sizePx=16;}]) assert.ok(validateEvidence(mutate('VALIDATION.json',fn),registry).includes('EVIDENCE_QA'));
  const f=new Map(baseline),p=`${qa}/evidence-20px.png`,png=Buffer.from(f.get(p)); png.writeUInt32BE(16,16); f.set(p,png);
  assert.ok(validateEvidence(f,registry).includes('EVIDENCE_QA_SIZE')); assert.ok(validateEvidence(f,registry).includes('EVIDENCE_QA_ARTIFACTS'));
  f.set(`${qa}/render-input.html`,Buffer.from('substitute')); assert.ok(validateEvidence(f,registry).includes('EVIDENCE_RENDER_SOURCE'));
  f.delete(`${qa}/pixel-inspection.png`); assert.ok(validateEvidence(f,registry).includes('EVIDENCE_QA_ARTIFACTS'));
});
test('Evidence cannot resolve or distribute before final approval and separate integration', () => {
  for(const status of ['RESOLVED','PRODUCTION_LOCKED','CANONICAL_ASSET_GAP']) { const r=structuredClone(registry); r.gaps.find(g=>g.gapId==='glyph-evidence').status=status; assert.ok(validateEvidence(baseline,r).includes('EVIDENCE_PREMATURE_PROMOTION')); }
  const f=new Map(baseline); f.set('packages/brand-icons/evidence.svg',f.get(svg)); assert.ok(validateEvidence(f,registry).includes('EVIDENCE_PREMATURE_DISTRIBUTION'));
  f.set(`${dir}/PRODUCTION-LOCK.md`,Buffer.from('lock')); assert.ok(validateEvidence(f,registry).includes('EVIDENCE_PREMATURE_PROMOTION'));
});
test('Evidence source lineage and complete manifest reject drift or extra variants', () => {
  const c=JSON.parse(baseline.get(`${dir}/CANDIDATE.json`)), f=new Map(baseline); f.set(c.sourceEvidence[0].file,Buffer.from('drift'));
  assert.ok(validateEvidence(f,registry).includes('EVIDENCE_SOURCE_EVIDENCE')); f.delete(`${dir}/MANIFEST.sha256`); assert.ok(validateEvidence(f,registry).includes('EVIDENCE_MANIFEST'));
  const extra=new Map(baseline); extra.set(`${dir}/evidence-16px.svg`,extra.get(svg)); assert.ok(validateEvidence(extra,registry).includes('EVIDENCE_MANIFEST'));
});
