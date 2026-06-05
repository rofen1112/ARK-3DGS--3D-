import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';

const outputPath = resolve(process.argv[2] ?? 'public/scenes/demo_room_001/meta/first_party_gaussian_renderer_report.json');
const screenshotPath = resolve(process.argv[3] ?? 'artifacts/first-party/ark-gaussian-preview.png');
const timeoutMs = Number(process.argv[4] ?? 120000);
const url = 'http://127.0.0.1:5173/?autoload=1&asset=ply-preview&renderer=ark-gaussian';

async function ensureDevServer() {
  try {
    const response = await fetch(url);
    if (response.ok) return;
    throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    throw new Error(`ARK dev server is not reachable at ${url}. Start it with npm run dev -- --port 5173. ${error instanceof Error ? error.message : String(error)}`);
  }
}

function runVisualQa() {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [
      'scripts/cdp-screenshot.mjs',
      url,
      screenshotPath,
      String(timeoutMs)
    ], {
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
      const isArkRenderer = result?.pageState?.renderer?.id === 'ark-gaussian-webgl2';
      const hasDepthSorting = result?.pageState?.pipeline?.sorting === 'cpu-exact-back-to-front'
        && result?.pageState?.renderInfo?.sortEnabled === true
        && result?.pageState?.renderInfo?.sortMode === 'exact-depth'
        && result?.pageState?.renderInfo?.sortedSplats === result?.pageState?.activeInfo?.splats;
      const hasGaussianProjection = result?.pageState?.pipeline?.gaussianProjection === true
        && result?.pageState?.pipeline?.covarianceProjection === true
        && result?.pageState?.pipeline?.instancing === true
        && result?.pageState?.pipeline?.projectionModel === 'jacobian-covariance'
        && result?.pageState?.pipeline?.composite === 'premultiplied-alpha'
        && result?.pageState?.pipeline?.shading === 'sh1-view-dependent'
        && result?.pageState?.pipeline?.renderShDegree === 1
        && result?.pageState?.renderInfo?.ellipse?.sourceAxis?.max > 0;
      const clipping = result?.pageState?.renderInfo?.ellipse?.clipping;
      const hasClippingState = clipping?.centerClip === true
        && clipping?.nearFarClip === true
        && clipping?.minClipW > 0
        && clipping?.offscreenPadding >= 1;
      const hasDataAccessState = result?.pageState?.pipeline?.dataPacking === 'attribute-buffer'
        && result?.pageState?.pipeline?.covarianceStorage === 'scale-rotation-attributes'
        && result?.pageState?.pipeline?.orderAccess === 'cpu-reordered-attributes'
        && result?.pageState?.renderInfo?.dataPacking === result?.pageState?.pipeline?.dataPacking
        && result?.pageState?.renderInfo?.covarianceStorage === result?.pageState?.pipeline?.covarianceStorage
        && result?.pageState?.renderInfo?.orderAccess === result?.pageState?.pipeline?.orderAccess;
      const hasScaleAwarePipeline = result?.pageState?.pipeline?.scaleAware === true
        && result?.pageState?.pipeline?.opacityAware === true
        && hasGaussianProjection;
      resolveRun({
        url,
        screenshot: relative(process.cwd(), screenshotPath).replaceAll('\\', '/'),
        passed: exitCode === 0
          && result?.pageState?.visualQualityGate?.status === 'passed'
          && isArkRenderer
          && hasDepthSorting
          && hasScaleAwarePipeline
          && hasGaussianProjection
          && hasClippingState
          && hasDataAccessState,
        checks: {
          visualQualityPassed: result?.pageState?.visualQualityGate?.status === 'passed',
          isArkRenderer,
          hasDepthSorting,
          hasScaleAwarePipeline,
          hasGaussianProjection,
          hasClippingState,
          hasDataAccessState
        },
        exitCode,
        pageState: result?.pageState ?? null,
        parseError,
        stderr: stderr.slice(-4000)
      });
    });
  });
}

await ensureDevServer();
await mkdir(dirname(screenshotPath), { recursive: true });
const startedAt = performance.now();
const result = await runVisualQa();
const gate = result.pageState?.visualQualityGate;
const info = result.pageState?.activeInfo;
const report = {
  generated_at: new Date().toISOString(),
  target: 'ARK first-party Gaussian ellipse renderer preview QA',
  url,
  summary: {
    passed: result.passed,
    checks: result.checks,
    runtime: result.pageState?.runtime ?? null,
    renderer: result.pageState?.renderer?.id ?? null,
    pipeline: result.pageState?.pipeline ?? null,
    renderInfo: result.pageState?.renderInfo ?? null,
    splats: info?.splats ?? null,
    visual_quality: result.pageState?.visualQuality ?? null,
    contrast: gate?.sample?.contrast ?? null,
    duration_seconds: Number(((performance.now() - startedAt) / 1000).toFixed(3))
  },
  result
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({
  output: relative(process.cwd(), outputPath).replaceAll('\\', '/'),
  summary: report.summary,
  screenshot: result.screenshot
}, null, 2));

if (!result.passed) {
  process.exitCode = 1;
}
