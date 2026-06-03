import type { ArkGaussianAsset, ArkSceneManifest } from '../types';
import { isDirectFirstPartyGaussianFormat } from './runtimeMetadata';

export type ArkFirstPartyFullSceneCandidateMode = 'direct-default' | 'source-ply-substitute' | 'unsupported';

export type ArkFirstPartyFullSceneCandidateResolution = {
  requestedAsset: ArkGaussianAsset | null;
  candidateAsset: ArkGaussianAsset | null;
  mode: ArkFirstPartyFullSceneCandidateMode;
  firstPartyLoadable: boolean;
  measuredDefaultRuntime: boolean;
  degraded: boolean;
  splatEquivalent: boolean;
  requiresLocalSourceAsset: boolean;
  reason: string;
  blockers: string[];
};

export type ArkFirstPartyFullSceneCandidateOptions = {
  allowSourcePlySubstitute?: boolean;
};

const DEFAULT_OPTIONS: Required<ArkFirstPartyFullSceneCandidateOptions> = {
  allowSourcePlySubstitute: true
};

function allAssets(manifest: ArkSceneManifest) {
  return manifest.gaussians?.items ?? [];
}

function findSourcePly(assets: ArkGaussianAsset[], requestedAsset: ArkGaussianAsset) {
  const sourceAssets = assets.filter((asset) => asset.role === 'source' && asset.type === 'ply');
  if (requestedAsset.sourceAssetId) {
    const sourceMatched = sourceAssets.find((asset) => asset.id === requestedAsset.sourceAssetId);
    if (sourceMatched) return sourceMatched;
  }
  const splatMatched = sourceAssets.find((asset) => (
    typeof asset.splats === 'number'
    && typeof requestedAsset.splats === 'number'
    && asset.splats === requestedAsset.splats
  ));
  return splatMatched ?? sourceAssets[0] ?? null;
}

function splatEquivalent(left: ArkGaussianAsset, right: ArkGaussianAsset) {
  return typeof left.splats === 'number'
    && typeof right.splats === 'number'
    && left.splats === right.splats;
}

export function resolveFirstPartyFullSceneCandidate(
  manifest: ArkSceneManifest,
  requestedAsset: ArkGaussianAsset | null | undefined,
  options: ArkFirstPartyFullSceneCandidateOptions = {}
): ArkFirstPartyFullSceneCandidateResolution {
  const resolvedOptions = { ...DEFAULT_OPTIONS, ...options };
  const assets = allAssets(manifest);
  const asset = requestedAsset ?? null;
  if (!asset) {
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

  if (isDirectFirstPartyGaussianFormat(asset.type)) {
    return {
      requestedAsset: asset,
      candidateAsset: asset,
      mode: 'direct-default',
      firstPartyLoadable: true,
      measuredDefaultRuntime: true,
      degraded: false,
      splatEquivalent: true,
      requiresLocalSourceAsset: asset.role === 'source',
      reason: `${asset.type.toUpperCase()} is directly loadable by the first-party renderer.`,
      blockers: []
    };
  }

  const blockers = [`direct-${asset.type}-rendering-not-implemented`];
  if (!resolvedOptions.allowSourcePlySubstitute) {
    return {
      requestedAsset: asset,
      candidateAsset: null,
      mode: 'unsupported',
      firstPartyLoadable: false,
      measuredDefaultRuntime: false,
      degraded: false,
      splatEquivalent: false,
      requiresLocalSourceAsset: false,
      reason: `${asset.type.toUpperCase()} is not directly loadable by the first-party renderer.`,
      blockers
    };
  }

  const sourcePly = findSourcePly(assets, asset);
  if (!sourcePly) {
    return {
      requestedAsset: asset,
      candidateAsset: null,
      mode: 'unsupported',
      firstPartyLoadable: false,
      measuredDefaultRuntime: false,
      degraded: false,
      splatEquivalent: false,
      requiresLocalSourceAsset: false,
      reason: `${asset.type.toUpperCase()} is not directly supported and no source PLY full-scene candidate exists.`,
      blockers: [...blockers, 'missing-source-ply-candidate']
    };
  }

  const equivalent = splatEquivalent(asset, sourcePly);
  return {
    requestedAsset: asset,
    candidateAsset: sourcePly,
    mode: 'source-ply-substitute',
    firstPartyLoadable: true,
    measuredDefaultRuntime: false,
    degraded: true,
    splatEquivalent: equivalent,
    requiresLocalSourceAsset: true,
    reason: `${asset.type.toUpperCase()} is not directly supported; using full source PLY as a degraded measurement candidate.`,
    blockers: equivalent
      ? blockers
      : [...blockers, 'source-ply-splat-count-mismatch']
  };
}
