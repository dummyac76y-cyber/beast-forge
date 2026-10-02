#!/usr/bin/env node
// AI Studio asset generator.
//
//   node tools/ai-studio/scripts/generate-assets.mjs            # render to staging
//   node tools/ai-studio/scripts/generate-assets.mjs --promote  # staging -> web/assets
//   node tools/ai-studio/scripts/generate-assets.mjs --force    # allow overwrite
//
// Two-phase on purpose (skill §6/§15): generation never touches the game. Rendered
// files land in tools/ai-studio/art/outputs and tools/ai-studio/audio/outputs, and
// only --promote copies them into web/assets and writes assets/manifest.json.
// Promotion refuses to clobber an existing game asset unless --force is passed.
//
// This is NOT an AI generator. ComfyUI / ACE-Step are not installed in this
// environment, so artwork and audio are drawn and synthesised deterministically
// from code. See `doctor` output for real provider status.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SPRITES, BACKGROUNDS, AUDIO, TEXTURES, CREDITS, THEMES } from './lib/spec.mjs';
import { drawUnitBiped, drawUnitQuadruped, drawUnitDragon, drawFort, drawBackground, drawTilingTexture } from './lib/art.mjs';
import { encodeWAV, SAMPLE_RATE } from './lib/wav.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOOLS = path.resolve(HERE, '..');
const REPO = path.resolve(TOOLS, '..', '..');
const STAGE_SPRITES = path.join(TOOLS, 'art', 'outputs');
const STAGE_AUDIO = path.join(TOOLS, 'audio', 'outputs');
const GAME_ASSETS = path.join(REPO, 'web', 'assets');

const args = new Set(process.argv.slice(2));
const PROMOTE = args.has('--promote');
const FORCE = args.has('--force');

// ---------------------------------------------------------------- synthesis
const WAVES = {
  sine: t => Math.sin(2 * Math.PI * t),
  triangle: t => 2 * Math.abs(2 * (t - Math.floor(t + 0.5))) - 1,
  square: t => (t % 1 < 0.5 ? 1 : -1),
  sawtooth: t => 2 * (t - Math.floor(t + 0.5))
};

/** Deterministic white noise in [-1,1]; no Math.random so output is reproducible. */
function noise(i, seed) {
  let h = Math.imul(i ^ seed, 0x27d4eb2d) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  return (((h ^ (h >>> 13)) >>> 0) / 2147483648) - 1;
}

/** Attack/decay envelope; fast attack keeps cues crisp, no clicks at the tail. */
function envelope(t, dur, attack = 0.012) {
  if (t < 0 || t > dur) return 0;
  const a = Math.min(1, t / attack);
  const rel = 1 - Math.max(0, (t - dur * 0.55) / (dur * 0.45));
  return a * rel * rel;
}

function renderCue(spec, key) {
  const n = Math.floor(spec.dur * SAMPLE_RATE);
  const out = new Float32Array(n);
  const seed = key.split('').reduce((a, c) => a + c.charCodeAt(0) * 31, 7);
  const wave = WAVES[spec.wave] || WAVES.sine;
  let phase = 0;

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const k = i / n;
    const env = envelope(t, spec.dur);
    // Exponential pitch sweep, matching audio.js's freqSweep behaviour.
    const freq = spec.f0 * Math.pow(spec.f1 / spec.f0, k);
    phase += freq / SAMPLE_RATE;

    let v = wave(phase) * 0.6;
    for (let h2 = 2; h2 <= (spec.harmonics || 1); h2++) {
      v += wave(phase * h2) * (0.34 / h2);
    }
    if (spec.noise) {
      // Low-passed noise body: average a short window so it reads as rumble, not hiss.
      let acc = 0;
      for (let d = 0; d < 4; d++) acc += noise(Math.max(0, i - d * 6), seed);
      v += (acc / 4) * spec.noise;
    }
    out[i] = v * env * spec.gain * 3.2;
  }

  // Short fade-out so decodeAudioData output never ends on a discontinuity.
  const fade = Math.min(n, Math.floor(SAMPLE_RATE * 0.008));
  for (let i = 0; i < fade; i++) out[n - 1 - i] *= i / fade;

  return out;
}

// ------------------------------------------------------------------ writing
const written = [];

function write(file, buf) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
  written.push({ file: path.relative(REPO, file), bytes: buf.length });
}

function generate() {
  const sprites = [
    ['unit_biped', drawUnitBiped],
    ['unit_quadruped', drawUnitQuadruped],
    ['unit_dragon', drawUnitDragon]
  ];
  for (const [key, fn] of sprites) {
    const spec = SPRITES[key];
    const r = fn();
    write(path.join(STAGE_SPRITES, spec.file), r.toPNG());
  }
  write(path.join(STAGE_SPRITES, SPRITES.fort_player.file), drawFort('player').toPNG());
  write(path.join(STAGE_SPRITES, SPRITES.fort_enemy.file), drawFort('enemy').toPNG());

  for (const theme of Object.keys(THEMES)) {
    const key = 'bg_' + theme;
    write(path.join(STAGE_SPRITES, BACKGROUNDS[key].file), drawBackground(theme).toPNG());
  }

  // Seamless detail maps for the WebGL renderer.
  for (const [key, spec] of Object.entries(TEXTURES)) {
    write(path.join(STAGE_SPRITES, spec.file), drawTilingTexture(spec.kind, spec.seed).toPNG());
  }

  for (const [key, spec] of Object.entries(AUDIO)) {
    write(path.join(STAGE_AUDIO, spec.file), encodeWAV(renderCue(spec, key)));
  }
}

