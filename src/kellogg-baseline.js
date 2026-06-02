import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';
import './styles.css';

const CONTRACT_URL = '/scenes/demo_room_001/meta/gaussian_data_contract_report.json';
const PLY_ASSETS = {
  ply: '/scenes/demo_room_001/gaussian/scene.ply',
  'ply-preview': '/scenes/demo_room_001/gaussian/scene-preview-100k.ply'
};
const VISUAL_QA_MIN_CONTRAST = 12;
const VISUAL_QA_SETTLE_FRAMES = 12;

const state = {
  viewer: null,
  activeInfo: null,
  visualQualityGate: createPendingVisualQuality('No scene loaded.'),
  fitTransform: null
};

function requiredElement(selector) {
  const element = document.querySelector(selector);
  if (!element) {
    throw new Error(`Missing UI element: ${selector}`);
  }
  return element;
}

function formatNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return '-';
  return value.toLocaleString('en-US', {
    maximumFractionDigits: digits
  });
}

function formatVec3(value) {
  return value.map((item) => formatNumber(item, 2)).join(', ');
}

function createPendingVisualQuality(reason) {
  return {
    status: 'pending',
    reason,
    checks: {},
    thresholds: {
      minContrast: VISUAL_QA_MIN_CONTRAST,
      settleFrames: VISUAL_QA_SETTLE_FRAMES
    },
    sample: null,
    evaluatedAtMs: null
  };
}

function createQualityCheck(passed, value, message) {
  return {
    passed,
    value,
    message
  };
}

function formatVisualQualityGate(gate) {
  if (gate.status === 'pending') return 'Pending';
  if (gate.status === 'unknown') return 'Unknown';
  const contrast = gate.sample ? formatNumber(gate.sample.contrast, 1) : '-';
  return `${gate.status === 'passed' ? 'Passed' : 'Failed'} (${contrast})`;
}

function createAppShell() {
  const app = requiredElement('#app');
  app.innerHTML = `
    <main class="browser-shell">
      <section class="viewer-stage">
        <div id="viewerHost" class="viewer-host"></div>
        <div class="viewport-badge">
          <span id="runtimeState">Booting</span>
          <span>Independent PLY baseline</span>
        </div>
      </section>

      <aside class="hud" aria-label="Independent Gaussian viewer baseline">
        <div class="brand">
          <p class="eyebrow">ARK-3DGS</p>
          <h1>Independent Baseline</h1>
          <p id="status" class="status">Preparing GaussianSplats3D runtime...</p>
        </div>

        <dl class="metrics">
          <div><dt>Scene</dt><dd id="sceneName">-</dd></div>
          <div><dt>Format</dt><dd id="formatState">-</dd></div>
          <div><dt>Splats</dt><dd id="splatCount">-</dd></div>
          <div><dt>SH Degree</dt><dd id="shDegree">-</dd></div>
          <div><dt>Dense Bounds</dt><dd id="denseBounds">-</dd></div>
          <div><dt>Fit Bounds</dt><dd id="fitBoundsState">-</dd></div>
          <div><dt>Visual QA</dt><dd id="visualQualityState">-</dd></div>
          <div><dt>Display Scale</dt><dd id="displayScale">-</dd></div>
          <div><dt>Source</dt><dd id="sourceState">Bundled PLY</dd></div>
          <div><dt>Renderer</dt><dd>@mkkellogg/gaussian-splats-3d</dd></div>
        </dl>
      </aside>
    </main>
  `;
}

