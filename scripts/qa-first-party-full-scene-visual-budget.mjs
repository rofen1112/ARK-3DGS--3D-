import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';

const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const manifestPath = resolve(positionalArgs[0] ?? 'public/scenes/demo_room_001/manifest.json');
const outputPath = resolve(positionalArgs[1] ?? 'public/scenes/demo_room_001/meta/first_party_full_scene_renderer_report.json');
const requirePass = process.argv.includes('--require-pass');
const firstPartySupportedFormats = new Set(['ply']);

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

function findResolution(report, label) {
  return report.resolutions?.find((item) => item.label === label) ?? null;
}

function findFormatRow(report, format) {
  return report.rows?.find((row) => row.format === format) ?? null;
}

function findBaselineComparison(report, format) {
  return report.comparisons?.find((row) => row.format === format) ?? null;
}

function findCandidateResolution(report, label) {
  return report.resolutions?.find((row) => row.label === label) ?? null;
}

const manifest = await readJson(manifestPath);
const metaDir = resolve(dirname(manifestPath), 'meta');
const manifestReport = await readJson(resolve(metaDir, 'manifest_validation_report.json'));
const runtimeMetadataReport = await readJson(resolve(metaDir, 'runtime_gaussian_metadata_report.json'));
const renderableAssetsReport = await readJson(resolve(metaDir, 'first_party_renderable_assets_report.json'));
const fullSceneCandidateReport = await readJson(resolve(metaDir, 'first_party_full_scene_candidate_report.json'));
const sourcePlySmokeReport = await readJson(resolve(metaDir, 'first_party_full_scene_source_ply_smoke_report.json'));
const gaussianRendererReport = await readJson(resolve(metaDir, 'first_party_gaussian_renderer_report.json'));
const comparisonReport = await readJson(resolve(metaDir, 'first_party_gaussian_comparison_report.json'));
const stressReport = await readJson(resolve(metaDir, 'first_party_gaussian_stress_report.json'));
const formatMatrixReport = await readJson(resolve(metaDir, 'format_matrix_report.json'));
const baselineReport = await readJson(resolve(metaDir, 'baseline_comparison_report.json'));

const assets = manifest.gaussians?.items ?? [];
const defaultId = manifest.gaussians?.default ?? null;
const defaultAsset = assets.find((asset) => asset.id === defaultId) ?? manifest.gaussian ?? null;
const defaultFormat = defaultAsset?.type ?? null;
const runtimeAssets = assets.filter((asset) => asset.role === 'runtime');
const previewPly = assets.find((asset) => asset.role === 'preview' && asset.type === 'ply') ?? null;
const sourcePly = assets.find((asset) => asset.role === 'source' && asset.type === 'ply') ?? null;
const defaultResolution = findResolution(renderableAssetsReport, 'default');
const defaultCandidateResolution = findCandidateResolution(fullSceneCandidateReport, 'default');
const defaultFormatRow = defaultFormat ? findFormatRow(formatMatrixReport, defaultFormat) : null;
const defaultBaselineComparison = defaultFormat ? findBaselineComparison(baselineReport, defaultFormat) : null;

const assetReports = [];
for (const asset of assets) {
  const absolutePath = resolveScenePath(asset.url);
  const present = await exists(absolutePath);
  const size = present ? (await stat(absolutePath)).size : null;
  assetReports.push(summarizeAsset(asset, absolutePath, present, size));
}

const defaultDirectFormatSupported = Boolean(defaultFormat && firstPartySupportedFormats.has(defaultFormat));
const defaultUsesPreviewSubstitute = defaultResolution?.mode === 'preview-substitute';
const previewPathMeasured = gaussianRendererReport.summary?.passed === true
  && comparisonReport.summary?.passed === true
  && stressReport.summary?.passed === true;
const defaultAholoVisualBaselineAvailable = defaultFormatRow?.passed === true;
const defaultAholoComparisonAvailable = defaultBaselineComparison?.passed === true;
const directFullSceneLoadAvailable = false;
const directFullSceneVisualMeasurementAvailable = false;
const firstPartyFullSceneComparisonAvailable = false;

