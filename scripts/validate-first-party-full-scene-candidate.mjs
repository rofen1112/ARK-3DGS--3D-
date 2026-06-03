import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';

const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const manifestPath = resolve(positionalArgs[0] ?? 'public/scenes/demo_room_001/manifest.json');
const outputPath = resolve(positionalArgs[1] ?? 'public/scenes/demo_room_001/meta/first_party_full_scene_candidate_report.json');
const directFirstPartyFormats = new Set(['ply']);

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

function addCheck(checks, id, passed, value, message) {
  checks.push({ id, passed, value, message });
}

function resolveScenePath(relativeUrl) {
  return resolve(dirname(manifestPath), relativeUrl);
}

function selectAsset(manifest, requestedId) {
  const assets = manifest.gaussians?.items ?? [];
  const defaultId = manifest.gaussians?.default ?? null;
  const aliasToId = {
    default: defaultId,
    runtime: defaultId,
    sog: 'runtime-sog',
    spz: 'runtime-spz',
    ply: 'source-ply',
    source: 'source-ply',
    preview: 'preview-ply',
    'source-ply': 'source-ply',
    'preview-ply': 'preview-ply',
    'ply-preview': 'preview-ply',
    'runtime-sog': 'runtime-sog',
    'runtime-spz': 'runtime-spz'
  };
  const candidate = requestedId ? (aliasToId[requestedId] ?? requestedId) : defaultId;
  return assets.find((asset) => asset.id === candidate)
    ?? (requestedId ? assets.find((asset) => asset.type === requestedId && asset.role === 'runtime') : undefined)
    ?? (defaultId ? assets.find((asset) => asset.id === defaultId) : undefined)
    ?? manifest.gaussian
    ?? null;
}

function findSourcePly(manifest, requestedAsset) {
  const sourceAssets = (manifest.gaussians?.items ?? [])
    .filter((asset) => asset.role === 'source' && asset.type === 'ply');
  if (requestedAsset?.sourceAssetId) {
    const sourceMatched = sourceAssets.find((asset) => asset.id === requestedAsset.sourceAssetId);
    if (sourceMatched) return sourceMatched;
  }
  const splatMatched = sourceAssets.find((asset) => (
    typeof asset.splats === 'number'
    && typeof requestedAsset?.splats === 'number'
    && asset.splats === requestedAsset.splats
  ));
  return splatMatched ?? sourceAssets[0] ?? null;
}

function splatEquivalent(left, right) {
  return typeof left?.splats === 'number'
    && typeof right?.splats === 'number'
    && left.splats === right.splats;
}

function resolveCandidate(manifest, requestedAsset) {
  if (!requestedAsset) {
    return {
      requestedAsset: null,
      candidateAsset: null,
      mode: 'unsupported',
      firstPartyLoadable: false,
      measuredDefaultRuntime: false,
      degraded: false,
      splatEquivalent: false,
      requiresLocalSourceAsset: false,
      reason: 'No Gaussian asset was requested.',
      blockers: ['missing-requested-asset']
    };
  }

  if (directFirstPartyFormats.has(requestedAsset.type)) {
    return {
      requestedAsset,
      candidateAsset: requestedAsset,
      mode: 'direct-default',
      firstPartyLoadable: true,
      measuredDefaultRuntime: true,
      degraded: false,
      splatEquivalent: true,
      requiresLocalSourceAsset: requestedAsset.role === 'source',
      reason: `${requestedAsset.type.toUpperCase()} is directly loadable by the first-party renderer.`,
      blockers: []
    };
  }

  const blockers = [`direct-${requestedAsset.type}-rendering-not-implemented`];
  const sourcePly = findSourcePly(manifest, requestedAsset);
  if (!sourcePly) {
    return {
      requestedAsset,
      candidateAsset: null,
      mode: 'unsupported',
      firstPartyLoadable: false,
      measuredDefaultRuntime: false,
      degraded: false,
      splatEquivalent: false,
      requiresLocalSourceAsset: false,
      reason: `${requestedAsset.type.toUpperCase()} is not directly supported and no source PLY full-scene candidate exists.`,
      blockers: [...blockers, 'missing-source-ply-candidate']
    };
  }

  const equivalent = splatEquivalent(requestedAsset, sourcePly);
  return {
    requestedAsset,
    candidateAsset: sourcePly,
    mode: 'source-ply-substitute',
    firstPartyLoadable: true,
    measuredDefaultRuntime: false,
    degraded: true,
    splatEquivalent: equivalent,
    requiresLocalSourceAsset: true,
    reason: `${requestedAsset.type.toUpperCase()} is not directly supported; using full source PLY as a degraded measurement candidate.`,
    blockers: equivalent
      ? blockers
      : [...blockers, 'source-ply-splat-count-mismatch']
  };
}

