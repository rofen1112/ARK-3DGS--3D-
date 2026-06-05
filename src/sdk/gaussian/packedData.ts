import type { ArkGaussianData } from './types';

const SH_C0 = 0.28209479177387814;
const MIN_SCALE = 0.0001;
const MIN_VARIANCE = 1e-20;
const LOG_VARIANCE_CLAMP = 60;
const CORRELATION_CLAMP = 0.999;

export type ArkGaussianPackedDataOptions = {
  displayScale?: number;
  center?: readonly [number, number, number];
  opacityScale?: number;
  limit?: number;
  orderIndices?: Uint32Array;
};

export type ArkGaussianPackedData = {
  dataPacking: 'packed-covariance-cpu-audit';
  covarianceStorage: 'log-variance-correlation-float32';
  orderAccess: 'source-index-order';
  count: number;
  displayScale: number;
  center: readonly [number, number, number];
  opacityScale: number;
  dataIndices: Uint32Array;
  sourceIndices: Uint32Array;
  centers: Float32Array;
  covariances: Float32Array;
  colors: Float32Array;
  estimatedBytes: number;
};

export type ArkGaussianCovariance6 = readonly [
  xx: number,
  xy: number,
  xz: number,
  yy: number,
  yz: number,
  zz: number
];

export type ArkGaussianPackedCovariance6 = readonly [
  logXx: number,
  logYy: number,
  logZz: number,
  rhoXy: number,
  rhoXz: number,
  rhoYz: number
];

export type ArkGaussianPackedCovarianceAuditOptions = ArkGaussianPackedDataOptions & {
  sampleCount?: number;
  maxAbsDelta?: number;
  maxRelativeDelta?: number;
};

export type ArkGaussianPackedCovarianceAudit = {
  status: 'passed' | 'failed';
  dataPacking: ArkGaussianPackedData['dataPacking'];
  covarianceStorage: ArkGaussianPackedData['covarianceStorage'];
  sourceCount: number;
  decodedCount: number;
  sampledCount: number;
  finiteSampledCount: number;
  maxAbsDelta: number;
  meanAbsDelta: number;
  maxRelativeDelta: number;
  thresholds: {
    maxAbsDelta: number;
    maxRelativeDelta: number;
  };
  worstSample?: {
    sampleOrdinal: number;
    dataIndex: number;
    sourceIndex: number;
    component: string;
    direct: number;
    unpacked: number;
    absDelta: number;
    relativeDelta: number;
  };
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number) {
  return clamp(value, 0, 1);
}

function sigmoid(value: number) {
  return 1 / (1 + Math.exp(-value));
}

function log2(value: number) {
  return Math.log(value) / Math.LN2;
}

function exp2(value: number) {
  return 2 ** value;
}

export function decodePackedGaussianScale(value: number, displayScale = 1) {
  const decoded = Math.exp(value) * displayScale;
  return Number.isFinite(decoded) ? Math.max(decoded, MIN_SCALE) : MIN_SCALE;
}

export function normalizePackedGaussianQuaternion(
  w: number,
  x: number,
  y: number,
  z: number
): readonly [number, number, number, number] {
  const length = Math.hypot(w, x, y, z);
  if (!Number.isFinite(length) || length < 0.000001) {
    return [1, 0, 0, 0];
  }
  return [w / length, x / length, y / length, z / length];
}

function rotateByQuaternion(
  q: readonly [number, number, number, number],
  x: number,
  y: number,
  z: number
): readonly [number, number, number] {
  const qw = q[0];
  const qx = q[1];
  const qy = q[2];
  const qz = q[3];

  const cross1X = qy * z - qz * y;
  const cross1Y = qz * x - qx * z;
  const cross1Z = qx * y - qy * x;
  const innerX = cross1X + qw * x;
  const innerY = cross1Y + qw * y;
  const innerZ = cross1Z + qw * z;
  const cross2X = qy * innerZ - qz * innerY;
  const cross2Y = qz * innerX - qx * innerZ;
  const cross2Z = qx * innerY - qy * innerX;

  return [
    x + 2 * cross2X,
    y + 2 * cross2Y,
    z + 2 * cross2Z
  ];
}

