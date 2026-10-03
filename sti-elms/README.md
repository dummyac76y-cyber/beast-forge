# sti-elms

A small read-only web dashboard for the STI College eLMS. It signs in as you,
reads your own pages, and renders them in its own UI.

## What this is not

- Not an iframe wrapper. `elms.sti.edu` sends
  `Content-Security-Policy: frame-ancestors 'self' cdn.neolms.com`, which blocks
  embedding it in any other origin. A proxy is the only option.
- Not a scraper for other people. It reads one account: yours.
- Not a credential store. Your password is forwarded once and never written to
  disk. Only the resulting session cookie is persisted, AES-256-GCM encrypted.

## How the upstream works

Facts confirmed by inspecting `elms.sti.edu` (2026-10-03):

| | |
|---|---|
| Platform | neoLMS (Rails) behind Cloudflare + CloudFront |
| Login | `GET /log_in/form` for the CSRF token, then `POST /log_in/submit_from_portal` with `userid`, `password`, `form_login=true`, `authenticity_token` |
| Session | `lms_session_v1` (HttpOnly, Secure, SameSite=Lax) plus `lms-auth2` |
| Landing page | `/user_dashboard` |
| API | None. No public JSON or REST surface; every page is server-rendered HTML |
| Rate limits | Aggressive. Returns HTTP 429 after a handful of fast requests, login included |

Because there is no API, this app parses HTML. That is the whole trade-off.

## Run it

```bash
cd sti-elms
npm install
npm start          # http://localhost:4180
```

Open the URL, type your eLMS userid and password into the form, and the
dashboard loads. `npm run dev` restarts on file changes.

Optional config, via `.env` (copy `.env.example`):

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `4180` | |
| `SESSION_SECRET` | generated | Falls back to `.session-secret`, written mode 600 |
| `LMS_BASE_URL` | `https://elms.sti.edu` | |
| `LMS_MIN_INTERVAL_MS` | `1500` | Floor on the gap between upstream requests. Do not lower it. |
| `LMS_CACHE_TTL_MS` | `300000` | Dashboard stays fresh this long before refetching |
| `FORCE_SECURE_COOKIE` | `0` | Set to `1` when serving over HTTPS |

## Layout

```
server.mjs              HTTP routes, static files, session cookie, cache
src/config.mjs          env loading, session secret, upstream URL
src/cookie-jar.mjs      single-host cookie jar
src/lms-client.mjs      throttled queue, CSRF login, redirect + 429 handling
src/crypto.mjs          AES-256-GCM seal/open for the session cookie
src/parse-dashboard.mjs HTML -> structured data
public/                 login form + dashboard (no build step)
test/                   node:test unit suite
```

## Endpoints

| Route | Purpose |
|---|---|
| `GET /` | App shell |
| `POST /api/login` | `{userid, password}`, forwards to neoLMS, sets the session cookie |
| `POST /api/logout` | Clears local cookie and calls upstream logout |
| `GET /api/session` | Whether a local session exists |
| `GET /api/dashboard?path=/user_dashboard&refresh=1` | Parsed dashboard, cached |
| `GET /api/raw?path=/user_dashboard` | Upstream HTML, for debugging parsers |

## Honest limitations

1. **The parser is unverified against a real logged-in page.** It was written
   from the public pages plus neoLMS conventions, and tested against a fixture
   in `test/fixture-dashboard.html`, not against your actual dashboard. It walks
   panels generically (heading becomes the section title, list items become
   entries) rather than hard-coding STI's class names, which should survive a
   theme change, but expect to tune it.
2. **To tune it, use `/api/raw`.** Sign in, hit
   `http://localhost:4180/api/raw?path=/user_dashboard`, and compare the HTML
   against what `parseDashboard` produced. Any page path works, so you can check
   `/courses`, a course page, or anything else your account can reach. Point
   `debug` counts in the JSON at the selectors that missed.
3. **Deep links open the real eLMS.** Entries link back to `elms.sti.edu` in a
   new tab. There is no write path here at all: no quiz submission, no forum
   posting, no uploads.
4. **429s are normal, not a bug.** The client retries with backoff and the UI
   tells you to wait. Raising `LMS_MIN_INTERVAL_MS` is the fix if it happens
   often.
5. **Cloudflare sits in front.** It works today, but bot mitigation policy
   changes without notice and could start challenging server-side requests. If
   that happens, a headless-browser fetch path (Playwright is already a
   devDependency in the parent repo) is the fallback.

## Respecting the rules

This reads your own account, at human pace, from your own machine. Please keep
it that way: don't point it at other students' data, don't raise the request
rate to scrape, and don't redistribute course material. STI's acceptable-use
expectations are in their [eLMS FAQ](https://elms.sti.edu/page/show/495374).
