import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, stat, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';

const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
const requestedInputPath = resolve(
  positionalArgs[0]?.toLowerCase().endsWith('.ply')
    ? positionalArgs[0]
    : 'public/scenes/demo_room_001/gaussian/scene.ply'
);
const outputPath = resolve(positionalArgs[1] ?? 'public/scenes/demo_room_001/meta/gaussian_data_contract_report.json');
const fallbackInputPath = resolve('3D-model/东莞非遗.ply');
if (process.env.ARK_DEBUG_ARGS === '1') {
  console.error(JSON.stringify({ argv: process.argv, positionalArgs, requestedInputPath, outputPath }, null, 2));
}
const HEADER_PROBE_BYTES = 64 * 1024;
const SCAN_BUFFER_BYTES = 8 * 1024 * 1024;

const typeSizes = {
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

const encoding = {
  center: 'float32_xyz',
  colorDc: 'spherical_harmonics_dc_rgb',
  opacity: 'logit',
  scale: 'log_xyz',
  rotation: 'quaternion_wxyz',
  shRest: 'spherical_harmonics_rest_rgb'
};

const percentileSpecs = [
  { id: 'broad_01_99', low: 0.01, high: 0.99 },
  { id: 'solid_05_95', low: 0.05, high: 0.95 },
  { id: 'core_10_90', low: 0.10, high: 0.90 }
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function round(value, digits = 6) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function roundVec(values, digits = 6) {
  return values.map((value) => round(value, digits));
}

function findHeaderEnd(buffer) {
  const marker = Buffer.from('end_header');
  const markerIndex = buffer.indexOf(marker);
  assert(markerIndex >= 0, 'PLY header does not contain end_header');
  const headerEnd = buffer.indexOf(0x0a, markerIndex) + 1;
  assert(headerEnd > 0, 'Could not locate PLY header newline');
  return headerEnd;
}

function inferShDegree(restCount) {
  if (restCount === 0) return 0;
  if (restCount % 3 !== 0) return 0;
  const totalCoefficientsPerChannel = restCount / 3 + 1;
  const degree = Math.sqrt(totalCoefficientsPerChannel) - 1;
  return Number.isInteger(degree) ? degree : 0;
}

function parseHeader(buffer) {
  const headerBytes = findHeaderEnd(buffer);
  const header = buffer.subarray(0, headerBytes).toString('ascii');
  const lines = header.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  assert(lines[0] === 'ply', 'Not a PLY file');
  assert(lines.includes('format binary_little_endian 1.0'), 'Only binary_little_endian PLY 1.0 is supported');

  let vertexCount = 0;
  let inVertex = false;
  const properties = [];

  for (const line of lines) {
    const parts = line.split(/\s+/u);
    if (parts[0] === 'element') {
      inVertex = parts[1] === 'vertex';
      if (inVertex) vertexCount = Number(parts[2]);
      continue;
    }
    if (inVertex && parts[0] === 'property') {
      assert(parts[1] !== 'list', 'List properties inside vertex elements are not supported');
      const type = parts[1];
      const name = parts.at(-1);
      assert(name, `Invalid PLY property line: ${line}`);
      assert(typeSizes[type], `Unsupported PLY property type: ${type}`);
      properties.push({
        name,
        type,
        size: typeSizes[type],
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
    assert(propertyByName[required], `Missing Gaussian PLY property: ${required}`);
  }

  const shRestCount = properties.filter((property) => /^f_rest_\d+$/u.test(property.name)).length;
  return {
    headerBytes,
    vertexCount,
    properties,
    propertyByName,
    propertyCount: properties.length,
    stride,
    shRestCount,
    shDegree: inferShDegree(shRestCount)
  };
}

async function readHeaderProbe(filePath) {
  const file = await open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(HEADER_PROBE_BYTES);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await file.close();
  }
}

async function resolveReadablePlyInput(filePath) {
  try {
    parseHeader(await readHeaderProbe(filePath));
    return filePath;
  } catch (error) {
    if (filePath !== fallbackInputPath) {
      try {
        parseHeader(await readHeaderProbe(fallbackInputPath));
        console.warn(`Using fallback PLY source because requested source was not readable as PLY: ${relative(process.cwd(), filePath)}`);
        return fallbackInputPath;
      } catch {
        // Preserve the original failure below.
      }
    }
    throw error;
  }
}

async function hashFile(filePath) {
  const hash = createHash('sha256');
  await new Promise((resolvePromise, rejectPromise) => {
    createReadStream(filePath)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', rejectPromise)
      .on('end', resolvePromise);
  });
  return hash.digest('hex');
}

function readScalar(buffer, offset, type) {
  switch (type) {
    case 'char':
    case 'int8':
      return buffer.readInt8(offset);
    case 'uchar':
    case 'uint8':
      return buffer.readUInt8(offset);
    case 'short':
    case 'int16':
      return buffer.readInt16LE(offset);
    case 'ushort':
    case 'uint16':
      return buffer.readUInt16LE(offset);
    case 'int':
    case 'int32':
      return buffer.readInt32LE(offset);
    case 'uint':
    case 'uint32':
      return buffer.readUInt32LE(offset);
    case 'float':
    case 'float32':
      return buffer.readFloatLE(offset);
    case 'double':
    case 'float64':
      return buffer.readDoubleLE(offset);
    default:
      throw new Error(`Unsupported PLY property type: ${type}`);
  }
}

function readProperty(buffer, baseOffset, property) {
  return readScalar(buffer, baseOffset + property.offset, property.type);
}

function emptyBounds() {
  return {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity]
  };
}

function expandBounds(bounds, x, y, z) {
  bounds.min[0] = Math.min(bounds.min[0], x);
  bounds.min[1] = Math.min(bounds.min[1], y);
  bounds.min[2] = Math.min(bounds.min[2], z);
  bounds.max[0] = Math.max(bounds.max[0], x);
  bounds.max[1] = Math.max(bounds.max[1], y);
  bounds.max[2] = Math.max(bounds.max[2], z);
}

function normalizeBounds(bounds) {
  if (!Number.isFinite(bounds.min[0])) {
    return {
      min: [0, 0, 0],
      max: [0, 0, 0]
    };
  }
  return {
    min: roundVec(bounds.min),
    max: roundVec(bounds.max)
  };
}

function updateRange(range, value) {
  if (!Number.isFinite(value)) return range;
  if (!range) return [value, value];
  range[0] = Math.min(range[0], value);
  range[1] = Math.max(range[1], value);
  return range;
}

function normalizeRange(range) {
  if (!range) return null;
  return [round(range[0]), round(range[1])];
}

function clampPercentile(value) {
  return Math.max(0, Math.min(1, value));
}

function percentile(sortedValues, percentileValue) {
  if (sortedValues.length === 0) return 0;
  const p = clampPercentile(percentileValue);
  const index = (sortedValues.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  const weight = index - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function computePercentileBounds(xs, ys, zs) {
  const sortedX = Float32Array.from(xs).sort();
  const sortedY = Float32Array.from(ys).sort();
  const sortedZ = Float32Array.from(zs).sort();
  return percentileSpecs.map((spec) => ({
    id: spec.id,
    low: spec.low,
    high: spec.high,
    min: roundVec([
      percentile(sortedX, spec.low),
      percentile(sortedY, spec.low),
      percentile(sortedZ, spec.low)
    ]),
    max: roundVec([
      percentile(sortedX, spec.high),
      percentile(sortedY, spec.high),
      percentile(sortedZ, spec.high)
    ])
  }));
}

function sigmoid(value) {
  return 1 / (1 + Math.exp(-value));
}

async function summarize(filePath, header) {
  const props = header.propertyByName;
  const bounds = emptyBounds();
  const scaleRaw = emptyBounds();
  const scaleDecoded = emptyBounds();
  let opacityRawRange = null;
  let opacityDecodedRange = null;
  let rotationNormRange = null;
  let firstValid = null;
  let validPositionCount = 0;
  let invalidPositionCount = 0;
  const xs = new Float32Array(header.vertexCount);
  const ys = new Float32Array(header.vertexCount);
  const zs = new Float32Array(header.vertexCount);
  const verticesPerChunk = Math.max(1, Math.floor(SCAN_BUFFER_BYTES / header.stride));
  const buffer = Buffer.alloc(verticesPerChunk * header.stride);
  const file = await open(filePath, 'r');

  try {
    for (let firstVertex = 0; firstVertex < header.vertexCount; firstVertex += verticesPerChunk) {
      const chunkVertexCount = Math.min(verticesPerChunk, header.vertexCount - firstVertex);
      const bytesToRead = chunkVertexCount * header.stride;
      const fileOffset = header.headerBytes + firstVertex * header.stride;
      const { bytesRead } = await file.read(buffer, 0, bytesToRead, fileOffset);
      assert(bytesRead === bytesToRead, `Unexpected EOF while reading vertex chunk at ${firstVertex}`);

      for (let chunkIndex = 0; chunkIndex < chunkVertexCount; chunkIndex += 1) {
        const i = firstVertex + chunkIndex;
        const baseOffset = chunkIndex * header.stride;
        const x = readProperty(buffer, baseOffset, props.x);
        const y = readProperty(buffer, baseOffset, props.y);
        const z = readProperty(buffer, baseOffset, props.z);

        const validPosition = Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z);
        if (validPosition) {
          expandBounds(bounds, x, y, z);
          xs[validPositionCount] = x;
          ys[validPositionCount] = y;
          zs[validPositionCount] = z;
          validPositionCount += 1;
        } else {
          invalidPositionCount += 1;
        }

        const opacityRaw = readProperty(buffer, baseOffset, props.opacity);
        opacityRawRange = updateRange(opacityRawRange, opacityRaw);
        opacityDecodedRange = updateRange(opacityDecodedRange, sigmoid(opacityRaw));

        const sx = readProperty(buffer, baseOffset, props.scale_0);
        const sy = readProperty(buffer, baseOffset, props.scale_1);
        const sz = readProperty(buffer, baseOffset, props.scale_2);
        if ([sx, sy, sz].every(Number.isFinite)) {
          expandBounds(scaleRaw, sx, sy, sz);
          expandBounds(scaleDecoded, Math.exp(sx), Math.exp(sy), Math.exp(sz));
        }

        const rotation = [
          readProperty(buffer, baseOffset, props.rot_0),
          readProperty(buffer, baseOffset, props.rot_1),
          readProperty(buffer, baseOffset, props.rot_2),
          readProperty(buffer, baseOffset, props.rot_3)
        ];
        if (rotation.every(Number.isFinite)) {
          rotationNormRange = updateRange(rotationNormRange, Math.hypot(...rotation));
        }

        if (!firstValid && validPosition) {
          firstValid = {
            index: i,
            center: roundVec([x, y, z]),
            colorDc: roundVec([
              readProperty(buffer, baseOffset, props.f_dc_0),
              readProperty(buffer, baseOffset, props.f_dc_1),
              readProperty(buffer, baseOffset, props.f_dc_2)
            ]),
            opacityRaw: round(opacityRaw),
            opacity: round(sigmoid(opacityRaw)),
            scaleRaw: roundVec([sx, sy, sz]),
            scale: roundVec([Math.exp(sx), Math.exp(sy), Math.exp(sz)]),
            rotationRawWxyz: roundVec(rotation),
            rotationNorm: round(Math.hypot(...rotation))
          };
        }
      }
    }
  } finally {
    await file.close();
  }

  return {
    format: 'ply',
    encoding,
    count: header.vertexCount,
    validPositionCount,
    invalidPositionCount,
    positionValidityRatio: round(validPositionCount / header.vertexCount, 8),
    shDegree: header.shDegree,
    propertyCount: header.propertyCount,
    stride: header.stride,
    headerBytes: header.headerBytes,
    bounds: normalizeBounds(bounds),
    percentileBounds: computePercentileBounds(
      xs.subarray(0, validPositionCount),
      ys.subarray(0, validPositionCount),
      zs.subarray(0, validPositionCount)
    ),
    rawRanges: {
      opacity: normalizeRange(opacityRawRange),
      scale: normalizeBounds(scaleRaw),
      rotationNorm: normalizeRange(rotationNormRange)
    },
    decodedRanges: {
      opacity: normalizeRange(opacityDecodedRange),
      scale: normalizeBounds(scaleDecoded)
    },
    firstValid
  };
}

const startedAt = performance.now();
const inputPath = await resolveReadablePlyInput(requestedInputPath);
const fileStats = await stat(inputPath);
const headerProbe = await readHeaderProbe(inputPath);
const header = parseHeader(headerProbe);
const summary = await summarize(inputPath, header);
const sha256 = await hashFile(inputPath);
const durationSeconds = (performance.now() - startedAt) / 1000;
const expectedDataEndByte = header.headerBytes + header.vertexCount * header.stride;

const report = {
  generated_at: new Date().toISOString(),
  requested_source_ply: relative(process.cwd(), requestedInputPath).replaceAll('\\', '/'),
  source_ply: relative(process.cwd(), inputPath).replaceAll('\\', '/'),
  file_size_bytes: fileStats.size,
  expected_data_end_byte: expectedDataEndByte,
  trailing_bytes: Math.max(0, fileStats.size - expectedDataEndByte),
  sha256,
  parser: {
    name: 'ARK first-party Gaussian PLY validator',
    stage: 'phase1-data-contract'
  },
  header: {
    format: 'binary_little_endian 1.0',
    vertex_count: header.vertexCount,
    property_count: header.propertyCount,
    stride: header.stride,
    header_bytes: header.headerBytes,
    sh_degree: header.shDegree,
    sh_rest_count: header.shRestCount,
    properties: header.properties.map((property) => property.name)
  },
  summary,
  quality_signals: {
    has_required_gaussian_fields: true,
    has_sh3: header.shDegree === 3,
    has_invalid_positions: summary.invalidPositionCount > 0,
    can_build_ark_gaussian_data: summary.validPositionCount > 0 && header.propertyCount >= 14
  },
  duration_seconds: round(durationSeconds, 3)
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({
  output: relative(process.cwd(), outputPath).replaceAll('\\', '/'),
  vertex_count: header.vertexCount,
  valid_position_count: summary.validPositionCount,
  invalid_position_count: summary.invalidPositionCount,
  sh_degree: header.shDegree,
  bounds: summary.bounds,
  percentile_bounds: Object.fromEntries(summary.percentileBounds.map((item) => [item.id, {
    min: item.min,
    max: item.max
  }])),
  duration_seconds: report.duration_seconds
}, null, 2));
