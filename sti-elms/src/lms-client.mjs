import { setTimeout as sleep } from 'node:timers/promises';
import { config, absoluteLmsUrl } from './config.mjs';
import { CookieJar } from './cookie-jar.mjs';

export class LmsRateLimitError extends Error {
  constructor(retryAfterSec) {
    super('The STI eLMS is rate limiting this app. Try again in a minute.');
    this.name = 'LmsRateLimitError';
    this.retryAfterSec = retryAfterSec ?? null;
  }
}

export class LmsAuthError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LmsAuthError';
  }
}

/* Every outbound request goes through one serialized queue so the app can never
 * burst faster than config.minIntervalMs. neoLMS answers bursts with 429. */
let queue = Promise.resolve();
let lastRequestAt = 0;

function schedule(task) {
  const run = queue.then(async () => {
    const wait = lastRequestAt + config.minIntervalMs - Date.now();
    if (wait > 0) await sleep(wait);
    try {
      return await task();
    } finally {
      lastRequestAt = Date.now();
    }
  });
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function retryAfterSeconds(headers) {
  const raw = headers.get('retry-after');
  if (!raw) return null;
  const seconds = Number(raw);
  return Number.isFinite(seconds) ? seconds : null;
}

function extractCsrfToken(html, formId) {
  if (formId) {
    const formMatch = html.match(
      new RegExp(`<form[^>]*id=["']${formId}["'][\\s\\S]*?</form>`, 'i'),
    );
    if (formMatch) {
      const token = formMatch[0].match(
        /name=["']authenticity_token["'][^>]*value=["']([^"']+)["']/i,
      );
      if (token) return decodeHtml(token[1]);
    }
  }
  const fallback = html.match(/name=["']authenticity_token["'][^>]*value=["']([^"']+)["']/i);
  return fallback ? decodeHtml(fallback[1]) : null;
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function pullLmsMessage(body) {
  if (!body) return null;
  if (typeof body === 'object') {
    for (const key of ['message', 'error', 'msg', 'alert', 'error_message', 'notice']) {
      if (typeof body[key] === 'string' && body[key].trim()) return body[key].trim();
    }
    return null;
  }
  const tag = body.match(
    /<(?:div|p|span)[^>]*(?:class|id)=["'][^"']*(?:error|alert|flash|notice|message)[^"']*["'][^>]*>([\s\S]{0,300}?)<\/(?:div|p|span)>/i,
  );
  if (!tag) return null;
  const text = tag[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > 0 && text.length < 300 ? text : null;
}

const AUTH_FAILURE_HINTS = [
  'incorrect',
  'invalid userid',
  'invalid password',
  'does not match',
  'not recognized',
  'no longer valid',
  'try again',
];

function looksLikeAuthFailure(body) {
  const haystack = (typeof body === 'string' ? body : JSON.stringify(body || {})).toLowerCase();
  return AUTH_FAILURE_HINTS.some((hint) => haystack.includes(hint));
}

export class LmsClient {
  constructor(cookies) {
    this.jar = new CookieJar(cookies);
  }

  async request(pathname, options = {}) {
    const {
      method = 'GET',
      body = null,
      referer,
      accept = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      maxRedirects = 5,
    } = options;

    let target = absoluteLmsUrl(pathname);
    let currentMethod = method;
    let currentBody = body;

    for (let hop = 0; hop <= maxRedirects; hop += 1) {
      const response = await this.#send(target, currentMethod, currentBody, referer, accept);

      if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
        const location = response.headers.get('location');
        target = new URL(location, target).toString();
        // 303, and 302 after a POST, degrade to GET the way browsers do.
        if (currentMethod === 'POST' && response.status !== 307 && response.status !== 308) {
          currentMethod = 'GET';
          currentBody = null;
        }
        continue;
      }

      return response;
    }

    throw new Error('Too many redirects while talking to the LMS.');
  }

  async #send(url, method, body, referer, accept) {
    return schedule(async () => {
      let attempt = 0;

      for (;;) {
        const headers = {
          'User-Agent': config.userAgent,
          Accept: accept,
          'Accept-Language': 'en-PH,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          Connection: 'keep-alive',
        };
        const cookieHeader = this.jar.header();
        if (cookieHeader) headers.Cookie = cookieHeader;
        if (referer) headers.Referer = absoluteLmsUrl(referer);
        if (method === 'POST') {
          headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
          headers['X-Requested-With'] = 'XMLHttpRequest';
          headers.Origin = config.lmsBaseUrl;
        }

        const response = await fetch(url, {
          method,
          headers,
          body: method === 'POST' ? body : undefined,
          redirect: 'manual',
        });

        this.jar.absorb(response);

        if (response.status === 429) {
          attempt += 1;
          if (attempt > 3) {
            const retryAfter = retryAfterSeconds(response.headers);
            await response.arrayBuffer().catch(() => {});
            throw new LmsRateLimitError(retryAfter);
          }
          const waitMs = Math.min(retryAfterSeconds(response.headers) ?? 0, 60) * 1000 || 5000 * attempt;
          await sleep(waitMs);
          continue;
        }

        const text = await response.text();
        return { status: response.status, url, headers: response.headers, body: text };
      }
    });
  }

  async login(userid, password) {
    const formPage = await this.request('/log_in/form');
    const token = extractCsrfToken(formPage.body, 'login_form');
    if (!token) {
      throw new LmsAuthError(
        'Could not read the eLMS login form. The page structure may have changed.',
      );
    }

    const params = new URLSearchParams();
    params.set('utf8', '\u2713');
    params.set('authenticity_token', token);
    params.set('form_login', 'true');
    params.set('userid', userid);
    params.set('password', password);
    params.set('remember_me', '0');

    const attempt = await this.request('/log_in/submit_from_portal', {
      method: 'POST',
      body: params.toString(),
      referer: '/log_in/form',
      accept: 'application/json, text/javascript, */*; q=0.01',
    });

    if (attempt.status >= 400) {
      throw new LmsAuthError(
        pullLmsMessage(attempt.body) || `The eLMS returned HTTP ${attempt.status} during login.`,
      );
    }

    let parsed = null;
    try {
      parsed = JSON.parse(attempt.body);
    } catch {
      parsed = null;
    }

    if (parsed && typeof parsed === 'object') {
      const flag = parsed.success ?? parsed.ok ?? parsed.status;
      const succeeded = flag === true || flag === 'success' || flag === 'ok';
      if (!succeeded && looksLikeAuthFailure(parsed)) {
        throw new LmsAuthError(pullLmsMessage(parsed) || 'That userid and password were not accepted.');
      }
    }

    // The POST response shape is not documented, so treat a follow-up request to
    // a real page as the source of truth for whether we are signed in.
    const verified = await this.verifySession();
    if (!verified.authenticated) {
      throw new LmsAuthError(
        pullLmsMessage(parsed ?? attempt.body) ||
          'Login did not complete. Check your credentials, or whether your account still needs term activation.',
      );
    }

    return { cookies: this.jar.toJSON(), user: verified.user };
  }

  async verifySession() {
    const page = await this.request('/user_dashboard');
    const bouncedToLogin =
      page.url.includes('/site/not_logged_in') ||
      page.url.includes('/log_in') ||
      /name=["']authenticity_token["']/.test(page.body.slice(0, 4000)) &&
        page.body.includes('frmLogin');

    if (bouncedToLogin || page.status >= 400) {
      return { authenticated: false, status: page.status, url: page.url, body: page.body, user: null };
    }

    return { authenticated: true, status: page.status, url: page.url, body: page.body, user: null };
  }

  async logout() {
    try {
      await this.request('/log_out', { accept: 'text/html,*/*' });
    } catch {
      // Best effort: the local cookie is cleared either way.
    }
  }

  /** Rejects paths that try to escape the LMS origin. */
  async fetchPage(pathname) {
    const url = new URL(absoluteLmsUrl(pathname));
    if (`${url.protocol}//${url.host}` !== config.lmsBaseUrl) {
      throw new Error('Refusing to fetch a path outside the configured LMS host.');
    }

    const page = await this.request(url.toString());
    return {
      path: url.pathname + url.search,
      url: page.url,
      status: page.status,
      html: page.body,
      expired:
        page.url.includes('/site/not_logged_in') ||
        page.url.includes('/log_in') ||
        page.status === 401,
    };
  }
}
