import { spawn } from 'node:child_process';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';

const outputPath = resolve(process.argv[2] ?? 'public/scenes/demo_room_001/meta/independent_viewer_comparison_report.json');
const screenshotDir = resolve(process.argv[3] ?? 'artifacts/independent-compare');
const timeoutMs = Number(process.argv[4] ?? 300000);
const previewPath = resolve('public/scenes/demo_room_001/gaussian/scene-preview-100k.ply');
const arkUrl = 'http://127.0.0.1:5173/?autoload=1&asset=ply-preview';
const independentUrl = 'http://127.0.0.1:5173/kellogg-baseline.html?asset=ply-preview';

async function ensurePreviewAsset() {
  try {
    await access(previewPath);
    return;
  } catch {
    // Continue to generate the deterministic preview asset.
  }

  await new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, ['scripts/create-gaussian-ply-preview.mjs'], {
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
      if (exitCode === 0) {
        resolveRun();
        return;
      }
      rejectRun(new Error(`Failed to generate PLY preview asset.\n${stdout}\n${stderr}`));
    });
  });
}

async function ensureDevServer() {
  try {
    const response = await fetch(arkUrl);
    if (response.ok) return;
    throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    throw new Error(`ARK dev server is not reachable at ${arkUrl}. Start it with npm.cmd run dev -- --port 5173. ${error instanceof Error ? error.message : String(error)}`);
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

function summarizeComparison(ark, independent) {
  const arkSide = summarizeSide(ark);
  const independentSide = summarizeSide(independent);
  const splatDelta = typeof arkSide.splats === 'number' && typeof independentSide.splats === 'number'
    ? arkSide.splats - independentSide.splats
    : null;
  const contrastDelta = typeof arkSide.contrast === 'number' && typeof independentSide.contrast === 'number'
    ? arkSide.contrast - independentSide.contrast
    : null;
  const visualCompatibilityPassed = arkSide.passed
    && independentSide.passed
    && arkSide.viewer_format === 'PLY'
    && independentSide.viewer_format === 'PLY';
  const dataEquivalencePassed = visualCompatibilityPassed && splatDelta === 0;

  return {
    format: 'ply-preview',
    passed: visualCompatibilityPassed,
    visual_compatibility_passed: visualCompatibilityPassed,
    data_equivalence_passed: dataEquivalencePassed,
    ark: arkSide,
    independent: independentSide,
    deltas: {
      splats: splatDelta,
      contrast: contrastDelta
    },
    interpretation: visualCompatibilityPassed
      ? 'ARK and the independent Three.js GaussianSplats3D baseline both load and visibly render the same bundled PLY under ARK sidecar fit bounds. Data equivalence is tracked separately by splat-count delta.'
      : 'The independent viewer baseline did not visibly render the bundled PLY; inspect failure_reason and raw results.'
  };
}

await ensureDevServer();
await ensurePreviewAsset();
await mkdir(screenshotDir, { recursive: true });

const startedAt = performance.now();
const ark = await runVisualQa('ark-ply', arkUrl, resolve(screenshotDir, 'ark-ply.png'));
const independent = await runVisualQa('kellogg-ply', independentUrl, resolve(screenshotDir, 'kellogg-ply.png'));
const comparison = summarizeComparison(ark, independent);

const report = {
  generated_at: new Date().toISOString(),
  target: 'ARK-3DGS vs independent GaussianSplats3D PLY baseline',
  ark_url: arkUrl,
  independent_url: independentUrl,
  timeout_ms: timeoutMs,
  summary: {
    total: 1,
    passed: comparison.passed ? 1 : 0,
    failed: comparison.passed ? 0 : 1,
    all_passed: comparison.passed,
    visual_compatibility_passed: comparison.visual_compatibility_passed,
    data_equivalence_passed: comparison.data_equivalence_passed,
    duration_seconds: Number(((performance.now() - startedAt) / 1000).toFixed(3))
  },
  comparisons: [comparison],
  raw_results: {
    ark,
    independent
  }
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({
  output: relative(process.cwd(), outputPath).replaceAll('\\', '/'),
  summary: report.summary,
  comparison: {
    passed: comparison.passed,
    visual_compatibility_passed: comparison.visual_compatibility_passed,
    data_equivalence_passed: comparison.data_equivalence_passed,
    ark: {
      fit_bounds: comparison.ark.fit_bounds,
      visual_quality: comparison.ark.visual_quality,
      contrast: comparison.ark.contrast
    },
    independent: {
      fit_bounds: comparison.independent.fit_bounds,
      visual_quality: comparison.independent.visual_quality,
      contrast: comparison.independent.contrast
    },
    deltas: comparison.deltas
  }
}, null, 2));

if (!report.summary.all_passed) {
  process.exitCode = 1;
}
