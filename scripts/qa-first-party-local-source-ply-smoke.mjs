import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sourcePlyPath = resolve('public/scenes/demo_room_001/gaussian/scene.ply');
const sourcePlyUrl = '/scenes/demo_room_001/gaussian/scene.ply';
const outputPath = resolve(process.argv[2] ?? 'public/scenes/demo_room_001/meta/first_party_local_source_ply_smoke_report.json');
const screenshotPath = resolve(process.argv[3] ?? 'artifacts/first-party-full-scene/local-source-ply-smoke.png');
const timeoutMs = Number(process.argv[4] ?? 300000);
const requirePass = process.argv.includes('--require-pass');
const url = 'http://127.0.0.1:5173/?renderer=ark-gaussian';

async function ensureDevServer() {
  const response = await fetch(url).catch((error) => {
    throw new Error(`ARK dev server is not reachable at ${url}. ${error instanceof Error ? error.message : String(error)}`);
  });
  if (!response.ok) throw new Error(`ARK dev server returned HTTP ${response.status} at ${url}.`);
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

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true
  });
  return result.result.value;
}

async function evaluatePageState(cdp, includeSample = false) {
  return evaluate(cdp, `(() => {
    const app = window.__ARK_3DGS__;
    const debug = app?.getCompactDebugState?.(${includeSample ? 'true' : 'false'}) ?? null;
    const canvas = document.querySelector('canvas');
    return {
      runtime: document.querySelector('#runtimeState')?.textContent ?? null,
      status: document.querySelector('#status')?.textContent ?? null,
      fitBounds: document.querySelector('#fitBoundsState')?.textContent ?? null,
      visualQuality: document.querySelector('#visualQualityState')?.textContent ?? null,
      source: document.querySelector('#sourceState')?.textContent ?? null,
      displayScale: document.querySelector('#displayScale')?.textContent ?? null,
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
      renderInfo: debug?.renderInfo ?? null,
      renderSample: debug?.renderSample ?? null
    };
  })()`);
}

async function waitForAppReady(cdp) {
  const started = Date.now();
  while (Date.now() - started < 10000) {
    const ready = await evaluate(cdp, `(() => Boolean(window.__ARK_3DGS__ && document.querySelector('#runtimeState')))()`);
    if (ready) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error('Timed out waiting for ARK app bootstrap.');
}

async function loadLocalSourceUrl(cdp) {
  await evaluate(cdp, `(() => {
    document.dispatchEvent(new CustomEvent('ark-3dgs-debug-load-url', {
      detail: {
        url: '${sourcePlyUrl}',
        name: 'Local source PLY smoke',
        filename: 'scene.ply',
        source: 'local'
      }
    }));
    return true;
  })()`);
}

async function waitForLoadedState(cdp) {
  const started = Date.now();
  let pageState = null;
  while (Date.now() - started < timeoutMs) {
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

async function captureScreenshot(cdp) {
  const screenshot = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false
  });
  await writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'));
}

async function runSmoke() {
  if (!existsSync(sourcePlyPath)) {
    throw new Error(`Local source PLY is required for this QA run: ${relative(process.cwd(), sourcePlyPath)}`);
  }

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
    await waitForAppReady(cdp);
    await loadLocalSourceUrl(cdp);
    const waitResult = await waitForLoadedState(cdp);
    const pageState = await evaluatePageState(cdp, true);
    await captureScreenshot(cdp).catch(() => undefined);
    cdp.ws.close();

    return {
      attempted: true,
      timedOut: waitResult.timedOut,
      elapsedMs: waitResult.elapsedMs,
      pageState,
      events: cdp.events
        .filter((event) => [
          'Runtime.consoleAPICalled',
          'Runtime.exceptionThrown',
          'Network.loadingFailed'
        ].includes(event.method))
        .slice(-30),
      chromeErrors: chromeErrors.join('').slice(-4000)
    };
  } finally {
    chrome.kill();
  }
}

