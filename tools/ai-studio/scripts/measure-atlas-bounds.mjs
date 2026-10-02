// Measures the opaque content bounds of frames in the imported atlases.
//
// Why this exists: the renderer scales by the FRAME rect. If a frame carries
// transparent padding, the visible art is smaller than the frame and sits off
// centre, which reads as "wrong scale" and "wrong position" in the battle. This
// script reports the real numbers so the renderer can use them instead of
// guessing.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG } from './lib/png.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const A = p => path.join(REPO, 'web/assets', p);
const pct = (a, b) => Math.round(100 * a / b);

// Opaque bounds of a sub-rectangle of a decoded image.
function bounds(img, w, rx, ry, rw, rh, alphaMin = 8) {
  let x0 = rw, y0 = rh, x1 = -1, y1 = -1;
  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      if (img.data[(((ry + y) * w) + rx + x) * 4 + 3] > alphaMin) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

let problems = 0;
const flag = m => { problems++; return '  <-- ' + m; };

// ---------------------------------------------------------------- forts
{
  const meta = JSON.parse(fs.readFileSync(A('forts/forts_v001.json'), 'utf8'));
  const img = decodePNG(fs.readFileSync(A('forts/forts_v001.png')));
  console.log('=== FORTS: frame rect vs opaque bounds ===');
  for (const [name, [rx, ry, rw, rh]] of Object.entries(meta.frames)) {
    const b = bounds(img, img.width, rx, ry, rw, rh);
    if (!b) { console.log(name, 'EMPTY'); problems++; continue; }
    const fillW = pct(b.w, rw), fillH = pct(b.h, rh);
    // Symmetry: how far the opaque box is from the frame centre, horizontally.
    const cx = (b.x0 + b.w / 2) / rw - 0.5;
    const notes = [];
    if (fillH < 90) notes.push(`only ${fillH}% of frame height is art`);
    if (Math.abs(cx) > 0.05) notes.push(`art centre off by ${(cx * 100).toFixed(0)}%`);
    console.log(name.padEnd(16),
      `frame ${rw}x${rh}`.padEnd(16),
      `opaque ${b.w}x${b.h}`.padEnd(14),
      `fill ${fillW}%x${fillH}%`,
      notes.length ? flag(notes.join('; ')) : '');
  }
}

// ---------------------------------------------------------------- beasts
{
  const meta = JSON.parse(fs.readFileSync(A('beasts/parts_v001.json'), 'utf8'));
  console.log('\n=== BEASTS: trimmed part bounds, atlas cell ===');
  console.log('(body = [ax,ay,aw,ah, tx,ty,tw,th]; the tail is the tight rect)');
  const rows = [];
  for (const [id, rec] of Object.entries(meta.beasts)) {
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, n = 0;
    for (const p of Object.values(rec.parts || {})) {
      const [ax, ay, aw, ah, tx, ty, tw, th] = p;
      // Union of the *trimmed* rects, expressed in each part's own cell.
      if (tw < aw || th < ah) { /* trimmed, handled below */ }
      x0 = Math.min(x0, tx); y0 = Math.min(y0, ty);
      x1 = Math.max(x1, tx + tw); y1 = Math.max(y1, ty + th);
      n++;
    }
    if (x1 < 0) { console.log(id, 'no parts'); problems++; continue; }
    rows.push({ id, race: rec.race, species: rec.species, n, w: x1 - x0, h: y1 - y0 });
  }
  // The rig will normalise all of these to the same target height, so what
  // matters is the aspect ratio: a very wide beast squeezed to a fixed height
  // will be far wider on screen than a tall one.
  for (const r of rows) {
    const ar = r.w / r.h;
    const notes = [];
    if (ar > 2.6) notes.push(`very wide (${ar.toFixed(1)}:1) — will dominate a lane`);
    if (ar < 0.55) notes.push(`very tall (${ar.toFixed(1)}:1)`);
    console.log(r.id.padEnd(18), r.species.padEnd(16),
      `parts=${String(r.n).padStart(2)}`,
      `trimmed ${r.w}x${r.h}`.padEnd(16),
      `ar ${ar.toFixed(2)}`,
      notes.length ? flag(notes.join('; ')) : '');
  }
  const ars = rows.map(r => r.w / r.h);
  console.log(`\naspect ratio spread: ${Math.min(...ars).toFixed(2)} .. ${Math.max(...ars).toFixed(2)}` +
    `  (${(Math.max(...ars) / Math.min(...ars)).toFixed(1)}x spread)`);
}

console.log(problems ? `\n${problems} measurement(s) need renderer attention` : '\nno measurement problems');