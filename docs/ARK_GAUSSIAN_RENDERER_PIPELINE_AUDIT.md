# ARK Gaussian Renderer Pipeline Audit

Date: 2026-06-03

## Goal

Restore the first-party `ark-gaussian` renderer by filling the missing core
3DGS rendering pipeline pieces before attempting another rollback or a renderer
framework replacement.

The target remains:

> ARK-3DGS Spatial SDK, with first-party Gaussian renderer and spatial OS data
> layer.

Aholo remains the default production backend until the first-party renderer
passes full-scene visual, performance, and runtime-format gates.

## Current Failure Classification

The current full-source PLY issue is not a source-data density problem.

- The local/source PLY contains `1,854,627` valid decoded splats.
- The first-party renderer now draws all decoded splats for this scene.
- The remaining visual delta is in the renderer pipeline: projection math,
  packed data access, and full color/shading fidelity. Same-camera isolation now
  makes sorting order and alpha blend function unlikely as the primary cause.

## Aholo Pipeline Evidence

The local `@manycore/aholo-viewer` package includes the renderer runtime in
`node_modules/@manycore/aholo-viewer/dist`.

Relevant visible implementation areas:

- `SplattingMaterial`: screen-space covariance projection, blur adjustment,
  falloff, max-radius clamp, and premultiplied composite output.
- `SplatSortMaterial`: camera-dependent sort metric generation.
- `SplatReorderMaterial` / repack stages: order-aware GPU data access.
- `splat-worker.js sortSplats`: linear bucket sorting for large splat counts.
- SOG/SPZ/PLY loader code paths and packed texture data contracts.

The bundled code and sourcemaps are enough to audit the architecture, but the
clean original TypeScript source is not present in this repository. ARK should
implement its own renderer modules from the concepts rather than copying large
dist chunks.

## Required Pipeline Checklist

Each item must be implemented or explicitly blocked before declaring first-party
renderer readiness.

| Area | Required Capability | Current ARK Status |
| --- | --- | --- |
| Data decode | PLY centers, SH0, opacity, log scale, quaternion rotation, invalid splat filtering | Implemented for PLY |
| Runtime formats | Direct SOG/SPZ-to-ARK Gaussian buffers | Not implemented |
| Data packing | GPU-friendly packed center/color/covariance/order access | Attribute-buffer prototype only |
| Sort metric | Camera-dependent depth/radial metric | Exact CPU for preview, bucket CPU for <= 2M |
| Large-scene sorting | Linear/worker/GPU sorting without source-order fallback | First CPU bucket sort added for full source PLY |
| Projection | 3D covariance projected to screen-space ellipse with blur/focal adjustment | Jacobian covariance projection added in Round 4 |
| Compositing | Correct alpha falloff and premultiplied blending | Premultiplied alpha added in Round 4 |
| Shading | SH0 and higher-degree SH evaluation | SH1 prototype added; source is SH3 and full SH3 is not implemented |
| Visual gates | Aholo comparison and full-scene evidence | Scaffolded, not production-passing |
| Performance gates | Load/render/sort budgets under target hardware | Scaffolded, not production-passing |

## Repair Objective For This Round

Round 3 focuses on the first high-risk missing core piece:

- Replace full-density `source-order` blending with a deterministic
  camera-depth bucket sort for source scenes up to `2,000,000` splats.
- Keep all decoded splats rendered for the current `1,854,627` source PLY.
- Preserve preview PLY exact sorting and existing parser behavior.
- Keep Aholo as default even if this round improves the experimental renderer.

Pass conditions:

- `qa:first-party-gaussian` passes for preview PLY.
- `qa:first-party-local-source-smoke` reports:
  - `renderedSplats === splats`
  - `lod.enabled === false`
  - `largeScene.strategy === "full-density-bucket-depth-sort"`
  - `pipeline.sorting === "cpu-bucket-back-to-front"`
  - `sortEnabled === true`
- `qa:first-party-full-scene-smoke` passes its degraded smoke gate.
- Browser visual inspection shows meaningful improvement over the previous
  full-density source-order render.

Failure conditions:

- If bucket sorting does not materially improve the image, stop parameter
  tuning and move to projection/compositing parity work.
- If projection/compositing parity work still fails after the next focused
  round, evaluate an external renderer framework as a technical scaffold.

Round 3 observation:

- The bucket sort gate passes in local/source and full-scene smoke QA.
- The full source PLY now reports `cpu-bucket-back-to-front` with all
  `1,854,627` valid splats rendered.
