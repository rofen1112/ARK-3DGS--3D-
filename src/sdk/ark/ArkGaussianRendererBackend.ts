import { decodeGaussianPly } from '../gaussian/ply';
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
const SORT_SPLAT_LIMIT = 400_000;
const FULL_DENSITY_SPLAT_LIMIT = 2_000_000;
const LARGE_SCENE_RENDER_SPLAT_BUDGET = 300_000;
const CAMERA_EPSILON = 0.0001;
const ELLIPSE_EXTENT = 2.05;
const MIN_PIXEL_AXIS = 0.75;
const MAX_PIXEL_AXIS = 10;
const OPACITY_SCALE = 0.44;
const ALPHA_CUTOFF = 0.003;
const MIN_CLIP_W = 0.02;
const OFFSCREEN_CLIP_PADDING = 1.4;
const COMPUTED_FIT_BOUNDS_SPEC: ArkGaussianPercentileSpec = {
  id: 'ply_01_99',
  low: 0.01,
  high: 0.99
};
const LOD_ELLIPSE_EXTENT = 2.45;
const LOD_MIN_PIXEL_AXIS = 0.35;
const LOD_MAX_PIXEL_AXIS = 5.5;
const LOD_MIN_OPACITY_RATIO = 0.28;
const FULL_DENSITY_ELLIPSE_EXTENT = 1.85;
const FULL_DENSITY_MIN_PIXEL_AXIS = 0.35;
const FULL_DENSITY_MAX_PIXEL_AXIS = 4.5;
const FULL_DENSITY_OPACITY_SCALE = 0.12;

type RenderProfile = {
  id: string;
  ellipseExtent: number;
  minPixelAxis: number;
  maxPixelAxis: number;
  opacityScale: number;
};

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

export class ArkGaussianRendererBackend implements ArkRendererBackend {
  readonly id = 'ark-gaussian-webgl2';

  private readonly canvas: HTMLCanvasElement;
  private readonly gl: Gl;
  private readonly program: WebGLProgram;
  private readonly quadBuffer: WebGLBuffer;
  private readonly positionBuffer: WebGLBuffer;
  private readonly colorBuffer: WebGLBuffer;
  private readonly scaleBuffer: WebGLBuffer;
  private readonly rotationBuffer: WebGLBuffer;
  private readonly viewProjectionLocation: WebGLUniformLocation | null;
  private readonly viewportLocation: WebGLUniformLocation | null;
  private readonly ellipseExtentLocation: WebGLUniformLocation | null;
  private readonly minPixelAxisLocation: WebGLUniformLocation | null;
  private readonly maxPixelAxisLocation: WebGLUniformLocation | null;
  private readonly minClipWLocation: WebGLUniformLocation | null;
  private readonly clipPaddingLocation: WebGLUniformLocation | null;
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
  private sortedPositions: Float32Array | null = null;
  private sortedColors: Float32Array | null = null;
  private sortedScales: Float32Array | null = null;
  private sortedRotations: Float32Array | null = null;
  private sortIndices: number[] = [];
  private sortDepths: Float32Array | null = null;
  private lastSortMs = 0;
  private lastSortedCount = 0;
  private sortEnabled = false;
  private sortDirty = false;
  private sortReason = 'no-scene';
  private lastSortCameraPosition: ArkVec3 | null = null;
  private lastSortCameraForward: ArkVec3 | null = null;
  private axisMin = 0;
  private axisMax = 0;
  private axisMean = 0;
  private largeSceneFullDensity = false;
  private renderProfile = createRenderProfile(false, 1, false);

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
        uniform mat4 uViewProjection;
        uniform vec2 uViewport;
        uniform float uEllipseExtent;
        uniform float uMinPixelAxis;
        uniform float uMaxPixelAxis;
        uniform float uMinClipW;
        uniform float uClipPadding;
        varying vec4 vColor;
        varying float vClipDiscard;

        vec3 rotateByQuaternion(vec4 q, vec3 value) {
          vec3 u = q.yzw;
          return value + 2.0 * cross(u, cross(u, value) + q.x * value);
        }

