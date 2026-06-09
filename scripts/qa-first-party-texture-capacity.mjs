import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { resolveChromePath } from './chrome-path.mjs';

const chromePath = resolveChromePath();
const outputPath = resolve(process.argv[2] ?? 'public/scenes/demo_room_001/meta/first_party_texture_capacity_report.json');
const sourceAuditPath = resolve(process.argv[3] ?? 'public/scenes/demo_room_001/meta/packed_gaussian_source_data_audit_report.json');
const fullSceneSmokePath = resolve(process.argv[4] ?? 'public/scenes/demo_room_001/meta/first_party_full_scene_source_ply_smoke_report.json');
const baseUrl = process.env.ARK_DEV_SERVER_URL ?? 'http://127.0.0.1:5173';
const timeoutMs = Number(process.env.ARK_TEXTURE_CAPACITY_TIMEOUT_MS ?? 30000);
const textureCount = 8;
const rgba32fBytesPerPixel = 16;
const requiredVertexTextureUnits = textureCount;
const recommendedDiagnosticMemoryBudgetMiB = 512;

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function bytesToMiB(bytes) {
  return Number((bytes / (1024 * 1024)).toFixed(3));
}

function resolveTextureLayout(count, maxTextureSize) {
  const width = Math.max(1, Math.min(maxTextureSize, Math.ceil(Math.sqrt(Math.max(1, count)))));
  const height = Math.max(1, Math.ceil(Math.max(1, count) / width));
  return {
    width,
    height,
    pixelCount: width * height,
    fitsMaxTextureSize: width <= maxTextureSize && height <= maxTextureSize
  };
}

function estimateTextureMemory(count, maxTextureSize) {
  const layout = resolveTextureLayout(count, maxTextureSize);
  const textureBytes = layout.pixelCount * rgba32fBytesPerPixel;
  const totalBytes = textureBytes * textureCount;
  return {
    count,
    textureCount,
    layout,
    textureBytes,
    textureMiB: bytesToMiB(textureBytes),
    totalBytes,
    totalMiB: bytesToMiB(totalBytes),
    overheadPixels: layout.pixelCount - count,
    overheadRatio: Number(((layout.pixelCount - count) / Math.max(1, count)).toFixed(6))
  };
}