- The screenshots still look thin and incomplete compared with the Aholo target.
  The next focused repair must address covariance projection and composite mode,
  not point density.

Round 4 observation:

- The first-party shader now reports `projectionModel="jacobian-covariance"`
  and `composite="premultiplied-alpha"`.
- Preview QA passes with `visual_quality=Passed (89.8)`.
- Full source PLY smoke passes with all `1,854,627` valid splats rendered,
  `cpu-bucket-back-to-front` sorting, and `visual_quality=Passed (222.8)`.
- Visual parity is still blocked. The source data is SH degree `3`, while the
  first-party renderer is still `sh0-dc-only`; packed GPU data access is also
  still an attribute-buffer prototype.

Round 5 observation:

- The renderer now reports `shading="sh1-view-dependent"`,
  `sourceShDegree=3`, `renderShDegree=1`, and `renderShRestCount=9`.
- SH1 reads the 3DGS channel-major PLY layout explicitly rather than assuming
  `f_rest_0..8` is already RGB-interleaved.
- Preview asset coverage is now visible in the HUD: `preview-ply` is `5.39%`
  of source density, while `source-ply` is `99.97%`.
- Source PLY smoke still renders all `1,854,627` valid splats, but SH1 only
  changes the visual contrast gate from `222.8` to `223.7`. The next blocker is
  full SH3/color and packed data access, not splat density.
- Manual browser review on 2026-06-04 confirmed the repaired source PLY path can
  display normally. Future debug sessions should preserve this checkpoint and
  first verify asset coverage and SH rest ordering before tuning renderer
  constants.

Round 6 baseline setup:

- `qa:first-party-same-camera` now produces a source PLY Aholo-vs-ARK
  comparison under a canonical ARK-derived camera.
- The current source baseline has `camera_delta=0`; data-count difference is
  explained by the `639` invalid splats skipped by ARK.
- This report is the baseline for deciding whether the next SH3/color work is
  improving visual parity or merely changing renderer constants.

Round 6 SH3 diagnostic:

- Source PLY Aholo SH0 and Aholo SH3 are visually close under the same camera:
  mean absolute RGB delta `0.1345`, similarity `0.999473`.
- Preview PLY confirms this with Aholo SH0 vs SH3 mean absolute RGB delta
  `0.0518`.
- ARK's same-camera delta to Aholo is about an order of magnitude larger than
  Aholo's own SH0-to-SH3 delta. The next audit target should therefore be
  projection/sort/composite isolation, while keeping full SH3 as a later packed
  data requirement.

Round 7 pipeline isolation:

- Added dev-only ARK diagnostics for sort override, composite mode, and
  projection profile. Default rendering stays unchanged when these URL
  parameters are absent.
- Preview exhaustive isolation passed for all targets. Default ARK vs Aholo SH0
  has mean absolute RGB delta `0.9728`; source-order sorting is slightly worse
  at `0.9758`; straight alpha is identical to default at `0.9728`; tested
  projection shortcuts are worse at `1.0002`, `0.9985`, and `1.0090`.
- Full-source core isolation passed for default ARK, source-order ARK,
  straight-alpha ARK, and Aholo SH0. Default ARK vs Aholo SH0 remains `1.6336`;
  source-order sorting worsens to `1.6602`; straight alpha is identical to
  default. The `639` splat delta remains explained by invalid source positions.
- The full-source exhaustive matrix exceeded `15` minutes before report
  generation, so full-source routine QA is intentionally core-only and the
  exhaustive matrix remains a manual deep-dive command.
- Decision: do not continue tuning density, sort order, or blend function as the
  main repair. The next focused audit should compare the covariance projection,
  focal adjustment, falloff, and data packing/order-access assumptions against
  Aholo and local open-source references.

Round 8 Aholo material profile diagnostic:

- Aholo's visible `SplattingMaterial` defaults are `preBlurAmount=0`,
  `blurAmount=0.3`, and `focalAdjustment=1`. ARK's current tuned default is
  `preBlurAmount=0.3`, `blurAmount=0`, and `focalAdjustment=2`.
- Added `arkDiagProjection=aholo-material` to test Aholo's default material
  constants as one combined profile without changing ARK's default path.
- Preview result: default ARK vs Aholo SH0 is `0.9728`; `aholo-material` vs
  Aholo SH0 worsens to `1.3020`.
- Full-source result: default ARK vs Aholo SH0 is `1.6336`;
  `aholo-material` vs Aholo SH0 worsens to `1.7203`.
