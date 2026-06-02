import { createReadStream, createWriteStream } from 'node:fs';
import { access, mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';

const sourcePath = resolve(process.argv[2] ?? 'public/scenes/demo_room_001/gaussian/scene.ply');
const outputPath = resolve(process.argv[3] ?? 'public/scenes/demo_room_001/gaussian/scene-preview-100k.ply');
const reportPath = resolve(process.argv[4] ?? 'public/scenes/demo_room_001/meta/ply_preview_report.json');
const targetCount = Number(process.argv[5] ?? 100000);
const fallbackSourcePath = resolve('3D-model/东莞非遗.ply');

const PLY_TYPE_SIZES = {
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

async function readHeader(path) {
  const stream = createReadStream(path, {
    start: 0,
    end: 1024 * 1024 - 1
  });
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }

  const bytes = Buffer.concat(chunks);
  const marker = Buffer.from('end_header', 'ascii');
  const markerIndex = bytes.indexOf(marker);
  if (markerIndex < 0) {
    throw new Error('PLY header does not contain end_header.');
  }

  let headerBytes = -1;
  for (let index = markerIndex; index < bytes.length; index += 1) {
    if (bytes[index] === 0x0a) {
      headerBytes = index + 1;
      break;
    }
  }
  if (headerBytes < 0) {
    throw new Error('PLY header is missing a trailing newline.');
  }

  const text = bytes.subarray(0, headerBytes).toString('ascii');
  const lines = text.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  if (lines[0] !== 'ply') {
    throw new Error('Not a PLY file.');
  }
  if (!lines.includes('format binary_little_endian 1.0')) {
    throw new Error('Only binary_little_endian PLY 1.0 is supported.');
  }

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
      if (parts[1] === 'list') {
        throw new Error('List properties inside vertex elements are not supported.');
      }
      const type = parts[1];
      const name = parts.at(-1);
      const size = PLY_TYPE_SIZES[type];
      if (!name || !size) {
        throw new Error(`Unsupported PLY property line: ${line}`);
      }
      properties.push({
        name,
        type,
        size,
        offset: 0
      });
    }
  }

  let stride = 0;
  const propertyByName = {};
  for (const property of properties) {
    property.offset = stride;
    propertyByName[property.name] = property;
    stride += property.size;
  }
  if (!vertexCount || !stride) {
    throw new Error('PLY header is missing vertex count or vertex stride.');
  }
  for (const name of ['x', 'y', 'z']) {
    if (!propertyByName[name]) {
      throw new Error(`Missing Gaussian PLY property: ${name}`);
    }
  }

  return {
    text,
    headerBytes,
    vertexCount,
    properties,
    propertyByName,
    stride
  };
}

function readScalar(view, offset, type) {
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

function hasFinitePosition(record, header) {
  const view = new DataView(record.buffer, record.byteOffset, record.byteLength);
  return ['x', 'y', 'z'].every((name) => {
    const property = header.propertyByName[name];
    return Number.isFinite(readScalar(view, property.offset, property.type));
  });
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function sampleRecords(header, inputPath) {
  const records = [];
  let sourceIndex = 0;
  let selected = 0;
  let invalidSkipped = 0;
  let carried = Buffer.alloc(0);

  const stream = createReadStream(inputPath, {
    start: header.headerBytes,
    highWaterMark: header.stride * 8192
  });

  for await (const chunk of stream) {
    const data = carried.length ? Buffer.concat([carried, chunk]) : chunk;
    const usableBytes = data.length - (data.length % header.stride);

    for (let offset = 0; offset < usableBytes; offset += header.stride) {
      if (sourceIndex >= header.vertexCount || selected >= targetCount) break;
      const previousBucket = Math.floor((sourceIndex * targetCount) / header.vertexCount);
      const currentBucket = Math.floor(((sourceIndex + 1) * targetCount) / header.vertexCount);
      if (currentBucket > previousBucket) {
        const record = data.subarray(offset, offset + header.stride);
        if (hasFinitePosition(record, header)) {
          records.push(Buffer.from(record));
          selected += 1;
        } else {
          invalidSkipped += 1;
        }
      }
      sourceIndex += 1;
    }

    if (sourceIndex >= header.vertexCount || selected >= targetCount) {
      break;
    }
    carried = data.subarray(usableBytes);
  }

  return {
    records,
    selected,
    invalidSkipped,
    sourceVisited: sourceIndex
  };
}

async function writePreview(header, records) {
  await mkdir(dirname(outputPath), { recursive: true });
  const outputHeader = header.text.replace(/element vertex \d+/u, `element vertex ${records.length}`);
  const out = createWriteStream(outputPath);
  out.write(Buffer.from(outputHeader, 'ascii'));
  for (const record of records) {
    out.write(record);
  }
  await new Promise((resolveWrite, rejectWrite) => {
    out.end((error) => {
      if (error) rejectWrite(error);
      else resolveWrite();
    });
  });
}

let resolvedSourcePath = sourcePath;
let header;
try {
  header = await readHeader(resolvedSourcePath);
} catch (error) {
  if (resolvedSourcePath !== fallbackSourcePath && await fileExists(fallbackSourcePath)) {
    header = await readHeader(fallbackSourcePath);
    console.warn(`Using fallback PLY source because requested source was not readable as PLY: ${relative(process.cwd(), resolvedSourcePath)}`);
    resolvedSourcePath = fallbackSourcePath;
  } else {
    throw error;
  }
}
const sourceStats = await stat(resolvedSourcePath);
const startedAt = performance.now();
const sample = await sampleRecords(header, resolvedSourcePath);
await writePreview(header, sample.records);
const outputStats = await stat(outputPath);

const report = {
  generated_at: new Date().toISOString(),
  requested_source_ply: relative(process.cwd(), sourcePath).replaceAll('\\', '/'),
  source_ply: relative(process.cwd(), resolvedSourcePath).replaceAll('\\', '/'),
  output_ply: relative(process.cwd(), outputPath).replaceAll('\\', '/'),
  source_file_size_bytes: sourceStats.size,
  output_file_size_bytes: outputStats.size,
  target_count: targetCount,
  selected_count: sample.selected,
  invalid_skipped: sample.invalidSkipped,
  source_vertex_count: header.vertexCount,
  source_visited_count: sample.sourceVisited,
  stride: header.stride,
  property_count: header.properties.length,
  header_bytes: header.headerBytes,
  duration_seconds: Number(((performance.now() - startedAt) / 1000).toFixed(3))
};

await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({
  output: report.output_ply,
  report: relative(process.cwd(), reportPath).replaceAll('\\', '/'),
  selected_count: report.selected_count,
  output_file_size_bytes: report.output_file_size_bytes,
  duration_seconds: report.duration_seconds
}, null, 2));
