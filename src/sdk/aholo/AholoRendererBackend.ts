import {
  BackgroundMode,
  Color,
  PerspectiveCamera,
  SplatLoader,
  SplatUtils,
  Vector3,
  createViewer,
  setViewerConfig,
  type Splat,
  type Viewer
} from '@manycore/aholo-viewer';
import type {
  ArkGaussianLoadRequest,
  ArkLoadedSceneInfo,
  ArkRenderSample,
  ArkRendererBackend,
  ArkRendererDebugState,
  ArkVec3
} from '../types';

type SogMeta = {
  counts: number;
  shDegree: number;
  means: {
    mins: ArkVec3;
    maxs: ArkVec3;
  };
};

type SplattingDebugCounters = {
  updateEffect: number;
  updateRenderGraph: number;
  addSortTask: number;
  flushSortTask: number;
  lastAddSortTaskCounts: number;
  lastFlushState: string;
};

const SPLAT_WORKER_URL = '/vendor/aholo/splat-worker.js';
const LOAD_TIMEOUT_MS = 180_000;

function readDebugValue<T>(reader: () => T) {
  try {
    return reader();
  } catch (error) {
    return `unavailable: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function getFileTypeName(type: number) {
  return String(SplatLoader.SplatFileType[type] ?? 'UNKNOWN');
}

function getSplatDataSummary(data: SplatLoader.SplatData) {
  const serialized = data.serialize();
  return {
    counts: serialized.counts,
    shDegree: serialized.shDegree,
    extras: serialized.extras ?? []
  };
}

function getSogMeta(data: SplatLoader.SplatData) {
  const summary = getSplatDataSummary(data);
  const meta = summary.extras[0] as SogMeta | undefined;
  if (!meta?.means?.mins || !meta.means.maxs) {
    throw new Error('SOG metadata is missing Gaussian bounds.');
  }
  return meta;
}

function getMaxTextureSize() {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', { depth: false, stencil: false });
  if (!gl) return 8192;
  const size = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE));
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return Number.isFinite(size) ? size : 8192;
}

function getRequestedShDegree() {
  const value = Number(new URLSearchParams(window.location.search).get('sh'));
  if (Number.isInteger(value) && value >= 0 && value <= 3) return value;
  return 0;
}

function getRequestedPackType(type: number) {
  const pack = new URLSearchParams(window.location.search).get('pack')?.toLowerCase();
  if (pack === 'super') return SplatLoader.SplatPackType.SuperCompressed;
  if (pack === 'sog' && type === SplatLoader.SplatFileType.SOG) return SplatLoader.SplatPackType.Sog;
  return SplatLoader.SplatPackType.Compressed;
}

function createSplatDataForPack(packType: number, maxShDegree: number, maxTextureSize: number): SplatLoader.SplatData {
  const loader = SplatLoader as unknown as Record<string, new (...args: unknown[]) => unknown>;
  const Ctor = packType === SplatLoader.SplatPackType.Sog
    ? loader.SogSplatData
    : packType === SplatLoader.SplatPackType.SuperCompressed
      ? loader.SuperCompressedSplatData
      : loader.CompressedSplatData;
  if (!Ctor) {
    throw new Error('ARK-3DGS could not create an Aholo splat data container.');
  }
  return new Ctor(maxShDegree, maxTextureSize) as SplatLoader.SplatData;
}

async function createSourceStream(input: string | File) {
  if (typeof input !== 'string') {
    return {
      stream: input.stream(),
      contentLength: input.size
    };
  }

  const response = await fetch(input);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to fetch ${input}: ${response.status}`);
  }
  return {
    stream: response.body,
    contentLength: Number(response.headers.get('Content-Length') ?? 0)
  };
}

