# ARK-3DGS Plan

## Goal

Build ARK-3DGS into the browser foundation for a future spatial operating system.

The immediate milestone is not physics. It is a reliable local browser that can ingest, parse, preview, and diagnose 3D Gaussian scenes.

## Phase 1: Gaussian Browser

Deliverables:

- Local web app named `ARK-3DGS`.
- Load a bundled Gaussian scene from a manifest.
- Open local Gaussian files from disk.
- Support common Gaussian preview formats: `.ply`, `.spz`, `.splat`, `.ksplat`, `.sog`, `.lcc`, `.esz`.
- Orbit, zoom, and keyboard navigation.
- Metadata panel: format, splat count, SH degree, dense bounds, display scale, source.
- Visual QA screenshots and pass/fail notes.

Investor message:

> We can open and inspect real Gaussian spatial data locally, independent of a vendor cloud viewer.

## Phase 2: Visual Quality Gate

Deliverables:

- Compare the same asset across ARK-3DGS and at least one trusted viewer.
- Decide whether bad output is caused by source data, format compatibility, transform, renderer, or training quality.
- Produce a simple quality report:
  - scene recognizable from three views
  - no dominant haze/floaters after reasonable filtering
  - stable centering and navigation
  - load time and browser memory notes

Investor message:

> We know whether a scan is actually usable before building higher-level spatial logic on top of it.

## Phase 3: Data Contract

Deliverables:

```text
public/scenes/<scene_id>/
  manifest.json
  gaussian/
    scene.<format>
  meta/
    quality_report.json
  previews/
    cover.jpg
```

Minimum manifest:

```json
{
  "id": "demo_room_001",
  "name": "Example Gaussian Scene",
  "gaussian": {
    "type": "ply",
    "url": "gaussian/scene.ply"
  },
  "scale": {
    "unit": "meter"
  }
}
```

## Phase 4: Mesh And Spatial Layers

Start only after Phase 1 and Phase 2 pass.

Deliverables:

- Optional mesh/point-cloud sidecar.
- Collision and occlusion proxy.
- Walkable area and object placement checks.
- Semantic objects: walls, floors, doors, windows, large furniture.

Investor message:

> A Gaussian scene becomes useful when it is paired with geometry, semantics, and constraints.

## Phase 5: Physical Spatial OS Direction

Long-term deliverables:

- versioned spatial datasets
- multi-scan updates
- semantic scene graph
- robot and human interaction constraints
- procurement/design/construction workflows
- API/SDK for agents and downstream apps

Core claim:

> 3DGS is a strong candidate for the photoreal spatial memory layer, but the future system is ARK-3DGS plus mesh, semantics, physics, and data governance.
