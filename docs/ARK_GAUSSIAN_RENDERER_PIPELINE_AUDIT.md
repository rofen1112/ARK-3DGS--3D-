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
- The remaining visual failure is in the renderer pipeline: sorting,
  projection/compositing, and color/shading fidelity.

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
