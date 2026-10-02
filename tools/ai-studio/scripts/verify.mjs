#!/usr/bin/env node
// ai-studio verify -- offline checks that need no browser.
//
//   node tools/ai-studio/scripts/verify.mjs
//
// Three layers:
//   1. Contract  -- re-derives the sprite/audio keys the GAME looks up, straight
//                   from web/js/*.js, and fails if the manifest does not cover
//                   them. This is what stops the manifest drifting.
//   2. Integrity -- every manifest entry exists, decodes as PNG/WAV, and the PNG
//                   dimensions match the declared frameW/frameH.
//   3. Behaviour -- runs the real BattleEngine headlessly to a win and a loss.
//
// Exits non-zero on the first failing layer.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { readPNGHeader } from './lib/png.mjs';
import { readWAVHeader } from './lib/wav.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..');
const WEB = path.join(REPO, 'web');
const JS = path.join(WEB, 'js');
const require_ = createRequire(import.meta.url);

let failures = 0;
const ok = (msg) => console.log('  ok   ' + msg);
const fail = (msg) => { failures++; console.log('  FAIL ' + msg); };
const head = (msg) => console.log('\n' + msg + '\n' + '-'.repeat(msg.length));

const read = p => fs.readFileSync(p, 'utf8');
const JS_FILES = ['render.js', 'render3d.js', 'ui.js', 'engine.js', 'audio.js', 'assets.js', 'models.js', 'catalog.js']
  .map(f => ({ f, src: read(path.join(JS, f)) }));

// ------------------------------------------------------- 1. asset contract
head('1. Asset contract (derived from game source)');

const all = JS_FILES.map(j => j.src).join('\n');

// Sprite keys the renderer builds at runtime.
const races = [...new Set([...read(path.join(JS, 'models.js')).matchAll(/'([A-Z]+)'/g)]
  .map(m => m[1]).filter(r => ['BIPED', 'QUADRUPED', 'DRAGON'].includes(r)))];
const wantSprites = new Set([
  ...races.map(r => 'unit_' + r.toLowerCase()),
  'fort_player', 'fort_enemy'
]);

