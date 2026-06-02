import { readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';

const manifestPath = resolve(process.argv[2] ?? 'public/scenes/demo_room_001/manifest.json');
const outputPath = resolve(process.argv[3] ?? 'public/scenes/demo_room_001/physics/colliders.generated.json');
const fallbackPlyPath = resolve('3D-model/东莞非遗.ply');

const config = {
  cellSize: Number(process.env.CELL_SIZE ?? 0.25),
  maxComponents: Number(process.env.MAX_COMPONENTS ?? 12),
  minComponentCells: Number(process.env.MIN_COMPONENT_CELLS ?? 3),
  minComponentPoints: Number(process.env.MIN_COMPONENT_POINTS ?? 800),
  padding: Number(process.env.COLLIDER_PADDING ?? 0.08)
};

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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function resolveSceneUrl(manifestFile, relativeUrl) {
  return resolve(dirname(manifestFile), relativeUrl);
}

function parseHeader(buffer) {
  const marker = Buffer.from('end_header');
  const markerIndex = buffer.indexOf(marker);
  assert(markerIndex >= 0, 'PLY header does not contain end_header');

  const headerEnd = buffer.indexOf(0x0a, markerIndex) + 1;
  assert(headerEnd > 0, 'Could not locate PLY header newline');

  const header = buffer.subarray(0, headerEnd).toString('ascii');
  const lines = header.split(/\r?\n/);
  assert(lines[0] === 'ply', 'Not a PLY file');
  assert(lines.includes('format binary_little_endian 1.0'), 'Only binary_little_endian PLY is supported');

  let vertexCount = 0;
  let inVertex = false;
  const properties = [];

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts[0] === 'element') {
      inVertex = parts[1] === 'vertex';
      if (inVertex) vertexCount = Number(parts[2]);
      continue;
    }
    if (inVertex && parts[0] === 'property') {
      const type = parts[1];
      const name = parts.at(-1);
      assert(typeSizes[type], `Unsupported PLY property type: ${type}`);
      properties.push({ type, name, size: typeSizes[type] });
    }
  }

  let offset = 0;
  for (const property of properties) {
    property.offset = offset;
    offset += property.size;
  }

  const propertyByName = Object.fromEntries(properties.map((property) => [property.name, property]));
  for (const required of ['x', 'y', 'z']) {
    assert(propertyByName[required], `Missing PLY property: ${required}`);
    assert(propertyByName[required].type === 'float' || propertyByName[required].type === 'float32', `${required} must be float32`);
  }

  return {
    headerEnd,
    vertexCount,
    properties,
    propertyByName,
    stride: offset
  };
}

function readFloat(buffer, byteOffset) {
  return buffer.readFloatLE(byteOffset);
}

function applyQuat([x, y, z], [qx, qy, qz, qw]) {
  const tx = 2 * (qy * z - qz * y);
  const ty = 2 * (qz * x - qx * z);
  const tz = 2 * (qx * y - qy * x);
  return [
    x + qw * tx + (qy * tz - qz * ty),
    y + qw * ty + (qz * tx - qx * tz),
    z + qw * tz + (qx * ty - qy * tx)
  ];
}

function transformPoint(point, gaussian) {
  const scale = gaussian.scale ?? [1, 1, 1];
  const rotation = gaussian.rotation ?? [0, 0, 0, 1];
  const position = gaussian.position ?? [0, 0, 0];
  const scaled = [point[0] * scale[0], point[1] * scale[1], point[2] * scale[2]];
  const rotated = applyQuat(scaled, rotation);
  return [rotated[0] + position[0], rotated[1] + position[1], rotated[2] + position[2]];
}

function selectSourcePlyAsset(manifest) {
  const assets = manifest.gaussians?.items ?? [];
  const sourcePly = assets.find((asset) => asset.id === 'source-ply')
    ?? assets.find((asset) => asset.role === 'source' && asset.type === 'ply')
    ?? assets.find((asset) => asset.type === 'ply' && asset.role !== 'preview');
  if (sourcePly?.url) return sourcePly;
  if (manifest.gaussian?.type === 'ply' && manifest.gaussian.url) return manifest.gaussian;
  throw new Error('manifest must define a source PLY Gaussian asset.');
}

