import type { ArkVec3 } from '../types';

export type ArkGaussianFormat = 'ply';

export type ArkGaussianEncoding = {
  center: 'float32_xyz';
  colorDc: 'spherical_harmonics_dc_rgb';
  opacity: 'logit';
  scale: 'log_xyz';
  rotation: 'quaternion_wxyz';
  shRest: 'spherical_harmonics_rest_rgb';
};

export type ArkGaussianBounds = {
  min: ArkVec3;
  max: ArkVec3;
};

export type ArkGaussianPercentileBounds = ArkGaussianBounds & {
  id: string;
  low: number;
  high: number;
};

export type ArkGaussianPercentileSpec = {
  id: string;
  low: number;
  high: number;
};

export type ArkGaussianProperty = {
  name: string;
  type: string;
  size: number;
  offset: number;
  index: number;
};

export type ArkGaussianPlyHeader = {
  format: 'binary_little_endian';
  version: '1.0';
  headerBytes: number;
  vertexCount: number;
  stride: number;
  properties: ArkGaussianProperty[];
  propertyByName: Record<string, ArkGaussianProperty | undefined>;
  shDegree: number;
  shRestCount: number;
};

export type ArkGaussianSummary = {
  format: ArkGaussianFormat;
  encoding: ArkGaussianEncoding;
  count: number;
  validPositionCount: number;
  invalidPositionCount: number;
  shDegree: number;
  propertyCount: number;
  stride: number;
  headerBytes: number;
  bounds: ArkGaussianBounds;
  percentileBounds?: ArkGaussianPercentileBounds[];
  rawRanges: {
    opacity?: [number, number];
    scale?: ArkGaussianBounds;
    rotationNorm?: [number, number];
  };
  decodedRanges: {
    opacity?: [number, number];
    scale?: ArkGaussianBounds;
  };
};

export type ArkGaussianSummaryOptions = {
  percentileBounds?: ArkGaussianPercentileSpec[];
};

export type ArkGaussianData = {
  format: ArkGaussianFormat;
  encoding: ArkGaussianEncoding;
  sourceCount: number;
  count: number;
  shDegree: number;
  sourceIndices: Uint32Array;
  invalidSourceIndices: Uint32Array;
  centers: Float32Array;
  colorsDc: Float32Array;
  opacities: Float32Array;
  scales: Float32Array;
  rotations: Float32Array;
  shRest?: Float32Array;
  summary: ArkGaussianSummary;
};

export type ArkGaussianInvalidPolicy = 'skip' | 'keep' | 'error';

export type ArkGaussianDecodeOptions = {
  limit?: number;
  includeShRest?: boolean;
  invalidPolicy?: ArkGaussianInvalidPolicy;
  percentileBounds?: ArkGaussianPercentileSpec[];
};
