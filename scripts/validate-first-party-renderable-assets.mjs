import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';

const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const manifestPath = resolve(positionalArgs[0] ?? 'public/scenes/demo_room_001/manifest.json');
const outputPath = resolve(positionalArgs[1] ?? 'public/scenes/demo_room_001/meta/first_party_renderable_assets_report.json');
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

function findPreviewPly(manifest, requestedAsset) {
  const previewAssets = (manifest.gaussians?.items ?? [])
    .filter((asset) => asset.role === 'preview' && asset.type === 'ply');
  if (requestedAsset?.sourceAssetId) {
    const sourceMatched = previewAssets.find((asset) => asset.sourceAssetId === requestedAsset.sourceAssetId);
    if (sourceMatched) return sourceMatched;
  }
  return previewAssets[0] ?? null;
}

function resolveRenderable(manifest, requestedAsset) {
  if (!requestedAsset) {
    return {
      requestedAsset: null,
      renderableAsset: null,
      mode: 'unsupported',
      directFirstPartyRenderSupported: false,
      degraded: false,
      reason: 'No Gaussian asset was requested.',
      blockers: ['missing-requested-asset']
    };
  }

  if (directFirstPartyFormats.has(requestedAsset.type)) {
    return {
      requestedAsset,
      renderableAsset: requestedAsset,
      mode: 'direct',
      directFirstPartyRenderSupported: true,
      degraded: false,
      reason: `${requestedAsset.type.toUpperCase()} is directly supported by the first-party renderer.`,
      blockers: []
    };
  }

  const blockers = [`direct-${requestedAsset.type}-rendering-not-implemented`];
  const previewPly = findPreviewPly(manifest, requestedAsset);
  if (!previewPly) {
    return {
      requestedAsset,
      renderableAsset: null,
      mode: 'unsupported',
      directFirstPartyRenderSupported: false,
      degraded: false,
      reason: `${requestedAsset.type.toUpperCase()} is not directly supported and no preview PLY substitute exists.`,
      blockers: [...blockers, 'missing-preview-ply-substitute']
    };
  }

  return {
    requestedAsset,
    renderableAsset: previewPly,
    mode: 'preview-substitute',
    directFirstPartyRenderSupported: false,
    degraded: true,
    reason: `${requestedAsset.type.toUpperCase()} is not directly supported; using preview PLY as a degraded first-party substitute.`,
    blockers
  };
}

function compactResolution(label, resolution, renderableExists) {
  return {
    label,
    requested_asset_id: resolution.requestedAsset?.id ?? null,
    requested_type: resolution.requestedAsset?.type ?? null,
    renderable_asset_id: resolution.renderableAsset?.id ?? null,
    renderable_type: resolution.renderableAsset?.type ?? null,
    mode: resolution.mode,
    directFirstPartyRenderSupported: resolution.directFirstPartyRenderSupported,
    degraded: resolution.degraded,
    renderable_exists: renderableExists,
    reason: resolution.reason,
    blockers: resolution.blockers
  };
}

const manifest = await readJson(manifestPath);
const labels = ['default', 'runtime-sog', 'runtime-spz', 'preview-ply', 'source-ply'];
const resolutions = [];

for (const label of labels) {
  const requestedAsset = selectAsset(manifest, label);
  const resolution = resolveRenderable(manifest, requestedAsset);
  const renderablePath = resolution.renderableAsset?.url ? resolveScenePath(resolution.renderableAsset.url) : null;
  const renderableExists = renderablePath ? await exists(renderablePath) : false;
  resolutions.push(compactResolution(label, resolution, renderableExists));
}

const defaultResolution = resolutions.find((item) => item.label === 'default');
const runtimeResolutions = resolutions.filter((item) => item.label === 'runtime-sog' || item.label === 'runtime-spz');
const previewResolution = resolutions.find((item) => item.label === 'preview-ply');
const sourceResolution = resolutions.find((item) => item.label === 'source-ply');
const checks = [];

addCheck(checks, 'default_has_first_party_substitute', defaultResolution?.mode === 'preview-substitute' && defaultResolution.renderable_exists, defaultResolution, 'Default runtime asset resolves to a first-party preview substitute.');
addCheck(checks, 'runtime_assets_have_preview_substitutes', runtimeResolutions.every((item) => item.mode === 'preview-substitute' && item.renderable_exists), runtimeResolutions, 'Runtime SOG/SPZ assets resolve to first-party preview substitutes.');
addCheck(checks, 'preview_ply_is_direct_renderable', previewResolution?.mode === 'direct' && previewResolution.renderable_exists, previewResolution, 'Preview PLY is directly renderable by the first-party renderer.');
addCheck(checks, 'source_ply_is_direct_renderable', sourceResolution?.mode === 'direct' && sourceResolution.renderable_exists, sourceResolution, 'Source PLY is directly renderable in principle by the first-party renderer.');
addCheck(checks, 'runtime_direct_support_not_claimed', runtimeResolutions.every((item) => !item.directFirstPartyRenderSupported), runtimeResolutions.map((item) => ({ label: item.label, direct: item.directFirstPartyRenderSupported })), 'Runtime SOG/SPZ direct rendering is not falsely claimed.');

const report = {
  generated_at: new Date().toISOString(),
  target: 'ARK first-party renderable Gaussian asset resolver',
  manifest: relative(process.cwd(), manifestPath).replaceAll('\\', '/'),
  summary: {
    passed: checks.every((check) => check.passed),
    resolution_count: resolutions.length,
    direct_count: resolutions.filter((item) => item.mode === 'direct').length,
    preview_substitute_count: resolutions.filter((item) => item.mode === 'preview-substitute').length,
    unsupported_count: resolutions.filter((item) => item.mode === 'unsupported').length,
    failed_checks: checks.filter((check) => !check.passed).length
  },
  resolver: {
    direct_first_party_formats: Array.from(directFirstPartyFormats),
    note: 'Preview substitutes are degraded QA/renderability candidates and do not make the manifest default backend-ready.'
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
    renderable: item.renderable_asset_id,
    mode: item.mode,
    degraded: item.degraded,
    direct: item.directFirstPartyRenderSupported
  }))
}, null, 2));

if (!report.summary.passed) {
  process.exitCode = 1;
}
