# ARK-3DGS

ARK-3DGS is a local-first 3D Gaussian browser and the first shell of the future ARK Spatial SDK. The current goal is deliberately narrow:

- load and identify common Gaussian formats
- preview and freely browse a real Gaussian asset locally
- report basic scene diagnostics
- create the browser foundation before any physics, mesh, or semantic layer work
- isolate renderer calls behind an ARK backend interface

This stage is about proving that the first visual scene is correct enough to inspect.

## Run

```bash
npm.cmd install --cache .\.npm-cache
npm.cmd run dev -- --port 5173
```

Open the browser shell:

```text
http://127.0.0.1:5173/
```

Auto-load the bundled SOG scene:

```text
http://127.0.0.1:5173/?autoload=1
```

## Repository Backup Scope

The GitHub backup intentionally excludes local-only heavy Gaussian source files.
The `3D-model/` directory is for local experiments and is not required to run the
browser demo. The full source PLY at
`public/scenes/demo_room_001/gaussian/scene.ply` is also ignored because it is a
large diagnostic/source asset.

Tracked runtime assets are enough to open and inspect the demo scene:

- `public/scenes/demo_room_001/gaussian/scene.sog`
- `public/scenes/demo_room_001/gaussian/scene.spz`
- `public/scenes/demo_room_001/gaussian/scene-preview-100k.ply`

Scripts that validate or regenerate data derived from the full source PLY may
need the ignored local PLY files to be present on the development machine.

## Browser Controls

- Drag: free-look around the current camera position
- Wheel: move forward / backward along the current view direction
- `WASD`: move through the scene
- `Q` / `E`: move down / up
- `Shift`: faster movement
- `Open Local Model`: load another Gaussian file from disk
- `Reset View`: refit the camera around the current scene

## SDK Boundary

The browser shell now calls ARK's own renderer backend contract instead of importing the third-party renderer directly.

Current backend:

```text
src/sdk/aholo/AholoRendererBackend.ts
```

First-party diagnostic backend:

```text
src/sdk/ark/ArkPointRendererBackend.ts
```

First-party Gaussian backend:

```text
src/sdk/ark/ArkGaussianRendererBackend.ts
```

Stable SDK contract:

```text
src/sdk/types.ts
```

Long-term target:

```text
ARK-3DGS Spatial SDK, with first-party Gaussian renderer and spatial OS data layer.
```

Renderer plan:

```text
docs/FIRST_PARTY_RENDERER_PLAN.md
```

First-party Gaussian data contract:

```text
docs/GAUSSIAN_DATA_CONTRACT.md
```

Validate the current source PLY:

```bash
npm.cmd run validate:ply
```

Validate the scene manifest asset contract:

```bash
npm.cmd run validate:manifest
```

Generate the deterministic PLY preview used by independent renderer QA:

```bash
npm.cmd run prepare:ply-preview
```

Run the Gaussian parser regression test:

```bash
npm.cmd run test:gaussian
```

Validate first-party runtime Gaussian metadata adapters:

```bash
npm.cmd run validate:runtime-metadata
```

Validate first-party runtime Gaussian format probes:

```bash
npm.cmd run validate:runtime-formats
```

Validate first-party renderable asset resolution:

```bash
npm.cmd run validate:renderable-assets
```

Validate first-party full-scene measurement candidate resolution:

```bash
npm.cmd run validate:full-scene-candidate
```

Run the browser visual QA gate against a running dev server:

```bash
npm.cmd run qa:visual
```

Run the bundled format QA matrix against a running dev server:

```bash
npm.cmd run qa:formats
```

Run ARK against the direct Aholo baseline harness:

```bash
npm.cmd run qa:baseline
```

Run ARK against the independent GaussianSplats3D preview baseline:

```bash
npm.cmd run qa:independent
```

Run the first-party diagnostic renderer preview QA:

```bash
npm.cmd run qa:first-party
```

Run the first-party Gaussian ellipse renderer preview QA:

```bash
npm.cmd run qa:first-party-gaussian
```

Run the first-party Gaussian renderer comparison QA:

```bash
npm.cmd run qa:first-party-compare
```

Run the first-party Gaussian camera-edge and near-plane stress QA:

```bash
npm.cmd run qa:first-party-stress
```

Run the degraded first-party full-scene source PLY smoke QA:

