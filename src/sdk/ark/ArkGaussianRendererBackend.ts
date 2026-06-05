import { decodeGaussianPly, parseGaussianPlyHeader } from '../gaussian/ply';
import { computePackedGaussianCovariance3D, packGaussianCovariance } from '../gaussian/packedData';
import type { ArkGaussianPercentileBounds, ArkGaussianPercentileSpec } from '../gaussian/types';
import type {
  ArkFitBounds,
  ArkGaussianLoadRequest,
  ArkLoadedSceneInfo,
  ArkRenderSample,
  ArkRendererBackend,
  ArkRendererDebugState,
  ArkVec3
} from '../types';

type Gl = WebGL2RenderingContext;

const SH_C0 = 0.28209479177387814;
const SH_C1 = 0.4886025;
const RENDER_SH_DEGREE = 1;
const RENDER_SH_REST_COUNT = 9;
const SORT_SPLAT_LIMIT = 400_000;
const FULL_DENSITY_SPLAT_LIMIT = 2_000_000;
const BUCKET_SORT_SPLAT_LIMIT = FULL_DENSITY_SPLAT_LIMIT;
const SORT_BUCKET_COUNT = 65_536;
const SORT_BUCKET_MAX = SORT_BUCKET_COUNT - 1;
const LARGE_SCENE_RENDER_SPLAT_BUDGET = 300_000;
const CAMERA_EPSILON = 0.0001;
const BUCKET_SORT_CAMERA_EPSILON = 0.02;
const MAX_STD_DEV = Math.sqrt(8);
const PRE_BLUR_AMOUNT = 0.3;
const BLUR_AMOUNT = 0;
const FOCAL_ADJUSTMENT = 2;
const ELLIPSE_EXTENT = MAX_STD_DEV;
const MIN_PIXEL_AXIS = 0.75;
const MAX_PIXEL_AXIS = 1024;
const OPACITY_SCALE = 0.44;
const ALPHA_CUTOFF = 0.003;
const MIN_CLIP_W = 0.02;
const OFFSCREEN_CLIP_PADDING = 1.4;
const COMPUTED_FIT_BOUNDS_SPEC: ArkGaussianPercentileSpec = {
  id: 'ply_01_99',
  low: 0.01,
  high: 0.99
};
const LOD_ELLIPSE_EXTENT = MAX_STD_DEV;
const LOD_MIN_PIXEL_AXIS = 0.35;
const LOD_MAX_PIXEL_AXIS = 1024;
const LOD_MIN_OPACITY_RATIO = 0.28;
const FULL_DENSITY_ELLIPSE_EXTENT = MAX_STD_DEV;
const FULL_DENSITY_MIN_PIXEL_AXIS = 0.35;
const FULL_DENSITY_MAX_PIXEL_AXIS = 1024;
const FULL_DENSITY_OPACITY_SCALE = 0.18;
const DATA_TEXTURE_AUDIT_SPLAT_LIMIT = LARGE_SCENE_RENDER_SPLAT_BUDGET;

type ArkGaussianCompositeMode = 'premultiplied-alpha' | 'straight-alpha';
type ArkGaussianSortOverride = 'auto' | 'source-order' | 'exact-depth' | 'bucket-depth';
type ArkGaussianProjectionProfile = 'default' | 'no-preblur' | 'unit-focal' | 'compact-kernel' | 'aholo-material';
type ArkGaussianDataTextureMode = 'off' | 'texture-audit' | 'texture-fetch';

type ArkGaussianProjectionSettings = {
  profile: ArkGaussianProjectionProfile;
  preBlurAmount: number;
  blurAmount: number;
  focalAdjustment: number;
  maxStdDev: number;
};

type ArkGaussianDiagnostics = {
  enabled: boolean;
  sortOverride: ArkGaussianSortOverride;
  compositeMode: ArkGaussianCompositeMode;
  projectionProfile: ArkGaussianProjectionProfile;
  dataTextureMode: ArkGaussianDataTextureMode;
};

type ArkGaussianDataTextureAudit = {
  enabled: boolean;
  mode: ArkGaussianDataTextureMode;
  status: 'idle' | 'skipped' | 'passed' | 'failed';
  reason: string;
  sceneVersion: number;
  sortVersion: number;
  count: number;
  textureSize: {
    width: number;
    height: number;
  } | null;
  sampleCount: number;
  thresholds: {
    centerMaxAbsDelta: number;
    covarianceMaxAbsDelta: number;
    orderMaxAbsDelta: number;
  };
  centerMaxAbsDelta: number | null;
  covarianceMaxAbsDelta: number | null;
  orderMaxAbsDelta: number | null;
  textures: {
    center: boolean;
    covarianceA: boolean;
    covarianceB: boolean;
    order: boolean;
  };
};

type RenderProfile = {
  id: string;
  ellipseExtent: number;
  minPixelAxis: number;
  maxPixelAxis: number;
  opacityScale: number;
};

type SortMode = 'disabled' | 'exact-depth' | 'bucket-depth';

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function sigmoid(value: number) {
  return 1 / (1 + Math.exp(-value));
}

function subtract(a: ArkVec3, b: ArkVec3): ArkVec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function dot(a: ArkVec3, b: ArkVec3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: ArkVec3, b: ArkVec3): ArkVec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

function normalize(value: ArkVec3): ArkVec3 {
  const length = Math.hypot(value[0], value[1], value[2]) || 1;
  return [value[0] / length, value[1] / length, value[2] / length];
}

function multiplyMat4(a: Float32Array, b: Float32Array) {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      out[col * 4 + row] =
        a[0 * 4 + row] * b[col * 4 + 0]
        + a[1 * 4 + row] * b[col * 4 + 1]
        + a[2 * 4 + row] * b[col * 4 + 2]
        + a[3 * 4 + row] * b[col * 4 + 3];
    }
  }
  return out;
}

function perspective(fovRadians: number, aspect: number, near: number, far: number) {
  const out = new Float32Array(16);
  const f = 1 / Math.tan(fovRadians / 2);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}

function lookAt(eye: ArkVec3, target: ArkVec3, up: ArkVec3) {
  const z = normalize(subtract(eye, target));
  const x = normalize(cross(up, z));
  const y = cross(z, x);
  const out = new Float32Array(16);
  out[0] = x[0];
  out[1] = y[0];
  out[2] = z[0];
  out[3] = 0;
  out[4] = x[1];
  out[5] = y[1];
  out[6] = z[1];
  out[7] = 0;
  out[8] = x[2];
  out[9] = y[2];
  out[10] = z[2];
  out[11] = 0;
  out[12] = -dot(x, eye);
  out[13] = -dot(y, eye);
  out[14] = -dot(z, eye);
  out[15] = 1;
  return out;
}

function boundsCenter(bounds: ArkFitBounds) {
  return [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2
  ] as ArkVec3;
}

function boundsMaxDim(bounds: ArkFitBounds) {
  return Math.max(
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2]
  );
}

function createProgram(gl: Gl, vertexSource: string, fragmentSource: string) {
  function compile(type: number, source: string) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error('Could not create WebGL shader.');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader) ?? 'unknown shader error';
      gl.deleteShader(shader);
      throw new Error(log);
    }
    return shader;
  }

  const vertex = compile(gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) throw new Error('Could not create WebGL program.');
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? 'unknown program link error';
    gl.deleteProgram(program);
    throw new Error(log);
  }
  return program;
}

