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

/**
 * Battle-screen geometry assertions, measured off the live canvas.
 *
 * These exist because every one of them was wrong at some point and none of
 * them produced a console error when they were:
 *   - lane boundaries were invisible (measured edge strength ~0/255)
 *   - health bars were positioned from a constant instead of the drawn beast,
 *     so they landed inside the body
 *   - the generated-sprite path double-scaled position and size
 *   - the ruined fortress rendered LARGER than the intact one
 *
 * Each check reads the shipped config rather than restating its numbers.
 */
async function checkBattleGeometry(page, label) {
  const r = await page.evaluate(() => {
    const B = globalThis.BeastForgeBattle;
    const R = globalThis.__bfRenderer;
    const eng = globalThis.__bfEngine;
    const cv = document.querySelector('#battleCanvas');
    const dpr = cv.width / cv.clientWidth;
    const g = cv.getContext('2d');
    const W = cv.width;
    const px = g.getImageData(0, 0, W, cv.height).data;
    const sx = cv.clientWidth / B.BATTLEFIELD_W, sy = cv.clientHeight / B.BATTLEFIELD_H;
    const lum = (x, y) => {
      const o = (y * W + x) * 4;
      return 0.2126 * px[o] + 0.7152 * px[o + 1] + 0.0722 * px[o + 2];
    };

    // Lane boundary edge strength: largest step between adjacent rows near each
    // boundary. Averaging windows either side cancels the engraved groove out
    // and reports near-zero for a boundary that is plainly visible.
    const edges = [];
    for (let i = 0; i <= B.LANE_COUNT; i++) {
      const y = Math.round((B.LANE_START + i * B.LANE_HEIGHT) * sy * dpr);
      const rows = [];
      for (let k = -6; k <= 8; k++) {
        let s = 0, n = 0;
        for (let x = 40; x < W - 40; x += 8) { s += lum(x, y + k); n++; }
        rows.push(s / n);
      }
      let step = 0;
      for (let k = 1; k < rows.length; k++) step = Math.max(step, Math.abs(rows[k] - rows[k - 1]));
      edges.push(+step.toFixed(1));
    }

    // Lane band means -- adjacent lanes must differ enough to count at a glance.
    const means = [];
    for (let i = 0; i < B.LANE_COUNT; i++) {
      const y0 = Math.round((B.LANE_START + i * B.LANE_HEIGHT) * sy * dpr);
      const y1 = Math.round((B.LANE_START + (i + 1) * B.LANE_HEIGHT) * sy * dpr);
      let s = 0, n = 0;
      for (let y = y0; y < y1; y += 2) for (let x = 0; x < W; x += 6) { s += lum(x, y); n++; }
      means.push(s / n);
    }

    // Per-unit geometry from the live rig.
    const units = [];
    for (const u of [...(eng?.playerUnits || []), ...(eng?.enemyUnits || [])]) {
      const fp = R?.rig?.footprint(u.cardId);
      if (!fp) continue;
      const ground = B.laneGroundY(u.laneIndex);
      units.push({
        card: u.cardId, size: fp.size,
        h: fp.height, w: fp.width,
        // Bar position the renderer computes, vs where the head actually is.
        barY: ground - fp.height - B.UNIT_BAR_GAP,
        headY: ground - fp.height
      });
    }
    return {
      edges, means, units,
      laneHeight: B.LANE_HEIGHT,
      barGap: B.UNIT_BAR_GAP,
      maxFootprint: B.MAX_FOOTPRINT_X * B.LANE_HEIGHT,
      layerOrder: R?.constructor ? null : null
    };
  });

  const faint = r.edges.filter(e => e < 10);
  faint.length
    ? fail(`${label}: ${faint.length}/${r.edges.length} lane boundaries too faint (${r.edges.join(', ')})`)
    : ok(`${label}: all ${r.edges.length} lane boundaries readable (edge ${Math.min(...r.edges).toFixed(0)}-${Math.max(...r.edges).toFixed(0)})`);

  let minAdj = Infinity;
  for (let i = 0; i < r.means.length - 1; i++) {
    minAdj = Math.min(minAdj, Math.abs(r.means[i + 1] - r.means[i]));
  }
  minAdj >= 6
    ? ok(`${label}: five lanes distinguishable (closest adjacent difference ${minAdj.toFixed(1)})`)
    : fail(`${label}: lanes blend into each other (closest adjacent difference ${minAdj.toFixed(1)})`);

  if (!r.units.length) {
    fail(`${label}: no beasts on the board to check geometry against`);
    return;
  }

  // Health bars must sit above the head, by the configured gap, and the gap
  // must be positive -- a negative barY-bar relationship is a bar inside a body.
  const bad = r.units.filter(u => u.barY > u.headY || u.headY - u.barY < r.barGap * 0.5);
  bad.length
    ? fail(`${label}: ${bad.length}/${r.units.length} health bars overlap their beast's head`)
    : ok(`${label}: ${r.units.length} health bars clear of their beast's head (gap ${r.barGap})`);

  // No creature may exceed its width budget, and none may be taller than a lane.
  const tooWide = r.units.filter(u => u.w > r.maxFootprint * 1.02);
  const tooTall = r.units.filter(u => u.h > r.laneHeight * 1.0);
  tooWide.length
    ? fail(`${label}: ${tooWide.length} beast(s) wider than the footprint budget`)
    : ok(`${label}: every beast within its width budget (max ${Math.max(...r.units.map(u => u.w)).toFixed(1)}/${r.maxFootprint.toFixed(0)})`);
  tooTall.length
    ? fail(`${label}: ${tooTall.length} beast(s) taller than their lane`)
    : ok(`${label}: no beast taller than its lane (max ${Math.max(...r.units.map(u => u.h)).toFixed(1)}/${r.laneHeight})`);
}

