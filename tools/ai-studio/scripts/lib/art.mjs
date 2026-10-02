// Deterministic sprite + background artwork.
//
// Everything is drawn facing RIGHT, because render.js draws player units facing
// right and mirrors enemy units (spec.flipOnEnemy). Colours are deliberately
// neutral -- see the note in spec.mjs on why element tint must not be baked in.
import { Raster, rgb, hash2, lerp, lerpRgb } from './raster.mjs';
import { UNIT_PALETTE, THEMES, BG_W, BG_H, LANE_START, VH } from './spec.mjs';

const P = UNIT_PALETTE;

/** Soft dark contact shadow so units sit on the lane instead of floating. */
function contactShadow(r, cx, cy, rx) {
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    r.fillEllipse(cx, cy, rx * (0.35 + 0.65 * t), rx * 0.22 * (1 - t * 0.55), [0, 0, 0], 0.10 - t * 0.012);
  }
}

// ---------------------------------------------------------------- unit: BIPED
export function drawUnitBiped() {
  const W = 78, H = 78;
  const r = new Raster(W, H);
  const hide = P.hide, lit = P.hideLit;

  contactShadow(r, W * 0.5, 60, 20);

  // Tail.
  r.fillEllipse(17, 44, 5, 3.2, hide, 1, -0.5);

  // Legs (back leg darker for depth).
  r.fillEllipse(29, 49, 5.2, 10.5, [26, 30, 38], 1, 0.12);
  r.fillEllipse(40, 49, 5.6, 10.5, hide, 1, -0.08);

  // Torso.
  r.fillEllipse(35, 37, 11.5, 13.5, hide, 1);
  r.fillEllipse(37, 33, 7.5, 8.5, lit, 0.55);

  // Shoulder + forelimb reaching forward.
  r.fillEllipse(43, 38, 5.4, 6.0, lit, 1);
  r.fillEllipse(52, 45, 4.6, 4.0, hide, 1, -0.4);

  // Head + muzzle.
  r.fillEllipse(46, 24, 9.2, 8.6, hide, 1);
  r.fillEllipse(48, 21, 6.0, 5.6, lit, 0.5);
  r.fillEllipse(54, 26, 5.4, 4.0, hide, 1, 0.12);
  r.fillEllipse(57, 27, 2.0, 1.6, [18, 20, 26], 1);

  // Ears.
  r.fillPoly([[41, 18], [40, 10], [47, 16]], hide, 1);
  r.fillPoly([[48, 16], [51, 9], [53, 17]], hide, 1);

  // Eye glow.
  r.radialGlow(50, 23, 4.5, P.eye, 0.55);
  r.fillEllipse(50, 23, 1.5, 1.2, P.eye, 0.95);

  r.rimLight(P.rim, 0.30);
  return r;
}

// ----------------------------------------------------------- unit: QUADRUPED
export function drawUnitQuadruped() {
  const W = 102, H = 78;
  const r = new Raster(W, H);
  const hide = P.hide, lit = P.hideLit;

  contactShadow(r, W * 0.46, 62, 26);

  // Tail.
  r.fillEllipse(14, 36, 4.4, 3.0, hide, 1, 0.7);

  // Far legs.
  r.fillEllipse(28, 52, 4.0, 10.0, [26, 30, 38], 1, 0.06);
  r.fillEllipse(46, 52, 4.0, 10.0, [26, 30, 38], 1, -0.06);

  // Barrel body.
  r.fillEllipse(42, 42, 26, 14.5, hide, 1);
  r.fillEllipse(44, 37, 20, 8.0, lit, 0.45);

  // Spine ridge.
  for (let i = 0; i < 5; i++) {
    const x = 24 + i * 9;
    const h = 5 + 3 * Math.sin(i * 1.1);
    r.fillPoly([[x, 30 - h * 0.3], [x + 3, 30 - h], [x + 6, 30 - h * 0.3]], lit, 0.75);
  }

  // Near legs.
  r.fillEllipse(33, 52, 4.4, 10.2, hide, 1, 0.08);
  r.fillEllipse(54, 52, 4.4, 10.2, hide, 1, -0.08);

  // Neck + head.
  r.fillPoly([[60, 36], [72, 26], [76, 33], [64, 43]], hide, 1);
  r.fillEllipse(76, 27, 10.0, 8.4, hide, 1);
  r.fillEllipse(78, 24, 6.6, 5.2, lit, 0.5);
  r.fillEllipse(86, 29, 5.6, 4.0, hide, 1, 0.14);
  r.fillEllipse(90, 30, 2.0, 1.6, [18, 20, 26], 1);

  // Ears.
  r.fillPoly([[70, 20], [69, 12], [76, 19]], hide, 1);
  r.fillPoly([[78, 19], [82, 12], [83, 20]], hide, 1);

  // Eye glow.
  r.radialGlow(81, 26, 5.0, P.eye, 0.5);
  r.fillEllipse(81, 26, 1.6, 1.3, P.eye, 0.95);

  r.rimLight(P.rim, 0.30);
  return r;
}

