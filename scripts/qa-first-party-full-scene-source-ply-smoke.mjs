import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { resolveChromePath } from './chrome-path.mjs';

const chromePath = resolveChromePath();
const outputPath = resolve(process.argv[2] ?? 'public/scenes/demo_room_001/meta/first_party_full_scene_source_ply_smoke_report.json');
const screenshotPath = resolve(process.argv[3] ?? 'artifacts/first-party-full-scene/source-ply-smoke.png');
const timeoutMs = Number(process.argv[4] ?? 300000);
const requirePass = process.argv.includes('--require-pass');
const url = 'http://127.0.0.1:5173/?autoload=1&asset=source-ply&renderer=ark-gaussian';
const minSignatureContrast = 12;
const cpuSortSplatLimit = 400_000;
const bucketSortSplatLimit = 2_000_000;

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    return {
      unavailable: true,
      path: relative(process.cwd(), path).replaceAll('\\', '/'),
      error: String(error instanceof Error ? error.message : error)
    };
  }
}

async function ensureDevServer() {
  try {
    const response = await fetch(url);
    if (response.ok) return;
    throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    throw new Error(`ARK dev server is not reachable at ${url}. Start it with npm run dev -- --port 5173. ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function waitForJson(urlToFetch, timeoutMsForJson = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMsForJson) {
    try {
      const response = await fetch(urlToFetch);
      if (response.ok) return await response.json();
    } catch {
      // keep waiting
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`Timed out waiting for ${urlToFetch}`);
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

function pageStateExpression(includeSample = false) {
  return `(() => {
    const app = window.__ARK_3DGS__;
    const debug = app?.getCompactDebugState?.(${includeSample ? 'true' : 'false'}) ?? null;
    const canvas = document.querySelector('canvas');
    return {
      runtime: document.querySelector('#runtimeState')?.textContent ?? null,
      status: document.querySelector('#status')?.textContent ?? null,
      fitBounds: document.querySelector('#fitBoundsState')?.textContent ?? null,
      visualQuality: document.querySelector('#visualQualityState')?.textContent ?? null,
      canvas: canvas ? {
        width: canvas.width,
        height: canvas.height,
        clientWidth: canvas.clientWidth,
        clientHeight: canvas.clientHeight
      } : null,
      activeInfo: debug?.activeInfo ?? null,
      visualQualityGate: debug?.visualQualityGate ?? null,
      renderer: debug?.renderer ?? null,
      pipeline: debug?.pipeline ?? null,
      scene: debug?.scene ?? null,
      camera: debug?.camera ?? null,
      renderInfo: debug?.renderInfo ?? null,
      renderSample: debug?.renderSample ?? null
    };
  })()`;
}

async function evaluatePageState(cdp, includeSample = false) {
  const result = await cdp.send('Runtime.evaluate', {
    expression: pageStateExpression(includeSample),
    returnByValue: true
  });
  return result.result.value;
}

async function waitForSmokeState(cdp, waitMs) {
  const started = Date.now();
  let pageState = null;
  while (Date.now() - started < waitMs) {
    pageState = await evaluatePageState(cdp, false);
    const gateStatus = pageState?.visualQualityGate?.status;
    if (pageState?.runtime === 'Loaded' && gateStatus && gateStatus !== 'pending') {
      return {
        timedOut: false,
        pageState,
        elapsedMs: Date.now() - started
      };
    }
    if (pageState?.runtime === 'Error') {
      return {
        timedOut: false,
        pageState,
        elapsedMs: Date.now() - started
      };
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  return {
    timedOut: true,
    pageState: pageState ?? await evaluatePageState(cdp, false),
    elapsedMs: Date.now() - started
  };
}

async function evaluateCanvasSignature(cdp) {
  const result = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return { available: false, reason: 'missing canvas' };
      const sample = document.createElement('canvas');
      sample.width = 96;
      sample.height = 54;
      const context = sample.getContext('2d');
      if (!context) return { available: false, reason: 'missing 2d context' };
      try {
        context.drawImage(canvas, 0, 0, sample.width, sample.height);
        const data = context.getImageData(0, 0, sample.width, sample.height).data;
        let sumR = 0;
        let sumG = 0;
        let sumB = 0;
        let min = 255;
        let max = 0;
        for (let index = 0; index < data.length; index += 4) {
          const r = data[index];
          const g = data[index + 1];
          const b = data[index + 2];
          sumR += r;
          sumG += g;
          sumB += b;
          min = Math.min(min, r, g, b);
          max = Math.max(max, r, g, b);
        }
        const pixels = data.length / 4;
        return {
          available: true,
          width: sample.width,
          height: sample.height,
          averageRgb: [sumR / pixels, sumG / pixels, sumB / pixels],
          minRgb: min,
          maxRgb: max,
          contrast: max - min
        };
      } catch (error) {
        return { available: false, reason: String(error) };
      }
    })()`,
    returnByValue: true
  });
  return result.result.value;
}

