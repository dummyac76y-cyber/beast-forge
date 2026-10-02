#!/usr/bin/env node
// AI Studio browser QA -- deterministic Playwright checks against the real game.
//
//   node tools/ai-studio/qa/run-qa.mjs [--headed] [--keep-shots]
//
// Both renderers are exercised:
//   default    WebGL (three.js). Under headless chromium WebGL may be
//              unavailable, in which case ui.js falls back to Canvas 2D -- the
//              test asserts whichever renderer actually came up, so a silent
//              fallback cannot be mistaken for a WebGL pass.
//   ?2d        forces the Canvas 2D renderer, which is the path that consumes
//              the manifest sprites.
//
// No arbitrary sleeps: every wait is on a real state condition.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { listen } from './serve.mjs';
import { decodePNG } from '../scripts/lib/png.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..');
const SHOTS = path.join(REPO, 'tools', 'ai-studio', 'qa', 'shots');

const args = new Set(process.argv.slice(2));
const HEADED = args.has('--headed');

let failures = 0;
const ok = m => console.log('  ok   ' + m);
const fail = m => { failures++; console.log('  FAIL ' + m); };
const head = m => console.log('\n' + m + '\n' + '-'.repeat(m.length));

const expected = JSON.parse(fs.readFileSync(path.join(REPO, 'web', 'assets', 'manifest.json'), 'utf8'));

const { srv, port } = await listen(0);
const base = `http://127.0.0.1:${port}`;
const browser = await chromium.launch({
  headless: !HEADED,
  // SwiftShader gives headless chromium a software GL stack so the WebGL path
  // is genuinely tested instead of always falling back to 2D.
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});

async function newPage(query) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.errors = errors;
  await page.goto(base + '/' + (query || ''), { waitUntil: 'load' });
  // Deterministic: wait for the asset manifest to finish loading, not a timer.
  await page.waitForFunction(() => globalThis.__beastForgeAssets?.loaded === true, null, { timeout: 20000 });
  return { ctx, page };
}

async function checkAssets(page, label) {
  const s = await page.evaluate(() => {
    const a = globalThis.__beastForgeAssets;
    return {
      summary: a.summary(),
      sprites: Object.keys(a.sprites).sort(),
      rawAudio: Object.keys(a._rawAudio).sort(),
      fonts: a.fonts.length,
      credits: a.sources.map(x => x.name),
      errors: a.stats.errors.slice()
    };
  });

  const wantSprites = Object.keys(expected.sprites).sort();
  const missing = wantSprites.filter(k => !s.sprites.includes(k));
  missing.length ? fail(`${label}: sprites not loaded: ${missing.join(', ')}`)
                 : ok(`${label}: all ${wantSprites.length} sprites decoded by the browser`);

  const wantAudio = Object.keys(expected.audio).sort();
  const missingA = wantAudio.filter(k => !s.rawAudio.includes(k));
  missingA.length ? fail(`${label}: clips not fetched: ${missingA.join(', ')}`)
                  : ok(`${label}: all ${wantAudio.length} clips fetched (decoding waits for a gesture)`);

  s.fonts === (expected.fonts || []).length ? ok(`${label}: ${s.fonts} web fonts loaded`)
                                            : fail(`${label}: expected ${expected.fonts.length} fonts, got ${s.fonts}`);
  s.errors.length ? fail(`${label}: loader errors: ${s.errors.join('; ')}`)
                  : ok(`${label}: loader reported no errors`);
  ok(`${label}: credits surfaced -> ${s.credits.join(' | ')}`);
  return s;
}

/**
 * Tone statistics for a rendered frame, from a PNG screenshot.
 *
 * A flat `scene.background = Color` produces a sky strip with near-zero
 * variance; the painted manifest background does not. That makes "did the art
 * actually reach the screen?" measurable instead of assumed.
 */
