import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';

const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const manifestPath = resolve(positionalArgs[0] ?? 'public/scenes/demo_room_001/manifest.json');
const outputPath = resolve(positionalArgs[1] ?? 'public/scenes/demo_room_001/meta/first_party_full_scene_performance_report.json');
const requirePass = process.argv.includes('--require-pass');
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

function ratio(numerator, denominator, digits = 6) {
  if (typeof numerator !== 'number' || typeof denominator !== 'number' || denominator === 0) return null;
  return Number((numerator / denominator).toFixed(digits));
}

function bytesPerSplat(bytes, splats) {
  return ratio(bytes, splats, 3);
}

function bytesToMiB(bytes) {
  if (typeof bytes !== 'number') return null;
  return Number((bytes / (1024 * 1024)).toFixed(3));
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
    sizeOnDisk: size,
    sizeMiB: bytesToMiB(size ?? asset.sizeBytes ?? asset.dataBytes ?? null),
    bytesPerSplat: bytesPerSplat(asset.dataBytes ?? asset.sizeBytes ?? size, asset.splats)
  };
}

function findResolution(report, label) {
  return report.resolutions?.find((item) => item.label === label) ?? null;
}

function findCandidateResolution(report, label) {
  return report.resolutions?.find((item) => item.label === label) ?? null;
}

const manifest = await readJson(manifestPath);
const metaDir = resolve(dirname(manifestPath), 'meta');
const runtimeMetadataReport = await readJson(resolve(metaDir, 'runtime_gaussian_metadata_report.json'));
const renderableAssetsReport = await readJson(resolve(metaDir, 'first_party_renderable_assets_report.json'));
const fullSceneCandidateReport = await readJson(resolve(metaDir, 'first_party_full_scene_candidate_report.json'));
const sourcePlySmokeReport = await readJson(resolve(metaDir, 'first_party_full_scene_source_ply_smoke_report.json'));
const gaussianRendererReport = await readJson(resolve(metaDir, 'first_party_gaussian_renderer_report.json'));
const comparisonReport = await readJson(resolve(metaDir, 'first_party_gaussian_comparison_report.json'));
const stressReport = await readJson(resolve(metaDir, 'first_party_gaussian_stress_report.json'));
const contractReport = await readJson(resolve(metaDir, 'gaussian_data_contract_report.json'));

const assets = manifest.gaussians?.items ?? [];
const defaultId = manifest.gaussians?.default ?? null;
const defaultAsset = assets.find((asset) => asset.id === defaultId) ?? manifest.gaussian ?? null;
const runtimeAssets = assets.filter((asset) => asset.role === 'runtime');
const sourcePly = assets.find((asset) => asset.role === 'source' && asset.type === 'ply') ?? null;
const previewPly = assets.find((asset) => asset.role === 'preview' && asset.type === 'ply') ?? null;
const defaultResolution = findResolution(renderableAssetsReport, 'default');

const assetReports = [];
for (const asset of assets) {
  const absolutePath = resolveScenePath(asset.url);
  const present = await exists(absolutePath);
  const size = present ? (await stat(absolutePath)).size : null;
  assetReports.push(summarizeAsset(asset, absolutePath, present, size));
}

const defaultAssetReport = assetReports.find((asset) => asset.id === defaultAsset?.id) ?? null;
const sourcePlyReport = assetReports.find((asset) => asset.id === sourcePly?.id) ?? null;
const previewPlyReport = assetReports.find((asset) => asset.id === previewPly?.id) ?? null;
const runtimeAssetReports = assetReports.filter((asset) => asset.role === 'runtime');
const defaultCandidateResolution = findCandidateResolution(fullSceneCandidateReport, 'default');
const sourceBytes = sourcePly?.dataBytes ?? sourcePly?.sizeBytes ?? sourcePlyReport?.sizeOnDisk ?? null;
const defaultBytes = defaultAsset?.sizeBytes ?? defaultAsset?.dataBytes ?? defaultAssetReport?.sizeOnDisk ?? null;
const defaultSplats = defaultAsset?.splats ?? contractReport.summary?.count ?? null;
const validSourceSplats = contractReport.summary?.validPositionCount ?? null;
const previewSplats = previewPly?.splats ?? gaussianRendererReport.summary?.splats ?? null;
const defaultDirectFormatSupported = Boolean(defaultAsset?.type && firstPartySupportedFormats.has(defaultAsset.type));
const defaultWithinCpuSortLimit = typeof defaultSplats === 'number' && defaultSplats <= cpuSortSplatLimit;
const previewMeasurementAvailable = gaussianRendererReport.summary?.passed === true
  && comparisonReport.summary?.passed === true
  && stressReport.summary?.passed === true;
const defaultUsesPreviewSubstitute = defaultResolution?.mode === 'preview-substitute';
const directFullSceneMeasurementAvailable = false;
const productionSortingOrStreamingReady = false;

