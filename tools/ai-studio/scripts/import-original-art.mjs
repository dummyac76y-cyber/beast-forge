// Import the original Fort Conquer painted artwork into game-ready assets.
//
// The original build shipped TexturePacker atlases whose frames are individual
// body parts (body / head / neck_1..5 / tail_1..6 / leg_L_1 / foot_R / ...).
// The plists carry no layout data -- every offsetX/offsetY is 0 -- so the
// original bone layout is not recoverable. We re-impose a standard layout in
// render.js and keep the raw parts intact, which is what lets one creature be
// reused across idle / walk / attack without regenerating art.
//
// This script only crops and repacks. It never resamples or recolours, so the
// painted pixels are byte-preserved.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG, encodePNG } from './lib/png.mjs';
import { updateManifest } from './lib/manifest.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..');
const SRC = path.join(REPO, 'extract/assets/gfx');
const OUT = path.join(REPO, 'web/assets/beasts');

// Which plist sheet each race's parts live in, which original species name backs
// each of the 12 catalog beasts, and which gameplay size category it reads as.
//
// Catalog ids come from web/js/catalog.js; every one of the twelve maps to
// exactly one painted species, so no beast needs art generated for it.
//
// `size` is a gameplay intent, NOT a measurement. The twelve painted species
// span a 3.1x aspect-ratio range (gorilla 0.70 to fire dragon 2.16), so
// "scale every creature to the same height" alone produces a dragon that is
// three times wider than a bear and dominates the board. The category is what
// makes relative size deliberate. Keep these assignments -- they are the art
// direction, not a computed value.
export const SPECIES = {
  biped_bear: { race: 'BIPED', sheet: 'biped', name: 'Brown bear', size: 'MEDIUM' },
  biped_werewolf: { race: 'BIPED', sheet: 'biped', name: 'Werewolf', size: 'SMALL' },
  biped_gorilla: { race: 'BIPED', sheet: 'biped', name: 'Gorilla', size: 'SMALL' },
  biped_lizard: { race: 'BIPED', sheet: 'biped', name: 'lizards', size: 'MEDIUM' },

  quad_tiger: { race: 'QUADRUPED', sheet: 'quad', name: 'tiger', size: 'MEDIUM' },
  quad_lion: { race: 'QUADRUPED', sheet: 'quad', name: 'Lion', size: 'LARGE' },
  quad_rhino: { race: 'QUADRUPED', sheet: 'quad', name: 'rhinoceros', size: 'MEDIUM' },
  quad_hippo: { race: 'QUADRUPED', sheet: 'quad', name: 'Hippo', size: 'LARGE' },

  dragon_fire: { race: 'DRAGON', sheet: 'dragon', name: 'Fire Dragon', size: 'LARGE' },
  dragon_ice: { race: 'DRAGON', sheet: 'dragon', name: 'Ice Dragon', size: 'MASSIVE' },
  dragon_desert: { race: 'DRAGON', sheet: 'dragon', name: 'Desert Dragon', size: 'LARGE' },
  dragon_swamp: { race: 'DRAGON', sheet: 'dragon', name: 'Swamp dragon', size: 'MASSIVE' },
};

// Parts we keep, per race, in draw order. Naming is consistent across sheets:
// bipeds have hand_L_1/2 + leg_L_1/2 + foot_L; quads and dragons add
// Front_/Hind_ legs and a segmented tail; dragons add a 5-segment neck.
const KEEP = {
  BIPED: [/^body$/, /^head$/, /^hand_L_1$/, /^hand_R_1$/, /^hand_L_2$/, /^hand_R_2$/,
    /^leg_L_1$/, /^leg_R_1$/, /^leg_L_2$/, /^leg_R_2$/, /^foot_L$/, /^foot_R$/],
  QUADRUPED: [/^body$/, /^head$/, /^Hind_leg_L_1$/, /^Hind_leg_R_1$/, /^Hind_foot_L$/, /^Hind_foot_R$/,
    /^Front_leg_L_1$/, /^Front_leg_R_1$/, /^Front_foot_L$/, /^Front_foot_R$/,
    // Only the first tail segment. The originals are six long, each as wide as
    // the whole body; chaining them made a tiger 2.4x its body length and a
    // dragon 3.3x, which reads as a mistake at gameplay scale and tripled the
    // dragon atlas. One segment reads correctly and costs a third.
    /^tail_1$/],
  DRAGON: [/^body$/, /^head$/, /^neck_[1-5]$/, /^Hind_leg_L_1$/, /^Hind_leg_R_1$/,
    /^Hind_foot_L$/, /^Hind_foot_R$/, /^Front_leg_L_1$/, /^Front_leg_R_1$/,
    /^Front_foot_L$/, /^Front_foot_R$/, /^tail_1$/],
};

