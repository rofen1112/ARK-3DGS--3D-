import { decodeGaussianPly } from '../gaussian/ply';
import type {
  ArkFitBounds,
  ArkGaussianLoadRequest,
  ArkLoadedSceneInfo,
  ArkRenderSample,
  ArkRendererBackend,
  ArkRendererDebugState,
  ArkVec3
} from '../types';

type Gl = WebGL2RenderingContext | WebGLRenderingContext;

const SH_C0 = 0.28209479177387814;
const SORT_SPLAT_LIMIT = 400_000;
const CAMERA_EPSILON = 0.0001;
const SCALE_POINT_MULTIPLIER = 4;
const MIN_POINT_SIZE = 1.2;
const MAX_POINT_SIZE = 22;

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

function inferPlyFitBounds(request: ArkGaussianLoadRequest, min: ArkVec3, max: ArkVec3): ArkFitBounds {
  return request.fitBounds ?? {
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

export class ArkPointRendererBackend implements ArkRendererBackend {
  readonly id = 'ark-point-webgl2';

  private readonly canvas: HTMLCanvasElement;
  private readonly gl: Gl;
  private readonly program: WebGLProgram;
  private readonly positionBuffer: WebGLBuffer;
  private readonly colorBuffer: WebGLBuffer;
  private readonly radiusBuffer: WebGLBuffer;
  private readonly viewProjectionLocation: WebGLUniformLocation | null;
  private readonly focalPixelsLocation: WebGLUniformLocation | null;
  private readonly pointScaleLocation: WebGLUniformLocation | null;
  private readonly minPointSizeLocation: WebGLUniformLocation | null;
  private readonly maxPointSizeLocation: WebGLUniformLocation | null;
  private renderRequestHandler: (() => void) | null = null;
  private splatCount = 0;
  private sceneVersion = 0;
  private sortVersion = 0;
  private cameraPosition: ArkVec3 = [0, 0, 6];
  private cameraTarget: ArkVec3 = [0, 0, 0];
  private cameraDistance = 6;
  private activeInfo: ArkLoadedSceneInfo | null = null;
  private lastLoadMs = 0;
  private rawPositions: Float32Array | null = null;
  private rawColors: Float32Array | null = null;
  private rawRadii: Float32Array | null = null;
  private sortedPositions: Float32Array | null = null;
  private sortedColors: Float32Array | null = null;
  private sortedRadii: Float32Array | null = null;
  private sortIndices: number[] = [];
  private sortDepths: Float32Array | null = null;
  private lastSortMs = 0;
  private lastSortedCount = 0;
  private sortEnabled = false;
  private sortDirty = false;
  private sortReason = 'no-scene';
  private lastSortCameraPosition: ArkVec3 | null = null;
  private lastSortCameraForward: ArkVec3 | null = null;
  private radiusMin = 0;
  private radiusMax = 0;
  private radiusMean = 0;

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
    }) ?? this.canvas.getContext('webgl', {
      antialias: false,
      alpha: false,
      preserveDrawingBuffer: true
    });
    if (!gl) throw new Error('ARK point renderer requires WebGL.');
    this.gl = gl;

    this.program = createProgram(
      this.gl,
      `
        attribute vec3 aPosition;
        attribute vec4 aColor;
        attribute float aRadius;
        uniform mat4 uViewProjection;
        uniform float uFocalPixels;
        uniform float uPointScale;
        uniform float uMinPointSize;
        uniform float uMaxPointSize;
        varying vec4 vColor;
        void main() {
          vec4 clip = uViewProjection * vec4(aPosition, 1.0);
          float depth = max(0.05, clip.w);
          float projectedSize = aRadius * uFocalPixels * uPointScale / depth;
          gl_Position = clip;
          gl_PointSize = clamp(projectedSize, uMinPointSize, uMaxPointSize);
          vColor = aColor;
        }
      `,
      `
        precision mediump float;
        varying vec4 vColor;
        void main() {
          vec2 d = (gl_PointCoord - vec2(0.5)) * 2.0;
          float r2 = dot(d, d);
          if (r2 > 1.0) discard;
          float alpha = vColor.a * exp(-r2 * 2.0);
          gl_FragColor = vec4(vColor.rgb, alpha);
        }
      `
    );

    const position = this.gl.createBuffer();
    const color = this.gl.createBuffer();
    const radius = this.gl.createBuffer();
    if (!position || !color || !radius) throw new Error('Could not create WebGL buffers.');
    this.positionBuffer = position;
    this.colorBuffer = color;
    this.radiusBuffer = radius;
    this.viewProjectionLocation = this.gl.getUniformLocation(this.program, 'uViewProjection');
    this.focalPixelsLocation = this.gl.getUniformLocation(this.program, 'uFocalPixels');
    this.pointScaleLocation = this.gl.getUniformLocation(this.program, 'uPointScale');
    this.minPointSizeLocation = this.gl.getUniformLocation(this.program, 'uMinPointSize');
    this.maxPointSizeLocation = this.gl.getUniformLocation(this.program, 'uMaxPointSize');
    this.resize();
  }

  setRenderRequestHandler(handler: () => void) {
    this.renderRequestHandler = handler;
  }

  async loadGaussian(request: ArkGaussianLoadRequest): Promise<ArkLoadedSceneInfo> {
    if (!request.filename.toLowerCase().endsWith('.ply')) {
      throw new Error('ARK first-party point renderer currently supports PLY only.');
    }

    const startedAt = performance.now();
    request.onStatus?.({ phase: 'Parsing', message: 'ARK first-party parser reading PLY data...' });
    const data = decodeGaussianPly(await readInput(request.input), {
      includeShRest: false,
      invalidPolicy: 'skip'
    });
    const fitBounds = inferPlyFitBounds(request, data.summary.bounds.min, data.summary.bounds.max);
    const center = boundsCenter(fitBounds);
    const maxDim = boundsMaxDim(fitBounds);
    const displayScale = maxDim > 0 ? 4 / maxDim : 1;
    const fitRadius = Math.max(2.5, maxDim * displayScale * 0.75);

    request.onStatus?.({ phase: 'Packing', message: 'Packing ARK point buffers...' });
    const positions = new Float32Array(data.count * 3);
    const colors = new Float32Array(data.count * 4);
    const radii = new Float32Array(data.count);
    let radiusSum = 0;
    let radiusMin = Infinity;
    let radiusMax = -Infinity;
    for (let index = 0; index < data.count; index += 1) {
      positions[index * 3] = (data.centers[index * 3] - center[0]) * displayScale;
      positions[index * 3 + 1] = (data.centers[index * 3 + 1] - center[1]) * displayScale;
      positions[index * 3 + 2] = (data.centers[index * 3 + 2] - center[2]) * displayScale;
      colors[index * 4] = clamp01(0.5 + data.colorsDc[index * 3] * SH_C0);
      colors[index * 4 + 1] = clamp01(0.5 + data.colorsDc[index * 3 + 1] * SH_C0);
      colors[index * 4 + 2] = clamp01(0.5 + data.colorsDc[index * 3 + 2] * SH_C0);
      colors[index * 4 + 3] = clamp01(sigmoid(data.opacities[index]));
      const decodedRadius = Math.exp(Math.max(
        data.scales[index * 3],
        data.scales[index * 3 + 1],
        data.scales[index * 3 + 2]
      )) * displayScale;
      const radius = Number.isFinite(decodedRadius) ? Math.max(decodedRadius, 0.0001) : 0.0001;
      radii[index] = radius;
      radiusMin = Math.min(radiusMin, radius);
      radiusMax = Math.max(radiusMax, radius);
      radiusSum += radius;
    }

    this.rawPositions = positions;
    this.rawColors = colors;
    this.rawRadii = radii;
    this.sortedPositions = data.count <= SORT_SPLAT_LIMIT ? new Float32Array(positions.length) : positions;
    this.sortedColors = data.count <= SORT_SPLAT_LIMIT ? new Float32Array(colors.length) : colors;
    this.sortedRadii = data.count <= SORT_SPLAT_LIMIT ? new Float32Array(radii.length) : radii;
    this.sortIndices = data.count <= SORT_SPLAT_LIMIT ? Array.from({ length: data.count }, (_, index) => index) : [];
    this.sortDepths = data.count <= SORT_SPLAT_LIMIT ? new Float32Array(data.count) : null;
    this.sortEnabled = data.count > 0 && data.count <= SORT_SPLAT_LIMIT;
    this.sortDirty = this.sortEnabled;
    this.sortReason = this.sortEnabled ? 'pending-camera-sort' : `disabled-over-${SORT_SPLAT_LIMIT}-splats`;
    this.lastSortMs = 0;
    this.lastSortedCount = this.sortEnabled ? 0 : data.count;
    this.lastSortCameraPosition = null;
    this.lastSortCameraForward = null;
    this.radiusMin = Number.isFinite(radiusMin) ? radiusMin : 0;
    this.radiusMax = Number.isFinite(radiusMax) ? radiusMax : 0;
    this.radiusMean = data.count > 0 ? radiusSum / data.count : 0;

    this.uploadPointBuffers(
      this.sortEnabled ? positions : this.sortedPositions,
      this.sortEnabled ? colors : this.sortedColors,
      this.sortEnabled ? radii : this.sortedRadii
    );
    this.splatCount = data.count;
    this.sceneVersion += 1;
    this.lastLoadMs = performance.now() - startedAt;
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

    request.onStatus?.({ phase: 'Loaded', message: 'ARK point renderer buffers ready.' });
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
    this.resize();
    this.gl.clearColor(0.06, 0.07, 0.065, 1);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    if (!this.splatCount) return;
    this.updateSortedBuffers();

    this.gl.useProgram(this.program);
    const fovRadians = Math.PI / 3;
    const projection = perspective(fovRadians, this.canvas.width / this.canvas.height, 0.01, 10000);
    const view = lookAt(this.cameraPosition, this.cameraTarget, [0, -1, 0]);
    this.gl.uniformMatrix4fv(this.viewProjectionLocation, false, multiplyMat4(projection, view));
    this.gl.uniform1f(this.focalPixelsLocation, this.canvas.height / (2 * Math.tan(fovRadians / 2)));
    this.gl.uniform1f(this.pointScaleLocation, SCALE_POINT_MULTIPLIER);
    this.gl.uniform1f(this.minPointSizeLocation, MIN_POINT_SIZE);
    this.gl.uniform1f(this.maxPointSizeLocation, MAX_POINT_SIZE);

    const positionLocation = this.gl.getAttribLocation(this.program, 'aPosition');
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);
    this.gl.enableVertexAttribArray(positionLocation);
    this.gl.vertexAttribPointer(positionLocation, 3, this.gl.FLOAT, false, 0, 0);

    const colorLocation = this.gl.getAttribLocation(this.program, 'aColor');
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.colorBuffer);
    this.gl.enableVertexAttribArray(colorLocation);
    this.gl.vertexAttribPointer(colorLocation, 4, this.gl.FLOAT, false, 0, 0);

    const radiusLocation = this.gl.getAttribLocation(this.program, 'aRadius');
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.radiusBuffer);
    this.gl.enableVertexAttribArray(radiusLocation);
    this.gl.vertexAttribPointer(radiusLocation, 1, this.gl.FLOAT, false, 0, 0);

    this.gl.disable(this.gl.DEPTH_TEST);
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
    this.gl.drawArrays(this.gl.POINTS, 0, this.splatCount);
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
          mode: 'scale-aware-point-renderer'
        }
      },
      pipeline: {
        shader: 'sh0-scale-aware-point-cloud',
        sorting: this.sortEnabled ? 'cpu-back-to-front' : 'source-order',
        scaleAware: true,
        opacityAware: true,
        gaussianProjection: false
      },
      scene: {
        splats: this.splatCount,
        splatCounts: this.splatCount,
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
        sortVersion: this.sortVersion,
        pointSize: {
          min: MIN_POINT_SIZE,
          max: MAX_POINT_SIZE,
          scaleMultiplier: SCALE_POINT_MULTIPLIER
        },
        radius: {
          min: Number(this.radiusMin.toFixed(6)),
          max: Number(this.radiusMax.toFixed(6)),
          mean: Number(this.radiusMean.toFixed(6))
        },
        note: 'Scale-aware diagnostic point renderer; not full Gaussian splatting.'
      },
      memoryInfo: null,
      statistics: null,
      renderSample: includeSample ? this.sampleRender() : null
    };
  }

  private uploadPointBuffers(positions: Float32Array, colors: Float32Array, radii: Float32Array) {
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, positions, this.gl.DYNAMIC_DRAW);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.colorBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, colors, this.gl.DYNAMIC_DRAW);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.radiusBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, radii, this.gl.DYNAMIC_DRAW);
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
    if (!this.sortEnabled || !this.rawPositions || !this.rawColors || !this.rawRadii || !this.sortedPositions || !this.sortedColors || !this.sortedRadii || !this.sortDepths) {
      return;
    }

    const cameraForward = this.getCameraForward();
    if (!this.sortDirty && this.shouldReuseSort(cameraForward)) return;

    const startedAt = performance.now();
    const positions = this.rawPositions;
    const colors = this.rawColors;
    const radii = this.rawRadii;
    const depths = this.sortDepths;
    const indices = this.sortIndices;

    for (let index = 0; index < this.splatCount; index += 1) {
      const offset = index * 3;
      depths[index] = (positions[offset] - this.cameraPosition[0]) * cameraForward[0]
        + (positions[offset + 1] - this.cameraPosition[1]) * cameraForward[1]
        + (positions[offset + 2] - this.cameraPosition[2]) * cameraForward[2];
    }

    indices.sort((a, b) => depths[b] - depths[a]);

    for (let sortedIndex = 0; sortedIndex < this.splatCount; sortedIndex += 1) {
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
      this.sortedRadii[sortedIndex] = radii[sourceIndex];
    }

    this.uploadPointBuffers(this.sortedPositions, this.sortedColors, this.sortedRadii);
    this.lastSortMs = performance.now() - startedAt;
    this.lastSortedCount = this.splatCount;
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
