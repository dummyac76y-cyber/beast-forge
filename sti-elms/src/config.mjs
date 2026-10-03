import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function loadEnvFile() {
  const path = join(ROOT, '.env');
  if (!existsSync(path)) return;
  for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile();

function num(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function resolveSessionSecret() {
  const fromEnv = process.env.SESSION_SECRET;
  if (fromEnv && fromEnv.length >= 16) return fromEnv;

  const secretPath = join(ROOT, '.session-secret');
  if (existsSync(secretPath)) {
    const existing = readFileSync(secretPath, 'utf8').trim();
    if (existing.length >= 16) return existing;
  }

  const generated = randomBytes(32).toString('base64url');
  writeFileSync(secretPath, `${generated}\n`, { mode: 0o600 });
  return generated;
}

export const config = {
  port: num('PORT', 4180),
  lmsBaseUrl: (process.env.LMS_BASE_URL || 'https://elms.sti.edu').replace(/\/+$/, ''),
  sessionSecret: resolveSessionSecret(),
  minIntervalMs: num('LMS_MIN_INTERVAL_MS', 1500),
  cacheTtlMs: num('LMS_CACHE_TTL_MS', 300_000),
  forceSecureCookie: process.env.FORCE_SECURE_COOKIE === '1',
  sessionCookieName: 'sess',
  sessionMaxAgeSec: 7 * 24 * 60 * 60,
  userAgent:
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  publicDir: join(ROOT, 'public'),
};

export function absoluteLmsUrl(pathname) {
  if (/^https?:\/\//i.test(pathname)) return pathname;
  return `${config.lmsBaseUrl}${pathname.startsWith('/') ? '' : '/'}${pathname}`;
}