/** Minimal TexturePacker plist reader: frames -> {x,y,width,height}. */
export function readPlist(file) {
  const txt = fs.readFileSync(file, 'utf8');
  const frames = {};
  const re = /<key>([^<]+\.png)<\/key>\s*<dict>([\s\S]*?)<\/dict>/g;
  let m;
  while ((m = re.exec(txt))) {
    const body = m[2];
    const f = {};
    for (const k of ['x', 'y', 'width', 'height']) {
      const mm = body.match(new RegExp(`<key>${k}</key>\\s*<integer>(-?\\d+)</integer>`));
      if (mm) f[k] = parseInt(mm[1], 10);
    }
    if (f.width != null) frames[m[1]] = f;
  }
  return frames;
}

/**
 * Shelf-pack a list of {w,h} into a square-ish atlas. Parts are small and
 * near-square so shelf packing wastes almost nothing, and it is far simpler
 * than a real bin packer. Slots come back in the SAME order as the input,
 * because the caller uses that order to emit frame rects.
 */
export function pack(sizes, max = 1024) {
  const order = sizes.map((_, i) => i).sort((a, b) => sizes[b].h - sizes[a].h || sizes[b].w - sizes[a].w);
  const slots = new Array(sizes.length);
  let x = 0, y = 0, shelf = 0, w = 0, h = 0;
  for (const i of order) {
    const s = sizes[i];
    if (!(s.w > 0 && s.h > 0)) throw new Error(`pack: bad size ${JSON.stringify(s)}`);
    if (x + s.w + 1 > max) { x = 0; y += shelf + 1; shelf = 0; }
    slots[i] = { x, y };
    x += s.w + 1;
    shelf = Math.max(shelf, s.h);
    w = Math.max(w, x - 1);
    h = Math.max(h, y + s.h);
  }
  // Round up to a multiple of 4: even widths keep PNG scanline filters happy
  // and cost at most a few thousand transparent pixels.
  const W = Math.ceil(w / 4) * 4, H = Math.ceil(h / 4) * 4;
  return { slots, w: W, h: H };
}

/**
 * Tight painted bounds of a rect inside the packed atlas, as
 * [trimX, trimY, trimW, trimH] relative to the rect's own origin. Falls back to
 * the full rect when a part is entirely transparent, which would otherwise
 * produce a zero-size anchor and collapse the rig.
 */
