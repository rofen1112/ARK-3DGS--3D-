import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';

const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const manifestPath = resolve(positionalArgs[0] ?? 'public/scenes/demo_room_001/manifest.json');
const contractPath = resolve(positionalArgs[1] ?? 'public/scenes/demo_room_001/meta/gaussian_data_contract_report.json');
const outputPath = resolve(positionalArgs[2] ?? 'public/scenes/demo_room_001/meta/runtime_gaussian_metadata_report.json');
const directFirstPartyFormats = new Set(['ply']);
const metadataFormats = new Set(['ply', 'sog', 'spz']);

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function resolveScenePath(relativeUrl) {
  return resolve(dirname(manifestPath), relativeUrl);
}

function addCheck(checks, id, passed, value, message) {
  checks.push({ id, passed, value, message });
}

function selectFitBounds(contract) {
  const bounds = contract.summary?.percentileBounds?.find((item) => item.id === 'broad_01_99')
    ?? contract.summary?.percentileBounds?.[0];
  if (!bounds) return null;
  return {
    id: bounds.id,
    source: 'sidecar',
    min: bounds.min,
    max: bounds.max
  };
}

function sourceSummary(contract) {
  return {
    count: contract.summary?.count ?? null,
    validPositionCount: contract.summary?.validPositionCount ?? null,
    invalidPositionCount: contract.summary?.invalidPositionCount ?? null,
    shDegree: contract.summary?.shDegree ?? null
  };
}

function sourceBounds(contract) {
  if (!contract.summary?.bounds?.min || !contract.summary?.bounds?.max) return null;
  return {
    min: contract.summary.bounds.min,
    max: contract.summary.bounds.max
  };
}

function buildMetadata(asset, context) {
  const warnings = [];
  const directFirstPartyRenderSupported = directFirstPartyFormats.has(asset.type);
  const splats = typeof asset.splats === 'number' ? asset.splats : context.sourceSummary.count;

  if (!metadataFormats.has(asset.type)) {
    warnings.push(`No first-party metadata adapter exists for ${asset.type}.`);
  }
  if (!directFirstPartyRenderSupported) {
    warnings.push(`${asset.type.toUpperCase()} metadata is available, but direct first-party rendering is not implemented yet.`);
  }
  if (typeof splats !== 'number') {
    warnings.push('Splat count is missing from manifest and source summary.');
  }
  if (typeof asset.sizeBytes !== 'number' && typeof asset.dataBytes !== 'number') {
    warnings.push('Asset size is missing from manifest.');
  }
  if (!context.fitBounds) {
    warnings.push('Fit bounds sidecar is unavailable.');
  }

  const metadataReady = metadataFormats.has(asset.type)
    && typeof splats === 'number'
    && Boolean(asset.url)
    && Boolean(context.fitBounds)
    && (typeof asset.sizeBytes === 'number' || typeof asset.dataBytes === 'number');

  return {
    id: asset.id ?? null,
    role: asset.role ?? null,
    label: asset.label ?? null,
    format: asset.type,
    url: asset.url,
    sourceAssetId: asset.sourceAssetId ?? null,
    splats,
    sizeBytes: asset.sizeBytes ?? null,
    dataBytes: asset.dataBytes ?? null,
    fitBounds: context.fitBounds,
    sourceBounds: context.sourceBounds,
    sourceSummary: context.sourceSummary,
    metadataStatus: metadataReady ? 'ready' : 'incomplete',
    metadataReady,
    directFirstPartyRenderSupported,
    warnings
  };
}

const manifest = await readJson(manifestPath);
const contract = await readJson(contractPath);
const assets = manifest.gaussians?.items ?? [];
const runtimeAssets = assets.filter((asset) => asset.role === 'runtime');
const context = {
  fitBounds: selectFitBounds(contract),
  sourceSummary: sourceSummary(contract),
  sourceBounds: sourceBounds(contract)
};

