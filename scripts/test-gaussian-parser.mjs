import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const fixturePath = resolve('public/scenes/fixtures/tiny_gaussian_invalid.ply');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertClose(actual, expected, message, epsilon = 1e-6) {
  if (Math.abs(actual - expected) > epsilon) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function assertArrayClose(actual, expected, message, epsilon = 1e-6) {
  assert(actual.length === expected.length, `${message}: length mismatch`);
  for (let i = 0; i < actual.length; i += 1) {
    assertClose(actual[i], expected[i], `${message}[${i}]`, epsilon);
  }
}

function logit(value) {
  return Math.log(value / (1 - value));
}

function writeVertex(view, offset, values) {
  for (let i = 0; i < values.length; i += 1) {
    view.setFloat32(offset + i * 4, values[i], true);
  }
}

function createTinyGaussianPly() {
  const header = [
    'ply',
    'format binary_little_endian 1.0',
    'element vertex 4',
    'property float x',
    'property float y',
    'property float z',
    'property float f_dc_0',
    'property float f_dc_1',
    'property float f_dc_2',
    'property float opacity',
    'property float scale_0',
    'property float scale_1',
    'property float scale_2',
    'property float rot_0',
    'property float rot_1',
    'property float rot_2',
    'property float rot_3',
    'end_header',
    ''
  ].join('\n');
  const headerBytes = Buffer.from(header, 'ascii');
  const stride = 14 * 4;
  const body = new ArrayBuffer(stride * 4);
  const view = new DataView(body);
  const vertices = [
    [1, 2, 3, 0.1, 0.2, 0.3, logit(0.5), Math.log(1), Math.log(2), Math.log(3), 1, 0, 0, 0],
    [Number.NaN, 9, 9, 0.4, 0.5, 0.6, logit(0.25), Math.log(0.5), Math.log(0.5), Math.log(0.5), 1, 0, 0, 0],
    [-1, -2, -3, -0.1, -0.2, -0.3, logit(0.75), Math.log(4), Math.log(5), Math.log(6), 0, 1, 0, 0],
    [4, 0, -1, 1, 1.1, 1.2, logit(0.9), Math.log(7), Math.log(8), Math.log(9), 0, 0, 1, 0]
  ];
  vertices.forEach((vertex, index) => writeVertex(view, index * stride, vertex));
  return Buffer.concat([headerBytes, Buffer.from(body)]);
}

function createTinyGaussianShPly() {
  const shRestProperties = Array.from({ length: 9 }, (_, index) => `property float f_rest_${index}`);
  const header = [
    'ply',
    'format binary_little_endian 1.0',
    'element vertex 1',
    'property float x',
    'property float y',
    'property float z',
    'property float f_dc_0',
    'property float f_dc_1',
    'property float f_dc_2',
    'property float opacity',
    'property float scale_0',
    'property float scale_1',
    'property float scale_2',
    'property float rot_0',
    'property float rot_1',
    'property float rot_2',
    'property float rot_3',
    ...shRestProperties,
    'end_header',
    ''
  ].join('\n');
  const headerBytes = Buffer.from(header, 'ascii');
  const stride = 23 * 4;
  const body = new ArrayBuffer(stride);
  const view = new DataView(body);
  writeVertex(view, 0, [
    0, 0, 0,
    0.1, 0.2, 0.3,
    logit(0.5),
    0, 0, 0,
    1, 0, 0, 0,
    10, 11, 12, 13, 14, 15, 16, 17, 18
  ]);
  return Buffer.concat([headerBytes, Buffer.from(body)]);
}

async function loadParserModule() {
  const result = await build({
    entryPoints: ['src/sdk/gaussian/ply.ts'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    logLevel: 'silent'
  });
  const code = result.outputFiles[0].text;
  return await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

const fixture = createTinyGaussianPly();
await mkdir(resolve('public/scenes/fixtures'), { recursive: true });
await writeFile(fixturePath, fixture);

const parser = await loadParserModule();
const header = parser.parseGaussianPlyHeader(fixture);
assert(header.vertexCount === 4, 'header vertex count');
assert(header.stride === 56, 'header stride');
assert(header.shDegree === 0, 'header SH degree');

const summary = parser.summarizeGaussianPly(fixture, {
  percentileBounds: [
    { id: 'exact_percentile', low: 0, high: 1 },
    { id: 'median_point', low: 0.5, high: 0.5 }
  ]
});
assert(summary.count === 4, 'summary source count');
assert(summary.validPositionCount === 3, 'summary valid positions');
assert(summary.invalidPositionCount === 1, 'summary invalid positions');
assertArrayClose(summary.bounds.min, [-1, -2, -3], 'summary min bounds');
assertArrayClose(summary.bounds.max, [4, 2, 3], 'summary max bounds');
assert(summary.percentileBounds.length === 2, 'summary percentile bounds count');
assertArrayClose(summary.percentileBounds[0].min, [-1, -2, -3], 'exact percentile min bounds');
assertArrayClose(summary.percentileBounds[0].max, [4, 2, 3], 'exact percentile max bounds');
assertArrayClose(summary.percentileBounds[1].min, [1, 0, -1], 'median percentile min bounds');
assertArrayClose(summary.percentileBounds[1].max, [1, 0, -1], 'median percentile max bounds');

const filtered = parser.decodeGaussianPly(fixture);
assert(filtered.sourceCount === 4, 'filtered source count');
assert(filtered.count === 3, 'filtered decoded count');
assertArrayClose(Array.from(filtered.sourceIndices), [0, 2, 3], 'filtered source indices');
assertArrayClose(Array.from(filtered.invalidSourceIndices), [1], 'filtered invalid indices');
assertArrayClose(Array.from(filtered.centers.slice(0, 3)), [1, 2, 3], 'filtered first center');
assertArrayClose(Array.from(filtered.centers.slice(3, 6)), [-1, -2, -3], 'filtered second center');
assertClose(filtered.opacities[0], 0, 'filtered keeps raw opacity logit');

const decodedWithPercentiles = parser.decodeGaussianPly(fixture, {
  percentileBounds: [
    { id: 'decode_median_point', low: 0.5, high: 0.5 }
  ]
});
assert(decodedWithPercentiles.summary.percentileBounds.length === 1, 'decode percentile bounds count');
assertArrayClose(decodedWithPercentiles.summary.percentileBounds[0].min, [1, 0, -1], 'decode percentile min bounds');
assertArrayClose(decodedWithPercentiles.summary.percentileBounds[0].max, [1, 0, -1], 'decode percentile max bounds');

const kept = parser.decodeGaussianPly(fixture, { invalidPolicy: 'keep' });
assert(kept.count === 4, 'keep decoded count');
assert(Number.isNaN(kept.centers[3]), 'keep preserves invalid center x');
assertArrayClose(Array.from(kept.sourceIndices), [0, 1, 2, 3], 'keep source indices');

const limited = parser.decodeGaussianPly(fixture, { limit: 2 });
assert(limited.count === 2, 'limit decoded count');
assertArrayClose(Array.from(limited.sourceIndices), [0, 2], 'limit source indices');

const shFixture = createTinyGaussianShPly();
const shHeader = parser.parseGaussianPlyHeader(shFixture);
assert(shHeader.shDegree === 1, 'SH fixture degree');
assert(shHeader.shRestCount === 9, 'SH fixture rest count');
const channelMajorSh = parser.decodeGaussianPly(shFixture, {
  includeShRest: true,
  shRestIndices: [0, 3, 6, 1, 4, 7, 2, 5, 8]
});
assertArrayClose(
  Array.from(channelMajorSh.shRest),
  [10, 13, 16, 11, 14, 17, 12, 15, 18],
  'SH rest explicit index order'
);

let threw = false;
try {
  parser.decodeGaussianPly(fixture, { invalidPolicy: 'error' });
} catch (error) {
  threw = /invalid positions/u.test(String(error instanceof Error ? error.message : error));
}
assert(threw, 'error policy throws on invalid positions');

let threwShRestIndex = false;
try {
  parser.decodeGaussianPly(shFixture, { includeShRest: true, shRestIndices: [9] });
} catch (error) {
  threwShRestIndex = /Invalid Gaussian PLY SH rest index/u.test(String(error instanceof Error ? error.message : error));
}
assert(threwShRestIndex, 'invalid SH rest index throws');

console.log(JSON.stringify({
  fixture: 'public/scenes/fixtures/tiny_gaussian_invalid.ply',
  header: {
    vertexCount: header.vertexCount,
    stride: header.stride,
    shDegree: header.shDegree
  },
  summary: {
    validPositionCount: summary.validPositionCount,
    invalidPositionCount: summary.invalidPositionCount,
    bounds: summary.bounds,
    percentileBounds: summary.percentileBounds
  },
  filtered: {
    count: filtered.count,
    sourceIndices: Array.from(filtered.sourceIndices),
    invalidSourceIndices: Array.from(filtered.invalidSourceIndices)
  },
  shRest: {
    shDegree: shHeader.shDegree,
    shRestCount: shHeader.shRestCount,
    selected: Array.from(channelMajorSh.shRest)
  }
}, null, 2));