function tightBounds(atlas, atlasW, slot, part) {
  let minX = part.width, minY = part.height, maxX = -1, maxY = -1;
  for (let y = 0; y < part.height; y++) {
    for (let x = 0; x < part.width; x++) {
      const a = atlas[(((slot.y + y) * atlasW) + slot.x + x) * 4 + 3];
      if (a < 8) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return [0, 0, part.width, part.height];
  return [minX, minY, maxX - minX + 1, maxY - minY + 1];
}

function main() {
  const written = [];
  const races = { biped: [], quad: [], dragon: [] };
  for (const [cardId, s] of Object.entries(SPECIES)) races[s.sheet].push([cardId, s]);

  const sheets = {};
  const allBeasts = {};
  let totalParts = 0;

  for (const [sheet, entries] of Object.entries(races)) {
    const stem = path.join(SRC, 'unit', sheet, sheet === 'dragon' ? 'fly_dragon' : sheet);
    const frames = readPlist(stem + '.plist');
    const img = decodePNG(fs.readFileSync(stem + '.png'));

    const wanted = [];
    for (const [cardId, s] of entries) {
      const keep = KEEP[s.race];
      const parts = [];
      for (const [file, f] of Object.entries(frames)) {
        if (!file.startsWith(s.name + '_')) continue;
        const part = file.slice(s.name.length + 1, -4);
        if (!keep.some((re) => re.test(part))) continue;
        parts.push({ part, ...f });
      }
      // Deterministic order: follow the KEEP list, then part name.
      parts.sort((a, b) =>
        keep.findIndex((re) => re.test(a.part)) - keep.findIndex((re) => re.test(b.part))
        || a.part.localeCompare(b.part));
      if (!parts.some((p) => p.part === 'body')) {
        throw new Error(`${cardId}: no body part for "${s.name}" in the ${sheet} sheet`);
      }
      wanted.push({ cardId, spec: s, parts });
    }

    const { slots, w, h } = pack(
      wanted.flatMap((b) => b.parts).map((p) => ({ w: p.width, h: p.height })));
    const atlas = new Uint8Array(w * h * 4);
    const meta = {};
    let cursor = 0;
    for (const beast of wanted) {
      const map = {};
      for (const p of beast.parts) {
        const slot = slots[cursor++];
        for (let y = 0; y < p.height; y++) {
          const src = ((p.y + y) * img.width + p.x) * 4;
          const dst = ((slot.y + y) * w + slot.x) * 4;
          atlas.set(img.data.subarray(src, src + p.width * 4), dst);
        }
        // Record where the paint actually is inside the trimmed rect. Parts
        // carry transparent padding, and without this the composed creature
        // either floats above the ground or sinks into it -- the renderer
        // anchors joints on painted pixels, not on the padded box.
        map[p.part] = [slot.x, slot.y, p.width, p.height, ...tightBounds(atlas, w, slot, p)];
      }
      meta[beast.cardId] = {
        race: beast.spec.race, species: beast.spec.name,
        size: beast.spec.size || 'MEDIUM',
        sheet, parts: map
      };
      allBeasts[beast.cardId] = meta[beast.cardId];
    }

    const rel = `beasts/beasts_${sheet}_v001.png`;
    const abs = path.join(REPO, 'web/assets', rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, encodePNG(w, h, atlas));
    sheets[sheet] = { file: rel, frameW: w, frameH: h };
    totalParts += cursor;
    written.push({ rel, bytes: fs.statSync(abs).size, size: `${w}x${h}`, parts: cursor });
  }

  const jsonRel = 'beasts/parts_v001.json';
  const jsonAbs = path.join(REPO, 'web/assets', jsonRel);
  fs.writeFileSync(jsonAbs, JSON.stringify({
    _readme: 'Frame rects into the beasts_* atlases, cropped byte-for-byte from the original '
      + 'Fort Conquer TexturePacker sheets in extract/assets/gfx/unit/. Composition is applied '
      + 'at draw time by web/js/beastparts.js -- this file is data only.',
    version: 1,
    sheets,
    beasts: allBeasts,
  }, null, 1));

  written.push({ rel: jsonRel, bytes: fs.statSync(jsonAbs).size });

  const atlasEntries = {};
  for (const [sheet, s] of Object.entries(sheets)) {
    atlasEntries['beasts_' + sheet] = {
      file: s.file, frameW: s.frameW, frameH: s.frameH, parts: 'beasts/parts_v001.json',
    };
  }
  updateManifest(REPO, 'beasts', atlasEntries);

  console.log(`${totalParts} parts -> ${Object.keys(sheets).length} atlases`);
  for (const f of written) console.log(`  ${String(f.bytes).padStart(8)}  ${f.rel}${f.size ? '  ' + f.size : ''}`);
  console.log(`  registered ${Object.keys(atlasEntries).length} beast atlases in the manifest`);
}

if (process.argv[1] && process.argv[1].endsWith('import-original-art.mjs')) main();