async function waitForJson(url, waitMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < waitMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch {
      // keep waiting
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  const pending = new Map();
  const events = [];
  let id = 1;

  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve: resolvePending, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolvePending(message.result);
      return;
    }
    events.push(message);
  });

  const ready = new Promise((resolveReady, reject) => {
    ws.addEventListener('open', resolveReady, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  function send(method, params = {}) {
    const messageId = id++;
    ws.send(JSON.stringify({ id: messageId, method, params }));
    return new Promise((resolvePending, reject) => {
      pending.set(messageId, { resolve: resolvePending, reject });
    });
  }

  return { ws, ready, send, events };
}

async function ensureDevServer() {
  try {
    const response = await fetch(`${baseUrl}/`);
    if (response.ok) return;
    throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    throw new Error(`ARK dev server is not reachable at ${baseUrl}. Start it with npm run dev -- --port 5174 or set ARK_DEV_SERVER_URL. ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function readWebGlCaps() {
  const port = 18000 + Math.floor(Math.random() * 5000);
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--ignore-gpu-blocklist',
    '--enable-webgl',
    '--use-angle=swiftshader',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${resolve(`.chrome-cdp-profile-${port}`)}`,
    '--window-size=640,360',
    'about:blank'
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  const chromeErrors = [];
  chrome.stderr.on('data', (chunk) => chromeErrors.push(String(chunk)));

  try {
    await waitForJson(`http://127.0.0.1:${port}/json/version`);
    const openedTarget = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(`${baseUrl}/`)}`, {
      method: 'PUT'
    }).then((response) => response.json());

    const cdp = connect(openedTarget.webSocketDebuggerUrl);
    await cdp.ready;
    await cdp.send('Runtime.enable');
    const result = await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2', { antialias: false });
        if (!gl) return { webgl2: false };
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        return {
          webgl2: true,
          maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
          maxVertexTextureImageUnits: gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS),
          maxTextureImageUnits: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),
          maxCombinedTextureImageUnits: gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS),
          maxRenderbufferSize: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
          hasFloatColorBuffer: Boolean(gl.getExtension('EXT_color_buffer_float')),
          hasFloatTextureLinear: Boolean(gl.getExtension('OES_texture_float_linear')),
          renderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : null,
          vendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : null
        };
      })()`,
      returnByValue: true
    });
    cdp.ws.close();
    return {
      caps: result.result.value,
      chromeErrors: chromeErrors.join('').slice(-4000)
    };
  } finally {
    chrome.kill();
  }
}

await ensureDevServer();

const [sourceAudit, fullSceneSmoke, webgl] = await Promise.all([
  readJson(sourceAuditPath),
  readJson(fullSceneSmokePath),
  readWebGlCaps()
]);

const sourceCount = sourceAudit?.data?.decodedCount ?? fullSceneSmoke?.summary?.splats;
const manifestCount = sourceAudit?.data?.sourceCount ?? fullSceneSmoke?.summary?.expected_manifest_splats;
if (!(sourceCount > 0)) {
  throw new Error('Could not resolve decoded source splat count from source audit report.');
}

const maxTextureSize = webgl.caps?.maxTextureSize ?? 0;
const sourceEstimate = estimateTextureMemory(sourceCount, Math.max(1, maxTextureSize));
const manifestEstimate = estimateTextureMemory(manifestCount ?? sourceCount, Math.max(1, maxTextureSize));
const previousAttributeGpuMiB = fullSceneSmoke?.summary?.gpu_upload_mib ?? null;
const previousLoadPeakMiB = fullSceneSmoke?.summary?.load_peak_mib ?? null;
const diagnosticLoadPeakEstimateMiB = previousLoadPeakMiB === null
  ? null
  : Number((previousLoadPeakMiB + sourceEstimate.totalMiB).toFixed(3));

const checks = {
  webgl2Available: webgl.caps?.webgl2 === true,
  sourceFitsMaxTextureSize: sourceEstimate.layout.fitsMaxTextureSize,
  manifestFitsMaxTextureSize: manifestEstimate.layout.fitsMaxTextureSize,
  vertexTextureUnitsEnough: (webgl.caps?.maxVertexTextureImageUnits ?? 0) >= requiredVertexTextureUnits,
  combinedTextureUnitsEnough: (webgl.caps?.maxCombinedTextureImageUnits ?? 0) >= requiredVertexTextureUnits,
  floatColorBufferAvailable: webgl.caps?.hasFloatColorBuffer === true,
  diagnosticTextureMemoryUnderBudget: sourceEstimate.totalMiB <= recommendedDiagnosticMemoryBudgetMiB,
  sourceAuditPassed: sourceAudit?.status === 'passed',
  fullSourceSmokePreviouslyPassed: fullSceneSmoke?.summary?.smoke_passed === true
};

const passed = Object.values(checks).every(Boolean);
const memoryPressure = sourceEstimate.totalMiB > 384
  ? 'high'
  : sourceEstimate.totalMiB > 192
    ? 'medium'
    : 'low';

const report = {
  generated_at: new Date().toISOString(),
  target: 'ARK first-party full-source packed texture capacity assessment',
  base_url: baseUrl,
  summary: {
    passed,
    checks,
    recommendation: passed
      ? 'capacity-ok-for-guarded-source-texture-diagnostic'
      : 'do-not-run-source-texture-diagnostic-until-capacity-blockers-are-fixed',
    memory_pressure: memoryPressure,
    decoded_source_splats: sourceCount,
    manifest_splats: manifestCount ?? null,
    max_texture_size: maxTextureSize,
    required_vertex_texture_units: requiredVertexTextureUnits,
    source_texture_total_mib: sourceEstimate.totalMiB,
    previous_attribute_gpu_mib: previousAttributeGpuMiB,
    previous_load_peak_mib: previousLoadPeakMiB,
    diagnostic_load_peak_estimate_mib: diagnosticLoadPeakEstimateMiB
  },
  webgl: webgl.caps,
  estimates: {
    source: sourceEstimate,
    manifestDeclared: manifestEstimate,
    textures: [
      'center',
      'covarianceA',
      'covarianceB',
      'order',
      'color',
      'sh1A',
      'sh1B',
      'sh1C'
    ],
    rgba32fBytesPerPixel,
    diagnosticMemoryBudgetMiB: recommendedDiagnosticMemoryBudgetMiB
  },
  inputs: {
    sourceAudit: {
      path: relative(process.cwd(), sourceAuditPath).replaceAll('\\', '/'),
      status: sourceAudit?.status ?? null,
      decodedCount: sourceAudit?.data?.decodedCount ?? null,
      invalidSourceCount: sourceAudit?.data?.invalidSourceCount ?? null,
      maxCovarianceDelta: sourceAudit?.covarianceAudit?.maxAbsDelta ?? null
    },
    fullSceneSmoke: {
      path: relative(process.cwd(), fullSceneSmokePath).replaceAll('\\', '/'),
      smokePassed: fullSceneSmoke?.summary?.smoke_passed ?? null,
      renderedSplats: fullSceneSmoke?.summary?.rendered_splats ?? null,
      gpuUploadMiB: previousAttributeGpuMiB,
      loadPeakMiB: previousLoadPeakMiB
    }
  },
  notes: [
    'This report is a capacity gate only. It does not upload full-source textures and does not change renderer output.',
    'The current diagnostic texture-fetch path still keeps attribute buffers, so full-source texture diagnostics would add texture memory on top of the existing full-source smoke memory.',
    'A passed result allows a guarded source texture diagnostic; it does not make texture-fetch ready as the default renderer path.'
  ],
  chromeErrors: webgl.chromeErrors
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({
  output: relative(process.cwd(), outputPath).replaceAll('\\', '/'),
  summary: report.summary
}, null, 2));

if (!passed) {
  process.exitCode = 1;
}
