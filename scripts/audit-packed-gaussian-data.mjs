import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { build } from 'esbuild';

const inputPath = resolve(process.argv[2] ?? 'public/scenes/demo_room_001/gaussian/scene-preview-100k.ply');
const outputPath = resolve(process.argv[3] ?? 'public/scenes/demo_room_001/meta/packed_gaussian_data_audit_report.json');
const sampleCount = Number(process.argv[4] ?? 512);

async function loadGaussianModule() {
  const result = await build({
    stdin: {
      contents: [
        "export { decodeGaussianPly } from './src/sdk/gaussian/ply.ts';",
        "export { auditArkGaussianPackedCovarianceFromPackedData, buildArkGaussianPackedData } from './src/sdk/gaussian/packedData.ts';"
      ].join('\n'),
      resolveDir: process.cwd(),
      loader: 'ts'
    },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    logLevel: 'silent'
  });
  const code = result.outputFiles[0].text;
  return await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

const gaussian = await loadGaussianModule();
const startedAt = performance.now();
const bytes = await readFile(inputPath);
const data = gaussian.decodeGaussianPly(bytes);
const packed = gaussian.buildArkGaussianPackedData(data, {
  limit: data.count
});
const audit = gaussian.auditArkGaussianPackedCovarianceFromPackedData(data, packed, {
  sampleCount
});
const report = {
  generatedAt: new Date().toISOString(),
  input: inputPath,
  status: audit.status,
  data: {
    sourceCount: data.sourceCount,
    decodedCount: data.count,
    invalidSourceCount: data.invalidSourceIndices.length,
    shDegree: data.shDegree
  },
  packed: {
    dataPacking: packed.dataPacking,
    covarianceStorage: packed.covarianceStorage,
    orderAccess: packed.orderAccess,
    count: packed.count,
    displayScale: packed.displayScale,
    center: packed.center,
    opacityScale: packed.opacityScale,
    estimatedBytes: packed.estimatedBytes,
    estimatedMiB: Number((packed.estimatedBytes / 1024 / 1024).toFixed(3))
  },
  covarianceAudit: audit,
  durationMs: Number((performance.now() - startedAt).toFixed(3))
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