async function captureScreenshot(cdp) {
  const screenshot = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false
  });
  await writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'));
}

function buildChecks(pageState, signature, context) {
  const splats = pageState?.activeInfo?.splats;
  const renderedSplats = pageState?.renderInfo?.renderedSplats ?? null;
  const lod = pageState?.renderInfo?.lod ?? null;
  const largeScene = pageState?.renderInfo?.largeScene ?? null;
  const clipping = pageState?.renderInfo?.ellipse?.clipping;
  const expectedValidSplats = context.contract.summary?.validPositionCount ?? null;
  const expectedManifestSplats = context.sourceCandidate?.candidate_splats ?? null;
  const invalidPositionCount = context.contract.summary?.invalidPositionCount ?? null;
  const skippedInvalidCount = typeof expectedManifestSplats === 'number' && typeof splats === 'number'
    ? expectedManifestSplats - splats
    : null;
  const sortReason = pageState?.renderInfo?.sortReason ?? null;
  const checks = {
    loaded: pageState?.runtime === 'Loaded',
    visualGateResolved: ['passed', 'failed', 'unknown'].includes(pageState?.visualQualityGate?.status),
    expectedRenderer: pageState?.renderer?.id === 'ark-gaussian-webgl2',
    expectedFormat: pageState?.activeInfo?.format === 'PLY',
    expectedCandidate: context.sourceCandidate?.candidate_asset_id === 'source-ply',
    splatCountMatchesDecodedSource: typeof expectedValidSplats === 'number' && splats === expectedValidSplats,
    invalidSplatsSkipped: typeof invalidPositionCount === 'number' && skippedInvalidCount === invalidPositionCount,
    gaussianProjection: pageState?.pipeline?.gaussianProjection === true
      && pageState?.pipeline?.covarianceProjection === true
      && pageState?.pipeline?.instancing === true,
    jacobianCompositePipeline: pageState?.pipeline?.projectionModel === 'jacobian-covariance'
      && pageState?.pipeline?.composite === 'premultiplied-alpha'
      && pageState?.pipeline?.shading === 'sh1-view-dependent'
      && pageState?.pipeline?.renderShDegree === 1,
    clippingState: clipping?.centerClip === true
      && clipping?.nearFarClip === true
      && clipping?.minClipW > 0
      && clipping?.offscreenPadding >= 1,
    largeSceneRenderStrategy: (
      lod?.enabled === true
        && lod?.decodedSplats === splats
        && lod?.renderedSplats === renderedSplats
        && renderedSplats > 0
        && renderedSplats <= cpuSortSplatLimit
        && pageState?.pipeline?.sorting === 'cpu-exact-back-to-front'
        && pageState?.renderInfo?.sortEnabled === true
        && pageState?.renderInfo?.sortedSplats === renderedSplats
    ) || (
      largeScene?.fullDensity === true
        && largeScene?.strategy === 'full-density-bucket-depth-sort'
        && lod?.enabled === false
        && renderedSplats === splats
        && renderedSplats <= bucketSortSplatLimit
        && pageState?.pipeline?.sorting === 'cpu-bucket-back-to-front'
        && pageState?.renderInfo?.sortEnabled === true
        && pageState?.renderInfo?.sortMode === 'bucket-depth'
        && pageState?.renderInfo?.sortedSplats === renderedSplats
    ),
    canvasReady: pageState?.canvas?.width > 0
      && pageState?.canvas?.height > 0
      && pageState?.canvas?.clientWidth > 0
      && pageState?.canvas?.clientHeight > 0,
    visualEvidenceVisible: pageState?.visualQualityGate?.status === 'passed'
      || (signature?.available === true && signature.contrast >= minSignatureContrast)
  };
  return {
    checks,
    diagnostics: {
      expectedValidSplats,
      expectedManifestSplats,
      invalidPositionCount,
      actualSplats: splats ?? null,
      renderedSplats,
      skippedInvalidCount,
      sortReason,
      lod,
      largeScene,
      visualQualityStatus: pageState?.visualQualityGate?.status ?? null,
      visualQualityContrast: pageState?.visualQualityGate?.sample?.contrast ?? null,
      signatureContrast: signature?.contrast ?? null
    }
  };
}

