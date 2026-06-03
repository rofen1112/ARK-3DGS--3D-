# ARK-3DGS First-Party Renderer Plan

Target position:

> ARK-3DGS Spatial SDK, with first-party Gaussian renderer and spatial OS data layer.

## Current Architecture

The current runtime is intentionally split into two layers:

- `src/main.ts`: product shell, local file entry, scene manifest loading, free-browse controls, HUD, diagnostics publishing.
- `src/sdk`: ARK SDK boundary.
- `src/sdk/aholo/AholoRendererBackend.ts`: current renderer backend implemented on top of `@manycore/aholo-viewer`.
- `src/sdk/ark/ArkPointRendererBackend.ts`: first-party diagnostic WebGL point backend for proving ARK-owned PLY parsing, GPU upload, rendering, and QA.
- `src/sdk/ark/ArkGaussianRendererBackend.ts`: first-party WebGL2 Gaussian backend for proving ARK-owned instanced quad rendering and screen-space ellipse projection.

This means the application now depends on the ARK renderer interface first, and the Aholo SDK second. The next renderer can replace the backend without rewriting the browser shell.

Renderer boundary:

- Aholo remains the default runtime backend until ARK's own renderer reaches visual parity on the full scene.
- `renderer=ark-point` is a diagnostic point-splat baseline only.
- `renderer=ark-gaussian` is the active first-party Gaussian renderer path.
- The first-party renderer is not considered complete until QA reports `gaussianProjection=true` on a recognizable scene.

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