async function readInput(input: string | File) {
  if (typeof input !== 'string') return await input.arrayBuffer();
  const response = await fetch(input);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${input}: ${response.status}`);
  }
  return await response.arrayBuffer();
}

function inferPlyFitBounds(
  request: ArkGaussianLoadRequest,
  min: ArkVec3,
  max: ArkVec3,
  percentileBounds?: ArkGaussianPercentileBounds[]
): ArkFitBounds {
  if (request.fitBounds) return request.fitBounds;
  const robustBounds = percentileBounds?.find((bounds) => bounds.id === COMPUTED_FIT_BOUNDS_SPEC.id);
  if (robustBounds) {
    return {
      id: robustBounds.id,
      source: 'computed',
      min: robustBounds.min,
      max: robustBounds.max
    };
  }
  return {
    id: 'ply_exact',
    source: 'computed',
    min,
    max
  };
}

function distanceSq(a: ArkVec3, b: ArkVec3) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
}

function copyVec3(value: ArkVec3): ArkVec3 {
  return [value[0], value[1], value[2]];
}

function decodeScale(value: number, displayScale: number) {
  const decoded = Math.exp(value) * displayScale;
  return Number.isFinite(decoded) ? Math.max(decoded, 0.0001) : 0.0001;
}

function normalizeQuaternion(w: number, x: number, y: number, z: number) {
  const length = Math.hypot(w, x, y, z);
  if (!Number.isFinite(length) || length < 0.000001) {
    return [1, 0, 0, 0] as const;
  }
  return [w / length, x / length, y / length, z / length] as const;
}

function roundMs(value: number) {
  return Number(value.toFixed(3));
}

function bytesToMiB(bytes: number) {
  return Number((bytes / (1024 * 1024)).toFixed(3));
}

function createIdleDataTextureAudit(mode: ArkGaussianDataTextureMode): ArkGaussianDataTextureAudit {
  return {
    enabled: mode !== 'off',
    mode,
    status: mode === 'off' ? 'skipped' : 'idle',
    reason: mode === 'off' ? 'disabled' : 'pending',
    sceneVersion: 0,
    sortVersion: 0,
    count: 0,
    textureSize: null,
    sampleCount: 0,
    thresholds: {
      centerMaxAbsDelta: 0.00001,
      covarianceMaxAbsDelta: 0.00001,
      orderMaxAbsDelta: 0.5
    },
    centerMaxAbsDelta: null,
    covarianceMaxAbsDelta: null,
    orderMaxAbsDelta: null,
    textures: {
      center: false,
      covarianceA: false,
      covarianceB: false,
      order: false
    }
  };
}

function resolveTextureLayout(count: number, maxTextureSize: number) {
  const width = Math.max(1, Math.min(maxTextureSize, Math.ceil(Math.sqrt(Math.max(1, count)))));
  const height = Math.max(1, Math.ceil(Math.max(1, count) / width));
  if (height > maxTextureSize) {
    throw new Error(`Packed texture layout exceeds max texture size ${maxTextureSize}.`);
  }
  return { width, height };
}

function textureCoord(index: number, width: number) {
  return {
    x: index % width,
    y: Math.floor(index / width)
  };
}

function textureSampleIndices(count: number) {
  if (count <= 0) return [];
  return Array.from(new Set([
    0,
    Math.floor((count - 1) / 2),
    count - 1
  ]));
}

function createRenderProfile(lodEnabled: boolean, renderedRatio: number, largeSceneFullDensity: boolean): RenderProfile {
  if (largeSceneFullDensity) {
    return {
      id: 'large-scene-full-density',
      ellipseExtent: FULL_DENSITY_ELLIPSE_EXTENT,
      minPixelAxis: FULL_DENSITY_MIN_PIXEL_AXIS,
      maxPixelAxis: FULL_DENSITY_MAX_PIXEL_AXIS,
      opacityScale: FULL_DENSITY_OPACITY_SCALE
    };
  }

  if (!lodEnabled) {
    return {
      id: 'standard',
      ellipseExtent: ELLIPSE_EXTENT,
      minPixelAxis: MIN_PIXEL_AXIS,
      maxPixelAxis: MAX_PIXEL_AXIS,
      opacityScale: OPACITY_SCALE
    };
  }

  const opacityRatio = Math.max(LOD_MIN_OPACITY_RATIO, Math.min(1, Math.sqrt(Math.max(0, renderedRatio))));
  return {
    id: 'large-scene-lod-softened',
    ellipseExtent: LOD_ELLIPSE_EXTENT,
    minPixelAxis: LOD_MIN_PIXEL_AXIS,
    maxPixelAxis: LOD_MAX_PIXEL_AXIS,
    opacityScale: OPACITY_SCALE * opacityRatio
  };
}

function readDiagnostics(): ArkGaussianDiagnostics {
  const params = new URLSearchParams(window.location.search);
  const rawSort = params.get('arkDiagSort')?.toLowerCase();
  const rawComposite = params.get('arkDiagComposite')?.toLowerCase();
  const rawProjection = params.get('arkDiagProjection')?.toLowerCase();
  const rawData = params.get('arkDiagData')?.toLowerCase();
  const sortOverride: ArkGaussianSortOverride = rawSort === 'source-order'
    ? 'source-order'
    : rawSort === 'exact-depth'
      ? 'exact-depth'
      : rawSort === 'bucket-depth'
        ? 'bucket-depth'
        : 'auto';
  const compositeMode: ArkGaussianCompositeMode = rawComposite === 'straight'
    || rawComposite === 'straight-alpha'
    ? 'straight-alpha'
    : 'premultiplied-alpha';
  const projectionProfile: ArkGaussianProjectionProfile = rawProjection === 'no-preblur'
    ? 'no-preblur'
    : rawProjection === 'unit-focal'
      ? 'unit-focal'
      : rawProjection === 'compact-kernel'
        ? 'compact-kernel'
        : rawProjection === 'aholo-material' || rawProjection === 'aholo-default'
          ? 'aholo-material'
          : 'default';
  const dataTextureMode: ArkGaussianDataTextureMode = rawData === 'texture-fetch'
    || rawData === 'fetch'
    || rawData === 'draw-texture'
    ? 'texture-fetch'
    : rawData === 'texture-audit'
    || rawData === 'packed-texture'
    || rawData === 'upload-audit'
      ? 'texture-audit'
      : 'off';

  return {
    enabled: sortOverride !== 'auto'
      || compositeMode !== 'premultiplied-alpha'
      || projectionProfile !== 'default'
      || dataTextureMode !== 'off',
    sortOverride,
    compositeMode,
    projectionProfile,
    dataTextureMode
  };
}

function createProjectionSettings(profile: ArkGaussianProjectionProfile): ArkGaussianProjectionSettings {
  if (profile === 'no-preblur') {
    return {
      profile,
      preBlurAmount: 0,
      blurAmount: BLUR_AMOUNT,
      focalAdjustment: FOCAL_ADJUSTMENT,
      maxStdDev: MAX_STD_DEV
    };
  }
  if (profile === 'unit-focal') {
    return {
      profile,
      preBlurAmount: PRE_BLUR_AMOUNT,
      blurAmount: BLUR_AMOUNT,
      focalAdjustment: 1,
      maxStdDev: MAX_STD_DEV
    };
  }
  if (profile === 'compact-kernel') {
    return {
      profile,
      preBlurAmount: PRE_BLUR_AMOUNT,
      blurAmount: BLUR_AMOUNT,
      focalAdjustment: FOCAL_ADJUSTMENT,
      maxStdDev: 2.05
    };
  }
  if (profile === 'aholo-material') {
    return {
      profile,
      preBlurAmount: 0,
      blurAmount: 0.3,
      focalAdjustment: 1,
      maxStdDev: MAX_STD_DEV
    };
  }
  return {
    profile,
    preBlurAmount: PRE_BLUR_AMOUNT,
    blurAmount: BLUR_AMOUNT,
    focalAdjustment: FOCAL_ADJUSTMENT,
    maxStdDev: MAX_STD_DEV
  };
}

function chooseSortMode(renderSplatCount: number, override: ArkGaussianSortOverride = 'auto'): SortMode {
  if (renderSplatCount <= 0) return 'disabled';
  if (override === 'source-order') return 'disabled';
  if (override === 'exact-depth') return renderSplatCount <= SORT_SPLAT_LIMIT ? 'exact-depth' : 'bucket-depth';
  if (override === 'bucket-depth') return renderSplatCount <= BUCKET_SORT_SPLAT_LIMIT ? 'bucket-depth' : 'disabled';
  if (renderSplatCount <= SORT_SPLAT_LIMIT) return 'exact-depth';
  if (renderSplatCount <= BUCKET_SORT_SPLAT_LIMIT) return 'bucket-depth';
  return 'disabled';
}

function createChannelMajorSh1RestIndices(shRestCount: number) {
  if (shRestCount < RENDER_SH_REST_COUNT || shRestCount % 3 !== 0) return [];
  const coefficientsPerChannel = shRestCount / 3;
  if (coefficientsPerChannel < 3) return [];
  // 3DGS PLY stores f_rest channel-major: all R coefficients, then G, then B.
  return [
    0, coefficientsPerChannel, coefficientsPerChannel * 2,
    1, coefficientsPerChannel + 1, coefficientsPerChannel * 2 + 1,
    2, coefficientsPerChannel + 2, coefficientsPerChannel * 2 + 2
  ];
}

function sortModeLabel(sortMode: SortMode) {
  if (sortMode === 'exact-depth') return 'cpu-exact-back-to-front';
  if (sortMode === 'bucket-depth') return 'cpu-bucket-back-to-front';
  return 'source-order';
}

function quantizeDepthToBucket(depth: number, minDepth: number, depthRange: number) {
  if (!Number.isFinite(depth)) return 0;
  if (depthRange <= 0.000001) return 0;
  return Math.max(0, Math.min(SORT_BUCKET_MAX, Math.floor(((depth - minDepth) / depthRange) * SORT_BUCKET_MAX)));
}

export class ArkGaussianRendererBackend implements ArkRendererBackend {
  readonly id = 'ark-gaussian-webgl2';

  private readonly canvas: HTMLCanvasElement;
  private readonly gl: Gl;
  private readonly program: WebGLProgram;
  private readonly textureFetchProgram: WebGLProgram;
  private readonly quadBuffer: WebGLBuffer;
  private readonly positionBuffer: WebGLBuffer;
  private readonly colorBuffer: WebGLBuffer;
  private readonly scaleBuffer: WebGLBuffer;
  private readonly rotationBuffer: WebGLBuffer;
  private readonly sh1Buffer: WebGLBuffer;
  private dataTextureFramebuffer: WebGLFramebuffer | null = null;
  private centerTexture: WebGLTexture | null = null;
  private covarianceATexture: WebGLTexture | null = null;
  private covarianceBTexture: WebGLTexture | null = null;
  private orderTexture: WebGLTexture | null = null;
  private readonly viewProjectionLocation: WebGLUniformLocation | null;
  private readonly viewLocation: WebGLUniformLocation | null;
  private readonly projectionLocation: WebGLUniformLocation | null;
  private readonly cameraPositionLocation: WebGLUniformLocation | null;
  private readonly viewportLocation: WebGLUniformLocation | null;
  private readonly ellipseExtentLocation: WebGLUniformLocation | null;
  private readonly minPixelAxisLocation: WebGLUniformLocation | null;
  private readonly maxPixelAxisLocation: WebGLUniformLocation | null;
  private readonly preBlurAmountLocation: WebGLUniformLocation | null;
  private readonly blurAmountLocation: WebGLUniformLocation | null;
  private readonly maxStdDevLocation: WebGLUniformLocation | null;
  private readonly focalAdjustmentLocation: WebGLUniformLocation | null;
  private readonly premultipliedAlphaLocation: WebGLUniformLocation | null;
  private readonly minClipWLocation: WebGLUniformLocation | null;
  private readonly clipPaddingLocation: WebGLUniformLocation | null;
  private readonly diagnostics = readDiagnostics();
  private readonly projectionSettings = createProjectionSettings(this.diagnostics.projectionProfile);
  private renderRequestHandler: (() => void) | null = null;
  private splatCount = 0;
  private renderSplatCount = 0;
  private renderSplatBudget = LARGE_SCENE_RENDER_SPLAT_BUDGET;
  private renderSamplingStride = 1;
  private lodEnabled = false;
  private lodReason = 'not-needed';
  private sceneVersion = 0;
  private sortVersion = 0;
  private cameraPosition: ArkVec3 = [0, 0, 6];
  private cameraTarget: ArkVec3 = [0, 0, 0];
  private cameraDistance = 6;
  private activeInfo: ArkLoadedSceneInfo | null = null;
  private lastLoadMs = 0;
  private lastReadMs = 0;
  private lastDecodeMs = 0;
  private lastPackMs = 0;
  private lastUploadMs = 0;
  private lastInputBytes = 0;
  private estimatedGpuUploadBytes = 0;
  private estimatedRetainedCpuBytes = 0;
  private estimatedLoadPeakBytes = 0;
  private lastRenderMs = 0;
  private maxRenderMs = 0;
  private totalRenderMs = 0;
  private renderCount = 0;
  private rawPositions: Float32Array | null = null;
  private rawColors: Float32Array | null = null;
  private rawScales: Float32Array | null = null;
  private rawRotations: Float32Array | null = null;
  private rawSh1: Float32Array | null = null;
  private sortedPositions: Float32Array | null = null;
  private sortedColors: Float32Array | null = null;
  private sortedScales: Float32Array | null = null;
  private sortedRotations: Float32Array | null = null;
  private sortedSh1: Float32Array | null = null;
  private sortMode: SortMode = 'disabled';
  private sortIndices: number[] = [];
  private sortOrder: Uint32Array | null = null;
  private sortDepths: Float32Array | null = null;
  private readonly sortBuckets = new Uint32Array(SORT_BUCKET_COUNT);
  private readonly sortBucketWriteOffsets = new Uint32Array(SORT_BUCKET_COUNT);
  private lastSortMs = 0;
  private lastSortedCount = 0;
  private sortEnabled = false;
  private sortDirty = false;
  private sortReason = 'no-scene';
  private lastSortDepthRange: [number, number] | null = null;
  private lastSortCameraPosition: ArkVec3 | null = null;
  private lastSortCameraForward: ArkVec3 | null = null;
  private axisMin = 0;
  private axisMax = 0;
  private axisMean = 0;
  private largeSceneFullDensity = false;
  private renderShDegree = 0;
  private renderShRestCount = 0;
  private renderProfile = createRenderProfile(false, 1, false);
  private dataTextureAudit = createIdleDataTextureAudit(this.diagnostics.dataTextureMode);

  constructor(private readonly host: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.host.appendChild(this.canvas);

    const gl = this.canvas.getContext('webgl2', {
      antialias: false,
      alpha: false,
      preserveDrawingBuffer: true
    });
    if (!gl) throw new Error('ARK Gaussian renderer requires WebGL2.');
    this.gl = gl;

    this.program = createProgram(
      this.gl,
      `
        attribute vec2 aQuad;
        attribute vec3 aPosition;
        attribute vec4 aColor;
        attribute vec3 aScale;
        attribute vec4 aRotation;
        attribute vec3 aSh1_0;
        attribute vec3 aSh1_1;
        attribute vec3 aSh1_2;
        uniform mat4 uViewProjection;
        uniform mat4 uView;
        uniform mat4 uProjection;
        uniform vec3 uCameraPosition;
        uniform vec2 uViewport;
        uniform float uEllipseExtent;
        uniform float uMinPixelAxis;
        uniform float uMaxPixelAxis;
        uniform float uPreBlurAmount;
        uniform float uBlurAmount;
        uniform float uMaxStdDev;
        uniform float uFocalAdjustment;
        uniform float uMinClipW;
        uniform float uClipPadding;
        varying vec4 vColor;
        varying float vClipDiscard;
        varying vec2 vSplatUv;

        vec3 rotateByQuaternion(vec4 q, vec3 value) {
          vec3 u = q.yzw;
          return value + 2.0 * cross(u, cross(u, value) + q.x * value);
        }

        vec3 evaluateSh1Color(vec3 baseColor, vec3 viewDir) {
          vec3 sh1 = aSh1_0 * (-${SH_C1.toFixed(7)} * viewDir.y)
            + aSh1_1 * (${SH_C1.toFixed(7)} * viewDir.z)
            + aSh1_2 * (-${SH_C1.toFixed(7)} * viewDir.x);
          return clamp(baseColor + sh1, 0.0, 1.0);
        }

        mat3 computeCovariance3D(vec4 q, vec3 scale) {
          vec3 axis0 = rotateByQuaternion(q, vec3(scale.x, 0.0, 0.0));
          vec3 axis1 = rotateByQuaternion(q, vec3(0.0, scale.y, 0.0));
          vec3 axis2 = rotateByQuaternion(q, vec3(0.0, 0.0, scale.z));
          float c00 = axis0.x * axis0.x + axis1.x * axis1.x + axis2.x * axis2.x;
          float c01 = axis0.x * axis0.y + axis1.x * axis1.y + axis2.x * axis2.y;
          float c02 = axis0.x * axis0.z + axis1.x * axis1.z + axis2.x * axis2.z;
          float c11 = axis0.y * axis0.y + axis1.y * axis1.y + axis2.y * axis2.y;
          float c12 = axis0.y * axis0.z + axis1.y * axis1.z + axis2.y * axis2.z;
          float c22 = axis0.z * axis0.z + axis1.z * axis1.z + axis2.z * axis2.z;
          return mat3(
            c00, c01, c02,
            c01, c11, c12,
            c02, c12, c22
          );
        }

        mat3 transposeMat3(mat3 value) {
          return mat3(
            value[0][0], value[1][0], value[2][0],
            value[0][1], value[1][1], value[2][1],
            value[0][2], value[1][2], value[2][2]
          );
        }

        void main() {
          vec4 centerClip = uViewProjection * vec4(aPosition, 1.0);
          vClipDiscard = 0.0;
          bool outsideClip = (
            centerClip.w <= uMinClipW
            || centerClip.z < -centerClip.w
            || centerClip.z > centerClip.w
          );
          vec2 centerNdc = vec2(0.0);
          if (!outsideClip) {
            centerNdc = centerClip.xy / centerClip.w;
            outsideClip = abs(centerNdc.x) > uClipPadding || abs(centerNdc.y) > uClipPadding;
          }
          if (outsideClip) {
            gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
            vColor = vec4(0.0);
            vSplatUv = vec2(999.0);
            vClipDiscard = 1.0;
            return;
          }
          vec4 q = normalize(aRotation);
          mat3 cov3D = computeCovariance3D(q, aScale);
          vec3 viewCenter = (uView * vec4(aPosition, 1.0)).xyz;
          vec2 scaledViewport = uViewport * uFocalAdjustment;
          vec2 focal = 0.5 * scaledViewport * vec2(uProjection[0][0], uProjection[1][1]);
          float invZ = 1.0 / min(viewCenter.z, -0.0001);
          vec2 j1 = focal * invZ;
          vec2 j2 = -(j1 * viewCenter.xy) * invZ;
          mat3 jacobian = mat3(
            j1.x, 0.0, 0.0,
            0.0, j1.y, 0.0,
            j2.x, j2.y, 0.0
          );
          mat3 viewLinear = mat3(uView);
          mat3 transform = jacobian * viewLinear;
          mat3 cov2D = transform * cov3D * transposeMat3(transform);
          float covA = max(cov2D[0][0], 0.0) + uPreBlurAmount;
          float covB = cov2D[0][1];
          float covC = max(cov2D[1][1], 0.0) + uPreBlurAmount;
          float detOriginal = max(covA * covC - covB * covB, 0.000001);
          covA += uBlurAmount;
          covC += uBlurAmount;
          float det = max(covA * covC - covB * covB, 0.000001);
          float blurAdjust = sqrt(max(0.0, detOriginal / det));
          vec3 viewDir = normalize(aPosition - uCameraPosition);
          vec3 shadedColor = evaluateSh1Color(aColor.rgb, viewDir);
          vec4 color = vec4(shadedColor, clamp(aColor.a * blurAdjust, 0.0, 1.0));
          if (color.a < ${ALPHA_CUTOFF.toFixed(6)}) {
            gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
            vColor = vec4(0.0);
            vSplatUv = vec2(999.0);
            vClipDiscard = 1.0;
            return;
          }

          float avg = 0.5 * (covA + covC);
          float delta = sqrt(max(avg * avg - det, 0.0));
          float minAxisSq = uMinPixelAxis * uMinPixelAxis;
          float lambdaMajor = max(avg + delta, minAxisSq);
          float lambdaMinor = max(avg - delta, minAxisSq);
          float maxRadius = min(uMaxPixelAxis * uFocalAdjustment, min(scaledViewport.x, scaledViewport.y));
          float kernelStdDev = min(uEllipseExtent, uMaxStdDev);
          float alphaFactor = min(1.0, 0.5 * sqrt(max(0.0, -log((1.0 / 255.0) / max(color.a, 0.0001)))));
          float axisMajorPixels = min(maxRadius, kernelStdDev * sqrt(lambdaMajor));
          float axisMinorPixels = min(maxRadius, kernelStdDev * sqrt(lambdaMinor));

          vec2 majorAxis = vec2(covB, lambdaMajor - covA);
          if (dot(majorAxis, majorAxis) < 0.0001) {
            majorAxis = covA >= covC ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
          }
          majorAxis = normalize(majorAxis);
          vec2 minorAxis = vec2(-majorAxis.y, majorAxis.x);

          vec2 pixelOffset = (
            majorAxis * (aQuad.x * axisMajorPixels)
            + minorAxis * (aQuad.y * axisMinorPixels)
          ) * alphaFactor;
          vec2 ndcOffset = pixelOffset * 2.0 / scaledViewport;

          gl_Position = centerClip;
          gl_Position.xy += ndcOffset * centerClip.w;
          vColor = color;
          vSplatUv = aQuad * kernelStdDev * alphaFactor;
        }
      `,
      `
        precision highp float;
        uniform float uMaxStdDev;
        uniform float uPremultipliedAlpha;
        varying vec4 vColor;
        varying vec2 vSplatUv;
        varying float vClipDiscard;
        void main() {
          if (vClipDiscard > 0.5) discard;
          float r2 = dot(vSplatUv, vSplatUv);
          if (r2 > uMaxStdDev * uMaxStdDev) discard;
          float alpha = vColor.a * exp(-0.5 * r2);
          if (alpha < ${ALPHA_CUTOFF.toFixed(6)}) discard;
          if (uPremultipliedAlpha > 0.5) {
            gl_FragColor = vec4(vColor.rgb * alpha, alpha);
          } else {
            gl_FragColor = vec4(vColor.rgb, alpha);
          }
        }
      `
    );
    this.textureFetchProgram = createProgram(
      this.gl,
      `#version 300 es
        precision highp float;
        in vec2 aQuad;
        in vec4 aColor;
        in vec3 aSh1_0;
        in vec3 aSh1_1;
        in vec3 aSh1_2;
        uniform mat4 uViewProjection;
        uniform mat4 uView;
        uniform mat4 uProjection;
        uniform vec3 uCameraPosition;
        uniform vec2 uViewport;
        uniform float uEllipseExtent;
        uniform float uMinPixelAxis;
        uniform float uMaxPixelAxis;
        uniform float uPreBlurAmount;
        uniform float uBlurAmount;
        uniform float uMaxStdDev;
        uniform float uFocalAdjustment;
        uniform float uMinClipW;
        uniform float uClipPadding;
        uniform vec2 uDataTextureSize;
        uniform sampler2D uCenterTex;
        uniform sampler2D uCovarianceATex;
        uniform sampler2D uCovarianceBTex;
        uniform sampler2D uOrderTex;
        out vec4 vColor;
        out float vClipDiscard;
        out vec2 vSplatUv;

        ivec2 dataCoord(int index) {
          int width = int(uDataTextureSize.x);
          return ivec2(index - (index / width) * width, index / width);
        }

        int readSourceIndex(int sortedIndex) {
          return int(texelFetch(uOrderTex, dataCoord(sortedIndex), 0).r + 0.5);
        }

        mat3 unpackCovariance3D(int sourceIndex) {
          vec4 covA = texelFetch(uCovarianceATex, dataCoord(sourceIndex), 0);
          vec4 covB = texelFetch(uCovarianceBTex, dataCoord(sourceIndex), 0);
          float xx = exp2(covA.x);
          float yy = exp2(covA.y);
          float zz = exp2(covA.z);
          float xy = covA.w * sqrt(max(xx * yy, 0.0));
          float xz = covB.x * sqrt(max(xx * zz, 0.0));
          float yz = covB.y * sqrt(max(yy * zz, 0.0));
          return mat3(
            xx, xy, xz,
            xy, yy, yz,
            xz, yz, zz
          );
        }

        vec3 evaluateSh1Color(vec3 baseColor, vec3 viewDir) {
          vec3 sh1 = aSh1_0 * (-${SH_C1.toFixed(7)} * viewDir.y)
            + aSh1_1 * (${SH_C1.toFixed(7)} * viewDir.z)
            + aSh1_2 * (-${SH_C1.toFixed(7)} * viewDir.x);
          return clamp(baseColor + sh1, 0.0, 1.0);
        }

        mat3 transposeMat3(mat3 value) {
          return mat3(
            value[0][0], value[1][0], value[2][0],
            value[0][1], value[1][1], value[2][1],
            value[0][2], value[1][2], value[2][2]
          );
        }

        void main() {
          int sourceIndex = readSourceIndex(gl_InstanceID);
          vec3 center = texelFetch(uCenterTex, dataCoord(sourceIndex), 0).xyz;
          vec4 centerClip = uViewProjection * vec4(center, 1.0);
          vClipDiscard = 0.0;
          bool outsideClip = (
            centerClip.w <= uMinClipW
            || centerClip.z < -centerClip.w
            || centerClip.z > centerClip.w
          );
          vec2 centerNdc = vec2(0.0);
          if (!outsideClip) {
            centerNdc = centerClip.xy / centerClip.w;
            outsideClip = abs(centerNdc.x) > uClipPadding || abs(centerNdc.y) > uClipPadding;
          }
          if (outsideClip) {
            gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
            vColor = vec4(0.0);
            vSplatUv = vec2(999.0);
            vClipDiscard = 1.0;
            return;
          }
          mat3 cov3D = unpackCovariance3D(sourceIndex);
          vec3 viewCenter = (uView * vec4(center, 1.0)).xyz;
          vec2 scaledViewport = uViewport * uFocalAdjustment;
          vec2 focal = 0.5 * scaledViewport * vec2(uProjection[0][0], uProjection[1][1]);
          float invZ = 1.0 / min(viewCenter.z, -0.0001);
          vec2 j1 = focal * invZ;
          vec2 j2 = -(j1 * viewCenter.xy) * invZ;
          mat3 jacobian = mat3(
            j1.x, 0.0, 0.0,
            0.0, j1.y, 0.0,
            j2.x, j2.y, 0.0
          );
          mat3 viewLinear = mat3(uView);
          mat3 transform = jacobian * viewLinear;
          mat3 cov2D = transform * cov3D * transposeMat3(transform);
          float covA = max(cov2D[0][0], 0.0) + uPreBlurAmount;
          float covB = cov2D[0][1];
          float covC = max(cov2D[1][1], 0.0) + uPreBlurAmount;
          float detOriginal = max(covA * covC - covB * covB, 0.000001);
          covA += uBlurAmount;
          covC += uBlurAmount;
          float det = max(covA * covC - covB * covB, 0.000001);
          float blurAdjust = sqrt(max(0.0, detOriginal / det));
          vec3 viewDir = normalize(center - uCameraPosition);
          vec3 shadedColor = evaluateSh1Color(aColor.rgb, viewDir);
          vec4 color = vec4(shadedColor, clamp(aColor.a * blurAdjust, 0.0, 1.0));
          if (color.a < ${ALPHA_CUTOFF.toFixed(6)}) {
            gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
            vColor = vec4(0.0);
            vSplatUv = vec2(999.0);
            vClipDiscard = 1.0;
            return;
          }

          float avg = 0.5 * (covA + covC);
          float delta = sqrt(max(avg * avg - det, 0.0));
          float minAxisSq = uMinPixelAxis * uMinPixelAxis;
          float lambdaMajor = max(avg + delta, minAxisSq);
          float lambdaMinor = max(avg - delta, minAxisSq);
          float maxRadius = min(uMaxPixelAxis * uFocalAdjustment, min(scaledViewport.x, scaledViewport.y));
          float kernelStdDev = min(uEllipseExtent, uMaxStdDev);
          float alphaFactor = min(1.0, 0.5 * sqrt(max(0.0, -log((1.0 / 255.0) / max(color.a, 0.0001)))));
          float axisMajorPixels = min(maxRadius, kernelStdDev * sqrt(lambdaMajor));
          float axisMinorPixels = min(maxRadius, kernelStdDev * sqrt(lambdaMinor));

          vec2 majorAxis = vec2(covB, lambdaMajor - covA);
          if (dot(majorAxis, majorAxis) < 0.0001) {
            majorAxis = covA >= covC ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
          }
          majorAxis = normalize(majorAxis);
          vec2 minorAxis = vec2(-majorAxis.y, majorAxis.x);

          vec2 pixelOffset = (
            majorAxis * (aQuad.x * axisMajorPixels)
            + minorAxis * (aQuad.y * axisMinorPixels)
          ) * alphaFactor;
          vec2 ndcOffset = pixelOffset * 2.0 / scaledViewport;

          gl_Position = centerClip;
          gl_Position.xy += ndcOffset * centerClip.w;
          vColor = color;
          vSplatUv = aQuad * kernelStdDev * alphaFactor;
        }
      `,
      `#version 300 es
        precision highp float;
        uniform float uMaxStdDev;
        uniform float uPremultipliedAlpha;
        in vec4 vColor;
        in vec2 vSplatUv;
        in float vClipDiscard;
        out vec4 outColor;
        void main() {
          if (vClipDiscard > 0.5) discard;
          float r2 = dot(vSplatUv, vSplatUv);
          if (r2 > uMaxStdDev * uMaxStdDev) discard;
          float alpha = vColor.a * exp(-0.5 * r2);
          if (alpha < ${ALPHA_CUTOFF.toFixed(6)}) discard;
          if (uPremultipliedAlpha > 0.5) {
            outColor = vec4(vColor.rgb * alpha, alpha);
          } else {
            outColor = vec4(vColor.rgb, alpha);
          }
        }
      `
    );

    const quad = this.gl.createBuffer();
    const position = this.gl.createBuffer();
    const color = this.gl.createBuffer();
    const scale = this.gl.createBuffer();
    const rotation = this.gl.createBuffer();
    const sh1 = this.gl.createBuffer();
    if (!quad || !position || !color || !scale || !rotation || !sh1) throw new Error('Could not create WebGL buffers.');
    this.quadBuffer = quad;
    this.positionBuffer = position;
    this.colorBuffer = color;
    this.scaleBuffer = scale;
    this.rotationBuffer = rotation;
    this.sh1Buffer = sh1;
    this.viewProjectionLocation = this.gl.getUniformLocation(this.program, 'uViewProjection');
    this.viewLocation = this.gl.getUniformLocation(this.program, 'uView');
    this.projectionLocation = this.gl.getUniformLocation(this.program, 'uProjection');
    this.cameraPositionLocation = this.gl.getUniformLocation(this.program, 'uCameraPosition');
    this.viewportLocation = this.gl.getUniformLocation(this.program, 'uViewport');
    this.ellipseExtentLocation = this.gl.getUniformLocation(this.program, 'uEllipseExtent');
    this.minPixelAxisLocation = this.gl.getUniformLocation(this.program, 'uMinPixelAxis');
    this.maxPixelAxisLocation = this.gl.getUniformLocation(this.program, 'uMaxPixelAxis');
    this.preBlurAmountLocation = this.gl.getUniformLocation(this.program, 'uPreBlurAmount');
    this.blurAmountLocation = this.gl.getUniformLocation(this.program, 'uBlurAmount');
    this.maxStdDevLocation = this.gl.getUniformLocation(this.program, 'uMaxStdDev');
    this.focalAdjustmentLocation = this.gl.getUniformLocation(this.program, 'uFocalAdjustment');
    this.premultipliedAlphaLocation = this.gl.getUniformLocation(this.program, 'uPremultipliedAlpha');
    this.minClipWLocation = this.gl.getUniformLocation(this.program, 'uMinClipW');
    this.clipPaddingLocation = this.gl.getUniformLocation(this.program, 'uClipPadding');
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quadBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,
      1, -1,
      -1, 1,
      -1, 1,
      1, -1,
      1, 1
    ]), this.gl.STATIC_DRAW);
    this.resize();
  }

  setRenderRequestHandler(handler: () => void) {
    this.renderRequestHandler = handler;
  }

  async loadGaussian(request: ArkGaussianLoadRequest): Promise<ArkLoadedSceneInfo> {
    if (!request.filename.toLowerCase().endsWith('.ply')) {
      throw new Error('ARK first-party Gaussian renderer currently supports PLY only.');
    }
    this.resetDataTextureAudit();

    const startedAt = performance.now();
    request.onStatus?.({ phase: 'Parsing', message: 'ARK first-party parser reading PLY data...' });
    const readStartedAt = performance.now();
    const inputBuffer = await readInput(request.input);
    this.lastReadMs = performance.now() - readStartedAt;
    this.lastInputBytes = inputBuffer.byteLength;
    const header = parseGaussianPlyHeader(inputBuffer);
    const shRestIndices = createChannelMajorSh1RestIndices(header.shRestCount);

    const decodeStartedAt = performance.now();
    const data = decodeGaussianPly(inputBuffer, {
      includeShRest: shRestIndices.length === RENDER_SH_REST_COUNT,
      shRestIndices,
      invalidPolicy: 'skip',
      percentileBounds: request.fitBounds ? undefined : [COMPUTED_FIT_BOUNDS_SPEC]
    });
    this.lastDecodeMs = performance.now() - decodeStartedAt;
    const fitBounds = inferPlyFitBounds(
      request,
      data.summary.bounds.min,
      data.summary.bounds.max,
      data.summary.percentileBounds
    );
    const center = boundsCenter(fitBounds);
    const maxDim = boundsMaxDim(fitBounds);
    const displayScale = maxDim > 0 ? 4 / maxDim : 1;
    const fitRadius = Math.max(2.5, maxDim * displayScale * 0.75);

    request.onStatus?.({ phase: 'Packing', message: 'Packing ARK Gaussian buffers...' });
    const packStartedAt = performance.now();
    const renderSplatCount = data.count > SORT_SPLAT_LIMIT && data.count > FULL_DENSITY_SPLAT_LIMIT
      ? Math.min(data.count, LARGE_SCENE_RENDER_SPLAT_BUDGET)
      : data.count;
    const renderSamplingStride = renderSplatCount > 0 ? data.count / renderSplatCount : 1;
    const lodEnabled = renderSplatCount < data.count;
    const largeSceneFullDensity = data.count > SORT_SPLAT_LIMIT && !lodEnabled;
    const renderedRatio = data.count > 0 ? renderSplatCount / data.count : 1;
    const renderProfile = createRenderProfile(lodEnabled, renderedRatio, largeSceneFullDensity);
    const positions = new Float32Array(renderSplatCount * 3);
    const colors = new Float32Array(renderSplatCount * 4);
    const scales = new Float32Array(renderSplatCount * 3);
    const rotations = new Float32Array(renderSplatCount * 4);
    const sh1 = new Float32Array(renderSplatCount * RENDER_SH_REST_COUNT);
    let axisSum = 0;
    let axisMin = Infinity;
    let axisMax = -Infinity;
    for (let renderIndex = 0; renderIndex < renderSplatCount; renderIndex += 1) {
      const sourceIndex = lodEnabled
        ? Math.min(data.count - 1, Math.floor(renderIndex * renderSamplingStride))
        : renderIndex;
      positions[renderIndex * 3] = (data.centers[sourceIndex * 3] - center[0]) * displayScale;
      positions[renderIndex * 3 + 1] = (data.centers[sourceIndex * 3 + 1] - center[1]) * displayScale;
      positions[renderIndex * 3 + 2] = (data.centers[sourceIndex * 3 + 2] - center[2]) * displayScale;
      colors[renderIndex * 4] = clamp01(0.5 + data.colorsDc[sourceIndex * 3] * SH_C0);
      colors[renderIndex * 4 + 1] = clamp01(0.5 + data.colorsDc[sourceIndex * 3 + 1] * SH_C0);
      colors[renderIndex * 4 + 2] = clamp01(0.5 + data.colorsDc[sourceIndex * 3 + 2] * SH_C0);
      colors[renderIndex * 4 + 3] = clamp01(sigmoid(data.opacities[sourceIndex]) * renderProfile.opacityScale);
      if (data.shRest) {
        const sourceShOffset = sourceIndex * RENDER_SH_REST_COUNT;
        const targetShOffset = renderIndex * RENDER_SH_REST_COUNT;
        for (let coefficient = 0; coefficient < RENDER_SH_REST_COUNT; coefficient += 1) {
          sh1[targetShOffset + coefficient] = data.shRest[sourceShOffset + coefficient] ?? 0;
        }
      }

      const sx = decodeScale(data.scales[sourceIndex * 3], displayScale);
      const sy = decodeScale(data.scales[sourceIndex * 3 + 1], displayScale);
      const sz = decodeScale(data.scales[sourceIndex * 3 + 2], displayScale);
      scales[renderIndex * 3] = sx;
      scales[renderIndex * 3 + 1] = sy;
      scales[renderIndex * 3 + 2] = sz;
      const maxAxis = Math.max(sx, sy, sz);
      axisMin = Math.min(axisMin, sx, sy, sz);
      axisMax = Math.max(axisMax, maxAxis);
      axisSum += maxAxis;

      const q = normalizeQuaternion(
        data.rotations[sourceIndex * 4],
        data.rotations[sourceIndex * 4 + 1],
        data.rotations[sourceIndex * 4 + 2],
        data.rotations[sourceIndex * 4 + 3]
      );
      rotations[renderIndex * 4] = q[0];
      rotations[renderIndex * 4 + 1] = q[1];
      rotations[renderIndex * 4 + 2] = q[2];
      rotations[renderIndex * 4 + 3] = q[3];
    }

    const sortMode = chooseSortMode(renderSplatCount, this.diagnostics.sortOverride);
    const sortEnabled = sortMode !== 'disabled';
    this.rawPositions = positions;
    this.rawColors = colors;
    this.rawScales = scales;
    this.rawRotations = rotations;
    this.rawSh1 = sh1;
    this.sortedPositions = sortEnabled ? new Float32Array(positions.length) : positions;
    this.sortedColors = sortEnabled ? new Float32Array(colors.length) : colors;
    this.sortedScales = sortEnabled ? new Float32Array(scales.length) : scales;
    this.sortedRotations = sortEnabled ? new Float32Array(rotations.length) : rotations;
    this.sortedSh1 = sortEnabled ? new Float32Array(sh1.length) : sh1;
    this.sortMode = sortMode;
    this.sortIndices = sortMode === 'exact-depth' ? Array.from({ length: renderSplatCount }, (_, index) => index) : [];
    this.sortOrder = sortMode === 'bucket-depth' ? new Uint32Array(renderSplatCount) : null;
    this.sortDepths = sortEnabled ? new Float32Array(renderSplatCount) : null;
    this.sortEnabled = sortEnabled;
    this.sortDirty = this.sortEnabled;
    this.sortReason = this.sortEnabled
      ? `${sortMode}-pending-camera-sort${lodEnabled ? '-lod-budget' : ''}`
      : `disabled-over-${BUCKET_SORT_SPLAT_LIMIT}-rendered-splats`;
    this.lastSortMs = 0;
    this.lastSortedCount = this.sortEnabled ? 0 : renderSplatCount;
    this.lastSortDepthRange = null;
    this.lastSortCameraPosition = null;
    this.lastSortCameraForward = null;
    this.axisMin = Number.isFinite(axisMin) ? axisMin : 0;
    this.axisMax = Number.isFinite(axisMax) ? axisMax : 0;
    this.axisMean = renderSplatCount > 0 ? axisSum / renderSplatCount : 0;
    this.renderShDegree = data.shRest ? RENDER_SH_DEGREE : 0;
    this.renderShRestCount = data.shRest ? RENDER_SH_REST_COUNT : 0;
    this.renderProfile = renderProfile;
    this.estimatedGpuUploadBytes = positions.byteLength + colors.byteLength + scales.byteLength + rotations.byteLength + sh1.byteLength;
    const decodedSourceBytes = data.centers.byteLength
      + data.colorsDc.byteLength
      + data.opacities.byteLength
      + data.scales.byteLength
      + data.rotations.byteLength
      + data.sourceIndices.byteLength
      + data.invalidSourceIndices.byteLength
      + (data.shRest?.byteLength ?? 0);
    const sortBufferBytes = this.sortEnabled && this.sortedPositions && this.sortedColors && this.sortedScales && this.sortedRotations
      ? this.sortedPositions.byteLength
        + this.sortedColors.byteLength
        + this.sortedScales.byteLength
        + this.sortedRotations.byteLength
        + (this.sortedSh1?.byteLength ?? 0)
        + (this.sortDepths?.byteLength ?? 0)
        + (this.sortOrder?.byteLength ?? 0)
        + this.sortIndices.length * 4
      : 0;
    this.estimatedRetainedCpuBytes = this.estimatedGpuUploadBytes + sortBufferBytes;
    this.estimatedLoadPeakBytes = inputBuffer.byteLength + decodedSourceBytes + this.estimatedRetainedCpuBytes;
    this.lastPackMs = performance.now() - packStartedAt;

    const uploadStartedAt = performance.now();
    this.uploadGaussianBuffers(
      this.sortEnabled ? positions : this.sortedPositions,
      this.sortEnabled ? colors : this.sortedColors,
      this.sortEnabled ? scales : this.sortedScales,
      this.sortEnabled ? rotations : this.sortedRotations,
      this.sortEnabled ? sh1 : this.sortedSh1
    );
    this.lastUploadMs = performance.now() - uploadStartedAt;
    this.splatCount = data.count;
    this.renderSplatCount = renderSplatCount;
    this.renderSplatBudget = LARGE_SCENE_RENDER_SPLAT_BUDGET;
    this.renderSamplingStride = renderSamplingStride;
    this.lodEnabled = lodEnabled;
    this.largeSceneFullDensity = largeSceneFullDensity;
    this.lodReason = lodEnabled
      ? `decoded-over-${SORT_SPLAT_LIMIT}-splats-render-budget-${LARGE_SCENE_RENDER_SPLAT_BUDGET}`
      : largeSceneFullDensity
        ? `decoded-under-${FULL_DENSITY_SPLAT_LIMIT}-full-density-rendering`
        : 'not-needed';
    this.sceneVersion += 1;
    this.lastLoadMs = performance.now() - startedAt;
    this.lastRenderMs = 0;
    this.maxRenderMs = 0;
    this.totalRenderMs = 0;
    this.renderCount = 0;
    this.activeInfo = {
      name: request.name,
      format: 'PLY',
      splats: data.count,
      shDegree: data.shDegree,
      denseMin: fitBounds.min,
      denseMax: fitBounds.max,
      displayScale,
      fitRadius,
      fitBoundsId: fitBounds.id,
      fitBoundsSource: fitBounds.source,
      source: request.source,
      assetId: request.asset?.id,
      assetRole: request.asset?.role,
      sourceAssetId: request.asset?.sourceAssetId,
      declaredSplats: request.asset?.splats,
      sourceSplats: request.sourceSplats,
      coverageRatio: request.sourceSplats && request.sourceSplats > 0 ? data.count / request.sourceSplats : undefined
    };

    request.onStatus?.({ phase: 'Loaded', message: 'ARK Gaussian renderer buffers ready.' });
    this.invalidate();
    return this.activeInfo;
  }

  setCameraLookAt(position: ArkVec3, target: ArkVec3, distance: number) {
    this.cameraPosition = position;
    this.cameraTarget = target;
    this.cameraDistance = distance;
    if (this.sortEnabled) {
      const cameraForward = this.getCameraForward();
      const sortReuseEpsilon = this.sortMode === 'bucket-depth' ? BUCKET_SORT_CAMERA_EPSILON : CAMERA_EPSILON;
      if (!this.shouldReuseSort(cameraForward, sortReuseEpsilon)) {
        this.sortDirty = true;
        this.sortReason = 'camera-changed';
      } else {
        this.sortReason = 'camera-change-within-sort-threshold';
      }
    }
    this.invalidate();
  }

  resize() {
    const width = Math.max(1, Math.floor(this.host.clientWidth));
    const height = Math.max(1, Math.floor(this.host.clientHeight));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  render() {
    const renderStartedAt = performance.now();
    this.resize();
    this.gl.clearColor(0.06, 0.07, 0.065, 1);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
    if (this.renderSplatCount) {
      this.updateSortedBuffers();
      this.runDataTextureAuditIfNeeded();
      if (this.shouldUseTextureFetchDraw()) {
        this.renderTextureFetchDraw();
        this.recordRenderTiming(renderStartedAt);
        return;
      }

      this.gl.useProgram(this.program);
      const fovRadians = Math.PI / 3;
      const projection = perspective(fovRadians, this.canvas.width / this.canvas.height, 0.01, 10000);
      const view = lookAt(this.cameraPosition, this.cameraTarget, [0, -1, 0]);
      this.gl.uniformMatrix4fv(this.viewProjectionLocation, false, multiplyMat4(projection, view));
      this.gl.uniformMatrix4fv(this.viewLocation, false, view);
      this.gl.uniformMatrix4fv(this.projectionLocation, false, projection);
      this.gl.uniform3f(this.cameraPositionLocation, this.cameraPosition[0], this.cameraPosition[1], this.cameraPosition[2]);
      this.gl.uniform2f(this.viewportLocation, this.canvas.width, this.canvas.height);
      this.gl.uniform1f(this.ellipseExtentLocation, Math.min(this.renderProfile.ellipseExtent, this.projectionSettings.maxStdDev));
      this.gl.uniform1f(this.minPixelAxisLocation, this.renderProfile.minPixelAxis);
      this.gl.uniform1f(this.maxPixelAxisLocation, this.renderProfile.maxPixelAxis);
      this.gl.uniform1f(this.preBlurAmountLocation, this.projectionSettings.preBlurAmount);
      this.gl.uniform1f(this.blurAmountLocation, this.projectionSettings.blurAmount);
      this.gl.uniform1f(this.maxStdDevLocation, this.projectionSettings.maxStdDev);
      this.gl.uniform1f(this.focalAdjustmentLocation, this.projectionSettings.focalAdjustment);
      this.gl.uniform1f(this.premultipliedAlphaLocation, this.diagnostics.compositeMode === 'premultiplied-alpha' ? 1 : 0);
      this.gl.uniform1f(this.minClipWLocation, MIN_CLIP_W);
      this.gl.uniform1f(this.clipPaddingLocation, OFFSCREEN_CLIP_PADDING);

      const quadLocation = this.gl.getAttribLocation(this.program, 'aQuad');
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quadBuffer);
      this.gl.enableVertexAttribArray(quadLocation);
      this.gl.vertexAttribPointer(quadLocation, 2, this.gl.FLOAT, false, 0, 0);
      this.gl.vertexAttribDivisor(quadLocation, 0);

      const positionLocation = this.gl.getAttribLocation(this.program, 'aPosition');
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);
      this.gl.enableVertexAttribArray(positionLocation);
      this.gl.vertexAttribPointer(positionLocation, 3, this.gl.FLOAT, false, 0, 0);
      this.gl.vertexAttribDivisor(positionLocation, 1);

      const colorLocation = this.gl.getAttribLocation(this.program, 'aColor');
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.colorBuffer);
      this.gl.enableVertexAttribArray(colorLocation);
      this.gl.vertexAttribPointer(colorLocation, 4, this.gl.FLOAT, false, 0, 0);
      this.gl.vertexAttribDivisor(colorLocation, 1);

      const scaleLocation = this.gl.getAttribLocation(this.program, 'aScale');
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.scaleBuffer);
      this.gl.enableVertexAttribArray(scaleLocation);
      this.gl.vertexAttribPointer(scaleLocation, 3, this.gl.FLOAT, false, 0, 0);
      this.gl.vertexAttribDivisor(scaleLocation, 1);

      const rotationLocation = this.gl.getAttribLocation(this.program, 'aRotation');
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.rotationBuffer);
      this.gl.enableVertexAttribArray(rotationLocation);
      this.gl.vertexAttribPointer(rotationLocation, 4, this.gl.FLOAT, false, 0, 0);
      this.gl.vertexAttribDivisor(rotationLocation, 1);

      const sh10Location = this.gl.getAttribLocation(this.program, 'aSh1_0');
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.sh1Buffer);
      this.gl.enableVertexAttribArray(sh10Location);
      this.gl.vertexAttribPointer(sh10Location, 3, this.gl.FLOAT, false, RENDER_SH_REST_COUNT * 4, 0);
      this.gl.vertexAttribDivisor(sh10Location, 1);

      const sh11Location = this.gl.getAttribLocation(this.program, 'aSh1_1');
      this.gl.enableVertexAttribArray(sh11Location);
      this.gl.vertexAttribPointer(sh11Location, 3, this.gl.FLOAT, false, RENDER_SH_REST_COUNT * 4, 3 * 4);
      this.gl.vertexAttribDivisor(sh11Location, 1);

      const sh12Location = this.gl.getAttribLocation(this.program, 'aSh1_2');
      this.gl.enableVertexAttribArray(sh12Location);
      this.gl.vertexAttribPointer(sh12Location, 3, this.gl.FLOAT, false, RENDER_SH_REST_COUNT * 4, 6 * 4);
      this.gl.vertexAttribDivisor(sh12Location, 1);

      this.gl.disable(this.gl.DEPTH_TEST);
      this.gl.enable(this.gl.BLEND);
      if (this.diagnostics.compositeMode === 'premultiplied-alpha') {
        this.gl.blendFunc(this.gl.ONE, this.gl.ONE_MINUS_SRC_ALPHA);
      } else {
        this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
      }
      this.gl.drawArraysInstanced(this.gl.TRIANGLES, 0, 6, this.renderSplatCount);
    }
    this.recordRenderTiming(renderStartedAt);
  }

  invalidate() {
    this.renderRequestHandler?.();
  }

  getDebugState(includeSample = false): ArkRendererDebugState {
    const dataAccess = this.getDataAccessState();
    return {
      camera: {
        fov: 60,
        near: 0.01,
        far: 10000,
        aspect: this.canvas.width / Math.max(1, this.canvas.height),
        up: [0, -1, 0],
        position: this.cameraPosition,
        target: this.cameraTarget,
        distance: this.cameraDistance
      },
      canvas: {
        width: this.canvas.width,
        height: this.canvas.height,
        clientWidth: this.canvas.clientWidth,
        clientHeight: this.canvas.clientHeight
      },
      renderer: {
        id: this.id,
        backend: {
          family: 'ark-first-party',
          mode: 'instanced-ellipse-gaussian-renderer'
        }
      },
      pipeline: {
        shader: 'sh0-jacobian-covariance-gaussian',
        sorting: sortModeLabel(this.sortMode),
        scaleAware: true,
        opacityAware: true,
        gaussianProjection: true,
        covarianceProjection: true,
        instancing: true,
        dataPacking: dataAccess.dataPacking,
        covarianceStorage: dataAccess.covarianceStorage,
        orderAccess: dataAccess.orderAccess,
        dataTextureMode: this.diagnostics.dataTextureMode,
        dataTextureAudit: this.dataTextureAudit,
        projectionModel: 'jacobian-covariance',
        projectionProfile: this.projectionSettings.profile,
        composite: this.diagnostics.compositeMode,
        shading: this.renderShDegree > 0 ? 'sh1-view-dependent' : 'sh0-dc-only',
        sourceShDegree: this.activeInfo?.shDegree ?? null,
        renderShDegree: this.renderShDegree,
        renderShRestCount: this.renderShRestCount,
        diagnostics: this.diagnostics
      },
      scene: {
        splats: this.splatCount,
        splatCounts: this.splatCount,
        renderedSplats: this.renderSplatCount,
        sceneVersion: this.sceneVersion
      },
      splattingPlugin: null,
      splat: this.activeInfo,
      renderInfo: {
        lastLoadMs: Math.round(this.lastLoadMs),
        lastSortMs: Number(this.lastSortMs.toFixed(3)),
        sortEnabled: this.sortEnabled,
        sortMode: this.sortMode,
        sortReason: this.sortReason,
        dataPacking: dataAccess.dataPacking,
        covarianceStorage: dataAccess.covarianceStorage,
        orderAccess: dataAccess.orderAccess,
        dataTextureAudit: this.dataTextureAudit,
        sortDepthRange: this.lastSortDepthRange,
        sortedSplats: this.lastSortedCount,
        renderedSplats: this.renderSplatCount,
        sortVersion: this.sortVersion,
        lod: {
          enabled: this.lodEnabled,
          mode: this.lodEnabled ? 'deterministic-stride-budget' : 'full-resolution',
          decodedSplats: this.splatCount,
          renderedSplats: this.renderSplatCount,
          budgetSplats: this.renderSplatBudget,
          samplingStride: roundMs(this.renderSamplingStride),
          renderedRatio: this.splatCount > 0 ? Number((this.renderSplatCount / this.splatCount).toFixed(6)) : 0,
          reason: this.lodReason
        },
        diagnostics: this.diagnostics,
        performance: {
          inputBytes: this.lastInputBytes,
          inputMiB: bytesToMiB(this.lastInputBytes),
          readMs: roundMs(this.lastReadMs),
          decodeMs: roundMs(this.lastDecodeMs),
          packMs: roundMs(this.lastPackMs),
          uploadMs: roundMs(this.lastUploadMs),
          totalLoadMs: roundMs(this.lastLoadMs),
          retainedCpuBufferBytes: this.estimatedRetainedCpuBytes,
          retainedCpuBufferMiB: bytesToMiB(this.estimatedRetainedCpuBytes),
          gpuUploadBytes: this.estimatedGpuUploadBytes,
          gpuUploadMiB: bytesToMiB(this.estimatedGpuUploadBytes),
          loadPeakBytes: this.estimatedLoadPeakBytes,
          loadPeakMiB: bytesToMiB(this.estimatedLoadPeakBytes),
          sortSplatLimit: SORT_SPLAT_LIMIT,
          bucketSortSplatLimit: BUCKET_SORT_SPLAT_LIMIT,
          sortBucketCount: SORT_BUCKET_COUNT,
          fullDensitySplatLimit: FULL_DENSITY_SPLAT_LIMIT
        },
        largeScene: {
          fullDensity: this.largeSceneFullDensity,
          fullDensitySplatLimit: FULL_DENSITY_SPLAT_LIMIT,
          cpuSortSplatLimit: SORT_SPLAT_LIMIT,
          bucketSortSplatLimit: BUCKET_SORT_SPLAT_LIMIT,
          sortingLimited: this.largeSceneFullDensity && !this.sortEnabled,
          strategy: this.largeSceneFullDensity
            ? this.sortEnabled
              ? 'full-density-bucket-depth-sort'
              : 'full-density-source-order'
            : this.lodEnabled
              ? 'deterministic-stride-budget'
              : 'full-resolution-sorted'
        },
        frameTiming: {
          lastRenderMs: roundMs(this.lastRenderMs),
          maxRenderMs: roundMs(this.maxRenderMs),
          averageRenderMs: this.renderCount > 0 ? roundMs(this.totalRenderMs / this.renderCount) : 0,
          renderCount: this.renderCount
        },
        ellipse: {
          profile: this.renderProfile.id,
          extent: Math.min(this.renderProfile.ellipseExtent, this.projectionSettings.maxStdDev),
          maxStdDev: this.projectionSettings.maxStdDev,
          preBlurAmount: this.projectionSettings.preBlurAmount,
          blurAmount: this.projectionSettings.blurAmount,
          focalAdjustment: this.projectionSettings.focalAdjustment,
          minPixelAxis: this.renderProfile.minPixelAxis,
          maxPixelAxis: this.renderProfile.maxPixelAxis,
          opacityScale: this.renderProfile.opacityScale,
          baseOpacityScale: OPACITY_SCALE,
          alphaCutoff: ALPHA_CUTOFF,
          clipping: {
            minClipW: MIN_CLIP_W,
            offscreenPadding: OFFSCREEN_CLIP_PADDING,
            centerClip: true,
            nearFarClip: true
          },
          sourceAxis: {
            min: Number(this.axisMin.toFixed(6)),
            max: Number(this.axisMax.toFixed(6)),
            mean: Number(this.axisMean.toFixed(6))
          }
        },
        note: this.lodEnabled
          ? 'Instanced Jacobian covariance Gaussian renderer using SH1 view-dependent color, opacity, scale, rotation, softened deterministic stride LOD, and CPU depth sorting on the render budget.'
          : this.largeSceneFullDensity
            ? 'Instanced Jacobian covariance Gaussian renderer using SH1 view-dependent color, opacity, scale, rotation, full-density large-scene rendering, bucket depth sorting, and premultiplied alpha compositing.'
            : 'Instanced Jacobian covariance Gaussian renderer using SH1 view-dependent color, opacity, scale, rotation, CPU depth sorting, and premultiplied alpha compositing.'
      },
      memoryInfo: null,
      statistics: null,
      renderSample: includeSample ? this.sampleRender() : null
    };
  }

  private shouldUseTextureFetchDraw() {
    return this.diagnostics.dataTextureMode === 'texture-fetch'
      && this.dataTextureAudit.status === 'passed'
      && Boolean(this.centerTexture && this.covarianceATexture && this.covarianceBTexture && this.orderTexture)
      && Boolean(this.sortedColors && this.sortedSh1);
  }

  private getDataAccessState() {
    if (this.shouldUseTextureFetchDraw()) {
      return {
        dataPacking: 'texture-fetch-hybrid',
        covarianceStorage: 'packed-covariance-texture',
        orderAccess: 'order-texture'
      };
    }
    return {
      dataPacking: 'attribute-buffer',
      covarianceStorage: 'scale-rotation-attributes',
      orderAccess: this.sortEnabled ? 'cpu-reordered-attributes' : 'source-attribute-order'
    };
  }

  private setCommonGaussianUniforms(program: WebGLProgram) {
    const fovRadians = Math.PI / 3;
    const projection = perspective(fovRadians, this.canvas.width / this.canvas.height, 0.01, 10000);
    const view = lookAt(this.cameraPosition, this.cameraTarget, [0, -1, 0]);
    const viewProjection = multiplyMat4(projection, view);
    this.gl.uniformMatrix4fv(this.gl.getUniformLocation(program, 'uViewProjection'), false, viewProjection);
    this.gl.uniformMatrix4fv(this.gl.getUniformLocation(program, 'uView'), false, view);
    this.gl.uniformMatrix4fv(this.gl.getUniformLocation(program, 'uProjection'), false, projection);
    this.gl.uniform3f(this.gl.getUniformLocation(program, 'uCameraPosition'), this.cameraPosition[0], this.cameraPosition[1], this.cameraPosition[2]);
    this.gl.uniform2f(this.gl.getUniformLocation(program, 'uViewport'), this.canvas.width, this.canvas.height);
    this.gl.uniform1f(this.gl.getUniformLocation(program, 'uEllipseExtent'), Math.min(this.renderProfile.ellipseExtent, this.projectionSettings.maxStdDev));
    this.gl.uniform1f(this.gl.getUniformLocation(program, 'uMinPixelAxis'), this.renderProfile.minPixelAxis);
    this.gl.uniform1f(this.gl.getUniformLocation(program, 'uMaxPixelAxis'), this.renderProfile.maxPixelAxis);
    this.gl.uniform1f(this.gl.getUniformLocation(program, 'uPreBlurAmount'), this.projectionSettings.preBlurAmount);
    this.gl.uniform1f(this.gl.getUniformLocation(program, 'uBlurAmount'), this.projectionSettings.blurAmount);
    this.gl.uniform1f(this.gl.getUniformLocation(program, 'uMaxStdDev'), this.projectionSettings.maxStdDev);
    this.gl.uniform1f(this.gl.getUniformLocation(program, 'uFocalAdjustment'), this.projectionSettings.focalAdjustment);
    this.gl.uniform1f(this.gl.getUniformLocation(program, 'uPremultipliedAlpha'), this.diagnostics.compositeMode === 'premultiplied-alpha' ? 1 : 0);
    this.gl.uniform1f(this.gl.getUniformLocation(program, 'uMinClipW'), MIN_CLIP_W);
    this.gl.uniform1f(this.gl.getUniformLocation(program, 'uClipPadding'), OFFSCREEN_CLIP_PADDING);
  }

  private bindQuadAttribute(program: WebGLProgram) {
    const quadLocation = this.gl.getAttribLocation(program, 'aQuad');
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quadBuffer);
    this.gl.enableVertexAttribArray(quadLocation);
    this.gl.vertexAttribPointer(quadLocation, 2, this.gl.FLOAT, false, 0, 0);
    this.gl.vertexAttribDivisor(quadLocation, 0);
  }

  private bindColorAndShAttributes(program: WebGLProgram) {
    if (!this.sortedColors || !this.sortedSh1) return;

    const colorLocation = this.gl.getAttribLocation(program, 'aColor');
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.colorBuffer);
    this.gl.enableVertexAttribArray(colorLocation);
    this.gl.vertexAttribPointer(colorLocation, 4, this.gl.FLOAT, false, 0, 0);
    this.gl.vertexAttribDivisor(colorLocation, 1);

    const sh10Location = this.gl.getAttribLocation(program, 'aSh1_0');
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.sh1Buffer);
    this.gl.enableVertexAttribArray(sh10Location);
    this.gl.vertexAttribPointer(sh10Location, 3, this.gl.FLOAT, false, RENDER_SH_REST_COUNT * 4, 0);
    this.gl.vertexAttribDivisor(sh10Location, 1);

    const sh11Location = this.gl.getAttribLocation(program, 'aSh1_1');
    this.gl.enableVertexAttribArray(sh11Location);
    this.gl.vertexAttribPointer(sh11Location, 3, this.gl.FLOAT, false, RENDER_SH_REST_COUNT * 4, 3 * 4);
    this.gl.vertexAttribDivisor(sh11Location, 1);

    const sh12Location = this.gl.getAttribLocation(program, 'aSh1_2');
    this.gl.enableVertexAttribArray(sh12Location);
    this.gl.vertexAttribPointer(sh12Location, 3, this.gl.FLOAT, false, RENDER_SH_REST_COUNT * 4, 6 * 4);
    this.gl.vertexAttribDivisor(sh12Location, 1);
  }

  private bindTextureFetchSamplers(program: WebGLProgram) {
    if (!this.centerTexture || !this.covarianceATexture || !this.covarianceBTexture || !this.orderTexture || !this.dataTextureAudit.textureSize) {
      throw new Error('Texture-fetch draw requested before diagnostic textures are ready.');
    }
    this.gl.uniform2f(
      this.gl.getUniformLocation(program, 'uDataTextureSize'),
      this.dataTextureAudit.textureSize.width,
      this.dataTextureAudit.textureSize.height
    );

    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.centerTexture);
    this.gl.uniform1i(this.gl.getUniformLocation(program, 'uCenterTex'), 0);

    this.gl.activeTexture(this.gl.TEXTURE1);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.covarianceATexture);
    this.gl.uniform1i(this.gl.getUniformLocation(program, 'uCovarianceATex'), 1);

    this.gl.activeTexture(this.gl.TEXTURE2);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.covarianceBTexture);
    this.gl.uniform1i(this.gl.getUniformLocation(program, 'uCovarianceBTex'), 2);

    this.gl.activeTexture(this.gl.TEXTURE3);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.orderTexture);
    this.gl.uniform1i(this.gl.getUniformLocation(program, 'uOrderTex'), 3);
  }

  private renderTextureFetchDraw() {
    this.gl.useProgram(this.textureFetchProgram);
    this.setCommonGaussianUniforms(this.textureFetchProgram);
    this.bindTextureFetchSamplers(this.textureFetchProgram);
    this.bindQuadAttribute(this.textureFetchProgram);
    this.bindColorAndShAttributes(this.textureFetchProgram);
    this.gl.disable(this.gl.DEPTH_TEST);
    this.gl.enable(this.gl.BLEND);
    if (this.diagnostics.compositeMode === 'premultiplied-alpha') {
      this.gl.blendFunc(this.gl.ONE, this.gl.ONE_MINUS_SRC_ALPHA);
    } else {
      this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
    }
    this.gl.drawArraysInstanced(this.gl.TRIANGLES, 0, 6, this.renderSplatCount);
  }

  private resetDataTextureAudit() {
    for (const texture of [this.centerTexture, this.covarianceATexture, this.covarianceBTexture, this.orderTexture]) {
      if (texture) this.gl.deleteTexture(texture);
    }
    if (this.dataTextureFramebuffer) {
      this.gl.deleteFramebuffer(this.dataTextureFramebuffer);
    }
    this.centerTexture = null;
    this.covarianceATexture = null;
    this.covarianceBTexture = null;
    this.orderTexture = null;
    this.dataTextureFramebuffer = null;
    this.dataTextureAudit = createIdleDataTextureAudit(this.diagnostics.dataTextureMode);
  }

  private createOrUpdateFloatTexture(texture: WebGLTexture | null, width: number, height: number, data: Float32Array) {
    const targetTexture = texture ?? this.gl.createTexture();
    if (!targetTexture) throw new Error('Could not create ARK Gaussian diagnostic texture.');
    this.gl.bindTexture(this.gl.TEXTURE_2D, targetTexture);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA32F,
      width,
      height,
      0,
      this.gl.RGBA,
      this.gl.FLOAT,
      data
    );
    return targetTexture;
  }

  private readFloatTexturePixel(texture: WebGLTexture, x: number, y: number) {
    this.dataTextureFramebuffer ??= this.gl.createFramebuffer();
    if (!this.dataTextureFramebuffer) throw new Error('Could not create ARK Gaussian diagnostic framebuffer.');
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.dataTextureFramebuffer);
    this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, texture, 0);
    const status = this.gl.checkFramebufferStatus(this.gl.FRAMEBUFFER);
    if (status !== this.gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`ARK Gaussian diagnostic framebuffer is incomplete: ${status}.`);
    }
    const pixel = new Float32Array(4);
    this.gl.readPixels(x, y, 1, 1, this.gl.RGBA, this.gl.FLOAT, pixel);
    return pixel;
  }

  private sortedSourceIndex(sortedIndex: number) {
    if (!this.sortEnabled) return sortedIndex;
    if (this.sortMode === 'bucket-depth') return this.sortOrder?.[sortedIndex] ?? sortedIndex;
    return this.sortIndices[sortedIndex] ?? sortedIndex;
  }

  private runDataTextureAuditIfNeeded() {
    if (this.diagnostics.dataTextureMode === 'off') return;
    if (
      this.dataTextureAudit.sceneVersion === this.sceneVersion
      && this.dataTextureAudit.sortVersion === this.sortVersion
      && (this.dataTextureAudit.status === 'passed' || this.dataTextureAudit.status === 'failed' || this.dataTextureAudit.status === 'skipped')
    ) {
      return;
    }
    if (
      !this.rawPositions
      || !this.rawScales
      || !this.rawRotations
      || this.renderSplatCount <= 0
    ) {
      this.dataTextureAudit = {
        ...createIdleDataTextureAudit(this.diagnostics.dataTextureMode),
        status: 'failed',
        reason: 'missing-render-buffers',
        sceneVersion: this.sceneVersion,
        sortVersion: this.sortVersion,
        count: this.renderSplatCount
      };
      return;
    }
    if (this.renderSplatCount > DATA_TEXTURE_AUDIT_SPLAT_LIMIT) {
      this.dataTextureAudit = {
        ...createIdleDataTextureAudit(this.diagnostics.dataTextureMode),
        status: 'skipped',
        reason: `rendered-splats-over-texture-audit-limit-${DATA_TEXTURE_AUDIT_SPLAT_LIMIT}`,
        sceneVersion: this.sceneVersion,
        sortVersion: this.sortVersion,
        count: this.renderSplatCount
      };
      return;
    }
    if (!this.gl.getExtension('EXT_color_buffer_float')) {
      this.dataTextureAudit = {
        ...createIdleDataTextureAudit(this.diagnostics.dataTextureMode),
        status: 'skipped',
        reason: 'missing-ext-color-buffer-float',
        sceneVersion: this.sceneVersion,
        sortVersion: this.sortVersion,
        count: this.renderSplatCount
      };
      return;
    }

    const thresholds = createIdleDataTextureAudit(this.diagnostics.dataTextureMode).thresholds;
    try {
      const layout = resolveTextureLayout(this.renderSplatCount, this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) as number);
      const pixelCount = layout.width * layout.height;
      const centerPixels = new Float32Array(pixelCount * 4);
      const covarianceAPixels = new Float32Array(pixelCount * 4);
      const covarianceBPixels = new Float32Array(pixelCount * 4);
      const orderPixels = new Float32Array(pixelCount * 4);

      for (let index = 0; index < this.renderSplatCount; index += 1) {
        const pixelOffset = index * 4;
        const positionOffset = index * 3;
        centerPixels[pixelOffset] = this.rawPositions[positionOffset];
        centerPixels[pixelOffset + 1] = this.rawPositions[positionOffset + 1];
        centerPixels[pixelOffset + 2] = this.rawPositions[positionOffset + 2];
        centerPixels[pixelOffset + 3] = 1;

        const scaleOffset = index * 3;
        const rotationOffset = index * 4;
        const covariance = packGaussianCovariance(computePackedGaussianCovariance3D(
          [
            this.rawScales[scaleOffset],
            this.rawScales[scaleOffset + 1],
            this.rawScales[scaleOffset + 2]
          ],
          [
            this.rawRotations[rotationOffset],
            this.rawRotations[rotationOffset + 1],
            this.rawRotations[rotationOffset + 2],
            this.rawRotations[rotationOffset + 3]
          ]
        ));
        covarianceAPixels[pixelOffset] = covariance[0];
        covarianceAPixels[pixelOffset + 1] = covariance[1];
        covarianceAPixels[pixelOffset + 2] = covariance[2];
        covarianceAPixels[pixelOffset + 3] = covariance[3];
        covarianceBPixels[pixelOffset] = covariance[4];
        covarianceBPixels[pixelOffset + 1] = covariance[5];
        covarianceBPixels[pixelOffset + 2] = 0;
        covarianceBPixels[pixelOffset + 3] = 1;

        const sortedSourceIndex = this.sortedSourceIndex(index);
        orderPixels[pixelOffset] = sortedSourceIndex;
        orderPixels[pixelOffset + 3] = 1;
      }

      this.centerTexture = this.createOrUpdateFloatTexture(this.centerTexture, layout.width, layout.height, centerPixels);
      this.covarianceATexture = this.createOrUpdateFloatTexture(this.covarianceATexture, layout.width, layout.height, covarianceAPixels);
      this.covarianceBTexture = this.createOrUpdateFloatTexture(this.covarianceBTexture, layout.width, layout.height, covarianceBPixels);
      this.orderTexture = this.createOrUpdateFloatTexture(this.orderTexture, layout.width, layout.height, orderPixels);
      const centerTexture = this.centerTexture;
      const covarianceATexture = this.covarianceATexture;
      const covarianceBTexture = this.covarianceBTexture;
      const orderTexture = this.orderTexture;
      if (!centerTexture || !covarianceATexture || !covarianceBTexture || !orderTexture) {
        throw new Error('ARK Gaussian diagnostic texture upload did not return all textures.');
      }

      const sampleIndices = textureSampleIndices(this.renderSplatCount);
      let centerMaxAbsDelta = 0;
      let covarianceMaxAbsDelta = 0;
      let orderMaxAbsDelta = 0;
      for (const sortedIndex of sampleIndices) {
        const sourceIndex = this.sortedSourceIndex(sortedIndex);
        const orderCoord = textureCoord(sortedIndex, layout.width);
        const orderPixel = this.readFloatTexturePixel(orderTexture, orderCoord.x, orderCoord.y);
        orderMaxAbsDelta = Math.max(orderMaxAbsDelta, Math.abs(orderPixel[0] - sourceIndex));

        const sourceCoord = textureCoord(sourceIndex, layout.width);
        const centerPixel = this.readFloatTexturePixel(centerTexture, sourceCoord.x, sourceCoord.y);
        const positionOffset = sourceIndex * 3;
        centerMaxAbsDelta = Math.max(
          centerMaxAbsDelta,
          Math.abs(centerPixel[0] - this.rawPositions[positionOffset]),
          Math.abs(centerPixel[1] - this.rawPositions[positionOffset + 1]),
          Math.abs(centerPixel[2] - this.rawPositions[positionOffset + 2])
        );

        const covAPixel = this.readFloatTexturePixel(covarianceATexture, sourceCoord.x, sourceCoord.y);
        const covBPixel = this.readFloatTexturePixel(covarianceBTexture, sourceCoord.x, sourceCoord.y);
        const scaleOffset = sourceIndex * 3;
        const rotationOffset = sourceIndex * 4;
        const expectedCovariance = packGaussianCovariance(computePackedGaussianCovariance3D(
          [
            this.rawScales[scaleOffset],
            this.rawScales[scaleOffset + 1],
            this.rawScales[scaleOffset + 2]
          ],
          [
            this.rawRotations[rotationOffset],
            this.rawRotations[rotationOffset + 1],
            this.rawRotations[rotationOffset + 2],
            this.rawRotations[rotationOffset + 3]
          ]
        ));
        covarianceMaxAbsDelta = Math.max(
          covarianceMaxAbsDelta,
          Math.abs(covAPixel[0] - expectedCovariance[0]),
          Math.abs(covAPixel[1] - expectedCovariance[1]),
          Math.abs(covAPixel[2] - expectedCovariance[2]),
          Math.abs(covAPixel[3] - expectedCovariance[3]),
          Math.abs(covBPixel[0] - expectedCovariance[4]),
          Math.abs(covBPixel[1] - expectedCovariance[5])
        );
      }

      const passed = centerMaxAbsDelta <= thresholds.centerMaxAbsDelta
        && covarianceMaxAbsDelta <= thresholds.covarianceMaxAbsDelta
        && orderMaxAbsDelta <= thresholds.orderMaxAbsDelta;
      this.dataTextureAudit = {
        enabled: true,
        mode: this.diagnostics.dataTextureMode,
        status: passed ? 'passed' : 'failed',
        reason: passed ? 'texture-upload-readback-passed' : 'texture-upload-readback-delta-exceeded',
        sceneVersion: this.sceneVersion,
        sortVersion: this.sortVersion,
        count: this.renderSplatCount,
        textureSize: layout,
        sampleCount: sampleIndices.length,
        thresholds,
        centerMaxAbsDelta,
        covarianceMaxAbsDelta,
        orderMaxAbsDelta,
        textures: {
          center: Boolean(this.centerTexture),
          covarianceA: Boolean(this.covarianceATexture),
          covarianceB: Boolean(this.covarianceBTexture),
          order: Boolean(this.orderTexture)
        }
      };
    } catch (error) {
      this.dataTextureAudit = {
        ...createIdleDataTextureAudit(this.diagnostics.dataTextureMode),
        status: 'failed',
        reason: error instanceof Error ? error.message : String(error),
        sceneVersion: this.sceneVersion,
        sortVersion: this.sortVersion,
        count: this.renderSplatCount
      };
    } finally {
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
      this.gl.bindTexture(this.gl.TEXTURE_2D, null);
    }
  }

  private uploadGaussianBuffers(
    positions: Float32Array,
    colors: Float32Array,
    scales: Float32Array,
    rotations: Float32Array,
    sh1: Float32Array
  ) {
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, positions, this.gl.DYNAMIC_DRAW);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.colorBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, colors, this.gl.DYNAMIC_DRAW);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.scaleBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, scales, this.gl.DYNAMIC_DRAW);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.rotationBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, rotations, this.gl.DYNAMIC_DRAW);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.sh1Buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, sh1, this.gl.DYNAMIC_DRAW);
  }

  private recordRenderTiming(startedAt: number) {
    const elapsed = performance.now() - startedAt;
    this.lastRenderMs = elapsed;
    this.maxRenderMs = Math.max(this.maxRenderMs, elapsed);
    this.totalRenderMs += elapsed;
    this.renderCount += 1;
  }

  private getCameraForward(): ArkVec3 {
    return normalize(subtract(this.cameraTarget, this.cameraPosition));
  }

  private shouldReuseSort(cameraForward: ArkVec3, epsilon = CAMERA_EPSILON) {
    if (!this.lastSortCameraPosition || !this.lastSortCameraForward) return false;
    return distanceSq(this.cameraPosition, this.lastSortCameraPosition) < epsilon
      && distanceSq(cameraForward, this.lastSortCameraForward) < epsilon;
  }

  private updateSortedBuffers() {
    if (
      !this.sortEnabled
      || !this.rawPositions
      || !this.rawColors
      || !this.rawScales
      || !this.rawRotations
      || !this.rawSh1
      || !this.sortedPositions
      || !this.sortedColors
      || !this.sortedScales
      || !this.sortedRotations
      || !this.sortedSh1
      || !this.sortDepths
    ) {
      return;
    }

    const cameraForward = this.getCameraForward();
    const sortReuseEpsilon = this.sortMode === 'bucket-depth' ? BUCKET_SORT_CAMERA_EPSILON : CAMERA_EPSILON;
    if (!this.sortDirty && this.shouldReuseSort(cameraForward, sortReuseEpsilon)) return;

    const startedAt = performance.now();
    const positions = this.rawPositions;
    const colors = this.rawColors;
    const scales = this.rawScales;
    const rotations = this.rawRotations;
    const sh1 = this.rawSh1;
    const depths = this.sortDepths;
    const indices = this.sortIndices;

    for (let index = 0; index < this.renderSplatCount; index += 1) {
      const offset = index * 3;
      depths[index] = (positions[offset] - this.cameraPosition[0]) * cameraForward[0]
        + (positions[offset + 1] - this.cameraPosition[1]) * cameraForward[1]
        + (positions[offset + 2] - this.cameraPosition[2]) * cameraForward[2];
    }

    if (this.sortMode === 'exact-depth') {
      indices.sort((a, b) => depths[b] - depths[a]);

      for (let sortedIndex = 0; sortedIndex < this.renderSplatCount; sortedIndex += 1) {
        const sourceIndex = indices[sortedIndex];
        const sourcePositionOffset = sourceIndex * 3;
        const targetPositionOffset = sortedIndex * 3;
        this.sortedPositions[targetPositionOffset] = positions[sourcePositionOffset];
        this.sortedPositions[targetPositionOffset + 1] = positions[sourcePositionOffset + 1];
        this.sortedPositions[targetPositionOffset + 2] = positions[sourcePositionOffset + 2];

        const sourceColorOffset = sourceIndex * 4;
        const targetColorOffset = sortedIndex * 4;
        this.sortedColors[targetColorOffset] = colors[sourceColorOffset];
        this.sortedColors[targetColorOffset + 1] = colors[sourceColorOffset + 1];
        this.sortedColors[targetColorOffset + 2] = colors[sourceColorOffset + 2];
        this.sortedColors[targetColorOffset + 3] = colors[sourceColorOffset + 3];

        const sourceScaleOffset = sourceIndex * 3;
        const targetScaleOffset = sortedIndex * 3;
        this.sortedScales[targetScaleOffset] = scales[sourceScaleOffset];
        this.sortedScales[targetScaleOffset + 1] = scales[sourceScaleOffset + 1];
        this.sortedScales[targetScaleOffset + 2] = scales[sourceScaleOffset + 2];

        const sourceRotationOffset = sourceIndex * 4;
        const targetRotationOffset = sortedIndex * 4;
        this.sortedRotations[targetRotationOffset] = rotations[sourceRotationOffset];
        this.sortedRotations[targetRotationOffset + 1] = rotations[sourceRotationOffset + 1];
        this.sortedRotations[targetRotationOffset + 2] = rotations[sourceRotationOffset + 2];
        this.sortedRotations[targetRotationOffset + 3] = rotations[sourceRotationOffset + 3];

        const sourceShOffset = sourceIndex * RENDER_SH_REST_COUNT;
        const targetShOffset = sortedIndex * RENDER_SH_REST_COUNT;
        for (let coefficient = 0; coefficient < RENDER_SH_REST_COUNT; coefficient += 1) {
          this.sortedSh1[targetShOffset + coefficient] = sh1[sourceShOffset + coefficient];
        }
      }
    } else if (this.sortMode === 'bucket-depth' && this.sortOrder) {
      let minDepth = Infinity;
      let maxDepth = -Infinity;
      for (let index = 0; index < this.renderSplatCount; index += 1) {
        const depth = depths[index];
        if (Number.isFinite(depth)) {
          minDepth = Math.min(minDepth, depth);
          maxDepth = Math.max(maxDepth, depth);
        }
      }
      if (!Number.isFinite(minDepth) || !Number.isFinite(maxDepth)) {
        minDepth = 0;
        maxDepth = 0;
      }
      const depthRange = maxDepth - minDepth;
      this.sortBuckets.fill(0);
      for (let index = 0; index < this.renderSplatCount; index += 1) {
        this.sortBuckets[quantizeDepthToBucket(depths[index], minDepth, depthRange)] += 1;
      }

      let writeOffset = 0;
      for (let bucket = SORT_BUCKET_MAX; bucket >= 0; bucket -= 1) {
        const count = this.sortBuckets[bucket];
        this.sortBucketWriteOffsets[bucket] = writeOffset;
        writeOffset += count;
      }
      for (let index = 0; index < this.renderSplatCount; index += 1) {
        const bucket = quantizeDepthToBucket(depths[index], minDepth, depthRange);
        this.sortOrder[this.sortBucketWriteOffsets[bucket]] = index;
        this.sortBucketWriteOffsets[bucket] += 1;
      }

      for (let sortedIndex = 0; sortedIndex < this.renderSplatCount; sortedIndex += 1) {
        const sourceIndex = this.sortOrder[sortedIndex];
        const sourcePositionOffset = sourceIndex * 3;
        const targetPositionOffset = sortedIndex * 3;
        this.sortedPositions[targetPositionOffset] = positions[sourcePositionOffset];
        this.sortedPositions[targetPositionOffset + 1] = positions[sourcePositionOffset + 1];
        this.sortedPositions[targetPositionOffset + 2] = positions[sourcePositionOffset + 2];

        const sourceColorOffset = sourceIndex * 4;
        const targetColorOffset = sortedIndex * 4;
        this.sortedColors[targetColorOffset] = colors[sourceColorOffset];
        this.sortedColors[targetColorOffset + 1] = colors[sourceColorOffset + 1];
        this.sortedColors[targetColorOffset + 2] = colors[sourceColorOffset + 2];
        this.sortedColors[targetColorOffset + 3] = colors[sourceColorOffset + 3];

        const sourceScaleOffset = sourceIndex * 3;
        const targetScaleOffset = sortedIndex * 3;
        this.sortedScales[targetScaleOffset] = scales[sourceScaleOffset];
        this.sortedScales[targetScaleOffset + 1] = scales[sourceScaleOffset + 1];
        this.sortedScales[targetScaleOffset + 2] = scales[sourceScaleOffset + 2];

        const sourceRotationOffset = sourceIndex * 4;
        const targetRotationOffset = sortedIndex * 4;
        this.sortedRotations[targetRotationOffset] = rotations[sourceRotationOffset];
        this.sortedRotations[targetRotationOffset + 1] = rotations[sourceRotationOffset + 1];
        this.sortedRotations[targetRotationOffset + 2] = rotations[sourceRotationOffset + 2];
        this.sortedRotations[targetRotationOffset + 3] = rotations[sourceRotationOffset + 3];

        const sourceShOffset = sourceIndex * RENDER_SH_REST_COUNT;
        const targetShOffset = sortedIndex * RENDER_SH_REST_COUNT;
        for (let coefficient = 0; coefficient < RENDER_SH_REST_COUNT; coefficient += 1) {
          this.sortedSh1[targetShOffset + coefficient] = sh1[sourceShOffset + coefficient];
        }
      }

      this.lastSortDepthRange = [Number(minDepth.toFixed(6)), Number(maxDepth.toFixed(6))];
    }

    this.uploadGaussianBuffers(this.sortedPositions, this.sortedColors, this.sortedScales, this.sortedRotations, this.sortedSh1);
    this.lastSortMs = performance.now() - startedAt;
    this.lastSortedCount = this.renderSplatCount;
    this.lastSortCameraPosition = copyVec3(this.cameraPosition);
    this.lastSortCameraForward = cameraForward;
    this.sortDirty = false;
    this.sortReason = 'camera-depth-order';
    this.sortVersion += 1;
  }

  sampleRender(): ArkRenderSample {
    this.render();
    const width = this.gl.drawingBufferWidth;
    const height = this.gl.drawingBufferHeight;
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
      this.gl.readPixels(
        Math.max(0, Math.min(width - 1, Math.floor(width * nx))),
        Math.max(0, Math.min(height - 1, Math.floor(height * ny))),
        1,
        1,
        this.gl.RGBA,
        this.gl.UNSIGNED_BYTE,
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
}