```bash
npm.cmd run qa:first-party-full-scene-smoke
```

Assess first-party full-scene visual readiness:

```bash
npm.cmd run qa:first-party-full-scene-visual
```

Assess first-party full-scene performance readiness:

```bash
npm.cmd run qa:first-party-full-scene-performance
```

Assess whether the first-party renderer is ready to become the default backend:

```bash
npm.cmd run qa:first-party-readiness
```

## Supported Formats

The first browser core is wired for:

- `.ply`
- `.spz`
- `.splat`
- `.ksplat`
- `.sog`
- `.lcc`
- `.esz`
- `.zip` / `.json` when they describe supported packed formats

## Bundled Scene

Default manifest:

```text
public/scenes/demo_room_001/manifest.json
```

Default Gaussian:

```text
public/scenes/demo_room_001/gaussian/scene.sog
```

Bundled scene assets:

- Manifest asset set: `gaussians.items`
- Runtime default: `scene.sog`
- Local import test: `scene.spz`
- Source / heavy diagnostic asset: `scene.ply`
- Deterministic third-party QA preview: `scene-preview-100k.ply`
- Splats: `1,855,266`
- Preview splats: `99,966`

Current bundled format matrix:

| Format | Runtime | Visual QA | Fit Bounds |
|---|---|---|---|
| SOG | Passed | `Passed (114.3)` | `broad_01_99 (sidecar)` |
| SPZ | Passed | `Passed (116.1)` | `broad_01_99 (sidecar)` |
| PLY | Passed | `Passed (101.9)` | `broad_01_99 (sidecar)` |

Current ARK vs Aholo direct baseline:

| Format | Result | ARK Fit Bounds | Baseline Fit Bounds | Bounds Delta |
|---|---|---|---|---:|
| SOG | Passed | `broad_01_99 (sidecar)` | `sog_meta_dense (renderer)` | `7.231167` |
| SPZ | Passed | `broad_01_99 (sidecar)` | `aholo_dense_98 (renderer)` | `1.836224` |
| PLY | Passed | `broad_01_99 (sidecar)` | `aholo_dense_98 (renderer)` | `2.218992` |

The baseline page is a dev-only comparison harness:

```text
http://127.0.0.1:5173/baseline.html?asset=sog
```

Current ARK vs independent GaussianSplats3D baseline:

| Asset | Result | ARK Visual QA | Independent Visual QA | Splat Delta |
|---|---|---|---|---:|
| PLY preview | Passed | `Passed (128.9)` | `Passed (162.7)` | `0` |

The independent baseline page is also dev-only:

```text
http://127.0.0.1:5173/kellogg-baseline.html?asset=ply-preview
```

The full 460MB PLY remains covered by ARK's own format matrix and Aholo baseline. The independent Three.js renderer timed out on the full PLY under headless SwiftShader, so its compatibility check uses a deterministic same-schema preview generated from the full source PLY.

Current first-party diagnostic renderer result:

| Renderer | Asset | Result | Visual QA | Shader | Sorting | Splats |
|---|---|---|---|---|---|---:|
| `ark-point-webgl2` | PLY preview | Passed | `Passed (216.0)` | `sh0-scale-aware-point-cloud` | `cpu-back-to-front` | `99,966` |

Open the first-party preview renderer:

```text
http://127.0.0.1:5173/?autoload=1&asset=ply-preview&renderer=ark-point
```

Current first-party Gaussian renderer entry:

```text
http://127.0.0.1:5173/?autoload=1&asset=ply-preview&renderer=ark-gaussian
```

Current first-party Gaussian renderer result:

| Renderer | Asset | Result | Visual QA | Shader | Sorting | Projection | Clipping | Splats |
|---|---|---|---|---|---|---|---|---:|
| `ark-gaussian-webgl2` | PLY preview | Passed | `Passed (216)` | `sh0-instanced-ellipse-gaussian` | `cpu-back-to-front` | `gaussianProjection=true` | `near/far + offscreen center` | `99,966` |

Current first-party Gaussian comparison result:

| Pair | Data | Signature | Mean Abs RGB | Similarity |
|---|---|---|---:|---:|
| `ark-gaussian` vs `aholo-adapter` | Passed | Available | `0.9884` | `0.996124` |
| `ark-gaussian` vs `kellogg-independent` | Passed | Not available from Kellogg canvas | - | - |

