import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { resolveChromePath } from './chrome-path.mjs';

const chromePath = resolveChromePath();
const outputPath = resolve(process.argv[2] ?? 'public/scenes/demo_room_001/meta/first_party_gaussian_stress_report.json');
const screenshotDir = resolve(process.argv[3] ?? 'artifacts/first-party-gaussian-stress');
const timeoutMs = Number(process.argv[4] ?? 90000);
const url = 'http://127.0.0.1:5173/?autoload=1&asset=ply-preview&renderer=ark-gaussian';
const minDefaultContrast = 12;
const minStressContrast = 8;

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

async function waitForLoadedScene(cdp, waitMs) {
  const started = Date.now();
  let pageState = null;
  while (Date.now() - started < waitMs) {
    pageState = await evaluatePageState(cdp, false);
    if (pageState?.runtime === 'Loaded' && pageState?.activeInfo?.splats > 0) return pageState;
    if (pageState?.runtime === 'Error') return pageState;
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  return pageState ?? await evaluatePageState(cdp, false);
}

async function waitForRenderSettle(cdp, delayMs = 120) {
  await cdp.send('Runtime.evaluate', {
    expression: `new Promise((resolve) => setTimeout(resolve, ${Math.max(1, Math.round(delayMs))}))`,
    awaitPromise: true,
    returnByValue: true
  });
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

function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function subtract(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale(value, scalar) {
  return [value[0] * scalar, value[1] * scalar, value[2] * scalar];
}

function length(value) {
  return Math.hypot(value[0], value[1], value[2]);
}

function normalize(value, fallback) {
  const vectorLength = length(value);
  if (vectorLength <= 0.000001) return fallback;
  return scale(value, 1 / vectorLength);
}

function buildStressCases(initialState) {
  const camera = initialState.camera;
  const position = camera.position;
  const target = camera.target;
  const distance = camera.distance;
  const fitRadius = Math.max(distance / 3.6, 1);
  const forward = normalize(subtract(target, position), [0, 0, 1]);
  const right = normalize([forward[2], 0, -forward[0]], [1, 0, 0]);
  const closeDistance = Math.max(fitRadius * 0.18, 0.08);
  const closePosition = subtract(target, scale(forward, closeDistance));
  const closeOffsetPosition = add(closePosition, scale(right, fitRadius * 0.25));
  const closeOffsetTarget = add(target, scale(right, fitRadius * 0.05));

  return [
    {
      label: 'default-fit',
      purpose: 'Baseline fit camera after load.',
      minContrast: minDefaultContrast,
      camera: { position, target, distance, frames: 30 }
    },
    {
      label: 'edge-right',
      purpose: 'Keep visible content off center to exercise offscreen center clipping without losing sampled coverage.',
      minContrast: minStressContrast,
      camera: {
        position,
        target: add(target, scale(right, fitRadius * 0.3)),
        distance,
        frames: 30
      }
    },
    {
      label: 'near-plane-close',
      purpose: 'Move close to the scene center to exercise near/far clipping without blanking the canvas.',
      minContrast: minStressContrast,
      camera: {
        position: closePosition,
        target,
        distance: closeDistance,
        frames: 30
      }
    },
    {
      label: 'near-plane-offset',
      purpose: 'Combine close camera distance with a slight lateral offset.',
      minContrast: minStressContrast,
      camera: {
        position: closeOffsetPosition,
        target: closeOffsetTarget,
        distance: length(subtract(closeOffsetTarget, closeOffsetPosition)),
        frames: 30
      }
    }
  ];
}

function checkState(state, signature, minContrast) {
  const clipping = state?.renderInfo?.ellipse?.clipping;
  const sample = state?.renderSample;
  const splats = state?.activeInfo?.splats;
  const sortedSplats = state?.renderInfo?.sortedSplats;
  const checks = {
    loaded: state?.runtime === 'Loaded',
    expectedRenderer: state?.renderer?.id === 'ark-gaussian-webgl2',
    gaussianProjection: state?.pipeline?.gaussianProjection === true
      && state?.pipeline?.covarianceProjection === true
      && state?.pipeline?.instancing === true,
    clippingState: clipping?.centerClip === true
      && clipping?.nearFarClip === true
      && clipping?.minClipW > 0
      && clipping?.offscreenPadding >= 1,
    canvasSignatureVisible: signature?.available === true && signature.contrast >= minContrast,
    splatCountStable: typeof splats === 'number' && splats > 0,
    depthSortStable: sortedSplats === splats
  };
  return {
    passed: Object.values(checks).every(Boolean),
    checks,
    diagnostics: {
      visualSampleVisible: sample?.status === 'visible',
      sampleContrastPassed: typeof sample?.contrast === 'number' && sample.contrast >= minContrast
    },
    sample,
    signature,
    clipping
  };
}

async function setCameraAndSample(cdp, testCase) {
  const detail = JSON.stringify(testCase.camera);
  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      document.dispatchEvent(new CustomEvent('ark-3dgs-camera-set', { detail: ${detail} }));
      window.__ARK_3DGS__?.forceRenderFrames?.(${testCase.camera.frames ?? 30});
      return true;
    })()`,
    returnByValue: true
  });
  await waitForRenderSettle(cdp);
  const state = await evaluatePageState(cdp, true);
  const signature = await evaluateCanvasSignature(cdp);
  return { state, signature };
}

async function captureScreenshot(cdp, screenshotPath) {
  const screenshot = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false
  });
  await writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'));
}

async function runStressQa() {
  const port = 13000 + Math.floor(Math.random() * 5000);
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

    const loadedState = await waitForLoadedScene(cdp, timeoutMs);
    if (loadedState?.runtime !== 'Loaded' || !(loadedState?.activeInfo?.splats > 0)) {
      return {
        passed: false,
        cases: [],
        loadedState,
        chromeErrors: chromeErrors.join('').slice(-4000)
      };
    }

    const initialState = await evaluatePageState(cdp, true);
    const testCases = buildStressCases(initialState);
    const cases = [];

    for (const testCase of testCases) {
      const { state, signature } = await setCameraAndSample(cdp, testCase);
      const screenshotPath = resolve(screenshotDir, `${testCase.label}.png`);
      await captureScreenshot(cdp, screenshotPath);
      const gate = checkState(state, signature, testCase.minContrast);
      cases.push({
        label: testCase.label,
        purpose: testCase.purpose,
        passed: gate.passed,
        checks: gate.checks,
        diagnostics: gate.diagnostics,
        min_contrast: testCase.minContrast,
        sample: gate.sample,
        signature: gate.signature,
        clipping: gate.clipping,
        camera: state?.camera ?? null,
        renderer: state?.renderer?.id ?? null,
        splats: state?.activeInfo?.splats ?? null,
        sortedSplats: state?.renderInfo?.sortedSplats ?? null,
        screenshot: relative(process.cwd(), screenshotPath).replaceAll('\\', '/')
      });
    }

    cdp.ws.close();
    return {
      passed: cases.every((item) => item.passed),
      initialState,
      cases,
      chromeErrors: chromeErrors.join('').slice(-4000)
    };
  } catch (error) {
    return {
      passed: false,
      cases: [],
      error: String(error instanceof Error ? error.message : error),
      chromeErrors: chromeErrors.join('').slice(-4000)
    };
  } finally {
    chrome.kill();
  }
}

await ensureDevServer();
await mkdir(screenshotDir, { recursive: true });
await mkdir(dirname(outputPath), { recursive: true });

const startedAt = performance.now();
const result = await runStressQa();
const report = {
  generated_at: new Date().toISOString(),
  target: 'ARK first-party Gaussian camera-edge and near-plane stress QA',
  url,
  timeout_ms: timeoutMs,
  summary: {
    passed: result.passed,
    case_count: result.cases.length,
    passed_cases: result.cases.filter((item) => item.passed).length,
    clipping_hard_gate_passed: result.cases.length > 0 && result.cases.every((item) => item.checks.clippingState),
    duration_seconds: Number(((performance.now() - startedAt) / 1000).toFixed(3))
  },
  cases: result.cases,
  error: result.error ?? null,
  chromeErrors: result.chromeErrors
};

await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({
  output: relative(process.cwd(), outputPath).replaceAll('\\', '/'),
  summary: report.summary,
  cases: report.cases.map((item) => ({
    label: item.label,
    passed: item.passed,
    sampleContrast: item.sample?.contrast ?? null,
    signatureContrast: item.signature?.contrast ?? null,
    renderer: item.renderer,
    splats: item.splats,
    sortedSplats: item.sortedSplats
  }))
}, null, 2));

if (!report.summary.passed) {
  process.exitCode = 1;
}