async function loadJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status}`);
  }
  return await response.json();
}

function resolveSidecarBounds(contract) {
  const bounds = contract?.summary?.percentileBounds?.find((item) => item.id === 'broad_01_99');
  if (!bounds?.min || !bounds.max) {
    throw new Error('Missing broad_01_99 sidecar bounds in Gaussian data contract report.');
  }
  return {
    id: bounds.id,
    source: 'sidecar',
    min: bounds.min,
    max: bounds.max
  };
}

function computeFitTransform(bounds) {
  const size = [
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2]
  ];
  const center = [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2
  ];
  const maxDim = Math.max(...size);
  const displayScale = maxDim > 0 ? 4 / maxDim : 1;
  const fitRadius = Math.max(2.5, maxDim * displayScale * 0.75);
  const distance = Math.max(fitRadius * 3.6, 6);

  return {
    center,
    size,
    displayScale,
    fitRadius,
    distance,
    position: [
      -center[0] * displayScale,
      -center[1] * displayScale,
      -center[2] * displayScale
    ],
    scale: [displayScale, displayScale, displayScale],
    cameraPosition: [0, Math.sin(-0.2) * distance, -Math.cos(-0.2) * distance],
    cameraLookAt: [0, 0, 0]
  };
}

function getSplatCount() {
  const count = state.viewer?.splatMesh?.getSplatCount?.();
  return Number.isFinite(count) ? count : null;
}

function getCanvasInfo() {
  const canvas = document.querySelector('canvas');
  return canvas
    ? {
      width: canvas.width,
      height: canvas.height,
      clientWidth: canvas.clientWidth,
      clientHeight: canvas.clientHeight
    }
    : null;
}

function getCameraInfo() {
  const camera = state.viewer?.camera;
  if (!camera) return null;
  const target = state.viewer?.controls?.target;
  const distance = target ? camera.position.distanceTo(target) : null;
  return {
    fov: camera.fov ?? null,
    near: camera.near ?? null,
    far: camera.far ?? null,
    aspect: camera.aspect ?? null,
    up: [camera.up.x, camera.up.y, camera.up.z],
    position: [camera.position.x, camera.position.y, camera.position.z],
    target: target ? [target.x, target.y, target.z] : state.fitTransform?.cameraLookAt ?? [0, 0, 0],
    distance
  };
}

function publishDebugState(includeSample = false) {
  const host = requiredElement('#viewerHost');
  host.dataset.arkDebug = JSON.stringify({
    runtimeState: requiredElement('#runtimeState').textContent,
    status: requiredElement('#status').textContent,
    activeInfo: state.activeInfo,
    visualQualityGate: state.visualQualityGate,
    camera: getCameraInfo(),
    canvas: getCanvasInfo(),
    renderer: {
      id: 'gaussian-splats-3d',
      backend: '@mkkellogg/gaussian-splats-3d'
    },
    scene: {
      splats: getSplatCount(),
      splatCounts: getSplatCount(),
      sceneVersion: null
    },
    renderSample: includeSample ? sampleRender() : null
  });
}

function setLoading(message) {
  requiredElement('#runtimeState').textContent = 'Loading';
  requiredElement('#status').textContent = message;
  state.activeInfo = null;
  state.visualQualityGate = createPendingVisualQuality('Scene is loading.');
  requiredElement('#sceneName').textContent = '-';
  requiredElement('#formatState').textContent = '-';
  requiredElement('#splatCount').textContent = '-';
  requiredElement('#shDegree').textContent = '-';
  requiredElement('#denseBounds').textContent = '-';
  requiredElement('#fitBoundsState').textContent = '-';
  requiredElement('#visualQualityState').textContent = formatVisualQualityGate(state.visualQualityGate);
  requiredElement('#displayScale').textContent = '-';
  publishDebugState();
}

function setLoaded(info) {
  state.activeInfo = info;
  requiredElement('#runtimeState').textContent = 'Loaded';
  requiredElement('#status').textContent = `${info.name} loaded with independent Three.js Gaussian renderer.`;
  requiredElement('#sceneName').textContent = info.name;
  requiredElement('#formatState').textContent = info.format;
  requiredElement('#splatCount').textContent = formatNumber(info.splats, 0);
  requiredElement('#shDegree').textContent = String(info.shDegree);
  requiredElement('#denseBounds').textContent = `${formatVec3(info.denseMin)} / ${formatVec3(info.denseMax)}`;
  requiredElement('#fitBoundsState').textContent = `${info.fitBoundsId} (${info.fitBoundsSource})`;
  requiredElement('#displayScale').textContent = `${formatNumber(info.displayScale, 4)}x`;
  requiredElement('#sourceState').textContent = 'Bundled PLY';
  publishDebugState();
}

function setError(error) {
  const message = error instanceof Error ? error.message : String(error);
  requiredElement('#runtimeState').textContent = 'Error';
  requiredElement('#status').textContent = message;
  state.visualQualityGate = {
    status: 'failed',
    reason: message,
    checks: {},
    thresholds: {
      minContrast: VISUAL_QA_MIN_CONTRAST,
      settleFrames: VISUAL_QA_SETTLE_FRAMES
    },
    sample: null,
    evaluatedAtMs: null
  };
  requiredElement('#visualQualityState').textContent = formatVisualQualityGate(state.visualQualityGate);
  publishDebugState();
}

function sampleRender() {
  const canvas = document.querySelector('canvas');
  const gl = state.viewer?.renderer?.getContext?.()
    ?? canvas?.getContext('webgl2')
    ?? canvas?.getContext('webgl');
  if (!canvas || !gl) {
    return { status: 'unknown', averageRgb: [0, 0, 0], contrast: 0 };
  }

  state.viewer?.forceRenderNextFrame?.();
  state.viewer?.update?.();
  state.viewer?.render?.();

  const width = gl.drawingBufferWidth;
  const height = gl.drawingBufferHeight;
  const points = [
    [0.5, 0.5],
    [0.35, 0.5],
    [0.65, 0.5],
    [0.5, 0.35],
    [0.5, 0.65],
    [0.25, 0.25],
    [0.75, 0.25],
    [0.25, 0.75],
    [0.75, 0.75]
  ];
  const pixel = new Uint8Array(4);
  const values = [];
  for (const [nx, ny] of points) {
    gl.readPixels(
      Math.max(0, Math.min(width - 1, Math.floor(width * nx))),
      Math.max(0, Math.min(height - 1, Math.floor(height * ny))),
      1,
      1,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixel
    );
    values.push([pixel[0], pixel[1], pixel[2]]);
  }

  const average = values.reduce((acc, value) => {
    acc[0] += value[0];
    acc[1] += value[1];
    acc[2] += value[2];
    return acc;
  }, [0, 0, 0]).map((value) => value / values.length);

  const contrast = values.reduce((maxDistance, value) => {
    const distance = Math.abs(value[0] - average[0])
      + Math.abs(value[1] - average[1])
      + Math.abs(value[2] - average[2]);
    return Math.max(maxDistance, distance);
  }, 0);

  return {
    status: contrast > VISUAL_QA_MIN_CONTRAST ? 'visible' : 'empty',
    averageRgb: average,
    contrast
  };
}

async function waitForFrames(frames) {
  for (let index = 0; index < frames; index += 1) {
    await new Promise((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });
  }
}

async function runVisualQualityGate(startedAt) {
  try {
    await waitForFrames(VISUAL_QA_SETTLE_FRAMES);
    const sample = sampleRender();
    const canvas = getCanvasInfo();
    const info = state.activeInfo;

    const checks = {
      sceneLoaded: createQualityCheck(Boolean(info && info.splats > 0), info?.splats ?? null, 'Scene has renderable splats.'),
      canvasReady: createQualityCheck(
        Boolean(canvas && canvas.width > 0 && canvas.height > 0 && canvas.clientWidth > 0 && canvas.clientHeight > 0),
        canvas,
        'Renderer canvas has non-zero drawing and display size.'
      ),
      fitBoundsResolved: createQualityCheck(Boolean(info?.fitBoundsId), info?.fitBoundsId ?? null, 'Camera fit bounds are resolved.'),
      bundledSidecarApplied: createQualityCheck(
        !info || info.fitBoundsSource === 'sidecar',
        info ? `${info.fitBoundsId} (${info.fitBoundsSource})` : null,
        'Independent baseline should use ARK sidecar fit bounds for comparable framing.'
      ),
      renderVisible: createQualityCheck(sample.status === 'visible', sample.status, 'Pixel sample detects visible rendered content.'),
      contrastAboveThreshold: createQualityCheck(
        sample.contrast >= VISUAL_QA_MIN_CONTRAST,
        sample.contrast,
        `Pixel contrast is at least ${VISUAL_QA_MIN_CONTRAST}.`
      )
    };

    const passed = Object.values(checks).every((check) => check.passed);
    state.visualQualityGate = {
      status: passed ? 'passed' : 'failed',
      reason: passed ? 'Visual sample passed all runtime checks.' : 'One or more visual runtime checks failed.',
      checks,
      thresholds: {
        minContrast: VISUAL_QA_MIN_CONTRAST,
        settleFrames: VISUAL_QA_SETTLE_FRAMES
      },
      sample,
      evaluatedAtMs: Math.round(performance.now() - startedAt)
    };
  } catch (error) {
    state.visualQualityGate = {
      status: 'unknown',
      reason: String(error instanceof Error ? error.message : error),
      checks: {},
      thresholds: {
        minContrast: VISUAL_QA_MIN_CONTRAST,
        settleFrames: VISUAL_QA_SETTLE_FRAMES
      },
      sample: null,
      evaluatedAtMs: Math.round(performance.now() - startedAt)
    };
  }

  requiredElement('#visualQualityState').textContent = formatVisualQualityGate(state.visualQualityGate);
  publishDebugState();
}

async function boot() {
  createAppShell();
  const asset = new URLSearchParams(window.location.search).get('asset')?.toLowerCase() ?? 'ply-preview';
  const plyUrl = PLY_ASSETS[asset];
  if (!plyUrl) {
    throw new Error(`GaussianSplats3D independent baseline validates PLY assets only. Requested: ${asset}`);
  }

  const startedAt = performance.now();
  setLoading('Loading ARK Gaussian data contract...');
  const contract = await loadJson(CONTRACT_URL);
  const fitBounds = resolveSidecarBounds(contract);
  const transform = computeFitTransform(fitBounds);
  state.fitTransform = transform;

  setLoading('Loading PLY through GaussianSplats3D...');
  state.viewer = new GaussianSplats3D.Viewer({
    rootElement: requiredElement('#viewerHost'),
    cameraUp: [0, -1, 0],
    initialCameraPosition: transform.cameraPosition,
    initialCameraLookAt: transform.cameraLookAt,
    sharedMemoryForWorkers: false,
    enableSIMDInSort: false,
    gpuAcceleratedSort: false,
    integerBasedSort: false,
    optimizeSplatData: false,
    inMemoryCompressionLevel: 0,
    freeIntermediateSplatData: false,
    sphericalHarmonicsDegree: 0,
    ignoreDevicePixelRatio: true,
    useBuiltInControls: true,
    selfDrivenMode: true,
    renderMode: GaussianSplats3D.RenderMode.Always,
    sceneRevealMode: GaussianSplats3D.SceneRevealMode.Instant,
    webXRMode: GaussianSplats3D.WebXRMode.None,
    logLevel: GaussianSplats3D.LogLevel.None
  });

  await state.viewer.addSplatScene(plyUrl, {
    format: GaussianSplats3D.SceneFormat.Ply,
    splatAlphaRemovalThreshold: 0,
    showLoadingUI: false,
    progressiveLoad: false,
    position: transform.position,
    rotation: [0, 0, 0, 1],
    scale: transform.scale
  });
  state.viewer.start();

  const splats = getSplatCount() ?? contract?.summary?.count ?? 0;
  setLoaded({
    name: asset === 'ply-preview' ? 'GaussianSplats3D PLY preview baseline' : 'GaussianSplats3D PLY baseline',
    format: 'PLY',
    splats,
    shDegree: 0,
    denseMin: fitBounds.min,
    denseMax: fitBounds.max,
    displayScale: transform.displayScale,
    fitRadius: transform.fitRadius,
    fitBoundsId: fitBounds.id,
    fitBoundsSource: fitBounds.source,
    source: 'bundled'
  });
  await runVisualQualityGate(startedAt);
}

document.addEventListener('ark-3dgs-debug-request', () => {
  publishDebugState(true);
});

boot().catch((error) => {
  console.error(error);
  if (!document.querySelector('#app')?.children.length) {
    createAppShell();
  }
  setError(error);
});