async function runSmoke(context) {
  const port = 15000 + Math.floor(Math.random() * 5000);
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--ignore-gpu-blocklist',
    '--enable-webgl',
    '--use-angle=swiftshader',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${resolve(`.chrome-cdp-profile-${port}`)}`,
    '--window-size=1440,900',
    'about:blank'
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  const chromeErrors = [];
  chrome.stderr.on('data', (chunk) => chromeErrors.push(String(chunk)));

  try {
    await waitForJson(`http://127.0.0.1:${port}/json/version`);
    const openedTarget = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, {
      method: 'PUT'
    }).then((response) => response.json());

    const cdp = connect(openedTarget.webSocketDebuggerUrl);
    await cdp.ready;
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');

    const waitResult = await waitForSmokeState(cdp, timeoutMs);
    let pageState = await evaluatePageState(cdp, true);
    const signature = await evaluateCanvasSignature(cdp).catch((error) => ({
      available: false,
      reason: String(error instanceof Error ? error.message : error)
    }));
    await captureScreenshot(cdp).catch(() => undefined);
    pageState = pageState ?? waitResult.pageState;
    const gate = buildChecks(pageState, signature, context);
    const relevantEvents = cdp.events
      .filter((event) => [
        'Runtime.consoleAPICalled',
        'Runtime.exceptionThrown',
        'Network.loadingFailed'
      ].includes(event.method))
      .slice(-30);

    cdp.ws.close();
    return {
      attempted: true,
      timedOut: waitResult.timedOut,
      elapsedMs: waitResult.elapsedMs,
      pageState,
      signature,
      ...gate,
      events: relevantEvents,
      chromeErrors: chromeErrors.join('').slice(-4000)
    };
  } catch (error) {
    return {
      attempted: true,
      timedOut: false,
      error: String(error instanceof Error ? error.message : error),
      pageState: null,
      signature: null,
      checks: {},
      diagnostics: {},
      events: [],
      chromeErrors: chromeErrors.join('').slice(-4000)
    };
  } finally {
    chrome.kill();
  }
}

await ensureDevServer();
await mkdir(dirname(outputPath), { recursive: true });
await mkdir(dirname(screenshotPath), { recursive: true });

