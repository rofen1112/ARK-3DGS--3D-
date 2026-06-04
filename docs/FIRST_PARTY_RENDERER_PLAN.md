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
- Current Gaussian QA: `scene-preview-100k.ply`, `99,966` splats, `Passed (89.8)`, shader `sh0-jacobian-covariance-gaussian`, sorting `cpu-exact-back-to-front`, projection `jacobian-covariance`, composite `premultiplied-alpha`, source SH degree `3`, render SH degree `0`, opacity scale `0.44`, maxStdDev `2.828`, max pixel radius `1024`, clipping `minClipW=0.02` and `offscreenPadding=1.4`.
- Added `scripts/qa-first-party-gaussian-compare.mjs` for first-party Gaussian comparison against Aholo and Kellogg preview baselines.
- Current comparison QA: all three preview paths render `99,966` splats; `clipping_passed=true`; `ark-gaussian` vs `aholo-adapter` signature similarity is `0.996124` with mean absolute RGB delta `0.9884`; signature contrast is `196` vs Aholo's `193`.
- Added `scripts/qa-first-party-gaussian-stress.mjs` for camera-edge and near-plane clipping stress QA.
- Current stress QA: `default-fit`, `edge-right`, `near-plane-close`, and `near-plane-offset` all pass; all cases retain `99,966` splats and `clipping_hard_gate_passed=true`.
- Added `scripts/qa-first-party-default-readiness.mjs` to assess whether `ark-gaussian` can become the default backend.
- Current readiness QA: `preview_path_ready=true`, `default_backend_ready=false`, `should_keep_aholo_default=true`, `blocking_count=4`.
- Added `scripts/qa-first-party-full-scene-visual-budget.mjs` for static full-scene visual gate assessment before attempting a full default replacement render.
- Current full-scene visual QA: `assessment_passed=true`, `visual_gate_passed=false`, `status=blocked-before-measurement`, default `runtime-sog`, Aholo-backed default visual QA `Passed (114.3)`, first-party preview visual QA `Passed (89.8)`.
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
- Current source PLY smoke QA: `smoke_passed=true`, renderer `ark-gaussian-webgl2`, decoded `1,854,627` valid splats, rendered `1,854,627` full-density splats, skipped `639` invalid splats, sorting `cpu-bucket-back-to-front`, `sortEnabled=true`, LOD disabled, large-scene strategy `full-density-bucket-depth-sort`, projection/composite `jacobian-covariance` + `premultiplied-alpha`, visual QA `Passed (222.8)`, settle frames `1`, duration `76.476s`.
- Current source PLY timing breakdown: read `1,717.1ms`, decode `1,236.1ms`, pack `206.2ms`, upload `84.6ms`, renderer load `3,246ms`, visual gate wall-clock `51,626ms`, load peak `757.163MiB`.

Known limitation:

- The diagnostic point backend renders SH0 color as circular scale-aware points with alpha. It is retained only as a baseline.
- The first Gaussian backend now uses Jacobian covariance projection, premultiplied alpha, SH0 color, exact CPU sorting for preview scenes, and bucket CPU sorting for the current full source PLY. It is a renderer milestone, not the final production WebGPU renderer.
- The current source PLY is SH degree `3`, but `ark-gaussian` renders only SH1. Full SH3 remains a first-party format-completeness blocker, though current same-camera evidence does not identify SH3 as the main visual delta.
- The Kellogg independent baseline visibly renders and matches splat count, but direct headless canvas signature downsampling returns near-zero contrast, so it is used for visual/data compatibility rather than signature-difference gating.
- The manifest default remains `runtime-sog`; first-party `ark-gaussian` currently loads direct PLY data only. The readiness gate must stay red until SOG/SPZ direct loading or a first-party runtime conversion path exists.
- Runtime format probing is now complete enough to identify the default SOG as a ZIP/WEBP-style container and summarize its `meta.json` channel layout, but no SOG/SPZ-to-ARK Gaussian buffer transcode path exists yet.
- The source PLY full-scene candidate can support degraded measurement work, but it is not the manifest default runtime and must not clear default backend readiness.
- The full default runtime has `1,855,266` splats, above the exact CPU sort limit. The Round 3 bucket sort path targets source PLY scenes up to `2,000,000` splats, but default replacement still requires direct SOG/SPZ conversion and production-grade worker/GPU sorting or streaming.
- The measured full-scene source PLY smoke now renders all `1,854,627` valid source splats for scenes under the `2,000,000` full-density limit. Round 3 replaces the previous `source-order` fallback with `cpu-bucket-back-to-front` sorting, but this is still a source-PLY measurement candidate rather than a default-runtime replacement path.
- The full-scene visual assessment is intentionally non-passing. It records Aholo-backed visibility baselines and keeps readiness red until the first-party renderer can measure the manifest default directly.
- The full-scene performance budget assessment is intentionally non-passing. It records the blockers and keeps readiness red until a measured full-scene performance gate can run.

Completed renderer tuning:

- Tuned first-party Gaussian opacity scale to `0.44`, reducing preview Visual QA contrast from `272.9` to `222.2`.
- Reduced `ark-gaussian` vs Aholo mean absolute RGB signature delta from `1.0648` to `0.9968`.
- Reduced `ark-gaussian` signature contrast from `222` to `197`, closer to Aholo's `193`.
- Tuned first-party Gaussian ellipse extent to `2.05` and max pixel axis to `10`, reducing preview Visual QA contrast further to `216`.
- Reduced `ark-gaussian` vs Aholo mean absolute RGB signature delta further to `0.9884`, with similarity `0.996124`.
- Added adaptive large-scene visual QA settle and initial render burst policy. Preview PLY keeps the normal `8` settle frames; full-source PLY smoke now uses `1` settle frame and reduced smoke duration from `223.251s` to `80.971s`.
- Added deterministic stride LOD for degraded full-source PLY smoke. The renderer kept decoded splats at `1,854,627`, rendered `300,000` budget splats, enabled CPU sorting on the budget, and reduced smoke duration from `80.971s` to `15.951s`.
- Added full-density large-scene rendering for source scenes up to `2,000,000` splats. The current source PLY now renders all `1,854,627` splats with `source-order` blending and a `large-scene-full-density` profile. This improves density but keeps readiness blocked until sorting/projection quality is solved.
- Added Round 3 full-density bucket depth sorting for source scenes up to `2,000,000` splats. The current source PLY target strategy is `full-density-bucket-depth-sort`, with `cpu-bucket-back-to-front` sorting and all `1,854,627` valid splats rendered.
- Added `docs/ARK_GAUSSIAN_RENDERER_PIPELINE_AUDIT.md` to lock the core renderer checklist, pass conditions, and external renderer framework trigger.
- Added Round 4 Jacobian covariance projection and premultiplied alpha compositing. The renderer now reports `projectionModel="jacobian-covariance"`, `composite="premultiplied-alpha"`, `sourceShDegree=3`, and `renderShDegree=0`.
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
- Added Round 5 asset coverage diagnostics in the HUD and renderer debug state. Preview PLY now reports `99,966 / 1,855,266 (5.39%)`; source PLY reports `1,854,627 / 1,855,266 (99.97%)`.
- Added explicit SH rest index decoding and a limited SH1 view-dependent color path. The renderer now reports `sourceShDegree=3`, `renderShDegree=1`, `renderShRestCount=9`, and `shading="sh1-view-dependent"`.
- Corrected SH1 field selection for the 3DGS channel-major PLY layout. For the current SH3 source, SH1 reads `f_rest_0/15/30`, `f_rest_1/16/31`, and `f_rest_2/17/32`.
- Verified that SH1 alone does not materially close the visual gap. Source smoke moved only from `Passed (222.8)` to `Passed (223.7)`, while memory rose to `948.184MiB` load peak.
- Added a manual debug note after user visual confirmation on 2026-06-04: the repaired source PLY path displays normally when the app is on `asset=source-ply`, with HUD coverage `1,854,627 / 1,855,266 (99.97%)`.
- Added `qa:first-party-same-camera` to lock Aholo and ARK to the same source PLY camera before comparing visual signatures. The current source result has `camera_delta=0`, ARK `1,854,627` splats, Aholo `1,855,266` splats, and the `639` splat delta is explained by ARK's invalid-position skip policy.
- Current source same-camera signature result: `ark-gaussian` vs `aholo-adapter-sh0` mean absolute RGB delta `1.6336`, RMS `7.5424`, max channel delta `153`, changed pixel ratio `0.021798`, similarity `0.993594`.
- Ran the same-camera SH3 diagnostic references. On source PLY, Aholo SH0 vs Aholo SH3 mean absolute RGB delta is only `0.1345` with similarity `0.999473`; ARK vs Aholo SH3 is `1.6483`, slightly worse than ARK vs Aholo SH0. On preview PLY, Aholo SH0 vs Aholo SH3 mean absolute RGB delta is only `0.0518`. This lowers SH3/color from the immediate visual-fix hypothesis.
- Added renderer pipeline isolation diagnostics behind URL parameters and `qa:first-party-pipeline-isolation`. The defaults remain unchanged unless `arkDiagSort`, `arkDiagComposite`, or `arkDiagProjection` are present.
- Current preview exhaustive isolation: default ARK vs Aholo SH0 mean absolute RGB delta `0.9728`, similarity `0.996185`; source-order sorting is slightly worse (`0.9758`), straight alpha is identical to default (`0.9728`), and tested projection profiles are worse (`1.0002`, `0.9985`, `1.0090`).
- Current source core isolation: default ARK vs Aholo SH0 remains `1.6336` with similarity `0.993594`; source-order sorting worsens to `1.6602`; straight alpha is exactly identical to default (`0` delta vs ARK default). This makes sorting order and blend function unlikely as the primary remaining visual delta.

Next renderer tuning target:

- Use the same-camera report as the baseline before changing renderer constants. If visual quality regresses, compare against the latest `first_party_same_camera_comparison_report.json` before tuning opacity, scale, or density.
- Treat projection math and packed data access as the next focused target. The current isolation pass does not justify further sorting-order or alpha-blend tuning, and the tested projection parameter shortcuts did not improve Aholo parity.
- When SH3 work resumes, do it without adding all coefficients as per-instance attributes. Preferred paths are packed SH textures/order buffers or a CPU SH3 A/B diagnostic used only to isolate color parity.
- Move first-party data access from large CPU attribute buffers toward packed GPU textures/order buffers, matching the architecture needed for SOG/SPZ runtime conversion.
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
