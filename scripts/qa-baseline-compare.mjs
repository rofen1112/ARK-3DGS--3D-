import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';

const formats = (process.argv[2] ?? 'sog,spz,ply')
  .split(',')
  .map((format) => format.trim().toLowerCase())
  .filter(Boolean);
const outputPath = resolve(process.argv[3] ?? 'public/scenes/demo_room_001/meta/baseline_comparison_report.json');
const screenshotDir = resolve(process.argv[4] ?? 'artifacts/baseline-compare');
const timeoutMs = Number(process.argv[5] ?? 240000);
const arkBaseUrl = 'http://127.0.0.1:5173/?autoload=1';
const baselineBaseUrl = 'http://127.0.0.1:5173/baseline.html';

const supportedFormats = new Set(['sog', 'spz', 'ply']);
for (const format of formats) {
  if (!supportedFormats.has(format)) {
    throw new Error(`Unsupported comparison format: ${format}`);
  }
}

async function ensureDevServer() {
  try {
    const response = await fetch(arkBaseUrl);
    if (response.ok) return;
    throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    throw new Error(`ARK dev server is not reachable at ${arkBaseUrl}. Start it with npm run dev -- --port 5173. ${error instanceof Error ? error.message : String(error)}`);
  }
}

function runVisualQa(label, url, screenshotPath) {
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
        label,
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

function maxAbsBoundsDelta(leftInfo, rightInfo) {
  if (!leftInfo || !rightInfo) return null;
  const left = [...(leftInfo.denseMin ?? []), ...(leftInfo.denseMax ?? [])];
  const right = [...(rightInfo.denseMin ?? []), ...(rightInfo.denseMax ?? [])];
  if (left.length !== 6 || right.length !== 6) return null;
  return Math.max(...left.map((value, index) => Math.abs(value - right[index])));
}

function summarizeSide(result) {
  const gate = result.pageState?.visualQualityGate;
  const info = result.pageState?.activeInfo;
  return {
    passed: result.passed,
    runtime: result.pageState?.runtime ?? null,
    viewer_format: info?.format ?? null,
    splats: info?.splats ?? null,
    sh_degree: info?.shDegree ?? null,
    fit_bounds: result.pageState?.fitBounds ?? null,
    fit_bounds_id: info?.fitBoundsId ?? null,
    fit_bounds_source: info?.fitBoundsSource ?? null,
    dense_min: info?.denseMin ?? null,
    dense_max: info?.denseMax ?? null,
    display_scale: info?.displayScale ?? null,
    visual_quality: result.pageState?.visualQuality ?? null,
    contrast: gate?.sample?.contrast ?? null,
    evaluated_at_ms: gate?.evaluatedAtMs ?? null,
    screenshot: result.screenshot,
    failure_reason: result.passed ? null : gate?.reason ?? result.parseError ?? result.stderr ?? 'unknown failure'
  };
}

function summarizeComparison(format, ark, baseline) {
  const arkSide = summarizeSide(ark);
  const baselineSide = summarizeSide(baseline);
  const splatDelta = typeof arkSide.splats === 'number' && typeof baselineSide.splats === 'number'
    ? arkSide.splats - baselineSide.splats
    : null;
  const contrastDelta = typeof arkSide.contrast === 'number' && typeof baselineSide.contrast === 'number'
    ? arkSide.contrast - baselineSide.contrast
    : null;
  const boundsDelta = maxAbsBoundsDelta(ark.pageState?.activeInfo, baseline.pageState?.activeInfo);
  const passed = arkSide.passed
    && baselineSide.passed
    && splatDelta === 0
    && arkSide.viewer_format === baselineSide.viewer_format;

  return {
    format,
    passed,
    ark: arkSide,
    baseline: baselineSide,
    deltas: {
      splats: splatDelta,
      contrast: contrastDelta,
      max_abs_bounds: boundsDelta
    },
    interpretation: passed
      ? 'Both ARK and Aholo direct baseline loaded the same format and splat count. Bounds may differ because ARK uses sidecar fit bounds and baseline uses renderer-computed bounds.'
      : 'ARK and baseline are not equivalent for this format; inspect failure_reason and raw results.'
  };
}

await ensureDevServer();
await mkdir(screenshotDir, { recursive: true });

const startedAt = performance.now();
const comparisons = [];
const rawResults = [];

for (const format of formats) {
  const ark = await runVisualQa(
    `ark-${format}`,
    `${arkBaseUrl}&asset=${format}`,
    resolve(screenshotDir, `ark-${format}.png`)
  );
  const baseline = await runVisualQa(
    `baseline-${format}`,
    `${baselineBaseUrl}?asset=${format}`,
    resolve(screenshotDir, `baseline-${format}.png`)
  );
  comparisons.push(summarizeComparison(format, ark, baseline));
  rawResults.push({ format, ark, baseline });
}

const report = {
  generated_at: new Date().toISOString(),
  target: 'ARK-3DGS vs Aholo direct baseline comparison',
  ark_base_url: arkBaseUrl,
  baseline_base_url: baselineBaseUrl,
  timeout_ms: timeoutMs,
  summary: {
    total: comparisons.length,
    passed: comparisons.filter((row) => row.passed).length,
    failed: comparisons.filter((row) => !row.passed).length,
    all_passed: comparisons.every((row) => row.passed),
    duration_seconds: Number(((performance.now() - startedAt) / 1000).toFixed(3))
  },
  comparisons,
  raw_results: rawResults
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({
  output: relative(process.cwd(), outputPath).replaceAll('\\', '/'),
  summary: report.summary,
  comparisons: comparisons.map((row) => ({
    format: row.format,
    passed: row.passed,
    ark: {
      fit_bounds: row.ark.fit_bounds,
      visual_quality: row.ark.visual_quality,
      contrast: row.ark.contrast
    },
    baseline: {
      fit_bounds: row.baseline.fit_bounds,
      visual_quality: row.baseline.visual_quality,
      contrast: row.baseline.contrast
    },
    deltas: row.deltas
  }))
}, null, 2));

if (!report.summary.all_passed) {
  process.exitCode = 1;
}
