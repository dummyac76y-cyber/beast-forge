// Tiny software rasterizer: RGBA float-ish buffer with just enough 2D drawing
// to author sprites and backgrounds without pulling in a canvas library.
//
// Everything is deterministic -- no Math.random anywhere -- so regenerating the
// assets produces byte-identical files and diffs stay reviewable.
//
// Colour convention: helpers take [r,g,b] arrays in 0..255 and an alpha 0..1.
// Compositing is straight source-over.
import { encodePNG } from './png.mjs';

export const rgb = (hex) => {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};

export const lerp = (a, b, t) => a + (b - a) * t;
export const lerpRgb = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** Deterministic value noise in [0,1); used for texture and silhouettes. */
export function hash2(x, y, seed = 0) {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class Raster {
  constructor(width, height) {
    this.w = width;
    this.h = height;
    this.data = new Uint8Array(width * height * 4); // transparent
  }

  /** Source-over a single pixel. */
  blend(x, y, col, a) {
    if (a <= 0) return;
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    const d = this.data;
    const dstA = d[i + 3] / 255;
    const outA = a + dstA * (1 - a);
    if (outA <= 0) { d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0; return; }
    for (let c = 0; c < 3; c++) {
      const src = col[c] / 255;
      const dst = d[i + c] / 255;
      d[i + c] = Math.round(((src * a + dst * dstA * (1 - a)) / outA) * 255);
    }
    d[i + 3] = Math.round(outA * 255);
  }

  fillRect(x, y, w, h, col, a = 1) {
    for (let yy = Math.floor(y); yy < Math.ceil(y + h); yy++) {
      for (let xx = Math.floor(x); xx < Math.ceil(x + w); xx++) this.blend(xx, yy, col, a);
    }
  }

  /**
   * Anti-aliased axis-aligned ellipse. Used for every organic mass in the
   * sprites; the 4x4 supersample keeps edges smooth without a full scanline
   * polygon rasteriser.
   */
  fillEllipse(cx, cy, rx, ry, col, a = 1, rot = 0) {
    const cos = Math.cos(-rot), sin = Math.sin(-rot);
    const x0 = Math.max(0, Math.floor(cx - Math.max(rx, ry) - 1));
    const x1 = Math.min(this.w - 1, Math.ceil(cx + Math.max(rx, ry) + 1));
    const y0 = Math.max(0, Math.floor(cy - Math.max(rx, ry) - 1));
    const y1 = Math.min(this.h - 1, Math.ceil(cy + Math.max(rx, ry) + 1));
    const S = 4;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        let hit = 0;
        for (let sy = 0; sy < S; sy++) {
          for (let sx = 0; sx < S; sx++) {
            const px = x + (sx + 0.5) / S - cx;
            const py = y + (sy + 0.5) / S - cy;
            const ux = px * cos - py * sin, uy = px * sin + py * cos;
            if ((ux * ux) / (rx * rx) + (uy * uy) / (ry * ry) <= 1) hit++;
          }
        }
        if (hit) this.blend(x, y, col, a * (hit / (S * S)));
      }
    }
  }

  /**
   * Convex/concave polygon fill via 4x vertical subsamples. Supports `holes`
   * (array of point arrays) so wings/ears can be cut back out.
   */
  fillPoly(points, col, a = 1, holes = []) {
    let minY = Infinity, maxY = -Infinity;
    for (const p of points) { if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
    const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(this.h - 1, Math.ceil(maxY));
    const S = 4;
    const edgeAt = (poly, yy) => {
      const xs = [];
      for (let i = 0; i < poly.length; i++) {
        const [x1p, y1p] = poly[i], [x2p, y2p] = poly[(i + 1) % poly.length];
        if ((y1p <= yy && y2p > yy) || (y2p <= yy && y1p > yy)) {
          xs.push(x1p + ((yy - y1p) / (y2p - y1p)) * (x2p - x1p));
        }
      }
      xs.sort((m, n) => m - n);
      const spans = [];
      for (let i = 0; i + 1 < xs.length; i += 2) spans.push([xs[i], xs[i + 1]]);
      return spans;
    };
    const inAny = (spans, x) => spans.some(([s, e]) => x >= s && x <= e);

    for (let y = y0; y <= y1; y++) {
      for (let sy = 0; sy < S; sy++) {
        const yy = y + (sy + 0.5) / S;
        const outer = edgeAt(points, yy);
        if (!outer.length) continue;
        const hs = holes.map(edgeAt).filter(s => s.length);
        const x0 = Math.max(0, Math.floor(outer[0][0]));
        const x1 = Math.min(this.w - 1, Math.ceil(outer[outer.length - 1][1]));
        for (let x = x0; x <= x1; x++) {
          const xx = x + 0.5;
          if (!inAny(outer, xx)) continue;
          if (hs.some(s => inAny(s, xx))) continue;
          this.blend(x, y, col, a / S);
        }
      }
    }
  }

  /** Vertical multi-stop gradient across an arbitrary rect. */
  verticalGradient(x, y, w, h, stops) {
    for (let yy = 0; yy < h; yy++) {
      const t = h <= 1 ? 0 : yy / (h - 1);
      const col = sampleStops(stops, t);
      for (let xx = 0; xx < w; xx++) this.blend(x + xx, y + yy, col, 1);
    }
  }

  /** Soft radial glow, alpha falls off quadratically. Used for embers/aura. */
  radialGlow(cx, cy, r, col, strength = 1) {
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(this.w - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(this.h - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x - cx, y - cy) / r;
        if (d >= 1) continue;
        const f = (1 - d) * (1 - d) * strength;
        this.blend(x, y, col, f);
      }
    }
  }

  /** Darken/lighten ring around existing content -- cheap "rim light". */
  rimLight(col, amount = 0.35) {
    const out = new Uint8Array(this.data.length);
    out.set(this.data);
    const src = this.data;
    const at = (x, y) => (x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : src[(y * this.w + x) * 4 + 3]);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const i = (y * this.w + x) * 4;
        if (src[i + 3] > 8) continue;
        const edge = at(x - 1, y) + at(x + 1, y) + at(x, y - 1) + at(x, y + 1);
        if (edge < 200) continue;
        out[i] = col[0]; out[i + 1] = col[1]; out[i + 2] = col[2];
        out[i + 3] = Math.round(255 * amount);
      }
    }
    this.data = out;
  }

  /** Corner vignette to push focus toward the battlefield centre. */
  vignette(strength = 0.55) {
    const cx = this.w / 2, cy = this.h / 2;
    const maxD = Math.hypot(cx, cy);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const i = (y * this.w + x) * 4;
        if (!this.data[i + 3]) continue;
        const d = Math.hypot(x - cx, y - cy) / maxD;
        const f = 1 - strength * d * d;
        for (let c = 0; c < 3; c++) this.data[i + c] = Math.round(this.data[i + c] * f);
      }
    }
  }

  toPNG() { return encodePNG(this.w, this.h, this.data); }
}

function sampleStops(stops, t) {
  for (let i = 0; i < stops.length - 1; i++) {
    const [p0, c0] = stops[i], [p1, c1] = stops[i + 1];
    if (t >= p0 && t <= p1) return lerpRgb(c0, c1, p1 === p0 ? 0 : (t - p0) / (p1 - p0));
  }
  return stops[stops.length - 1][1];
}