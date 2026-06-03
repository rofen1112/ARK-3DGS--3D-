import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';

const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const manifestPath = resolve(positionalArgs[0] ?? 'public/scenes/demo_room_001/manifest.json');
const outputPath = resolve(positionalArgs[1] ?? 'public/scenes/demo_room_001/meta/first_party_default_readiness_report.json');
const requireReady = process.argv.includes('--require-ready');
const firstPartySupportedFormats = new Set(['ply']);
const cpuSortSplatLimit = 400_000;

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    return {
      unavailable: true,
      path: relative(process.cwd(), path).replaceAll('\\', '/'),
      error: String(error instanceof Error ? error.message : error)
    };
  }
}

function resolveScenePath(relativeUrl) {
  return resolve(dirname(manifestPath), relativeUrl);
}

function addCheck(checks, id, passed, value, message) {
  checks.push({ id, passed, value, message });
}

function reportPassed(report, gateField) {
  return report.summary?.passed === true || report.summary?.[gateField] === true;
}

function summarizeAsset(asset, absolutePath, present, size) {
  return {
    id: asset.id ?? null,
    role: asset.role ?? null,
    type: asset.type,
    url: asset.url,
    path: relative(process.cwd(), absolutePath).replaceAll('\\', '/'),
    splats: asset.splats ?? null,
    sizeBytes: asset.sizeBytes ?? null,
    dataBytes: asset.dataBytes ?? null,
    exists: present,
    sizeOnDisk: size
  };
}

const manifest = await readJson(manifestPath);
const assets = manifest.gaussians?.items ?? [];
const defaultId = manifest.gaussians?.default ?? null;
const defaultAsset = assets.find((asset) => asset.id === defaultId) ?? manifest.gaussian ?? null;
const runtimeAssets = assets.filter((asset) => asset.role === 'runtime');
const previewPly = assets.find((asset) => asset.role === 'preview' && asset.type === 'ply') ?? null;
const sourcePly = assets.find((asset) => asset.role === 'source' && asset.type === 'ply') ?? null;

const assetReports = [];
for (const asset of assets) {
  const absolutePath = resolveScenePath(asset.url);
  const present = await exists(absolutePath);
  const size = present ? (await stat(absolutePath)).size : null;
  assetReports.push(summarizeAsset(asset, absolutePath, present, size));
}

const metaDir = resolve(dirname(manifestPath), 'meta');
const gaussianReport = await readJson(resolve(metaDir, 'first_party_gaussian_renderer_report.json'));
const comparisonReport = await readJson(resolve(metaDir, 'first_party_gaussian_comparison_report.json'));
const stressReport = await readJson(resolve(metaDir, 'first_party_gaussian_stress_report.json'));
const manifestReport = await readJson(resolve(metaDir, 'manifest_validation_report.json'));
const runtimeMetadataReport = await readJson(resolve(metaDir, 'runtime_gaussian_metadata_report.json'));
const runtimeFormatProbeReport = await readJson(resolve(metaDir, 'runtime_gaussian_format_probe_report.json'));
const renderableAssetsReport = await readJson(resolve(metaDir, 'first_party_renderable_assets_report.json'));

const checks = [];
addCheck(checks, 'manifest_loaded', !manifest.unavailable, relative(process.cwd(), manifestPath).replaceAll('\\', '/'), 'Scene manifest is readable.');
addCheck(checks, 'runtime_assets_declared', runtimeAssets.length >= 2, runtimeAssets.map((asset) => `${asset.id}:${asset.type}`), 'Manifest declares runtime SOG/SPZ assets.');
addCheck(checks, 'default_asset_declared', Boolean(defaultAsset?.url), defaultAsset?.id ?? defaultId, 'Manifest declares the current default Gaussian asset.');
addCheck(checks, 'preview_ply_declared', Boolean(previewPly?.url), previewPly?.id ?? null, 'Manifest declares a first-party preview PLY asset.');
addCheck(checks, 'source_ply_declared', Boolean(sourcePly?.url), sourcePly?.id ?? null, 'Manifest declares a full source PLY asset for audits.');
addCheck(checks, 'asset_files_present', assetReports.every((asset) => asset.exists), assetReports.filter((asset) => !asset.exists), 'All declared Gaussian asset files are present in the local workspace.');
addCheck(checks, 'manifest_validation_passed', manifestReport.summary?.passed === true, manifestReport.summary ?? null, 'Manifest validator report passes.');
addCheck(checks, 'runtime_metadata_adapters_passed', runtimeMetadataReport.summary?.passed === true, runtimeMetadataReport.summary ?? null, 'Runtime SOG/SPZ metadata adapter report passes.');
addCheck(checks, 'runtime_format_probe_passed', runtimeFormatProbeReport.summary?.passed === true, runtimeFormatProbeReport.summary ?? null, 'Runtime SOG/SPZ format probe report passes.');
addCheck(checks, 'renderable_asset_resolver_passed', renderableAssetsReport.summary?.passed === true, renderableAssetsReport.summary ?? null, 'First-party renderable asset resolver report passes.');
addCheck(checks, 'preview_renderer_qa_passed', gaussianReport.summary?.passed === true, gaussianReport.summary?.checks ?? null, 'First-party preview renderer QA passes.');
addCheck(checks, 'comparison_qa_passed', comparisonReport.summary?.passed === true, comparisonReport.summary ?? null, 'First-party comparison QA passes.');
addCheck(checks, 'stress_qa_passed', stressReport.summary?.passed === true, stressReport.summary ?? null, 'First-party stress QA passes.');

