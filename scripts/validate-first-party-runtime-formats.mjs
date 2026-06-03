import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { inflateRawSync } from 'node:zlib';

const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const manifestPath = resolve(positionalArgs[0] ?? 'public/scenes/demo_room_001/manifest.json');
const outputPath = resolve(positionalArgs[1] ?? 'public/scenes/demo_room_001/meta/runtime_gaussian_format_probe_report.json');
const requirePass = process.argv.includes('--require-pass');

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    return {
      unavailable: true,
      path: relative(process.cwd(), path).replaceAll('\\', '/'),
      error: String(error instanceof Error ? error.message : error)
    };
  }
}

function resolveScenePath(relativeUrl) {
  return resolve(dirname(manifestPath), relativeUrl);
}

function addCheck(checks, id, passed, value, message) {
  checks.push({ id, passed, value, message });
}

function ratio(numerator, denominator, digits = 6) {
  if (typeof numerator !== 'number' || typeof denominator !== 'number' || denominator <= 0) return null;
  return Number((numerator / denominator).toFixed(digits));
}

function bytesPerSplat(bytes, splats) {
  return ratio(bytes, splats, 3);
}

function magicHex(bytes, count = 12) {
  return Array.from(bytes.subarray(0, Math.min(count, bytes.length)))
    .map((byte) => byte.toString(16).padStart(2, '0').toUpperCase())
    .join(' ');
}

function readName(bytes, offset, length) {
  return new TextDecoder('utf-8').decode(bytes.subarray(offset, offset + length));
}

