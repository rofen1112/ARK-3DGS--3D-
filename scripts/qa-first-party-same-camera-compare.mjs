import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const baseUrl = 'http://127.0.0.1:5173';
const outputPath = resolve(process.argv[2] ?? 'public/scenes/demo_room_001/meta/first_party_same_camera_comparison_report.json');
const screenshotDir = resolve(process.argv[3] ?? 'artifacts/first-party-same-camera');
const timeoutMs = Number(process.argv[4] ?? 300000);
const signatureWidth = 96;
const signatureHeight = 54;
const includeAholoSh3 = process.argv.includes('--include-aholo-sh3');
const pipelineCore = process.argv.includes('--pipeline-core');
const pipelineIsolation = pipelineCore || process.argv.includes('--pipeline-isolation');
const assetArg = process.argv.find((arg) => arg.startsWith('--asset='));
const asset = assetArg ? assetArg.slice('--asset='.length) : 'source-ply';

function targetUrl(params) {
  const query = new URLSearchParams({
    autoload: '1',
    asset,
    ...params
  });
  return `${baseUrl}/?${query.toString()}`;
}

const arkTargets = [
  {
    label: 'ark-gaussian',
    role: pipelineIsolation ? 'candidate-default' : 'candidate',
    url: targetUrl({ renderer: 'ark-gaussian' }),
    expectedRenderer: 'ark-gaussian-webgl2',
    requiresSignature: true
  },
  ...(pipelineIsolation
    ? [
      {
        label: 'ark-sort-source-order',
        role: 'sort-diagnostic',
        url: targetUrl({ renderer: 'ark-gaussian', arkDiagSort: 'source-order' }),
        expectedRenderer: 'ark-gaussian-webgl2',
        requiresSignature: true
      },
      {
        label: 'ark-composite-straight',
        role: 'composite-diagnostic',
        url: targetUrl({ renderer: 'ark-gaussian', arkDiagComposite: 'straight' }),
        expectedRenderer: 'ark-gaussian-webgl2',
        requiresSignature: true
      }
    ].concat(pipelineCore
      ? []
      : [
        {
          label: 'ark-sort-bucket-depth',
          role: 'sort-diagnostic',
          url: targetUrl({ renderer: 'ark-gaussian', arkDiagSort: 'bucket-depth' }),
          expectedRenderer: 'ark-gaussian-webgl2',
          requiresSignature: true
        },
        {
          label: 'ark-sort-exact-depth',
          role: 'sort-diagnostic',
          url: targetUrl({ renderer: 'ark-gaussian', arkDiagSort: 'exact-depth' }),
          expectedRenderer: 'ark-gaussian-webgl2',
          requiresSignature: true
        },
        {
          label: 'ark-projection-no-preblur',
          role: 'projection-diagnostic',
          url: targetUrl({ renderer: 'ark-gaussian', arkDiagProjection: 'no-preblur' }),
          expectedRenderer: 'ark-gaussian-webgl2',
          requiresSignature: true
        },
        {
          label: 'ark-projection-unit-focal',
          role: 'projection-diagnostic',
          url: targetUrl({ renderer: 'ark-gaussian', arkDiagProjection: 'unit-focal' }),
          expectedRenderer: 'ark-gaussian-webgl2',
          requiresSignature: true
        },
        {
          label: 'ark-projection-compact-kernel',
          role: 'projection-diagnostic',
          url: targetUrl({ renderer: 'ark-gaussian', arkDiagProjection: 'compact-kernel' }),
          expectedRenderer: 'ark-gaussian-webgl2',
          requiresSignature: true
        }
      ])
    : [])
];

const targets = [
  ...arkTargets,
  {
    label: 'aholo-adapter-sh0',
    role: 'reference',
    url: targetUrl({ sh: '0' }),
    expectedRenderer: 'aholo',
    requiresSignature: true
  },
  ...(includeAholoSh3
    ? [{
      label: 'aholo-adapter-sh3',
      role: 'sh3-diagnostic-reference',
      url: targetUrl({ sh: '3' }),
      expectedRenderer: 'aholo',
      requiresSignature: true
    }]
    : [])
];