const assessmentChecks = [];
addCheck(assessmentChecks, 'manifest_loaded', !manifest.unavailable, relative(process.cwd(), manifestPath).replaceAll('\\', '/'), 'Scene manifest is readable.');
addCheck(assessmentChecks, 'default_asset_declared', Boolean(defaultAsset?.url), defaultAsset?.id ?? defaultId, 'Manifest declares the default Gaussian asset.');
addCheck(assessmentChecks, 'runtime_assets_declared', runtimeAssets.length >= 2, runtimeAssets.map((asset) => `${asset.id}:${asset.type}`), 'Manifest declares runtime Gaussian assets.');
addCheck(assessmentChecks, 'asset_files_present', assetReports.every((asset) => asset.exists), assetReports.filter((asset) => !asset.exists), 'All declared Gaussian files are present locally.');
addCheck(assessmentChecks, 'runtime_metadata_report_passed', runtimeMetadataReport.summary?.passed === true, runtimeMetadataReport.summary ?? null, 'Runtime Gaussian metadata adapter report passes.');
addCheck(assessmentChecks, 'renderable_asset_report_passed', renderableAssetsReport.summary?.passed === true, renderableAssetsReport.summary ?? null, 'Renderable asset resolver report passes.');
addCheck(assessmentChecks, 'full_scene_candidate_report_passed', fullSceneCandidateReport.summary?.passed === true, fullSceneCandidateReport.summary ?? null, 'Full-scene first-party measurement candidate resolver report passes.');
addCheck(assessmentChecks, 'preview_measurement_available', previewMeasurementAvailable, {
  gaussian: gaussianRendererReport.summary?.passed ?? null,
  comparison: comparisonReport.summary?.passed ?? null,
  stress: stressReport.summary?.passed ?? null
}, 'Preview first-party renderer measurements are available for comparison.');

const performanceRequirements = [];
addCheck(performanceRequirements, 'default_runtime_direct_format_supported', defaultDirectFormatSupported, {
  defaultAsset: defaultAsset?.id ?? null,
  defaultType: defaultAsset?.type ?? null,
  supportedFormats: Array.from(firstPartySupportedFormats)
}, 'Manifest default format is directly loadable by the first-party renderer.');
addCheck(performanceRequirements, 'default_runtime_not_preview_substitute', !defaultUsesPreviewSubstitute && defaultResolution?.mode === 'direct', defaultResolution, 'Manifest default resolves to a direct first-party renderable asset, not a degraded preview substitute.');
addCheck(performanceRequirements, 'default_splats_within_cpu_sort_budget', defaultWithinCpuSortLimit, {
  defaultAsset: defaultAsset?.id ?? null,
  splats: defaultSplats,
  validSourceSplats,
  cpuSortSplatLimit,
  ratioToLimit: ratio(defaultSplats, cpuSortSplatLimit)
}, 'Manifest default is within the current first-party CPU sorting budget.');
addCheck(performanceRequirements, 'direct_full_scene_measurement_available', directFullSceneMeasurementAvailable, null, 'A measured first-party full-scene renderer performance run is available.');
addCheck(performanceRequirements, 'production_sorting_or_streaming_ready', productionSortingOrStreamingReady, {
  requiredForSplats: defaultSplats,
  currentCpuSortSplatLimit: cpuSortSplatLimit,
  expectedNextStrategies: ['worker-sort', 'gpu-assisted-sort', 'chunk-streaming']
}, 'A large-scene sorting, streaming, or LOD strategy is implemented and covered by QA.');

const assessmentPassed = assessmentChecks.every((check) => check.passed);
const performanceGatePassed = performanceRequirements.every((check) => check.passed);
const performanceStatus = performanceGatePassed
  ? 'passed'
  : directFullSceneMeasurementAvailable
    ? 'measured-failed'
    : 'blocked-before-measurement';

