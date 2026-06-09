import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function parseEnvValue(rawValue) {
  const value = rawValue.trim();
  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function loadEnvFile(path) {
  if (!existsSync(path)) return [];
  const loaded = [];
  const content = readFileSync(path, 'utf8');

  for (const [index, rawLine] of content.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separator = line.indexOf('=');
    if (separator <= 0) {
      throw new Error(`Invalid env line in ${path}:${index + 1}`);
    }

    const key = line.slice(0, separator).trim();
    const value = parseEnvValue(line.slice(separator + 1));
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new Error(`Invalid env key "${key}" in ${path}:${index + 1}`);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
      loaded.push(key);
    }
  }

  return loaded;
}

export function loadLocalEnv(files = ['.env.local', '.env']) {
  const loaded = [];
  for (const file of files) {
    loaded.push(...loadEnvFile(resolve(file)));
  }
  return loaded;
}
