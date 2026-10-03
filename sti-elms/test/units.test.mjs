import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseDashboard, findDate } from '../src/parse-dashboard.mjs';
import { seal, open } from '../src/crypto.mjs';
import { CookieJar } from '../src/cookie-jar.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(join(here, 'fixture-dashboard.html'), 'utf8');
const SECRET = 'test-secret-value-0123456789';

test('crypto round-trips a session payload', () => {
  const payload = { cookies: { lms_session_v1: 'abc%3D%3D--sig' }, createdAt: 1 };
  const sealed = seal(payload, SECRET);
  assert.deepEqual(open(sealed, SECRET), payload);
});

test('crypto refuses a tampered or mis-keyed token', () => {
  const sealed = seal({ cookies: { a: 'b' } }, SECRET);
  const [iv, tag, data] = sealed.split('.');
  assert.equal(open(`${iv}.${tag}.${data.slice(0, -2)}xx`, SECRET), null);
  assert.equal(open(sealed, 'a-different-secret-value'), null);
  assert.equal(open('not-a-token', SECRET), null);
  assert.equal(open(undefined, SECRET), null);
});

test('cookie jar keeps live cookies and drops expired ones', () => {
  const jar = new CookieJar();
  jar.absorbOne('lms_session_v1=abc%3D%3D--sig; path=/; secure; HttpOnly; SameSite=Lax');
  jar.absorbOne('lms-auth2=xyz; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT');
  jar.absorbOne('tracker=1; Max-Age=0');

  assert.equal(jar.get('lms_session_v1'), 'abc%3D%3D--sig');
  assert.equal(jar.has('lms-auth2'), false);
  assert.equal(jar.has('tracker'), false);
  assert.equal(jar.header(), 'lms_session_v1=abc%3D%3D--sig');
});

test('cookie jar replays values verbatim, without re-encoding', () => {
  const jar = new CookieJar();
  jar.absorbOne('lms_session_v1=a%2Bb%3Dc%3D%3D--hash; path=/; secure');
  assert.equal(jar.header(), 'lms_session_v1=a%2Bb%3Dc%3D%3D--hash');
});

test('date detection handles the formats neoLMS renders', () => {
  assert.equal(findDate('Due 2026-03-04').iso.slice(0, 10), '2026-03-04');
  assert.equal(findDate('Due March 4, 2026').iso.slice(0, 10), '2026-03-04');
  assert.equal(findDate('Deadline: 03/04/2026').iso.slice(0, 10), '2026-03-04');
  assert.equal(findDate('Submit in 3 days').iso, null);
  assert.equal(findDate('tomorrow').relative, 'tomorrow');
  assert.equal(findDate('No dates in this text').raw, null);
});

test('parser extracts identity, courses, deadlines and sections', () => {
  const data = parseDashboard(fixture, 'https://elms.sti.edu/user_dashboard');

  assert.equal(data.user, 'Juan Dela Cruz');
  assert.equal(data.debug.loggedOut, false);
  assert.ok(data.courses.length >= 2, 'expected at least two courses');
  assert.ok(
    data.courses.some((c) => c.name === 'IT Elective 4' && c.id === '40218'),
    'course link id should be pulled out of the href',
  );
  assert.equal(data.courses[0].href, 'https://elms.sti.edu/course/40218');

  const titles = data.sections.map((s) => s.title);
  assert.ok(titles.includes('Upcoming Deadlines'), `sections were ${JSON.stringify(titles)}`);
  assert.ok(titles.includes('Announcements'));

  assert.ok(data.deadlines.length >= 2, 'deadline hints should be promoted');
  assert.ok(data.deadlines.every((d) => typeof d.section === 'string' && d.section));
  // Entries hinting at a due date are promoted from wherever they appear.
  assert.ok(data.deadlines.some((d) => d.section === 'Upcoming Deadlines'));
  assert.ok(data.deadlines.some((d) => d.title.includes('Lab Report')));
  assert.equal(data.deadlines[0].when.iso.slice(0, 10), '2026-03-04');
});

test('parser never emits script or style content as entries', () => {
  const data = parseDashboard(fixture, 'https://elms.sti.edu/user_dashboard');
  const blob = JSON.stringify(data);
  assert.ok(!blob.includes('window.dataLayer'));
  assert.ok(!blob.includes('alert('));
});

test('parser degrades gracefully on an empty or login page', () => {
  const empty = parseDashboard('<html><body><p>Nothing here</p></body></html>', 'https://elms.sti.edu/');
  assert.deepEqual(empty.courses, []);
  assert.deepEqual(empty.deadlines, []);
  assert.equal(empty.stats.sections, 0);

  const login = parseDashboard(
    '<html><body><form id="login_form" class="frmLogin"><input name="authenticity_token" value="t"></form></body></html>',
    'https://elms.sti.edu/',
  );
  assert.equal(login.debug.loggedOut, true);
});

test('parser strips site navigation and footers before looking for sections', () => {
  const data = parseDashboard(fixture, 'https://elms.sti.edu/user_dashboard');
  const blob = JSON.stringify(data);
  assert.ok(!blob.includes('"Home"'), 'nav links should not become dashboard entries');
  assert.ok(!blob.includes('STI Education Services Group'), 'footer text should not become a section');
  // Identity survives the strip because it is read before chrome removal.
  assert.equal(data.user, 'Juan Dela Cruz');
});

test('parser strips markup so titles stay plain text', () => {
  const data = parseDashboard(
    '<div class="panel"><h3>Notes</h3><ul><li><b>Quiz</b> &amp; report &mdash; 2026-05-09</li></ul></div>',
    'https://elms.sti.edu/',
  );
  assert.equal(data.sections[0].entries[0].text, 'Quiz & report — 2026-05-09');
});