// --------------------------------------------------------------- unit: DRAGON
export function drawUnitDragon() {
  const W = 126, H = 126;
  const r = new Raster(W, H);
  const hide = P.hide, lit = P.hideLit;
  const membrane = [46, 34, 58];

  contactShadow(r, 62, 96, 34);

  // Far wing.
  r.fillPoly([[56, 66], [10, 22], [22, 62], [16, 70], [46, 78]], membrane, 0.9);

  // Tail sweeping back.
  for (let i = 0; i <= 22; i++) {
    const t = i / 22;
    const x = 52 - t * 42;
    const y = 70 + Math.sin(t * 2.1) * 16 + t * 8;
    r.fillEllipse(x, y, 5.5 * (1 - t * 0.65), 4.5 * (1 - t * 0.65), hide, 1);
  }
  r.fillPoly([[10, 92], [2, 104], [14, 100]], hide, 1);   // tail fin

  // Far legs.
  r.fillEllipse(48, 84, 5.0, 12.0, [26, 30, 38], 1, 0.08);
  r.fillEllipse(72, 84, 5.0, 12.0, [26, 30, 38], 1, -0.08);

  // Body.
  r.fillEllipse(62, 66, 21, 15.5, hide, 1);
  r.fillEllipse(64, 61, 14, 8.5, lit, 0.45);

  // Dorsal spines.
  for (let i = 0; i < 5; i++) {
    const x = 44 + i * 9;
    const h = 7 + 4 * Math.sin(i * 1.3 + 0.4);
    r.fillPoly([[x, 54 - h * 0.2], [x + 4, 54 - h], [x + 8, 54 - h * 0.2]], lit, 0.8);
  }

  // Near wing, in front of the body.
  r.fillPoly([[62, 62], [18, 14], [34, 56], [26, 66], [52, 76]], membrane, 1,
    [[[62, 62], [30, 30], [40, 58], [36, 66]]]);
  for (let i = 0; i < 4; i++) {
    const t = 0.25 + i * 0.19;
    r.fillPoly([
      [62 - t * 8, 66 - t * 6],
      [62 - 44 * (0.4 + t * 0.6), 66 - 48 * (0.4 + t * 0.6)],
      [62 - 44 * (0.3 + t * 0.6), 66 - 48 * (0.28 + t * 0.6)]
    ], [38, 28, 50], 0.55);
  }

  // Near legs + claws.
  r.fillEllipse(53, 84, 5.6, 12.4, hide, 1, 0.08);
  r.fillEllipse(77, 84, 5.6, 12.4, hide, 1, -0.08);
  for (const cx of [53, 77]) {
    r.fillPoly([[cx - 5, 95], [cx - 7, 101], [cx - 1, 96]], lit, 0.8);
    r.fillPoly([[cx + 1, 96], [cx + 2, 102], [cx + 6, 97]], lit, 0.8);
  }

  // Neck + horned head.
  r.fillPoly([[74, 60], [92, 42], [99, 50], [80, 68]], hide, 1);
  r.fillEllipse(100, 42, 12, 9.5, hide, 1);
  r.fillEllipse(102, 38, 8, 5.6, lit, 0.5);
  r.fillEllipse(111, 45, 6.4, 4.4, hide, 1, 0.16);
  r.fillEllipse(116, 46, 2.2, 1.7, [18, 20, 26], 1);

  // Horns.
  r.fillPoly([[96, 33], [92, 20], [102, 31]], lit, 0.95);
  r.fillPoly([[103, 31], [104, 18], [110, 30]], lit, 0.95);

  // Eye glow.
  r.radialGlow(105, 41, 6.0, P.eye, 0.55);
  r.fillEllipse(105, 41, 1.8, 1.5, P.eye, 0.95);

  r.rimLight(P.rim, 0.28);
  return r;
}