const report = {
  generated_at: new Date().toISOString(),
  target: 'ARK first-party full-scene performance budget assessment',
  manifest: relative(process.cwd(), manifestPath).replaceAll('\\', '/'),
  require_pass: requirePass,
  summary: {
    passed: performanceGatePassed,
    assessment_passed: assessmentPassed,
    performance_gate_passed: performanceGatePassed,
    status: performanceStatus,
    default_backend_ready: performanceGatePassed,
    should_keep_aholo_default: !performanceGatePassed,
    blocking_count: performanceRequirements.filter((check) => !check.passed).length,
    failed_checks: assessmentChecks.filter((check) => !check.passed).length,
    default_asset: defaultAsset?.id ?? null,
    default_type: defaultAsset?.type ?? null,
    default_splats: defaultSplats,
    valid_source_splats: validSourceSplats,
    preview_splats: previewSplats,
    cpu_sort_splat_limit: cpuSortSplatLimit,
    default_to_sort_limit_ratio: ratio(defaultSplats, cpuSortSplatLimit),
    preview_to_default_splat_ratio: ratio(previewSplats, defaultSplats),
    default_to_preview_splat_ratio: ratio(defaultSplats, previewSplats),
    measurement_candidate_asset: defaultCandidateResolution?.candidate_asset_id ?? null,
    measurement_candidate_mode: defaultCandidateResolution?.mode ?? null,
    measurement_candidate_splats: defaultCandidateResolution?.candidate_splats ?? null,
    measurement_candidate_ready: defaultCandidateResolution?.firstPartyLoadable === true && defaultCandidateResolution?.candidate_exists === true,
    measurement_candidate_is_default_runtime: defaultCandidateResolution?.measuredDefaultRuntime === true,
    source_ply_smoke_passed: sourcePlySmokeReport.summary?.smoke_passed ?? null,
    source_ply_smoke_splats: sourcePlySmokeReport.summary?.splats ?? null,
    source_ply_smoke_rendered_splats: sourcePlySmokeReport.summary?.rendered_splats ?? null,
    source_ply_smoke_lod_enabled: sourcePlySmokeReport.summary?.lod_enabled ?? null,
    source_ply_smoke_lod_budget_splats: sourcePlySmokeReport.summary?.lod_budget_splats ?? null,
    source_ply_smoke_lod_rendered_ratio: sourcePlySmokeReport.summary?.lod_rendered_ratio ?? null,
    source_ply_smoke_sorting: sourcePlySmokeReport.summary?.sorting ?? null,
    source_ply_smoke_sort_enabled: sourcePlySmokeReport.summary?.sort_enabled ?? null,
    source_ply_smoke_duration_seconds: sourcePlySmokeReport.summary?.duration_seconds ?? null,
    source_ply_smoke_settle_frames: sourcePlySmokeReport.summary?.visual_gate_settle_frames ?? null,
    source_ply_smoke_visual_gate_evaluated_ms: sourcePlySmokeReport.summary?.visual_gate_evaluated_ms ?? null,
    source_ply_smoke_renderer_load_ms: sourcePlySmokeReport.summary?.renderer_load_ms ?? null,
    source_ply_smoke_renderer_decode_ms: sourcePlySmokeReport.summary?.renderer_decode_ms ?? null,
    source_ply_smoke_renderer_pack_ms: sourcePlySmokeReport.summary?.renderer_pack_ms ?? null,
    source_ply_smoke_renderer_upload_ms: sourcePlySmokeReport.summary?.renderer_upload_ms ?? null,
    source_ply_smoke_max_render_ms: sourcePlySmokeReport.summary?.renderer_max_render_ms ?? null,
    source_ply_smoke_average_render_ms: sourcePlySmokeReport.summary?.renderer_average_render_ms ?? null,
    source_ply_smoke_load_peak_mib: sourcePlySmokeReport.summary?.load_peak_mib ?? null
  },
  budgets: {
    direct_first_party_formats: Array.from(firstPartySupportedFormats),
    cpu_sort_splat_limit: cpuSortSplatLimit,
    measured_full_scene_required: true,
    production_sort_or_streaming_required_above_limit: true
  },
  asset_budget: {
    default: defaultAssetReport,
    source_ply: sourcePlyReport,
    preview_ply: previewPlyReport,
    runtime_assets: runtimeAssetReports,
    compression_vs_source: runtimeAssetReports.map((asset) => ({
      id: asset.id,
      type: asset.type,
      sizeBytes: asset.sizeBytes ?? asset.sizeOnDisk,
      sourceBytes,
      ratioToSource: ratio(asset.sizeBytes ?? asset.sizeOnDisk, sourceBytes),
      bytesPerSplat: asset.bytesPerSplat
    })),
    defaultBytes,
    defaultBytesPerSplat: bytesPerSplat(defaultBytes, defaultSplats),
    sourceBytes,
    sourceBytesPerSplat: bytesPerSplat(sourceBytes, sourcePly?.splats ?? validSourceSplats),
    default_full_scene_candidate: defaultCandidateResolution,
    source_ply_smoke: sourcePlySmokeReport.summary ?? null
  },
  assessment_checks: assessmentChecks,
  performance_requirements: performanceRequirements,
  blockers: performanceRequirements
    .filter((check) => !check.passed)
    .map((check) => ({
      id: check.id,
      message: check.message,
      value: check.value
    })),
  reports: {
    runtime_metadata: runtimeMetadataReport.summary ?? null,
    renderable_assets: renderableAssetsReport.summary ?? null,
    full_scene_candidate: fullSceneCandidateReport.summary ?? null,
    source_ply_smoke: sourcePlySmokeReport.summary ?? null,
    first_party_gaussian: gaussianRendererReport.summary ?? null,
    first_party_comparison: comparisonReport.summary ?? null,
    first_party_stress: stressReport.summary ?? null,
    gaussian_data_contract: contractReport.summary ?? null
  }
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({
  output: relative(process.cwd(), outputPath).replaceAll('\\', '/'),
  summary: report.summary,
  blockers: report.blockers
}, null, 2));

if (!assessmentPassed || (requirePass && !performanceGatePassed)) {
  process.exitCode = 1;
}