async function parseSplatDataByChunks(type: number, input: string | File, packType: number) {
  const maxShDegree = getRequestedShDegree();
  const maxTextureSize = getMaxTextureSize();
  const { stream, contentLength } = await createSourceStream(input);

  return await new Promise<ReturnType<typeof createSplatDataForPack>>((resolve, reject) => {
    const worker = new Worker(SPLAT_WORKER_URL, { type: 'module' });
    let settled = false;

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      worker.terminate();
      callback();
    };

    const fail = (error: unknown) => {
      finish(() => reject(error instanceof Error ? error : new Error(String(error))));
    };

    const timeout = window.setTimeout(() => {
      fail(new Error(`Parsing timed out after ${Math.round(LOAD_TIMEOUT_MS / 1000)}s. Try ?sh=0, SOG, or a lower-density preview asset.`));
    }, LOAD_TIMEOUT_MS);

    worker.onerror = (event) => {
      fail(new Error(event.message || 'Gaussian worker failed.'));
    };

    worker.onmessage = (event: MessageEvent<{ status: number; payload: unknown }>) => {
      const data = event.data;
      if (data.status === 0) {
        const splatData = createSplatDataForPack(packType, maxShDegree, maxTextureSize);
        splatData.deserialize(data.payload as Parameters<SplatLoader.SplatData['deserialize']>[0]);
        finish(() => resolve(splatData));
        return;
      }
      fail(data.payload instanceof Error ? data.payload : new Error(String(data.payload)));
    };

    worker.postMessage({
      taskType: 'ParseSplat',
      payload: {
        type,
        packType,
        contentLength,
        extras: {
          maxShDegree,
          maxTextureSize
        }
      }
    });

    void (async () => {
      const reader = stream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        worker.postMessage(
          {
            taskType: 'PostStreamChunk',
            payload: {
              chunk: value
            }
          },
          value ? [value.buffer] : []
        );
        if (done) break;
      }
    })().catch(fail);
  });
}

export class AholoRendererBackend implements ArkRendererBackend {
  readonly id = 'aholo';

  private readonly viewer: Viewer;
  private readonly camera = new PerspectiveCamera(60, 1, 0.01, 10000);
  private readonly cameraTarget = new Vector3(0, 0, 0);
  private activeSplat: Splat | null = null;
  private cameraDistance = 5;
  private readonly splattingDebugCounters: SplattingDebugCounters = {
    updateEffect: 0,
    updateRenderGraph: 0,
    addSortTask: 0,
    flushSortTask: 0,
    lastAddSortTaskCounts: 0,
    lastFlushState: ''
  };

  constructor(private readonly host: HTMLElement) {
    this.viewer = createViewer('ARK-3DGS', this.host, {
      antialiasing: true,
      alpha: false,
      preserveDrawingBuffer: true
    });
    this.configureViewer();
  }

  setRenderRequestHandler(handler: () => void) {
    this.viewer.requestRenderHandler = handler;
  }

  async loadGaussian(request: ArkGaussianLoadRequest) {
    const { input, name, filename, source, fitBounds, onStatus } = request;
    const type = typeof input === 'string'
      ? this.detectTypeFromName(filename)
      : await this.detectTypeFromFile(input);
    const format = getFileTypeName(type);

    onStatus?.({
      phase: 'Parsing',
      message: `Parsing ${format} data...`
    });
    const packType = getRequestedPackType(type);
    const data = await parseSplatDataByChunks(type, input, packType);

    onStatus?.({
      phase: 'Packing',
      message: 'Preparing GPU splat object...'
    });
    const splat = await SplatUtils.createSplat(data);
    const summary = getSplatDataSummary(data);
    const isSog = packType === SplatLoader.SplatPackType.Sog;
    const denseBox = isSog
      ? (() => {
        const meta = getSogMeta(data);
        return {
          boxMin: meta.means.mins,
          boxMax: meta.means.maxs
        };
      })()
      : (() => {
        const operator = new SplatUtils.SplatOperator(splat, data);
        return SplatUtils.computeDenseBox(operator, 0.98);
      })();

    const selectedBounds = fitBounds ?? {
      id: isSog ? 'sog_meta_dense' : 'aholo_dense_98',
      source: 'renderer' as const,
      min: denseBox.boxMin as ArkVec3,
      max: denseBox.boxMax as ArkVec3
    };

    this.replaceSplat(splat);
    const info = this.fitSplatToView(splat, {
      name,
      format,
      splats: summary.counts,
      shDegree: summary.shDegree,
      denseMin: selectedBounds.min,
      denseMax: selectedBounds.max,
      displayScale: 1,
      fitRadius: 3,
      fitBoundsId: selectedBounds.id,
      fitBoundsSource: selectedBounds.source,
      source
    });

    this.invalidate();
    this.resize();
    return info;
  }

  setCameraLookAt(position: ArkVec3, target: ArkVec3, distance: number) {
    this.updateCameraAspect();
    this.cameraDistance = distance;
    this.camera.position.set(position[0], position[1], position[2]);
    this.cameraTarget.set(target[0], target[1], target[2]);
    this.camera.lookAt(this.cameraTarget);
    this.camera.notifyCameraChanged();
  }

