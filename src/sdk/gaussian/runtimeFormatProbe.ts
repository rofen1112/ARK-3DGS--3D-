import type { ArkGaussianAsset, ArkGaussianFormat } from '../types';

export type ArkRuntimeGaussianContainerKind = 'ply-binary' | 'sog-zip-webp' | 'spz-gzip' | 'unknown';

export type ArkRuntimeGaussianZipEntry = {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
};

export type ArkRuntimeGaussianFormatProbe = {
  assetId: string | null;
  format: ArkGaussianFormat;
  url: string;
  declaredSizeBytes: number | null;
  actualSizeBytes: number;
  sizeMatchesManifest: boolean | null;
  splats: number | null;
  bytesPerSplat: number | null;
  compressionRatioToSource: number | null;
  magicHex: string;
  container: ArkRuntimeGaussianContainerKind;
  zipEntries: ArkRuntimeGaussianZipEntry[];
  webpEntryCount: number;
  firstPartyProbeSupported: boolean;
  directFirstPartyDecodeSupported: boolean;
  runtimeTranscodeRequired: boolean;
  blockers: string[];
  warnings: string[];
};

export type ArkRuntimeGaussianFormatProbeOptions = {
  sourceAsset?: ArkGaussianAsset | null;
};

function toBytes(input: ArrayBuffer | ArrayBufferView) {
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
}

function bytesPerSplat(bytes: number, splats: number | null | undefined) {
  if (typeof splats !== 'number' || !Number.isFinite(splats) || splats <= 0) return null;
  return Number((bytes / splats).toFixed(3));
}

function ratio(numerator: number | null | undefined, denominator: number | null | undefined) {
  if (
    typeof numerator !== 'number'
    || typeof denominator !== 'number'
    || !Number.isFinite(numerator)
    || !Number.isFinite(denominator)
    || denominator <= 0
  ) {
    return null;
  }
  return Number((numerator / denominator).toFixed(6));
}

function magicHex(bytes: Uint8Array, count = 12) {
  return Array.from(bytes.subarray(0, Math.min(count, bytes.length)))
    .map((byte) => byte.toString(16).padStart(2, '0').toUpperCase())
    .join(' ');
}

function readAscii(bytes: Uint8Array, offset: number, length: number) {
  return new TextDecoder('utf-8').decode(bytes.subarray(offset, offset + length));
}

function parseZipEntries(bytes: Uint8Array): ArkRuntimeGaussianZipEntry[] {
  const entries: ArkRuntimeGaussianZipEntry[] = [];
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
      name: readAscii(bytes, nameOffset, nameLength),
      compressionMethod,
      compressedSize,
      uncompressedSize
    });

    if (compressedSize <= 0) break;
    offset = dataOffset + compressedSize;
  }

  return entries;
}

function detectContainer(bytes: Uint8Array, format: ArkGaussianFormat): ArkRuntimeGaussianContainerKind {
  const isZip = bytes.length >= 4
    && bytes[0] === 0x50
    && bytes[1] === 0x4B
    && bytes[2] === 0x03
    && bytes[3] === 0x04;
  const isGzip = bytes.length >= 2 && bytes[0] === 0x1F && bytes[1] === 0x8B;
  const isPly = bytes.length >= 3 && bytes[0] === 0x70 && bytes[1] === 0x6C && bytes[2] === 0x79;

  if (format === 'sog' && isZip) return 'sog-zip-webp';
  if (format === 'spz' && isGzip) return 'spz-gzip';
  if (format === 'ply' && isPly) return 'ply-binary';
  return 'unknown';
}

export function probeRuntimeGaussianFormat(
  input: ArrayBuffer | ArrayBufferView,
  asset: ArkGaussianAsset,
  options: ArkRuntimeGaussianFormatProbeOptions = {}
): ArkRuntimeGaussianFormatProbe {
  const bytes = toBytes(input);
  const container = detectContainer(bytes, asset.type);
  const zipEntries = container === 'sog-zip-webp' ? parseZipEntries(bytes) : [];
  const webpEntryCount = zipEntries.filter((entry) => entry.name.toLowerCase().endsWith('.webp')).length;
  const warnings: string[] = [];
  const blockers: string[] = [];
  const firstPartyProbeSupported = container !== 'unknown';
  const directFirstPartyDecodeSupported = asset.type === 'ply';
  const runtimeTranscodeRequired = asset.type === 'sog' || asset.type === 'spz';

  if (!firstPartyProbeSupported) {
    warnings.push(`Runtime container for ${asset.type.toUpperCase()} is not recognized by the first-party probe.`);
  }
  if (asset.type === 'sog' && webpEntryCount === 0) {
    warnings.push('SOG ZIP container does not expose WEBP entries in the local file header scan.');
  }
  if (runtimeTranscodeRequired) {
    blockers.push(`direct-${asset.type}-decode-not-implemented`);
    blockers.push(`${asset.type}-to-ark-gaussian-buffer-transcode-not-implemented`);
  }

  return {
    assetId: asset.id ?? null,
    format: asset.type,
    url: asset.url,
    declaredSizeBytes: asset.sizeBytes ?? asset.dataBytes ?? null,
    actualSizeBytes: bytes.byteLength,
    sizeMatchesManifest: typeof asset.sizeBytes === 'number' ? asset.sizeBytes === bytes.byteLength : null,
    splats: asset.splats ?? null,
    bytesPerSplat: bytesPerSplat(bytes.byteLength, asset.splats),
    compressionRatioToSource: ratio(bytes.byteLength, options.sourceAsset?.dataBytes ?? options.sourceAsset?.sizeBytes ?? null),
    magicHex: magicHex(bytes),
    container,
    zipEntries,
    webpEntryCount,
    firstPartyProbeSupported,
    directFirstPartyDecodeSupported,
    runtimeTranscodeRequired,
    blockers,
    warnings
  };
}
