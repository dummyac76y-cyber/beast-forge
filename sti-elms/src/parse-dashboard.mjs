import * as cheerio from 'cheerio';

const CONTAINER_SELECTOR = [
  '.panel',
  '.widget',
  '.card',
  '.box',
  '.module',
  '.block',
  '.section',
  'section',
  '[class*="panel"]',
  '[class*="widget"]',
  '[class*="block"]',
  '[class*="card"]',
].join(',');

const HEADING_SELECTOR = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  '.panel-title',
  '.widget-title',
  '.section-title',
  '.block-title',
  '.card-title',
  '[class*="title"]',
].join(',');

const ENTRY_SELECTOR = [
  'li',
  'tr',
  '.item',
  '.row',
  '.entry',
  '.list-item',
  '.listitem',
  '[class*="item"]',
  '[class*="row"]',
  '[class*="entry"]',
].join(',');

const CHROME_SELECTOR = 'script, style, noscript, nav, header, footer, link, meta, svg, iframe';

const DEADLINE_HINT = /\b(due|deadline|submit|submission|turn in|hand in|quotation|quiz|assignment)\b/i;

function absolutize(href, base) {
  if (!href) return null;
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function textOf($, node) {
  return $(node)
    .text()
    .replace(/\s+/g, ' ')
    .replace(/ /g, ' ')
    .trim();
}

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** Best-effort date detection. neoLMS renders dates in several formats. */
export function findDate(text) {
  if (!text) return { raw: null, iso: null };

  const relative = text.match(/\b(in\s+(\d+)\s+(day|days|hour|hours|week|weeks))\b/i);
  if (relative) return { raw: relative[0], iso: null, relative: relative[0] };
  if (/\btoday\b/i.test(text)) return { raw: 'today', iso: null, relative: 'today' };
  if (/\btomorrow\b/i.test(text)) return { raw: 'tomorrow', iso: null, relative: 'tomorrow' };

  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (iso) {
    const [, y, m, d, hh, mm] = iso;
    const date = new Date(
      Number(y),
      Number(m) - 1,
      Number(d),
      hh ? Number(hh) : 0,
      mm ? Number(mm) : 0,
    );
    if (!Number.isNaN(date.getTime())) return { raw: iso[0], iso: date.toISOString() };
  }

  const named = text.match(
    /\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?\b/,
  );
  if (named) {
    const monthIndex = MONTHS[named[1].slice(0, 3).toLowerCase()];
    if (monthIndex !== undefined) {
      const year = named[3] ? Number(named[3]) : new Date().getFullYear();
      const date = new Date(year, monthIndex, Number(named[2]));
      if (!Number.isNaN(date.getTime())) return { raw: named[0].trim(), iso: date.toISOString() };
    }
  }

  const numeric = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (numeric) {
    const year = Number(numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3]);
    const date = new Date(year, Number(numeric[1]) - 1, Number(numeric[2]));
    if (!Number.isNaN(date.getTime())) return { raw: numeric[0], iso: date.toISOString() };
  }

  return { raw: null, iso: null };
}

function extractUser($, text) {
  const selectors = ['.user_name', '#user_name', '.profile-name', '.user_full_name', '.account-name'];
  for (const selector of selectors) {
    const value = textOf($, selector).trim();
    if (value && value.length < 80) return value;
  }
  const greeting = text.match(/\b(?:welcome|hi|hello|good (?:morning|afternoon|evening))\s*,?\s+([A-Z][\w'.-]+(?: [A-Z][\w'.-]+){0,3})/);
  return greeting ? greeting[1].trim() : null;
}

/**
 * Theme-agnostic section extraction.
 *
 * neoLMS dashboards are assembled from themed panels whose class names differ
 * per school, so instead of hard-coding STI's selectors we walk the rendered
 * structure: find panels, take the heading as the section title, and treat the
 * panel's list items as entries. This survives a theme swap better than fixed
 * selectors, and /api/raw exists to refine it against a real session.
 */