// render.js THEMES keys + the arena theme ui.js requests.
const themeBlock = read(path.join(JS, 'render.js')).match(/const THEMES = \{([\s\S]*?)\n\};/);
const wantBg = new Set([...themeBlock[1].matchAll(/^\s*([a-z]+):\s*\{/gm)].map(m => 'bg_' + m[1]));

// Audio keys: the CUES table plus every play('literal') call site.
const cueBlock = read(path.join(JS, 'audio.js')).match(/const CUES = \{([\s\S]*?)\n\};/);
const wantAudio = new Set([...cueBlock[1].matchAll(/^\s*([a-z_]+):\s*\[/gm)].map(m => m[1]));
for (const m of all.matchAll(/\.play\(\s*'([a-z_]+)'/g)) wantAudio.add(m[1]);
for (const m of all.matchAll(/\]\[element\]/g)) { /* covered by CUES */ }
for (const m of all.matchAll(/\{\s*FIRE: '([a-z_]+)'[\s\S]*?\}/g)) {
  for (const e of m[0].matchAll(/'[a-z_]+'/g)) wantAudio.add(e[0].slice(1, -1));
}
for (const m of all.matchAll(/\{ BIPED: '([a-z_]+)'[\s\S]*?\}/g)) {
  for (const e of m[0].matchAll(/'[a-z_]+'/g)) wantAudio.add(e[0].slice(1, -1));
}
for (const m of all.matchAll(/\{ BIPED: '([a-z_]+)', QUADRUPED: '([a-z_]+)', DRAGON: '([a-z_]+)' \}/g)) {
  wantAudio.add(m[1]); wantAudio.add(m[2]); wantAudio.add(m[3]);
}

console.log(`  game wants ${wantSprites.size + wantBg.size} sprite keys, ${wantAudio.size} audio keys`);

const manifestPath = path.join(WEB, 'assets', 'manifest.json');
if (!fs.existsSync(manifestPath)) {
  console.log('  (no manifest -- game uses procedural fallbacks; nothing to verify)');
} else {
  const m = JSON.parse(read(manifestPath));
  const have = new Set([...Object.keys(m.sprites || {})]);
  for (const k of [...wantSprites, ...wantBg]) {
    have.has(k) ? ok(`sprite ${k}`) : fail(`sprite ${k} is looked up by the game but missing from the manifest`);
  }
  for (const k of [...wantAudio].sort()) {
    (m.audio || {})[k] ? ok(`audio ${k}`) : fail(`audio ${k} is fired by the game but missing from the manifest`);
  }
  const extra = [...have].filter(k => !wantSprites.has(k) && !wantBg.has(k));
  if (extra.length) console.log(`  note manifest has extra sprite keys the game does not read: ${extra.join(', ')}`);
}

// --------------------------------------------------------- 2. file integrity
head('2. File integrity');
if (fs.existsSync(manifestPath)) {
  const m = JSON.parse(read(manifestPath));
  let bytes = 0;
  for (const [key, s] of Object.entries(m.sprites || {})) {
    const f = path.join(WEB, 'assets', s.file);
    if (!fs.existsSync(f)) { fail(`${key}: ${s.file} missing`); continue; }
    const buf = fs.readFileSync(f);
    bytes += buf.length;
    const h = readPNGHeader(buf);
    if (!h) { fail(`${key}: ${s.file} is not a valid PNG`); continue; }
    if (h.width !== s.frameW || h.height !== s.frameH) {
      fail(`${key}: PNG is ${h.width}x${h.height} but manifest declares ${s.frameW}x${s.frameH}`);
    } else ok(`${key} ${h.width}x${h.height} png`);
  }
  for (const [key, a] of Object.entries(m.audio || {})) {
    const f = path.join(WEB, 'assets', a.file);
    if (!fs.existsSync(f)) { fail(`${key}: ${a.file} missing`); continue; }
    const buf = fs.readFileSync(f);
    bytes += buf.length;
    const h = readWAVHeader(buf);
    if (!h) { fail(`${key}: ${a.file} is not a valid WAV`); continue; }
    if (!(h.durationSec > 0.01 && h.durationSec < 3)) {
      fail(`${key}: clip duration ${h.durationSec.toFixed(3)}s out of expected range`);
    } else if (h.channels !== 1) fail(`${key}: expected mono, got ${h.channels} channels`);
    else ok(`${key} ${h.durationSec.toFixed(3)}s ${h.sampleRate}Hz`);
  }
  for (const fnt of m.fonts || []) {
    const f = path.join(WEB, 'assets', fnt.file);
    fs.existsSync(f) ? ok(`font ${fnt.family} ${fnt.weight}`) : fail(`font ${fnt.file} missing`);
  }
  console.log(`  ${(bytes / 1024).toFixed(1)} KiB of binary assets`);

  // Nothing heavy or secret-shaped should ever be committed.
  const forbidden = /\.(safetensors|ckpt|pth|pt|gguf|onnx)$/i;
  const stack = [path.join(WEB, 'assets')];
  let bad = 0;
  while (stack.length) {
    const dir = stack.pop();
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { stack.push(p); continue; }
      if (forbidden.test(e.name)) { fail(`model weight committed: ${path.relative(REPO, p)}`); bad++; }
    }
  }
  if (!bad) ok('no model weights under web/assets');
}

// ------------------------------------------------------------- 3. behaviour
head('3. Engine behaviour (headless battle simulation)');
const { BattleEngine } = require_(path.join(JS, 'engine.js'));
const CAT = require_(path.join(JS, 'catalog.js'));
const MODELS = require_(path.join(JS, 'models.js'));

/**
 * Use the game's own default profile rather than a hand-rolled literal --
 * BattleEngine derives fort HP, mana and turret stats from the *Level fields,
 * so a partial profile silently yields NaN.
 */
function makeProfile() {
  const p = MODELS.defaultProfile();
  p.unlockedCards = CAT.getStarterUnlocked();
  p.deckCardIds = CAT.getStarterDeck().map(c => c.id);
  return p;
}

/** Recording sound manager: proves every fired key is one we can actually supply. */
function makeSound() {
  const fired = [];
  return { fired, play(k) { fired.push(k); } };
}

function simulate({ stage, arena = false, maxSeconds = 240, summonEvery = 1.2 }) {
  const sound = makeSound();
  const eng = new BattleEngine(CAT.getStage(stage), makeProfile(), sound, arena);
  const cardIds = eng.playerProfile.deckCardIds;
  let nextSummon = 0, lane = 0;
  const dt = 1 / 30;
  let ticks = 0;
  while (!eng.isGameOver && eng.battleTime < maxSeconds) {
    eng.update(dt);
    if (eng.battleTime >= nextSummon) {
      // Play greedily: any affordable card, rotating lanes like the UI does.
      outer: for (const id of cardIds) {
        const card = eng.playerProfile.unlockedCards.find(c => c.id === id);
        if (!card) continue;
        for (let attempt = 0; attempt < 5; attempt++) {
          if (eng.summonUnit(card, lane)) { lane = (lane + 1) % 5; nextSummon += summonEvery; break outer; }
          lane = (lane + 1) % 5;
        }
      }
      if (nextSummon <= eng.battleTime) nextSummon = eng.battleTime + summonEvery;
    }
    ticks++;
  }
  return { eng, sound, ticks };
}

for (const [stage, arena, label] of [[1, false, 'stage 1 campaign'], [6, false, 'stage 6 campaign'], [1, true, 'arena run']]) {
  try {
    const { eng, sound, ticks } = simulate({ stage, arena });
    const outcome = eng.isVictory ? 'VICTORY' : (eng.isGameOver ? 'DEFEAT' : 'UNRESOLVED');
    const okRun = eng.isGameOver;
    const line = `${label}: ${outcome} in ${eng.battleTime.toFixed(1)}s / ${ticks} ticks, ` +
      `fort ${Math.max(0, Math.round(eng.playerFort.currentHp))}/${eng.playerFort.maxHp} vs ` +
      `${Math.max(0, Math.round(eng.enemyFort.currentHp))}/${eng.enemyFort.maxHp}, ` +
      `${sound.fired.length} cues fired`;
    okRun ? ok(line) : fail(line + ' -- battle never resolved');
  } catch (e) {
    fail(`${label}: engine threw ${e.message}\n${e.stack.split('\n').slice(1, 3).join('\n')}`);
  }
}

// Every cue the engine fires must exist in the manifest, or the game silently
// falls back to the synth for that one sound.
if (fs.existsSync(manifestPath)) {
  const m = JSON.parse(read(manifestPath));
  const fired = new Set(simulate({ stage: 3 }).sound.fired);
  const missing = [...fired].filter(k => !(m.audio || {})[k]);
  missing.length ? fail(`engine fired cues with no manifest sample: ${missing.join(', ')}`)
                 : ok(`all ${fired.size} distinct cues fired in battle have a manifest sample`);
}

console.log('');
if (failures) {
  console.log(`VERIFY FAILED -- ${failures} problem(s)`);
  process.exit(1);
}
console.log('VERIFY OK');