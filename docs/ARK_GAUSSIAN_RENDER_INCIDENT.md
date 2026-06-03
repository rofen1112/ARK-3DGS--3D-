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