function extractSections($, base) {
  const sections = [];
  const claimed = new Set();

  const containers = $(CONTAINER_SELECTOR).toArray();
  const ordered = containers
    .map((node) => ({ node, depth: $(node).parents(CONTAINER_SELECTOR).length }))
    .sort((a, b) => a.depth - b.depth);

  for (const { node } of ordered) {
    const $node = $(node);
    if (claimed.has(node)) continue;
    let nestedInsideClaimed = false;
    for (const ancestor of $node.parents().toArray()) {
      if (claimed.has(ancestor)) {
        nestedInsideClaimed = true;
        break;
      }
    }
    if (nestedInsideClaimed) continue;

    const headingNode = $node.find(HEADING_SELECTOR).first();
    const heading = headingNode.length ? textOf($, headingNode) : '';
    const entries = [];

    $node.find(ENTRY_SELECTOR).each((_, entry) => {
      const $entry = $(entry);
      if ($entry.find(CONTAINER_SELECTOR).length > 0) return;
      const text = textOf($, entry);
      if (!text || text === heading || text.length > 600) return;

      const link = $entry.find('a[href]').first();
      const href = absolutize(link.attr('href'), base);
      const linkText = link.length ? textOf($, link) : '';

      entries.push({
        text: text.length > 400 ? `${text.slice(0, 400)}…` : text,
        title: linkText && linkText.length <= 160 ? linkText : text.slice(0, 160),
        href,
        when: findDate(text),
      });
    });

    if (!heading && entries.length === 0) continue;

    claimed.add(node);
    for (const descendant of $node.find('*').toArray()) claimed.add(descendant);

    const deduped = [];
    const seen = new Set();
    for (const entry of entries) {
      const key = `${entry.title}|${entry.href ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(entry);
    }

    sections.push({ title: heading || 'Untitled section', entries: deduped });
  }

  return sections.filter((section) => section.entries.length > 0 || section.title);
}

export function parseDashboard(html, base) {
  const $ = cheerio.load(html);
  $('script, style, noscript').remove();

  const pageText = textOf($, 'body');
  const title = textOf($, 'title') || 'Dashboard';

  // Identity first: neoLMS renders the signed-in name inside <header>, which is
  // about to be stripped as page chrome.
  const user = extractUser($, pageText);

  // Site navigation and footers are full of <li> lists that would otherwise be
  // mistaken for dashboard sections.
  $(CHROME_SELECTOR).remove();

  const courses = [];
  const seenCourse = new Set();
  $('a[href*="/course/"]').each((_, el) => {
    const href = $(el).attr('href');
    const name = textOf($, el);
    if (!name || name.length > 140) return;
    const id = href.match(/\/course\/(\d+)/)?.[1] ?? null;
    const key = id ?? name;
    if (seenCourse.has(key)) return;
    seenCourse.add(key);
    courses.push({ id, name, href: absolutize(href, base) });
  });

  const sections = extractSections($, base);

  const deadlines = [];
  const seenDeadline = new Set();
  for (const section of sections) {
    for (const entry of section.entries) {
      if (!DEADLINE_HINT.test(entry.text)) continue;
      const key = entry.href ?? `${section.title}|${entry.title}`;
      if (seenDeadline.has(key)) continue;
      seenDeadline.add(key);
      deadlines.push({ ...entry, section: section.title });
    }
  }

  deadlines.sort((a, b) => {
    if (a.when.iso && b.when.iso) return a.when.iso.localeCompare(b.when.iso);
    if (a.when.iso) return -1;
    if (b.when.iso) return 1;
    return 0;
  });

  const debug = {
    bodyChars: html.length,
    containers: $(CONTAINER_SELECTOR).length,
    headings: $(HEADING_SELECTOR).length,
    courseLinks: $('a[href*="/course/"]').length,
    sections: sections.length,
    deadlines: deadlines.length,
    loggedOut: /frmLogin|not_logged_in/i.test(html),
  };

  return {
    title,
    user,
    courses: courses.slice(0, 60),
    sections,
    deadlines: deadlines.slice(0, 60),
    stats: {
      courses: courses.length,
      sections: sections.length,
      deadlines: deadlines.length,
      entries: sections.reduce((total, s) => total + s.entries.length, 0),
    },
    debug,
    fetchedAt: new Date().toISOString(),
  };
}

export { extractSections };
