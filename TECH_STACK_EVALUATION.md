# ARK-3DGS Technical Direction

Date: 2026-06-01

## Current Decision

The v0 runtime should be a Gaussian browser first.

The previous direction tried to move too quickly into physical proxies. That was premature because the first loaded scene did not yet pass a visual quality bar. ARK-3DGS now focuses on ingestion, parsing, preview, navigation, and diagnostics.

## Runtime Choice

- App: Vite + TypeScript.
- Browser core: `@manycore/aholo-viewer`.
- Supported preview formats: `.ply`, `.spz`, `.splat`, `.ksplat`, `.sog`, `.lcc`, `.esz`.
- Product shell: ARK-3DGS.

## Why This Is Closer To The Goal

The future spatial operating system needs to trust its scene substrate before adding physical logic.

The browser layer gives us:

- file-format coverage
- local preview without cloud dependency
- a repeatable visual QA process
- an investor-friendly first demo
- a foundation for future mesh, semantic, and physics sidecars

## Not In Current Stage

- collision
- furniture placement validation
- door clearance checks
- semantic segmentation
- physics constraints

Those remain important, but they restart only after the Gaussian scene is visually correct.

## Next Technical Questions

- Does the bundled PLY render correctly in ARK-3DGS?
- If not, does the same PLY render correctly in another trusted viewer?
- Is the quality issue from viewer compatibility, source scan quality, transform, opacity distribution, SH settings, or training output?
- Which compressed format should become the preferred runtime format for demos: SOG, SPZ, LCC, or another packed target?