function parseZipEntries(bytes) {
  const entries = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  while (offset + 30 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const compressionMethod = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const uncompressedSize = view.getUint32(offset + 22, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameOffset = offset + 30;
    const dataOffset = nameOffset + nameLength + extraLength;
    if (dataOffset > bytes.length) break;
    entries.push({
      name: readName(bytes, nameOffset, nameLength),
      compressionMethod,
      compressedSize,
      uncompressedSize,
      dataOffset
    });
    if (compressedSize <= 0) break;
    offset = dataOffset + compressedSize;
  }
  return entries;
}

function reportZipEntries(entries) {
  return entries.map((entry) => ({
    name: entry.name,
    compressionMethod: entry.compressionMethod,
    compressedSize: entry.compressedSize,
    uncompressedSize: entry.uncompressedSize
  }));
}

function extractZipEntry(bytes, entry) {
  const compressed = bytes.subarray(entry.dataOffset, entry.dataOffset + entry.compressedSize);
  if (entry.compressionMethod === 0) return compressed;
  if (entry.compressionMethod === 8) return inflateRawSync(compressed);
  throw new Error(`Unsupported ZIP compression method ${entry.compressionMethod} for ${entry.name}.`);
}

function numericArraySummary(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const finiteValues = values.filter((value) => typeof value === 'number' && Number.isFinite(value));
  if (finiteValues.length === 0) return null;
  return {
    length: values.length,
    min: Math.min(...finiteValues),
    max: Math.max(...finiteValues)
  };
}

function summarizeSogMeta(meta) {
  if (!meta || typeof meta !== 'object') return null;
  const channelEntries = [
    ['means', meta.means],
    ['scales', meta.scales],
    ['quats', meta.quats],
    ['sh0', meta.sh0],
    ['shN', meta.shN]
  ];
  return {
    version: meta.version ?? null,
    count: meta.count ?? null,
    means: meta.means ? {
      mins: meta.means.mins ?? null,
      maxs: meta.means.maxs ?? null,
      files: meta.means.files ?? []
    } : null,
    channels: Object.fromEntries(channelEntries.map(([name, channel]) => [
      name,
      channel ? {
        files: channel.files ?? [],
        fileCount: Array.isArray(channel.files) ? channel.files.length : 0,
        codebook: numericArraySummary(channel.codebook),
        count: channel.count ?? null,
        bands: channel.bands ?? null
      } : null
    ])),
    channelFileCount: channelEntries.reduce((total, [, channel]) => (
      total + (Array.isArray(channel?.files) ? channel.files.length : 0)
    ), 0)
  };
}

function detectContainer(bytes, format) {
  const isZip = bytes.length >= 4
    && bytes[0] === 0x50
    && bytes[1] === 0x4B
    && bytes[2] === 0x03
    && bytes[3] === 0x04;
  const isGzip = bytes.length >= 2 && bytes[0] === 0x1F && bytes[1] === 0x8B;
  if (format === 'sog' && isZip) return 'sog-zip-webp';
  if (format === 'spz' && isGzip) return 'spz-gzip';
  return 'unknown';
}

async function probeRuntimeAsset(asset, sourceAsset) {
  const absolutePath = resolveScenePath(asset.url);
  const present = await exists(absolutePath);
  if (!present) {
    return {
      asset_id: asset.id ?? null,
      format: asset.type,
      path: relative(process.cwd(), absolutePath).replaceAll('\\', '/'),
      exists: false,
      warnings: ['Runtime asset file is missing.'],
      blockers: ['runtime-file-missing']
    };
  }

  const bytes = await readFile(absolutePath);
  const stats = await stat(absolutePath);
  const container = detectContainer(bytes, asset.type);
  const zipEntries = container === 'sog-zip-webp' ? parseZipEntries(bytes) : [];
  const webpEntryCount = zipEntries.filter((entry) => entry.name.toLowerCase().endsWith('.webp')).length;
  const metaEntry = zipEntries.find((entry) => entry.name === 'meta.json') ?? null;
  let sogMeta = null;
  let sogMetaError = null;
  if (metaEntry) {
    try {
      const metaBytes = extractZipEntry(bytes, metaEntry);
      sogMeta = summarizeSogMeta(JSON.parse(Buffer.from(metaBytes).toString('utf8')));
    } catch (error) {
      sogMetaError = String(error instanceof Error ? error.message : error);
    }
  }
  const warnings = [];
  const blockers = [];
  const runtimeTranscodeRequired = asset.type === 'sog' || asset.type === 'spz';

  if (container === 'unknown') warnings.push(`${asset.type.toUpperCase()} container signature is not recognized.`);
  if (asset.type === 'sog' && webpEntryCount === 0) warnings.push('SOG container probe did not find WEBP entries.');
  if (asset.type === 'sog' && !sogMeta) warnings.push('SOG meta.json could not be extracted or summarized.');
  if (runtimeTranscodeRequired) {
    blockers.push(`direct-${asset.type}-decode-not-implemented`);
    blockers.push(`${asset.type}-to-ark-gaussian-buffer-transcode-not-implemented`);
  }

  return {
    asset_id: asset.id ?? null,
    role: asset.role ?? null,
    label: asset.label ?? null,
    format: asset.type,
    url: asset.url,
    path: relative(process.cwd(), absolutePath).replaceAll('\\', '/'),
    exists: true,
    declared_size_bytes: asset.sizeBytes ?? asset.dataBytes ?? null,
    actual_size_bytes: stats.size,
    size_matches_manifest: typeof asset.sizeBytes === 'number' ? asset.sizeBytes === stats.size : null,
    splats: asset.splats ?? null,
    bytes_per_splat: bytesPerSplat(stats.size, asset.splats),
    compression_ratio_to_source: ratio(stats.size, sourceAsset?.dataBytes ?? sourceAsset?.sizeBytes ?? null),
    magic_hex: magicHex(bytes),
    container,
    zip_entries: reportZipEntries(zipEntries),
    zip_entry_count: zipEntries.length,
    webp_entry_count: webpEntryCount,
    sog_meta: sogMeta,
    sog_meta_error: sogMetaError,
    sog_meta_ready: Boolean(sogMeta),
    first_party_probe_supported: container !== 'unknown',
    direct_first_party_decode_supported: false,
    runtime_transcode_required: runtimeTranscodeRequired,
    blockers,
    warnings
  };
}

const manifest = await readJson(manifestPath);
const assets = manifest.gaussians?.items ?? [];
const runtimeAssets = assets.filter((asset) => asset.role === 'runtime' && ['sog', 'spz'].includes(asset.type));
const sourceAsset = assets.find((asset) => asset.role === 'source' && asset.type === 'ply') ?? null;
const defaultId = manifest.gaussians?.default ?? null;
const defaultAsset = assets.find((asset) => asset.id === defaultId) ?? manifest.gaussian ?? null;
const probes = [];
for (const asset of runtimeAssets) {
  probes.push(await probeRuntimeAsset(asset, sourceAsset));
}

const checks = [];
const sogProbe = probes.find((probe) => probe.format === 'sog');
const spzProbe = probes.find((probe) => probe.format === 'spz');
const defaultProbe = probes.find((probe) => probe.asset_id === defaultAsset?.id) ?? null;
addCheck(checks, 'manifest_loaded', !manifest.unavailable, relative(process.cwd(), manifestPath).replaceAll('\\', '/'), 'Scene manifest is readable.');
addCheck(checks, 'runtime_assets_declared', runtimeAssets.length >= 2, runtimeAssets.map((asset) => `${asset.id}:${asset.type}`), 'Manifest declares runtime SOG/SPZ assets.');
addCheck(checks, 'runtime_files_present', probes.every((probe) => probe.exists), probes.filter((probe) => !probe.exists), 'Runtime SOG/SPZ files are present locally.');
addCheck(checks, 'runtime_sizes_match_manifest', probes.every((probe) => probe.size_matches_manifest === true), probes.map((probe) => ({
  asset_id: probe.asset_id,
  declared_size_bytes: probe.declared_size_bytes,
  actual_size_bytes: probe.actual_size_bytes
})), 'Runtime file sizes match manifest declarations.');
addCheck(checks, 'sog_container_identified', sogProbe?.container === 'sog-zip-webp', sogProbe ? {
  magic_hex: sogProbe.magic_hex,
  zip_entry_count: sogProbe.zip_entry_count,
  webp_entry_count: sogProbe.webp_entry_count
} : null, 'SOG runtime is recognized as a ZIP/WEBP-style container.');
addCheck(checks, 'sog_meta_extracted', sogProbe?.sog_meta_ready === true, sogProbe ? {
  version: sogProbe.sog_meta?.version ?? null,
  count: sogProbe.sog_meta?.count ?? null,
  channel_file_count: sogProbe.sog_meta?.channelFileCount ?? null,
  error: sogProbe.sog_meta_error ?? null
} : null, 'SOG meta.json is extracted and summarized.');
addCheck(checks, 'sog_meta_count_matches_manifest', sogProbe?.sog_meta?.count === sogProbe?.splats, sogProbe ? {
  meta_count: sogProbe.sog_meta?.count ?? null,
  manifest_splats: sogProbe.splats ?? null
} : null, 'SOG meta count matches manifest splat count.');
addCheck(checks, 'sog_channel_files_present', Array.isArray(sogProbe?.sog_meta?.channels?.means?.files)
  && sogProbe.sog_meta.channels.means.files.length === 2
  && sogProbe.sog_meta.channels.scales?.files?.length === 1
  && sogProbe.sog_meta.channels.quats?.files?.length === 1
  && sogProbe.sog_meta.channels.sh0?.files?.length === 1
  && sogProbe.sog_meta.channels.shN?.files?.length === 2, sogProbe?.sog_meta?.channels ?? null, 'SOG meta declares the expected means/scales/quats/sh0/shN channel files.');
addCheck(checks, 'spz_container_identified', spzProbe?.container === 'spz-gzip', spzProbe ? {
  magic_hex: spzProbe.magic_hex
} : null, 'SPZ runtime is recognized as a GZIP-compressed container.');
addCheck(checks, 'direct_decode_not_falsely_claimed', probes.every((probe) => probe.direct_first_party_decode_supported === false), probes.map((probe) => ({
  asset_id: probe.asset_id,
  direct_first_party_decode_supported: probe.direct_first_party_decode_supported
})), 'Runtime SOG/SPZ direct first-party decoding is not falsely claimed.');
addCheck(checks, 'runtime_transcode_blockers_recorded', probes.every((probe) => probe.runtime_transcode_required === true && probe.blockers.length >= 2), probes.map((probe) => ({
  asset_id: probe.asset_id,
  blockers: probe.blockers
})), 'Runtime SOG/SPZ transcode/decode blockers are explicitly recorded.');

const passed = checks.every((check) => check.passed);
const report = {
  generated_at: new Date().toISOString(),
  target: 'ARK first-party runtime Gaussian format probe',
  manifest: relative(process.cwd(), manifestPath).replaceAll('\\', '/'),
  require_pass: requirePass,
  summary: {
    passed,
    probe_ready: passed,
    runtime_probe_count: probes.length,
    default_asset: defaultAsset?.id ?? null,
    default_type: defaultAsset?.type ?? null,
    default_probe_ready: defaultProbe?.first_party_probe_supported === true,
    sog_meta_ready: sogProbe?.sog_meta_ready === true,
    sog_channel_file_count: sogProbe?.sog_meta?.channelFileCount ?? null,
    direct_decode_supported_count: probes.filter((probe) => probe.direct_first_party_decode_supported).length,
    transcode_required_count: probes.filter((probe) => probe.runtime_transcode_required).length,
    failed_checks: checks.filter((check) => !check.passed).length,
    note: 'Runtime format probing does not imply direct first-party renderer support.'
  },
  checks,
  probes,
  blockers: probes.flatMap((probe) => probe.blockers.map((blocker) => ({
    asset_id: probe.asset_id,
    blocker
  })))
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({
  output: relative(process.cwd(), outputPath).replaceAll('\\', '/'),
  summary: report.summary,
  probes: probes.map((probe) => ({
    asset_id: probe.asset_id,
    format: probe.format,
    container: probe.container,
    bytes_per_splat: probe.bytes_per_splat,
    webp_entry_count: probe.webp_entry_count,
    sog_meta_ready: probe.sog_meta_ready ?? false,
    direct_decode_supported: probe.direct_first_party_decode_supported
  }))
}, null, 2));

if (!passed || (requirePass && !passed)) {
  process.exitCode = 1;
}
