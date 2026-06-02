# ARK-3DGS First-Party Renderer Plan

Target position:

> ARK-3DGS Spatial SDK, with first-party Gaussian renderer and spatial OS data layer.

## Current Architecture

The current runtime is intentionally split into two layers:

- `src/main.ts`: product shell, local file entry, scene manifest loading, free-browse controls, HUD, diagnostics publishing.
- `src/sdk`: ARK SDK boundary.
- `src/sdk/aholo/AholoRendererBackend.ts`: current renderer backend implemented on top of `@manycore/aholo-viewer`.
- `src/sdk/ark/ArkPointRendererBackend.ts`: first-party diagnostic WebGL point backend for proving ARK-owned PLY parsing, GPU upload, rendering, and QA.

This means the application now depends on the ARK renderer interface first, and the Aholo SDK second. The next renderer can replace the backend without rewriting the browser shell.

## Renderer Backend Contract

The stable interface starts with:

```ts
type ArkRendererBackend = {
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
```

The first-party renderer must implement this contract before it replaces the Aholo backend.

## First-Party Renderer Modules

### 1. Format And Data Layer

Responsibilities:

- Parse Gaussian PLY first.
- Add SPZ/SOG adapters after the PLY baseline is stable.
- Normalize data into one internal `ArkGaussianData` structure.
- Preserve source metadata: format, SH degree, splat count, bounds, unit, source file hash.

Internal Gaussian fields:

- center: `float3`
- scale: `float3`
- rotation: quaternion `float4`
- opacity: `float`
- color: `float3`
- spherical harmonics: optional SH coefficients

### 2. GPU Packing Layer

Responsibilities:

- Convert `ArkGaussianData` into GPU buffers or textures.
- Support at least two pack modes:
  - debug readable mode
  - compressed runtime mode
- Keep CPU metadata available for diagnostics and future physics/semantic sidecars.

Initial target:

- WebGL2-compatible path for broad browser support.
- WebGPU path as the preferred long-term renderer.

### 3. Sorting And Visibility Layer

Responsibilities:

- Depth sort splats against the active camera.
- Avoid full sort every frame when the camera is static.
- Expose debug state: active splats, sorted splats, sort time, dropped splats.

Milestones:

- CPU sort baseline.
- Worker sort.
- GPU-assisted or tiled sort for large scenes.
- LOD and chunk streaming for future large indoor spaces.

### 4. Splat Shader Layer

Responsibilities:

- Project 3D Gaussian ellipsoids to screen-space splats.
- Composite with correct alpha blending.
- Support SH0 first, then SH1-SH3.
- Add quality controls: max pixel radius, opacity cutoff, density filters, pre-blur, antialiasing.

Initial requirement:

- Render the current Dongguan SOG/SPZ/PLY assets close enough to the Aholo backend to compare visually.

### 5. Scene And Camera Layer

Responsibilities:

- Provide stable camera APIs independent of renderer internals.
- Support free browse, orbit, path playback, bookmarks.
- Use a consistent coordinate contract for future mesh, collider, and semantic sidecars.

Required API:

```ts
viewer.camera.setPose(pose);
viewer.camera.lookAt(target);
viewer.controls.setMode('free' | 'orbit' | 'path');
```

### 6. Diagnostics And QA Layer

Responsibilities:

- Publish render backend id and capabilities.
- Report load time, parse time, GPU pack time, first frame time.
- Report memory estimate and active splat count.
- Support pixel-sample visibility checks for automated QA.

This layer is mandatory because ARK-3DGS is a browser plus data-quality tool, not only a visual viewer.

### 7. Spatial OS Data Layer

The renderer must not own all spatial truth. It should render the photoreal layer and align with sidecars:

```text
scene/
  manifest.json
  gaussian/scene.sog
  mesh/proxy.glb
  physics/colliders.json
  semantics/objects.json
  meta/quality_report.json
  previews/*.jpg
```

Future spatial features depend on this separation:

- collision
- occlusion
- walkable area
- object placement
- semantic scene graph
- multi-scan versioning

## Roadmap

### Phase 0: Backend Wrapper

Status: completed for the current demo.

Deliverables:

- ARK SDK types.
- `ArkRendererBackend` interface.
- `AholoRendererBackend` adapter.
- Browser shell no longer imports Aholo directly.

Exit criteria:

- Existing SOG/SPZ/PLY loading still works.
- Build passes.
- Debug state still includes renderer, scene, camera, and splat information.

