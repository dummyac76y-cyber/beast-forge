const els = {
  loginView: document.getElementById('loginView'),
  dashView: document.getElementById('dashView'),
  topbarRight: document.getElementById('topbarRight'),
  loginForm: document.getElementById('loginForm'),
  loginBtn: document.getElementById('loginBtn'),
  loginError: document.getElementById('loginError'),
  userid: document.getElementById('userid'),
  password: document.getElementById('password'),
  refreshBtn: document.getElementById('refreshBtn'),
  logoutBtn: document.getElementById('logoutBtn'),
  rawBtn: document.getElementById('rawBtn'),
  who: document.getElementById('who'),
  status: document.getElementById('status'),
  stats: document.getElementById('stats'),
  deadlines: document.getElementById('deadlines'),
  courses: document.getElementById('courses'),
  sections: document.getElementById('sections'),
  filter: document.getElementById('filter'),
  filterCount: document.getElementById('filterCount'),
};

let session = { authenticated: false, userid: null };
let lastData = null;
let targetPath = '/user_dashboard';

function show(node, visible) {
  node.hidden = !visible;
}

function setStatus(message) {
  els.status.textContent = message || '';
  show(els.status, Boolean(message));
}

function formatDate(iso) {
  try {
    return new Intl.DateTimeFormat('en-PH', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    ...options,
  });
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  return { status: response.status, data };
}

function setLoginView(message) {
  show(els.loginView, true);
  show(els.dashView, false);
  show(els.topbarRight, false);
  els.password.value = '';
  if (message) {
    els.loginError.textContent = message;
    show(els.loginError, true);
  } else {
    show(els.loginError, false);
  }
}

function setDashView() {
  show(els.loginView, false);
  show(els.dashView, true);
  show(els.topbarRight, true);
  show(els.loginError, false);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderEntry(entry, extraLabel) {
  const li = el('li');
  if (entry.href) {
    const link = el('a', 'entry-title', entry.title);
    link.href = entry.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    li.append(link);
    if (entry.text && entry.text !== entry.title) {
      li.append(el('div', 'entry-text', entry.text));
    }
  } else {
    li.append(el('span', 'entry-title', entry.title));
  }
  if (extraLabel) {
    const pill = el('span', 'pill', extraLabel);
    li.firstChild.append(pill);
  }
  const when = entry.when?.iso || entry.when?.raw;
  if (when) li.append(el('span', 'entry-when', entry.when.iso ? formatDate(when) : when));
  return li;
}

function matchesFilter(entry, needle) {
  if (!needle) return true;
  const haystack = `${entry.title} ${entry.text ?? ''}`.toLowerCase();
  return haystack.includes(needle);
}

function render(data) {
  lastData = data;

  const who = data.user || session.userid;
  els.who.textContent = who ? `signed in as ${who}` : '';

  const stats = [
    { n: data.stats?.courses ?? 0, k: 'courses' },
    { n: data.stats?.deadlines ?? 0, k: 'deadlines' },
    { n: data.stats?.sections ?? 0, k: 'sections' },
    { n: data.stats?.entries ?? 0, k: 'items' },
  ];
  els.stats.replaceChildren(
    ...stats.map((stat) => {
      const box = el('div', 'stat');
      box.append(el('div', 'n', String(stat.n)), el('div', 'k', stat.k));
      return box;
    }),
  );

  const needle = els.filter.value.trim().toLowerCase();

  const deadlines = (data.deadlines ?? []).filter((d) => matchesFilter(d, needle));
  els.deadlines.replaceChildren(
    ...(deadlines.length
      ? deadlines.map((d) => renderEntry(d, d.section))
      : [el('p', 'empty', needle ? 'No deadlines match your filter.' : 'No deadlines found on this page.')]),
  );

  const courses = (data.courses ?? []).filter((c) => matchesFilter({ title: c.name, text: '' }, needle));
  els.courses.replaceChildren(
    ...(courses.length
      ? courses.map((course) => renderEntry({ ...course, text: '', when: {} }, null))
      : [el('p', 'empty', needle ? 'No courses match your filter.' : 'No course links found.')]),
  );

  const rendered = [];
  let visibleEntries = 0;
  for (const section of data.sections ?? []) {
    const entries = section.entries.filter((entry) => matchesFilter(entry, needle));
    if (needle && entries.length === 0) continue;
    visibleEntries += entries.length;

    const box = el('section', 'panel');
    box.append(el('h2', null, `${section.title} (${section.entries.length})`));
    if (entries.length === 0) {
      box.append(el('p', 'empty', 'Nothing here.'));
    } else {
      const list = el('ul', 'list');
      list.replaceChildren(...entries.map((entry) => renderEntry(entry, null)));
      box.append(list);
    }
    rendered.push(box);
  }
  if (rendered.length === 0) {
    rendered.push(el('p', 'empty', needle ? 'Nothing matches your filter.' : 'No sections were recognised on this page.'));
  }
  els.sections.replaceChildren(...rendered);
  els.filterCount.textContent = needle ? `${visibleEntries} items shown` : '';
}

async function loadDashboard({ refresh = false } = {}) {
  els.refreshBtn.disabled = true;
  setStatus('Reading your eLMS…');
  const query = new URLSearchParams({ path: targetPath });
  if (refresh) query.set('refresh', '1');
  const { status, data } = await api(`/api/dashboard?${query}`);

  els.refreshBtn.disabled = false;

  if (status === 401) {
    session = { authenticated: false, userid: null };
    setLoginView(data?.error ?? 'Sign in again.');
    return;
  }
  if (status === 429) {
    setStatus(data?.error ?? 'The eLMS is rate limiting this app. Wait a minute.');
    return;
  }
  if (status !== 200 || !data) {
    setStatus(data?.error ?? `Could not load the dashboard (HTTP ${status}).`);
    return;
  }

  setDashView();
  setStatus('');
  render(data);
}

els.loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  els.loginBtn.disabled = true;
  els.loginError.hidden = true;
  els.loginBtn.textContent = 'Signing in…';

  const { status, data } = await api('/api/login', {
    method: 'POST',
    body: JSON.stringify({ userid: els.userid.value, password: els.password.value }),
  });

  els.loginBtn.disabled = false;
  els.loginBtn.textContent = 'Sign in';

  if (status !== 200) {
    els.loginError.textContent = data?.error ?? `Login failed (HTTP ${status}).`;
    els.loginError.hidden = false;
    els.password.value = '';
    return;
  }

  session = { authenticated: true, userid: data.userid };
  els.password.value = '';
  await loadDashboard();
});

els.refreshBtn.addEventListener('click', () => loadDashboard({ refresh: true }));

els.logoutBtn.addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' });
  session = { authenticated: false, userid: null };
  lastData = null;
  setLoginView('');
  els.userid.focus();
});

els.filter.addEventListener('input', () => {
  if (lastData) render(lastData);
});

els.rawBtn.addEventListener('click', () => {
  const url = `/api/raw?path=${encodeURIComponent(targetPath)}`;
  els.rawBtn.href = url;
});

async function boot() {
  const { data } = await api('/api/session');
  session = { authenticated: Boolean(data?.authenticated), userid: data?.userid ?? null };
  if (session.authenticated) {
    await loadDashboard();
  } else {
    setLoginView('');
    els.userid.focus();
  }
}

boot();