await ensureDevServer();
await mkdir(dirname(outputPath), { recursive: true });
await mkdir(dirname(screenshotPath), { recursive: true });

const startedAt = performance.now();
const result = await runSmoke().catch((error) => ({
  attempted: true,
  timedOut: false,
  error: String(error instanceof Error ? error.message : error),
  pageState: null,
  events: [],
  chromeErrors: ''
}));

const pageState = result.pageState ?? null;
const renderInfo = pageState?.renderInfo ?? null;
const checks = {
  loaded: pageState?.runtime === 'Loaded',
  expectedRenderer: pageState?.renderer?.id === 'ark-gaussian-webgl2',
  localSource: pageState?.activeInfo?.source === 'local' && pageState?.source === 'Local file',
  computedRobustFitBounds: pageState?.activeInfo?.fitBoundsId === 'ply_01_99'
    && pageState?.activeInfo?.fitBoundsSource === 'computed',
  fullDensityLargeScene: renderInfo?.largeScene?.fullDensity === true
    && renderInfo?.largeScene?.strategy === 'full-density-bucket-depth-sort'
    && renderInfo?.lod?.enabled === false
    && renderInfo?.renderedSplats === pageState?.activeInfo?.splats
    && pageState?.pipeline?.sorting === 'cpu-bucket-back-to-front'
    && renderInfo?.sortEnabled === true
    && renderInfo?.sortMode === 'bucket-depth'
    && renderInfo?.sortedSplats === renderInfo?.renderedSplats,
  fullDensityEllipse: renderInfo?.ellipse?.profile === 'large-scene-full-density'
    && renderInfo?.ellipse?.maxPixelAxis === 1024
    && renderInfo?.ellipse?.minPixelAxis === 0.35
    && renderInfo?.ellipse?.preBlurAmount === 0.3
    && renderInfo?.ellipse?.focalAdjustment === 2
    && renderInfo?.ellipse?.opacityScale < renderInfo?.ellipse?.baseOpacityScale,
  sh1Pipeline: pageState?.pipeline?.shading === 'sh1-view-dependent'
    && pageState?.pipeline?.sourceShDegree === 3
    && pageState?.pipeline?.renderShDegree === 1
    && pageState?.pipeline?.renderShRestCount === 9,
  visualGateResolved: ['passed', 'failed', 'unknown'].includes(pageState?.visualQualityGate?.status)
};
const passed = Object.values(checks).every(Boolean);
const report = {
  generated_at: new Date().toISOString(),
  target: 'ARK first-party local source PLY smoke QA',
  url,
  source_ply: relative(process.cwd(), sourcePlyPath).replaceAll('\\', '/'),
  source_url: sourcePlyUrl,
  timeout_ms: timeoutMs,
  summary: {
    passed,
    attempted: result.attempted === true,
    timed_out: result.timedOut === true,
    runtime: pageState?.runtime ?? null,
    renderer: pageState?.renderer?.id ?? null,
    source: pageState?.source ?? null,
    fit_bounds: pageState?.fitBounds ?? null,
    display_scale: pageState?.displayScale ?? null,
    splats: pageState?.activeInfo?.splats ?? null,
    visual_quality: pageState?.visualQuality ?? null,
    lod: renderInfo?.lod ?? null,
    ellipse: renderInfo?.ellipse ?? null,
    checks,
    duration_seconds: Number(((performance.now() - startedAt) / 1000).toFixed(3))
  },
  screenshot: relative(process.cwd(), screenshotPath).replaceAll('\\', '/'),
  result: {
    pageState,
    error: result.error ?? null,
    elapsedMs: result.elapsedMs ?? null,
    events: result.events ?? [],
    chromeErrors: result.chromeErrors ?? ''
  }
};

await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  output: relative(process.cwd(), outputPath).replaceAll('\\', '/'),
  summary: report.summary,
  screenshot: report.screenshot
}, null, 2));

if (requirePass && !passed) {
  process.exitCode = 1;
}