- Decision: constant matching is not enough and should not be promoted. The
  next audit should inspect packed covariance/order texture semantics, source
  scale/covariance reconstruction, and whether ARK's attribute-buffer prototype
  differs from Aholo's packed data contract before doing more projection
  parameter tuning.

Round 9 packed data architecture audit:

- Added `docs/ARK_GAUSSIAN_PACKED_DATA_AUDIT.md` after inspecting the visible
  Aholo packed covariance, center texture, order texture, worker sort, and
  optional repack paths.
- Confirmed that Aholo separates stable packed source data from draw order:
  sorted draw order is represented as source indices in an order buffer or as
  repacked sorted textures.
- Confirmed that ARK's current renderer is still an attribute-buffer prototype:
  covariance is rebuilt from scale/quaternion attributes in the vertex shader,
  and sorted CPU copies are re-uploaded for the active draw order.
- Added the first diagnostic packed covariance builder and CPU round-trip parity
  audit in `src/sdk/gaussian/packedData.ts`, plus `validate:packed-data`.
- Full source PLY packed audit passes on this workstation:
  `1,854,627` decoded splats, `639` invalid source positions skipped, `2,048`
  covariance samples, max absolute covariance delta `6.956697071160362e-7`, and
  estimated packed audit payload `106.123MiB`.
- Default `ark-gaussian` now exposes data access state in debug output:
  `dataPacking="attribute-buffer"`,
  `covarianceStorage="scale-rotation-attributes"`, and sorted preview
  `orderAccess="cpu-reordered-attributes"`. `qa:first-party-gaussian` checks
  these fields.
- Decision: CPU packed covariance parity is stable enough to proceed to the
  next diagnostic layer. Do not change default projection, alpha, density, or
  sorting constants until a dev-only texture-fetch prototype has separate
  evidence.

Round 10 GPU texture upload/readback diagnostic:

- Added `arkDiagData=texture-audit`, a dev-only WebGL2 diagnostic that uploads
  source-order center, packed covariance A, packed covariance B, and sorted
  order textures. The normal draw path remains attribute buffers.
- Added `qa:first-party-data-texture` and
  `public/scenes/demo_room_001/meta/first_party_data_texture_audit_report.json`.
- Preview PLY result: `99,966` splats, texture size `317 x 316`, `3` readback
  samples, center max delta `0`, covariance max delta
  `9.151638451498911e-7`, order max delta `0`, visual QA still `Passed (87.1)`.
- Decision: GPU texture upload/readback is stable enough for the next dev-only
  step: a separate texture-fetch draw program or shader branch. Do not replace
  the default draw path until same-camera comparison proves parity.

Round 11 dev-only texture-fetch draw path:

- Added `arkDiagData=texture-fetch`, a dev-only draw path that uses
  `gl_InstanceID` plus the order texture to fetch source-order center and packed
  covariance textures. Color and SH1 remain sorted attributes in this first
  hybrid step.
- Added `qa:first-party-texture-fetch` and
  `public/scenes/demo_room_001/meta/first_party_texture_fetch_renderer_report.json`.
- Added `qa:first-party-texture-fetch-compare` and
  `public/scenes/demo_room_001/meta/first_party_texture_fetch_compare_report.json`.
- Preview result: texture-fetch visual QA passes with `99,966` splats,
  `dataPacking="texture-fetch-hybrid"`,
  `covarianceStorage="packed-covariance-texture"`, and
  `orderAccess="order-texture"`.
- Same-camera A/B result: `ark-texture-fetch` vs default `ark-gaussian` has
  mean absolute RGB delta `0`, RMS `0`, max RGB delta `0`, and similarity `1`.
- Decision: preview geometry/order texture fetching is equivalent to the
  attribute-buffer path. The next step is to move color/SH into packed textures
  or validate this path against source-density constraints; default rendering
  remains unchanged.

## External Renderer Framework Trigger

Only start the external renderer framework path after these have been audited:

1. PLY decode parity.
2. Camera fit and coordinate transform parity.
3. Large-scene sorting.
4. Covariance projection.
5. Alpha falloff and composite mode.
6. SH color handling.

Candidate framework direction:

- Use `@mkkellogg/gaussian-splats-3d` as the first local comparison and
  implementation reference because it is already in the dev dependencies.
- If a stronger framework is needed, inspect current open-source 3DGS web
  renderers and select based on source availability, license, runtime format
  support, sorting architecture, and WebGL/WebGPU suitability.

This path should supplement ARK's renderer architecture, not replace the ARK SDK
boundary or spatial data layer.