### Phase 1: Internal Gaussian Data Contract

Status: active, with source/preview manifest contract completed for the demo scene.

Deliverables:

- `ArkGaussianData` type.
- PLY parser prototype.
- Bounds and SH summary from our own parser.
- Data contract tests with small fixtures.

Current progress:

- Added `src/sdk/gaussian/types.ts`.
- Added `src/sdk/gaussian/ply.ts`.
- Added `scripts/validate-gaussian-ply.mjs`.
- Added `scripts/test-gaussian-parser.mjs`.
- Added tiny regression fixture at `public/scenes/fixtures/tiny_gaussian_invalid.ply`.
- Generated `public/scenes/demo_room_001/meta/gaussian_data_contract_report.json`.
- Added dense percentile bounds: `broad_01_99`, `solid_05_95`, `core_10_90`.
- Wired bundled-scene camera fitting to the `broad_01_99` sidecar bounds.
- Added a runtime visual QA gate for canvas readiness, sidecar fit bounds, visible pixel sample, and contrast.
- Added bundled SOG/SPZ/PLY visual QA matrix reporting.
- Added a dev-only direct Aholo baseline harness and ARK-vs-baseline comparison report.
- Added manifest-level `gaussians.items` assets for runtime SOG, runtime SPZ, source PLY, and preview PLY.
- Added `scripts/validate-scene-manifest.mjs`.
- Added deterministic preview PLY generation for independent and first-party preview QA.
- Documented the current contract in `docs/GAUSSIAN_DATA_CONTRACT.md`.

Known data finding:

- The current PLY has `1,855,266` splats.
- `1,854,627` positions are finite.
- `639` positions are invalid and must be filtered before first-party rendering.
- The source is SH degree 3 with `45` SH rest fields.
- Exact bounds are much wider than dense bounds; camera fitting should use percentile bounds.

Default data policy:

- `decodeGaussianPly()` skips invalid positions by default.
- `sourceIndices` maps decoded splats back to source rows.
- `invalidSourceIndices` records filtered source rows.

Exit criteria:

- Add a small checked-in PLY fixture. Completed.
- Produce stable parser regression output for that fixture. Completed.
- Produce the same splat count and compatible bounds as the current backend on the large source asset.

### Phase 2: Minimal WebGL2 Renderer

Status: started with a diagnostic point renderer. This is not yet full Gaussian splatting.

Deliverables:

- Render SH0 color and opacity.
- CPU/worker sorting.
- Basic camera and resize.
- Debug stats.

Current progress:

- Added `src/sdk/ark/ArkPointRendererBackend.ts`.
- Added `?renderer=ark-point` backend selection in the browser shell.
- Added CPU back-to-front sorting for preview PLY.
- Added scale-aware point projection using decoded Gaussian `scale_0/1/2` and opacity.
- Added `scripts/qa-first-party-preview.mjs`.
- Current QA: `scene-preview-100k.ply`, `99,966` splats, `Passed (216.0)`, shader `sh0-scale-aware-point-cloud`, sorting `cpu-back-to-front`, last sort `17.5ms`.

Known limitation:

- The current first-party backend renders SH0 color as circular scale-aware points with alpha. It does not yet project anisotropic Gaussian covariance or support SH1-SH3 view-dependent color.

Exit criteria:

- Render one small Gaussian model without Aholo.
- Visual output is recognizable.
- Pixel sample QA returns `visible`.

### Phase 3: Production WebGPU Renderer

Deliverables:

- GPU-friendly packing.
- Faster sorting.
- Large-scene chunking.
- LOD and streaming.
- Runtime format optimized for indoor scenes.

Exit criteria:

- Handles million-splat scenes at interactive frame rates on target hardware.

### Phase 4: Spatial SDK Release

Deliverables:

- Public SDK package.
- Viewer component.
- CLI converter and validator.
- Documentation and examples.
- License and attribution policy.

Exit criteria:

- External developers can embed an ARK scene viewer and load a local scene using documented APIs.

## Release Positioning

Before first-party rendering is complete:

> ARK-3DGS is a local-first spatial SDK prototype using an Aholo backend adapter.

After first-party rendering is complete:

> ARK-3DGS is a first-party Gaussian spatial renderer and SDK for indoor AI scenes.

The transition should be made by replacing the renderer backend, not by rewriting the product shell.
