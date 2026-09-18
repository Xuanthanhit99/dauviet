import { validateEvidence, evidenceQa } from './validate-evidence.mjs';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCitation, validateCitationProduction, citationQa } from './validate-citation.mjs';
import { validateInverseMono, validateInverseProduction, inverseQa } from './validate-inverse-mono.mjs';
import { validateDarkMicro, validateDarkMicroV11, validateDarkMicroProduction } from './validate-dark-micro.mjs';

export const sourceDirectory = 'Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED';
const constructionRoot = `${sourceDirectory}/01-Logo-Master-Geometry/Horizontal-Logo-Construction`;
export const horizontalSource = `${constructionRoot}/Dau-Viet-Global-Horizontal-Logo-V1.4.1-PRODUCTION-LOCKED`;
export const horizontalParent = `${constructionRoot}/Dau-Viet-Global-Horizontal-Logo-V1.4-PRODUCTION-LOCKED`;
export const packageRoots = ['assets', 'tokens', 'icons', 'motion', 'contracts'].map(name => `packages/brand-${name}`);
export const surfaceRoots = ['apps/web', 'apps/mobile', 'apps/admin'];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const registryPath = 'packages/brand-contracts/brand-registry.json';

// Preserve every byte outside the two non-rendering metadata elements.
export function visualFingerprint(svg) {
  return sha256(svg.replace(/<title\b[^>]*>[\s\S]*?<\/title>/g, '').replace(/<desc\b[^>]*>[\s\S]*?<\/desc>/g, ''));
}