  resize() {
    this.updateCameraAspect();
    this.viewer.resize();
  }

  render() {
    (this.viewer as unknown as { forceNextFrameRender?: boolean }).forceNextFrameRender = true;
    this.viewer.render();
  }

  invalidate() {
    const viewer = this.viewer as unknown as {
      forceNextFrameRender?: boolean;
      clearPipelineCache?: () => void;
      requestRender?: () => void;
    };
    viewer.forceNextFrameRender = true;
    viewer.clearPipelineCache?.();
    this.activeSplat?.updateVersion();
    this.activeSplat?.notifySceneChange();
    viewer.requestRender?.();
  }

  getDebugState(includeSample = false): ArkRendererDebugState {
    const canvas = this.host.querySelector('canvas');
    const scene = this.viewer.getScene();
    const splatManager = (scene as unknown as { splatManager?: { splats: Splat[]; splatCounts: number; sceneVersion: number } }).splatManager;
    const plugin = this.getSplattingPlugin();
    const cameraLayer = this.camera as unknown as { layers?: { mask?: number }; netLayer?: { mask?: number } };
    const activeSplat = this.activeSplat as unknown as {
      id?: number;
      counts?: number;
      shDegree?: number;
      visible?: boolean;
      position?: Vector3;
      scale?: Vector3;
      layers?: { mask?: number };
      netLayer?: { mask?: number };
    } | null;

    return {
      camera: {
        fov: this.camera.fov,
        near: this.camera.near,
        far: this.camera.far,
        aspect: this.camera.aspect,
        layers: cameraLayer.layers?.mask,
        netLayer: cameraLayer.netLayer?.mask,
        up: [this.camera.up.x, this.camera.up.y, this.camera.up.z],
        position: [this.camera.position.x, this.camera.position.y, this.camera.position.z],
        target: [this.cameraTarget.x, this.cameraTarget.y, this.cameraTarget.z],
        distance: this.cameraDistance
      },
      canvas: canvas
        ? {
          width: canvas.width,
          height: canvas.height,
          clientWidth: canvas.clientWidth,
          clientHeight: canvas.clientHeight
        }
        : null,
      renderer: {
        id: this.id,
        backend: readDebugValue(() => this.viewer.rendererBackend)
      },
      pipeline: this.getPipelineDebugState(),
      scene: {
        splats: splatManager?.splats.length ?? null,
        splatCounts: splatManager?.splatCounts ?? null,
        sceneVersion: splatManager?.sceneVersion ?? null
      },
      splattingPlugin: plugin
        ? {
          counters: this.splattingDebugCounters,
          enabled: readDebugValue(() => plugin.enabled),
          shouldRender: readDebugValue(() => plugin.shouldRender),
          isSortDirty: readDebugValue(() => plugin.isSortDirty),
          isSorting: readDebugValue(() => plugin.isSorting),
          sortCurrentVersion: readDebugValue(() => plugin.sortCurrentVersion),
          sortLastVersion: readDebugValue(() => plugin.sortLastVersion),
          packQueueSize: readDebugValue(() => plugin.packQueue?.size),
          precalculateQueueSize: readDebugValue(() => plugin.precalculateQueue?.size),
          instancedCount: readDebugValue(() => plugin.splattingGeometry?.instancedCount),
          activeSplats: readDebugValue(() => plugin.splattingMaterial?.activeSplats),
          orderTex: readDebugValue(() => plugin.reorderMaterial?.orderTex
            ? {
              width: plugin.reorderMaterial.orderTex.width,
              height: plugin.reorderMaterial.orderTex.height
            }
            : null)
        }
        : null,
      splat: activeSplat
        ? {
          id: activeSplat.id,
          counts: activeSplat.counts,
          shDegree: activeSplat.shDegree,
          visible: activeSplat.visible,
          layers: activeSplat.layers?.mask,
          netLayer: activeSplat.netLayer?.mask,
          position: activeSplat.position
            ? [activeSplat.position.x, activeSplat.position.y, activeSplat.position.z]
            : null,
          scale: activeSplat.scale
            ? [activeSplat.scale.x, activeSplat.scale.y, activeSplat.scale.z]
            : null
        }
        : null,
      renderInfo: this.viewer.renderInfo as unknown,
      memoryInfo: this.viewer.getMemoryInfo?.(),
      statistics: this.viewer.getRenderStatistics?.(),
      renderSample: includeSample ? this.sampleRender() : null
    };
  }

