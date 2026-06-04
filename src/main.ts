import { AholoRendererBackend } from './sdk/aholo/AholoRendererBackend';
import { ArkGaussianRendererBackend } from './sdk/ark/ArkGaussianRendererBackend';
import { ArkPointRendererBackend } from './sdk/ark/ArkPointRendererBackend';
import { MutableVec3 } from './sdk/math';
import type {
  ArkGaussianAsset,
  ArkFitBounds,
  ArkLoadedSceneInfo,
  ArkQualityGateCheck,
  ArkRenderSample,
  ArkRendererBackend,
  ArkSceneManifest,
  ArkVec3,
  ArkVisualQualityGate
} from './sdk/types';
import './styles.css';

type Vec3Tuple = [number, number, number];

type ArkDebugCameraSetDetail = {
  position?: ArkVec3;
  target?: ArkVec3;
  distance?: number;
  frames?: number;
};

type ArkDebugLoadUrlDetail = {
  url?: string;
  name?: string;
  filename?: string;
  source?: ArkLoadedSceneInfo['source'];
  fitBounds?: ArkFitBounds;
};

declare global {
  interface Window {
    __ARK_3DGS__?: ArkGaussianBrowser;
  }
}

const SCENE_MANIFEST_URL = '/scenes/demo_room_001/manifest.json';
const GAUSSIAN_CONTRACT_REPORT_URL = '/scenes/demo_room_001/meta/gaussian_data_contract_report.json';
const DEFAULT_ACCEPT = '.ply,.spz,.splat,.ksplat,.sog,.lcc,.esz,.zip,.json';
const VISUAL_QA_MIN_CONTRAST = 12;
const VISUAL_QA_SETTLE_FRAMES = 8;
const VISUAL_QA_LARGE_SCENE_SPLAT_THRESHOLD = 400_000;
const VISUAL_QA_LARGE_SCENE_SETTLE_FRAMES = 1;
const INITIAL_RENDER_BURST_FRAMES = 120;
const LARGE_SCENE_INITIAL_RENDER_BURST_FRAMES = 2;

type GaussianDataContractReport = {
  summary?: {
    percentileBounds?: Array<{
      id: string;
      min: ArkVec3;
      max: ArkVec3;
    }>;
  };
};

function requiredElement<T extends Element>(selector: string) {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing UI element: ${selector}`);
  }
  return element;
}

async function loadJson<T>(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status}`);
  }
  return (await response.json()) as T;
}

function resolveSceneUrl(manifestUrl: string, relativeUrl: string) {
  return new URL(relativeUrl, new URL(manifestUrl, window.location.origin)).pathname;
}

function formatNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) return '-';
  return value.toLocaleString('en-US', {
    maximumFractionDigits: digits
  });
}

function formatVec3(value: Vec3Tuple) {
  return value.map((item) => formatNumber(item, 2)).join(', ');
}

function isVec3(value: unknown): value is ArkVec3 {
  return Array.isArray(value)
    && value.length === 3
    && value.every((item) => typeof item === 'number' && Number.isFinite(item));
}

function vec3Distance(a: ArkVec3, b: ArkVec3) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function deriveYawPitch(position: ArkVec3, target: ArkVec3) {
  const dx = target[0] - position[0];
  const dy = target[1] - position[1];
  const dz = target[2] - position[2];
  const length = Math.max(Math.hypot(dx, dy, dz), 0.0001);
  const fy = dy / length;
  return {
    yaw: Math.atan2(-dx / length, -dz / length),
    pitch: Math.asin(Math.max(-1, Math.min(1, -fy)))
  };
}

function createPendingVisualQuality(reason: string, settleFrames = VISUAL_QA_SETTLE_FRAMES): ArkVisualQualityGate {
  return {
    status: 'pending',
    reason,
    checks: {},
    thresholds: {
      minContrast: VISUAL_QA_MIN_CONTRAST,
      settleFrames
    },
    sample: null,
    evaluatedAtMs: null
  };
}

function createQualityCheck(passed: boolean, value: unknown, message: string): ArkQualityGateCheck {
  return {
    passed,
    value,
    message
  };
}

function formatVisualQualityGate(gate: ArkVisualQualityGate) {
  if (gate.status === 'pending') return 'Pending';
  if (gate.status === 'unknown') return 'Unknown';
  const contrast = gate.sample ? formatNumber(gate.sample.contrast, 1) : '-';
  return `${gate.status === 'passed' ? 'Passed' : 'Failed'} (${contrast})`;
}