async function ensureDevServer() {
  try {
    const response = await fetch(`${baseUrl}/`);
    if (response.ok) return;
    throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    throw new Error(`ARK dev server is not reachable at ${baseUrl}. Start it with npm.cmd run dev -- --port 5173. ${error instanceof Error ? error.message : String(error)}`);
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

function pageStateExpression(includeSample = false) {
  return `(() => {
    const host = document.querySelector('#viewerHost');
    let debug = null;
    try {
      const raw = host?.getAttribute('data-ark-debug');
      debug = raw ? JSON.parse(raw) : null;
    } catch (error) {
      debug = { parseError: String(error) };
    }
    const canvas = document.querySelector('canvas');
    return {
      runtime: document.querySelector('#runtimeState')?.textContent ?? null,
      status: document.querySelector('#status')?.textContent ?? null,
      visualQuality: document.querySelector('#visualQualityState')?.textContent ?? null,
      fitBounds: document.querySelector('#fitBoundsState')?.textContent ?? null,
      asset: document.querySelector('#assetState')?.textContent ?? null,
      coverage: document.querySelector('#coverageState')?.textContent ?? null,
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
      splattingPlugin: debug?.splattingPlugin ?? null,
      splat: debug?.splat ?? null,
      renderSample: ${includeSample ? 'debug?.renderSample ?? null' : 'null'}
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
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  return pageState ?? await evaluatePageState(cdp, false);
}

async function waitForVisualOrLoaded(cdp, waitMs) {
  const started = Date.now();
  let pageState = null;
  while (Date.now() - started < waitMs) {
    pageState = await evaluatePageState(cdp, false);
    const gateStatus = pageState?.visualQualityGate?.status;
    if (pageState?.runtime === 'Loaded' && gateStatus && gateStatus !== 'pending') return pageState;
    if (pageState?.runtime === 'Error') return pageState;
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  return pageState ?? await evaluatePageState(cdp, false);
}

async function waitForRenderSettle(cdp, delayMs = 1800) {
  await cdp.send('Runtime.evaluate', {
    expression: `new Promise((resolve) => setTimeout(resolve, ${Math.max(1, Math.round(delayMs))}))`,
    awaitPromise: true,
    returnByValue: true
  });
}

async function setCamera(cdp, cameraDetail) {
  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      document.dispatchEvent(new CustomEvent('ark-3dgs-camera-set', { detail: ${JSON.stringify(cameraDetail)} }));
      window.__ARK_3DGS__?.forceRenderFrames?.(${cameraDetail.frames ?? 60});
      return true;
    })()`,
    returnByValue: true
  });
  await waitForRenderSettle(cdp);
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

async function captureScreenshot(cdp, screenshotPath) {
  const screenshot = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false
  });
  await writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'));
}

function normalizeCamera(camera) {
  if (!camera?.position || !camera?.target) return null;
  return {
    position: camera.position,
    target: camera.target,
    distance: camera.distance,
    fov: camera.fov,
    near: camera.near,
    far: camera.far,
    up: camera.up
  };
}

function sameCameraDetail(camera, frames = 60) {
  return {
    position: camera.position,
    target: camera.target,
    distance: camera.distance,
    frames
  };
}

function cameraDelta(left, right) {
  if (!left || !right) return null;
  const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  return {
    position: Number(distance(left.position, right.position).toFixed(6)),
    target: Number(distance(left.target, right.target).toFixed(6)),
    distance: Number(Math.abs((left.distance ?? 0) - (right.distance ?? 0)).toFixed(6))
  };
}

