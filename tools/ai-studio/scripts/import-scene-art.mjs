// Import the original painted scene backgrounds and fortress sprites.
//
// JPEG backgrounds are copied verbatim: this pipeline has no JPEG encoder, and
// the originals are already well compressed at ~100 KB. Re-encoding them as PNG
// would have made them several times larger for no visual gain.
//
// The fortress sprites live in a TexturePacker atlas, so they get the same
// crop-and-repack treatment as the beast parts -- see import-original-art.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPlist } from './import-original-art.mjs';
import { updateManifest, imageEntry } from './lib/manifest.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..');
const SRC = path.join(REPO, 'app/src/main/assets/gfx');

// Stage themes come from web/js/catalog.js STAGE_THEMES; each original
// backdrop becomes the painted background for the theme that used to fall back
// to a procedural gradient. Dimensions are asserted here because this pipeline
// has no JPEG decoder and cannot measure them itself -- `file` reports them as
// 1024x485 (bg*) and 800x480 (arena_bg, cover_bg).
const SCENES = {
  scene_base: ['cover/cover_bg.jpg', [800, 480]],
  scene_forest: ['bg/bg1.jpg', [1024, 485]],
  scene_volcano: ['bg/bg2.jpg', [1024, 485]],
  scene_snow: ['bg/bg3.jpg', [1024, 485]],
  scene_citadel: ['bg/bg4.jpg', [1024, 485]],
  scene_arena: ['bg/arena_bg.jpg', [800, 480]],
};

const write = (rel, buf) => {
  const abs = path.join(REPO, 'web/assets', rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, buf);
  return { rel, bytes: buf.length };
};

function main() {
  const out = [];
  const sceneEntries = {};
  for (const [key, [srcRel, dims]] of Object.entries(SCENES)) {
    const abs = path.join(SRC, srcRel);
    if (!fs.existsSync(abs)) throw new Error(`missing source scene ${srcRel}`);
    const rel = `scenes/${path.basename(srcRel).replace(/\.jpg$/, '_v001.jpg')}`;
    out.push(write(rel, fs.readFileSync(abs)));
    sceneEntries[key] = { ...imageEntry(REPO, rel, { dims }), cover: true };
  }
  updateManifest(REPO, 'scenes', sceneEntries);

  // Fortresses: castle_1_* is the player side, castle_2_* the enemy side. The
  // three frames per side are damage states, so a fort visibly degrades as its
  // HP drops instead of just shrinking.
  //
  // The atlas is copied verbatim rather than repacked. An earlier version
  // cropped the six towers into a fresh sheet and it came out at 423 KB against
  // the original's 295 KB -- the towers are tall and narrow, so shelf packing
  // wasted more space than the tighter original layout, and this pipeline only
  // has a PNG encoder (no PNG re-encoder to match the source's filter choices).
  const forts = {};
  for (const [name, f] of Object.entries(readPlist(path.join(SRC, 'bg/forts.plist')))) {
    forts[name] = [f.x, f.y, f.width, f.height];
  }
  out.push(write('forts/forts_v001.png', fs.readFileSync(path.join(SRC, 'bg/forts.png'))));
  out.push(write('forts/forts_v001.json', Buffer.from(JSON.stringify({
    _readme: 'Player castle_1_1..3 and enemy castle_2_1..3 damage states, copied verbatim '
      + 'from app/src/main/assets/gfx/bg/forts.png with its original TexturePacker rects. '
      + 'Frame 1 is intact, 3 is nearly ruined.',
    frames: forts,
  }, null, 1))));
  updateManifest(REPO, 'forts', {
    fort_atlas: { ...imageEntry(REPO, 'forts/forts_v001.png'),
      frames: 'forts/forts_v001.json' },
  });

  let total = 0;
  for (const f of out) { total += f.bytes; console.log(`  ${String(f.bytes).padStart(8)}  ${f.rel}`); }
  console.log(`${total} bytes of scene + fortress art`);
}

main();
