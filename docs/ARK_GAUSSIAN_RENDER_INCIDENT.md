# ARK Gaussian Render Incident

Date: 2026-06-03

Branch: `ark-gaussian-render-incident`

## Purpose

This branch preserves the current project state after a visual correctness issue
was found in the first-party `ark-gaussian` renderer. It is intended for
diagnosis and repair work without advancing or destabilizing `main`.

Future renderer repair commits should target this branch until the issue is
resolved and verified.

## Observed Issue

The local full-source PLY path was loaded with:

- URL renderer: `?renderer=ark-gaussian`
- Source: local file
- Format: PLY
- Splat count: 1,854,627
- Fit bounds: `ply_exact (computed)`
- Visual QA: passed by contrast-only gate, but visually incorrect

The rendered image shows recognizable scene structure, but it is covered by
large translucent blobs, streaking, star-like artifacts, and noisy foreground
overdraw. This indicates that the asset is being decoded and drawn, but the
first-party Gaussian rendering pipeline is not visually correct for the full
local PLY scene.

## Current Assessment

The issue is not currently attributed to the runtime SOG/SPZ format probe work.
The uncommitted runtime format probe changes do not modify:

- `src/sdk/ark/ArkGaussianRendererBackend.ts`
- `src/main.ts`
- `src/sdk/gaussian/ply.ts`

The likely fault area is the first-party `ark-gaussian` renderer introduced in
commit `9e83308 Advance first-party Gaussian renderer readiness`.

Primary suspects:

- Simplified SH0-only color path instead of full SH evaluation.
- Approximate screen-space ellipse projection rather than a production 3DGS
  covariance/EWA rasterization path.
- Heuristic alpha, extent, and pixel-axis clamps.
- Large-scene deterministic stride LOD: 1,854,627 decoded splats are reduced to
  a 300,000 splat render budget.
- Local-file full PLY uses computed exact fit bounds instead of the bundled
  sidecar fit bounds used by preview QA.

## Safety Decision

Do not perform a destructive rollback on `main`.

Rollback should be used only as a non-destructive comparison technique, for
example by inspecting older commits or creating a temporary comparison worktree.
The preferred repair path is to keep the current state on this branch and apply
targeted renderer fixes after side-by-side validation.

Until visual correctness is restored, `ark-gaussian` should be treated as
experimental and not as an Aholo replacement candidate.

## Next Validation Steps

1. Capture current `ark-gaussian` debug state and screenshot for the full local
   PLY path.
2. Compare against `ark-point` on the same PLY to separate data decode issues
   from Gaussian projection issues.
3. Compare against Aholo default/runtime path for a stable visual reference.
4. Review `ArkGaussianRendererBackend` scale, opacity, rotation, projection,
   sorting, and LOD behavior.
5. Add a visual correctness blocker so contrast-only QA can no longer mark this
   artifacted full-scene render as ready.

## Repair Round 1

Status: partially mitigated, not production-ready.

Changes:

- Local/no-sidecar PLY loads now compute `ply_01_99` percentile fit bounds
  instead of using full exact bounds with outliers.
- Large-scene first-party LOD now uses a separate
  `large-scene-lod-softened` render profile:
  - ellipse extent: `2.45`
  - min pixel axis: `0.35`
  - max pixel axis: `5.5`
  - opacity scale derived from rendered ratio, `0.176964` for the current
    300,000 / 1,854,627 source PLY smoke path
- Added local-source smoke QA for the no-sidecar path:
  `npm.cmd run qa:first-party-local-source-smoke`

Validation:

- `npm.cmd run test:gaussian`: passed
- `npm.cmd run build`: passed
- `npm.cmd run qa:first-party-gaussian`: passed
- `npm.cmd run qa:first-party-full-scene-smoke`: passed
- `npm.cmd run qa:first-party-local-source-smoke`: passed

Observed result:

- The previous local-file `ply_exact (computed)` fit path now resolves to
  `ply_01_99 (computed)`.
- The previous local-file display scale equivalent changed from `0.2153x` to
  `0.2825x` in the source PLY smoke path.