function promote() {
  const entries = [...Object.entries(SPRITES), ...Object.entries(BACKGROUNDS)];
  const spriteManifest = {};
  const textureManifest = {};

  /**
   * Copy one staged file into web/assets.
   *
   * Generation is deterministic, so re-promoting an unchanged asset produces
   * byte-identical output. That case is a no-op rather than an error, which
   * makes `assets && assets:promote` safe to re-run. A genuine content change
   * to an existing game asset still requires --force.
   */
  const promoteFile = (stageDir, rel, label) => {
    const src = path.join(stageDir, rel);
    if (!fs.existsSync(src)) throw new Error(`missing staged ${label}: ${rel}`);
    const dst = path.join(GAME_ASSETS, rel);
    const bytes = fs.readFileSync(src);
    if (fs.existsSync(dst) && !FORCE) {
      if (fs.readFileSync(dst).equals(bytes)) return false;   // already current
      throw new Error(
        `refusing to replace existing game asset ${rel} with different content ` +
        '(re-run with --force if the change is intentional)'
      );
    }
    write(dst, bytes);
    return true;
  };

  const promoteImage = rel => promoteFile(STAGE_SPRITES, rel, 'image');

  for (const [key, spec] of entries) {
    promoteImage(spec.file);
    spriteManifest[key] = {
      file: spec.file,
      frameW: spec.frameW,
      frameH: spec.frameH,
      anchorX: spec.anchorX,
      anchorY: spec.anchorY,
      flipOnEnemy: spec.flipOnEnemy,
      cover: spec.cover
    };
  }

  // Tileable detail maps live in their own manifest section -- the 3D renderer
  // looks them up as textures, not as sprites.
  for (const [key, spec] of Object.entries(TEXTURES)) {
    promoteImage(spec.file);
    textureManifest[key] = { file: spec.file, repeat: spec.repeat };
  }

  const audioManifest = {};
  for (const [key, spec] of Object.entries(AUDIO)) {
    promoteFile(STAGE_AUDIO, spec.file, 'clip');
    audioManifest[key] = { file: spec.file, volume: spec.volume };
  }

  // Merge into the manifest rather than replacing it. The file ships with a
  // hand-written _readme and a font credit list; rewriting it wholesale would
  // silently drop documentation and attribution that are not ours to remove.
  const manifestPath = path.join(GAME_ASSETS, 'manifest.json');
  let existing = {};
  if (fs.existsSync(manifestPath)) {
    existing = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    for (const [section, next] of [['sprites', spriteManifest], ['audio', audioManifest], ['textures', textureManifest]]) {
      for (const [key, spec] of Object.entries(existing[section] || {})) {
        if (next[key] && next[key].file !== spec.file && !FORCE) {
          throw new Error(
            `manifest.${section}.${key} already points at ${spec.file}; ` +
            `refusing to repoint it at ${next[key].file} (pass --force)`
          );
        }
      }
    }
  }

  const manifest = {
    ...existing,
    version: existing.version || 1,
    generatedBy: 'tools/ai-studio/scripts/generate-assets.mjs',
    sprites: { ...(existing.sprites || {}), ...spriteManifest },
    audio: { ...(existing.audio || {}), ...audioManifest },
    textures: { ...(existing.textures || {}), ...textureManifest },
    fonts: existing.fonts && existing.fonts.length ? existing.fonts : [
      { family: 'Cinzel', file: 'fonts/cinzel-latin-500-normal.woff2', weight: 500 },
      { family: 'Cinzel', file: 'fonts/cinzel-latin-600-normal.woff2', weight: 600 },
      { family: 'Cinzel', file: 'fonts/cinzel-latin-700-normal.woff2', weight: 700 }
    ],
    credits: mergeCredits(existing.credits, CREDITS)
  };
  write(manifestPath, Buffer.from(JSON.stringify(manifest, null, 2) + '\n'));

  return {
    sprites: Object.keys(manifest.sprites).length,
    audio: Object.keys(manifest.audio).length,
    textures: Object.keys(manifest.textures).length
  };
}

/**
 * Union on `name`, so re-running the tool never duplicates an entry. The
 * existing entry wins: if the repo already carries a credit for a name, that
 * text is the authoritative one and this tool must not rewrite it.
 */
function mergeCredits(existing, incoming) {
  const out = (existing || []).slice();
  for (const c of incoming) {
    if (!out.some(e => e.name === c.name)) out.push(c);
  }
  return out;
}

// --------------------------------------------------------------------- main
if (PROMOTE) {
  const n = promote();
  console.log(`promoted ${n.sprites} sprites + ${n.audio} clips + ${n.textures} textures + manifest.json -> web/assets`);
} else {
  generate();
}

let total = 0;
for (const w of written) total += w.bytes;
for (const w of written) {
  console.log(`  ${(w.bytes / 1024).toFixed(1).padStart(8)} KiB  ${w.file}`);
}
console.log(`${written.length} files, ${(total / 1024).toFixed(1)} KiB total`);