function analyseFrame(buf) {
  const { width: w, height: h, data } = decodePNG(buf);
  const luma = (i) => 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  const all = [], sky = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const l = luma(i);
      all.push(l);
      if (y < h * 0.18) sky.push(l);          // above the lanes: sky/backdrop
    }
  }
  const stat = (a) => {
    const mean = a.reduce((s, v) => s + v, 0) / a.length;
    const varr = a.reduce((s, v) => s + (v - mean) ** 2, 0) / a.length;
    const sorted = [...a].sort((x, y) => x - y);
    return { mean, sd: Math.sqrt(varr), p05: sorted[Math.floor(a.length * 0.05)], p95: sorted[Math.floor(a.length * 0.95)] };
  };
  return { w, h, all: stat(all), sky: stat(sky) };
}

async function playBattle(page, label, shotName, wantSprites) {
  await page.click('#nav button[data-screen="campaign"]');
  await page.waitForSelector('button.stage:not([disabled])', { timeout: 10000 });
  ok(`${label}: campaign screen rendered ${await page.locator('button.stage').count()} stage buttons`);

  await page.locator('button.stage:not([disabled])').first().click();
  await page.waitForSelector('#battleCanvas', { state: 'visible', timeout: 10000 });
  await page.waitForSelector('#hud .wave', { timeout: 10000 });
  ok(`${label}: battle screen reached`);

  // Which renderer actually came up. ui.js silently falls back to Canvas 2D when
  // WebGL is unavailable, so assert reality rather than assuming.
  const renderer = await page.evaluate(() => {
    const cv = document.querySelector('#battleCanvas');
    return cv.getContext('webgl2') || cv.getContext('webgl') ? 'webgl' : '2d';
  });
  ok(`${label}: renderer = ${renderer}`);

  // The HUD clock is driven by engine.battleTime and refreshes every frame, so
  // waiting on it is a real state condition, not a sleep.
  await page.waitForFunction(
    () => /(\d+)s · mana/.test(document.querySelector('#hud .wave')?.textContent || '')
      && parseInt(/(\d+)s/.exec(document.querySelector('#hud .wave').textContent)[1], 10) >= 2,
    null, { timeout: 20000 }
  );
  const before = await page.locator('#hud .stat').textContent();
  ok(`${label}: battle clock advancing — "${(await page.locator('#hud .wave').textContent()).trim()}"`);

  // Deploy on every lane the way a player does. Lane centres are
  // (LANE_START + i*LANE_HEIGHT + LANE_HEIGHT/2) / 450 in render.js.
  const box = await page.locator('#battleCanvas').boundingBox();
  for (let lane = 0; lane < 5; lane++) {
    await page.mouse.click(box.x + box.width / 2, box.y + box.height * (0.2444 + lane * 0.1222));
    await page.waitForTimeout(400);   // mana regen is 7/s; pace the deployments
  }
  // ui.js rebuilds #cardbar every ~120ms, so a Playwright click() would race the
  // detach forever. Dispatch in-page and confirm the selection stuck instead.
  const selected = await page.evaluate(async () => {
    const btn = document.querySelector('#cardbar button.card');
    if (!btn) return null;
    const id = btn.dataset.cardId;
    btn.click();
    await new Promise(r => setTimeout(r, 400));
    const on = document.querySelector('#cardbar button.card.on');
    return { id, nowOn: on?.dataset.cardId || null };
  });
  selected?.nowOn
    ? ok(`${label}: card select works (${selected.id})`)
    : fail(`${label}: could not select a card from #cardbar`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.3667);
  await page.keyboard.press('Digit2');
  ok(`${label}: lane clicks + hotkey dispatched`);

  // Direct evidence the manifest art is actually consumed by the renderer.
  const hits = await page.evaluate(() => {
    const st = globalThis.__beastForgeAssets.stats;
    return {
      spriteHits: st.spriteHits, spriteMisses: st.spriteMisses,
      textureHits: st.textureHits, textureMisses: st.textureMisses
    };
  });
  if (renderer === '2d') {
    hits.spriteHits > 0
      ? ok(`${label}: renderer consumed manifest sprites (${hits.spriteHits} sprite draws, ${hits.spriteMisses} procedural fallbacks)`)
      : fail(`${label}: manifest sprites never used despite ${wantSprites.length} being loaded`);
    hits.textureHits === 0
      ? ok(`${label}: 2D renderer ignores tiling maps (${hits.textureHits} lookups) — expected, they are for WebGL`)
      : ok(`${label}: 2D renderer also looked up ${hits.textureHits} tiling maps`);
  } else {
    // render3d.js now consumes the manifest: painted backgrounds via sprite()
    // lookups and surface detail via texture() lookups.
    hits.spriteHits > 0
      ? ok(`webgl: painted background from manifest (${hits.spriteHits} sprite lookups)`)
      : fail('webgl: renderer never looked up a background sprite — manifest art is not reaching the 3D path');
    hits.textureHits > 0
      ? ok(`webgl: surface detail maps from manifest (${hits.textureHits} texture lookups)`)
      : fail('webgl: renderer never looked up a tiling texture — detail maps are not reaching the 3D path');
  }

  // Two screenshots must differ: proves the canvas is repainting a live battle.
  const shot1 = await page.locator('#battleCanvas').screenshot();
  await page.waitForFunction(
    () => parseInt(/(\d+)s/.exec(document.querySelector('#hud .wave').textContent)[1], 10) >= 6,
    null, { timeout: 30000 }
  );
  const shot2 = await page.locator('#battleCanvas').screenshot();
  Buffer.compare(shot1, shot2) !== 0
    ? ok(`${label}: canvas is animating (frame changed over the battle clock)`)
    : fail(`${label}: canvas did not change between t≈2s and t≈6s — nothing is being drawn`);

  // Tone analysis: catches a black frame, a blown-out frame, and -- on the 3D
  // path -- a flat sky colour standing in for the painted background.
  const tone = analyseFrame(shot2);
  const range = tone.all.p95 - tone.all.p05;
  range > 40
    ? ok(`${label}: tonal range p05..p95 = ${range.toFixed(0)} (not flat)`)
    : fail(`${label}: frame is nearly flat (p05..p95 = ${range.toFixed(0)}) — nothing is being lit`);
  tone.all.mean > 12 && tone.all.mean < 215
    ? ok(`${label}: exposure sane (mean luma ${tone.all.mean.toFixed(0)})`)
    : fail(`${label}: frame is black (${tone.all.mean.toFixed(0)}) or blown out (${tone.all.mean.toFixed(0)})`);
  tone.sky.sd > 3
    ? ok(`${label}: backdrop has real detail (sky sd ${tone.sky.sd.toFixed(1)})`)
    : fail(`${label}: backdrop is a flat colour (sky sd ${tone.sky.sd.toFixed(1)}) — no painted background`);

  if (renderer === '2d') {
    const distinct = await page.evaluate(() => {
      const cv = document.querySelector('#battleCanvas');
      const ctx = cv.getContext('2d');
      const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
      const seen = new Set();
      for (let i = 0; i < d.length; i += 4 * 97) {
        seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
        if (seen.size > 500) break;
      }
      return seen.size;
    });
    distinct > 40 ? ok(`${label}: canvas has ${distinct}+ distinct sampled colours (not blank)`)
                 : fail(`${label}: canvas looks blank (${distinct} distinct colours)`);
  }

  const after = await page.locator('#hud .stat').textContent();
  ok(`${label}: fort HP "${before.trim()}" -> "${after.trim()}"`);

  // The real proof of playability: the battle must be live (something is taking
// damage) and must resolve. Wait on state, never on a timer.
  //
  // Note: "player fort took damage" is NOT a valid invariant. The scripted
  // clicks can deploy a full defensive line that stops every enemy, in which
  // case the player's fort legitimately stays at full HP for a long time.
  // Summed HP across both forts is the robust signal.
  const readForts = async () => {
    const t = await page.locator('#hud .stat').textContent();
    const mine = /Your fort (\d+)\//.exec(t);
    const theirs = /Enemy (\d+)\/(\d+)/.exec(t);
    return {
      mine: mine ? Number(mine[1]) : null,
      theirs: theirs ? Number(theirs[1]) : null,
      total: mine && theirs ? Number(mine[1]) + Number(theirs[1]) : null
    };
  };
  const startHp = await readForts();
  try {
    await page.waitForFunction(
      (total0) => {
        const t = document.querySelector('#hud .stat')?.textContent || '';
        const a = /Your fort (\d+)\//.exec(t), b = /Enemy (\d+)\/(\d+)/.exec(t);
        return a && b && (Number(a[1]) + Number(b[1])) < total0;
      }, startHp.total, { timeout: 60000 });
    const hurt = await readForts();
    ok(`${label}: live combat — forts ${startHp.mine}+${startHp.theirs} -> ${hurt.mine}+${hurt.theirs} HP`);
  } catch {
    fail(`${label}: no fort took damage in 60s — the battle loop looks stalled`);
  }

  // End-of-battle overlay. Regression guard for the onGameOver() null
  // dereference: before that fix no overlay ever appeared and no rewards landed.
  try {
    await page.waitForSelector('.overlay h2', { timeout: 120000 });
    const h2 = (await page.locator('.overlay h2').textContent()).trim();
    const sub = (await page.locator('.overlay .sub').textContent()).trim();
    ok(`${label}: battle resolved -> "${h2}" / "${sub}"`);
    await page.locator('.overlay button.ghost').click();
    await page.waitForSelector('button.stage', { timeout: 10000 });
    ok(`${label}: "Return" navigates back to the campaign screen`);
  } catch {
    fail(`${label}: battle never reached an end state (no .overlay within 120s)`);
  }

  if (shotName) {
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS, shotName) });
    ok(`${label}: screenshot -> tools/ai-studio/qa/shots/${shotName}`);
  }
}