async function runTarget(target, cameraDetail, screenshotPath) {
  const port = 16000 + Math.floor(Math.random() * 5000);
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

    const loadedState = await waitForLoadedScene(cdp, timeoutMs);
    if (loadedState?.runtime !== 'Loaded' || !(loadedState?.activeInfo?.splats > 0)) {
      cdp.ws.close();
      return {
        label: target.label,
        role: target.role,
        url: target.url,
        passed: false,
        screenshot: relative(process.cwd(), screenshotPath).replaceAll('\\', '/'),
        pageState: loadedState,
        signature: null,
        error: loadedState?.status ?? 'target did not load',
        chromeErrors: chromeErrors.join('').slice(-4000)
      };
    }

    const canonicalCamera = normalizeCamera(loadedState.camera);
    const appliedCamera = cameraDetail ?? sameCameraDetail(canonicalCamera, 60);
    await setCamera(cdp, appliedCamera);
    await waitForVisualOrLoaded(cdp, Math.min(timeoutMs, 60000));
    const pageState = await evaluatePageState(cdp, true);
    await captureScreenshot(cdp, screenshotPath);
    const signature = await evaluateCanvasSignature(cdp);
    const rendererId = pageState?.renderer?.id ?? null;
    const rendererPassed = !target.expectedRenderer || rendererId === target.expectedRenderer;
    const signatureAvailable = signature?.available === true && signature.contrast > 1;
    const visualResolved = ['passed', 'failed', 'unknown'].includes(pageState?.visualQualityGate?.status);
    const finalCamera = normalizeCamera(pageState?.camera);

    cdp.ws.close();
    return {
      label: target.label,
      role: target.role,
      url: target.url,
      screenshot: relative(process.cwd(), screenshotPath).replaceAll('\\', '/'),
      passed: pageState?.runtime === 'Loaded'
        && rendererPassed
        && visualResolved
        && (!target.requiresSignature || signatureAvailable),
      checks: {
        loaded: pageState?.runtime === 'Loaded',
        expectedRenderer: rendererPassed,
        visualGateResolved: visualResolved,
        signatureRequired: target.requiresSignature,
        signatureAvailable,
        cameraApplied: cameraDelta(appliedCamera, finalCamera)?.position === 0
          && cameraDelta(appliedCamera, finalCamera)?.target === 0
      },
      renderer: rendererId,
      pipeline: pageState?.pipeline ?? null,
      pageState,
      initialCamera: canonicalCamera,
      camera: finalCamera,
      cameraDeltaFromCanonical: cameraDelta(appliedCamera, finalCamera),
      signature,
      splats: pageState?.activeInfo?.splats ?? null,
      chromeErrors: chromeErrors.join('').slice(-4000)
    };
  } catch (error) {
    return {
      label: target.label,
      role: target.role,
      url: target.url,
      screenshot: relative(process.cwd(), screenshotPath).replaceAll('\\', '/'),
      passed: false,
      checks: {
        loaded: false,
        expectedRenderer: false,
        visualGateResolved: false,
        signatureAvailable: false,
        cameraApplied: false
      },
      renderer: null,
      pipeline: null,
      pageState: null,
      initialCamera: null,
      camera: null,
      signature: null,
      splats: null,
      error: String(error instanceof Error ? error.message : error),
      chromeErrors: chromeErrors.join('').slice(-4000)
    };
  } finally {
    chrome.kill();
  }
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

function summarizeTarget(result) {
  const state = result.pageState;
  return {
    label: result.label,
    role: result.role,
    passed: result.passed,
    renderer: result.renderer,
    splats: state?.activeInfo?.splats ?? null,
    sh_degree: state?.activeInfo?.shDegree ?? null,
    asset: state?.asset ?? null,
    coverage: state?.coverage ?? null,
    visual_quality: state?.visualQuality ?? null,
    signature_contrast: result.signature?.contrast ?? null,
    fit_bounds: state?.fitBounds ?? null,
    pipeline: result.pipeline,
    render_info: {
      sorting: state?.pipeline?.sorting ?? null,
      projectionModel: state?.pipeline?.projectionModel ?? null,
      projectionProfile: state?.pipeline?.projectionProfile ?? null,
      composite: state?.pipeline?.composite ?? null,
      shading: state?.pipeline?.shading ?? null,
      sourceShDegree: state?.pipeline?.sourceShDegree ?? null,
      renderShDegree: state?.pipeline?.renderShDegree ?? null,
      renderShRestCount: state?.pipeline?.renderShRestCount ?? null,
      diagnostics: state?.pipeline?.diagnostics ?? null,
      sortMode: state?.renderInfo?.sortMode ?? null,
      sortedSplats: state?.renderInfo?.sortedSplats ?? null,
      renderedSplats: state?.renderInfo?.renderedSplats ?? null,
      ellipse: state?.renderInfo?.ellipse ?? null
    },
    camera: result.camera,
    screenshot: result.screenshot,
    failure_reason: result.passed ? null : result.error ?? state?.visualQualityGate?.reason ?? 'target did not pass same-camera gate'
  };
}

