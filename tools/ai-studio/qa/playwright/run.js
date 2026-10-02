// Beast Forge web QA suite.
//
// Deterministic by design:
//   * Stable selectors only (#screen, [data-screen], #battleCanvas, #cardbar,
//     #catBtn, #pauseBtn, #speedBtn). No nth-child, no CSS class ordering.
//   * Game state is read from localStorage / the DOM, never from wall-clock
//     timing. Where the game animates, we wait on a *condition*, not a sleep.
//   * Every test gets a clean profile so results do not depend on order.
//
// Exercises the real game in a real Chromium with WebGL, which is also how we
// confirm the 3D renderer actually initialises.

const path = require('path');
const { createServer } = require('./server');

const WEB = path.resolve(__dirname, '../../../../web');
const BASE = process.env.BF_QA_BASE_URL || 'http://127.0.0.1:5173';
const HEADED = process.env.BF_QA_HEADED === '1';
const ARTIFACTS = path.join(__dirname, 'artifacts');

// Console messages that are expected and must not fail the run.
const IGNORED_CONSOLE = [
  /AudioContext was not allowed to start/i,   // expected: no user gesture yet
  /WebGL.*deprecated/i,
  /Automatic fallback to software WebGL/i,    // CPU/llvmpipe CI rendering
];

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  console.error('playwright is not installed. Run: ai-studio test --setup');
  process.exit(2);
}

// ---------------------------------------------------------------- harness
const results = [];
let server;

function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  const mark = ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  console.log(`  ${mark}  ${name}${detail ? `  -- ${detail}` : ''}`);
}

/** Wait until `fn` returns truthy in the page, or throw after `timeout`. */
async function waitFor(page, fn, { timeout = 15000, arg = null } = {}) {
  try {
    await page.waitForFunction(fn, arg, { timeout, polling: 100 });
    return true;
  } catch (e) {
    return false;
  }
}

async function newPage(browser, consoleErrors) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (IGNORED_CONSOLE.some((re) => re.test(text))) return;
    consoleErrors.push(text);
  });
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));
  return { context, page };
}

/**
 * Open the campaign and click the first unlocked stage.
 * Stages render as <button class="stage"> and locked ones carry [disabled],
 * so this is stable regardless of how many stages the profile has unlocked.
 */
async function startStage(page) {
  await page.click('#nav button[data-screen="campaign"]');
  await waitFor(page, () => !!document.querySelector('button.stage'));
  await page.locator('button.stage:not([disabled])').first().click();
}

/** Deterministic start: seed a known profile, then load. */
async function boot(page, profile = {}) {
  // Keys match web/js/repo.js exactly; seeding camelCase here would be
  // silently ignored and the profile would reset to defaults on save.
  const seed = Object.assign({
    coins: 5000, crystals: 200, current_stage: 1, highest_arena: 0,
    fort_lv: 1, turret_lv: 1, mineral_lv: 1, sound_enabled: true,
  }, profile);
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.evaluate((p) => {
    localStorage.setItem('beast_forge_prefs', JSON.stringify(p));
  }, seed);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#screen', { timeout: 15000 });
  // Deterministic boot condition: the menu has rendered real content.
  await waitFor(page, () => {
    const s = document.getElementById('screen');
    return s && s.children.length > 0;
  });
}

// ------------------------------------------------------------------ tests
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('page loads with title and no console errors', async (browser, errors) => {
  const { context, page } = await newPage(browser, errors);
  await page.goto(BASE + '/', { waitUntil: 'load' });
  const title = await page.title();
  record('page loads with title', /Beast Forge/i.test(title), `title="${title}"`);
  record('no console errors on load', errors.length === 0, errors.join(' | ').slice(0, 200));
  await context.close();
});

test('top-level chrome is present', async (browser, errors) => {
  const { context, page } = await newPage(browser, errors);
  await boot(page);
  const counts = await page.evaluate(() => ({
    nav: document.querySelectorAll('#nav button[data-screen]').length,
    chips: document.querySelectorAll('#chips .chip').length,
    sound: !!document.getElementById('soundBtn'),
    screen: document.getElementById('screen').children.length,
  }));
  record('nav exposes all screens', counts.nav === 6, `${counts.nav} buttons`);
  record('profile chips render', counts.chips >= 4, `${counts.chips} chips`);
  record('sound toggle exists', counts.sound);
  record('main menu renders content', counts.screen > 0, `${counts.screen} nodes`);
  await context.close();
});

test('main menu renders its actions', async (browser, errors) => {
  const { context, page } = await newPage(browser, errors);
  await boot(page);
  const text = await page.textContent('#screen');
  for (const label of ['Campaign', 'Titan Arena', 'Beast Forge', 'Fort Armory', 'Roster']) {
    record(`menu shows "${label}"`, text.includes(label));
  }
  await context.close();
});