function percentile(sorted, p) {
  return sorted[Math.floor((sorted.length - 1) * p)];
}

function percentileBounds(xs, ys, zs, low, high) {
  const sortedX = Float32Array.from(xs).sort();
  const sortedY = Float32Array.from(ys).sort();
  const sortedZ = Float32Array.from(zs).sort();
  return {
    min: [percentile(sortedX, low), percentile(sortedY, low), percentile(sortedZ, low)],
    max: [percentile(sortedX, high), percentile(sortedY, high), percentile(sortedZ, high)]
  };
}

function boxFromBounds(id, kind, min, max, color, padding = 0) {
  const size = [
    Math.max(0.05, max[0] - min[0] + padding * 2),
    Math.max(0.05, max[1] - min[1] + padding * 2),
    Math.max(0.05, max[2] - min[2] + padding * 2)
  ];
  const position = [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2
  ];
  return {
    id,
    kind,
    position: position.map((value) => Number(value.toFixed(4))),
    size: size.map((value) => Number(value.toFixed(4))),
    color
  };
}

function buildOccupancyComponents(xs, ys, zs, bounds) {
  const cellMap = new Map();
  const [minX, minY, minZ] = bounds.min;
  const [maxX, maxY, maxZ] = bounds.max;

  for (let i = 0; i < xs.length; i += 1) {
    const x = xs[i];
    const y = ys[i];
    const z = zs[i];
    if (x < minX || x > maxX || y < minY || y > maxY || z < minZ || z > maxZ) continue;
    const ix = Math.floor((x - minX) / config.cellSize);
    const iz = Math.floor((z - minZ) / config.cellSize);
    const key = `${ix},${iz}`;
    const cell = cellMap.get(key) ?? {
      ix,
      iz,
      count: 0,
      min: [Infinity, Infinity, Infinity],
      max: [-Infinity, -Infinity, -Infinity]
    };
    cell.count += 1;
    cell.min[0] = Math.min(cell.min[0], x);
    cell.min[1] = Math.min(cell.min[1], y);
    cell.min[2] = Math.min(cell.min[2], z);
    cell.max[0] = Math.max(cell.max[0], x);
    cell.max[1] = Math.max(cell.max[1], y);
    cell.max[2] = Math.max(cell.max[2], z);
    cellMap.set(key, cell);
  }

  const counts = Array.from(cellMap.values()).map((cell) => cell.count).sort((a, b) => a - b);
  const threshold = Math.max(100, counts[Math.floor(counts.length * 0.35)] ?? 100);
  const denseCells = new Map(Array.from(cellMap.entries()).filter(([, cell]) => cell.count >= threshold));
  const visited = new Set();
  const components = [];

  for (const [startKey, startCell] of denseCells) {
    if (visited.has(startKey)) continue;
    const queue = [startCell];
    visited.add(startKey);
    const component = {
      count: 0,
      cells: 0,
      min: [Infinity, Infinity, Infinity],
      max: [-Infinity, -Infinity, -Infinity]
    };

    while (queue.length) {
      const cell = queue.shift();
      component.count += cell.count;
      component.cells += 1;
      for (let axis = 0; axis < 3; axis += 1) {
        component.min[axis] = Math.min(component.min[axis], cell.min[axis]);
        component.max[axis] = Math.max(component.max[axis], cell.max[axis]);
      }

      for (const [nx, nz] of [
        [cell.ix - 1, cell.iz],
        [cell.ix + 1, cell.iz],
        [cell.ix, cell.iz - 1],
        [cell.ix, cell.iz + 1]
      ]) {
        const key = `${nx},${nz}`;
        if (!denseCells.has(key) || visited.has(key)) continue;
        visited.add(key);
        queue.push(denseCells.get(key));
      }
    }

    if (component.cells >= config.minComponentCells && component.count >= config.minComponentPoints) {
      components.push(component);
    }
  }

  components.sort((a, b) => b.count - a.count);
  return { threshold, cellCount: cellMap.size, denseCellCount: denseCells.size, components };
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const sourcePlyAsset = selectSourcePlyAsset(manifest);
const requestedPlyPath = resolveSceneUrl(manifestPath, sourcePlyAsset.url);
let plyPath = requestedPlyPath;
let plyBuffer = await readFile(plyPath);
let headerInfo;
try {
  headerInfo = parseHeader(plyBuffer);
} catch (error) {
  if (plyPath !== fallbackPlyPath) {
    try {
      const fallbackBuffer = await readFile(fallbackPlyPath);
      headerInfo = parseHeader(fallbackBuffer);
      plyBuffer = fallbackBuffer;
      console.warn(`Using fallback PLY source because requested source was not readable as PLY: ${relative(process.cwd(), plyPath)}`);
      plyPath = fallbackPlyPath;
    } catch {
      throw error;
    }
  } else {
    throw error;
  }
}
const { headerEnd, vertexCount, propertyByName, stride } = headerInfo;

const xs = new Float32Array(vertexCount);
const ys = new Float32Array(vertexCount);
const zs = new Float32Array(vertexCount);
let valid = 0;

for (let i = 0; i < vertexCount; i += 1) {
  const base = headerEnd + i * stride;
  const raw = [
    readFloat(plyBuffer, base + propertyByName.x.offset),
    readFloat(plyBuffer, base + propertyByName.y.offset),
    readFloat(plyBuffer, base + propertyByName.z.offset)
  ];
  if (!Number.isFinite(raw[0]) || !Number.isFinite(raw[1]) || !Number.isFinite(raw[2])) continue;
  const point = transformPoint(raw, sourcePlyAsset);
  xs[valid] = point[0];
  ys[valid] = point[1];
  zs[valid] = point[2];
  valid += 1;
}

const validXs = xs.subarray(0, valid);
const validYs = ys.subarray(0, valid);
const validZs = zs.subarray(0, valid);
const broadBounds = percentileBounds(validXs, validYs, validZs, 0.01, 0.99);
const solidBounds = percentileBounds(validXs, validYs, validZs, 0.05, 0.95);
const floorY = broadBounds.min[1];

const colliders = [
  boxFromBounds(
    'scan-floor-proxy',
    'floor',
    [broadBounds.min[0], floorY - 0.05, broadBounds.min[2]],
    [broadBounds.max[0], floorY + 0.02, broadBounds.max[2]],
    '#5b6470',
    0.2
  ),
  boxFromBounds('scan-main-body', 'furniture', solidBounds.min, solidBounds.max, '#4d8a72', config.padding)
];

const occupancy = buildOccupancyComponents(validXs, validYs, validZs, broadBounds);
for (const [index, component] of occupancy.components.slice(0, config.maxComponents).entries()) {
  colliders.push(boxFromBounds(`scan-cluster-${String(index + 1).padStart(2, '0')}`, 'furniture', component.min, component.max, '#2f7ca0', 0.04));
}

const output = {
  generated_at: new Date().toISOString(),
  source_manifest: relative(process.cwd(), manifestPath).replaceAll('\\', '/'),
  source_asset_id: sourcePlyAsset.id ?? null,
  requested_source_ply: relative(process.cwd(), requestedPlyPath).replaceAll('\\', '/'),
  source_ply: relative(process.cwd(), plyPath).replaceAll('\\', '/'),
  vertex_count: vertexCount,
  valid_vertex_count: valid,
  config,
  bounds: {
    broad_01_99: broadBounds,
    solid_05_95: solidBounds
  },
  occupancy: {
    threshold: occupancy.threshold,
    cell_count: occupancy.cellCount,
    dense_cell_count: occupancy.denseCellCount,
    component_count: occupancy.components.length
  },
  colliders
};

await writeFile(outputPath, JSON.stringify(colliders, null, 2));
await writeFile(outputPath.replace(/\.json$/u, '.report.json'), JSON.stringify(output, null, 2));

console.log(JSON.stringify({
  output: outputPath,
  report: outputPath.replace(/\.json$/u, '.report.json'),
  colliders: colliders.length,
  occupancy: output.occupancy,
  solidBounds
}, null, 2));