- Full-scene smoke contrast dropped from `252.4` to `52.4`, indicating that the
  previous over-bright blob artifacts were reduced.

Remaining risk:

- This is a mitigation, not proof of correct 3DGS rendering.
- The renderer still uses SH0-only color, deterministic stride LOD, and an
  approximate screen-space ellipse projection.
- If close-view artifacts remain after this round, the next repair round should
  isolate projection/math issues and LOD sampling quality. If round 3 still does
  not produce acceptable output, switch to rollback comparison.

## Repair Round 2

Status: density issue confirmed and fixed; visual correctness still blocked.

Reason for the sparse result:

- The previous large-scene path decoded all `1,854,627` valid source splats but
  rendered only a deterministic `300,000` splat budget.
- That means the first-party renderer was drawing about `16.2%` of the available
  splats. The source data does not need synthetic point densification for this
  scene; the renderer was under-drawing it.

Changes:

- Full source scenes up to `2,000,000` splats now render at full density.
- The current local/source PLY path now reports:
  - rendered splats: `1,854,627`
  - LOD: disabled
  - large-scene strategy: `full-density-source-order`
  - ellipse profile: `large-scene-full-density`
- For scenes larger than `2,000,000` splats, the previous 300,000 budget remains
  available as a fallback.

Validation:

- `npm.cmd run test:gaussian`: passed
- `npm.cmd run build`: passed
- `npm.cmd run qa:first-party-gaussian`: passed
- `npm.cmd run qa:first-party-local-source-smoke`: passed
- `npm.cmd run qa:first-party-full-scene-smoke`: passed
- `npm.cmd run qa:first-party-full-scene-visual`: assessment passed, gate remains blocked
- `npm.cmd run qa:first-party-full-scene-performance`: assessment passed, gate remains blocked
- `npm.cmd run qa:first-party-readiness`: assessment passed, `default_backend_ready=false`

Observed result:

- The visible density is improved because all source splats are now drawn.
- Headless source smoke duration increased from about `15.9s` to about `83.4s`.
- GPU upload increased from about `16MiB` to about `99MiB`.

Remaining blocker:

- Full-density rendering still uses source-order blending because CPU sorting is
  capped at `400,000` splats.
- The image is still not visually correct enough. The next repair round should
  isolate sorting, projection, and SH/color handling. If that round does not
  produce a meaningful visual improvement, begin rollback comparison instead of
  continuing parameter tuning.

## Repair Round 3

Status: sorting repair complete; visual correctness still blocked.

Reason:

- Round 2 proved that point density alone does not fix the full-scene image.
- The full-density path was still using `source-order` alpha blending, which is
  not acceptable for large Gaussian scenes.
- Aholo's bundled renderer uses a camera-dependent sort metric and a linear
  bucket sort path, so ARK needs an equivalent first-party sorting stage before
  deeper projection/compositing work can be judged.

Changes:

- Added explicit first-party sort modes:
  - `exact-depth` for scenes up to `400,000` rendered splats.
  - `bucket-depth` for scenes up to `2,000,000` rendered splats.
  - `disabled` only above the current bucket-sort limit.
- The current source PLY path now targets:
  - rendered splats: `1,854,627`
  - LOD: disabled
  - sorting: `cpu-bucket-back-to-front`
  - large-scene strategy: `full-density-bucket-depth-sort`
- Added sort depth range and sort mode diagnostics to the renderer debug state.
- Increased the full-density opacity scale from `0.12` to `0.24` after removing
  the source-order fallback, so the full scene is no longer intentionally
  underweighted as heavily as the previous mitigation.
- Added `docs/ARK_GAUSSIAN_RENDERER_PIPELINE_AUDIT.md` to define the renderer
  pipeline checklist, current gaps, pass conditions, and external renderer
  framework trigger.

Validation:

- `npm.cmd run test:gaussian`: passed
- `npm.cmd run build`: passed
- `npm.cmd run qa:first-party-gaussian`: passed
- `npm.cmd run qa:first-party-local-source-smoke`: passed
- `npm.cmd run qa:first-party-full-scene-smoke`: passed

Observed Round 3 source PLY smoke:

- rendered splats: `1,854,627`
- LOD: disabled
- sorting: `cpu-bucket-back-to-front`
- large-scene strategy: `full-density-bucket-depth-sort`
- visual QA: `Passed (244.4)` by contrast gate
- renderer load: `2,151ms`
- retained CPU buffer: `212.245MiB`
- GPU upload: `99.048MiB`
- load peak: `757.163MiB`
- average render time in smoke: `19.62ms`
- max render time in smoke: `98.1ms`

Remaining risk:

- This round only addresses large-scene sorting. The QA screenshots still show a
  thin and visually incomplete render, so the next round must move to covariance
  projection and premultiplied compositing parity with Aholo instead of further
  opacity/scale tuning.

## Repair Round 4

Status: projection/composite repair landed; visual correctness still blocked.

Reason:

- Round 3 proved that full-density bucket sorting is necessary but not
  sufficient.
- The previous shader estimated screen-space covariance by projecting three
  rotated axis endpoints. Aholo's renderer uses a camera-space Jacobian
  covariance projection and premultiplied alpha compositing.
- The source PLY is `SH degree 3`, while the first-party renderer still renders
  SH0 only. The renderer now exposes this explicitly instead of reporting the
  scene as degree `0`.

Changes:

- Replaced the simplified axis-endpoint projection with a Jacobian covariance
  projection path:
  - builds 3D covariance from decoded scale and quaternion rotation
  - transforms covariance through the view matrix
  - projects to screen-space covariance through the perspective Jacobian
  - applies `preBlurAmount=0.3`, `focalAdjustment=2`, and
    `maxStdDev=sqrt(8)`
- Switched fragment output and WebGL blending to premultiplied alpha.
- Raised the Gaussian max pixel radius ceiling to `1024` to remove the previous
  visual clamp used during early tuning.
- Set full-density opacity scale to `0.18` for the new composite path.
- Added debug fields:
  - `projectionModel="jacobian-covariance"`
  - `composite="premultiplied-alpha"`
  - `sourceShDegree=3`
  - `renderShDegree=0`
  - `shading="sh0-dc-only"`
- Added QA assertions for the new projection/composite pipeline.

Validation:

- `npm.cmd run test:gaussian`: passed
- `npm.cmd run build`: passed
- `npm.cmd run qa:first-party-gaussian`: passed
- `npm.cmd run qa:first-party-local-source-smoke`: passed
- `npm.cmd run qa:first-party-full-scene-smoke`: passed
- `npm.cmd run qa:first-party-full-scene-visual`: assessment passed, gate remains blocked
- `npm.cmd run qa:first-party-full-scene-performance`: assessment passed, gate remains blocked
- `npm.cmd run qa:first-party-readiness`: assessment passed, `default_backend_ready=false`

Observed Round 4 source PLY smoke:

- rendered splats: `1,854,627`
- LOD: disabled
- sorting: `cpu-bucket-back-to-front`
- large-scene strategy: `full-density-bucket-depth-sort`
- projection/composite gate: passed
- visual QA: `Passed (222.8)` by contrast gate
- renderer load: `3,246ms`
- retained CPU buffer: `212.245MiB`
- GPU upload: `99.048MiB`
- load peak: `757.163MiB`
- average render time in smoke: `27.08ms`
- max render time in smoke: `135.2ms`

Remaining risk:

- The screenshots are more coherent than the source-order path, but still not
  visually close enough to Aholo.
- The next focused blocker is SH/color fidelity and GPU-friendly packing. The
  current renderer renders a degree-3 source as SH0-only.
- Default backend replacement remains blocked because the manifest default is
  still SOG/SPZ, not direct PLY, and the full-scene visual/performance gates are
  still non-passing.

## Repair Round 5

Status: asset coverage diagnostics and SH1 read/render path landed; visual
correctness still blocked.

Reason:

- User screenshots were taken on `asset=ply-preview`, which loads only `99,966`
  preview splats from a `1,855,266` splat source. This explains part of the
  perceived density loss.
- Round 4 still decoded no higher-order SH color. The source PLY is SH degree
  `3` with `45` `f_rest_*` fields.
