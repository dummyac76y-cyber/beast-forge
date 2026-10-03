/**
 * Minimal single-host cookie jar. neoLMS runs on one origin and hands back
 * URL-encoded Rails cookies, so values are stored and replayed verbatim.
 */
export class CookieJar {
  constructor(pairs) {
    this.cookies = new Map(Object.entries(pairs || {}));
  }

  header() {
    if (this.cookies.size === 0) return '';
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  absorb(response) {
    const list = response.headers.getSetCookie?.() ?? [];
    for (const raw of list) this.absorbOne(raw);
  }

  absorbOne(raw) {
    const [pair, ...attributes] = raw.split(';');
    const eq = pair.indexOf('=');
    if (eq < 0) return;

    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    const attrs = attributes.map((a) => a.trim().toLowerCase());

    const expires = attrs.find((a) => a.startsWith('expires='));
    const maxAge = attrs.find((a) => a.startsWith('max-age='));
    const expiredByDate = expires ? Date.parse(expires.slice(8)) <= Date.now() : false;
    const expiredByMaxAge = maxAge ? Number(maxAge.slice(8)) <= 0 : false;

    if (value === '' || expiredByDate || expiredByMaxAge) this.cookies.delete(name);
    else this.cookies.set(name, value);
  }

  get(name) {
    return this.cookies.get(name) ?? null;
  }

  has(name) {
    return this.cookies.has(name);
  }

  toJSON() {
    return Object.fromEntries(this.cookies);
  }
}