function buildPair(left, right) {
  const leftInfo = left.pageState?.activeInfo ?? null;
  const rightInfo = right.pageState?.activeInfo ?? null;
  const splatDelta = typeof left.splats === 'number' && typeof right.splats === 'number'
    ? left.splats - right.splats
    : null;
  const leftInvalidSkipped = leftInfo?.assetRole === 'source'
    && typeof leftInfo?.sourceSplats === 'number'
    && typeof leftInfo?.splats === 'number'
    ? leftInfo.sourceSplats - leftInfo.splats
    : null;
  const splatDeltaExplainedByInvalidSkip = typeof splatDelta === 'number'
    && typeof leftInvalidSkipped === 'number'
    && typeof rightInfo?.splats === 'number'
    && leftInfo?.sourceSplats === rightInfo.splats
    && splatDelta === -leftInvalidSkipped;
  return {
    pair: `${left.label} vs ${right.label}`,
    passed: left.passed && right.passed && (splatDelta === 0 || splatDeltaExplainedByInvalidSkip),
    data_equivalence_passed: splatDelta === 0,
    data_delta_explained_by_invalid_skip: splatDeltaExplainedByInvalidSkip,
    invalid_splats_skipped_by_candidate: leftInvalidSkipped,
    camera_delta: cameraDelta(left.camera, right.camera),
    signature_difference: compareSignatures(left, right),
    deltas: {
      splats: splatDelta,
      signature_contrast: typeof left.signature?.contrast === 'number' && typeof right.signature?.contrast === 'number'
        ? Number((left.signature.contrast - right.signature.contrast).toFixed(4))
        : null
    },
    interpretation: 'Same-camera signature difference is diagnostic only. Use it to decide whether color, projection, or sorting needs the next focused repair.'
  };
}

function metric(pair) {
  return pair.signature_difference?.available
    ? pair.signature_difference.mean_abs_rgb
    : Number.POSITIVE_INFINITY;
}

function summarizePairForPipeline(pair) {
  return {
    pair: pair.pair,
    available: pair.signature_difference?.available === true,
    mean_abs_rgb: pair.signature_difference?.mean_abs_rgb ?? null,
    rms_rgb: pair.signature_difference?.rms_rgb ?? null,
    max_abs_rgb: pair.signature_difference?.max_abs_rgb ?? null,
    changed_pixel_ratio: pair.signature_difference?.changed_pixel_ratio ?? null,
    similarity_score: pair.signature_difference?.similarity_score ?? null,
    splat_delta: pair.deltas.splats,
    data_delta_explained_by_invalid_skip: pair.data_delta_explained_by_invalid_skip
  };
}

await ensureDevServer();
await mkdir(screenshotDir, { recursive: true });

const startedAt = performance.now();
const canonicalTarget = targets[0];
const canonicalResult = await runTarget(canonicalTarget, null, resolve(screenshotDir, `${canonicalTarget.label}.png`));
const canonicalCamera = normalizeCamera(canonicalResult.camera);
const canonicalCameraDetail = canonicalCamera ? sameCameraDetail(canonicalCamera, 75) : null;
const rawResults = [canonicalResult];

for (const target of targets.slice(1)) {
  rawResults.push(await runTarget(target, canonicalCameraDetail, resolve(screenshotDir, `${target.label}.png`)));
}

const byLabel = Object.fromEntries(rawResults.map((result) => [result.label, result]));
const arkResults = arkTargets
  .map((target) => byLabel[target.label])
  .filter(Boolean);
const arkDefaultResult = byLabel[canonicalTarget.label];
const aholoSh0Result = byLabel['aholo-adapter-sh0'];
const aholoSh3Result = byLabel['aholo-adapter-sh3'];
const pairs = [];

