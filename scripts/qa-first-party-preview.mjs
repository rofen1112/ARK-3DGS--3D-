import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';

const outputPath = resolve(process.argv[2] ?? 'public/scenes/demo_room_001/meta/first_party_renderer_report.json');
const screenshotPath = resolve(process.argv[3] ?? 'artifacts/first-party/ark-point-preview.png');
const timeoutMs = Number(process.argv[4] ?? 120000);
const url = 'http://127.0.0.1:5173/?autoload=1&asset=ply-preview&renderer=ark-point';

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
      const isArkRenderer = result?.pageState?.renderer?.id === 'ark-point-webgl2';
      const hasDepthSorting = result?.pageState?.pipeline?.sorting === 'cpu-back-to-front'
        && result?.pageState?.renderInfo?.sortEnabled === true
        && result?.pageState?.renderInfo?.sortedSplats === result?.pageState?.activeInfo?.splats;
      const hasScaleAwarePipeline = result?.pageState?.pipeline?.scaleAware === true
        && result?.pageState?.pipeline?.opacityAware === true
        && result?.pageState?.renderInfo?.radius?.max > 0;
      resolveRun({
        url,
        screenshot: relative(process.cwd(), screenshotPath).replaceAll('\\', '/'),
        passed: exitCode === 0
          && result?.pageState?.visualQualityGate?.status === 'passed'
          && isArkRenderer
          && hasDepthSorting
          && hasScaleAwarePipeline,
        checks: {
          visualQualityPassed: result?.pageState?.visualQualityGate?.status === 'passed',
          isArkRenderer,
          hasDepthSorting,
          hasScaleAwarePipeline
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
  target: 'ARK first-party diagnostic point renderer preview QA',
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
