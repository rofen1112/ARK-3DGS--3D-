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
- first-party WebGL point renderer diagnostic backend
- first-party CPU depth sorting for preview PLY
- first-party scale-aware point shader using decoded Gaussian scale and opacity
- first-party renderer preview QA harness
- PLY validator report for the bundled source asset
- tiny Gaussian PLY regression fixture
- invalid splat filtering policy in `ArkGaussianData`
- bundled SOG loading path
- local file picker for alternate Gaussian assets
- scene metadata panel
- free-browse navigation

Next:

- replace point rendering with real Gaussian projection shader
- add screen-space ellipse projection from Gaussian covariance
- add SPZ/SOG metadata adapters for the first-party data layer
- only after visual quality passes, restart mesh/physics/semantic work
