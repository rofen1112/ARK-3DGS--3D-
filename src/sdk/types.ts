export type ArkVec3 = [number, number, number];

export type ArkGaussianFormat = 'ply' | 'spz' | 'splat' | 'ksplat' | 'sog' | 'lcc' | 'esz';

export type ArkSceneSource = 'bundled' | 'local';

export type ArkBoundsSource = 'renderer' | 'sidecar' | 'manifest' | 'computed';

export type ArkGaussianAssetRole = 'runtime' | 'source' | 'preview' | 'diagnostic';

export type ArkFitBounds = {
  id: string;
  source: ArkBoundsSource;
  min: ArkVec3;
  max: ArkVec3;
};

export type ArkGaussianAsset = {
  id?: string;
  role?: ArkGaussianAssetRole;
  label?: string;
  type: ArkGaussianFormat;
  url: string;
  position?: ArkVec3;
  scale?: ArkVec3;
  rotation?: [number, number, number, number];
  splats?: number;
  sizeBytes?: number;
  dataBytes?: number;
  sourceAssetId?: string;
};

export type ArkGaussianAssetSet = {
  default: string;
  items: ArkGaussianAsset[];
};

export type ArkSceneManifest = {
  id: string;
  name: string;
  description?: string;
  gaussian: ArkGaussianAsset;
  gaussians?: ArkGaussianAssetSet;
  scale?: {
    unit: 'meter';
  };
};

export type ArkLoadPhase = 'Loading' | 'Parsing' | 'Packing' | 'Loaded';

export type ArkLoadStatus = {
  phase: ArkLoadPhase;
  message: string;
};

export type ArkGaussianLoadRequest = {
  input: string | File;
  name: string;
  filename: string;
  source: ArkSceneSource;
  asset?: ArkGaussianAsset;
  sourceSplats?: number;
  fitBounds?: ArkFitBounds;
  onStatus?: (status: ArkLoadStatus) => void;
};

export type ArkLoadedSceneInfo = {
  name: string;
  format: string;
  splats: number;
  shDegree: number;
  denseMin: ArkVec3;
  denseMax: ArkVec3;
  displayScale: number;
  fitRadius: number;
  fitBoundsId: string;
  fitBoundsSource: ArkBoundsSource;
  source: ArkSceneSource;
  assetId?: string;
  assetRole?: ArkGaussianAssetRole;
  sourceAssetId?: string;
  declaredSplats?: number;
  sourceSplats?: number;
  coverageRatio?: number;
};

export type ArkRenderSample = {
  status: 'empty' | 'visible' | 'unknown';
  averageRgb: ArkVec3;
  contrast: number;
};

export type ArkQualityGateStatus = 'pending' | 'passed' | 'failed' | 'unknown';

export type ArkQualityGateCheck = {
  passed: boolean;
  value: unknown;
  message: string;
};

export type ArkVisualQualityGate = {
  status: ArkQualityGateStatus;
  reason: string;
  checks: Record<string, ArkQualityGateCheck>;
  thresholds: {
    minContrast: number;
    settleFrames: number;
  };
  sample: ArkRenderSample | null;
  evaluatedAtMs: number | null;
};

export type ArkCameraDebugState = {
  fov: number;
  near: number;
  far: number;
  aspect: number;
  layers?: number;
  netLayer?: number;
  up: ArkVec3;
  position: ArkVec3;
  target: ArkVec3;
  distance: number;
};

export type ArkRendererDebugState = {
  camera: ArkCameraDebugState;
  canvas: {
    width: number;
    height: number;
    clientWidth: number;
    clientHeight: number;
  } | null;
  renderer: {
    backend: unknown;
    id: string;
  };
  pipeline: unknown;
  scene: {
    splats: number | null;
    splatCounts: number | null;
    renderedSplats?: number | null;
    sceneVersion: number | null;
  };
  splattingPlugin: unknown;
  splat: unknown;
  renderInfo?: unknown;
  memoryInfo?: unknown;
  statistics?: unknown;
  renderSample: ArkRenderSample | null;
};

export type ArkRendererBackend = {
  readonly id: string;
  setRenderRequestHandler(handler: () => void): void;
  loadGaussian(request: ArkGaussianLoadRequest): Promise<ArkLoadedSceneInfo>;
  setCameraLookAt(position: ArkVec3, target: ArkVec3, distance: number): void;
  resize(): void;
  render(): void;
  invalidate(): void;
  getDebugState(includeSample?: boolean): ArkRendererDebugState;
  sampleRender(): ArkRenderSample;
};