const assessmentChecks = [];
addCheck(assessmentChecks, 'manifest_loaded', !manifest.unavailable, relative(process.cwd(), manifestPath).replaceAll('\\', '/'), 'Scene manifest is readable.');
addCheck(assessmentChecks, 'manifest_validation_passed', manifestReport.summary?.passed === true, manifestReport.summary ?? null, 'Manifest validator report passes.');
addCheck(assessmentChecks, 'default_asset_declared', Boolean(defaultAsset?.url), defaultAsset?.id ?? defaultId, 'Manifest declares the default Gaussian asset.');
addCheck(assessmentChecks, 'runtime_assets_declared', runtimeAssets.length >= 2, runtimeAssets.map((asset) => `${asset.id}:${asset.type}`), 'Manifest declares runtime SOG/SPZ assets.');
addCheck(assessmentChecks, 'preview_ply_declared', Boolean(previewPly?.url), previewPly?.id ?? null, 'Manifest declares a first-party preview PLY asset.');
addCheck(assessmentChecks, 'source_ply_declared', Boolean(sourcePly?.url), sourcePly?.id ?? null, 'Manifest declares a source PLY audit asset.');
addCheck(assessmentChecks, 'asset_files_present', assetReports.every((asset) => asset.exists), assetReports.filter((asset) => !asset.exists), 'All declared Gaussian files are present locally.');
addCheck(assessmentChecks, 'runtime_metadata_report_passed', runtimeMetadataReport.summary?.passed === true, runtimeMetadataReport.summary ?? null, 'Runtime Gaussian metadata adapter report passes.');
addCheck(assessmentChecks, 'renderable_asset_report_passed', renderableAssetsReport.summary?.passed === true, renderableAssetsReport.summary ?? null, 'Renderable asset resolver report passes.');
addCheck(assessmentChecks, 'full_scene_candidate_report_passed', fullSceneCandidateReport.summary?.passed === true, fullSceneCandidateReport.summary ?? null, 'Full-scene first-party measurement candidate resolver report passes.');
addCheck(assessmentChecks, 'preview_first_party_measurement_available', previewPathMeasured, {
  gaussian: gaussianRendererReport.summary?.passed ?? null,
  comparison: comparisonReport.summary?.passed ?? null,
  stress: stressReport.summary?.passed ?? null
}, 'Preview first-party renderer measurement reports are available.');
addCheck(assessmentChecks, 'default_aholo_visual_baseline_available', defaultAholoVisualBaselineAvailable, defaultFormatRow, 'Aholo-backed default runtime visual baseline is available.');
addCheck(assessmentChecks, 'default_aholo_comparison_available', defaultAholoComparisonAvailable, defaultBaselineComparison?.deltas ?? null, 'ARK wrapper versus direct Aholo default-runtime comparison is available.');

const visualRequirements = [];
addCheck(visualRequirements, 'default_runtime_direct_format_supported', defaultDirectFormatSupported, {
  defaultAsset: defaultAsset?.id ?? null,
  defaultType: defaultFormat,
  supportedFormats: Array.from(firstPartySupportedFormats)
}, 'Manifest default format is directly loadable by the first-party renderer.');
addCheck(visualRequirements, 'default_runtime_not_preview_substitute', !defaultUsesPreviewSubstitute && defaultResolution?.mode === 'direct', defaultResolution, 'Manifest default resolves to a direct first-party renderable asset, not a degraded preview substitute.');
addCheck(visualRequirements, 'direct_full_scene_load_available', directFullSceneLoadAvailable, null, 'The first-party renderer can load the manifest default full scene directly.');
addCheck(visualRequirements, 'direct_full_scene_visual_measurement_available', directFullSceneVisualMeasurementAvailable, null, 'A measured first-party full-scene visual QA run exists.');
addCheck(visualRequirements, 'first_party_full_scene_comparison_available', firstPartyFullSceneComparisonAvailable, null, 'A first-party full-scene visual comparison against Aholo baseline exists.');

const assessmentPassed = assessmentChecks.every((check) => check.passed);
const visualGatePassed = visualRequirements.every((check) => check.passed);
const visualStatus = visualGatePassed
  ? 'passed'
  : directFullSceneVisualMeasurementAvailable
    ? 'measured-failed'
    : 'blocked-before-measurement';