export function computePackedGaussianCovariance3D(
  scale: readonly [number, number, number],
  quaternionWxyz: readonly [number, number, number, number]
): ArkGaussianCovariance6 {
  const q = normalizePackedGaussianQuaternion(
    quaternionWxyz[0],
    quaternionWxyz[1],
    quaternionWxyz[2],
    quaternionWxyz[3]
  );
  const axis0 = rotateByQuaternion(q, scale[0], 0, 0);
  const axis1 = rotateByQuaternion(q, 0, scale[1], 0);
  const axis2 = rotateByQuaternion(q, 0, 0, scale[2]);
  const xx = axis0[0] * axis0[0] + axis1[0] * axis1[0] + axis2[0] * axis2[0];
  const xy = axis0[0] * axis0[1] + axis1[0] * axis1[1] + axis2[0] * axis2[1];
  const xz = axis0[0] * axis0[2] + axis1[0] * axis1[2] + axis2[0] * axis2[2];
  const yy = axis0[1] * axis0[1] + axis1[1] * axis1[1] + axis2[1] * axis2[1];
  const yz = axis0[1] * axis0[2] + axis1[1] * axis1[2] + axis2[1] * axis2[2];
  const zz = axis0[2] * axis0[2] + axis1[2] * axis1[2] + axis2[2] * axis2[2];

  return [xx, xy, xz, yy, yz, zz];
}

export function packGaussianCovariance(covariance: ArkGaussianCovariance6): ArkGaussianPackedCovariance6 {
  const xx = Math.max(covariance[0], MIN_VARIANCE);
  const xy = covariance[1];
  const xz = covariance[2];
  const yy = Math.max(covariance[3], MIN_VARIANCE);
  const yz = covariance[4];
  const zz = Math.max(covariance[5], MIN_VARIANCE);
  return [
    clamp(log2(xx), -LOG_VARIANCE_CLAMP, LOG_VARIANCE_CLAMP),
    clamp(log2(yy), -LOG_VARIANCE_CLAMP, LOG_VARIANCE_CLAMP),
    clamp(log2(zz), -LOG_VARIANCE_CLAMP, LOG_VARIANCE_CLAMP),
    clamp(xy / Math.sqrt(xx * yy), -CORRELATION_CLAMP, CORRELATION_CLAMP),
    clamp(xz / Math.sqrt(xx * zz), -CORRELATION_CLAMP, CORRELATION_CLAMP),
    clamp(yz / Math.sqrt(yy * zz), -CORRELATION_CLAMP, CORRELATION_CLAMP)
  ];
}

export function unpackGaussianCovariance(packed: ArkGaussianPackedCovariance6): ArkGaussianCovariance6 {
  const xx = exp2(packed[0]);
  const yy = exp2(packed[1]);
  const zz = exp2(packed[2]);
  const xy = packed[3] * Math.sqrt(xx * yy);
  const xz = packed[4] * Math.sqrt(xx * zz);
  const yz = packed[5] * Math.sqrt(yy * zz);
  return [xx, xy, xz, yy, yz, zz];
}

function getDataIndex(options: ArkGaussianPackedDataOptions, outputIndex: number) {
  return options.orderIndices ? options.orderIndices[outputIndex] : outputIndex;
}

function resolveOutputCount(data: ArkGaussianData, options: ArkGaussianPackedDataOptions) {
  const requestedCount = options.orderIndices ? options.orderIndices.length : data.count;
  return Math.max(0, Math.min(options.limit ?? requestedCount, requestedCount));
}

function readDecodedScale(
  data: ArkGaussianData,
  dataIndex: number,
  displayScale: number
): readonly [number, number, number] {
  return [
    decodePackedGaussianScale(data.scales[dataIndex * 3], displayScale),
    decodePackedGaussianScale(data.scales[dataIndex * 3 + 1], displayScale),
    decodePackedGaussianScale(data.scales[dataIndex * 3 + 2], displayScale)
  ];
}