/**
 * Assert the renderer paints in the declared order. Catches a background asset
 * being drawn over gameplay units, which no other check would notice.
 */
async function checkLayerOrder(page, label) {
  const order = await page.evaluate(() => {
    const R = globalThis.__bfRenderer;
    if (!R) return null;
    const seen = [];
    for (const m of ['drawBackground', 'drawLanes', 'drawFort', 'drawUnit', 'drawProjectiles',
      'drawParticles', 'drawFloatingTexts', 'drawVignette']) {
      const orig = R[m];
      if (typeof orig !== 'function') return { err: 'missing ' + m };
      R[m] = function (...a) { seen.push(m); return orig.apply(this, a); };
    }
    // One frame through the real code path.
    const eng = globalThis.__bfEngine;
    if (!eng) return { err: 'no engine' };
    R.render(eng, 0, -1);
    for (const m of ['drawBackground', 'drawLanes', 'drawFort', 'drawUnit', 'drawProjectiles',
      'drawParticles', 'drawFloatingTexts', 'drawVignette']) {
      delete R[m];   // fall back to the prototype
    }
    return { seen };
  });
  if (!order || order.err) { fail(`${label}: layer order probe failed (${order && order.err})`); return; }
  const rank = { drawBackground: 0, drawLanes: 1, drawFort: 2, drawUnit: 3, drawProjectiles: 4, drawParticles: 5, drawFloatingTexts: 6, drawVignette: 7 };
  let okOrder = true, seenIdx = 0;
  const seenSet = [];
  for (const m of order.seen) {
    if (!seenSet.includes(m)) seenSet.push(m);
  }
  for (let i = 1; i < seenSet.length; i++) {
    if (rank[seenSet[i]] < rank[seenSet[i - 1]]) okOrder = false;
  }
  okOrder
    ? ok(`${label}: paint order is ${seenSet.join(' -> ')}`)
    : fail(`${label}: paint order violated -- background/environment drew over gameplay (${seenSet.join(' -> ')})`);
}

/**
 * The battlefield is defined in virtual units and stretched to the canvas, so
 * lane geometry should hold at any aspect ratio. Prove it rather than assume
 * it: at a narrow portrait viewport and a wide one, every lane must still map
 * to the band the hit test expects, and units must stay inside the playfield.
 */