const assetReports = [];
for (const asset of assets) {
  const absolutePath = resolveScenePath(asset.url);
  const present = await exists(absolutePath);
  const sizeOnDisk = present ? (await stat(absolutePath)).size : null;
  const sizeMatches = typeof asset.sizeBytes !== 'number'
    || asset.sizeBytes === sizeOnDisk
    || asset.dataBytes === sizeOnDisk;
  assetReports.push({
    ...buildMetadata(asset, context),
    path: relative(process.cwd(), absolutePath).replaceAll('\\', '/'),
    exists: present,
    sizeOnDisk,
    sizeMatches
  });
}

const runtimeReports = assetReports.filter((asset) => asset.role === 'runtime');
const checks = [];
addCheck(checks, 'manifest_loaded', Boolean(manifest.id), manifest.id ?? null, 'Scene manifest is readable.');
addCheck(checks, 'contract_loaded', contract.summary?.format === 'ply', contract.summary?.format ?? null, 'PLY data contract report is readable.');
addCheck(checks, 'fit_bounds_available', Boolean(context.fitBounds), context.fitBounds, 'Runtime metadata can reuse sidecar fit bounds.');
addCheck(checks, 'source_summary_available', typeof context.sourceSummary.count === 'number', context.sourceSummary, 'Runtime metadata can reference source PLY summary.');
addCheck(checks, 'runtime_sog_metadata_ready', runtimeReports.some((asset) => asset.format === 'sog' && asset.metadataReady), runtimeReports.filter((asset) => asset.format === 'sog'), 'SOG runtime metadata is ready.');
addCheck(checks, 'runtime_spz_metadata_ready', runtimeReports.some((asset) => asset.format === 'spz' && asset.metadataReady), runtimeReports.filter((asset) => asset.format === 'spz'), 'SPZ runtime metadata is ready.');
addCheck(checks, 'runtime_asset_sizes_match', runtimeReports.every((asset) => asset.exists && asset.sizeMatches), runtimeReports.map((asset) => ({ id: asset.id, exists: asset.exists, sizeMatches: asset.sizeMatches })), 'Runtime asset files exist and declared sizes match.');
addCheck(checks, 'runtime_splat_counts_match_source', runtimeReports.every((asset) => asset.splats === context.sourceSummary.count), runtimeReports.map((asset) => ({ id: asset.id, splats: asset.splats, sourceCount: context.sourceSummary.count })), 'Runtime manifest splat counts match the source PLY count.');

const directRenderableRuntimeAssets = runtimeReports.filter((asset) => asset.directFirstPartyRenderSupported);
const report = {
  generated_at: new Date().toISOString(),
  target: 'ARK first-party runtime Gaussian metadata adapters',
  manifest: relative(process.cwd(), manifestPath).replaceAll('\\', '/'),
  contract: relative(process.cwd(), contractPath).replaceAll('\\', '/'),
  summary: {
    passed: checks.every((check) => check.passed),
    metadata_ready: runtimeReports.every((asset) => asset.metadataReady),
    runtime_asset_count: runtimeReports.length,
    direct_renderable_runtime_asset_count: directRenderableRuntimeAssets.length,
    failed_checks: checks.filter((check) => !check.passed).length
  },
  adapter: {
    metadata_formats: Array.from(metadataFormats),
    direct_first_party_formats: Array.from(directFirstPartyFormats),
    note: 'SOG/SPZ metadata readiness does not imply direct first-party renderer support.'
  },
  checks,
  assets: assetReports
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({
  output: relative(process.cwd(), outputPath).replaceAll('\\', '/'),
  summary: report.summary,
  runtime_assets: runtimeReports.map((asset) => ({
    id: asset.id,
    format: asset.format,
    metadataReady: asset.metadataReady,
    directFirstPartyRenderSupported: asset.directFirstPartyRenderSupported,
    splats: asset.splats,
    sizeMatches: asset.sizeMatches
  }))
}, null, 2));

if (!report.summary.passed) {
  process.exitCode = 1;
}