- A first SH repair must respect the 3DGS PLY channel-major layout. The first
  SH1 RGB groups are not `f_rest_0..8`; for the current degree-3 source they are
  selected as `f_rest_0/15/30`, `f_rest_1/16/31`, and `f_rest_2/17/32`.

Changes:

- Added `shRestIndices` support to `decodeGaussianPly()` so renderer code can
  request explicit `f_rest_*` fields without reading the full SH3 payload.
- Added a parser regression fixture that verifies explicit SH rest index order
  and invalid SH index errors.
- Added a limited SH1 view-dependent color path to `ark-gaussian`:
  - source SH degree remains reported as `3`
  - render SH degree now reports `1`
  - render SH rest count reports `9`
  - debug shading reports `sh1-view-dependent`
- Added HUD/debug asset coverage fields:
  - `assetId`
  - `assetRole`
  - `sourceAssetId`
  - `declaredSplats`
  - `sourceSplats`
  - `coverageRatio`
- Added hard QA assertions that the first-party Gaussian path is using the SH1
  pipeline.

Validation:

- `npm.cmd run test:gaussian`: passed
- `npm.cmd run build`: passed
- `git diff --check`: no whitespace errors; Windows line-ending warnings only
- `npm.cmd run qa:first-party-gaussian`: passed
- `npm.cmd run qa:first-party-local-source-smoke`: passed
- `npm.cmd run qa:first-party-full-scene-smoke`: passed
- `npm.cmd run qa:first-party-full-scene-visual`: assessment passed, gate remains blocked
- `npm.cmd run qa:first-party-full-scene-performance`: assessment passed, gate remains blocked
- `npm.cmd run qa:first-party-readiness`: passed as an audit, `default_backend_ready=false`

Observed Round 5 source PLY smoke:

- rendered splats: `1,854,627`
- manifest source splats: `1,855,266`
- invalid skipped splats: `639`
- coverage: `99.97%`
- LOD: disabled
- sorting: `cpu-bucket-back-to-front`
- large-scene strategy: `full-density-bucket-depth-sort`
- shading: `sh1-view-dependent`
- source/render SH degree: `3 / 1`
- visual QA: `Passed (223.7)` by contrast gate
- renderer load: `3,117ms`
- retained CPU buffer: `339.592MiB`
- GPU upload: `162.721MiB`
- load peak: `948.184MiB`
- average render time in smoke: `36.92ms`
- max render time in smoke: `184.4ms`

Browser coverage verification:

- `asset=ply-preview`: `99,966 / 1,855,266 (5.39%)`
- `asset=source-ply`: `1,854,627 / 1,855,266 (99.97%)`

Manual visual confirmation:

- On 2026-06-04, the in-app browser was switched back to
  `asset=source-ply&renderer=ark-gaussian`.
- The HUD showed the full source path, `source-ply (source)`, and
  `1,854,627 / 1,855,266 (99.97%)` coverage.
- User visual review confirmed that this repair can display the scene normally.

Debug value for future renderer work:

- Always check HUD `Asset` and `Coverage` before judging visual density.
  `ply-preview` is a 100k diagnostic asset and should not be used as proof that
  the full PLY cannot be decoded.
- If a future render looks sparse, first confirm whether the page is on
  `preview-ply` (`5.39%`) or `source-ply` (`99.97%`).
- SH rest field order is a core format assumption. For 3DGS PLY, SH rest is
  channel-major; do not regress to treating `f_rest_0..8` as RGB-interleaved
  SH1.
- The next visual regressions should be debugged against source PLY coverage,
  SH degree reporting, sort mode, and projection/composite debug fields before
  changing opacity or density constants.

Remaining risk:

- SH1 produced only a small source smoke change (`222.8` to `223.7`), so the
  failure is not explained by point count or first-order SH alone.
- Full SH3 evaluation and GPU-friendly SH packing are still missing.
- Direct SOG/SPZ-to-ARK Gaussian buffer conversion is still missing, so the
  manifest default cannot move from Aholo to the first-party backend.
- The SH1 attribute-buffer prototype raises memory pressure. Full SH3 should
  not be implemented by adding all coefficients as per-instance attributes.