async function compactResolution(label, resolution) {
  const candidatePath = resolution.candidateAsset?.url ? resolveScenePath(resolution.candidateAsset.url) : null;
  const candidateExists = candidatePath ? await exists(candidatePath) : false;
  return {
    label,
    requested_asset_id: resolution.requestedAsset?.id ?? null,
    requested_type: resolution.requestedAsset?.type ?? null,
    requested_splats: resolution.requestedAsset?.splats ?? null,
    candidate_asset_id: resolution.candidateAsset?.id ?? null,
    candidate_type: resolution.candidateAsset?.type ?? null,
    candidate_role: resolution.candidateAsset?.role ?? null,
    candidate_splats: resolution.candidateAsset?.splats ?? null,
    candidate_url: resolution.candidateAsset?.url ?? null,
    candidate_path: candidatePath ? relative(process.cwd(), candidatePath).replaceAll('\\', '/') : null,
    candidate_exists: candidateExists,
    mode: resolution.mode,
    firstPartyLoadable: resolution.firstPartyLoadable,
    measuredDefaultRuntime: resolution.measuredDefaultRuntime,
    degraded: resolution.degraded,
    splatEquivalent: resolution.splatEquivalent,
    requiresLocalSourceAsset: resolution.requiresLocalSourceAsset,
    reason: resolution.reason,
    blockers: resolution.blockers
  };
}

const manifest = await readJson(manifestPath);
const labels = ['default', 'runtime-sog', 'runtime-spz', 'source-ply'];
const resolutions = [];

for (const label of labels) {
  const requestedAsset = selectAsset(manifest, label);
  const resolution = resolveCandidate(manifest, requestedAsset);
  resolutions.push(await compactResolution(label, resolution));
}

const defaultResolution = resolutions.find((item) => item.label === 'default');
const runtimeResolutions = resolutions.filter((item) => item.label === 'runtime-sog' || item.label === 'runtime-spz');
const sourceResolution = resolutions.find((item) => item.label === 'source-ply');
const checks = [];

addCheck(checks, 'default_has_full_scene_candidate', defaultResolution?.mode === 'source-ply-substitute' && defaultResolution.candidate_exists, defaultResolution, 'Default runtime asset resolves to a full-scene source PLY measurement candidate.');
addCheck(checks, 'runtime_assets_have_full_scene_candidates', runtimeResolutions.every((item) => item.mode === 'source-ply-substitute' && item.candidate_exists), runtimeResolutions, 'Runtime SOG/SPZ assets resolve to full-scene source PLY measurement candidates.');
addCheck(checks, 'candidate_splats_match_runtime', runtimeResolutions.every((item) => item.splatEquivalent), runtimeResolutions.map((item) => ({ label: item.label, runtimeSplats: item.requested_splats, candidateSplats: item.candidate_splats, splatEquivalent: item.splatEquivalent })), 'Runtime assets and source PLY candidate have matching splat counts.');
addCheck(checks, 'source_ply_is_direct_candidate', sourceResolution?.mode === 'direct-default' && sourceResolution.candidate_exists, sourceResolution, 'Source PLY is directly loadable by the first-party renderer for full-scene measurement.');
addCheck(checks, 'default_direct_support_not_claimed', defaultResolution?.measuredDefaultRuntime === false && defaultResolution?.degraded === true, defaultResolution, 'Source PLY candidate is not falsely treated as a direct default runtime measurement.');

const report = {
  generated_at: new Date().toISOString(),
  target: 'ARK first-party full-scene measurement candidate resolver',
  manifest: relative(process.cwd(), manifestPath).replaceAll('\\', '/'),
  summary: {
    passed: checks.every((check) => check.passed),
    resolution_count: resolutions.length,
    candidate_count: resolutions.filter((item) => item.firstPartyLoadable && item.candidate_exists).length,
    source_substitute_count: resolutions.filter((item) => item.mode === 'source-ply-substitute').length,
    direct_default_count: resolutions.filter((item) => item.mode === 'direct-default').length,
    unsupported_count: resolutions.filter((item) => item.mode === 'unsupported').length,
    default_candidate_ready: defaultResolution?.firstPartyLoadable === true && defaultResolution.candidate_exists === true,
    default_measured_runtime_directly: defaultResolution?.measuredDefaultRuntime === true,
    failed_checks: checks.filter((check) => !check.passed).length
  },
  resolver: {
    direct_first_party_formats: Array.from(directFirstPartyFormats),
    note: 'Source PLY substitutes are full-scene measurement candidates only. They do not make the manifest default backend-ready.'
  },
  checks,
  resolutions
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({
  output: relative(process.cwd(), outputPath).replaceAll('\\', '/'),
  summary: report.summary,
  resolutions: report.resolutions.map((item) => ({
    label: item.label,
    requested: item.requested_asset_id,
    candidate: item.candidate_asset_id,
    mode: item.mode,
    degraded: item.degraded,
    firstPartyLoadable: item.firstPartyLoadable,
    measuredDefaultRuntime: item.measuredDefaultRuntime,
    splatEquivalent: item.splatEquivalent,
    candidateExists: item.candidate_exists
  }))
}, null, 2));

if (!report.summary.passed) {
  process.exitCode = 1;
}