  sampleRender(): ArkRenderSample {
    const canvas = this.host.querySelector('canvas');
    if (!canvas) {
      return { status: 'unknown', averageRgb: [0, 0, 0], contrast: 0 };
    }

    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) {
      return { status: 'unknown', averageRgb: [0, 0, 0], contrast: 0 };
    }

    this.viewer.render();

    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const points: ArkVec3[] = [
      [0.5, 0.5, 0],
      [0.35, 0.5, 0],
      [0.65, 0.5, 0],
      [0.5, 0.35, 0],
      [0.5, 0.65, 0],
      [0.25, 0.25, 0],
      [0.75, 0.25, 0],
      [0.25, 0.75, 0],
      [0.75, 0.75, 0]
    ];
    const pixel = new Uint8Array(4);
    const values: ArkVec3[] = [];
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

    const average = values.reduce<ArkVec3>((acc, value) => {
      acc[0] += value[0];
      acc[1] += value[1];
      acc[2] += value[2];
      return acc;
    }, [0, 0, 0]).map((value) => value / values.length) as ArkVec3;

    const contrast = values.reduce((maxDistance, value) => {
      const distance = Math.abs(value[0] - average[0])
        + Math.abs(value[1] - average[1])
        + Math.abs(value[2] - average[2]);
      return Math.max(maxDistance, distance);
    }, 0);

