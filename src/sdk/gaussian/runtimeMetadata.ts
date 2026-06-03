import type {
  ArkFitBounds,
  ArkGaussianAsset,
  ArkGaussianAssetRole,
  ArkGaussianFormat,
  ArkVec3
} from '../types';

export type ArkGaussianRuntimeMetadataStatus = 'ready' | 'incomplete';

export type ArkGaussianRuntimeMetadata = {
  id: string | null;
  role: ArkGaussianAssetRole | null;
  label: string | null;
  format: ArkGaussianFormat;
  url: string;
  sourceAssetId: string | null;
  splats: number | null;
  sizeBytes: number | null;
  dataBytes: number | null;
  fitBounds: ArkFitBounds | null;
  sourceBounds: {
    min: ArkVec3;
    max: ArkVec3;
  } | null;
  sourceSummary: {
    count: number | null;
    validPositionCount: number | null;
    invalidPositionCount: number | null;
    shDegree: number | null;
  };
  metadataStatus: ArkGaussianRuntimeMetadataStatus;
  metadataReady: boolean;
  directFirstPartyRenderSupported: boolean;
  warnings: string[];
};

export type ArkGaussianRuntimeMetadataInput = {
  asset: ArkGaussianAsset;
  fitBounds?: ArkFitBounds | null;
  sourceBounds?: {
    min: ArkVec3;
    max: ArkVec3;
  } | null;
  sourceSummary?: {
    count?: number | null;
    validPositionCount?: number | null;
    invalidPositionCount?: number | null;
    shDegree?: number | null;
  } | null;
};

const DIRECT_FIRST_PARTY_FORMATS = new Set<ArkGaussianFormat>(['ply']);
const METADATA_FORMATS = new Set<ArkGaussianFormat>(['ply', 'sog', 'spz']);

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isMetadataFormat(format: ArkGaussianFormat) {
  return METADATA_FORMATS.has(format);
}

export function isDirectFirstPartyGaussianFormat(format: ArkGaussianFormat) {
  return DIRECT_FIRST_PARTY_FORMATS.has(format);
}

export function buildGaussianRuntimeMetadata(input: ArkGaussianRuntimeMetadataInput): ArkGaussianRuntimeMetadata {
  const { asset, fitBounds = null, sourceBounds = null, sourceSummary = null } = input;
  const warnings: string[] = [];
  const directFirstPartyRenderSupported = isDirectFirstPartyGaussianFormat(asset.type);
  const splats = finiteNumber(asset.splats) ? asset.splats : sourceSummary?.count ?? null;

  if (!isMetadataFormat(asset.type)) {
    warnings.push(`No first-party metadata adapter exists for ${asset.type}.`);
  }
  if (!directFirstPartyRenderSupported) {
    warnings.push(`${asset.type.toUpperCase()} metadata is available, but direct first-party rendering is not implemented yet.`);
  }
  if (!finiteNumber(splats)) {
    warnings.push('Splat count is missing from manifest and source summary.');
  }
  if (!finiteNumber(asset.sizeBytes) && !finiteNumber(asset.dataBytes)) {
    warnings.push('Asset size is missing from manifest.');
  }
  if (!fitBounds) {
    warnings.push('Fit bounds sidecar is unavailable.');
  }

  const metadataReady = isMetadataFormat(asset.type)
    && finiteNumber(splats)
    && Boolean(asset.url)
    && Boolean(fitBounds)
    && (finiteNumber(asset.sizeBytes) || finiteNumber(asset.dataBytes));

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
    fitBounds,
    sourceBounds,
    sourceSummary: {
      count: sourceSummary?.count ?? null,
      validPositionCount: sourceSummary?.validPositionCount ?? null,
      invalidPositionCount: sourceSummary?.invalidPositionCount ?? null,
      shDegree: sourceSummary?.shDegree ?? null
    },
    metadataStatus: metadataReady ? 'ready' : 'incomplete',
    metadataReady,
    directFirstPartyRenderSupported,
    warnings
  };
}
