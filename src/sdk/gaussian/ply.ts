import type {
  ArkGaussianBounds,
  ArkGaussianData,
  ArkGaussianDecodeOptions,
  ArkGaussianEncoding,
  ArkGaussianPercentileBounds,
  ArkGaussianPercentileSpec,
  ArkGaussianPlyHeader,
  ArkGaussianProperty,
  ArkGaussianSummary,
  ArkGaussianSummaryOptions
} from './types';

const PLY_TYPE_SIZES: Record<string, number> = {
  char: 1,
  uchar: 1,
  int8: 1,
  uint8: 1,
  short: 2,
  ushort: 2,
  int16: 2,
  uint16: 2,
  int: 4,
  uint: 4,
  int32: 4,
  uint32: 4,
  float: 4,
  float32: 4,
  double: 8,
  float64: 8
};

const GAUSSIAN_ENCODING: ArkGaussianEncoding = {
  center: 'float32_xyz',
  colorDc: 'spherical_harmonics_dc_rgb',
  opacity: 'logit',
  scale: 'log_xyz',
  rotation: 'quaternion_wxyz',
  shRest: 'spherical_harmonics_rest_rgb'
};

function toBytes(input: ArrayBuffer | ArrayBufferView) {
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
}

function findAscii(bytes: Uint8Array, marker: string) {
  const markerBytes = new TextEncoder().encode(marker);
  outer: for (let i = 0; i <= bytes.length - markerBytes.length; i += 1) {
    for (let j = 0; j < markerBytes.length; j += 1) {
      if (bytes[i + j] !== markerBytes[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function getHeaderEnd(bytes: Uint8Array) {
  const markerIndex = findAscii(bytes, 'end_header');
  if (markerIndex < 0) {
    throw new Error('PLY header does not contain end_header.');
  }
  for (let i = markerIndex; i < bytes.length; i += 1) {
    if (bytes[i] === 0x0a) return i + 1;
  }
  throw new Error('PLY header is missing a trailing newline.');
}

function inferShDegree(restCount: number) {
  if (restCount === 0) return 0;
  if (restCount % 3 !== 0) return 0;
  const totalCoefficientsPerChannel = restCount / 3 + 1;
  const degree = Math.sqrt(totalCoefficientsPerChannel) - 1;
  return Number.isInteger(degree) ? degree : 0;
}

function requireProperty(header: ArkGaussianPlyHeader, name: string) {
  const property = header.propertyByName[name];
  if (!property) throw new Error(`Missing Gaussian PLY property: ${name}`);
  return property;
}

function createEmptyBounds(): ArkGaussianBounds {
  return {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity]
  };
}

function expandBounds(bounds: ArkGaussianBounds, x: number, y: number, z: number) {
  bounds.min[0] = Math.min(bounds.min[0], x);
  bounds.min[1] = Math.min(bounds.min[1], y);
  bounds.min[2] = Math.min(bounds.min[2], z);
  bounds.max[0] = Math.max(bounds.max[0], x);
  bounds.max[1] = Math.max(bounds.max[1], y);
  bounds.max[2] = Math.max(bounds.max[2], z);
}

function normalizeBounds(bounds: ArkGaussianBounds): ArkGaussianBounds {
  if (!Number.isFinite(bounds.min[0])) {
    return {
      min: [0, 0, 0],
      max: [0, 0, 0]
    };
  }
  return bounds;
}

function updateRange(range: [number, number] | undefined, value: number): [number, number] {
  if (!Number.isFinite(value)) return range ?? [Infinity, -Infinity];
  if (!range) return [value, value];
  range[0] = Math.min(range[0], value);
  range[1] = Math.max(range[1], value);
  return range;
}

function normalizeRange(range: [number, number] | undefined) {
  if (!range || !Number.isFinite(range[0]) || !Number.isFinite(range[1])) return undefined;
  return range;
}

function sigmoid(value: number) {
  return 1 / (1 + Math.exp(-value));
}

function clampPercentile(value: number) {
  return Math.max(0, Math.min(1, value));
}

function percentile(sortedValues: Float32Array, percentileValue: number) {
  if (sortedValues.length === 0) return 0;
  const p = clampPercentile(percentileValue);
  const index = (sortedValues.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  const weight = index - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function computePercentileBounds(xs: Float32Array, ys: Float32Array, zs: Float32Array, specs: ArkGaussianPercentileSpec[]) {
  if (specs.length === 0) return undefined;
  const sortedX = Float32Array.from(xs).sort();
  const sortedY = Float32Array.from(ys).sort();
  const sortedZ = Float32Array.from(zs).sort();
  return specs.map<ArkGaussianPercentileBounds>((spec) => ({
    id: spec.id,
    low: clampPercentile(spec.low),
    high: clampPercentile(spec.high),
    min: [
      percentile(sortedX, spec.low),
      percentile(sortedY, spec.low),
      percentile(sortedZ, spec.low)
    ],
    max: [
      percentile(sortedX, spec.high),
      percentile(sortedY, spec.high),
      percentile(sortedZ, spec.high)
    ]
  }));
}

function readScalar(view: DataView, offset: number, type: string) {
  switch (type) {
    case 'char':
    case 'int8':
      return view.getInt8(offset);
    case 'uchar':
    case 'uint8':
      return view.getUint8(offset);
    case 'short':
    case 'int16':
      return view.getInt16(offset, true);
    case 'ushort':
    case 'uint16':
      return view.getUint16(offset, true);
    case 'int':
    case 'int32':
      return view.getInt32(offset, true);
    case 'uint':
    case 'uint32':
      return view.getUint32(offset, true);
    case 'float':
    case 'float32':
      return view.getFloat32(offset, true);
    case 'double':
    case 'float64':
      return view.getFloat64(offset, true);
    default:
      throw new Error(`Unsupported PLY property type: ${type}`);
  }
}

function readProperty(view: DataView, baseOffset: number, property: ArkGaussianProperty) {
  return readScalar(view, baseOffset + property.offset, property.type);
}

function hasFinitePosition(view: DataView, baseOffset: number, px: ArkGaussianProperty, py: ArkGaussianProperty, pz: ArkGaussianProperty) {
  return Number.isFinite(readProperty(view, baseOffset, px))
    && Number.isFinite(readProperty(view, baseOffset, py))
    && Number.isFinite(readProperty(view, baseOffset, pz));
}

function collectInvalidPositionIndices(header: ArkGaussianPlyHeader, view: DataView) {
  const px = requireProperty(header, 'x');
  const py = requireProperty(header, 'y');
  const pz = requireProperty(header, 'z');
  const invalid: number[] = [];

  for (let i = 0; i < header.vertexCount; i += 1) {
    const baseOffset = header.headerBytes + i * header.stride;
    if (!hasFinitePosition(view, baseOffset, px, py, pz)) {
      invalid.push(i);
    }
  }

  return new Uint32Array(invalid);
}

export function parseGaussianPlyHeader(input: ArrayBuffer | ArrayBufferView): ArkGaussianPlyHeader {
  const bytes = toBytes(input);
  const headerBytes = getHeaderEnd(bytes);
  const headerText = new TextDecoder('ascii').decode(bytes.subarray(0, headerBytes));
  const lines = headerText.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  if (lines[0] !== 'ply') {
    throw new Error('Not a PLY file.');
  }
  if (!lines.includes('format binary_little_endian 1.0')) {
    throw new Error('Only binary_little_endian PLY 1.0 is supported.');
  }

  let vertexCount = 0;
  let inVertex = false;
  const properties: ArkGaussianProperty[] = [];

  for (const line of lines) {
    const parts = line.split(/\s+/u);
    if (parts[0] === 'element') {
      inVertex = parts[1] === 'vertex';
      if (inVertex) vertexCount = Number(parts[2]);
      continue;
    }

    if (inVertex && parts[0] === 'property') {
      if (parts[1] === 'list') {
        throw new Error('List properties inside vertex elements are not supported.');
      }
      const type = parts[1];
      const name = parts.at(-1);
      if (!name) throw new Error(`Invalid PLY property line: ${line}`);
      const size = PLY_TYPE_SIZES[type];
      if (!size) throw new Error(`Unsupported PLY property type: ${type}`);
      properties.push({
        name,
        type,
        size,
        offset: 0,
        index: properties.length
      });
    }
  }

  let stride = 0;
  for (const property of properties) {
    property.offset = stride;
    stride += property.size;
  }

  const propertyByName = Object.fromEntries(properties.map((property) => [property.name, property]));
  for (const required of ['x', 'y', 'z', 'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity', 'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3']) {
    requireProperty({ propertyByName } as ArkGaussianPlyHeader, required);
  }

  const shRestCount = properties.filter((property) => /^f_rest_\d+$/u.test(property.name)).length;
  return {
    format: 'binary_little_endian',
    version: '1.0',
    headerBytes,
    vertexCount,
    stride,
    properties,
    propertyByName,
    shDegree: inferShDegree(shRestCount),
    shRestCount
  };
}

export function summarizeGaussianPly(input: ArrayBuffer | ArrayBufferView, options: ArkGaussianSummaryOptions = {}): ArkGaussianSummary {
  const bytes = toBytes(input);
  const header = parseGaussianPlyHeader(bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const percentileSpecs = options.percentileBounds ?? [];
  const shouldCollectPercentiles = percentileSpecs.length > 0;
  const px = requireProperty(header, 'x');
  const py = requireProperty(header, 'y');
  const pz = requireProperty(header, 'z');
  const opacity = requireProperty(header, 'opacity');
  const scales = [
    requireProperty(header, 'scale_0'),
    requireProperty(header, 'scale_1'),
    requireProperty(header, 'scale_2')
  ];
  const rotations = [
    requireProperty(header, 'rot_0'),
    requireProperty(header, 'rot_1'),
    requireProperty(header, 'rot_2'),
    requireProperty(header, 'rot_3')
  ];

  const bounds = createEmptyBounds();
  const rawScaleBounds = createEmptyBounds();
  const decodedScaleBounds = createEmptyBounds();
  let rawOpacityRange: [number, number] | undefined;
  let decodedOpacityRange: [number, number] | undefined;
  let rotationNormRange: [number, number] | undefined;
  let validPositionCount = 0;
  let invalidPositionCount = 0;
  const xs = shouldCollectPercentiles ? new Float32Array(header.vertexCount) : null;
  const ys = shouldCollectPercentiles ? new Float32Array(header.vertexCount) : null;
  const zs = shouldCollectPercentiles ? new Float32Array(header.vertexCount) : null;

  for (let i = 0; i < header.vertexCount; i += 1) {
    const baseOffset = header.headerBytes + i * header.stride;
    const x = readProperty(view, baseOffset, px);
    const y = readProperty(view, baseOffset, py);
    const z = readProperty(view, baseOffset, pz);
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
      expandBounds(bounds, x, y, z);
      if (xs && ys && zs) {
        xs[validPositionCount] = x;
        ys[validPositionCount] = y;
        zs[validPositionCount] = z;
      }
      validPositionCount += 1;
    } else {
      invalidPositionCount += 1;
    }

    const opacityRaw = readProperty(view, baseOffset, opacity);
    rawOpacityRange = updateRange(rawOpacityRange, opacityRaw);
    decodedOpacityRange = updateRange(decodedOpacityRange, sigmoid(opacityRaw));

    const scaleValues = scales.map((property) => readProperty(view, baseOffset, property));
    if (scaleValues.every(Number.isFinite)) {
      expandBounds(rawScaleBounds, scaleValues[0], scaleValues[1], scaleValues[2]);
      expandBounds(decodedScaleBounds, Math.exp(scaleValues[0]), Math.exp(scaleValues[1]), Math.exp(scaleValues[2]));
    }

    const rotationValues = rotations.map((property) => readProperty(view, baseOffset, property));
    if (rotationValues.every(Number.isFinite)) {
      const norm = Math.hypot(rotationValues[0], rotationValues[1], rotationValues[2], rotationValues[3]);
      rotationNormRange = updateRange(rotationNormRange, norm);
    }
  }

  const percentileBounds = xs && ys && zs
    ? computePercentileBounds(
      xs.subarray(0, validPositionCount),
      ys.subarray(0, validPositionCount),
      zs.subarray(0, validPositionCount),
      percentileSpecs
    )
    : undefined;

  return {
    format: 'ply',
    encoding: GAUSSIAN_ENCODING,
    count: header.vertexCount,
    validPositionCount,
    invalidPositionCount,
    shDegree: header.shDegree,
    propertyCount: header.properties.length,
    stride: header.stride,
    headerBytes: header.headerBytes,
    bounds: normalizeBounds(bounds),
    percentileBounds,
    rawRanges: {
      opacity: normalizeRange(rawOpacityRange),
      scale: normalizeBounds(rawScaleBounds),
      rotationNorm: normalizeRange(rotationNormRange)
    },
    decodedRanges: {
      opacity: normalizeRange(decodedOpacityRange),
      scale: normalizeBounds(decodedScaleBounds)
    }
  };
}

export function decodeGaussianPly(input: ArrayBuffer | ArrayBufferView, options: ArkGaussianDecodeOptions = {}): ArkGaussianData {
  const bytes = toBytes(input);
  const header = parseGaussianPlyHeader(bytes);
  const summary = summarizeGaussianPly(bytes, {
    percentileBounds: options.percentileBounds
  });
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const invalidPolicy = options.invalidPolicy ?? 'skip';
  const invalidSourceIndices = collectInvalidPositionIndices(header, view);
  if (invalidPolicy === 'error' && invalidSourceIndices.length > 0) {
    throw new Error(`Gaussian PLY contains ${invalidSourceIndices.length} invalid positions.`);
  }
  const decodedSourceCount = invalidPolicy === 'skip' ? summary.validPositionCount : header.vertexCount;
  const count = Math.min(options.limit ?? decodedSourceCount, decodedSourceCount);
  const sourceIndices = new Uint32Array(count);
  const centers = new Float32Array(count * 3);
  const colorsDc = new Float32Array(count * 3);
  const opacities = new Float32Array(count);
  const scales = new Float32Array(count * 3);
  const rotations = new Float32Array(count * 4);
  const shRest = options.includeShRest && header.shRestCount > 0
    ? new Float32Array(count * header.shRestCount)
    : undefined;

  const props = {
    x: requireProperty(header, 'x'),
    y: requireProperty(header, 'y'),
    z: requireProperty(header, 'z'),
    fdc0: requireProperty(header, 'f_dc_0'),
    fdc1: requireProperty(header, 'f_dc_1'),
    fdc2: requireProperty(header, 'f_dc_2'),
    opacity: requireProperty(header, 'opacity'),
    scale0: requireProperty(header, 'scale_0'),
    scale1: requireProperty(header, 'scale_1'),
    scale2: requireProperty(header, 'scale_2'),
    rot0: requireProperty(header, 'rot_0'),
    rot1: requireProperty(header, 'rot_1'),
    rot2: requireProperty(header, 'rot_2'),
    rot3: requireProperty(header, 'rot_3')
  };
  const restProps = shRest
    ? Array.from({ length: header.shRestCount }, (_, index) => requireProperty(header, `f_rest_${index}`))
    : [];

  let decodedIndex = 0;
  for (let sourceIndex = 0; sourceIndex < header.vertexCount && decodedIndex < count; sourceIndex += 1) {
    const baseOffset = header.headerBytes + sourceIndex * header.stride;
    if (invalidPolicy === 'skip' && !hasFinitePosition(view, baseOffset, props.x, props.y, props.z)) {
      continue;
    }

    sourceIndices[decodedIndex] = sourceIndex;
    centers[decodedIndex * 3] = readProperty(view, baseOffset, props.x);
    centers[decodedIndex * 3 + 1] = readProperty(view, baseOffset, props.y);
    centers[decodedIndex * 3 + 2] = readProperty(view, baseOffset, props.z);
    colorsDc[decodedIndex * 3] = readProperty(view, baseOffset, props.fdc0);
    colorsDc[decodedIndex * 3 + 1] = readProperty(view, baseOffset, props.fdc1);
    colorsDc[decodedIndex * 3 + 2] = readProperty(view, baseOffset, props.fdc2);
    opacities[decodedIndex] = readProperty(view, baseOffset, props.opacity);
    scales[decodedIndex * 3] = readProperty(view, baseOffset, props.scale0);
    scales[decodedIndex * 3 + 1] = readProperty(view, baseOffset, props.scale1);
    scales[decodedIndex * 3 + 2] = readProperty(view, baseOffset, props.scale2);
    rotations[decodedIndex * 4] = readProperty(view, baseOffset, props.rot0);
    rotations[decodedIndex * 4 + 1] = readProperty(view, baseOffset, props.rot1);
    rotations[decodedIndex * 4 + 2] = readProperty(view, baseOffset, props.rot2);
    rotations[decodedIndex * 4 + 3] = readProperty(view, baseOffset, props.rot3);
    if (shRest) {
      for (let j = 0; j < restProps.length; j += 1) {
        shRest[decodedIndex * restProps.length + j] = readProperty(view, baseOffset, restProps[j]);
      }
    }
    decodedIndex += 1;
  }

  return {
    format: 'ply',
    encoding: GAUSSIAN_ENCODING,
    sourceCount: header.vertexCount,
    count,
    shDegree: header.shDegree,
    sourceIndices,
    invalidSourceIndices,
    centers,
    colorsDc,
    opacities,
    scales,
    rotations,
    shRest,
    summary
  };
}
