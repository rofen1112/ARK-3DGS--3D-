# AGENTS.md

## Project Overview

ARK-3DGS is a local-first 3D Gaussian browser and early ARK Spatial SDK shell.
The current implementation loads Gaussian assets in the browser, reports scene
diagnostics, and keeps renderer calls behind the ARK backend contract in
`src/sdk/types.ts`.

## Repository Layout

- `src/`: browser app and SDK boundary code.
- `src/sdk/aholo/`: Aholo-backed renderer backend.
- `src/sdk/ark/`: first-party diagnostic point renderer.
- `src/sdk/gaussian/`: Gaussian PLY parser and typed data contracts.
- `scripts/`: validation, preview generation, CDP visual QA, and comparison tools.
- `docs/`: renderer plan and Gaussian data contract notes.
- `public/scenes/demo_room_001/`: tracked demo manifest, runtime SOG/SPZ assets,
  preview PLY, metadata reports, and collider data.
- `3D-model/`: local-only high-resolution Gaussian model files. Do not commit or
  push this directory.

## Local Assets And Git Scope

The GitHub backup intentionally excludes heavyweight local Gaussian source files:

- `3D-model/`
- `public/scenes/demo_room_001/gaussian/scene.ply`
- generated output and caches such as `dist/`, `artifacts/`, `.npm-cache/`,
  `.chrome-profile*/`, and `.chrome-cdp-profile*/`

The tracked runtime assets are enough to open the demo scene:

- `public/scenes/demo_room_001/gaussian/scene.sog`
- `public/scenes/demo_room_001/gaussian/scene.spz`
- `public/scenes/demo_room_001/gaussian/scene-preview-100k.ply`

Scripts that validate or regenerate source-PLY-derived data may need the ignored
local source PLY to exist on this machine.

## Commands

Use Windows-friendly npm commands in this workspace:

```bash
npm.cmd install --cache .\.npm-cache
npm.cmd run dev -- --port 5173
npm.cmd run build
npm.cmd run validate:manifest
npm.cmd run test:gaussian
```

Optional checks that need a running dev server:

```bash
npm.cmd run qa:visual
npm.cmd run qa:formats
npm.cmd run qa:baseline
npm.cmd run qa:independent
npm.cmd run qa:first-party
```

## Development Notes

- Keep renderer-facing behavior behind the ARK backend interface.
- Prefer focused changes in `src/sdk/*` and the matching validation scripts.
- Do not add new large Gaussian source files to Git. Keep local model experiments
  under `3D-model/` or another ignored path.
- Treat `.ply`, `.sog`, and `.spz` files as binary assets.