    return {
      status: contrast > 12 ? 'visible' : 'empty',
      averageRgb: average,
      contrast
    };
  }

  private configureViewer() {
    this.camera.up.set(0, -1, 0);
    this.updateCameraAspect();
    this.viewer.setCamera(this.camera);
    setViewerConfig(this.viewer, {
      pipeline: {
        Background: {
          enabled: true,
          up: new Vector3(0, -1, 0),
          ground: {
            enabled: false
          },
          background: {
            active: BackgroundMode.BasicBackground,
            basic: {
              color: new Color(0x0f1110),
              alpha: 1
            }
          }
        },
        Splatting: {
          enabled: true,
          precalculateEnabled: true,
          packHighPrecisionEnabled: true,
          composite: {
            enabled: true,
            highPrecisionAttachEnabled: true
          },
          normalizedFalloff: false,
          preBlurAmount: 0.3,
          focalAdjustment: 2,
          maxPixelRadius: 1024,
          maxStdDev: Math.sqrt(8),
          blurAmount: 0,
          detailCullingThreshold: 0,
          sort: {
            sortMinDuration: 0
          }
        },
        TAA: {
          enabled: false
        }
      }
    });
    this.instrumentSplattingPlugin();
  }

  private updateCameraAspect() {
    this.camera.aspect = Math.max(1, this.host.clientWidth) / Math.max(1, this.host.clientHeight);
    this.camera.updateProjectionMatrix();
  }

  private replaceSplat(splat: Splat) {
    const scene = this.viewer.getScene();
    if (this.activeSplat) {
      scene.remove(this.activeSplat);
      this.activeSplat.destroy();
    }
    this.activeSplat = splat;
    scene.add(splat);
  }

  private fitSplatToView(splat: Splat, info: ArkLoadedSceneInfo) {
    const min = info.denseMin;
    const max = info.denseMax;
    const size: ArkVec3 = [
      Math.max(max[0] - min[0], 0.001),
      Math.max(max[1] - min[1], 0.001),
      Math.max(max[2] - min[2], 0.001)
    ];
    const center: ArkVec3 = [
      (min[0] + max[0]) / 2,
      (min[1] + max[1]) / 2,
      (min[2] + max[2]) / 2
    ];
    const maxDim = Math.max(...size);
    const displayScale = maxDim > 0 ? 4 / maxDim : 1;
    const fitRadius = Math.max(2.5, maxDim * displayScale * 0.75);

    splat.position.set(-center[0] * displayScale, -center[1] * displayScale, -center[2] * displayScale);
    splat.scale.set(displayScale, displayScale, displayScale);
    splat.notifySceneChange();

    return {
      ...info,
      displayScale,
      fitRadius
    };
  }

  private detectTypeFromName(filename: string) {
    const type = SplatLoader.detectSplatFileType(filename, new Uint8Array());
    if (type === undefined) {
      throw new Error(`Unsupported Gaussian format: ${filename}`);
    }
    return type;
  }

  private async detectTypeFromFile(file: File) {
    const lower = file.name.toLowerCase();
    const needsContentProbe = lower.endsWith('.zip') || lower.endsWith('.json');
    const probe = needsContentProbe
      ? new Uint8Array(await file.arrayBuffer())
      : new Uint8Array(await file.slice(0, 4096).arrayBuffer());
    const type = SplatLoader.detectSplatFileType(file.name, probe);
    if (type === undefined) {
      throw new Error(`Unsupported Gaussian format: ${file.name}`);
    }
    return type;
  }

  private getSplattingPlugin() {
    return (this.viewer as unknown as {
      defaultViewport?: {
        pipeline?: {
          splattingPlugin?: {
            enabled?: boolean;
            shouldRender?: boolean;
            isSortDirty?: boolean;
            isSorting?: boolean;
            sortCurrentVersion?: number;
            sortLastVersion?: number;
            packQueue?: Set<number>;
            precalculateQueue?: Set<number>;
            splattingGeometry?: { instancedCount?: number };
            splattingMaterial?: { activeSplats?: number };
            reorderMaterial?: { orderTex?: { width?: number; height?: number } | null };
            updateEffect?: (...args: unknown[]) => unknown;
            updateRenderGraph?: (...args: unknown[]) => unknown;
            addSortTask?: (counts: number, ...args: unknown[]) => unknown;
            flushSortTask?: (...args: unknown[]) => unknown;
          };
        };
      };
    }).defaultViewport?.pipeline?.splattingPlugin;
  }

  private getPipelineDebugState() {
    const viewport = (this.viewer as unknown as {
      defaultViewport?: {
        pipeline?: {
          plugins?: Array<{
            PLUGIN_NAME?: string;
            enabled?: boolean;
            envSupported?: boolean;
          }>;
          graphCaches?: Map<unknown, unknown>;
          volatileGraphCaches?: Map<unknown, unknown>;
          _cachedPlugins?: Array<{ PLUGIN_NAME?: string }>;
        };
      };
    }).defaultViewport;
    const pipeline = viewport?.pipeline;
    return {
      plugins: readDebugValue(() => pipeline?.plugins?.map((plugin) => ({
        name: plugin.PLUGIN_NAME,
        enabled: readDebugValue(() => plugin.enabled),
        envSupported: readDebugValue(() => plugin.envSupported)
      })) ?? null),
      graphCacheSize: readDebugValue(() => pipeline?.graphCaches?.size ?? null),
      volatileGraphCacheSize: readDebugValue(() => pipeline?.volatileGraphCaches?.size ?? null),
      cachedPluginNames: readDebugValue(() => pipeline?._cachedPlugins?.map((plugin) => plugin.PLUGIN_NAME) ?? null)
    };
  }

  private instrumentSplattingPlugin() {
    const plugin = this.getSplattingPlugin();
    if (!plugin) return;
    const instrumented = plugin as typeof plugin & { __arkInstrumented?: boolean };
    if (instrumented.__arkInstrumented) return;
    instrumented.__arkInstrumented = true;

    const originalUpdateEffect = plugin.updateEffect?.bind(plugin);
    if (originalUpdateEffect) {
      plugin.updateEffect = (...args: unknown[]) => {
        this.splattingDebugCounters.updateEffect += 1;
        return originalUpdateEffect(...args);
      };
    }

    const originalUpdateRenderGraph = plugin.updateRenderGraph?.bind(plugin);
    if (originalUpdateRenderGraph) {
      plugin.updateRenderGraph = (...args: unknown[]) => {
        this.splattingDebugCounters.updateRenderGraph += 1;
        return originalUpdateRenderGraph(...args);
      };
    }

    const originalAddSortTask = plugin.addSortTask?.bind(plugin);
    if (originalAddSortTask) {
      plugin.addSortTask = (counts: number, ...args: unknown[]) => {
        this.splattingDebugCounters.addSortTask += 1;
        this.splattingDebugCounters.lastAddSortTaskCounts = counts;
        return originalAddSortTask(counts, ...args);
      };
    }

    const originalFlushSortTask = plugin.flushSortTask?.bind(plugin);
    if (originalFlushSortTask) {
      plugin.flushSortTask = (...args: unknown[]) => {
        this.splattingDebugCounters.flushSortTask += 1;
        this.splattingDebugCounters.lastFlushState = [
          `current=${plugin.sortCurrentVersion}`,
          `last=${plugin.sortLastVersion}`,
          `sorting=${plugin.isSorting}`,
          `hasPending=${Boolean((plugin as unknown as { pendingSortTask?: unknown }).pendingSortTask)}`
        ].join(';');
        return originalFlushSortTask(...args);
      };
    }
  }
}