function getBundledAssetOverride() {
  const asset = new URLSearchParams(window.location.search).get('asset')?.toLowerCase();
  return asset ?? null;
}

function selectManifestGaussianAsset(manifest: ArkSceneManifest, requestedAsset: string | null): ArkGaussianAsset {
  const assets = manifest.gaussians?.items ?? [];
  const defaultId = manifest.gaussians?.default;
  const aliasToId: Record<string, string | undefined> = {
    default: defaultId,
    runtime: defaultId,
    sog: 'runtime-sog',
    spz: 'runtime-spz',
    ply: 'source-ply',
    source: 'source-ply',
    'source-ply': 'source-ply',
    preview: 'preview-ply',
    'ply-preview': 'preview-ply',
    'preview-ply': 'preview-ply'
  };
  const candidate = requestedAsset ? (aliasToId[requestedAsset] ?? requestedAsset) : defaultId;

  const selected = assets.find((asset) => asset.id === candidate)
    ?? (requestedAsset ? assets.find((asset) => asset.type === requestedAsset && asset.role === 'runtime') : undefined)
    ?? (defaultId ? assets.find((asset) => asset.id === defaultId) : undefined)
    ?? manifest.gaussian;

  if (!selected?.url) {
    throw new Error(`Scene manifest does not define a Gaussian asset for "${requestedAsset ?? 'default'}".`);
  }

  return selected;
}

function createAppShell() {
  const app = requiredElement<HTMLDivElement>('#app');
  app.innerHTML = `
    <main class="browser-shell">
      <section class="viewer-stage">
        <div id="viewerHost" class="viewer-host"></div>
        <div class="viewport-badge">
          <span id="runtimeState">Booting</span>
          <span id="cameraMode">Free browse</span>
        </div>
      </section>

      <aside class="hud" aria-label="ARK-3DGS browser controls">
        <div class="brand">
          <p class="eyebrow">ARK-3DGS</p>
          <h1>Gaussian Browser</h1>
          <p id="status" class="status">Preparing local 3DGS runtime...</p>
        </div>

        <div class="controls">
          <button id="loadBundled" type="button">Load Bundled Scene</button>
          <label class="file-button">
            <input id="fileInput" type="file" accept="${DEFAULT_ACCEPT}" />
            Open Local Model
          </label>
          <button id="resetView" type="button">Reset View</button>
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
          <div><dt>Source</dt><dd id="sourceState">-</dd></div>
          <div><dt>Asset</dt><dd id="assetState">-</dd></div>
          <div><dt>Coverage</dt><dd id="coverageState">-</dd></div>
          <div><dt>Controls</dt><dd>Drag / wheel / WASD / Q / E</dd></div>
        </dl>
      </aside>
    </main>
  `;
}

class ArkGaussianBrowser {
  private readonly host = requiredElement<HTMLDivElement>('#viewerHost');
  private readonly statusEl = requiredElement<HTMLParagraphElement>('#status');
  private readonly runtimeStateEl = requiredElement<HTMLElement>('#runtimeState');
  private readonly cameraModeEl = requiredElement<HTMLElement>('#cameraMode');
  private readonly sceneNameEl = requiredElement<HTMLElement>('#sceneName');
  private readonly formatStateEl = requiredElement<HTMLElement>('#formatState');
  private readonly splatCountEl = requiredElement<HTMLElement>('#splatCount');
  private readonly shDegreeEl = requiredElement<HTMLElement>('#shDegree');
  private readonly denseBoundsEl = requiredElement<HTMLElement>('#denseBounds');
  private readonly fitBoundsStateEl = requiredElement<HTMLElement>('#fitBoundsState');
  private readonly visualQualityStateEl = requiredElement<HTMLElement>('#visualQualityState');
  private readonly displayScaleEl = requiredElement<HTMLElement>('#displayScale');
  private readonly sourceStateEl = requiredElement<HTMLElement>('#sourceState');
  private readonly assetStateEl = requiredElement<HTMLElement>('#assetState');
  private readonly coverageStateEl = requiredElement<HTMLElement>('#coverageState');
  private readonly loadBundledButton = requiredElement<HTMLButtonElement>('#loadBundled');
  private readonly fileInput = requiredElement<HTMLInputElement>('#fileInput');
  private readonly resetViewButton = requiredElement<HTMLButtonElement>('#resetView');

