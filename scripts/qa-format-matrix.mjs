import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';

const formats = (process.argv[2] ?? 'sog,spz,ply')
  .split(',')
  .map((format) => format.trim().toLowerCase())
  .filter(Boolean);
const outputPath = resolve(process.argv[3] ?? 'public/scenes/demo_room_001/meta/format_matrix_report.json');
const screenshotDir = resolve(process.argv[4] ?? 'artifacts/format-matrix');
const timeoutMs = Number(process.argv[5] ?? 240000);
const baseUrl = 'http://127.0.0.1:5173/?autoload=1';

const supportedFormats = new Set(['sog', 'spz', 'ply']);
for (const format of formats) {
  if (!supportedFormats.has(format)) {
    throw new Error(`Unsupported matrix format: ${format}`);
  }
}

async function ensureDevServer() {
  try {
    const response = await fetch(baseUrl);
    if (response.ok) return;
    throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    throw new Error(`ARK dev server is not reachable at ${baseUrl}. Start it with npm.cmd run dev -- --port 5173. ${error instanceof Error ? error.message : String(error)}`);
  }
}

function runVisualQa(format) {
  const url = `${baseUrl}&asset=${format}`;
  const screenshotPath = resolve(screenshotDir, `scene-${format}.png`);
  const args = [
    'scripts/cdp-screenshot.mjs',
    url,
    screenshotPath,
    String(timeoutMs)
  ];

  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('close', (exitCode) => {
      let result = null;
      let parseError = null;
      try {
        result = JSON.parse(stdout);
      } catch (error) {
        parseError = error instanceof Error ? error.message : String(error);
      }
      resolveRun({
        format,
        url,
        screenshot: relative(process.cwd(), screenshotPath).replaceAll('\\', '/'),
        passed: exitCode === 0 && result?.pageState?.visualQualityGate?.status === 'passed',
        exitCode,
        pageState: result?.pageState ?? null,
        parseError,
        stdout: parseError ? stdout.slice(-4000) : undefined,
        stderr: stderr.slice(-4000)
      });
    });
  });
}

function summarizeRow(row) {
  const gate = row.pageState?.visualQualityGate;
  const info = row.pageState?.activeInfo;
  return {
    format: row.format,
    passed: row.passed,
    runtime: row.pageState?.runtime ?? null,
    viewer_format: info?.format ?? null,
    splats: info?.splats ?? null,
    sh_degree: info?.shDegree ?? null,
    fit_bounds: row.pageState?.fitBounds ?? null,
    visual_quality: row.pageState?.visualQuality ?? null,
    contrast: gate?.sample?.contrast ?? null,
    evaluated_at_ms: gate?.evaluatedAtMs ?? null,
    screenshot: row.screenshot,
    failure_reason: row.passed ? null : gate?.reason ?? row.parseError ?? row.stderr ?? 'unknown failure'
  };
}

await ensureDevServer();
await mkdir(screenshotDir, { recursive: true });

const startedAt = performance.now();
const results = [];
for (const format of formats) {
  results.push(await runVisualQa(format));
}

const rows = results.map(summarizeRow);
const report = {
  generated_at: new Date().toISOString(),
  target: 'ARK-3DGS bundled format visual QA matrix',
  base_url: baseUrl,
  timeout_ms: timeoutMs,
  summary: {
    total: rows.length,
    passed: rows.filter((row) => row.passed).length,
    failed: rows.filter((row) => !row.passed).length,
    all_passed: rows.every((row) => row.passed),
    duration_seconds: Number(((performance.now() - startedAt) / 1000).toFixed(3))
  },
  rows,
  raw_results: results
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({
  output: relative(process.cwd(), outputPath).replaceAll('\\', '/'),
  summary: report.summary,
  rows
}, null, 2));

if (!report.summary.all_passed) {
  process.exitCode = 1;
}
