import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { spawnSync } from 'node:child_process';

const scanAll = process.argv.includes('--all');

const secretPatterns = [
  { id: 'huggingface-token', pattern: /\bhf_[A-Za-z0-9]{20,}\b/ },
  { id: 'openai-key', pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { id: 'github-token', pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/ },
  { id: 'github-fine-grained-token', pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/ },
  { id: 'aws-access-key', pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/ },
  { id: 'private-key-block', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ }
];

const ignoredExtensions = new Set([
  '.ply',
  '.sog',
  '.spz',
  '.splat',
  '.ksplat',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.zip',
  '.bin'
]);

function runGit(args) {
  const result = spawnSync('git', args, {
    cwd: process.cwd(),
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `git ${args.join(' ')} failed`).trim());
  }
  return result.stdout;
}

function addFinding(findings, source, lineNumber, line, patternId) {
  findings.push({
    source,
    lineNumber,
    patternId,
    preview: line.replace(/([A-Za-z0-9_-]{4})[A-Za-z0-9_-]{8,}/g, '$1...')
  });
}

function scanLine(findings, source, lineNumber, line) {
  for (const { id, pattern } of secretPatterns) {
    if (pattern.test(line)) {
      addFinding(findings, source, lineNumber, line, id);
    }
  }
}

function stagedDiffFindings() {
  const diff = runGit(['diff', '--cached', '--unified=0', '--', '.']);
  const findings = [];
  let currentFile = null;
  let currentLine = 0;

  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith('+++ b/')) {
      currentFile = line.slice('+++ b/'.length);
      currentLine = 0;
      continue;
    }

    if (line.startsWith('@@')) {
      const match = /\+(\d+)/.exec(line);
      currentLine = match ? Number(match[1]) : 0;
      continue;
    }

    if (!currentFile || currentFile === '/dev/null') continue;
    if (line.startsWith('+') && !line.startsWith('+++')) {
      scanLine(findings, currentFile, currentLine || null, line.slice(1));
      currentLine += 1;
    } else if (!line.startsWith('-')) {
      currentLine += 1;
    }
  }

  return findings;
}

function trackedFileFindings() {
  const files = runGit(['ls-files'])
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((file) => !ignoredExtensions.has(extname(file).toLowerCase()));

  const findings = [];
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    for (const [index, line] of content.split(/\r?\n/).entries()) {
      scanLine(findings, file, index + 1, line);
    }
  }
  return findings;
}

const findings = scanAll ? trackedFileFindings() : stagedDiffFindings();

if (findings.length > 0) {
  console.error(JSON.stringify({
    status: 'failed',
    mode: scanAll ? 'tracked-files' : 'staged-diff',
    message: 'Potential secrets detected. Remove them before committing or pushing.',
    findings
  }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'passed',
  mode: scanAll ? 'tracked-files' : 'staged-diff',
  scanned: true
}, null, 2));
