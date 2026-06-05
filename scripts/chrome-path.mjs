import { existsSync } from 'node:fs';
import { join } from 'node:path';

function existingPath(candidates) {
  return candidates.find((candidate) => candidate && existsSync(candidate));
}

function platformCandidates() {
  if (process.platform === 'win32') {
    return [
      process.env.CHROME_PATH,
      process.env.CHROME_BIN,
      process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
    ];
  }

  if (process.platform === 'darwin') {
    return [
      process.env.CHROME_PATH,
      process.env.CHROME_BIN,
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      process.env.HOME && join(process.env.HOME, 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'),
      '/Applications/Chromium.app/Contents/MacOS/Chromium'
    ];
  }

  return [
    process.env.CHROME_PATH,
    process.env.CHROME_BIN,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ];
}

export function resolveChromePath() {
  const chromePath = existingPath(platformCandidates());
  if (chromePath) return chromePath;

  throw new Error([
    'Unable to locate Chrome for CDP QA.',
    'Set CHROME_PATH to the Chrome executable path and rerun the script.',
    'macOS default: /Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'Windows default: C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  ].join(' '));
}
