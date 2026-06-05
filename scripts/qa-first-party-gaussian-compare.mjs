import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { resolveChromePath } from './chrome-path.mjs';

const chromePath = resolveChromePath();
const outputPath = resolve(process.argv[2] ?? 'public/scenes/demo_room_001/meta/first_party_gaussian_comparison_report.json');
const screenshotDir = resolve(process.argv[3] ?? 'artifacts/first-party-gaussian-compare');
const timeoutMs = Number(process.argv[4] ?? 300000);
const signatureWidth = 96;
const signatureHeight = 54;
const baseUrl = 'http://127.0.0.1:5173';

const targets = [
  {
    label: 'ark-gaussian',
    url: `${baseUrl}/?autoload=1&asset=ply-preview&renderer=ark-gaussian`,
    expectedRenderer: 'ark-gaussian-webgl2',
    requiresSignature: true
  },
  {
    label: 'aholo-adapter',
    url: `${baseUrl}/?autoload=1&asset=ply-preview`,
    expectedRenderer: 'aholo',
    requiresSignature: true
  },
  {
    label: 'kellogg-independent',
    url: `${baseUrl}/kellogg-baseline.html?asset=ply-preview`,
    expectedRenderer: 'gaussian-splats-3d',
    requiresSignature: false
  }
];

async function ensureDevServer() {
  try {
    const response = await fetch(targets[0].url);
    if (response.ok) return;
    throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    throw new Error(`ARK dev server is not reachable at ${targets[0].url}. Start it with npm run dev -- --port 5173. ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function waitForJson(url, timeoutMsForJson = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMsForJson) {
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

function evaluatePageStateExpression() {
  return `(() => {
    const host = document.querySelector('#viewerHost');
    let debug = null;
    try {
      const raw = host?.getAttribute('data-ark-debug');
      debug = raw ? JSON.parse(raw) : null;
    } catch (error) {
      debug = { parseError: String(error) };
    }
    const c = document.querySelector('canvas');
    return {
      runtime: document.querySelector('#runtimeState')?.textContent ?? null,
      status: document.querySelector('#status')?.textContent ?? null,
      fitBounds: document.querySelector('#fitBoundsState')?.textContent ?? null,
      visualQuality: document.querySelector('#visualQualityState')?.textContent ?? null,
      canvas: c ? {
        width: c.width,
        height: c.height,
        clientWidth: c.clientWidth,
        clientHeight: c.clientHeight
      } : null,
      activeInfo: debug?.activeInfo ?? null,
      visualQualityGate: debug?.visualQualityGate ?? null,
      renderer: debug?.renderer ?? null,
      pipeline: debug?.pipeline ?? null,
      scene: debug?.scene ?? null,
      renderInfo: debug?.renderInfo ?? null
    };
  })()`;
}

async function evaluatePageState(cdp) {
  const result = await cdp.send('Runtime.evaluate', {
    expression: evaluatePageStateExpression(),
    returnByValue: true
  });
  return result.result.value;
}

async function waitForVisualQuality(cdp, waitMs) {
  const started = Date.now();
  let pageState = null;
  while (Date.now() - started < waitMs) {
    pageState = await evaluatePageState(cdp);
    const gateStatus = pageState?.visualQualityGate?.status;
    if (pageState?.runtime === 'Loaded' && gateStatus && gateStatus !== 'pending') {
      return pageState;
    }
    if (pageState?.runtime === 'Error') {
      return pageState;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  return pageState ?? await evaluatePageState(cdp);
}

async function evaluateCanvasSignature(cdp) {
  const result = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return { available: false, reason: 'missing canvas' };
      const sample = document.createElement('canvas');
      sample.width = ${signatureWidth};
      sample.height = ${signatureHeight};
      const context = sample.getContext('2d');
      if (!context) return { available: false, reason: 'missing 2d context' };
      try {
        context.drawImage(canvas, 0, 0, sample.width, sample.height);
        const data = context.getImageData(0, 0, sample.width, sample.height).data;
        const rgb = [];
        let sumR = 0;
        let sumG = 0;
        let sumB = 0;
        let min = 255;
        let max = 0;
        for (let index = 0; index < data.length; index += 4) {
          const r = data[index];
          const g = data[index + 1];
          const b = data[index + 2];
          rgb.push(r, g, b);
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
          pixels,
          averageRgb: [sumR / pixels, sumG / pixels, sumB / pixels],
          minRgb: min,
          maxRgb: max,
          contrast: max - min,
          rgb
        };
      } catch (error) {
        return { available: false, reason: String(error) };
      }
    })()`,
    returnByValue: true
  });
  return result.result.value;
}

