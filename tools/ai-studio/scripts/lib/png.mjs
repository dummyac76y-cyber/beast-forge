// Minimal dependency-free PNG encoder (8-bit RGBA, non-interlaced).
//
// Why hand-rolled instead of a package: the AI Studio must add nothing to the
// game's runtime, and the host has no image libraries installed (no Pillow, no
// npm deps). Node's zlib is the only thing we need, and it ships with Node.
//
// Uses adaptive per-scanline filtering (None/Sub/Up/Average/Paeth) chosen by the
// standard minimum-sum-of-absolute-differences heuristic, which is what keeps
// gradient-heavy backgrounds from bloating the repository.
import zlib from 'node:zlib';

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'latin1');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

const paeth = (a, b, c) => {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/**
 * @param {number} width
 * @param {number} height
 * @param {Uint8Array} rgba  width*height*4 bytes
 * @returns {Buffer} complete PNG file
 */
export function encodePNG(width, height, rgba) {
  if (rgba.length !== width * height * 4) {
    throw new Error(`encodePNG: expected ${width * height * 4} bytes, got ${rgba.length}`);
  }

  const bpp = 4;
  const stride = width * bpp;
  const raw = Buffer.alloc((stride + 1) * height);
  const cands = [Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride)];

  let prevY = 0;
  for (let y = 0; y < height; y++) {
    const rowStart = y * stride;
    let best = 0, bestScore = Infinity;

    for (let f = 0; f < 5; f++) {
      const out = cands[f];
      let score = 0;
      for (let i = 0; i < stride; i++) {
        const x = rgba[rowStart + i];
        const a = i >= bpp ? rgba[rowStart + i - bpp] : 0;
        const b = prevY ? rgba[rowStart - stride + i] : 0;
        const c = prevY && i >= bpp ? rgba[rowStart - stride + i - bpp] : 0;
        let v;
        switch (f) {
          case 0: v = x; break;
          case 1: v = x - a; break;
          case 2: v = x - b; break;
          case 3: v = x - ((a + b) >> 1); break;
          default: v = x - paeth(a, b, c); break;
        }
        v &= 0xff;
        out[i] = v;
        score += v < 128 ? v : 256 - v;
      }
      if (score < bestScore) { bestScore = score; best = f; }
    }

    raw[y * (stride + 1)] = best;
    cands[best].copy(raw, y * (stride + 1) + 1);
    prevY = 1;
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 6;    // colour type RGBA
  ihdr[10] = 0;   // deflate
  ihdr[11] = 0;   // adaptive filtering
  ihdr[12] = 0;   // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/** Structural PNG check used by the verifier -- signature + IHDR dimensions. */
export function readPNGHeader(buf) {
  const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < SIG.length; i++) if (buf[i] !== SIG[i]) return null;
  if (buf.toString('latin1', 12, 16) !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bitDepth: buf[24], colorType: buf[25] };
}

/**
 * Decode a non-interlaced 8-bit PNG. Handles colour type 2 (RGB) and 6 (RGBA)
 * and always returns RGBA, so callers do not have to branch. Needed because
 * Playwright screenshots come back as RGB while this repo's encoder writes RGBA.
 * Anything else is rejected loudly -- the verifier must never pass a file it
 * silently failed to read.
 */
export function decodePNG(buf) {
  const head = readPNGHeader(buf);
  if (!head) throw new Error('not a PNG');
  if (head.bitDepth !== 8 || (head.colorType !== 6 && head.colorType !== 2)) {
    throw new Error(`unsupported PNG: bitDepth=${head.bitDepth} colorType=${head.colorType}`);
  }
  const { width: w, height: h } = head;
  const ch = head.colorType === 6 ? 4 : 3;

  const idat = [];
  let p = 8;
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('latin1', p + 4, p + 8);
    if (type === 'IDAT') idat.push(buf.subarray(p + 8, p + 8 + len));
    if (type === 'IEND') break;
    p += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));

  const stride = w * ch;
  const flat = new Uint8Array(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    for (let i = 0; i < stride; i++) {
      const x = row[i];
      const a = i >= ch ? flat[y * stride + i - ch] : 0;
      const b = y > 0 ? flat[(y - 1) * stride + i] : 0;
      const c = (y > 0 && i >= ch) ? flat[(y - 1) * stride + i - ch] : 0;
      let v;
      switch (f) {
        case 0: v = x; break;
        case 1: v = x + a; break;
        case 2: v = x + b; break;
        case 3: v = x + ((a + b) >> 1); break;
        case 4: v = x + paeth(a, b, c); break;
        default: throw new Error(`unknown PNG filter type ${f} on row ${y}`);
      }
      flat[y * stride + i] = v & 0xff;
    }
  }

  const out = new Uint8Array(w * h * 4);
  for (let i = 0, j = 0; i < flat.length; i += ch, j += 4) {
    out[j] = flat[i]; out[j + 1] = flat[i + 1]; out[j + 2] = flat[i + 2];
    out[j + 3] = ch === 4 ? flat[i + 3] : 255;
  }
  return { width: w, height: h, data: out };
}