const report = {
  generated_at: new Date().toISOString(),
  target: 'ARK first-party full-scene visual gate assessment',
  manifest: relative(process.cwd(), manifestPath).replaceAll('\\', '/'),
  require_pass: requirePass,
  summary: {
    passed: visualGatePassed,
    assessment_passed: assessmentPassed,
    visual_gate_passed: visualGatePassed,
    status: visualStatus,
    default_backend_ready: visualGatePassed,
    should_keep_aholo_default: !visualGatePassed,
    blocking_count: visualRequirements.filter((check) => !check.passed).length,
    failed_checks: assessmentChecks.filter((check) => !check.passed).length,
    default_asset: defaultAsset?.id ?? null,
    default_type: defaultFormat,
    default_splats: defaultAsset?.splats ?? null,
    default_aholo_visual_quality: defaultFormatRow?.visual_quality ?? null,
    default_aholo_contrast: defaultFormatRow?.contrast ?? null,
    measurement_candidate_asset: defaultCandidateResolution?.candidate_asset_id ?? null,
    measurement_candidate_mode: defaultCandidateResolution?.mode ?? null,
    measurement_candidate_splats: defaultCandidateResolution?.candidate_splats ?? null,
    measurement_candidate_ready: defaultCandidateResolution?.firstPartyLoadable === true && defaultCandidateResolution?.candidate_exists === true,
    measurement_candidate_is_default_runtime: defaultCandidateResolution?.measuredDefaultRuntime === true,
    source_ply_smoke_passed: sourcePlySmokeReport.summary?.smoke_passed ?? null,
    source_ply_smoke_splats: sourcePlySmokeReport.summary?.splats ?? null,
    source_ply_smoke_rendered_splats: sourcePlySmokeReport.summary?.rendered_splats ?? null,
    source_ply_smoke_lod_enabled: sourcePlySmokeReport.summary?.lod_enabled ?? null,
    source_ply_smoke_visual_quality: sourcePlySmokeReport.summary?.visual_quality ?? null,
    source_ply_smoke_settle_frames: sourcePlySmokeReport.summary?.visual_gate_settle_frames ?? null,
    source_ply_smoke_visual_gate_evaluated_ms: sourcePlySmokeReport.summary?.visual_gate_evaluated_ms ?? null,
    source_ply_smoke_max_render_ms: sourcePlySmokeReport.summary?.renderer_max_render_ms ?? null,
    preview_renderer: gaussianRendererReport.summary?.renderer ?? null,
    preview_splats: gaussianRendererReport.summary?.splats ?? previewPly?.splats ?? null,
    preview_visual_quality: gaussianRendererReport.summary?.visual_quality ?? null
  },
  gate_policy: {
    direct_first_party_formats: Array.from(firstPartySupportedFormats),
    degraded_preview_substitutes_can_pass_full_scene_gate: false,
    aholo_baselines_can_pass_first_party_gate: false,
    measured_first_party_default_runtime_required: true
  },
  default_asset: defaultAsset,
  assets: assetReports,
  assessment_checks: assessmentChecks,
  visual_requirements: visualRequirements,
  blockers: visualRequirements
    .filter((check) => !check.passed)
    .map((check) => ({
      id: check.id,
      message: check.message,
      value: check.value
    })),
  baselines: {
    default_format_matrix_row: defaultFormatRow,
    default_aholo_comparison: defaultBaselineComparison,
    default_full_scene_candidate: defaultCandidateResolution,
    source_ply_smoke: sourcePlySmokeReport.summary ?? null,
    first_party_preview: gaussianRendererReport.summary ?? null,
    first_party_comparison: comparisonReport.summary ?? null,
    first_party_stress: stressReport.summary ?? null
  },
  reports: {
    manifest: manifestReport.summary ?? null,
    runtime_metadata: runtimeMetadataReport.summary ?? null,
    renderable_assets: renderableAssetsReport.summary ?? null,
    full_scene_candidate: fullSceneCandidateReport.summary ?? null,
    source_ply_smoke: sourcePlySmokeReport.summary ?? null,
    format_matrix: formatMatrixReport.summary ?? null,
    baseline_comparison: baselineReport.summary ?? null
  }
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({
  output: relative(process.cwd(), outputPath).replaceAll('\\', '/'),
  summary: report.summary,
  blockers: report.blockers
}, null, 2));

if (!assessmentPassed || (requirePass && !visualGatePassed)) {
  process.exitCode = 1;
}