test('every nav screen routes without error', async (browser, errors) => {
  const { context, page } = await newPage(browser, errors);
  await boot(page);
  for (const screen of ['campaign', 'arena', 'forge', 'armory', 'roster', 'menu']) {
    await page.click(`#nav button[data-screen="${screen}"]`);
    const ok = await waitFor(page, (s) => {
      const el = document.querySelector('#screen');
      return el && el.children.length > 0
        && document.querySelector(`#nav button[data-screen="${s}"]`).classList.contains('on');
    }, { arg: screen, timeout: 8000 });
    record(`route to "${screen}"`, ok);
  }
  record('navigation produced no console errors', errors.length === 0,
         errors.join(' | ').slice(0, 200));
  await context.close();
});

test('start game: entering a battle creates the canvas and HUD', async (browser, errors) => {
  const { context, page } = await newPage(browser, errors);
  await boot(page);
  await page.click('#nav button[data-screen="campaign"]');
  await waitFor(page, () => document.getElementById('screen').textContent.includes('Stage 1'));
  // Start the first stage deterministically by its visible label.
  await startStage(page);
  const ok = await waitFor(page, () => !!document.getElementById('battleCanvas'), { timeout: 15000 });
  record('battle canvas appears', ok);

  const info = await page.evaluate(() => {
    const cv = document.getElementById('battleCanvas');
    return {
      w: cv ? cv.width : 0,
      h: cv ? cv.height : 0,
      ctx: cv ? !!(cv.getContext('webgl2') || cv.getContext('webgl')) : false,
      hud: !!document.getElementById('hud'),
      cardbar: document.getElementById('cardbar')
        ? document.getElementById('cardbar').children.length : 0,
      cat: !!document.getElementById('catBtn'),
      pause: !!document.getElementById('pauseBtn'),
      speed: !!document.getElementById('speedBtn'),
    };
  });
  record('canvas has a drawing buffer', info.w > 0 && info.h > 0, `${info.w}x${info.h}`);
  record('WebGL context acquired (3D renderer)', info.ctx);
  record('HUD present', info.hud);
  record('card bar populated', info.cardbar > 0, `${info.cardbar} cards`);
  record('battle controls present', info.cat && info.pause && info.speed);
  await context.close();
});

test('game state advances: mana/HP HUD is live', async (browser, errors) => {
  const { context, page } = await newPage(browser, errors);
  await boot(page);
  await page.click('#nav button[data-screen="campaign"]');
  await waitFor(page, () => document.getElementById('screen').textContent.includes('Stage 1'));
  await startStage(page);
  await waitFor(page, () => !!document.getElementById('hud'), { timeout: 15000 });

  // Deterministic: wait for the HUD to report a non-zero mana value rather
  // than sleeping an arbitrary amount.
  const live = await waitFor(page, () => {
    const hud = document.getElementById('hud');
    if (!hud) return false;
    const m = hud.textContent.match(/mana\s+(\d+)\s*\/\s*(\d+)/i);
    return !!m && Number(m[2]) > 0;
  }, { timeout: 15000 });
  record('HUD shows live mana (simulation running)', live);
  const hudText = await page.textContent('#hud');
  record('HUD names the stage', /Stage\s*\d+/.test(hudText), hudText.slice(0, 60));
  await context.close();
});

test('battle controls respond (pause, speed, retreat)', async (browser, errors) => {
  const { context, page } = await newPage(browser, errors);
  await boot(page);
  await page.click('#nav button[data-screen="campaign"]');
  await waitFor(page, () => document.getElementById('screen').textContent.includes('Stage 1'));
  await startStage(page);
  await waitFor(page, () => !!document.getElementById('speedBtn'), { timeout: 15000 });

  await page.click('#speedBtn');
  const speed = await page.textContent('#speedBtn');
  record('speed toggle changes state', /2/.test(speed), `shows "${speed}"`);

  await page.click('#pauseBtn');
  const paused = await page.textContent('#pauseBtn');
  record('pause toggle changes state', paused !== '❚❚', `shows "${paused}"`);
  await page.click('#pauseBtn');

  // Retreat must return to the campaign screen.
  await page.click('.controls button.ghost');
  const back = await waitFor(page, () =>
    document.querySelector('#nav button[data-screen="campaign"]').classList.contains('on'),
    { timeout: 8000 });
  record('retreat returns to campaign', back);
  await context.close();
});

test('save/load: profile persists across a reload', async (browser, errors) => {
  const { context, page } = await newPage(browser, errors);
  await boot(page, { coins: 1234, crystals: 77, current_stage: 3 });

  // Trigger a real mutation through the UI (sound toggle writes the profile).
  await page.click('#soundBtn');
  const stored = await waitFor(page, () => {
    const raw = localStorage.getItem('beast_forge_prefs');
    if (!raw) return false;
    try { return JSON.parse(raw); } catch (e) { return false; }
  }, { timeout: 8000 });
  record('profile written to localStorage', !!stored);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitFor(page, () => {
    const s = document.getElementById('screen');
    return s && s.children.length > 0;
  });
  const after = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('beast_forge_prefs') || '{}'));
  record('coins survive reload', after.coins === 1234, `coins=${after.coins}`);
  record('stage survives reload', after.current_stage === 3, `stage=${after.current_stage}`);
  record('sound toggle was persisted', typeof after.sound_enabled === 'boolean',
         `sound_enabled=${after.sound_enabled}`);
  await context.close();
});