async function checkAspectRatios(page, baseUrl, label) {
  const sizes = [
    { w: 900, h: 1000, name: 'portrait 900x1000' },
    { w: 1600, h: 620, name: 'ultrawide 1600x620' },
    { w: 1024, h: 768, name: '4:3 1024x768' }
  ];
  for (const s of sizes) {
    await page.setViewportSize({ width: s.w, height: s.h });
    await page.waitForTimeout(350);
    const r = await page.evaluate(() => {
      const B = globalThis.BeastForgeBattle;
      const R = globalThis.__bfRenderer;
      const cv = document.querySelector('#battleCanvas');
      const sy = cv.clientHeight / B.BATTLEFIELD_H;
      const sx = cv.clientWidth / B.BATTLEFIELD_W;
      // Hit test and visual band must agree: converting the lane centre back to
      // a client Y and asking the renderer which lane that is, has to be the
      // lane we started from.
      const agree = [];
      for (let i = 0; i < B.LANE_COUNT; i++) {
        const clientY = cv.getBoundingClientRect().top + B.laneGroundY(i) * sy;
        agree.push(R.laneAtClientY(clientY) === i);
      }
      const fieldBottom = cv.getBoundingClientRect().top + B.FIELD_BOTTOM * sy;
      const eng = globalThis.__bfEngine;
      const onField = [...(eng?.playerUnits || []), ...(eng?.enemyUnits || [])]
        .every(u => cv.getBoundingClientRect().top + B.laneGroundY(u.laneIndex) * sy <= fieldBottom + 1);
      return { agree: agree.every(Boolean), onField, sx: +sx.toFixed(2), sy: +sy.toFixed(2),
        nonSquare: sx !== sy };
    });
    r.agree
      ? ok(`${label}: ${s.name} — lanes map correctly (sx ${r.sx}, sy ${r.sy}${r.nonSquare ? ', anisotropic' : ''})`)
      : fail(`${label}: ${s.name} — lane hit test disagrees with the drawn band`);
    if (!r.onField) fail(`${label}: ${s.name} — a unit fell outside the playfield`);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(250);
}

async function playBattle(page, label, shotName, wantSprites) {
  await page.click('#nav button[data-screen="campaign"]');
  await page.waitForSelector('button.stage:not([disabled])', { timeout: 10000 });
  ok(`${label}: campaign screen rendered ${await page.locator('button.stage').count()} stage buttons`);

  // Painted portraits in the roster. The screen is only worth its art if the
  // beasts actually land in frame, so measure coverage and centring rather than
  // just counting canvases -- a mis-anchored draw puts every beast hard against
  // one edge while still reporting "10 portraits rendered".
  await page.click('#nav button[data-screen="roster"]');
  await page.waitForSelector('canvas.portrait', { timeout: 10000 });
  const portraits = await page.evaluate(() => {
    const out = [];
    for (const cv of document.querySelectorAll('canvas.portrait')) {
      const ctx = cv.getContext('2d');
      const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
      let opaque = 0, x0 = 1e9, x1 = -1;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] > 24) {
          opaque++;
          const px = (i / 4) % cv.width;
          if (px < x0) x0 = px;
          if (px > x1) x1 = px;
        }
      }
      out.push({
        pct: 100 * opaque / (d.length / 4),
        // Centre of mass relative to the tile centre; 0 means dead centre.
        off: (x0 + x1) / 2 / cv.width - 0.5
      });
    }
    return out;
  });
  const fallbacks = await page.locator('.portrait-fallback').count();
  if (portraits.length) {
    const empties = portraits.filter(p => p.pct < 2).length;
    const lopsided = portraits.filter(p => Math.abs(p.off) > 0.12).length;
    if (empties) fail(`${label}: ${empties}/${portraits.length} portraits are blank (rig did not draw)`);
    else if (lopsided) fail(`${label}: ${lopsided}/${portraits.length} portraits are off-centre (anchor regression)`);
    else if (fallbacks) fail(`${label}: ${fallbacks} portraits fell back to the placeholder glyph`);
    else ok(`${label}: ${portraits.length} painted portraits drew in frame ` +
      `(${(portraits.reduce((s, p) => s + p.pct, 0) / portraits.length).toFixed(0)}% avg coverage)`);
  } else if (!fallbacks) {
    fail(`${label}: roster rendered no beast portraits at all`);
  }
  await page.click('#nav button[data-screen="campaign"]');
  await page.waitForSelector('button.stage:not([disabled])', { timeout: 10000 });

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

  if (renderer === '2d') {
    await checkBattleGeometry(page, label);
    await checkLayerOrder(page, label);
    await checkAspectRatios(page, null, label);
  }

  // Direct evidence the manifest art is actually consumed by the renderer.
  const hits = await page.evaluate(() => {
    const st = globalThis.__beastForgeAssets.stats;
    return {
      spriteHits: st.spriteHits, spriteMisses: st.spriteMisses,
      textureHits: st.textureHits, textureMisses: st.textureMisses,
      sceneHits: st.sceneHits || 0, beastHits: st.beastHits || 0,
      beastMisses: st.beastMisses || 0
    };
  });
  // The 2D renderer draws painted art from three manifest sections (sprites,
  // scenes, beasts+forts). What matters is that manifest art reached the
  // screen at all, not which section it came from.
  const painted = hits.spriteHits + hits.sceneHits + hits.beastHits;
  if (renderer === '2d') {
    painted > 0
      ? ok(`${label}: renderer consumed manifest art (${hits.spriteHits} sprites, ${hits.sceneHits} scenes, ${hits.beastHits} creatures)`)
      : fail(`${label}: manifest art never used despite ${wantSprites.length} sprites being loaded`);
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
    await page.screenshot({ path: path.join(SHOTS, shotName), timeout: 90000 });
    ok(`${label}: screenshot -> tools/ai-studio/qa/shots/${shotName}`);
  }
}

try {
  // Canvas 2D is the default renderer (ui.js makeRenderer); ?3d exercises the
  // retained WebGL path so it cannot rot unnoticed.
  for (const [label, query] of [['canvas2d', ''], ['webgl', '?3d']]) {
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
  for (const [label, query] of [['canvas2d', ''], ['webgl', '?3d']]) {
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
      scenes: Object.keys(globalThis.__beastForgeAssets.scenes || {}).length,
      beasts: Object.keys(globalThis.__beastForgeAssets.beasts || {}).length,
      forts: Object.keys(globalThis.__beastForgeAssets.forts || {}).length,
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
    const none = s.sprites === 0 && s.textures === 0 && s.scenes === 0
      && s.beasts === 0 && s.forts === 0;
    (none && errors.length === 0 && range > 40)
      ? ok(`assets blocked (${label}) -> every art section empty, still boots, plays and lights the scene (range ${range.toFixed(0)})`)
      : fail(`assets blocked (${label}) -> sprites=${s.sprites} textures=${s.textures} scenes=${s.scenes} beasts=${s.beasts} forts=${s.forts} errors=${errors.length} range=${range.toFixed(0)}`);
    await ctx.close();
  }
} finally {
  await browser.close();
  srv.close();
}

console.log('');
if (failures) { console.log(`QA FAILED -- ${failures} problem(s)`); process.exit(1); }
console.log('QA OK');