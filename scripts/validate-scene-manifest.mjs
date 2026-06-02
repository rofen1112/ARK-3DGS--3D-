import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';

const manifestPath = resolve(process.argv[2] ?? 'public/scenes/demo_room_001/manifest.json');
const outputPath = resolve(process.argv[3] ?? 'public/scenes/demo_room_001/meta/manifest_validation_report.json');

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function resolveScenePath(relativeUrl) {
  return resolve(dirname(manifestPath), relativeUrl);
}

function validateAssetIds(items) {
  const ids = new Set();
  const duplicateIds = [];
  for (const item of items) {
    if (!item.id) continue;
    if (ids.has(item.id)) duplicateIds.push(item.id);
    ids.add(item.id);
  }
  return duplicateIds;
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const assets = manifest.gaussians?.items ?? [];
const defaultId = manifest.gaussians?.default ?? null;
const duplicateIds = validateAssetIds(assets);

const checks = [];
function addCheck(id, passed, value, message) {
  checks.push({ id, passed, value, message });
}

addCheck('legacy_gaussian_present', Boolean(manifest.gaussian?.url), manifest.gaussian?.url ?? null, 'Legacy manifest.gaussian remains available for backward compatibility.');
addCheck('gaussian_asset_set_present', assets.length > 0, assets.length, 'Manifest defines gaussians.items.');
addCheck('default_asset_exists', Boolean(defaultId && assets.some((asset) => asset.id === defaultId)), defaultId, 'Default Gaussian asset id exists in gaussians.items.');
addCheck('source_ply_exists', assets.some((asset) => asset.role === 'source' && asset.type === 'ply'), assets.map((asset) => `${asset.id}:${asset.role}:${asset.type}`), 'Manifest defines a source PLY asset.');
addCheck('preview_ply_exists', assets.some((asset) => asset.role === 'preview' && asset.type === 'ply'), assets.map((asset) => `${asset.id}:${asset.role}:${asset.type}`), 'Manifest defines a preview PLY asset.');
addCheck('no_duplicate_asset_ids', duplicateIds.length === 0, duplicateIds, 'Gaussian asset ids are unique.');

const assetResults = [];
for (const asset of assets) {
  const absolutePath = resolveScenePath(asset.url);
  const present = await exists(absolutePath);
  const size = present ? (await stat(absolutePath)).size : null;
  const sizeMatches = typeof asset.sizeBytes !== 'number' || asset.sizeBytes === size || asset.dataBytes === size;
  assetResults.push({
    id: asset.id ?? null,
    role: asset.role ?? null,
    type: asset.type,
    url: asset.url,
    path: relative(process.cwd(), absolutePath).replaceAll('\\', '/'),
    exists: present,
    size_bytes: size,
    declared_size_bytes: asset.sizeBytes ?? null,
    declared_data_bytes: asset.dataBytes ?? null,
    size_matches: sizeMatches
  });
}

addCheck('all_asset_files_exist', assetResults.every((asset) => asset.exists), assetResults.filter((asset) => !asset.exists), 'All Gaussian asset URLs resolve to local files.');
addCheck('declared_sizes_match', assetResults.every((asset) => asset.size_matches), assetResults.filter((asset) => !asset.size_matches), 'Declared asset sizes or PLY data sizes match files on disk.');

const report = {
  generated_at: new Date().toISOString(),
  manifest: relative(process.cwd(), manifestPath).replaceAll('\\', '/'),
  summary: {
    passed: checks.every((check) => check.passed),
    total_checks: checks.length,
    failed_checks: checks.filter((check) => !check.passed).length,
    asset_count: assets.length
  },
  checks,
  assets: assetResults
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({
  output: relative(process.cwd(), outputPath).replaceAll('\\', '/'),
  summary: report.summary,
  assets: assetResults.map((asset) => ({
    id: asset.id,
    role: asset.role,
    type: asset.type,
    exists: asset.exists,
    size_matches: asset.size_matches
  }))
}, null, 2));

if (!report.summary.passed) {
  process.exitCode = 1;
}