  private readonly renderer: ArkRendererBackend;
  private readonly target = new MutableVec3(0, 0, 0);
  private readonly cameraPosition = new MutableVec3(0, 0, 0);
  private readonly cameraTarget = new MutableVec3(0, 0, 0);
  private readonly cameraOffset = new MutableVec3(0, 0, 0);
  private readonly viewForward = new MutableVec3(0, 0, 0);
  private readonly moveForward = new MutableVec3(0, 0, 0);
  private readonly moveRight = new MutableVec3(0, 0, 0);

  private activeInfo: ArkLoadedSceneInfo | null = null;
  private renderFrame = 0;
  private renderBurstFrame = 0;
  private renderBurstRemaining = 0;
  private motionFrame = 0;
  private previousTime = 0;
  private dragging = false;
  private previousPointerX = 0;
  private previousPointerY = 0;
  private yaw = Math.PI;
  private pitch = -0.18;
  private distance = 5;
  private fitRadius = 3;
  private visualQualityGate = createPendingVisualQuality('No scene loaded.');
  private readonly keys = new Set<string>();

  constructor() {
    const rendererId = new URLSearchParams(window.location.search).get('renderer');
    this.renderer = rendererId === 'ark-gaussian'
      ? new ArkGaussianRendererBackend(this.host)
      : rendererId === 'ark-point'
        ? new ArkPointRendererBackend(this.host)
        : new AholoRendererBackend(this.host);
    this.renderer.setRenderRequestHandler(() => this.scheduleRender());
    document.addEventListener('ark-3dgs-debug-request', () => {
      this.publishDebugState(true);
    });
    document.addEventListener('ark-3dgs-camera-set', (event) => {
      this.setDebugCamera((event as CustomEvent<ArkDebugCameraSetDetail>).detail);
    });
    document.addEventListener('ark-3dgs-debug-load-url', (event) => {
      void this.loadDebugUrl((event as CustomEvent<ArkDebugLoadUrlDetail>).detail);
    });
    this.configureInput();
    this.configureUi();
    this.applyCamera();
    this.scheduleRender();
    this.publishDebugState();
  }

  async boot() {
    this.runtimeStateEl.textContent = 'Ready';
    this.statusEl.textContent = 'Ready. Load the bundled scene or open a local Gaussian model.';
    this.publishDebugState();
    const params = new URLSearchParams(window.location.search);
    if (params.get('autoload') === '1') {
      await this.loadBundledScene();
    }
  }

  getDebugState() {
    const rendererState = this.renderer.getDebugState(false);
    return {
      runtimeState: this.runtimeStateEl.textContent,
      status: this.statusEl.textContent,
      activeInfo: this.activeInfo,
      visualQualityGate: this.visualQualityGate,
      ...rendererState,
      camera: {
        ...rendererState.camera,
        target: this.target.toTuple(),
        yaw: this.yaw,
        pitch: this.pitch,
        distance: this.distance
      }
    };
  }

  forceRenderFrames(frames = 90) {
    this.renderBurst(frames);
  }

  async loadDebugUrl(detail?: ArkDebugLoadUrlDetail) {
    if (!detail?.url) return;
    const source = detail.source === 'bundled' ? 'bundled' : 'local';
    const filename = detail.filename ?? detail.url;
    const name = detail.name ?? filename.split('/').pop() ?? 'Debug Gaussian';
    await this.runLoad(() => this.loadSplatSource({
      input: detail.url as string,
      name,
      filename,
      source,
      fitBounds: detail.fitBounds
    }));
  }

  setDebugCamera(detail?: ArkDebugCameraSetDetail) {
    if (!detail) return;
    const position = isVec3(detail.position) ? detail.position : this.cameraPosition.toTuple();
    const target = isVec3(detail.target) ? detail.target : this.cameraTarget.toTuple();
    const derivedDistance = vec3Distance(position, target);
    const requestedDistance = detail.distance;
    const distance = typeof requestedDistance === 'number' && Number.isFinite(requestedDistance) && requestedDistance > 0
      ? requestedDistance
      : Math.max(derivedDistance, 0.0001);
    const frames = typeof detail.frames === 'number' && Number.isFinite(detail.frames)
      ? Math.max(1, Math.round(detail.frames))
      : 45;
    const orientation = deriveYawPitch(position, target);

    this.cameraPosition.set(position[0], position[1], position[2]);
    this.cameraTarget.set(target[0], target[1], target[2]);
    this.target.set(target[0], target[1], target[2]);
    this.distance = distance;
    this.yaw = orientation.yaw;
    this.pitch = orientation.pitch;
    this.renderer.setCameraLookAt(position, target, distance);
    this.renderer.invalidate();
    this.renderer.resize();
    this.renderer.render();
    this.renderBurst(frames);
    this.publishDebugState(true);
  }

