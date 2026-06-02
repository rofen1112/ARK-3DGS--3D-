import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const rootDir = dirname(fileURLToPath(import.meta.url));
const workerSource = resolve(rootDir, 'node_modules/@manycore/aholo-viewer/dist/splat-worker.js');
const workerTargets = [
  resolve(rootDir, 'public/vendor/aholo/splat-worker.js'),
  resolve(rootDir, 'node_modules/.vite/deps/splat-worker.js')
];

function ensureAholoWorker() {
  for (const target of workerTargets) {
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(workerSource, target);
  }
}

export default defineConfig({
  root: rootDir,
  resolve: {
    preserveSymlinks: true
  },
  plugins: [
    {
      name: 'ark-aholo-worker',
      configureServer(server) {
        ensureAholoWorker();
        server.middlewares.use('/node_modules/.vite/deps/splat-worker.js', (_req, res) => {
          res.setHeader('Content-Type', 'application/javascript');
          res.end(readFileSync(workerSource));
        });
      },
      buildStart() {
        ensureAholoWorker();
      }
    }
  ],
  server: {
    host: '0.0.0.0'
  }
});