Status: active. The diagnostic point renderer is complete, and the first instanced ellipse Gaussian renderer is now the active first-party path.

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
- Added `src/sdk/ark/ArkGaussianRendererBackend.ts`.
- Added `?renderer=ark-gaussian` backend selection in the browser shell.
- Added first WebGL2 instanced quad path for screen-space ellipse projection from decoded scale and rotation quaternion.
- Added `scripts/qa-first-party-gaussian.mjs` with a hard `gaussianProjection=true` gate.
- Current Gaussian QA: `scene-preview-100k.ply`, `99,966` splats, `Passed (216)`, shader `sh0-instanced-ellipse-gaussian`, sorting `cpu-back-to-front`, opacity scale `0.44`, ellipse extent `2.05`, max pixel axis `10`, clipping `minClipW=0.02` and `offscreenPadding=1.4`.
- Added `scripts/qa-first-party-gaussian-compare.mjs` for first-party Gaussian comparison against Aholo and Kellogg preview baselines.
- Current comparison QA: all three preview paths render `99,966` splats; `clipping_passed=true`; `ark-gaussian` vs `aholo-adapter` signature similarity is `0.996124` with mean absolute RGB delta `0.9884`; signature contrast is `196` vs Aholo's `193`.
- Added `scripts/qa-first-party-gaussian-stress.mjs` for camera-edge and near-plane clipping stress QA.
- Current stress QA: `default-fit`, `edge-right`, `near-plane-close`, and `near-plane-offset` all pass; all cases retain `99,966` splats and `clipping_hard_gate_passed=true`.
- Added `scripts/qa-first-party-default-readiness.mjs` to assess whether `ark-gaussian` can become the default backend.
- Current readiness QA: `preview_path_ready=true`, `default_backend_ready=false`, `should_keep_aholo_default=true`, `blocking_count=4`.
- Added `scripts/qa-first-party-full-scene-visual-budget.mjs` for static full-scene visual gate assessment before attempting a full default replacement render.
- Current full-scene visual QA: `assessment_passed=true`, `visual_gate_passed=false`, `status=blocked-before-measurement`, default `runtime-sog`, Aholo-backed default visual QA `Passed (114.3)`, first-party preview visual QA `Passed (216)`.
- Added `scripts/qa-first-party-full-scene-performance-budget.mjs` for static full-scene performance budget assessment before attempting a full default replacement run.
- Current full-scene performance budget QA: `assessment_passed=true`, `performance_gate_passed=false`, `status=blocked-before-measurement`, default `runtime-sog`, `1,855,266` splats, current CPU sort limit `400,000`, ratio `4.638x`.
- Added `src/sdk/gaussian/runtimeMetadata.ts` and `scripts/validate-runtime-gaussian-metadata.mjs` for SOG/SPZ runtime metadata adapters.
- Current runtime metadata QA: `metadata_ready=true`, `runtime_asset_count=2`, `direct_renderable_runtime_asset_count=0`.
- Added `src/sdk/gaussian/runtimeFormatProbe.ts` and `scripts/validate-first-party-runtime-formats.mjs` for SOG/SPZ runtime container probing.
- Current runtime format probe QA: `probe_ready=true`, default `runtime-sog`, SOG container `sog-zip-webp` with `7` WEBP entries and `12.337` bytes/splat, SOG `meta.json` summary ready with channels `means`, `scales`, `quats`, `sh0`, and `shN`; SPZ container `spz-gzip` with `19.061` bytes/splat; `direct_decode_supported_count=0`.
- Added `src/sdk/gaussian/renderableAsset.ts` and `scripts/validate-first-party-renderable-assets.mjs` for first-party renderable asset resolution.
- Current renderable asset QA: default/runtime SOG/SPZ resolve to `preview-ply` in `preview-substitute` mode; `preview-ply` and `source-ply` resolve in `direct` mode.
- Added `src/sdk/gaussian/fullSceneCandidate.ts` and `scripts/validate-first-party-full-scene-candidate.mjs` for full-scene first-party measurement candidate resolution.
- Current full-scene candidate QA: default `runtime-sog` resolves to `source-ply` in `source-ply-substitute` mode; candidate is first-party loadable and splat-equivalent, but `measuredDefaultRuntime=false`.
- Added `scripts/qa-first-party-full-scene-source-ply-smoke.mjs` for degraded full-scene source PLY measurement.
- Current source PLY smoke QA: `smoke_passed=true`, renderer `ark-gaussian-webgl2`, decoded `1,854,627` valid splats, rendered `300,000` budget splats, skipped `639` invalid splats, sorting `cpu-back-to-front`, `sortEnabled=true`, LOD `deterministic-stride-budget`, visual QA `Passed (252.4)`, settle frames `1`, duration `15.951s`.
- Current source PLY timing breakdown: read `888.7ms`, decode `1,109.4ms`, pack `40.9ms`, upload `5.5ms`, renderer load `2,046ms`, visual gate wall-clock `10,758ms`, load peak `579.25MiB`.

Known limitation:

- The diagnostic point backend renders SH0 color as circular scale-aware points with alpha. It is retained only as a baseline.
- The first Gaussian backend still uses SH0 color and CPU sorting. It is a renderer milestone, not the final production WebGPU renderer.
- The Kellogg independent baseline visibly renders and matches splat count, but direct headless canvas signature downsampling returns near-zero contrast, so it is used for visual/data compatibility rather than signature-difference gating.
- The manifest default remains `runtime-sog`; first-party `ark-gaussian` currently loads direct PLY data only. The readiness gate must stay red until SOG/SPZ direct loading or a first-party runtime conversion path exists.
- Runtime format probing is now complete enough to identify the default SOG as a ZIP/WEBP-style container and summarize its `meta.json` channel layout, but no SOG/SPZ-to-ARK Gaussian buffer transcode path exists yet.
- The source PLY full-scene candidate can support degraded measurement work, but it is not the manifest default runtime and must not clear default backend readiness.
- The full default runtime has `1,855,266` splats, above the current `400,000` CPU sort limit. A worker/GPU sorting or streaming path is required before default replacement.
- The measured full-scene source PLY smoke is visible through a degraded deterministic stride LOD: it decodes all `1,854,627` valid splats but renders `300,000` budget splats. Adaptive QA and budgeted LOD reduced the previous `223.251s` smoke to `15.951s`, but this is not a default-runtime replacement path.
- The full-scene visual assessment is intentionally non-passing. It records Aholo-backed visibility baselines and keeps readiness red until the first-party renderer can measure the manifest default directly.
- The full-scene performance budget assessment is intentionally non-passing. It records the blockers and keeps readiness red until a measured full-scene performance gate can run.