  getCompactDebugState(includeSample = false) {
    const rendererState = this.renderer.getDebugState(includeSample);
    return {
      runtimeState: this.runtimeStateEl.textContent,
      status: this.statusEl.textContent,
      activeInfo: this.activeInfo,
      visualQualityGate: this.visualQualityGate,
      ...rendererState,
      camera: {
        ...rendererState.camera,
        target: this.target.toTuple(),
        yaw: this.yaw,
        pitch: this.pitch,
        distance: this.distance
      }
    };
  }

  sampleRender(): ArkRenderSample {
    return this.renderer.sampleRender();
  }

  private configureUi() {
    this.loadBundledButton.addEventListener('click', () => {
      void this.runLoad(() => this.loadBundledScene());
    });

    this.resetViewButton.addEventListener('click', () => {
      this.resetView();
      this.scheduleRender();
    });

    this.fileInput.addEventListener('change', () => {
      const file = this.fileInput.files?.[0];
      if (!file) return;
      void this.runLoad(() => this.loadFile(file));
      this.fileInput.value = '';
    });
  }

  private async runLoad(action: () => Promise<void>) {
    try {
      await action();
    } catch (error) {
      console.error(error);
      this.runtimeStateEl.textContent = 'Error';
      this.statusEl.textContent = String(error instanceof Error ? error.message : error);
      this.publishDebugState();
    }
  }

