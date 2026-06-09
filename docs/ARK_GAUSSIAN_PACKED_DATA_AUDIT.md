# ARK Gaussian Packed Data Audit

Date: 2026-06-05

Status: architecture audit completed; implementation pending.

## Goal

Lock the next renderer target after the incident repair and parameter-debug
rounds. This audit compares Aholo's visible packed covariance/order texture
pipeline with ARK's current first-party attribute-buffer prototype.

The purpose is not to copy Aholo's bundled implementation. The purpose is to
identify the data contract ARK must own before replacing Aholo as the default
renderer.

## Aholo Visible Pipeline Contract

The local `@manycore/aholo-viewer` runtime exposes the relevant WebGL pipeline in
`node_modules/@manycore/aholo-viewer/dist/index.js` and its worker bundle.

The visible pass graph is:

| Stage | Visible Aholo Area | Contract |
| --- | --- | --- |
| Pack | `SplatPackMaterial` | Convert source splat fields into packed center and covariance textures. |
| Sort metric | `SplatSortMaterial` | Compute camera-dependent sort values from packed centers. |
| Worker sort | `splat-worker.js sortSplats` | Bucket-sort source indices into an order buffer. |
| Reorder / repack | `SplatReorderMaterial`, `SplatRepackMaterial` | Keep order indirection, or optionally rewrite packed textures into sorted order. |
| Draw | `SplattingMaterial` | Fetch order/packed data, reconstruct covariance, project to screen, shade, and composite. |

## Packed Covariance Texture Contract

Aholo does not pass all Gaussian state as large per-instance attribute sets in
the draw shader. Its visible packed path stores the render-critical data in
textures.

For each splat, the pack pass:

- stores the world-space center in a center texture.
- builds a rotation-scale matrix from decoded scale and quaternion.
- applies the model transform to that matrix.
- computes the 3D covariance as `rs * transpose(rs)`.
- stores the three covariance variances as `log2` values.
- stores the three off-diagonal terms as correlations.
- packs pairs into half-float lanes.
- packs color into the covariance texture when no separate color attachment is
  active.

The draw pass reverses that contract:

- fetches a sorted source index from `orderTex` unless the data has already been
  repacked into sorted order.
- fetches center and covariance texels by source index.
- reconstructs the covariance variances with `exp2`.
- reconstructs off-diagonal covariance terms from the correlations and variance
  products.
- projects the 3D covariance through the camera Jacobian before rasterizing the
  screen-space splat.

This is the critical architectural difference from ARK's current prototype.

## Sort And Order Contract

Aholo separates splat storage order from draw order.

The visible sort path computes a per-camera metric from packed centers, then the
worker bucket-sort writes an order buffer containing source splat indices. The
draw pass can either use that order texture directly or consume repacked sorted
textures.

Important differences from the current ARK path:

- Aholo's default visible sort metric is radial distance with a depth bias and a
  positive-depth guard.
- ARK's current large-scene path uses CPU bucket sorting over a camera-forward
  depth metric.
- Aholo keeps source packed data stable and changes order indirection.
- ARK currently physically reorders large attribute arrays and re-uploads them.

The same-camera isolation run already showed source-order and straight-alpha
diagnostics are not the main current visual delta. Even so, order textures remain
required for the production renderer because they are the bridge between direct
SOG/SPZ packed channels, worker/GPU sorting, and large-scene draw performance.

## Current ARK Contract

ARK currently owns the following first-party pieces:

| Area | Current ARK State |
| --- | --- |
| PLY decode | Implemented with invalid-position filtering and source index traceability. |
| Scale decode | Raw log scale decoded with `exp`. |
| Quaternion decode | GraphDECO-style `quaternion_wxyz` stored and normalized. |
| Covariance | Rebuilt in the vertex shader from scale and quaternion attributes. |
| Color | SH0 plus SH1 diagnostic path; source SH3 is not fully evaluated. |
| Sorting | CPU exact sort for preview, CPU bucket sort for source scenes up to 2M splats. |
| Data upload | Attribute-buffer prototype with sorted copies. |
| Runtime SOG/SPZ | Metadata and container probes only; no direct packed conversion yet. |

