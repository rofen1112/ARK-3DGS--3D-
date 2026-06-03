import type { ArkGaussianAsset, ArkSceneManifest } from '../types';
import { isDirectFirstPartyGaussianFormat } from './runtimeMetadata';

export type ArkFirstPartyRenderableMode = 'direct' | 'preview-substitute' | 'unsupported';

export type ArkFirstPartyRenderableAssetResolution = {
  requestedAsset: ArkGaussianAsset | null;
  renderableAsset: ArkGaussianAsset | null;
  mode: ArkFirstPartyRenderableMode;
  directFirstPartyRenderSupported: boolean;
  degraded: boolean;
  reason: string;
  blockers: string[];
};

export type ArkFirstPartyRenderableAssetOptions = {
  allowPreviewSubstitute?: boolean;
};

const DEFAULT_RENDERABLE_OPTIONS: Required<ArkFirstPartyRenderableAssetOptions> = {
  allowPreviewSubstitute: true
};

function allAssets(manifest: ArkSceneManifest) {
  return manifest.gaussians?.items ?? [];
}

function findPreviewPly(assets: ArkGaussianAsset[], requestedAsset: ArkGaussianAsset) {
  const previewAssets = assets.filter((asset) => asset.role === 'preview' && asset.type === 'ply');
  if (requestedAsset.sourceAssetId) {
    const sourceMatched = previewAssets.find((asset) => asset.sourceAssetId === requestedAsset.sourceAssetId);
    if (sourceMatched) return sourceMatched;
  }
  return previewAssets[0] ?? null;
}

export function resolveFirstPartyRenderableAsset(
  manifest: ArkSceneManifest,
  requestedAsset: ArkGaussianAsset | null | undefined,
  options: ArkFirstPartyRenderableAssetOptions = {}
): ArkFirstPartyRenderableAssetResolution {
  const resolvedOptions = { ...DEFAULT_RENDERABLE_OPTIONS, ...options };
  const assets = allAssets(manifest);
  const asset = requestedAsset ?? null;
  if (!asset) {
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

  if (isDirectFirstPartyGaussianFormat(asset.type)) {
    return {
      requestedAsset: asset,
      renderableAsset: asset,
      mode: 'direct',
      directFirstPartyRenderSupported: true,
      degraded: false,
      reason: `${asset.type.toUpperCase()} is directly supported by the first-party renderer.`,
      blockers: []
    };
  }

  const blockers = [`direct-${asset.type}-rendering-not-implemented`];
  if (!resolvedOptions.allowPreviewSubstitute) {
    return {
      requestedAsset: asset,
      renderableAsset: null,
      mode: 'unsupported',
      directFirstPartyRenderSupported: false,
      degraded: false,
      reason: `${asset.type.toUpperCase()} is not directly supported by the first-party renderer.`,
      blockers
    };
  }

  const previewPly = findPreviewPly(assets, asset);
  if (!previewPly) {
    return {
      requestedAsset: asset,
      renderableAsset: null,
      mode: 'unsupported',
      directFirstPartyRenderSupported: false,
      degraded: false,
      reason: `${asset.type.toUpperCase()} is not directly supported and no preview PLY substitute exists.`,
      blockers: [...blockers, 'missing-preview-ply-substitute']
    };
  }

  return {
    requestedAsset: asset,
    renderableAsset: previewPly,
    mode: 'preview-substitute',
    directFirstPartyRenderSupported: false,
    degraded: true,
    reason: `${asset.type.toUpperCase()} is not directly supported; using preview PLY as a degraded first-party substitute.`,
    blockers
  };
}