  private configureInput() {
    this.host.addEventListener('pointerdown', (event) => {
      this.dragging = true;
      this.previousPointerX = event.clientX;
      this.previousPointerY = event.clientY;
      this.host.setPointerCapture(event.pointerId);
    });

    this.host.addEventListener('pointerup', (event) => {
      this.dragging = false;
      this.host.releasePointerCapture(event.pointerId);
    });

    this.host.addEventListener('pointermove', (event) => {
      if (!this.dragging) return;
      const dx = event.clientX - this.previousPointerX;
      const dy = event.clientY - this.previousPointerY;
      this.previousPointerX = event.clientX;
      this.previousPointerY = event.clientY;
      this.yaw += dx * 0.006;
      this.pitch = Math.max(-1.3, Math.min(1.3, this.pitch - dy * 0.004));
      this.applyCamera();
      this.scheduleRender();
    });

    this.host.addEventListener('wheel', (event) => {
      event.preventDefault();
      const dollyDistance = -event.deltaY * 0.002 * this.fitRadius;
      this.updateViewForward(this.viewForward);
      this.cameraPosition.add(this.viewForward.clone().multiplyScalar(dollyDistance));
      this.applyCamera();
      this.scheduleRender();
    }, { passive: false });

    this.host.addEventListener('dblclick', () => {
      this.resetView();
      this.scheduleRender();
    });

    window.addEventListener('keydown', (event) => {
      this.keys.add(event.key.toLowerCase());
      this.startMotionLoop();
    });

    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.key.toLowerCase());
    });

    window.addEventListener('resize', () => {
      this.renderer.resize();
      this.applyCamera();
      this.scheduleRender();
    });
  }

  private async loadBundledScene() {
    const manifest = await loadJson<ArkSceneManifest>(SCENE_MANIFEST_URL);
    const requestedAsset = getBundledAssetOverride();
    const asset = selectManifestGaussianAsset(manifest, requestedAsset);
    const gaussianUrl = resolveSceneUrl(SCENE_MANIFEST_URL, asset.url);
    const fitBounds = await this.loadBundledFitBounds();
    const sourceAsset = asset.sourceAssetId
      ? manifest.gaussians?.items.find((item) => item.id === asset.sourceAssetId)
      : asset.role === 'source'
        ? asset
        : manifest.gaussians?.items.find((item) => item.role === 'source');
    await this.loadUrl(
      gaussianUrl,
      requestedAsset ? `${manifest.name} (${asset.label ?? asset.id ?? asset.type.toUpperCase()})` : manifest.name,
      'bundled',
      fitBounds,
      asset,
      sourceAsset?.splats
    );
  }

  private async loadBundledFitBounds(): Promise<ArkFitBounds | undefined> {
    try {
      const report = await loadJson<GaussianDataContractReport>(GAUSSIAN_CONTRACT_REPORT_URL);
      const bounds = report.summary?.percentileBounds?.find((item) => item.id === 'broad_01_99');
      if (!bounds) return undefined;
      return {
        id: bounds.id,
        source: 'sidecar',
        min: bounds.min,
        max: bounds.max
      };
    } catch (error) {
      console.warn('ARK-3DGS fit bounds sidecar unavailable.', error);
      return undefined;
    }
  }

  private async loadUrl(
    url: string,
    name: string,
    source: ArkLoadedSceneInfo['source'],
    fitBounds?: ArkFitBounds,
    asset?: ArkGaussianAsset,
    sourceSplats?: number
  ) {
    this.setLoading(`Loading ${name}...`);
    await this.loadSplatSource({
      input: url,
      name,
      filename: url,
      source,
      asset,
      sourceSplats,
      fitBounds
    });
  }

  private async loadFile(file: File) {
    this.setLoading(`Opening ${file.name}...`);
    await this.loadSplatSource({
      input: file,
      name: file.name,
      filename: file.name,
      source: 'local'
    });
  }

  private async loadSplatSource(options: {
    input: string | File;
    name: string;
    filename: string;
    source: ArkLoadedSceneInfo['source'];
    asset?: ArkGaussianAsset;
    sourceSplats?: number;
    fitBounds?: ArkFitBounds;
  }) {
    const { input, name, filename, source, asset, sourceSplats, fitBounds } = options;
    const startedAt = performance.now();

    const info = await this.renderer.loadGaussian({
      input,
      name,
      filename,
      source,
      asset,
      sourceSplats,
      fitBounds,
      onStatus: (status) => {
        this.runtimeStateEl.textContent = status.phase;
        this.statusEl.textContent = status.message;
        this.publishDebugState();
      }
    });

    this.activeInfo = info;
    this.fitRadius = info.fitRadius;
    const visualSettleFrames = this.getVisualQualitySettleFrames(info);
    this.visualQualityGate = createPendingVisualQuality('Waiting for first stable render sample.', visualSettleFrames);
    this.updateVisualQualityInfo();
    this.distance = this.fitRadius * 3.6;
    this.resetView();
    this.updateInfo(info);
    this.runtimeStateEl.textContent = 'Loaded';
    const duration = ((performance.now() - startedAt) / 1000).toFixed(1);
    this.statusEl.textContent = `${filename.split('/').pop()} loaded in ${duration}s.`;
    this.renderer.invalidate();
    this.renderer.resize();
    this.renderBurst(this.getInitialRenderBurstFrames(info));
    await this.runVisualQualityGate(startedAt, visualSettleFrames);
    this.publishDebugState();
  }

  private isLargeSceneForVisualQa(info: ArkLoadedSceneInfo | null) {
    return Boolean(info && info.splats > VISUAL_QA_LARGE_SCENE_SPLAT_THRESHOLD);
  }

  private getVisualQualitySettleFrames(info: ArkLoadedSceneInfo | null) {
    return this.isLargeSceneForVisualQa(info)
      ? VISUAL_QA_LARGE_SCENE_SETTLE_FRAMES
      : VISUAL_QA_SETTLE_FRAMES;
  }

  private getInitialRenderBurstFrames(info: ArkLoadedSceneInfo | null) {
    return this.isLargeSceneForVisualQa(info)
      ? LARGE_SCENE_INITIAL_RENDER_BURST_FRAMES
      : INITIAL_RENDER_BURST_FRAMES;
  }

  private resetView() {
    this.yaw = Math.PI;
    this.pitch = -0.2;
    this.distance = Math.max(this.fitRadius * 3.6, 6);
    this.target.set(0, 0, 0);
    const cp = Math.cos(this.pitch);
    this.cameraOffset.set(
      Math.sin(this.yaw) * cp * this.distance,
      Math.sin(this.pitch) * this.distance,
      Math.cos(this.yaw) * cp * this.distance
    );
    this.cameraPosition.set(this.cameraOffset.x, this.cameraOffset.y, this.cameraOffset.z);
    this.applyCamera();
  }

  private applyCamera() {
    this.updateViewForward(this.viewForward);
    this.cameraTarget.set(
      this.cameraPosition.x + this.viewForward.x * this.distance,
      this.cameraPosition.y + this.viewForward.y * this.distance,
      this.cameraPosition.z + this.viewForward.z * this.distance
    );
    this.target.set(this.cameraTarget.x, this.cameraTarget.y, this.cameraTarget.z);
    this.renderer.setCameraLookAt(this.cameraPosition.toTuple(), this.cameraTarget.toTuple(), this.distance);
  }

  private updateViewForward(target: MutableVec3) {
    const cp = Math.cos(this.pitch);
    target.set(
      -Math.sin(this.yaw) * cp,
      -Math.sin(this.pitch),
      -Math.cos(this.yaw) * cp
    );
    return target;
  }

  private startMotionLoop() {
    if (this.motionFrame) return;
    this.previousTime = performance.now();
    this.motionFrame = window.requestAnimationFrame((time) => this.updateMotion(time));
  }

  private updateMotion(time: number) {
    const delta = Math.min((time - this.previousTime) / 1000, 0.05);
    this.previousTime = time;

    const moving = this.keys.size > 0;
    if (moving) {
      const speed = (this.keys.has('shift') ? 3.2 : 1.2) * this.fitRadius;
      this.moveForward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      this.moveRight.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));

      if (this.keys.has('w')) this.cameraPosition.add(this.moveForward.clone().multiplyScalar(delta * speed));
      if (this.keys.has('s')) this.cameraPosition.add(this.moveForward.clone().multiplyScalar(-delta * speed));
      if (this.keys.has('a')) this.cameraPosition.add(this.moveRight.clone().multiplyScalar(-delta * speed));
      if (this.keys.has('d')) this.cameraPosition.add(this.moveRight.clone().multiplyScalar(delta * speed));
      if (this.keys.has('q')) this.cameraPosition.y += delta * speed;
      if (this.keys.has('e')) this.cameraPosition.y -= delta * speed;

      this.applyCamera();
      this.renderBurst(3);
      this.motionFrame = window.requestAnimationFrame((nextTime) => this.updateMotion(nextTime));
      return;
    }

    this.motionFrame = 0;
  }

  private scheduleRender() {
    if (this.renderFrame) return;
    this.renderFrame = window.requestAnimationFrame(() => {
      this.renderFrame = 0;
      this.renderer.render();
      this.publishDebugState();
    });
  }

  private renderBurst(frames = 60) {
    this.renderBurstRemaining = Math.max(this.renderBurstRemaining, frames);
    if (this.renderBurstFrame) return;

    const tick = () => {
      this.renderer.render();
      this.publishDebugState();
      this.renderBurstRemaining -= 1;
      if (this.renderBurstRemaining > 0) {
        this.renderBurstFrame = window.requestAnimationFrame(tick);
        return;
      }
      this.renderBurstFrame = 0;
    };

    this.renderBurstFrame = window.requestAnimationFrame(tick);
  }

  private setLoading(message: string) {
    this.runtimeStateEl.textContent = 'Loading';
    this.statusEl.textContent = message;
    this.activeInfo = null;
    this.visualQualityGate = createPendingVisualQuality('Scene is loading.');
    this.sceneNameEl.textContent = '-';
    this.formatStateEl.textContent = '-';
    this.splatCountEl.textContent = '-';
    this.shDegreeEl.textContent = '-';
    this.denseBoundsEl.textContent = '-';
    this.fitBoundsStateEl.textContent = '-';
    this.updateVisualQualityInfo();
    this.displayScaleEl.textContent = '-';
    this.sourceStateEl.textContent = '-';
    this.assetStateEl.textContent = '-';
    this.coverageStateEl.textContent = '-';
  }

  private updateInfo(info: ArkLoadedSceneInfo) {
    this.sceneNameEl.textContent = info.name;
    this.formatStateEl.textContent = info.format;
    this.splatCountEl.textContent = formatNumber(info.splats, 0);
    this.shDegreeEl.textContent = String(info.shDegree);
    this.denseBoundsEl.textContent = `${formatVec3(info.denseMin)} / ${formatVec3(info.denseMax)}`;
    this.fitBoundsStateEl.textContent = `${info.fitBoundsId} (${info.fitBoundsSource})`;
    this.displayScaleEl.textContent = `${formatNumber(info.displayScale, 4)}x`;
    this.sourceStateEl.textContent = info.source === 'bundled' ? 'Bundled' : 'Local file';
    this.assetStateEl.textContent = info.assetId
      ? `${info.assetId}${info.assetRole ? ` (${info.assetRole})` : ''}`
      : info.source === 'bundled' ? 'Bundled asset' : 'Local file';
    this.coverageStateEl.textContent = info.sourceSplats && info.sourceSplats > 0
      ? `${formatNumber(info.splats, 0)} / ${formatNumber(info.sourceSplats, 0)} (${formatNumber((info.coverageRatio ?? info.splats / info.sourceSplats) * 100, 2)}%)`
      : 'Direct / unknown';
    this.cameraModeEl.textContent = this.activeInfo ? 'Free browse' : 'Fit preview';
  }

  private updateVisualQualityInfo() {
    this.visualQualityStateEl.textContent = formatVisualQualityGate(this.visualQualityGate);
  }

  private async runVisualQualityGate(startedAt: number, settleFrames = VISUAL_QA_SETTLE_FRAMES) {
    try {
      await this.waitForFrames(settleFrames);
      this.renderer.render();
      const sample = this.renderer.sampleRender();
      const rendererState = this.renderer.getDebugState(false);
      const canvas = rendererState.canvas;
      const info = this.activeInfo;

      const checks: Record<string, ArkQualityGateCheck> = {
        sceneLoaded: createQualityCheck(Boolean(info && info.splats > 0), info?.splats ?? null, 'Scene has renderable splats.'),
        canvasReady: createQualityCheck(
          Boolean(canvas && canvas.width > 0 && canvas.height > 0 && canvas.clientWidth > 0 && canvas.clientHeight > 0),
          canvas,
          'Renderer canvas has non-zero drawing and display size.'
        ),
        fitBoundsResolved: createQualityCheck(Boolean(info?.fitBoundsId), info?.fitBoundsId ?? null, 'Camera fit bounds are resolved.'),
        bundledSidecarApplied: createQualityCheck(
          !info || info.source !== 'bundled' || info.fitBoundsSource === 'sidecar',
          info ? `${info.fitBoundsId} (${info.fitBoundsSource})` : null,
          'Bundled scenes should use sidecar fit bounds.'
        ),
        renderVisible: createQualityCheck(sample.status === 'visible', sample.status, 'Pixel sample detects visible rendered content.'),
        contrastAboveThreshold: createQualityCheck(
          sample.contrast >= VISUAL_QA_MIN_CONTRAST,
          sample.contrast,
          `Pixel contrast is at least ${VISUAL_QA_MIN_CONTRAST}.`
        )
      };

      const passed = Object.values(checks).every((check) => check.passed);
      this.visualQualityGate = {
        status: passed ? 'passed' : 'failed',
        reason: passed ? 'Visual sample passed all runtime checks.' : 'One or more visual runtime checks failed.',
        checks,
        thresholds: {
          minContrast: VISUAL_QA_MIN_CONTRAST,
          settleFrames
        },
        sample,
        evaluatedAtMs: Math.round(performance.now() - startedAt)
      };
    } catch (error) {
      this.visualQualityGate = {
        status: 'unknown',
        reason: String(error instanceof Error ? error.message : error),
        checks: {},
        thresholds: {
          minContrast: VISUAL_QA_MIN_CONTRAST,
          settleFrames
        },
        sample: null,
        evaluatedAtMs: Math.round(performance.now() - startedAt)
      };
    }

    this.updateVisualQualityInfo();
    this.publishDebugState();
  }

  private async waitForFrames(frames: number) {
    for (let index = 0; index < frames; index += 1) {
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });
    }
  }

  private publishDebugState(includeSample = false) {
    this.host.dataset.arkDebug = JSON.stringify(this.getCompactDebugState(includeSample));
  }
}

async function main() {
  createAppShell();
  const browser = new ArkGaussianBrowser();
  window.__ARK_3DGS__ = browser;
  await browser.boot();
}

main().catch((error) => {
  console.error(error);
  const app = document.querySelector<HTMLDivElement>('#app');
  if (app) {
    app.innerHTML = `<pre class="fatal">${String(error instanceof Error ? error.message : error)}</pre>`;
  }
});