This path is valid as a proof renderer, but it is not the architecture needed to
replace Aholo for the full runtime scene.

## Confirmed Equivalences

These pieces are close enough to keep as implementation assumptions, but each
still needs a targeted parity test before default replacement:

- Rebuilding covariance from decoded scale and quaternion should be
  mathematically equivalent to unpacking a covariance texture when the same
  source conventions and model transform are used.
- Premultiplied-alpha output is still the correct default path.
- The current Jacobian covariance projection is the right class of projection;
  the remaining issue is contract parity, not a return to point rendering.
- Invalid splat filtering is expected: ARK draws `1,854,627` valid splats from
  `1,855,266` source rows because `639` source positions are invalid.

## Confirmed Gaps

The next implementation work should target these gaps in order:

1. ARK has no first-party packed covariance texture builder.
2. ARK has no order texture path; it reorders CPU attribute arrays.
3. ARK has no packed SH texture path and should not push all SH3 coefficients as
   per-instance attributes.
4. ARK has not proven scale/quaternion/covariance parity against a packed
   covariance round trip.
5. ARK has no direct SOG channel transcode into first-party Gaussian buffers.
6. ARK's sort metric is not yet contract-compatible with Aholo's radial/default
   sort path, although current isolation does not mark sorting as the main
   visual blocker.

## Next Implementation Target

The next safe target is a diagnostic packed-data layer, not another renderer
constant change.

Current implementation checkpoint:

- Added `src/sdk/gaussian/packedData.ts` as a CPU-only packed covariance audit
  module.
- Added `scripts/audit-packed-gaussian-data.mjs`.
- Added `npm.cmd run validate:packed-data`, which writes
  `public/scenes/demo_room_001/meta/packed_gaussian_data_audit_report.json`.
- Added `npm.cmd run validate:packed-data:source`, which writes
  `public/scenes/demo_room_001/meta/packed_gaussian_source_data_audit_report.json`
  when the ignored local source PLY exists.
- Added fixture regression coverage to `npm.cmd run test:gaussian`.

Current measured results:

| Command | Asset | Decoded Splats | Samples | Status | Max Abs Delta | Packed Bytes |
| --- | --- | ---: | ---: | --- | ---: | ---: |
| `validate:packed-data` | preview PLY | `99,966` | `512` | `passed` | `2.081743596465892e-7` | `5.72MiB` |
| `validate:packed-data:source` | source PLY | `1,854,627` | `2,048` | `passed` | `6.956697071160362e-7` | `106.123MiB` |

Current GPU texture diagnostic:

| Command | Asset | Texture Mode | Texture Size | Samples | Status | Center Delta | Covariance Delta | Order Delta | Color Delta | SH1 Delta |
| --- | --- | --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| `qa:first-party-data-texture` | preview PLY | `texture-audit` | `317 x 316` | `3` | `passed` | `0` | `9.151638451498911e-7` | `0` | `0` | `0` |
| `qa:first-party-texture-fetch` | preview PLY | `texture-fetch` | `317 x 316` | `3` | `passed` | `0` | `9.151638451498911e-7` | `0` | `0` | `0` |

Current texture-fetch A/B result:

| Command | Pair | Mean Abs RGB | RMS RGB | Max RGB | Similarity |
| --- | --- | ---: | ---: | ---: | ---: |
| `qa:first-party-texture-fetch-compare` | `ark-texture-fetch` vs `ark-gaussian` | `0` | `0` | `0` | `1` |

Current source-density capacity assessment:

| Command | Asset | Decoded Splats | Texture Count | Layout | Total Texture MiB | WebGL Max Texture | Vertex Texture Units | Status |
| --- | --- | ---: | ---: | --- | ---: | ---: | ---: | --- |
| `qa:first-party-texture-capacity` | source PLY | `1,854,627` | `8` | `1362 x 1362` | `226.446` | `8192` | `8+` | `passed` |

