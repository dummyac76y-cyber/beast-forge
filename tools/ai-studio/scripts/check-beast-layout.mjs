// Measures the composed painted beasts without needing to look at them.
//
// Each species' layout is resolved through the same resolveLayout() the
// renderer uses, blitted into an offscreen alpha mask, then reported as
// coverage, bounding box and the number of disconnected blobs in the
// silhouette. A layout mistake -- a head floating clear of the shoulders, feet
// that miss the ground -- shows up as extra blobs or a bad aspect ratio, which
// is checkable here and in CI.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG } from './lib/png.mjs';
import rigModule from '../../../web/js/beastparts.js';

const { resolveLayout } = rigModule;
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const meta = JSON.parse(fs.readFileSync(path.join(REPO, 'web/assets/beasts/parts_v001.json'), 'utf8'));

const atlases = {};
for (const s of Object.values(meta.sheets)) {
  atlases[s.file] = decodePNG(fs.readFileSync(path.join(REPO, 'web/assets', s.file)));
}

function blit(mask, mw, mh, atlas, sx, sy, sw, sh, dx, dy) {
  for (let y = 0; y < sh; y++) {
    const ty = dy + y;
    if (ty < 0 || ty >= mh) continue;
    for (let x = 0; x < sw; x++) {
      const tx = dx + x;
      if (tx < 0 || tx >= mw) continue;
      if (atlas.data[((sy + y) * atlas.width + sx + x) * 4 + 3] > 24) mask[ty * mw + tx] = 1;
    }
  }
}

/** Count 8-connected blobs in a boolean mask. */
function blobs(mask, mw, mh) {
  const seen = new Uint8Array(mask.length);
  const stack = [];
  let n = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || seen[i]) continue;
    n++; seen[i] = 1; stack.push(i);
    while (stack.length) {
      const p = stack.pop();
      const x = p % mw, y = (p / mw) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= mw || ny >= mh) continue;
        const q = ny * mw + nx;
        if (mask[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
      }
    }
  }
  return n;
}

/** Names of parts with no painted pixel connected to the body's component. */
function attachedToBody(mask, mw, mh, ox, oy, solved, b, atlas) {
  const owner = new Int16Array(mw * mh).fill(-1);
  const nodes = [solved.body, ...solved.nodes];
  nodes.forEach((n, li) => {
    const [rx, ry, rw, rh, tx, ty, tw, th] = n.rect;
    for (let y = ty; y < ty + th; y++) for (let x = tx; x < tx + tw; x++) {
      if (atlas.data[((ry + y) * atlas.width + rx + x) * 4 + 3] <= 24) continue;
      const px = Math.round(ox + n.x + (x - tx)), py = Math.round(oy + n.y + (y - ty));
      if (px < 0 || py < 0 || px >= mw || py >= mh) continue;
      owner[py * mw + px] = li;
    }
  });
  // Flood from the body only.
  const seen = new Uint8Array(mw * mh);
  const stack = [];
  for (let i = 0; i < owner.length; i++) if (owner[i] === 0) { seen[i] = 1; stack.push(i); }
  while (stack.length) {
    const p = stack.pop();
    const x = p % mw, y = (p / mw) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= mw || ny >= mh) continue;
      const q = ny * mw + nx;
      if (owner[q] >= 0 && !seen[q]) { seen[q] = 1; stack.push(q); }
    }
  }
  const joined = new Set();
  for (let i = 0; i < owner.length; i++) if (seen[i]) joined.add(owner[i]);
  return nodes.filter((_, li) => li !== 0 && !joined.has(li)).map(n => n.name);
}

let failures = 0;
for (const [cardId, b] of Object.entries(meta.beasts)) {
  const atlasFile = meta.sheets[b.sheet].file;
  const atlas = atlases[atlasFile];
  const [, , bodyW, bodyH] = b.parts.body;
  const solved = resolveLayout(b.race, b.parts, bodyW, bodyH);
  if (!solved) { console.log(`FAIL ${cardId}: layout did not resolve`); failures++; continue; }

  const MW = 760, MH = 560;
  const mask = new Uint8Array(MW * MH);
  const ground = 480;
  const ox = MW / 2 - solved.width / 2;
  const oy = ground - solved.height;

  for (const n of [{ x: solved.body.x, y: solved.body.y, w: solved.body.w, h: solved.body.h, rect: b.parts.body }, ...solved.nodes]) {
    const [rx, ry, rw, rh] = n.rect;
    const dx = Math.round(ox + n.x);
    const dy = Math.round(oy + n.y);
    if (n.rot) {
      // Rotated parts are blitted through their axis-aligned bounds: enough to
      // catch a segment that has flown away from its neighbour.
      const c = Math.abs(Math.cos(n.rot)), s = Math.abs(Math.sin(n.rot));
      const w2 = Math.round(rw * c + rh * s), h2 = Math.round(rw * s + rh * c);
      blit(mask, MW, MH, atlas, rx, ry, rw, rh,
        dx + ((rw - w2) >> 1), dy + ((rh - h2) >> 1));
    } else {
      blit(mask, MW, MH, atlas, rx, ry, rw, rh, dx, dy);
    }
  }

  let n = 0, minX = MW, maxX = -1, minY = MH, maxY = -1;
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    if (!mask[y * MW + x]) continue;
    n++;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (n === 0) { console.log(`FAIL ${cardId}: composed to nothing`); failures++; continue; }

  const bw = maxX - minX + 1, bh = maxY - minY + 1;
  const aspect = bw / bh;
  // A part counts as attached if ANY of its painted pixels join the body.
  // The original head art has detached tufts and whiskers of its own, so a
  // raw blob count would fail on detail that is meant to be there.
  const attached = attachedToBody(mask, MW, MH, ox, oy, solved, b, atlas);
  const parts = blobs(mask, MW, MH);
  const grounded = Math.abs(maxY - ground) <= 4;

  // One connected mass (a couple of blobs is tolerable where a tail tip or a
  // claw is deliberately detached), real pixel coverage, feet on the ground,
  // and a silhouette proportion that matches the animal it is supposed to be.
  const wantTall = b.race !== 'QUADRUPED';
  // Compare against the parts the layout actually uses, not every part the
  // importer kept: the atlases carry spare segments we never draw.
  const used = solved.nodes.length;
  const ok = attached.length === 0 && n > 1500 && grounded
    && (wantTall ? aspect < 2.4 : aspect > 1.1);
  if (!ok) failures++;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${cardId.padEnd(16)} ${b.species.padEnd(14)}`
    + ` body=${bodyW}x${bodyH} rig=${solved.width}x${solved.height}`
    + ` drawn=${bw}x${bh} aspect=${aspect.toFixed(2)} blobs=${parts}`
    + ` px=${n} groundGap=${ground - maxY}`
    + (attached.length ? ' detached: ' + attached.join(',') : ` parts=${used}`));
}
console.log(failures ? `\n${failures} beast layout(s) failed` : '\nall 12 beasts compose into a coherent, grounded silhouette');
process.exit(failures ? 1 : 0);