// ------------------------------------------------------------------- FORTS
export function drawFort(side) {
  const W = 120, H = 275;
  const r = new Raster(W, H);
  const player = side === 'player';

  const stone = player ? [58, 64, 78] : [74, 48, 56];
  const stoneLit = player ? [86, 94, 112] : [108, 66, 76];
  const stoneDark = player ? [34, 38, 48] : [44, 26, 32];
  const glow = player ? [255, 213, 120] : [255, 90, 80];

  // Ground shadow.
  r.fillEllipse(W / 2, H - 6, 54, 12, [0, 0, 0], 0.35);

  // Tapered curtain wall.
  for (let y = 20; y < H - 4; y++) {
    const t = (y - 20) / (H - 24);
    const halfW = lerp(52, 44, t);
    const shade = lerpRgb(stoneLit, stone, Math.min(1, t * 1.5));
    r.fillRect(W / 2 - halfW, y, halfW * 2, 1, shade, 1);
  }

  // Masonry courses.
  for (let y = 40; y < H - 20; y += 18) {
    const t = (y - 20) / (H - 24);
    const halfW = lerp(52, 44, t);
    r.fillRect(W / 2 - halfW, y, halfW * 2, 1.4, stoneDark, 0.5);
    for (let i = 0; i < 4; i++) {
      const bx = W / 2 - halfW + (halfW * 2 / 4) * i + ((y / 18) % 2 ? halfW / 4 : 0);
      if (bx < W / 2 - halfW + halfW / 2) r.fillRect(bx, y - 18, 1.2, 18, stoneDark, 0.32);
    }
  }

  // Crenellations.
  r.fillRect(W / 2 - 54, 10, 108, 14, stoneLit, 1);
  for (let i = 0; i < 5; i++) {
    r.fillRect(W / 2 - 54 + i * 22, 0, 14, 14, stoneLit, 1);
    r.fillRect(W / 2 - 54 + i * 22, 0, 14, 3, stone, 0.6);
  }

  // Gate.
  r.fillEllipse(W / 2, H - 46, 16, 22, stoneDark, 1);
  r.fillRect(W / 2 - 16, H - 46, 32, 24, stoneDark, 1);
  r.radialGlow(W / 2, H - 40, 26, glow, player ? 0.5 : 0.65);

  // Arrow slits.
  for (let i = 0; i < 4; i++) {
    const y = 62 + i * 44;
    r.fillRect(W / 2 - 4, y, 8, 18, stoneDark, 0.9);
    r.fillEllipse(W / 2, y + 18, 4, 3, stoneDark, 0.9);
    if (i % 2 === 0) r.radialGlow(W / 2, y + 9, 12, glow, 0.18);
  }

  // Banner.
  const banner = player ? [72, 116, 168] : [148, 54, 64];
  r.fillRect(W / 2 + 18, 26, 3, 46, stoneDark, 1);
  r.fillPoly([[W / 2 + 21, 28], [W / 2 + 44, 34], [W / 2 + 21, 56]], banner, 0.95);
  r.radialGlow(W / 2 + 30, 40, 18, glow, 0.22);

  r.rimLight(player ? [180, 200, 235] : [235, 150, 150], 0.22);
  r.vignette(0.18);
  return r;
}

// -------------------------------------------------------------- BACKGROUNDS
export function drawBackground(themeKey) {
  const t = THEMES[themeKey];
  const r = new Raster(BG_W, BG_H);
  const groundY = Math.round(BG_H * (LANE_START / VH));   // matches render.js lane origin
  const seed = themeKey.split('').reduce((a, c) => a + c.charCodeAt(0), 0);

  // Sky.
  r.verticalGradient(0, 0, BG_W, groundY + 40, [
    [0, rgb(t.sky[0])], [0.55, rgb(t.sky[1])], [1, rgb(t.sky[2])]
  ]);

  // Stars / high haze.
  for (let i = 0; i < 140; i++) {
    const x = hash2(i, 1, seed) * BG_W;
    const y = hash2(i, 2, seed) * groundY * 0.8;
    const a = 0.15 + hash2(i, 3, seed) * 0.45 * (1 - y / groundY);
    const s = hash2(i, 4, seed) < 0.9 ? 1 : 2;
    r.fillRect(x, y, s, s, [255, 255, 255], a);
  }

  // Three ridge layers, back to front.
  for (let layer = 0; layer < 3; layer++) {
    const col = rgb(t.ridges[layer]);
    const baseY = groundY * (0.42 + layer * 0.16);
    const amp = 34 - layer * 8;
    const pts = [[0, BG_H]];
    for (let x = 0; x <= BG_W; x += 16) {
      const n = Math.sin(x * (0.004 + layer * 0.002) + seed) * amp
              + Math.sin(x * (0.017 + layer * 0.006) + seed * 2) * amp * 0.45
              + (hash2(Math.floor(x / 16), layer, seed) - 0.5) * amp * 0.5;
      pts.push([x, baseY + n]);
    }
    pts.push([BG_W, BG_H]);
    r.fillPoly(pts, col, 1);
  }

  // Ground plane under the lanes.
  r.verticalGradient(0, groundY, BG_W, BG_H - groundY, [
    [0, rgb(t.ground)], [1, rgb(t.sky[2])]
  ]);

  // Lane guide lines, matching render.js: 5 lanes starting at LANE_START.
  for (let i = 0; i <= 5; i++) {
    const y = groundY + (i * (BG_H - groundY)) / 5;
    r.fillRect(0, y, BG_W, 1, [255, 255, 255], i % 2 ? 0.05 : 0.08);
  }

  // Ambient particles (snow / embers / motes / spores).
  const pcol = rgb(t.particle);
  for (let i = 0; i < t.particleCount; i++) {
    const x = hash2(i, 11, seed) * BG_W;
    const y = hash2(i, 12, seed) * BG_H;
    const s = t.particleSize * (0.6 + hash2(i, 13, seed));
    r.fillRect(x, y, s, s, pcol, 0.10 + hash2(i, 14, seed) * 0.22);
  }

  // Horizon glow in the theme accent colour.
  r.radialGlow(BG_W * 0.5, groundY, BG_H * 0.55, rgb(t.accent), 0.16);

  r.vignette(0.5);
  return r;
}