export function horizontalSvgErrors(svg) {
  const errors = [];
  for (const tag of ['text', 'image', 'filter', 'linearGradient', 'radialGradient']) {
    if (new RegExp(`<(?:[\\w-]+:)?${tag}\\b`, 'i').test(svg)) errors.push(`FORBIDDEN_HORIZONTAL_ELEMENT ${tag}`);
  }
  if (!/<mask\b[^>]*\bid="journey-cut"/.test(svg) || !svg.includes('mask="url(#journey-cut)"')) errors.push('MISSING_JOURNEY_MASK');
  const root = svg.match(/<svg\b[^>]*>/)?.[0] || '';
  const labels = root.match(/aria-labelledby="([^"]+)"/)?.[1].split(/\s+/) || [];
  const ids = [...svg.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  if (!root.includes('role="img"') || labels.length !== 2 || new Set(labels).size !== 2) errors.push('INVALID_HORIZONTAL_LABEL');
  for (const label of labels) if (ids.filter(id => id === label).length !== 1) errors.push(`BROKEN_REFERENCE ${label}`);
  for (const tag of ['title', 'desc']) {
    const metadata = svg.match(new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)<\\/${tag}>`));
    const id = metadata?.[1].match(/\bid="([^"]+)"/)?.[1];
    if (!id || !labels.includes(id) || !metadata[2].trim()) errors.push(`MISSING_HORIZONTAL_METADATA ${tag}`);
  }
  return errors;
}

// Explicit roots keep collection independent of API, Prisma, environments and databases.
export function collectSnapshot(root) {
  const files = new Map();
  function walk(relative) {
    const absolute = path.join(root, relative);
    if (!existsSync(absolute)) return;
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error(`Symlink in validation scope: ${relative}/${entry.name}`);
      if (['node_modules', '.next', 'dist', 'build', '.git', '.expo', 'Pods'].includes(entry.name) || entry.name.startsWith('.env')) continue;
      const file = `${relative}/${entry.name}`;
      if (entry.isDirectory()) walk(file);
      else files.set(file, readFileSync(path.join(root, file)));
    }
  }
  for (const directory of [sourceDirectory, ...packageRoots, ...surfaceRoots, 'docs/brand/locks', 'docs/brand/qa/dark-micro-v1.0', 'docs/brand/qa/dark-micro-v1.1', inverseQa, citationQa, evidenceQa]) walk(directory);
  return files;
}

export function validateSnapshot(files) {
  const errors = [];
  const fail = message => errors.push(message);
  const text = file => files.get(file)?.toString('utf8');
  function json(file) {
    try {
      if (!files.has(file)) throw new Error('missing');
      return JSON.parse(text(file));
    } catch { fail(`MISSING_OR_INVALID_JSON ${file}`); return null; }
  }
  const registry = json(registryPath);
  const manifest = json(`${sourceDirectory}/MANIFEST.json`);
  const repositoryManifest = json('packages/brand-contracts/source-manifest.json');
  const inventory = json('packages/brand-contracts/source-inventory.json');
  if (!registry || !manifest || !repositoryManifest || !inventory) return errors;
  if (registry.schemaVersion !== 1 || !Array.isArray(registry.assets) || !Array.isArray(manifest.files) || !Array.isArray(repositoryManifest.files) || !Array.isArray(inventory.files)) {
    fail('INVALID_REGISTRY_SCHEMA'); return errors;
  }
  function verify(file, checksum, bytes) {
    if (!files.has(file)) { fail(`MISSING_CANONICAL ${file}`); return; }
    if (sha256(files.get(file)) !== checksum) fail(`CHECKSUM_MISMATCH ${file}`);
    if (bytes !== undefined && files.get(file).length !== bytes) fail(`SIZE_MISMATCH ${file}`);
  }
  verify(`${sourceDirectory}/MANIFEST.json`, registry.sourceManifestChecksum);
  verify(`${sourceDirectory}/README.md`, registry.sourceReadmeChecksum);
  verify('packages/brand-contracts/source-manifest.json', registry.repositoryManifestChecksum);
  if (manifest.files.length !== manifest.artifact_file_count) fail('MANIFEST_COUNT_MISMATCH');
  const canonicalSource = new Map();
  if (repositoryManifest.files.length !== repositoryManifest.artifact_file_count) fail('REPOSITORY_MANIFEST_COUNT_MISMATCH');
  for (const entry of repositoryManifest.files) {
    if (canonicalSource.has(entry.file)) fail(`DUPLICATE_SOURCE ${entry.file}`);
    canonicalSource.set(entry.file, entry);
    verify(`${sourceDirectory}/${entry.file}`, entry.sha256, entry.bytes);
  }
  for (const entry of manifest.files) {
    const recorded = canonicalSource.get(entry.file);
    if (!recorded || recorded.sha256 !== entry.sha256 || recorded.bytes !== entry.bytes) fail(`ORIGINAL_MANIFEST_DRIFT ${entry.file}`);
  }
  if (JSON.stringify(repositoryManifest.sourcePackages) !== JSON.stringify(registry.sourcePackages)) fail('SOURCE_PACKAGE_MANIFEST_DRIFT');
  for (const directory of [horizontalParent, horizontalSource]) {
    const record = registry.sourcePackages?.find(item => item.sourceDirectory === directory);
    if (!record || record.manifestFile !== `${directory}/MANIFEST.sha256`) { fail(`MISSING_SOURCE_PACKAGE ${directory}`); continue; }
    verify(record.manifestFile, record.checksum?.value);
    const seen = new Set();
    for (const line of (text(record.manifestFile) || '').trim().split(/\r?\n/)) {
      const match = line.match(/^([0-9a-f]{64})\s{2}([^\r\n]+)$/);
      if (!match || match[2].includes('..') || /[\\:]/.test(match[2]) || match[2].startsWith('/') || seen.has(match[2])) { fail(`INVALID_SOURCE_MANIFEST_LINE ${directory}`); continue; }
      seen.add(match[2]);
      verify(`${directory}/${match[2]}`, match[1]);
    }
    for (const file of files.keys()) if (file.startsWith(`${directory}/`) && file !== record.manifestFile && !seen.has(file.slice(directory.length + 1))) fail(`UNLISTED_SOURCE_PACKAGE_FILE ${file}`);
  }
  for (const file of files.keys()) {
    if (file.startsWith(`${sourceDirectory}/`) && ![`${sourceDirectory}/README.md`, `${sourceDirectory}/MANIFEST.json`].includes(file) && !canonicalSource.has(file.slice(sourceDirectory.length + 1))) fail(`UNREGISTERED_SOURCE ${file}`);
  }
  const ids = new Set();
  const production = new Set();
  const statuses = new Set(['PRODUCTION_LOCKED', 'APPROVED_DERIVATIVE', 'APPROVED_DERIVATIVE_CANDIDATE', 'REFERENCE_ONLY', 'DEPRECATED']);
  for (const asset of registry.assets) {
    if (!asset.assetId || ids.has(asset.assetId)) fail(`INVALID_OR_DUPLICATE_ID ${asset.assetId}`);
    ids.add(asset.assetId);
    const entry = canonicalSource.get(asset.sourceFile?.slice(sourceDirectory.length + 1));
    if (!asset.sourceFile?.startsWith(`${sourceDirectory}/`) || !entry || asset.checksum?.algorithm !== 'sha256' || entry.sha256 !== asset.checksum?.value) fail(`UNREGISTERED_ASSET_SOURCE ${asset.assetId}`);
    if (!packageRoots.some(root => asset.productionPath?.startsWith(`${root}/`)) || asset.productionPath.includes('..') || asset.productionPath.includes('\\')) { fail(`INVALID_PRODUCTION_PATH ${asset.assetId}`); continue; }
    if (production.has(asset.productionPath)) fail(`DUPLICATE_PRODUCTION_PATH ${asset.productionPath}`);
    production.add(asset.productionPath);
    verify(asset.productionPath, asset.checksum?.value, asset.bytes);
    if (!asset.canonicalName || !asset.assetClass || !asset.version || !asset.phaseOwner || !Array.isArray(asset.platformUsage) || !Array.isArray(asset.variants) || !Array.isArray(asset.supersedes) || !Object.hasOwn(asset, 'locale') || !Object.hasOwn(asset, 'theme') || typeof asset.deprecated !== 'boolean') fail(`MISSING_ASSET_METADATA ${asset.assetId}`);
    if (!statuses.has(asset.status)) fail(`INVALID_ASSET_STATUS ${asset.assetId}`);
    if (asset.deprecated || asset.status === 'DEPRECATED') fail(`DEPRECATED_PRODUCTION_ASSET ${asset.assetId}`);
    if (asset.productionPath.endsWith('.svg')) {
      const svg = text(asset.productionPath) || '';
      if (!svg.includes('http://www.w3.org/2000/svg') || !svg.includes('viewBox=') || /<script\b|\bon\w+\s*=/i.test(svg)) fail(`INVALID_SVG ${asset.productionPath}`);
      if (asset.assetClass === 'icon-sprite') {
        const symbols = [...svg.matchAll(/<symbol id="([^"]+)"/g)].map(match => match[1]);
        if (JSON.stringify(symbols) !== JSON.stringify(asset.variants) || new Set(symbols).size !== symbols.length || !svg.includes('currentColor')) fail(`INVALID_SPRITE ${asset.productionPath}`);
      }
    }
  }
  for (const asset of registry.assets) {
    if (asset.assetClass === 'logo') for (const variant of asset.variants) if (!ids.has(variant)) fail(`UNRESOLVED_VARIANT ${asset.assetId}: ${variant}`);
    if (/construction-editable|editable-source/.test(asset.canonicalName) && (asset.distribution !== false || asset.roles?.some(role => role.startsWith('primary-horizontal')))) fail(`EDITABLE_AS_PRIMARY ${asset.assetId}`);
  }
  const horizontalIds = [];
  const releaseLock = json(`${horizontalSource}/LOCK.json`);
  const proof = json(`${horizontalSource}/PRODUCTION-VALIDATION.json`);
  if (releaseLock?.version !== '1.4.1' || releaseLock?.status !== 'PRODUCTION_LOCKED' || releaseLock?.reason !== 'METADATA_ONLY_CORRECTIVE_RELEASE' || releaseLock?.parentVersion !== '1.4') fail('INVALID_HORIZONTAL_LOCK');
  if (!registry.repositoryLockFile || !files.has(registry.repositoryLockFile)) fail('MISSING_REPOSITORY_LOCK');
  for (const variant of ['light', 'dark', 'mono']) {
    const canonicalName = `dvg-logo-horizontal-primary-${variant}-v1.4.1.svg`;
    const matching = registry.assets.filter(asset => asset.roles?.includes(`primary-horizontal-${variant}`));
    if (matching.length !== 1) { fail(`HORIZONTAL_RESOLUTION ${variant}`); continue; }
    const asset = matching[0]; horizontalIds.push(asset.assetId);
    if (asset.canonicalName !== canonicalName || asset.version !== '1.4.1' || asset.status !== 'PRODUCTION_LOCKED' || asset.distribution !== true || asset.correction !== 'METADATA_ONLY' || asset.parentVersion !== '1.4' || asset.sourceFile !== `${horizontalSource}/${canonicalName}` || asset.productionPath !== `packages/brand-assets/logo/horizontal/${canonicalName}`) fail(`INVALID_HORIZONTAL_RECORD ${variant}`);
    const parentFile = `${horizontalParent}/${canonicalName.replace('-v1.4.1.svg', '-v1.4.svg')}`;
    const parent = text(parentFile) || '';
    const corrected = text(asset.sourceFile) || '';
    if (!files.get(asset.sourceFile)?.equals(files.get(asset.productionPath) || Buffer.alloc(0))) fail(`HORIZONTAL_BYTE_IDENTITY ${variant}`);
    for (const error of horizontalSvgErrors(corrected)) fail(`${error} ${variant}`);
    if (visualFingerprint(parent) !== visualFingerprint(corrected) || corrected.replace('<title id="title">', '<title>').replace('<desc id="desc">', '<desc>') !== parent) fail(`VISUAL_GEOMETRY_IDENTITY ${variant}`);
    const evidence = proof?.checks?.[canonicalName];
    if (!evidence || evidence.parentSha256 !== sha256(parent) || evidence.correctedSha256 !== sha256(corrected) || evidence.visualFingerprint !== visualFingerprint(corrected) || evidence.exactMetadataPatchReversible !== true) fail(`INVALID_GEOMETRY_PROOF ${variant}`);
  }
  const gapIds = new Set();
  for (const gap of registry.gaps || []) {
    const resolvedHorizontal = gap.gapId === 'horizontal-logo' && gap.status === 'RESOLVED';
    const candidateDarkMicro = gap.gapId === 'dark-micro' && gap.status === 'RESOLVED';
    const candidateInverse = gap.gapId === 'dark-monochrome' && gap.status === 'RESOLVED';
    const candidateCitation = gap.gapId === 'glyph-citation' && gap.status === 'RESOLVED';
    const candidateEvidence = gap.gapId === 'glyph-evidence' && gap.status === 'CANDIDATE_READY_FOR_APPROVAL';
    if (!gap.gapId || gapIds.has(gap.gapId) || (!resolvedHorizontal && !candidateDarkMicro && !candidateInverse && !candidateCitation && !candidateEvidence && gap.status !== 'CANONICAL_ASSET_GAP') || !gap.reason || !gap.phaseOwner || !gap.evidence?.length || gap.productionPath || gap.checksum) fail(`INVALID_GAP_RECORD ${gap.gapId}`);
    if (resolvedHorizontal && (horizontalIds.length !== 3 || JSON.stringify(gap.resolvedBy) !== JSON.stringify(horizontalIds))) fail('INVALID_HORIZONTAL_GAP_RESOLUTION');
    gapIds.add(gap.gapId);
    for (const evidence of gap.evidence || []) if (!evidence.startsWith(`${sourceDirectory}/`) || !files.has(evidence)) fail(`MISSING_GAP_EVIDENCE ${gap.gapId}`);
  }
  if (!registry.gaps?.some(gap => gap.gapId === 'horizontal-logo' && gap.status === 'RESOLVED')) fail('UNRESOLVED_HORIZONTAL_GAP');
  const actionable = [ 'glyph-evidence', 'glyph-reconstruction', 'glyph-ai-translation', 'glyph-sensitive'];
  if (JSON.stringify(registry.actionableDesignGapIds) !== JSON.stringify(actionable) || actionable.some(id => !registry.gaps?.some(gap => gap.gapId === id && gap.status === (id === 'glyph-evidence' ? 'CANDIDATE_READY_FOR_APPROVAL' : 'CANONICAL_ASSET_GAP')))) fail('ACTIONABLE_DESIGN_GAP_DRIFT');
  const inventorySources = new Set();
  for (const entry of inventory.files) {
    const original = canonicalSource.get(entry.file);
    if (inventorySources.has(entry.file) || !original || original.sha256 !== entry.sha256 || original.bytes !== entry.bytes) fail(`INVALID_INVENTORY ${entry.file}`);
    inventorySources.add(entry.file);
    const destinations = registry.assets.filter(asset => asset.sourceFile === `${sourceDirectory}/${entry.file}`).map(asset => asset.productionPath);
    if (JSON.stringify(destinations) !== JSON.stringify(entry.selectedProductionPaths)) fail(`INVENTORY_SELECTION_DRIFT ${entry.file}`);
  }
  if (inventorySources.size !== canonicalSource.size) fail('INVENTORY_COVERAGE_MISMATCH');
  for (const error of validateEvidence(files, registry)) fail(error);
  for (const error of validateCitation(files, registry)) fail(error);
  for (const error of validateCitationProduction(files, registry)) fail(error);
  for (const error of validateInverseMono(files, registry)) fail(error);
  for (const error of validateInverseProduction(files, registry)) fail(error);
  for (const error of validateDarkMicro(files, registry)) fail(error);
  for (const error of validateDarkMicroV11(files, registry)) fail(error);
  for (const error of validateDarkMicroProduction(files, registry)) fail(error);

  const definedTokens = new Set();
  for (const file of production) if (file.endsWith('.css')) for (const match of (text(file) || '').matchAll(/(--dv-[\w-]+)\s*:/g)) definedTokens.add(match[1]);
  const formerAliases = new Map([
    ['--dv-action-primary-bg', '--dv-action-primary'], ['--dv-action-accent-bg', '--dv-action-accent'],
    ['--dv-focus-ring-light', '--dv-focus-light'], ['--dv-focus-ring-dark', '--dv-focus-dark'],
  ]);
  for (const [file, bytes] of files) {
    if (file.startsWith(`${sourceDirectory}/`) || ['docs/brand/qa/dark-micro-v1.0/', 'docs/brand/qa/dark-micro-v1.1/', `${inverseQa}/`, `${citationQa}/`, `${evidenceQa}/`].some(dir => file.startsWith(dir))) continue;
    const inSurface = surfaceRoots.some(root => file.startsWith(`${root}/`));
    if (!production.has(file) && (file.includes('/canonical/') || /^packages\/brand-assets\/(logo|app-icons|favicon|social|store)\//.test(file))) fail(`UNREGISTERED_PRODUCTION_ASSET ${file}`);
    if (inSurface && /(?:logo|favicon|app[-_]?icon|time[-_]?trace|brand[-_]?mark).+\.(?:svg|png|webp|ico|jpe?g)$|(?:^|\/)(?:logo|favicon)\.(?:svg|png|ico)$/i.test(file)) fail(`UNREGISTERED_LOCAL_BRAND_ASSET ${file}`);
    if (!/\.(?:css|scss|tsx?|jsx?|mjs|html|vue|svelte)$/.test(file)) continue;
    const content = bytes.toString('utf8');
    for (const match of content.matchAll(/var\(\s*(--dv-[\w-]+)/g)) {
      if (formerAliases.has(match[1])) fail(`SUPERSEDED_TOKEN ${file}: ${match[1]} -> ${formerAliases.get(match[1])}`);
      else if (!definedTokens.has(match[1])) fail(`INVALID_TOKEN_REFERENCE ${file}: ${match[1]}`);
    }
    if (!production.has(file)) {
      if (/--dv-[\w-]+\s*:/.test(content)) fail(`LOCAL_TOKEN_FORK ${file}`);
      if (/#(?:062a24|18463c|d4af7c|eaddc7|b6b6b6|1a1a1a)\b/i.test(content)) fail(`HARDCODED_BRAND_COLOR ${file}`);
      if (inSurface && content.includes(sourceDirectory)) fail(`DIRECT_SOURCE_IMPORT ${file}`);
      for (const entry of manifest.files) if (inSurface && !registry.assets.some(asset => asset.sourceFile === `${sourceDirectory}/${entry.file}`) && content.includes(path.posix.basename(entry.file))) fail(`SOURCE_ONLY_ASSET_USAGE ${file}: ${entry.file}`);
    }
    if (file.endsWith('.css')) for (const match of content.matchAll(/@import\s+["'](\.[^"']+)["']/g)) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1]));
      if (!files.has(target)) fail(`MISSING_CSS_IMPORT ${file}: ${target}`);
    }
  }
  for (const root of packageRoots) {
    const pkg = json(`${root}/package.json`);
    if (!pkg) continue;
    if (pkg.scripts && Object.keys(pkg.scripts).some(name => /install|prepare/.test(name))) fail(`UNEXPECTED_PACKAGE_LIFECYCLE ${root}`);
    for (const target of Object.values(pkg.exports || {})) {
      if (typeof target !== 'string' || !target.startsWith('./')) { fail(`INVALID_PACKAGE_EXPORT ${root}`); continue; }
      if (!target.includes('*') && !files.has(`${root}/${target.slice(2)}`)) fail(`MISSING_PACKAGE_EXPORT ${root}: ${target}`);
    }
  }
  return errors;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = fileURLToPath(new URL('../../', import.meta.url));
    const files = collectSnapshot(root);
    const errors = validateSnapshot(files);
    if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
    else {
      const manifest = JSON.parse(files.get(`${sourceDirectory}/MANIFEST.json`));
      console.log(`SOURCE_ARTIFACT_CHECKSUM ${manifest.files.length} / ${manifest.files.length} PASS`);
      console.log('HORIZONTAL V1.4.1: 3/3 resolution, metadata, geometry and source/copy byte identity PASS; source package manifests PASS.');
      console.log('PASS: canonical copies, registry/inventory, SVG static checks, package exports and token/asset drift. Run validate-svg.ps1 for XML/reference checks. Runtime QA is not asserted.');
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
