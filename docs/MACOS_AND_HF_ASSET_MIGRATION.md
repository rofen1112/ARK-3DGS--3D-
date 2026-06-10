# macOS and Hugging Face Asset Migration

This project can be resumed from GitHub on macOS without committing local
high-resolution Gaussian assets. Code, manifests, runtime SOG/SPZ assets, and
the 100k preview PLY are tracked. Full source models stay outside Git.

## Clone on macOS

```bash
git clone https://github.com/rofen1112/ARK-3DGS--3D-.git
cd ARK-3DGS--3D-
git checkout ark-gaussian-render-incident
npm install
npm run dev -- --port 5173
```

Use `npm` on macOS/Linux. Use `npm.cmd` on Windows.

## Local-only assets

These paths are intentionally ignored by Git:

```text
3D-model/
public/scenes/demo_room_001/gaussian/scene.ply
```

The tracked assets below are enough for normal browser startup, preview
renderer work, and most QA:

```text
public/scenes/demo_room_001/gaussian/scene.sog
public/scenes/demo_room_001/gaussian/scene.spz
public/scenes/demo_room_001/gaussian/scene-preview-100k.ply
```

The ignored `scene.ply` is needed only for full source PLY diagnostics,
regeneration of derived assets, and full-density renderer validation.

## Chrome path for QA

CDP-based QA scripts resolve Chrome automatically on Windows, macOS, and Linux.
If Chrome is installed in a custom location, set `CHROME_PATH`.

macOS:

```bash
export CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

Windows PowerShell:

```powershell
$env:CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
```

## Hugging Face asset repository

Recommended setup:

- Keep code on GitHub.
- Keep large local Gaussian source assets in a private Hugging Face model repo.
- Pull assets into ignored local paths when a new machine needs full-source QA.

Install and authenticate the Hugging Face CLI:

```bash
python -m pip install -U "huggingface_hub[cli]"
hf auth login
```

Create a private asset repo:

```bash
hf repos create your-name/ark-3dgs-assets --private --exist-ok
```

Upload the full source PLY:

```bash
hf upload your-name/ark-3dgs-assets \
  public/scenes/demo_room_001/gaussian/scene.ply \
  scene.ply \
  --commit-message "Add demo source PLY"
```

Pull the source PLY from a new machine:

```bash
npm run assets:check:hf
npm run assets:pull:hf
```

Windows PowerShell:

```powershell
npm.cmd run assets:check:hf
npm.cmd run assets:pull:hf
```

The asset pull script defaults to the project asset repository:

```text
repo:   rofenbb/ark-3dgs-renderer
remote: scene.ply
local:  public/scenes/demo_room_001/gaussian/scene.ply
```

If the Hugging Face repository is private, copy `.env.example` to `.env.local`
and set only `HF_TOKEN` there. `.env.local` is ignored by Git and is loaded
automatically by the asset pull script.

By default, `npm run assets:check:hf` verifies the remote file without
downloading it, and `npm run assets:pull:hf` downloads:

```text
remote: scene.ply
local:  public/scenes/demo_room_001/gaussian/scene.ply
```

Optional overrides:

```bash
export ARK_HF_REPO_TYPE="model"
export ARK_HF_REVISION="main"
export ARK_HF_SOURCE_PLY_PATH="scene.ply"
export ARK_HF_SOURCE_PLY_URL="https://huggingface.co/rofenbb/ark-3dgs-renderer/resolve/main/scene.ply"
export ARK_SOURCE_PLY_PATH="public/scenes/demo_room_001/gaussian/scene.ply"
```

Use `--force` to overwrite an existing local file:

```bash
npm run assets:pull:hf -- --force
```

Run the staged secret scanner before Git sync:

```bash
npm run check:secrets
```

## Official Hugging Face references

- CLI guide: https://huggingface.co/docs/huggingface_hub/en/guides/cli
- Upload guide: https://huggingface.co/docs/huggingface_hub/en/guides/upload
- Download guide: https://huggingface.co/docs/huggingface_hub/en/guides/download