const manifest = await readJson('public/scenes/demo_room_001/manifest.json');
const contract = await readJson('public/scenes/demo_room_001/meta/gaussian_data_contract_report.json');
const candidateReport = await readJson('public/scenes/demo_room_001/meta/first_party_full_scene_candidate_report.json');
const sourceCandidate = candidateReport.resolutions?.find((item) => item.label === 'default') ?? null;
const context = { manifest, contract, candidateReport, sourceCandidate };
const startedAt = performance.now();
const result = await runSmoke(context);
const smokePassed = Object.values(result.checks ?? {}).every(Boolean) && result.attempted === true && result.timedOut !== true;
const renderInfo = result.pageState?.renderInfo ?? null;
const performanceInfo = renderInfo?.performance ?? null;
const frameTiming = renderInfo?.frameTiming ?? null;
const report = {
  generated_at: new Date().toISOString(),
  target: 'ARK first-party full-scene source PLY degraded smoke QA',
  url,
  timeout_ms: timeoutMs,
  summary: {
    passed: smokePassed,
    smoke_passed: smokePassed,
    attempted: result.attempted === true,
    timed_out: result.timedOut === true,
    runtime: result.pageState?.runtime ?? null,
    renderer: result.pageState?.renderer?.id ?? null,
    asset: 'source-ply',
    candidate_mode: sourceCandidate?.mode ?? null,
    measured_default_runtime_directly: sourceCandidate?.measuredDefaultRuntime === true,
    splats: result.pageState?.activeInfo?.splats ?? null,
    expected_valid_splats: contract.summary?.validPositionCount ?? null,
    expected_manifest_splats: sourceCandidate?.candidate_splats ?? null,
    skipped_invalid_splats: result.diagnostics?.skippedInvalidCount ?? null,
    rendered_splats: renderInfo?.renderedSplats ?? null,
    lod_enabled: renderInfo?.lod?.enabled ?? null,
    lod_mode: renderInfo?.lod?.mode ?? null,
    lod_budget_splats: renderInfo?.lod?.budgetSplats ?? null,
    lod_sampling_stride: renderInfo?.lod?.samplingStride ?? null,
    lod_rendered_ratio: renderInfo?.lod?.renderedRatio ?? null,
    large_scene_strategy: renderInfo?.largeScene?.strategy ?? null,
    large_scene_full_density: renderInfo?.largeScene?.fullDensity ?? null,
    sorting: result.pageState?.pipeline?.sorting ?? null,
    sort_enabled: result.pageState?.renderInfo?.sortEnabled ?? null,
    sort_reason: result.pageState?.renderInfo?.sortReason ?? null,
    visual_quality: result.pageState?.visualQuality ?? null,
    visual_quality_status: result.pageState?.visualQualityGate?.status ?? null,
    visual_quality_contrast: result.pageState?.visualQualityGate?.sample?.contrast ?? null,
    visual_gate_settle_frames: result.pageState?.visualQualityGate?.thresholds?.settleFrames ?? null,
    visual_gate_evaluated_ms: result.pageState?.visualQualityGate?.evaluatedAtMs ?? null,
    signature_contrast: result.signature?.contrast ?? null,
    cdp_wait_elapsed_ms: result.elapsedMs ?? null,
    renderer_load_ms: renderInfo?.lastLoadMs ?? performanceInfo?.totalLoadMs ?? null,
    renderer_read_ms: performanceInfo?.readMs ?? null,
    renderer_decode_ms: performanceInfo?.decodeMs ?? null,
    renderer_pack_ms: performanceInfo?.packMs ?? null,
    renderer_upload_ms: performanceInfo?.uploadMs ?? null,
    renderer_last_render_ms: frameTiming?.lastRenderMs ?? null,
    renderer_average_render_ms: frameTiming?.averageRenderMs ?? null,
    renderer_max_render_ms: frameTiming?.maxRenderMs ?? null,
    renderer_render_count: frameTiming?.renderCount ?? null,
    retained_cpu_buffer_mib: performanceInfo?.retainedCpuBufferMiB ?? null,
    gpu_upload_mib: performanceInfo?.gpuUploadMiB ?? null,
    load_peak_mib: performanceInfo?.loadPeakMiB ?? null,
    checks: result.checks ?? {},
    duration_seconds: Number(((performance.now() - startedAt) / 1000).toFixed(3))
  },
  screenshot: relative(process.cwd(), screenshotPath).replaceAll('\\', '/'),
  diagnostics: result.diagnostics ?? {},
  result: {
    pageState: result.pageState,
    signature: result.signature,
    error: result.error ?? null,
    elapsedMs: result.elapsedMs ?? null,
    events: result.events ?? [],
    chromeErrors: result.chromeErrors ?? ''
  },
  inputs: {
    candidate: sourceCandidate,
    candidate_summary: candidateReport.summary ?? null,
    contract_summary: contract.summary ?? null
  }
};

await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({
  output: relative(process.cwd(), outputPath).replaceAll('\\', '/'),
  summary: report.summary,
  screenshot: report.screenshot
}, null, 2));

if (requirePass && !smokePassed) {
  process.exitCode = 1;
}