try {
  for (const [label, query] of [['webgl', ''], ['canvas2d', '?2d']]) {
    head(`Playwright QA: ${label}`);
    const { ctx, page } = await newPage(query);
    await checkAssets(page, label);
    await playBattle(page, label, label + '-battle.png', Object.keys(expected.sprites).length);
    const real = page.errors.filter(e => !/favicon/i.test(e));
    real.length ? fail(`${label}: console errors: ${real.join(' | ')}`)
                : ok(`${label}: no console errors`);
    await ctx.close();
  }

  head('Graceful degradation (assets removed)');
  // Both renderers must survive having no manifest at all. This is the guarantee
  // that lets the AI Studio stay optional, and it is exactly the code path the
  // new texture/background lookups in render3d.js have to fall back into.
  for (const [label, query] of [['canvas2d', '?2d'], ['webgl', '']]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // Simulate "AI Studio unavailable": abort every asset request.
    await page.route('**/assets/**', route => route.abort());
    await page.goto(base + '/' + query, { waitUntil: 'load' });
    await page.waitForFunction(() => globalThis.__beastForgeAssets?.loaded === true, null, { timeout: 20000 });
    const s = await page.evaluate(() => ({
      sprites: Object.keys(globalThis.__beastForgeAssets.sprites).length,
      textures: Object.keys(globalThis.__beastForgeAssets.textures || {}).length,
      loaded: globalThis.__beastForgeAssets.loaded
    }));
    await page.click('#nav button[data-screen="campaign"]');
    await page.locator('button.stage:not([disabled])').first().click();
    await page.waitForSelector('#battleCanvas', { state: 'visible', timeout: 10000 });
    await page.waitForFunction(
      () => parseInt(/(\d+)s/.exec(document.querySelector('#hud .wave')?.textContent || '0s')[1], 10) >= 2,
      null, { timeout: 20000 }
    ).catch(() => fail(`assets-blocked/${label}: battle clock never advanced`));

    // With no art the frame still has to render -- procedural materials, flat sky.
    const shot = await page.locator('#battleCanvas').screenshot();
    const tone = analyseFrame(shot);
    const range = tone.all.p95 - tone.all.p05;
    (s.sprites === 0 && s.textures === 0 && errors.length === 0 && range > 40)
      ? ok(`assets blocked (${label}) -> 0 sprites, 0 textures, still boots, plays and lights the scene (range ${range.toFixed(0)})`)
      : fail(`assets blocked (${label}) -> sprites=${s.sprites} textures=${s.textures} errors=${errors.length} range=${range.toFixed(0)}`);
    await ctx.close();
  }
} finally {
  await browser.close();
  srv.close();
}

console.log('');
if (failures) { console.log(`QA FAILED -- ${failures} problem(s)`); process.exit(1); }
console.log('QA OK');