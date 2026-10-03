import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { config, absoluteLmsUrl } from './src/config.mjs';
import { open, seal } from './src/crypto.mjs';
import { LmsClient, LmsAuthError, LmsRateLimitError } from './src/lms-client.mjs';
import { parseDashboard } from './src/parse-dashboard.mjs';

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: https://elms.sti.edu",
  "connect-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
].join('; ');

const dashboardCache = new Map();
const loginAttempts = new Map();

function log(...parts) {
  console.log(`[${new Date().toISOString()}]`, ...parts);
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    out[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  return out;
}

function isSecureRequest(req) {
  return config.forceSecureCookie || req.headers['x-forwarded-proto'] === 'https';
}

function setSessionCookie(res, req, payload) {
  const token = seal(payload, config.sessionSecret);
  const parts = [
    `${config.sessionCookieName}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${config.sessionMaxAgeSec}`,
  ];
  if (isSecureRequest(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(res, req) {
  const parts = [
    `${config.sessionCookieName}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (isSecureRequest(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function readSession(req) {
  const raw = parseCookies(req.headers.cookie)[config.sessionCookieName];
  if (!raw) return null;
  const session = open(raw, config.sessionSecret);
  if (!session?.cookies) return null;
  if (Date.now() - (session.createdAt ?? 0) > config.sessionMaxAgeSec * 1000) return null;
  return session;
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': CSP,
  });
  res.end(payload);
}

function sendText(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': CSP,
  });
  res.end(body);
}

async function readJsonBody(req, limit = 20_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('Request body too large.');
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('Invalid JSON body.');
  }
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function clientKey(req) {
  return req.socket.remoteAddress ?? 'unknown';
}

function loginBlocked(key) {
  const record = loginAttempts.get(key);
  if (!record) return false;
  if (Date.now() - record.first > 15 * 60 * 1000) {
    loginAttempts.delete(key);
    return false;
  }
  return record.count >= 10;
}

function recordLoginFailure(key) {
  const record = loginAttempts.get(key);
  if (!record || Date.now() - record.first > 15 * 60 * 1000) {
    loginAttempts.set(key, { count: 1, first: Date.now() });
  } else {
    record.count += 1;
  }
}

function cacheKeyFor(session) {
  return createHash('sha256').update(JSON.stringify(session.cookies)).digest('hex');
}

async function serveStatic(res, pathname) {
  const name = pathname === '/' ? 'index.html' : pathname.slice(1);
  const target = join(config.publicDir, normalize(name));
  if (!target.startsWith(config.publicDir + sep)) {
    sendText(res, 403, 'Forbidden');
    return;
  }
  try {
    const body = await readFile(target);
    res.writeHead(200, {
      'Content-Type': CONTENT_TYPES[extname(target)] ?? 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': CSP,
    });
    res.end(body);
  } catch {
    sendText(res, 404, 'Not found');
  }
}

async function handleLogin(req, res) {
  if (!sameOrigin(req)) {
    sendJson(res, 403, { error: 'Cross-origin request rejected.' });
    return;
  }

  const key = clientKey(req);
  if (loginBlocked(key)) {
    sendJson(res, 429, {
      error: 'Too many login attempts from this machine. Wait 15 minutes and try again.',
    });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, 400, { error: error.message });
    return;
  }

  const userid = String(body.userid ?? '').trim();
  const password = String(body.password ?? '');
  if (!userid || !password) {
    sendJson(res, 400, { error: 'Enter both your eLMS userid and password.' });
    return;
  }

  const client = new LmsClient();
  try {
    const result = await client.login(userid, password);
    loginAttempts.delete(key);
    setSessionCookie(res, req, {
      cookies: result.cookies,
      createdAt: Date.now(),
      userid,
    });
    log(`login ok for ${userid}`);
    sendJson(res, 200, { ok: true, userid });
  } catch (error) {
    if (error instanceof LmsRateLimitError) {
      log('login blocked by LMS rate limit');
      sendJson(res, 429, {
        error: 'The eLMS is rate limiting this app right now. Wait a minute, then retry.',
        retryAfterSec: error.retryAfterSec,
      });
      return;
    }
    recordLoginFailure(key);
    const message =
      error instanceof LmsAuthError ? error.message : 'Could not reach the eLMS. Try again shortly.';
    log(`login failed for ${userid}: ${message}`);
    sendJson(res, 401, { error: message });
  }
}

async function handleDashboard(req, res, url) {
  const session = readSession(req);
  if (!session) {
    sendJson(res, 401, { error: 'Not signed in.', code: 'no_session' });
    return;
  }

  const target = url.searchParams.get('path') || '/user_dashboard';
  const forceRefresh = url.searchParams.get('refresh') === '1';
  const key = `${cacheKeyFor(session)}::${target}`;

  if (!forceRefresh) {
    const cached = dashboardCache.get(key);
    if (cached && Date.now() - cached.at < config.cacheTtlMs) {
      sendJson(res, 200, { ...cached.data, cached: true, cachedAt: new Date(cached.at).toISOString() });
      return;
    }
  }

  const client = new LmsClient(session.cookies);
  try {
    const page = await client.fetchPage(target);
    if (page.expired) {
      clearSessionCookie(res, req);
      dashboardCache.delete(key);
      sendJson(res, 401, { error: 'Your eLMS session expired. Sign in again.', code: 'expired' });
      return;
    }
    const data = parseDashboard(page.html, absoluteLmsUrl(page.url));
    data.sourcePath = page.path;
    dashboardCache.set(key, { at: Date.now(), data });
    sendJson(res, 200, { ...data, cached: false });
  } catch (error) {
    if (error instanceof LmsRateLimitError) {
      sendJson(res, 429, {
        error: 'The eLMS is rate limiting this app. Wait a minute before refreshing.',
        retryAfterSec: error.retryAfterSec,
      });
      return;
    }
    log(`dashboard fetch failed: ${error.message}`);
    sendJson(res, 502, { error: `Could not read that page: ${error.message}` });
  }
}

async function handleRaw(req, res, url) {
  const session = readSession(req);
  if (!session) {
    sendJson(res, 401, { error: 'Not signed in.', code: 'no_session' });
    return;
  }
  const target = url.searchParams.get('path') || '/user_dashboard';
  const client = new LmsClient(session.cookies);
  try {
    const page = await client.fetchPage(target);
    sendJson(res, 200, {
      path: page.path,
      url: page.url,
      status: page.status,
      expired: page.expired,
      truncated: page.html.length > 400_000,
      html: page.html.slice(0, 400_000),
    });
  } catch (error) {
    const status = error instanceof LmsRateLimitError ? 429 : 502;
    sendJson(res, status, { error: error.message, retryAfterSec: error.retryAfterSec ?? null });
  }
}

async function handleLogout(req, res) {
  if (!sameOrigin(req)) {
    sendJson(res, 403, { error: 'Cross-origin request rejected.' });
    return;
  }
  const session = readSession(req);
  if (session) {
    try {
      await new LmsClient(session.cookies).logout();
    } catch {
      // The local session is dropped regardless.
    }
  }
  clearSessionCookie(res, req);
  dashboardCache.clear();
  sendJson(res, 200, { ok: true });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);

  try {
    if (req.method === 'GET' && url.pathname === '/healthz') {
      sendJson(res, 200, { ok: true, lms: config.lmsBaseUrl });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/session') {
      const session = readSession(req);
      sendJson(res, 200, {
        authenticated: Boolean(session),
        userid: session?.userid ?? null,
        minIntervalMs: config.minIntervalMs,
        cacheTtlMs: config.cacheTtlMs,
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/login') {
      await handleLogin(req, res);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/logout') {
      await handleLogout(req, res);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/dashboard') {
      await handleDashboard(req, res, url);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/raw') {
      await handleRaw(req, res, url);
      return;
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      await serveStatic(res, url.pathname);
      return;
    }

    sendJson(res, 405, { error: 'Method not allowed.' });
  } catch (error) {
    log(`unhandled error on ${url.pathname}: ${error.stack ?? error.message}`);
    if (!res.headersSent) sendJson(res, 500, { error: 'Internal error.' });
  }
});

server.listen(config.port, () => {
  log(`sti-elms dashboard on http://localhost:${config.port}`);
  log(`upstream ${config.lmsBaseUrl}, min interval ${config.minIntervalMs}ms, cache ${config.cacheTtlMs}ms`);
  if (config.forceSecureCookie) log('session cookie marked Secure');
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    log(`received ${signal}, shutting down`);
    server.close(() => process.exit(0));
  });
}
