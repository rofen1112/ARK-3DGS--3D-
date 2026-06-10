import { createWriteStream } from 'node:fs';
import { mkdir, rename, stat, unlink } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { loadLocalEnv } from './env-loader.mjs';

loadLocalEnv();

const defaultRepoId = 'rofenbb/ark-3dgs-renderer';
const defaultRepoType = 'model';
const defaultRevision = 'main';
const defaultSourcePlyRemotePath = 'scene.ply';
const defaultSourcePlyLocalPath = 'public/scenes/demo_room_001/gaussian/scene.ply';

const repoId = process.env.ARK_HF_REPO ?? defaultRepoId;
const repoType = process.env.ARK_HF_REPO_TYPE ?? defaultRepoType;
const revision = process.env.ARK_HF_REVISION ?? defaultRevision;
const token = process.env.HF_TOKEN ?? process.env.HUGGING_FACE_HUB_TOKEN;
const dryRun = process.argv.includes('--dry-run');
const force = process.argv.includes('--force');
const remoteCheck = process.argv.includes('--remote-check');

const assets = [
  {
    label: 'demo source PLY',
    remotePath: process.env.ARK_HF_SOURCE_PLY_PATH ?? defaultSourcePlyRemotePath,
    localPath: process.env.ARK_SOURCE_PLY_PATH ?? defaultSourcePlyLocalPath,
    url: process.env.ARK_HF_SOURCE_PLY_URL
  }
];

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

function resolveAssetUrl(asset) {
  return asset.url ?? resolveUrl(asset.remotePath);
}

async function fileSize(path) {
  try {
    return (await stat(path)).size;
  } catch {
    return null;
  }
}

async function checkRemoteAsset(asset, url) {
  const response = await fetch(url, {
    method: 'HEAD',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    redirect: 'follow'
  });

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    contentLength: response.headers.get('content-length'),
    contentType: response.headers.get('content-type'),
    etag: response.headers.get('etag')
  };
}

async function downloadAsset(asset) {
  const localPath = resolve(asset.localPath);
  const relativeLocalPath = relative(process.cwd(), localPath).replaceAll('\\', '/');
  const existingSize = await fileSize(localPath);
  const url = resolveAssetUrl(asset);
  const remote = remoteCheck ? await checkRemoteAsset(asset, url) : undefined;

  if (dryRun) {
    return {
      label: asset.label,
      remotePath: asset.remotePath,
      localPath: relativeLocalPath,
      url,
      remote,
      wouldDownload: force || existingSize === null,
      existingSize
    };
  }

  if (existingSize !== null && !force) {
    return {
      label: asset.label,
      remotePath: asset.remotePath,
      localPath: relativeLocalPath,
      url,
      remote,
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
    url,
    remote,
    downloaded: true,
    bytes: await fileSize(localPath)
  };
}

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
  remoteCheck,
  results
}, null, 2));
