# ARK Gaussian Parameter Debug Memo

Date: 2026-06-05

## Purpose

This memo records the renderer parameter debugging results after the
source-density repair. Use it before changing Gaussian renderer constants again.

The goal is to avoid repeating parameter tuning that has already been isolated
and measured under the same camera.

## Current Status

The incident repair phase is complete enough to close parameter-first debugging.

Confirmed:

- `source-ply` renders with `1,854,627 / 1,855,266 (99.97%)` coverage.
- ARK skips `639` invalid source positions; this explains the splat-count delta
  against Aholo.
- Default ARK first-party rendering is stable enough for continued core
  renderer work.
- Aholo must remain the default production backend until runtime format,
  performance, and full visual parity gates pass.

Not complete:

- Direct SOG/SPZ-to-ARK Gaussian buffer conversion.
- Packed covariance/order texture data access.
- Full SH3 evaluation in a GPU-friendly layout.
- Production worker/GPU sorting and streaming.

## Current ARK Default Constants

These are the active defaults for `ark-gaussian` unless a diagnostic URL
parameter is present:

| Constant | Current Default |
|---|---:|
| `preBlurAmount` | `0.3` |
| `blurAmount` | `0` |
| `focalAdjustment` | `2` |
| `maxStdDev` | `sqrt(8)` |
| `maxPixelAxis` | `1024` |
| preview opacity scale | `0.44` |
| full-source opacity scale | `0.18` |
| `alphaCutoff` | `0.003` |
| composite | `premultiplied-alpha` |

Do not change these defaults without a same-camera A/B report showing an
improvement against Aholo.

## Available Diagnostic Switches

These switches are intentionally dev-only URL parameters:

| Parameter | Values | Purpose |
|---|---|---|
| `arkDiagSort` | `source-order`, `exact-depth`, `bucket-depth` | Isolate sorting order from projection/composite behavior. |
| `arkDiagComposite` | `straight` | Test straight alpha against the default premultiplied path. |
| `arkDiagProjection` | `no-preblur`, `unit-focal`, `compact-kernel`, `aholo-material` | Isolate projection constant profiles. |

Default behavior remains unchanged when these parameters are absent.

## Same-Camera Baselines

Primary source baseline:

| Pair | Asset | Mean Abs RGB | RMS RGB | Similarity | Note |
|---|---|---:|---:|---:|---|
| ARK default vs Aholo SH0 | `source-ply` | `1.6336` | `7.5424` | `0.993594` | Current source baseline |
| ARK default vs Aholo SH0 | `preview-ply` | `0.9728` | `3.5066` | `0.996185` | Current preview baseline |

SH3 diagnostic:

| Pair | Asset | Mean Abs RGB | Similarity | Note |
|---|---|---:|---:|---|
| Aholo SH0 vs Aholo SH3 | `source-ply` | `0.1345` | `0.999473` | SH3 effect is small under this camera. |
| ARK SH1 vs Aholo SH3 | `source-ply` | `1.6483` | `0.993536` | SH3 reference does not reduce ARK delta. |

Decision: full SH3 is required later, but it is not the current primary visual
delta.

## Parameter Isolation Results

Preview exhaustive matrix:

| ARK Variant | Mean Abs RGB vs Aholo SH0 | Result |
|---|---:|---|
| default | `0.9728` | Baseline |
| `arkDiagSort=source-order` | `0.9758` | Slightly worse |
| `arkDiagComposite=straight` | `0.9728` | Identical to default |
| `arkDiagProjection=no-preblur` | `1.0002` | Worse |
| `arkDiagProjection=unit-focal` | `0.9985` | Worse |
| `arkDiagProjection=compact-kernel` | `1.0090` | Worse |
| `arkDiagProjection=aholo-material` | `1.3020` | Much worse |

Full-source core matrix:

| ARK Variant | Mean Abs RGB vs Aholo SH0 | Result |
|---|---:|---|
| default | `1.6336` | Baseline |
| `arkDiagSort=source-order` | `1.6602` | Worse |
| `arkDiagComposite=straight` | `1.6336` | Identical to default |
| `arkDiagProjection=aholo-material` | `1.7203` | Worse |

## Decisions

- Do not treat sparse-looking renders as density failures until HUD `Asset` and
  `Coverage` are checked.
- Do not keep tuning sort order as the main repair path. Source-order sorting is
  worse than the current default.
- Do not switch the blend function. Straight alpha is identical in the measured
  signatures and does not explain the visual gap.
- Do not migrate ARK defaults to Aholo `SplattingMaterial` defaults. The
  combined `aholo-material` profile is worse on preview and source.
- Do not add all SH3 coefficients as per-instance attributes. Use packed
  textures/order buffers or a controlled CPU diagnostic when full SH3 resumes.
- Do not tune opacity, density, or projection constants again unless a
  same-camera report beats the current default baseline.

## Required Checks Before Future Parameter Changes

For any preview-level renderer constant change:

```bash
npm.cmd run qa:first-party-gaussian
npm.cmd run qa:first-party-pipeline-isolation:preview
npm.cmd run build
```

For any full-source renderer constant change:

```bash
npm.cmd run qa:first-party-pipeline-isolation
npm.cmd run test:gaussian
npm.cmd run build
```

Interpretation rule:

- Compare the new result against the default same-camera `mean_abs_rgb`, not
  only against visual QA contrast.
- If the mean absolute RGB delta is not lower than baseline, do not promote the
  parameter change.
- If the change only improves preview but worsens source, do not promote it.

## Next Core Plan

Move from parameter tuning to renderer data-architecture parity:

1. Audit Aholo packed covariance texture semantics.
2. Audit Aholo order texture and repack/order-aware access.
3. Compare ARK's attribute-buffer covariance reconstruction with Aholo's packed
   covariance representation.
4. Design an ARK packed texture/order buffer prototype behind the renderer
   backend contract.
5. Use that prototype as the bridge toward SOG/SPZ runtime conversion and
   GPU-friendly SH data.

This is now the core path for continuing the first-party renderer plan.
