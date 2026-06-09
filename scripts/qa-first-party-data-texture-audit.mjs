import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';

const outputPath = resolve(process.argv[2] ?? 'public/scenes/demo_room_001/meta/first_party_data_texture_audit_report.json');
const screenshotPath = resolve(process.argv[3] ?? 'artifacts/first-party/ark-gaussian-data-texture-audit.png');
const timeoutMs = Number(process.argv[4] ?? 120000);
const baseUrl = process.env.ARK_DEV_SERVER_URL ?? 'http://127.0.0.1:5173';
const url = `${baseUrl}/?autoload=1&asset=ply-preview&renderer=ark-gaussian&arkDiagData=texture-audit`;

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
      const pageState = result?.pageState;
      const audit = pageState?.pipeline?.dataTextureAudit;
      const thresholds = audit?.thresholds;
      const hasTextureAudit = pageState?.pipeline?.dataTextureMode === 'texture-audit'
        && pageState?.pipeline?.diagnostics?.dataTextureMode === 'texture-audit'
        && audit?.enabled === true
        && audit?.mode === 'texture-audit'
        && audit?.status === 'passed'
        && audit?.count === pageState?.activeInfo?.splats
        && audit?.sampleCount >= 3
        && audit?.textures?.center === true
        && audit?.textures?.covarianceA === true
        && audit?.textures?.covarianceB === true
        && audit?.textures?.order === true
        && audit?.textures?.color === true
        && audit?.textures?.sh1A === true
        && audit?.textures?.sh1B === true
        && audit?.textures?.sh1C === true
        && audit?.centerMaxAbsDelta <= thresholds?.centerMaxAbsDelta
        && audit?.covarianceMaxAbsDelta <= thresholds?.covarianceMaxAbsDelta
        && audit?.orderMaxAbsDelta <= thresholds?.orderMaxAbsDelta
        && audit?.colorMaxAbsDelta <= thresholds?.colorMaxAbsDelta
        && audit?.sh1MaxAbsDelta <= thresholds?.sh1MaxAbsDelta;
      const drawPathUnchanged = pageState?.pipeline?.dataPacking === 'attribute-buffer'
        && pageState?.pipeline?.covarianceStorage === 'scale-rotation-attributes'
        && pageState?.pipeline?.orderAccess === 'cpu-reordered-attributes'
        && pageState?.pipeline?.colorStorage === 'color-attribute'
        && pageState?.pipeline?.shStorage === 'sh1-attributes'
        && pageState?.renderInfo?.dataPacking === 'attribute-buffer'
        && pageState?.renderInfo?.colorStorage === 'color-attribute'
        && pageState?.renderInfo?.shStorage === 'sh1-attributes'
        && pageState?.renderInfo?.dataTextureAudit?.status === 'passed';
      const isArkRenderer = pageState?.renderer?.id === 'ark-gaussian-webgl2';
      resolveRun({
        url,
        screenshot: relative(process.cwd(), screenshotPath).replaceAll('\\', '/'),
        passed: exitCode === 0
          && pageState?.visualQualityGate?.status === 'passed'
          && isArkRenderer
          && hasTextureAudit
          && drawPathUnchanged,
        checks: {
          visualQualityPassed: pageState?.visualQualityGate?.status === 'passed',
          isArkRenderer,
          hasTextureAudit,
          drawPathUnchanged
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
  target: 'ARK first-party Gaussian packed texture upload/readback diagnostic',
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