        vec2 projectAxisToPixels(vec3 center, vec2 centerNdc, vec3 axis) {
          vec4 axisClip = uViewProjection * vec4(center + axis, 1.0);
          vec2 axisNdc = axisClip.xy / max(abs(axisClip.w), 0.0001);
          return (axisNdc - centerNdc) * 0.5 * uViewport;
        }

        varying vec2 vLocal;

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
            vLocal = vec2(999.0);
            vClipDiscard = 1.0;
            return;
          }
          vec4 q = normalize(aRotation);
          vec3 axis0 = rotateByQuaternion(q, vec3(aScale.x, 0.0, 0.0));
          vec3 axis1 = rotateByQuaternion(q, vec3(0.0, aScale.y, 0.0));
          vec3 axis2 = rotateByQuaternion(q, vec3(0.0, 0.0, aScale.z));
          vec2 s0 = projectAxisToPixels(aPosition, centerNdc, axis0);
          vec2 s1 = projectAxisToPixels(aPosition, centerNdc, axis1);
          vec2 s2 = projectAxisToPixels(aPosition, centerNdc, axis2);

          float covA = s0.x * s0.x + s1.x * s1.x + s2.x * s2.x;
          float covB = s0.x * s0.y + s1.x * s1.y + s2.x * s2.y;
          float covC = s0.y * s0.y + s1.y * s1.y + s2.y * s2.y;
          float trace = covA + covC;
          float delta = sqrt(max((covA - covC) * (covA - covC) + 4.0 * covB * covB, 0.0));
          float lambdaMajor = clamp(0.5 * (trace + delta), uMinPixelAxis * uMinPixelAxis, uMaxPixelAxis * uMaxPixelAxis);
          float lambdaMinor = clamp(0.5 * (trace - delta), uMinPixelAxis * uMinPixelAxis, uMaxPixelAxis * uMaxPixelAxis);

          vec2 majorAxis = vec2(covB, lambdaMajor - covA);
          if (dot(majorAxis, majorAxis) < 0.0001) {
            majorAxis = covA >= covC ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
          }
          majorAxis = normalize(majorAxis);
          vec2 minorAxis = vec2(-majorAxis.y, majorAxis.x);

          vec2 pixelOffset = (
            majorAxis * (aQuad.x * sqrt(lambdaMajor))
            + minorAxis * (aQuad.y * sqrt(lambdaMinor))
          ) * uEllipseExtent;
          vec2 ndcOffset = pixelOffset * 2.0 / uViewport;

          gl_Position = centerClip;
          gl_Position.xy += ndcOffset * centerClip.w;
          vColor = aColor;
          vLocal = aQuad * uEllipseExtent;
        }
      `,
      `
        precision highp float;
        uniform float uEllipseExtent;
        varying vec4 vColor;
        varying vec2 vLocal;
        varying float vClipDiscard;
        void main() {
          if (vClipDiscard > 0.5) discard;
          float r2 = dot(vLocal, vLocal);
          if (r2 > uEllipseExtent * uEllipseExtent) discard;
          float alpha = vColor.a * exp(-0.5 * r2);
          if (alpha < ${ALPHA_CUTOFF.toFixed(6)}) discard;
          gl_FragColor = vec4(vColor.rgb, alpha);
        }
      `
    );

    const quad = this.gl.createBuffer();
    const position = this.gl.createBuffer();
    const color = this.gl.createBuffer();
    const scale = this.gl.createBuffer();
    const rotation = this.gl.createBuffer();
    if (!quad || !position || !color || !scale || !rotation) throw new Error('Could not create WebGL buffers.');
    this.quadBuffer = quad;
    this.positionBuffer = position;
    this.colorBuffer = color;
    this.scaleBuffer = scale;
    this.rotationBuffer = rotation;
    this.viewProjectionLocation = this.gl.getUniformLocation(this.program, 'uViewProjection');
    this.viewportLocation = this.gl.getUniformLocation(this.program, 'uViewport');
    this.ellipseExtentLocation = this.gl.getUniformLocation(this.program, 'uEllipseExtent');
    this.minPixelAxisLocation = this.gl.getUniformLocation(this.program, 'uMinPixelAxis');
    this.maxPixelAxisLocation = this.gl.getUniformLocation(this.program, 'uMaxPixelAxis');
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

    const startedAt = performance.now();
    request.onStatus?.({ phase: 'Parsing', message: 'ARK first-party parser reading PLY data...' });
    const readStartedAt = performance.now();
    const inputBuffer = await readInput(request.input);
    this.lastReadMs = performance.now() - readStartedAt;
    this.lastInputBytes = inputBuffer.byteLength;

    const decodeStartedAt = performance.now();
    const data = decodeGaussianPly(inputBuffer, {
      includeShRest: false,
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

    this.rawPositions = positions;
    this.rawColors = colors;
    this.rawScales = scales;
    this.rawRotations = rotations;
    this.sortedPositions = renderSplatCount <= SORT_SPLAT_LIMIT ? new Float32Array(positions.length) : positions;
    this.sortedColors = renderSplatCount <= SORT_SPLAT_LIMIT ? new Float32Array(colors.length) : colors;
    this.sortedScales = renderSplatCount <= SORT_SPLAT_LIMIT ? new Float32Array(scales.length) : scales;
    this.sortedRotations = renderSplatCount <= SORT_SPLAT_LIMIT ? new Float32Array(rotations.length) : rotations;
    this.sortIndices = renderSplatCount <= SORT_SPLAT_LIMIT ? Array.from({ length: renderSplatCount }, (_, index) => index) : [];
    this.sortDepths = renderSplatCount <= SORT_SPLAT_LIMIT ? new Float32Array(renderSplatCount) : null;
    this.sortEnabled = renderSplatCount > 0 && renderSplatCount <= SORT_SPLAT_LIMIT;
    this.sortDirty = this.sortEnabled;
    this.sortReason = this.sortEnabled
      ? (lodEnabled ? 'pending-camera-sort-lod-budget' : 'pending-camera-sort')
      : `disabled-over-${SORT_SPLAT_LIMIT}-rendered-splats`;
    this.lastSortMs = 0;
    this.lastSortedCount = this.sortEnabled ? 0 : renderSplatCount;
    this.lastSortCameraPosition = null;
    this.lastSortCameraForward = null;
    this.axisMin = Number.isFinite(axisMin) ? axisMin : 0;
    this.axisMax = Number.isFinite(axisMax) ? axisMax : 0;
    this.axisMean = renderSplatCount > 0 ? axisSum / renderSplatCount : 0;
    this.renderProfile = renderProfile;
    this.estimatedGpuUploadBytes = positions.byteLength + colors.byteLength + scales.byteLength + rotations.byteLength;
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
        + (this.sortDepths?.byteLength ?? 0)
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
      this.sortEnabled ? rotations : this.sortedRotations
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
      shDegree: 0,
      denseMin: fitBounds.min,
      denseMax: fitBounds.max,
      displayScale,
      fitRadius,
      fitBoundsId: fitBounds.id,
      fitBoundsSource: fitBounds.source,
      source: request.source
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
      this.sortDirty = true;
      this.sortReason = 'camera-changed';
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

      this.gl.useProgram(this.program);
      const fovRadians = Math.PI / 3;
      const projection = perspective(fovRadians, this.canvas.width / this.canvas.height, 0.01, 10000);
      const view = lookAt(this.cameraPosition, this.cameraTarget, [0, -1, 0]);
      this.gl.uniformMatrix4fv(this.viewProjectionLocation, false, multiplyMat4(projection, view));
      this.gl.uniform2f(this.viewportLocation, this.canvas.width, this.canvas.height);
      this.gl.uniform1f(this.ellipseExtentLocation, this.renderProfile.ellipseExtent);
      this.gl.uniform1f(this.minPixelAxisLocation, this.renderProfile.minPixelAxis);
      this.gl.uniform1f(this.maxPixelAxisLocation, this.renderProfile.maxPixelAxis);
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

      this.gl.disable(this.gl.DEPTH_TEST);
      this.gl.enable(this.gl.BLEND);
      this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
      this.gl.drawArraysInstanced(this.gl.TRIANGLES, 0, 6, this.renderSplatCount);
    }
    this.recordRenderTiming(renderStartedAt);
  }

  invalidate() {
    this.renderRequestHandler?.();
  }

  getDebugState(includeSample = false): ArkRendererDebugState {
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
        shader: 'sh0-instanced-ellipse-gaussian',
        sorting: this.sortEnabled ? 'cpu-back-to-front' : 'source-order',
        scaleAware: true,
        opacityAware: true,
        gaussianProjection: true,
        covarianceProjection: true,
        instancing: true
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
        sortReason: this.sortReason,
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
          fullDensitySplatLimit: FULL_DENSITY_SPLAT_LIMIT
        },
        largeScene: {
          fullDensity: this.largeSceneFullDensity,
          fullDensitySplatLimit: FULL_DENSITY_SPLAT_LIMIT,
          cpuSortSplatLimit: SORT_SPLAT_LIMIT,
          sortingLimited: this.largeSceneFullDensity && !this.sortEnabled,
          strategy: this.largeSceneFullDensity
            ? 'full-density-source-order'
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
          extent: this.renderProfile.ellipseExtent,
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
          ? 'Instanced screen-space ellipse renderer using SH0 color, opacity, scale, rotation, softened deterministic stride LOD, and CPU depth sorting on the render budget.'
          : this.largeSceneFullDensity
            ? 'Instanced screen-space ellipse renderer using SH0 color, opacity, scale, rotation, full-density large-scene rendering, and source-order blending because CPU sorting is over budget.'
          : 'Instanced screen-space ellipse renderer using SH0 color, opacity, scale, rotation, and CPU depth sorting.'
      },
      memoryInfo: null,
      statistics: null,
      renderSample: includeSample ? this.sampleRender() : null
    };
  }

  private uploadGaussianBuffers(positions: Float32Array, colors: Float32Array, scales: Float32Array, rotations: Float32Array) {
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, positions, this.gl.DYNAMIC_DRAW);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.colorBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, colors, this.gl.DYNAMIC_DRAW);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.scaleBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, scales, this.gl.DYNAMIC_DRAW);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.rotationBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, rotations, this.gl.DYNAMIC_DRAW);
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

  private shouldReuseSort(cameraForward: ArkVec3) {
    if (!this.lastSortCameraPosition || !this.lastSortCameraForward) return false;
    return distanceSq(this.cameraPosition, this.lastSortCameraPosition) < CAMERA_EPSILON
      && distanceSq(cameraForward, this.lastSortCameraForward) < CAMERA_EPSILON;
  }

  private updateSortedBuffers() {
    if (
      !this.sortEnabled
      || !this.rawPositions
      || !this.rawColors
      || !this.rawScales
      || !this.rawRotations
      || !this.sortedPositions
      || !this.sortedColors
      || !this.sortedScales
      || !this.sortedRotations
      || !this.sortDepths
    ) {
      return;
    }

    const cameraForward = this.getCameraForward();
    if (!this.sortDirty && this.shouldReuseSort(cameraForward)) return;

    const startedAt = performance.now();
    const positions = this.rawPositions;
    const colors = this.rawColors;
    const scales = this.rawScales;
    const rotations = this.rawRotations;
    const depths = this.sortDepths;
    const indices = this.sortIndices;

    for (let index = 0; index < this.renderSplatCount; index += 1) {
      const offset = index * 3;
      depths[index] = (positions[offset] - this.cameraPosition[0]) * cameraForward[0]
        + (positions[offset + 1] - this.cameraPosition[1]) * cameraForward[1]
        + (positions[offset + 2] - this.cameraPosition[2]) * cameraForward[2];
    }

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
    }

    this.uploadGaussianBuffers(this.sortedPositions, this.sortedColors, this.sortedScales, this.sortedRotations);
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