Completed renderer tuning:

- Tuned first-party Gaussian opacity scale to `0.44`, reducing preview Visual QA contrast from `272.9` to `222.2`.
- Reduced `ark-gaussian` vs Aholo mean absolute RGB signature delta from `1.0648` to `0.9968`.
- Reduced `ark-gaussian` signature contrast from `222` to `197`, closer to Aholo's `193`.
- Tuned first-party Gaussian ellipse extent to `2.05` and max pixel axis to `10`, reducing preview Visual QA contrast further to `216`.
- Reduced `ark-gaussian` vs Aholo mean absolute RGB signature delta further to `0.9884`, with similarity `0.996124`.
- Added adaptive large-scene visual QA settle and initial render burst policy. Preview PLY keeps the normal `8` settle frames; full-source PLY smoke now uses `1` settle frame and reduced smoke duration from `223.251s` to `80.971s`.
- Added deterministic stride LOD for degraded full-source PLY smoke. The renderer keeps decoded splats at `1,854,627`, renders `300,000` budget splats, enables CPU sorting on the budget, and reduced smoke duration from `80.971s` to `15.951s`.
- Added explicit near/far and offscreen center clipping. The current baseline metrics are unchanged after clipping: `ark-gaussian` vs Aholo mean absolute RGB delta `0.9884`, similarity `0.996124`, signature contrast `196` vs Aholo's `193`.
- Promoted clipping debug state to a hard QA gate in the single renderer, comparison, and stress harnesses.
- Added camera-edge and near-plane stress cases. Edge stress uses canvas signature contrast instead of only the sparse 3x3 pixel sample, because edge-visible content can miss fixed sample points.
- Added default backend readiness reporting with explicit blockers and an optional `--require-ready` hard failure mode.
- Added SOG/SPZ runtime metadata adapters. These adapters make runtime assets auditable in the first-party data layer, but they do not claim direct first-party rendering support.
- Added SOG/SPZ runtime format probes. These identify container signatures, extract the SOG `meta.json` layout summary, and record decode/transcode blockers without claiming direct first-party rendering support.
- Added renderable asset resolver. Preview substitutes are degraded first-party candidates for QA and diagnostics; they do not remove the default backend blockers.
- Added full-scene measurement candidate resolver. Source PLY substitutes are allowed for measurement scaffolding only; they do not make SOG/SPZ directly supported.
- Added degraded full-scene source PLY smoke QA. This is the first real full-scene first-party renderer measurement, but it is not a default-runtime readiness gate.
- Added full-scene visual gate reporting. This is an audit gate scaffold, not proof that the first-party renderer can display the full runtime scene.
- Added full-scene performance budget reporting. This is an audit gate scaffold, not proof that the full runtime scene is performant.

Next renderer tuning target:

- Harden covariance projection math and alpha compositing while keeping `ark-gaussian` vs Aholo preview splat delta at `0`.
- Replace degraded stride LOD with a production large-scene strategy: direct SOG/SPZ loading, worker/GPU sorting, chunk streaming, or view-dependent LOD with quality comparison.
- Convert the full-scene visual and performance assessments into measured gates before changing the default backend.
- Implement the first SOG-to-ARK Gaussian buffer conversion path from `means_l.webp`, `means_u.webp`, `scales.webp`, `quats.webp`, `sh0.webp`, `shN_centroids.webp`, and `shN_labels.webp`. SPZ remains a GZIP payload probe until its layout is decoded.
- Keep `gaussianProjection=true`, `covarianceProjection=true`, `instancing=true`, and clipping debug state as hard QA requirements.

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