function readDecodedQuaternion(data: ArkGaussianData, dataIndex: number): readonly [number, number, number, number] {
  return normalizePackedGaussianQuaternion(
    data.rotations[dataIndex * 4],
    data.rotations[dataIndex * 4 + 1],
    data.rotations[dataIndex * 4 + 2],
    data.rotations[dataIndex * 4 + 3]
  );
}

function writePackedCovariance(target: Float32Array, offset: number, covariance: ArkGaussianCovariance6) {
  const packed = packGaussianCovariance(covariance);
  target[offset] = packed[0];
  target[offset + 1] = packed[1];
  target[offset + 2] = packed[2];
  target[offset + 3] = packed[3];
  target[offset + 4] = packed[4];
  target[offset + 5] = packed[5];
}

export function buildArkGaussianPackedData(
  data: ArkGaussianData,
  options: ArkGaussianPackedDataOptions = {}
): ArkGaussianPackedData {
  const count = resolveOutputCount(data, options);
  const displayScale = options.displayScale ?? 1;
  const center: readonly [number, number, number] = options.center ?? [0, 0, 0];
  const opacityScale = options.opacityScale ?? 1;
  const dataIndices = new Uint32Array(count);
  const sourceIndices = new Uint32Array(count);
  const centers = new Float32Array(count * 3);
  const covariances = new Float32Array(count * 6);
  const colors = new Float32Array(count * 4);

  for (let outputIndex = 0; outputIndex < count; outputIndex += 1) {
    const dataIndex = getDataIndex(options, outputIndex);
    if (dataIndex >= data.count) {
      throw new Error(`Packed Gaussian order index ${dataIndex} is outside decoded count ${data.count}.`);
    }

    dataIndices[outputIndex] = dataIndex;
    sourceIndices[outputIndex] = data.sourceIndices[dataIndex];
    centers[outputIndex * 3] = (data.centers[dataIndex * 3] - center[0]) * displayScale;
    centers[outputIndex * 3 + 1] = (data.centers[dataIndex * 3 + 1] - center[1]) * displayScale;
    centers[outputIndex * 3 + 2] = (data.centers[dataIndex * 3 + 2] - center[2]) * displayScale;
    colors[outputIndex * 4] = clamp01(0.5 + data.colorsDc[dataIndex * 3] * SH_C0);
    colors[outputIndex * 4 + 1] = clamp01(0.5 + data.colorsDc[dataIndex * 3 + 1] * SH_C0);
    colors[outputIndex * 4 + 2] = clamp01(0.5 + data.colorsDc[dataIndex * 3 + 2] * SH_C0);
    colors[outputIndex * 4 + 3] = clamp01(sigmoid(data.opacities[dataIndex]) * opacityScale);

    const scale = readDecodedScale(data, dataIndex, displayScale);
    const quaternion = readDecodedQuaternion(data, dataIndex);
    const covariance = computePackedGaussianCovariance3D(scale, quaternion);
    writePackedCovariance(covariances, outputIndex * 6, covariance);
  }

  return {
    dataPacking: 'packed-covariance-cpu-audit',
    covarianceStorage: 'log-variance-correlation-float32',
    orderAccess: 'source-index-order',
    count,
    displayScale,
    center,
    opacityScale,
    dataIndices,
    sourceIndices,
    centers,
    covariances,
    colors,
    estimatedBytes: dataIndices.byteLength + sourceIndices.byteLength + centers.byteLength + covariances.byteLength + colors.byteLength
  };
}

function readPackedCovariance(source: Float32Array, offset: number): ArkGaussianPackedCovariance6 {
  return [
    source[offset],
    source[offset + 1],
    source[offset + 2],
    source[offset + 3],
    source[offset + 4],
    source[offset + 5]
  ];
}