async function runTarget(target, screenshotPath) {
  const port = 11000 + Math.floor(Math.random() * 5000);
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
    const openedTarget = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(target.url)}`, {
      method: 'PUT'
    }).then((response) => response.json());

    const cdp = connect(openedTarget.webSocketDebuggerUrl);
    await cdp.ready;
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');

    const pageState = await waitForVisualQuality(cdp, timeoutMs);
    const screenshot = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false
    });
    await writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'));
    const signature = await evaluateCanvasSignature(cdp);
    const rendererId = pageState?.renderer?.id ?? null;
    const splats = pageState?.activeInfo?.splats ?? null;
    const visualPassed = pageState?.visualQualityGate?.status === 'passed';
    const rendererPassed = !target.expectedRenderer || rendererId === target.expectedRenderer;
    const signatureAvailable = signature?.available === true && signature?.contrast > 1;

    cdp.ws.close();
    return {
      label: target.label,
      url: target.url,
      screenshot: relative(process.cwd(), screenshotPath).replaceAll('\\', '/'),
      passed: pageState?.runtime === 'Loaded' && visualPassed && rendererPassed && (!target.requiresSignature || signatureAvailable),
      checks: {
        loaded: pageState?.runtime === 'Loaded',
        visualQualityPassed: visualPassed,
        expectedRenderer: rendererPassed,
        signatureRequired: target.requiresSignature,
        signatureAvailable
      },
      renderer: rendererId,
      pipeline: pageState?.pipeline ?? null,
      pageState,
      signature,
      splats,
      chromeErrors: chromeErrors.join('').slice(-4000)
    };
  } catch (error) {
    return {
      label: target.label,
      url: target.url,
      screenshot: relative(process.cwd(), screenshotPath).replaceAll('\\', '/'),
      passed: false,
      checks: {
        loaded: false,
        visualQualityPassed: false,
        expectedRenderer: false,
        signatureAvailable: false
      },
      renderer: null,
      pipeline: null,
      pageState: null,
      signature: null,
      splats: null,
      error: String(error instanceof Error ? error.message : error),
      chromeErrors: chromeErrors.join('').slice(-4000)
    };
  } finally {
    chrome.kill();
  }
}

function summarizeTarget(result) {
  const gate = result.pageState?.visualQualityGate;
  const info = result.pageState?.activeInfo;
  return {
    label: result.label,
    passed: result.passed,
    checks: result.checks,
    renderer: result.renderer,
    pipeline: result.pipeline,
    splats: info?.splats ?? null,
    visual_quality: result.pageState?.visualQuality ?? null,
    contrast: gate?.sample?.contrast ?? null,
    signature_contrast: result.signature?.contrast ?? null,
    fit_bounds: result.pageState?.fitBounds ?? null,
    screenshot: result.screenshot,
    failure_reason: result.passed ? null : result.error ?? gate?.reason ?? 'target did not pass comparison gate'
  };
}

function stripLargeSignatureData(result) {
  const signature = result.signature
    ? Object.fromEntries(Object.entries(result.signature).filter(([key]) => key !== 'rgb'))
    : result.signature;
  return {
    ...result,
    signature
  };
}

function compareSignatures(left, right) {
  const leftRgb = left.signature?.rgb;
  const rightRgb = right.signature?.rgb;
  if (!leftRgb || !rightRgb || leftRgb.length !== rightRgb.length) {
    return {
      available: false,
      reason: 'signature arrays are missing or size-mismatched'
    };
  }
  if (left.signature.contrast <= 1 || right.signature.contrast <= 1) {
    return {
      available: false,
      reason: 'one or both canvas signatures have near-zero contrast',
      left_contrast: left.signature.contrast,
      right_contrast: right.signature.contrast
    };
  }

  let sumAbs = 0;
  let sumSquared = 0;
  let maxAbs = 0;
  let changedPixels = 0;
  const pixels = leftRgb.length / 3;
  for (let index = 0; index < leftRgb.length; index += 3) {
    const dr = Math.abs(leftRgb[index] - rightRgb[index]);
    const dg = Math.abs(leftRgb[index + 1] - rightRgb[index + 1]);
    const db = Math.abs(leftRgb[index + 2] - rightRgb[index + 2]);
    const pixelMeanAbs = (dr + dg + db) / 3;
    sumAbs += dr + dg + db;
    sumSquared += dr * dr + dg * dg + db * db;
    maxAbs = Math.max(maxAbs, dr, dg, db);
    if (pixelMeanAbs >= 12) changedPixels += 1;
  }

  const channels = leftRgb.length;
  const meanAbsRgb = sumAbs / channels;
  const rmsRgb = Math.sqrt(sumSquared / channels);
  return {
    available: true,
    signature_size: [signatureWidth, signatureHeight],
    mean_abs_rgb: Number(meanAbsRgb.toFixed(4)),
    rms_rgb: Number(rmsRgb.toFixed(4)),
    max_abs_rgb: maxAbs,
    changed_pixel_ratio: Number((changedPixels / pixels).toFixed(6)),
    similarity_score: Number(Math.max(0, 1 - meanAbsRgb / 255).toFixed(6))
  };
}

function buildPair(left, right) {
  const splatDelta = typeof left.splats === 'number' && typeof right.splats === 'number'
    ? left.splats - right.splats
    : null;
  return {
    pair: `${left.label} vs ${right.label}`,
    passed: left.passed && right.passed && splatDelta === 0,
    data_equivalence_passed: splatDelta === 0,
    signature_difference: compareSignatures(left, right),
    deltas: {
      splats: splatDelta,
      contrast: typeof left.pageState?.visualQualityGate?.sample?.contrast === 'number' && typeof right.pageState?.visualQualityGate?.sample?.contrast === 'number'
        ? Number((left.pageState.visualQualityGate.sample.contrast - right.pageState.visualQualityGate.sample.contrast).toFixed(4))
        : null
    },
    interpretation: 'Pixel signature difference is tracked for renderer-quality tuning. It is not a hard visual-parity gate for this early Gaussian projection milestone.'
  };
}

await ensureDevServer();
await mkdir(screenshotDir, { recursive: true });

const startedAt = performance.now();
const rawResults = [];
for (const target of targets) {
  rawResults.push(await runTarget(target, resolve(screenshotDir, `${target.label}.png`)));
}

const byLabel = Object.fromEntries(rawResults.map((result) => [result.label, result]));
const pairs = [
  buildPair(byLabel['ark-gaussian'], byLabel['aholo-adapter']),
  buildPair(byLabel['ark-gaussian'], byLabel['kellogg-independent']),
  buildPair(byLabel['aholo-adapter'], byLabel['kellogg-independent'])
];
const primarySignatureComparison = pairs[0]?.signature_difference?.available === true;
const gaussian = byLabel['ark-gaussian'];
const gaussianProjectionPassed = gaussian?.pipeline?.gaussianProjection === true
  && gaussian?.pipeline?.covarianceProjection === true
  && gaussian?.pipeline?.instancing === true;
const gaussianClipping = gaussian?.pageState?.renderInfo?.ellipse?.clipping;
const clippingPassed = gaussianClipping?.centerClip === true
  && gaussianClipping?.nearFarClip === true
  && gaussianClipping?.minClipW > 0
  && gaussianClipping?.offscreenPadding >= 1;
const allTargetsPassed = rawResults.every((result) => result.passed);
const dataEquivalencePassed = pairs.every((pair) => pair.data_equivalence_passed);

const report = {
  generated_at: new Date().toISOString(),
  target: 'ARK first-party Gaussian renderer visual comparison',
  timeout_ms: timeoutMs,
  signature: {
    width: signatureWidth,
    height: signatureHeight,
    visual_difference_gated: false
  },
  summary: {
    passed: allTargetsPassed && dataEquivalencePassed && gaussianProjectionPassed && clippingPassed && primarySignatureComparison,
    all_targets_passed: allTargetsPassed,
    data_equivalence_passed: dataEquivalencePassed,
    gaussian_projection_passed: gaussianProjectionPassed,
    clipping_passed: clippingPassed,
    primary_signature_comparison_passed: primarySignatureComparison,
    visual_difference_gated: false,
    duration_seconds: Number(((performance.now() - startedAt) / 1000).toFixed(3))
  },
  targets: rawResults.map(summarizeTarget),
  pairs,
  raw_results: rawResults.map(stripLargeSignatureData)
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({
  output: relative(process.cwd(), outputPath).replaceAll('\\', '/'),
  summary: report.summary,
  targets: report.targets.map((target) => ({
    label: target.label,
    passed: target.passed,
    renderer: target.renderer,
    visual_quality: target.visual_quality,
    splats: target.splats,
    signature_contrast: target.signature_contrast
  })),
  pairs: report.pairs.map((pair) => ({
    pair: pair.pair,
    passed: pair.passed,
    data_equivalence_passed: pair.data_equivalence_passed,
    signature_difference: pair.signature_difference
  }))
}, null, 2));

if (!report.summary.passed) {
  process.exitCode = 1;
}