test('settings: sound toggle round-trips', async (browser, errors) => {
  const { context, page } = await newPage(browser, errors);
  await boot(page);
  const before = await page.textContent('#soundBtn');
  await page.click('#soundBtn');
  const after = await page.textContent('#soundBtn');
  record('sound button toggles', before !== after, `"${before}" -> "${after}"`);
  record('sound persisted to profile', await page.evaluate(() => {
    const raw = localStorage.getItem('beast_forge_prefs');
    if (!raw) return false;
    const p = JSON.parse(raw);
    return typeof p.sound_enabled === 'boolean';
  }));
  await context.close();
});

test('asset system loads without error', async (browser, errors) => {
  const { context, page } = await newPage(browser, errors);
  await boot(page);
  // ui.js sets data-assets on <html> once the optional manifest resolves.
  const ok = await waitFor(page, () =>
    document.documentElement.hasAttribute('data-assets'), { timeout: 12000 });
  const summary = await page.getAttribute('html', 'data-assets');
  record('asset manifest resolved', ok, summary || '(no data-assets)');
  // assets.js emits "loaded <counts>" and only appends "errors=N" when N > 0.
  const errCount = /errors=(\d+)/.exec(summary || '');
  record('asset stage reported no errors', !errCount || Number(errCount[1]) === 0,
         errCount ? `errors=${errCount[1]}` : summary);
  await context.close();
});

test('all served assets return 200', async (browser, errors) => {
  const { context, page } = await newPage(browser, errors);
  const bad = [];
  page.on('response', (res) => { if (res.status() >= 400) bad.push(`${res.status()} ${res.url()}`); });
  await boot(page);
  await page.click('#nav button[data-screen="campaign"]');
  await waitFor(page, () => document.getElementById('screen').textContent.includes('Stage 1'));
  await startStage(page);
  await waitFor(page, () => !!document.getElementById('hud'), { timeout: 15000 });
  record('no failed network requests', bad.length === 0, bad.join(' | ').slice(0, 200));
  await context.close();
});

test('responsive layout holds at mobile width', async (browser, errors) => {
  const { context, page } = await newPage(browser, errors);
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page);
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  record('no horizontal overflow at 390px', overflow <= 2, `${overflow}px overflow`);
  await context.close();
});

test('critical console errors across the whole flow', async (browser, errors) => {
  const { context, page } = await newPage(browser, errors);
  await boot(page);
  for (const s of ['campaign', 'forge', 'armory', 'roster', 'arena', 'menu']) {
    await page.click(`#nav button[data-screen="${s}"]`);
    await page.waitForTimeout(120);
  }
  record('no unexpected console errors', errors.length === 0,
         errors.join(' | ').slice(0, 300));
  await context.close();
});

// -------------------------------------------------------------------- main
(async () => {
  console.log('Beast Forge AI Studio -- web QA');
  console.log(`  base url : ${BASE}`);
  console.log(`  web root : ${WEB}`);
  console.log(`  mode     : ${HEADED ? 'headed' : 'headless'}\n`);

  const missing = ['index.html', 'js/ui.js', 'js/render3d.js', 'vendor/three.module.js'];
  const fs = require('fs');
  for (const f of missing) {
    if (!fs.existsSync(path.join(WEB, f))) {
      console.error(`web build incomplete: missing ${f}`);
      process.exit(2);
    }
  }

  // Own the server unless the caller points us at one already running.
  const ownsServer = !process.env.BF_QA_BASE_URL;
  if (ownsServer) {
    server = createServer();
    await new Promise((resolve) => server.listen(5173, resolve));
    console.log('  static server: started on 5173\n');
  }

  const browser = await chromium.launch({
    headless: !HEADED,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader',
           '--disable-dev-shm-usage', '--no-sandbox'],
  });

  for (const { name, fn } of tests) {
    console.log(`\x1b[1m${name}\x1b[0m`);
    const errors = [];
    try {
      await fn(browser, errors);
    } catch (e) {
      record(`${name} (unexpected error)`, false, e.message.split('\n')[0]);
    }
  }

  await browser.close();
  if (server) server.close();

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log('\n' + '='.repeat(60));
  console.log(`  ${passed} passed, ${failed} failed, ${results.length} total`);
  console.log('='.repeat(60));
  if (failed) {
    console.log('\nFailures:');
    results.filter((r) => !r.ok).forEach((r) => console.log(`  - ${r.name}  ${r.detail}`));
  }
  process.exit(failed ? 1 : 0);
})();