const defaultFormatSupported = Boolean(defaultAsset?.type && firstPartySupportedFormats.has(defaultAsset.type));
const defaultSplats = defaultAsset?.splats ?? null;
const fullSceneWithinCpuSortLimit = typeof defaultSplats === 'number' && defaultSplats <= cpuSortSplatLimit;
const fullScenePerfReport = await readJson(resolve(metaDir, 'first_party_full_scene_performance_report.json'));
const fullSceneVisualReport = await readJson(resolve(metaDir, 'first_party_full_scene_renderer_report.json'));

const readinessRequirements = [
  {
    id: 'preview_path_ready',
    passed: gaussianReport.summary?.passed === true
      && comparisonReport.summary?.passed === true
      && stressReport.summary?.passed === true,
    value: {
      renderer: gaussianReport.summary?.renderer ?? null,
      comparison: comparisonReport.summary?.passed ?? null,
      stress: stressReport.summary?.passed ?? null
    },
    message: 'Preview PLY first-party path passes renderer, comparison, and stress QA.'
  },
  {
    id: 'default_runtime_format_supported',
    passed: defaultFormatSupported,
    value: {
      defaultAsset: defaultAsset?.id ?? null,
      defaultType: defaultAsset?.type ?? null,
      supportedFormats: Array.from(firstPartySupportedFormats)
    },
    message: 'Current manifest default format is directly loadable by the first-party renderer.'
  },
  {
    id: 'full_scene_sorting_strategy_ready',
    passed: fullSceneWithinCpuSortLimit,
    value: {
      defaultAsset: defaultAsset?.id ?? null,
      splats: defaultSplats,
      cpuSortSplatLimit
    },
    message: 'Current full-scene default can use the existing first-party sorting path without disabling sorting.'
  },
  {
    id: 'full_scene_visual_gate_exists',
    passed: reportPassed(fullSceneVisualReport, 'visual_gate_passed'),
    value: fullSceneVisualReport.summary ?? null,
    message: 'A first-party full-scene visual QA report exists and passes.'
  },
  {
    id: 'full_scene_performance_gate_exists',
    passed: reportPassed(fullScenePerfReport, 'performance_gate_passed'),
    value: fullScenePerfReport.summary ?? null,
    message: 'A first-party full-scene performance QA report exists and passes.'
  }
];

const previewPathReady = readinessRequirements.find((item) => item.id === 'preview_path_ready')?.passed === true;
const defaultBackendReady = readinessRequirements.every((item) => item.passed);
const blockers = readinessRequirements
  .filter((item) => !item.passed)
  .map((item) => ({
    id: item.id,
    message: item.message,
    value: item.value
  }));
const assessmentPassed = checks.every((check) => check.passed) && previewPathReady;

const report = {
  generated_at: new Date().toISOString(),
  target: 'ARK first-party default backend readiness assessment',
  manifest: relative(process.cwd(), manifestPath).replaceAll('\\', '/'),
  require_ready: requireReady,
  first_party_renderer: {
    id: 'ark-gaussian-webgl2',
    supported_formats: Array.from(firstPartySupportedFormats),
    cpu_sort_splat_limit: cpuSortSplatLimit
  },
  summary: {
    passed: assessmentPassed,
    preview_path_ready: previewPathReady,
    runtime_format_probe_ready: runtimeFormatProbeReport.summary?.probe_ready === true,
    default_backend_ready: defaultBackendReady,
    should_keep_aholo_default: !defaultBackendReady,
    blocking_count: blockers.length,
    failed_checks: checks.filter((check) => !check.passed).length
  },
  default_asset: defaultAsset,
  assets: assetReports,
  checks,
  readiness_requirements: readinessRequirements,
  blockers,
  reports: {
    manifest: manifestReport.summary ?? null,
    first_party_gaussian: gaussianReport.summary ?? null,
    first_party_comparison: comparisonReport.summary ?? null,
    first_party_stress: stressReport.summary ?? null,
    runtime_metadata: runtimeMetadataReport.summary ?? null,
    runtime_format_probe: runtimeFormatProbeReport.summary ?? null,
    renderable_assets: renderableAssetsReport.summary ?? null,
    full_scene_visual: fullSceneVisualReport.summary ?? null,
    full_scene_performance: fullScenePerfReport.summary ?? null
  }
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({
  output: relative(process.cwd(), outputPath).replaceAll('\\', '/'),
  summary: report.summary,
  blockers: report.blockers.map((blocker) => ({
    id: blocker.id,
    message: blocker.message,
    value: blocker.value
  }))
}, null, 2));

if (!assessmentPassed || (requireReady && !defaultBackendReady)) {
  process.exitCode = 1;
}