export function auditArkGaussianPackedCovariance(
  data: ArkGaussianData,
  options: ArkGaussianPackedCovarianceAuditOptions = {}
): ArkGaussianPackedCovarianceAudit {
  const outputCount = resolveOutputCount(data, options);
  const packed = buildArkGaussianPackedData(data, {
    ...options,
    limit: outputCount
  });
  return auditArkGaussianPackedCovarianceFromPackedData(data, packed, options);
}

export function auditArkGaussianPackedCovarianceFromPackedData(
  data: ArkGaussianData,
  packed: ArkGaussianPackedData,
  options: ArkGaussianPackedCovarianceAuditOptions = {}
): ArkGaussianPackedCovarianceAudit {
  const outputCount = packed.count;
  const sampleTarget = Math.max(0, Math.min(options.sampleCount ?? 512, outputCount));
  const sampleCount = Math.min(sampleTarget, outputCount);
  const maxAbsDeltaThreshold = options.maxAbsDelta ?? 0.0005;
  const maxRelativeDeltaThreshold = options.maxRelativeDelta ?? 0.0005;
  const displayScale = options.displayScale ?? packed.displayScale;
  const componentNames = ['xx', 'xy', 'xz', 'yy', 'yz', 'zz'];
  const stride = sampleCount > 1 ? Math.max(1, Math.floor(outputCount / sampleCount)) : 1;

  let finiteSampledCount = 0;
  let deltaCount = 0;
  let maxAbsDelta = 0;
  let maxRelativeDelta = 0;
  let sumAbsDelta = 0;
  let worstSample: ArkGaussianPackedCovarianceAudit['worstSample'];

  for (let sampleOrdinal = 0; sampleOrdinal < sampleCount; sampleOrdinal += 1) {
    const outputIndex = sampleOrdinal === sampleCount - 1
      ? outputCount - 1
      : Math.min(outputCount - 1, sampleOrdinal * stride);
    const dataIndex = packed.dataIndices[outputIndex];
    const direct = computePackedGaussianCovariance3D(
      readDecodedScale(data, dataIndex, displayScale),
      readDecodedQuaternion(data, dataIndex)
    );
    const unpacked = unpackGaussianCovariance(readPackedCovariance(packed.covariances, outputIndex * 6));
    const finite = direct.every(Number.isFinite) && unpacked.every(Number.isFinite);
    if (finite) finiteSampledCount += 1;

    for (let component = 0; component < direct.length; component += 1) {
      const absDelta = Math.abs(direct[component] - unpacked[component]);
      const relativeDelta = absDelta / Math.max(1, Math.abs(direct[component]));
      sumAbsDelta += absDelta;
      deltaCount += 1;
      if (absDelta > maxAbsDelta) maxAbsDelta = absDelta;
      if (relativeDelta > maxRelativeDelta) maxRelativeDelta = relativeDelta;
      if (!worstSample || absDelta > worstSample.absDelta) {
        worstSample = {
          sampleOrdinal,
          dataIndex,
          sourceIndex: packed.sourceIndices[outputIndex],
          component: componentNames[component],
          direct: direct[component],
          unpacked: unpacked[component],
          absDelta,
          relativeDelta
        };
      }
    }
  }

  const passed = finiteSampledCount === sampleCount
    && maxAbsDelta <= maxAbsDeltaThreshold
    && maxRelativeDelta <= maxRelativeDeltaThreshold;

  return {
    status: passed ? 'passed' : 'failed',
    dataPacking: packed.dataPacking,
    covarianceStorage: packed.covarianceStorage,
    sourceCount: data.sourceCount,
    decodedCount: data.count,
    sampledCount: sampleCount,
    finiteSampledCount,
    maxAbsDelta,
    meanAbsDelta: deltaCount > 0 ? sumAbsDelta / deltaCount : 0,
    maxRelativeDelta,
    thresholds: {
      maxAbsDelta: maxAbsDeltaThreshold,
      maxRelativeDelta: maxRelativeDeltaThreshold
    },
    worstSample
  };
}