The Kellogg baseline still visibly renders and matches splat count. Its WebGL canvas signature is not used as a hard metric because direct canvas downsampling returned near-zero contrast under headless capture.

Current first-party Gaussian stress result:

| Case | Result | Sample Contrast | Signature Contrast | Splats |
|---|---|---:|---:|---:|
| `default-fit` | Passed | `216` | `196` | `99,966` |
| `edge-right` | Passed | `1.78` | `198` | `99,966` |
| `near-plane-close` | Passed | `484.11` | `203` | `99,966` |
| `near-plane-offset` | Passed | `459.67` | `235` | `99,966` |

Current first-party full-scene visual gate result:

| Assessment | Visual Gate | Status | Default Asset | Measurement Candidate | Default Runtime? | Preview First-Party Visual QA |
|---|---|---|---|---|---|---|
| Passed | No | `blocked-before-measurement` | `runtime-sog` | `source-ply` | No | `Passed (216)` |

Current first-party full-scene performance budget result:

| Assessment | Performance Gate | Status | Default Asset | Measurement Candidate | Splats | CPU Sort Limit | Ratio |
|---|---|---|---|---|---:|---:|---:|
| Passed | No | `blocked-before-measurement` | `runtime-sog` | `source-ply` | `1,855,266` | `400,000` | `4.638x` |

Current first-party default readiness result:

| Preview Path | Runtime Format Probe | Default Backend Ready | Keep Aholo Default | Blockers |
|---|---|---|---|---:|
| Passed | Passed | No | Yes | `4` |

Current blockers before switching the default backend:

- default runtime asset is `runtime-sog`, while first-party `ark-gaussian` currently supports direct PLY loading only
- default runtime asset has `1,855,266` splats, above the current first-party CPU sorting limit of `400,000`
- first-party full-scene visual assessment exists, but the gate is still blocked before measurement because the default SOG path is not directly first-party renderable
- first-party full-scene performance budget assessment exists, but the gate is still blocked before measurement because the default SOG path is not directly first-party renderable and no worker/GPU/streaming strategy is implemented yet

Current runtime Gaussian metadata adapter result:

| Runtime Asset | Format | Metadata | Direct First-Party Render | Splats | Size |
|---|---|---|---|---:|---:|
| `runtime-sog` | SOG | Ready | No | `1,855,266` | `22,887,509` |
| `runtime-spz` | SPZ | Ready | No | `1,855,266` | `35,364,142` |

Current runtime Gaussian format probe result:

| Runtime Asset | Container | Probe | Layout | Direct Decode | Bytes / Splat | Source Ratio | Notes |
|---|---|---|---|---|---:|---:|---|
| `runtime-sog` | `sog-zip-webp` | Passed | `meta.json` ready | No | `12.337` | `0.049744` | `7` WEBP channel files |
| `runtime-spz` | `spz-gzip` | Passed | Pending | No | `19.061` | `0.076861` | GZIP container identified |

Current SOG layout summary:

| Channel | Files | Contract Notes |
|---|---|---|
| `means` | `means_l.webp`, `means_u.webp` | meta includes mins/maxs |
| `scales` | `scales.webp` | meta includes codebook |
| `quats` | `quats.webp` | quaternion channel |
| `sh0` | `sh0.webp` | meta includes SH0 codebook |
| `shN` | `shN_centroids.webp`, `shN_labels.webp` | `bands=3`, `count=65,536` |

Current first-party renderable asset resolver result:

| Requested | Renderable | Mode | Direct | Degraded |
|---|---|---|---|---|
| `runtime-sog` | `preview-ply` | `preview-substitute` | No | Yes |
| `runtime-spz` | `preview-ply` | `preview-substitute` | No | Yes |
| `preview-ply` | `preview-ply` | `direct` | Yes | No |
| `source-ply` | `source-ply` | `direct` | Yes | No |

Current first-party full-scene measurement candidate result:

| Requested | Candidate | Mode | First-Party Loadable | Default Runtime Direct? | Splat Equivalent |
|---|---|---|---|---|---|
| `runtime-sog` | `source-ply` | `source-ply-substitute` | Yes | No | Yes |
| `runtime-spz` | `source-ply` | `source-ply-substitute` | Yes | No | Yes |
| `source-ply` | `source-ply` | `direct-default` | Yes | Yes | Yes |

