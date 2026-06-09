import { createWriteStream } from 'node:fs';
import { mkdir, rename, stat, unlink } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { loadLocalEnv } from './env-loader.mjs';

loadLocalEnv();

const repoId = process.env.ARK_HF_REPO;
const repoType = process.env.ARK_HF_REPO_TYPE ?? 'model';
const revision = process.env.ARK_HF_REVISION ?? 'main';
const token = process.env.HF_TOKEN ?? process.env.HUGGING_FACE_HUB_TOKEN;
const dryRun = process.argv.includes('--dry-run');
const force = process.argv.includes('--force');

const assets = [
  {
    label: 'demo source PLY',
    remotePath: process.env.ARK_HF_SOURCE_PLY_PATH ?? 'scenes/demo_room_001/gaussian/scene.ply',
    localPath: process.env.ARK_SOURCE_PLY_PATH ?? 'public/scenes/demo_room_001/gaussian/scene.ply'
  }
];

function requireRepoId() {
  if (repoId) return;
  throw new Error([
    'ARK_HF_REPO is required.',
    'Copy .env.example to .env.local, set ARK_HF_REPO, and rerun npm run assets:pull:hf.',
    'Example ARK_HF_REPO=rofenbb/ark-3dgs-renderer.'
  ].join(' '));
}

function repoPrefix(type) {
  if (type === 'model') return '';
  if (type === 'dataset') return 'datasets/';
  if (type === 'space') return 'spaces/';
  throw new Error(`Unsupported ARK_HF_REPO_TYPE "${type}". Use model, dataset, or space.`);
}

function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

function resolveUrl(remotePath) {
  return `https://huggingface.co/${repoPrefix(repoType)}${repoId}/resolve/${encodeURIComponent(revision)}/${encodePath(remotePath)}`;
}

async function fileSize(path) {
  try {
    return (await stat(path)).size;
  } catch {
    return null;
  }
}

async function downloadAsset(asset) {
  const localPath = resolve(asset.localPath);
  const relativeLocalPath = relative(process.cwd(), localPath).replaceAll('\\', '/');
  const existingSize = await fileSize(localPath);
  const url = resolveUrl(asset.remotePath);

  if (dryRun) {
    return {
      label: asset.label,
      remotePath: asset.remotePath,
      localPath: relativeLocalPath,
      url,
      wouldDownload: force || existingSize === null,
      existingSize
    };
  }

  if (existingSize !== null && !force) {
    return {
      label: asset.label,
      localPath: relativeLocalPath,
      skipped: true,
      reason: 'file exists; pass --force to overwrite',
      existingSize
    };
  }

  await mkdir(dirname(localPath), { recursive: true });

  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    redirect: 'follow'
  });

  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${asset.remotePath}: HTTP ${response.status} ${response.statusText}`);
  }

  const tempPath = `${localPath}.download`;
  await pipeline(Readable.fromWeb(response.body), createWriteStream(tempPath));

  if (force) {
    await unlink(localPath).catch(() => undefined);
  }
  await rename(tempPath, localPath);

  return {
    label: asset.label,
    remotePath: asset.remotePath,
    localPath: relativeLocalPath,
    downloaded: true,
    bytes: await fileSize(localPath)
  };
}

requireRepoId();

const results = [];
for (const asset of assets) {
  results.push(await downloadAsset(asset));
}

console.log(JSON.stringify({
  repoId,
  repoType,
  revision,
  dryRun,
  force,
  results
}, null, 2));