This is a capacity gate only. It does not upload full-source textures. The
estimated diagnostic load peak is `1174.63MiB` because the current diagnostic
path would add texture memory on top of the existing full-source attribute and
CPU buffers. Treat this as a medium memory-pressure result: it allows a guarded
diagnostic smoke, not a default renderer promotion.

Current renderer debug state:

- Default `ark-gaussian` still reports `dataPacking="attribute-buffer"`.
- Default covariance storage still reports
  `covarianceStorage="scale-rotation-attributes"`.
- Sorted preview rendering reports `orderAccess="cpu-reordered-attributes"`.
- Default color and SH storage still report `colorStorage="color-attribute"`
  and `shStorage="sh1-attributes"`.
- `qa:first-party-gaussian` now checks these fields so a future texture-fetch
  prototype must be explicit instead of silently replacing the data path.
- `qa:first-party-data-texture` verifies the dev-only
  `arkDiagData=texture-audit` path. This uploads center, covariance A,
  covariance B, order, color, and three SH1 textures and reads sample texels
  back from WebGL. It does not change the draw shader.
- `qa:first-party-texture-fetch` verifies the dev-only
  `arkDiagData=texture-fetch` draw path. This shader reads center/covariance
  from textures, source indices from the order texture, and color/SH1 from
  source-indexed textures.
- `qa:first-party-texture-fetch-compare` confirms the preview texture-fetch path
  is signature-identical to the default attribute-buffer path under the same
  camera.
- `qa:first-party-texture-capacity` estimates whether the full source PLY can
  fit the current texture-backed layout on the active WebGL2 device. It records
  max texture size, texture unit limits, total RGBA32F texture memory, and the
  previous full-source smoke peak memory.

Recommended sequence:

1. Keep expanding the `ArkGaussianPackedData` builder toward the same logical
   covariance layout: center, packed/log covariance, color, and source index
   order.
2. Use the CPU audit to compare direct covariance reconstruction against
   packed/unpacked covariance reconstruction before touching WebGL texture
   fetch.
3. Expose debug state fields such as `dataPacking`, `orderAccess`, and
   `covarianceStorage`. Completed for the current default attribute-buffer path.
4. Add a dev-only WebGL2 texture-fetch draw path behind a diagnostic URL flag.
   Completed for center/covariance/order/color/SH1 textures.
5. Keep the default `ark-gaussian` path unchanged until the packed diagnostic
   path passes preview and source same-camera checks.

Pass conditions for the next round:

- `npm.cmd run test:gaussian` still passes.
- `npm.cmd run validate:packed-data` reports `status="passed"`.
- `npm.cmd run validate:packed-data:source` reports `status="passed"` on this
  workstation when the ignored source PLY is present.
- `npm.cmd run qa:first-party-gaussian` still passes with default data packing.
- `npm.cmd run qa:first-party-data-texture` reports `status="passed"` while
  keeping `dataPacking="attribute-buffer"` for the draw path.
- `npm.cmd run qa:first-party-texture-fetch` reports `status="passed"` with
  `dataPacking="texture-fetch-hybrid"`.
- `npm.cmd run qa:first-party-texture-fetch-compare` reports zero signature
  delta against the default `ark-gaussian` preview path.
- `qa:first-party-data-texture` and `qa:first-party-texture-fetch` report
  `colorMaxAbsDelta=0`, `sh1MaxAbsDelta=0`, `colorStorage="color-texture"`,
  and `shStorage="sh1-texture"` when the texture-fetch draw path is active.
- `npm.cmd run qa:first-party-texture-capacity` reports
  `recommendation="capacity-ok-for-guarded-source-texture-diagnostic"` before
  any full-source texture upload is attempted.
- The packed covariance CPU audit reports finite reconstruction and bounded
  sample deltas.
- Default renderer debug state remains unchanged unless the diagnostic flag is
  enabled.

## Decision

The parameter-first repair phase is closed. The project should continue with
packed covariance/order data work because it is both a visual-parity risk and the
necessary architecture for direct SOG/SPZ runtime support.