Current first-party source PLY full-scene smoke result:

| Asset | Result | Renderer | Decoded Splats | Rendered Splats | Invalid Skipped | Sorting | LOD | Visual QA | Settle Frames | Duration |
|---|---|---|---:|---:|---:|---|---|---|---:|---:|
| `source-ply` | Passed | `ark-gaussian-webgl2` | `1,854,627` | `300,000` | `639` | `cpu-back-to-front` | `deterministic-stride-budget` | `Passed (252.4)` | `1` | `15.951s` |

Current first-party source PLY timing breakdown:

| Read | Decode | Pack | Upload | Renderer Load | Visual Gate | Load Peak |
|---:|---:|---:|---:|---:|---:|---:|
| `888.7ms` | `1,109.4ms` | `40.9ms` | `5.5ms` | `2,046ms` | `10,758ms` | `579.25MiB` |

This smoke test proves the first-party renderer can decode the full source PLY and draw a deterministic `300,000` splat LOD as a degraded measurement candidate. It does not prove that the default `runtime-sog` path is first-party renderable, and it is not production-performant yet. The large-scene path reduced smoke duration from `223.251s` to `80.971s` with adaptive QA, then to `15.951s` with budgeted LOD.

## Current Stage

Done:

- ARK-3DGS product shell
- local Vite/TypeScript browser runtime
- ARK renderer backend interface
- Aholo backend adapter
- first-party Gaussian PLY data contract
- dense percentile bounds in the Gaussian data report
- bundled scene camera fit from `broad_01_99` sidecar bounds
- browser visual QA gate with canvas, sidecar, and pixel-sample checks
- bundled SOG/SPZ/PLY format QA matrix
- ARK vs direct Aholo baseline comparison harness
- deterministic PLY preview generation for independent renderer QA
- ARK vs independent GaussianSplats3D preview comparison harness
- manifest-level Gaussian asset set and manifest validator
- first-party runtime Gaussian metadata adapters for SOG/SPZ
- first-party runtime Gaussian format probes for SOG/SPZ containers
- first-party renderable asset resolver with preview PLY substitute mode
- first-party full-scene measurement candidate resolver with source PLY substitute mode
- first-party WebGL point renderer diagnostic backend
- first-party CPU depth sorting for preview PLY
- first-party scale-aware point shader using decoded Gaussian scale and opacity
- first-party renderer preview QA harness
- first-party WebGL2 instanced ellipse Gaussian backend
- first-party Gaussian renderer QA gate requiring `gaussianProjection=true`
- first-party Gaussian comparison QA against Aholo and Kellogg preview baselines
- first-party Gaussian clipping hard gate in renderer and comparison QA
- first-party Gaussian camera-edge and near-plane stress QA
- first-party default backend readiness assessment with explicit blockers
- first-party Gaussian opacity tuning with `opacityScale=0.44` to reduce peak contrast against Aholo
- first-party Gaussian ellipse tuning with `ellipseExtent=2.05` and `maxPixelAxis=10`
- first-party Gaussian near/far and offscreen center clipping with `minClipW=0.02` and `offscreenPadding=1.4`
- first-party full-scene visual assessment with explicit non-passing gate state
- first-party full-scene performance budget assessment with explicit non-passing gate state
- first-party degraded full-scene source PLY smoke QA
- adaptive large-scene visual QA settle policy for full-source PLY smoke runs
- deterministic stride LOD for degraded full-source PLY smoke runs
- PLY validator report for the bundled source asset
- tiny Gaussian PLY regression fixture
- invalid splat filtering policy in `ArkGaussianData`
- bundled SOG loading path
- local file picker for alternate Gaussian assets
- scene metadata panel
- free-browse navigation

Next:

- harden the covariance projection math, alpha compositing, and performance
- implement SOG-to-ARK Gaussian buffer transcode from the probed SOG layout; SPZ remains a GZIP container probe until its payload layout is decoded
- replace degraded stride LOD with a production large-scene strategy: direct SOG/SPZ loading, worker/GPU sorting, chunk streaming, or view-dependent LOD with quality comparison
- turn the full-scene visual assessment into a measured first-party default-runtime visual gate
- turn the full-scene performance budget assessment into a measured gate after direct runtime loading and large-scene sorting/streaming exist
- only after visual quality passes, restart mesh/physics/semantic work