if (aholoSh0Result) {
  for (const arkResult of arkResults) {
    pairs.push(buildPair(arkResult, aholoSh0Result));
  }
}

if (pipelineIsolation && arkDefaultResult) {
  for (const arkResult of arkResults.slice(1)) {
    pairs.push(buildPair(arkResult, arkDefaultResult));
  }
}

if (includeAholoSh3 && aholoSh3Result) {
  for (const arkResult of arkResults) {
    pairs.push(buildPair(arkResult, aholoSh3Result));
  }
  if (aholoSh0Result) {
    pairs.push(buildPair(aholoSh0Result, aholoSh3Result));
  }
}
const sameCameraApplied = canonicalCameraDetail
  && rawResults.every((result) => {
    const delta = cameraDelta(canonicalCameraDetail, result.camera);
    return delta?.position === 0 && delta?.target === 0;
  });
const allTargetsLoaded = rawResults.every((result) => result.pageState?.runtime === 'Loaded');
const allTargetsPassed = rawResults.every((result) => result.passed);
const primaryPair = pairs.find((pair) => pair.pair === `${canonicalTarget.label} vs aholo-adapter-sh0`) ?? pairs[0];
const arkVsReferencePairs = pairs.filter((pair) => pair.pair.endsWith(' vs aholo-adapter-sh0'));
const arkVsDefaultPairs = pairs.filter((pair) => pair.pair.endsWith(` vs ${canonicalTarget.label}`));
const bestReferenceMatch = arkVsReferencePairs
  .filter((pair) => pair.signature_difference?.available === true)
  .sort((left, right) => metric(left) - metric(right))[0] ?? null;

const report = {
  generated_at: new Date().toISOString(),
  target: 'ARK first-party Gaussian same-camera comparison',
  asset,
  timeout_ms: timeoutMs,
  signature: {
    width: signatureWidth,
    height: signatureHeight,
    visual_difference_gated: false
  },
  canonical_camera_source: 'ark-gaussian',
  canonical_camera: canonicalCamera,
  pipeline_isolation: {
    enabled: pipelineIsolation,
    mode: pipelineCore ? 'core' : pipelineIsolation ? 'exhaustive' : 'disabled',
    diagnostic_target_count: Math.max(0, arkTargets.length - 1),
    default_target: canonicalTarget.label,
    reference_target: 'aholo-adapter-sh0',
    best_reference_match: bestReferenceMatch ? summarizePairForPipeline(bestReferenceMatch) : null,
    ark_variant_deltas_from_default: arkVsDefaultPairs.map(summarizePairForPipeline)
  },
  sh3_diagnostic: {
    enabled: includeAholoSh3,
    target_label: includeAholoSh3 ? 'aholo-adapter-sh3' : null,
    note: 'Aholo SH3 is an optional reference path for color diagnostics only; it is not an ARK renderer implementation.'
  },
  summary: {
    passed: allTargetsLoaded && sameCameraApplied && primaryPair?.signature_difference?.available === true,
    all_targets_passed: allTargetsPassed,
    all_targets_loaded: allTargetsLoaded,
    same_camera_applied: sameCameraApplied === true,
    primary_signature_comparison_available: primaryPair?.signature_difference?.available === true,
    primary_mean_abs_rgb: primaryPair?.signature_difference?.mean_abs_rgb ?? null,
    primary_similarity_score: primaryPair?.signature_difference?.similarity_score ?? null,
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
    splats: target.splats,
    sh_degree: target.sh_degree,
    visual_quality: target.visual_quality,
    signature_contrast: target.signature_contrast,
    screenshot: target.screenshot
  })),
  pairs: report.pairs.map((pair) => ({
    pair: pair.pair,
    passed: pair.passed,
    data_equivalence_passed: pair.data_equivalence_passed,
    data_delta_explained_by_invalid_skip: pair.data_delta_explained_by_invalid_skip,
    invalid_splats_skipped_by_candidate: pair.invalid_splats_skipped_by_candidate,
    camera_delta: pair.camera_delta,
    signature_difference: pair.signature_difference
  }))
}, null, 2));

if (!report.summary.passed) {
  process.exitCode = 1;
}
