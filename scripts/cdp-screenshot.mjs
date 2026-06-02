import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const targetUrl = process.argv[2] ?? 'http://127.0.0.1:5173/';
const output = resolve(process.argv[3] ?? 'artifacts/cdp-screenshot.png');
const maxWaitMs = Number(process.argv[4] ?? 60000);
const port = Number(process.env.CDP_PORT ?? process.argv[5] ?? (9223 + Math.floor(Math.random() * 2000)));

await mkdir(dirname(output), { recursive: true });

const chrome = spawn(chromePath, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--ignore-gpu-blocklist',
  '--enable-webgl',
  '--use-angle=swiftshader',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${resolve(`.chrome-cdp-profile-${port}`)}`,
  '--window-size=1440,900',
  'about:blank'
], { stdio: ['ignore', 'pipe', 'pipe'] });

const chromeErrors = [];
chrome.stderr.on('data', (chunk) => chromeErrors.push(String(chunk)));

async function waitForJson(url, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch {
      // keep waiting
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  const pending = new Map();
  const events = [];
  let id = 1;

  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve: resolvePending, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolvePending(message.result);
      return;
    }
    events.push(message);
  });

  const ready = new Promise((resolveReady, reject) => {
    ws.addEventListener('open', resolveReady, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  function send(method, params = {}) {
    const messageId = id++;
    ws.send(JSON.stringify({ id: messageId, method, params }));
    return new Promise((resolvePending, reject) => {
      pending.set(messageId, { resolve: resolvePending, reject });
    });
  }

  return { ws, ready, send, events };
}

async function evaluatePageState(cdp) {
  const result = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const host = document.querySelector('#viewerHost');
      let debug = null;
      try {
        const raw = host?.getAttribute('data-ark-debug');
        debug = raw ? JSON.parse(raw) : null;
      } catch (error) {
        debug = { parseError: String(error) };
      }
      const c = document.querySelector('canvas');
      return {
        runtime: document.querySelector('#runtimeState')?.textContent ?? null,
        status: document.querySelector('#status')?.textContent ?? null,
        fitBounds: document.querySelector('#fitBoundsState')?.textContent ?? null,
        visualQuality: document.querySelector('#visualQualityState')?.textContent ?? null,
        canvas: c ? {
          width: c.width,
          height: c.height,
          clientWidth: c.clientWidth,
          clientHeight: c.clientHeight
        } : null,
        activeInfo: debug?.activeInfo ?? null,
        visualQualityGate: debug?.visualQualityGate ?? null,
        renderer: debug?.renderer ?? null,
        pipeline: debug?.pipeline ?? null,
        scene: debug?.scene ?? null,
        renderInfo: debug?.renderInfo ?? null
      };
    })()`,
    returnByValue: true
  });
  return result.result.value;
}

async function waitForVisualQuality(cdp, timeoutMs) {
  const started = Date.now();
  let pageState = null;
  while (Date.now() - started < timeoutMs) {
    pageState = await evaluatePageState(cdp);
    const gateStatus = pageState?.visualQualityGate?.status;
    if (pageState?.runtime === 'Loaded' && gateStatus && gateStatus !== 'pending') {
      return pageState;
    }
    if (pageState?.runtime === 'Error') {
      return pageState;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  return pageState ?? await evaluatePageState(cdp);
}

try {
  await waitForJson(`http://127.0.0.1:${port}/json/version`);
  const target = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(targetUrl)}`, {
    method: 'PUT'
  }).then((response) => response.json());

  const cdp = connect(target.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');

  const pageState = await waitForVisualQuality(cdp, maxWaitMs);

  const screenshot = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false
  });
  await writeFile(output, Buffer.from(screenshot.data, 'base64'));

  const relevantEvents = cdp.events
    .filter((event) => [
      'Runtime.consoleAPICalled',
      'Runtime.exceptionThrown',
      'Network.loadingFailed'
    ].includes(event.method))
    .slice(-20);

  console.log(JSON.stringify({
    output,
    maxWaitMs,
    pageState,
    events: relevantEvents,
    chromeErrors: chromeErrors.join('').slice(-4000)
  }, null, 2));

  const gateStatus = pageState?.visualQualityGate?.status;
  if (pageState?.runtime !== 'Loaded' || gateStatus !== 'passed') {
    process.exitCode = 1;
  }

  cdp.ws.close();
} finally {
  chrome.kill();
}
