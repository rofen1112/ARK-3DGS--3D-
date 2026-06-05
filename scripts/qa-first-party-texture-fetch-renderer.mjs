import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';

const outputPath = resolve(process.argv[2] ?? 'public/scenes/demo_room_001/meta/first_party_texture_fetch_renderer_report.json');
const screenshotPath = resolve(process.argv[3] ?? 'artifacts/first-party/ark-gaussian-texture-fetch.png');
const timeoutMs = Number(process.argv[4] ?? 120000);
const url = 'http://127.0.0.1:5173/?autoload=1&asset=ply-preview&renderer=ark-gaussian&arkDiagData=texture-fetch';

async function ensureDevServer() {
  try {
    const response = await fetch(url);
    if (response.ok) return;
    throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    throw new Error(`ARK dev server is not reachable at ${url}. Start it with npm.cmd run dev -- --port 5173. ${error instanceof Error ? error.message : String(error)}`);
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
      const pageState = result?.pageState;
      const audit = pageState?.pipeline?.dataTextureAudit;
      const hasTextureAudit = pageState?.pipeline?.dataTextureMode === 'texture-fetch'
        && pageState?.pipeline?.diagnostics?.dataTextureMode === 'texture-fetch'
        && audit?.enabled === true
        && audit?.mode === 'texture-fetch'
        && audit?.status === 'passed'
        && audit?.textures?.center === true
        && audit?.textures?.covarianceA === true
        && audit?.textures?.covarianceB === true
        && audit?.textures?.order === true;
      const hasTextureFetchDraw = pageState?.pipeline?.dataPacking === 'texture-fetch-hybrid'
        && pageState?.pipeline?.covarianceStorage === 'packed-covariance-texture'
        && pageState?.pipeline?.orderAccess === 'order-texture'
        && pageState?.renderInfo?.dataPacking === 'texture-fetch-hybrid'
        && pageState?.renderInfo?.covarianceStorage === 'packed-covariance-texture'
        && pageState?.renderInfo?.orderAccess === 'order-texture';
      const isArkRenderer = pageState?.renderer?.id === 'ark-gaussian-webgl2';
      resolveRun({
        url,
        screenshot: relative(process.cwd(), screenshotPath).replaceAll('\\', '/'),
        passed: exitCode === 0
          && pageState?.visualQualityGate?.status === 'passed'
          && isArkRenderer
          && hasTextureAudit
          && hasTextureFetchDraw,
        checks: {
          visualQualityPassed: pageState?.visualQualityGate?.status === 'passed',
          isArkRenderer,
          hasTextureAudit,
          hasTextureFetchDraw
        },
        exitCode,
        pageState: pageState ?? null,
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
const pageState = result.pageState;
const report = {
  generated_at: new Date().toISOString(),
  target: 'ARK first-party Gaussian texture-fetch renderer diagnostic',
  url,
  summary: {
    passed: result.passed,
    checks: result.checks,
    renderer: pageState?.renderer?.id ?? null,
    pipeline: pageState?.pipeline ?? null,
    renderInfo: pageState?.renderInfo ?? null,
    splats: pageState?.activeInfo?.splats ?? null,
    visual_quality: pageState?.visualQuality ?? null,
    contrast: pageState?.visualQualityGate?.sample?.contrast ?? null,
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
