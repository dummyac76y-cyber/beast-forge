// Beast Forge -- real-time 3D renderer.
//
// Consumes the same BattleEngine state as the 2D canvas renderer, so game
// logic is untouched. Geometry is built from primitives at load time (no
// external model files) and textured with procedurally generated maps, which
// keeps the deployment free of binary art while still being genuinely 3D:
// real normals, real lighting, real shadows, real perspective.
//
// Loaded as an ES module (it imports three.js). ui.js falls back to the 2D
// canvas renderer when WebGL is unavailable.
//
// Optional assets (passed in by ui.js as an AssetStore) are used when present:
//   bg_<theme>   painted sky, used as the scene background
//   tex_fur / tex_scale / tex_stone   seamless surface maps
// Every one of them is optional. With no manifest at all the renderer behaves
// exactly as it did before: procedural CanvasTextures and a flat sky colour.
import * as THREE from '../vendor/three.module.js';

// ---------------------------------------------------------------- world setup
const LANE_COUNT = 5;
const LANE_GAP = 5.6;                 // world units between lane centres
const FIELD_HALF = 27;                // forts sit at +/- FIELD_HALF on X
const FIELD_W = 1000;                 // engine's virtual lane length

// models.js is a classic script, so it publishes its palettes on the global
// object as `var M`. Read them lazily so load ordering never matters.
const TIER_ORDER = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'];
function elHex(key) {
  const M = globalThis.M;
  const e = M && M.ELEMENT ? M.ELEMENT[key] : null;
  const css = e ? e.color : '#888888';
  return parseInt(String(css).replace('#', ''), 16) || 0x888888;
}
function tierIdx(key) {
  const i = TIER_ORDER.indexOf(key);
  return i < 0 ? 0 : i;
}

const laneZ = i => (i - (LANE_COUNT - 1) / 2) * LANE_GAP;
const posToX = pos => -FIELD_HALF + (pos / FIELD_W) * (FIELD_HALF * 2);

// Deterministic value noise -- no Math.random, so every client renders the
// same skin/fur/scales and cached textures stay consistent between frames.
function hash2(x, y, seed) {
  let h = x * 374761393 + y * 668265263 + seed * 2147483647;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}
function smooth(t) { return t * t * (3 - 2 * t); }
function vnoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = smooth(x - xi), yf = smooth(y - yi);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return (a * (1 - xf) + b * xf) * (1 - yf) + (c * (1 - xf) + d * xf) * yf;
}
function fbm(x, y, seed, octaves) {
  let v = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    v += amp * vnoise(x * f, y * f, seed + i * 17); norm += amp; amp *= 0.5; f *= 2;
  }
  return v / norm;
}

function shadeOf(hex, k) {
  const r = Math.min(255, ((hex >> 16) & 255) * k) | 0;
  const g = Math.min(255, ((hex >> 8) & 255) * k) | 0;
  const b = Math.min(255, (hex & 255) * k) | 0;
  return (r << 16) | (g << 8) | b;
}

// ------------------------------------------------------------ skin textures
// Every beast gets a real map: noise-modulated base colour plus a pattern
// (scales / fur clumps / rocky plates) so lighting has surface detail to bite
// on instead of reading as a flat silhouette.
function skinTexture(kind, baseHex, accentHex, seed) {
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const img = g.createImageData(S, S);
  const br = (baseHex >> 16) & 255, bg = (baseHex >> 8) & 255, bb = baseHex & 255;
  const ar = (accentHex >> 16) & 255, ag = (accentHex >> 8) & 255, ab = accentHex & 255;

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      let detail, mix;
      if (kind === 'scale') {
        // Overlapping scales: quantise into rows of offset cells.
        const row = Math.floor(v * 16);
        const uu = u * 16 + (row % 2) * 0.5;
        const cx = uu - Math.floor(uu) - 0.5;
        const cy = v * 16 - row - 0.5;
        const d = Math.sqrt(cx * cx + cy * cy * 1.7);
        const rim = smooth(Math.min(1, Math.max(0, (d - 0.28) / 0.34)));
        detail = 0.55 + 0.45 * fbm(u * 7, v * 7, seed, 4);
        mix = rim * 0.55 + (1 - detail) * 0.25;
      } else if (kind === 'fur') {
        // Clumped fur: noise stretched along the body axis.
        const n = fbm(u * 5, v * 22, seed, 5);
        const clumps = fbm(u * 3.2, v * 3.2, seed + 99, 3);
        detail = n * 0.7 + clumps * 0.3;
        mix = 1 - Math.pow(detail, 1.6);
      } else { // 'plate' -- rocky/ceramic plating for forts and terrain
        const n = fbm(u * 6, v * 6, seed, 5);
        const cracks = Math.abs(fbm(u * 9, v * 9, seed + 41, 3) - 0.5) * 2;
        detail = n;
        mix = Math.pow(cracks, 3) * 0.7;
      }
      const i = (y * S + x) * 4;
      img.data[i]     = br + (ar - br) * mix * detail;
      img.data[i + 1] = bg + (ag - bg) * mix * detail;
      img.data[i + 2] = bb + (ab - bb) * mix * detail;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

const texCache = new Map();
function cachedSkin(kind, baseHex, accentHex, seed) {
  const key = kind + '|' + baseHex + '|' + accentHex + '|' + seed;
  if (!texCache.has(key)) texCache.set(key, skinTexture(kind, baseHex, accentHex, seed));
  return texCache.get(key);
}

// --------------------------------------------------------------- asset bridge
// ui.js hands the shared AssetStore in once, at renderer creation. Null means
// "no manifest", and every lookup below degrades to the procedural generator.
let assets = null;
const assetTexCache = new Map();

function setAssetStore(store) {
  assets = (store && typeof store.texture === 'function') ? store : null;
  // Release GPU textures tied to the previous store; the HTMLImageElements they
  // wrap may be about to go away.
  for (const t of assetTexCache.values()) t.dispose();
  assetTexCache.clear();
  texCache.clear();
}

/** Texture kind -> manifest key for the seamless detail maps. */
const DETAIL_KEYS = { fur: 'tex_fur', scale: 'tex_scale', plate: 'tex_stone' };

/**
 * Manifest tiling map for a surface kind, or null when there is none.
 *
 * Deliberately used as roughnessMap + bumpMap and never as `map`: an albedo map
 * multiplies into the material colour and would darken the per-element palette,
 * whereas roughness/bump variation adds real surface interest under the existing
 * lighting while leaving colour and brightness untouched.
 */
function detailMap(kind) {
  if (!assets) return null;
  const key = DETAIL_KEYS[kind];
  if (!key) return null;
  if (assetTexCache.has(key)) return assetTexCache.get(key);
  let entry = null;
  try { entry = assets.texture(key); } catch (e) { entry = null; }
  if (!entry || !entry.img) return null;
  const tex = new THREE.Texture(entry.img);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.setScalar(entry.repeat || 2);
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  assetTexCache.set(key, tex);
  return tex;
}

/** Convenience: attach the optional detail maps to a MeshStandardMaterial. */
function withDetail(mat, kind, bumpScale) {
  const d = detailMap(kind);
  if (d) { mat.roughnessMap = d; mat.bumpMap = d; mat.bumpScale = bumpScale; }
  return mat;
}

// Soft round blob used for ground shadows and impact flashes.
function radialTexture(inner, outer) {
  const S = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(cv);
}
// ---------------------------------------------------------- beast geometry
// Each builder returns a Group whose userData holds references used by the
// animation pass (legs, wings, arms, head) so walk cycles can drive them.
function buildBiped(palette) {
  const g = new THREE.Group();
  const mat = withDetail(new THREE.MeshStandardMaterial({
    map: cachedSkin('fur', palette.base, palette.accent, 3), roughness: 0.85, metalness: 0.02,
  }), 'fur', 0.022);
  const dark = withDetail(new THREE.MeshStandardMaterial({
    map: cachedSkin('fur', palette.shade, palette.base, 8), roughness: 0.9,
  }), 'fur', 0.022);

  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.34, 0.46), mat);
  hips.position.y = 1.02; hips.castShadow = true; g.add(hips);

  // Torso tapers up to broad shoulders.
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 0.42, 4, 10), mat);
  torso.position.y = 1.5; torso.scale.set(1.05, 1, 0.82); torso.castShadow = true; g.add(torso);

  const head = new THREE.Group();
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.29, 14, 12), mat);
  skull.castShadow = true; head.add(skull);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.19, 0.34), mat);
  snout.position.set(0.2, -0.07, 0); head.add(snout);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 8), dark);
  nose.position.set(0.35, -0.05, 0); head.add(nose);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.16, 6), mat);
    ear.position.set(-0.04, 0.25, 0.16 * s);
    ear.rotation.z = 0.2;
    head.add(ear);
  }
  head.position.y = 2.05; g.add(head);

  const legs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group();
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.42, 3, 8), mat);
    thigh.position.y = -0.28; thigh.castShadow = true; leg.add(thigh);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.12, 0.3), dark);
    foot.position.set(0.06, -0.56, 0); leg.add(foot);
    leg.position.set(0, 0.98, 0.17 * s);
    g.add(leg); legs.push(leg);
  }
  const arms = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.34, 3, 8), mat);
    upper.position.y = -0.22; upper.castShadow = true; arm.add(upper);
    arm.position.set(0.02, 1.72, 0.42 * s);
    arm.rotation.z = 0.12;
    g.add(arm); arms.push(arm);
  }
  // A crude but readable weapon so the silhouette reads as a fighter.
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.78, 0.14),
    new THREE.MeshStandardMaterial({ color: palette.metal, roughness: 0.35, metalness: 0.7 }));
  blade.position.set(0.28, -0.42, 0); blade.rotation.z = -0.2; blade.castShadow = true;
  arms[1].add(blade);

  g.userData.legs = legs;
  g.userData.arms = arms;
  g.userData.head = head;
  g.userData.height = 2.4;
  return g;
}

function buildQuadruped(palette) {
  const g = new THREE.Group();
  const mat = withDetail(new THREE.MeshStandardMaterial({
    map: cachedSkin('fur', palette.base, palette.accent, 21), roughness: 0.88,
  }), 'fur', 0.026);
  const dark = withDetail(new THREE.MeshStandardMaterial({
    map: cachedSkin('fur', palette.shade, palette.base, 27), roughness: 0.92,
  }), 'fur', 0.026);

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.44, 0.92, 4, 12), mat);
  body.rotation.z = Math.PI / 2;            // capsule is Y-up; lay it along X
  body.position.y = 1.02; body.scale.set(1, 1, 0.92);
  body.castShadow = true; g.add(body);

  // Hump over the shoulders -- gives the silhouette a real animal profile.
  const hump = new THREE.Mesh(new THREE.SphereGeometry(0.36, 12, 10), mat);
  hump.position.set(-0.16, 1.34, 0); hump.scale.set(1, 0.8, 0.95);
  hump.castShadow = true; g.add(hump);

  const neck = new THREE.Group();
  const neckMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.36, 3, 8), mat);
  neckMesh.position.y = 0.18; neckMesh.castShadow = true; neck.add(neckMesh);
  const head = new THREE.Group();
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.23, 12, 10), mat);
  skull.castShadow = true; head.add(skull);
  const snout = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.16, 3, 8), mat);
  snout.rotation.z = Math.PI / 2; snout.position.x = 0.26; head.add(snout);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), dark);
  nose.position.x = 0.4; head.add(nose);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.15, 6), mat);
    ear.position.set(-0.05, 0.2, 0.13 * s); ear.rotation.z = 0.25; head.add(ear);
  }
  head.position.y = 0.5; neck.add(head);
  neck.position.set(0.72, 1.18, 0); neck.rotation.z = -0.35;
  g.add(neck);

  const legs = [];
  for (const [lx, lz] of [[0.5, 0.3], [0.5, -0.3], [-0.5, 0.3], [-0.5, -0.3]]) {
    const leg = new THREE.Group();
    const limb = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.5, 3, 8), mat);
    limb.position.y = -0.3; limb.castShadow = true; leg.add(limb);
    const paw = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), dark);
    paw.position.y = -0.58; paw.scale.set(1.2, 0.75, 1); leg.add(paw);
    leg.position.set(lx, 1.0, lz);
    g.add(leg); legs.push(leg);
  }

  const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.5, 3, 6), dark);
  tail.position.set(-0.72, 1.16, 0); tail.rotation.z = Math.PI / 2 - 0.4;
  g.add(tail);

  g.userData.legs = legs;
  g.userData.arms = [];
  g.userData.head = head;
  g.userData.tail = tail;
  g.userData.height = 1.9;
  return g;
}

function buildDragon(palette) {
  const g = new THREE.Group();
  const mat = withDetail(new THREE.MeshStandardMaterial({
    map: cachedSkin('scale', palette.base, palette.accent, 55), roughness: 0.62, metalness: 0.08,
  }), 'scale', 0.03);
  const dark = withDetail(new THREE.MeshStandardMaterial({
    map: cachedSkin('scale', palette.shade, palette.base, 61), roughness: 0.7,
  }), 'scale', 0.03);

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.46, 1.05, 4, 12), mat);
  body.rotation.z = Math.PI / 2; body.position.y = 1.55; body.castShadow = true; g.add(body);
  const belly = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.9, 3, 10),
    new THREE.MeshStandardMaterial({ color: palette.belly, roughness: 0.75 }));
  belly.rotation.z = Math.PI / 2; belly.position.y = 1.28; g.add(belly);

  // Dorsal spines along the spine.
  for (let i = 0; i < 7; i++) {
    const spine = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.34 - i * 0.02, 4), dark);
    spine.position.set(0.5 - i * 0.19, 1.98 - i * 0.02, 0);
    spine.rotation.z = -0.25; g.add(spine);
  }

  // Neck as a tapering chain so it can be posed in an S-curve.
  const neck = new THREE.Group();
  let parent = neck;
  for (let i = 0; i < 4; i++) {
    const seg = new THREE.Group();
    const r = 0.26 - i * 0.045;
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, 0.2, 3, 8), mat);
    m.position.y = 0.19; m.castShadow = true; seg.add(m);
    seg.position.y = i === 0 ? 0 : 0.36;
    seg.rotation.z = i === 0 ? -0.5 : 0.16;
    parent.add(seg); parent = seg;
  }
  const head = new THREE.Group();
  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.28, 0.3), mat);
  skull.castShadow = true; head.add(skull);
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.11, 0.24), dark);
  jaw.position.set(0.06, -0.17, 0); head.add(jaw);
  for (const s of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.44, 5), dark);
    horn.position.set(-0.16, 0.2, 0.09 * s);
    horn.rotation.z = 0.75; head.add(horn);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6),
      new THREE.MeshStandardMaterial({
        color: palette.glow, emissive: palette.glow, emissiveIntensity: 2, roughness: 0.2,
      }));
    eye.position.set(0.14, 0.06, 0.13 * s); head.add(eye);
  }
  head.position.y = 0.4; parent.add(head);
  neck.position.set(0.78, 1.72, 0); g.add(neck);

  const legs = [];
  for (const [lx, lz] of [[0.48, 0.34], [0.48, -0.34], [-0.48, 0.34], [-0.48, -0.34]]) {
    const leg = new THREE.Group();
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.34, 3, 8), mat);
    upper.position.y = -0.2; upper.castShadow = true; leg.add(upper);
    const lower = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.3, 3, 8), dark);
    lower.position.y = -0.56; lower.rotation.z = 0.35; leg.add(lower);
    leg.position.set(lx, 1.45, lz);
    g.add(leg); legs.push(leg);
  }

  const wings = [];
  for (const s of [-1, 1]) {
    const wing = new THREE.Group();
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(1.5, 0.42);
    shape.lineTo(1.15, 1.25);
    shape.lineTo(0.5, 0.95);
    shape.lineTo(0.1, 1.35);
    shape.closePath();
    const membrane = new THREE.Mesh(new THREE.ShapeGeometry(shape),
      new THREE.MeshStandardMaterial({
        color: palette.wing, roughness: 0.55, side: THREE.DoubleSide, transparent: true, opacity: 0.96,
      }));
    membrane.rotation.y = Math.PI / 2; membrane.castShadow = true;
    wing.add(membrane);
    for (let i = 0; i < 3; i++) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.95),
        new THREE.MeshStandardMaterial({ color: palette.shade, roughness: 0.8 }));
      strut.position.set(-0.18 + i * 0.5, 0.3 + i * 0.2, 0.45);
      wing.add(strut);
    }
    wing.position.set(-0.1, 1.95, 0.18 * s);
    wing.rotation.x = 0.25 * s;
    g.add(wing); wings.push(wing);
  }

  const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.85, 3, 8), dark);
  tail.position.set(-0.95, 1.62, 0); tail.rotation.z = Math.PI / 2 - 0.5;
  tail.castShadow = true; g.add(tail);

  g.userData.legs = legs;
  g.userData.arms = [];
  g.userData.head = head;
  g.userData.wings = wings;
  g.userData.height = 2.8;
  return g;
}

const RACE_BUILDERS = { BIPED: buildBiped, QUADRUPED: buildQuadruped, DRAGON: buildDragon };

// ----------------------------------------------------------------- palettes
function paletteFor(elementHex, tier) {
  // Higher tiers read brighter and slightly larger.
  return {
    base: shadeOf(elementHex, 0.62 + tier * 0.1),
    accent: shadeOf(elementHex, 1.25),
    shade: shadeOf(elementHex, 0.34),
    belly: shadeOf(elementHex, 1.5),
    metal: 0xb8c0cc,
    glow: elementHex,
    wing: shadeOf(elementHex, 0.8),
  };
}
// ------------------------------------------------------------------- terrain
const THEMES = {
  forest:  { ground: 0x2f4a2c, lane: 0x4a6b3a, fog: 0x1b2a1c, sun: 0xfff0d0, sky: 0x87a86a },
  volcano: { ground: 0x3a2622, lane: 0x53332a, fog: 0x241412, sun: 0xffb070, sky: 0xb05a30 },
  snow:    { ground: 0x5a6472, lane: 0x8a97a8, fog: 0x39414d, sun: 0xe8f0ff, sky: 0xc8d6e8 },
  citadel: { ground: 0x3c3a44, lane: 0x565263, fog: 0x211f28, sun: 0xffe8c0, sky: 0x6e6a80 },
  arena:   { ground: 0x4a3a2c, lane: 0x6b5238, fog: 0x2a1f16, sun: 0xffe0a0, sky: 0x9a7a50 },
};

function buildTerrain(themeKey) {
  const T = THEMES[themeKey] || THEMES.forest;
  const grp = new THREE.Group();

  const groundMat = withDetail(new THREE.MeshStandardMaterial({
    map: cachedSkin('plate', shadeOf(T.ground, 1.15), shadeOf(T.ground, 0.7), 7),
    roughness: 0.97, metalness: 0,
  }), 'plate', 0.05);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 90), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  grp.add(ground);

  // Lane strips, slightly raised and tinted, with kerbs so the five deployment
  // lanes read clearly from the game camera.
  const laneMat = withDetail(new THREE.MeshStandardMaterial({
    map: cachedSkin('plate', shadeOf(T.lane, 1.1), shadeOf(T.lane, 0.72), 13),
    roughness: 0.9,
  }), 'plate', 0.03);
  const kerbMat = new THREE.MeshStandardMaterial({ color: shadeOf(T.lane, 0.55), roughness: 0.8 });
  const lanes = [];
  for (let i = 0; i < LANE_COUNT; i++) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(FIELD_HALF * 2 + 8, 0.16, LANE_GAP - 0.5), laneMat);
    strip.position.set(0, 0.08, laneZ(i));
    strip.receiveShadow = true;
    grp.add(strip);
    lanes.push(strip);
    for (const s of [-1, 1]) {
      const kerb = new THREE.Mesh(new THREE.BoxGeometry(FIELD_HALF * 2 + 8, 0.2, 0.16), kerbMat);
      kerb.position.set(0, 0.1, laneZ(i) + s * (LANE_GAP / 2 - 0.16));
      kerb.receiveShadow = true;
      grp.add(kerb);
    }
  }

  // Perimeter rocks so the field does not end in empty void.
  const rockMat = withDetail(new THREE.MeshStandardMaterial({
    map: cachedSkin('plate', shadeOf(T.ground, 0.8), shadeOf(T.ground, 0.45), 29),
    roughness: 1.0,
  }), 'plate', 0.04);
  for (let i = 0; i < 46; i++) {
    const a = hash2(i, 3, 5) * Math.PI * 2;
    const rad = 40 + hash2(i, 9, 11) * 30;
    const s = 0.7 + hash2(i, 17, 13) * 2.6;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rockMat);
    rock.position.set(Math.cos(a) * rad * 1.5, s * 0.4, Math.sin(a) * rad);
    rock.rotation.set(hash2(i, 1, 2) * 3, hash2(i, 2, 3) * 3, hash2(i, 4, 5) * 3);
    rock.castShadow = true; rock.receiveShadow = true;
    grp.add(rock);
  }
  grp.userData.lanes = lanes;
  return grp;
}

// --------------------------------------------------------------------- fort
function buildFort(palette, isPlayer) {
  const g = new THREE.Group();
  const stone = withDetail(new THREE.MeshStandardMaterial({
    map: cachedSkin('plate', palette.base, palette.shade, 37), roughness: 0.92, metalness: 0.03,
  }), 'plate', 0.035);
  const trim = new THREE.MeshStandardMaterial({ color: palette.metal, roughness: 0.4, metalness: 0.65 });
  const bannerMat = new THREE.MeshStandardMaterial({
    color: palette.glow, roughness: 0.7, side: THREE.DoubleSide,
    emissive: palette.glow, emissiveIntensity: 0.18,
  });

  // Curtain wall spanning the lane stack.
  const wall = new THREE.Mesh(new THREE.BoxGeometry(2.6, 4.2, LANE_GAP * LANE_COUNT + 2.4), stone);
  wall.position.y = 2.1; wall.castShadow = true; wall.receiveShadow = true; g.add(wall);

  // Battlements.
  const merlons = 11;
  for (let i = 0; i < merlons; i++) {
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.7, 0.55), stone);
      const z = -((LANE_GAP * LANE_COUNT) / 2) + (i / (merlons - 1)) * LANE_GAP * LANE_COUNT;
      m.position.set(0, 4.5, z + s * 0.1);
      m.castShadow = true; g.add(m);
    }
  }
  // Corner towers.
  for (const s of [-1, 1]) {
    const z = s * (LANE_GAP * LANE_COUNT / 2 + 0.9);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.3, 5.4, 12), stone);
    tower.position.set(0, 2.7, z);
    tower.castShadow = true; g.add(tower);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.45, 1.9, 12),
      new THREE.MeshStandardMaterial({ color: palette.shade, roughness: 0.6, metalness: 0.2 }));
    cap.position.set(0, 6.2, z);
    cap.castShadow = true; g.add(cap);
    const band = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.09, 6, 16), trim);
    band.rotation.x = Math.PI / 2;
    band.position.set(0, 4.6, z);
    g.add(band);
  }
  // Central keep.
  const keep = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.6, 3.2), stone);
  keep.position.set(0, 5.5, 0); keep.castShadow = true; g.add(keep);
  const keepRoof = new THREE.Mesh(new THREE.ConeGeometry(2.3, 2.1, 4),
    new THREE.MeshStandardMaterial({ color: palette.accent, roughness: 0.6, metalness: 0.15 }));
  keepRoof.position.set(0, 7.7, 0); keepRoof.rotation.y = Math.PI / 4; keepRoof.castShadow = true;
  g.add(keepRoof);

  // Gate on the facing side.
  const gate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.0, 1.7),
    new THREE.MeshStandardMaterial({ color: palette.shade, roughness: 0.85 }));
  gate.position.set(isPlayer ? 1.35 : -1.35, 1.0, 0);
  g.add(gate);
  const arch = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.14, 6, 14, Math.PI), trim);
  arch.position.set(gate.position.x, 2.0, 0); arch.rotation.y = Math.PI / 2;
  g.add(arch);

  // Banners.
  for (const z of [-3.2, 0, 3.2]) {
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.8), bannerMat);
    banner.position.set(isPlayer ? 1.5 : -1.5, 3.0, z);
    banner.rotation.y = isPlayer ? Math.PI / 2 : -Math.PI / 2;
    g.add(banner);
  }
  return g;
}

// ------------------------------------------------------------------ effects
function buildHpBar() {
  const grp = new THREE.Group();
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.17),
    new THREE.MeshBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.75 }));
  grp.add(bg);
  const fillMat = new THREE.MeshBasicMaterial({ color: 0x66bb6a });
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(1.26, 0.13), fillMat);
  fill.position.z = 0.01;
  grp.add(fill);
  grp.userData.fill = fill;
  grp.userData.fillMat = fillMat;
  return grp;
}
// ---------------------------------------------------------- renderer factory
export { createRenderer3D };

// ui.js is a classic script and cannot import this module, so publish the
// factory globally. Modules are deferred, so this is set before ui.js boots.
if (typeof globalThis !== 'undefined') {
  globalThis.__beastForge3D = { createRenderer3D };
}

function createRenderer3D(canvas, opts) {
  const opts2 = opts || {};
  setAssetStore(opts2.assets);
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, alpha: false, powerPreference: 'high-performance',
    // Allows an offscreen harness to supply an existing context; browsers omit it.
    context: opts2.context,
  });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(46, 16 / 9, 0.5, 400);
  const CAM_TARGET = new THREE.Vector3(0, 2.6, 0);
  camera.position.set(-2, 15, 27);
  camera.lookAt(CAM_TARGET);

  // Key light with a real shadow map, plus sky/ground hemisphere fill and a
  // cool rim so silhouettes separate from the terrain.
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(-18, 30, 16);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const sc = key.shadow.camera;
  sc.left = -46; sc.right = 46; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 110;
  key.shadow.bias = -0.0012;
  scene.add(key);
  scene.add(new THREE.HemisphereLight(0xbcd6ff, 0x2a2018, 0.55));
  const rim = new THREE.DirectionalLight(0x88bbff, 0.5);
  rim.position.set(16, 12, -20);
  scene.add(rim);

  let terrainGroup = null, themeKey = null;
  let skyTex = null;          // manifest background for the current theme
  const raycaster = new THREE.Raycaster();
  // Invisible quads used only for picking a lane from a pointer position.
  const pickMat = new THREE.MeshBasicMaterial({ visible: false });
  const pickPlanes = [];
  for (let i = 0; i < LANE_COUNT; i++) {
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(FIELD_HALF * 2 + 8, LANE_GAP), pickMat);
    pl.rotation.x = -Math.PI / 2;
    pl.position.set(0, 0.2, laneZ(i));
    pl.userData.lane = i;
    scene.add(pl); pickPlanes.push(pl);
  }
  const unitPool = new Map();     // engine unit -> { root, beast, hp, shadow }
  const forts = { player: null, enemy: null };
  const projPool = [];
  const partPool = [];
  const blobTex = radialTexture('rgba(0,0,0,0.5)', 'rgba(0,0,0,0)');
  const flashTex = radialTexture('rgba(255,255,255,0.95)', 'rgba(255,255,255,0)');

  /**
   * Cover-fit a background image to the current viewport, matching what
   * render.js does for the 2D path (it letterboxes unless cover is set). Three
   * draws a scene.background texture across the full NDC quad honouring
   * repeat/offset, so cropping is just a matter of scaling past the edges.
   */
  function fitBackground() {
    if (!skyTex || !skyTex.userData || !skyTex.userData.el) return;
    const el = skyTex.userData.el;
    const w = canvas.clientWidth || canvas.width || 1000;
    const h = canvas.clientHeight || canvas.height || 450;
    const imgAspect = (el.naturalWidth || el.width) / (el.naturalHeight || el.height || 1);
    if (!isFinite(imgAspect) || imgAspect <= 0) return;
    const viewAspect = w / h;
    if (imgAspect > viewAspect) {
      // Image is wider than the view: crop left/right.
      const s = imgAspect / viewAspect;
      skyTex.repeat.set(1 / s, 1);
      skyTex.offset.set((1 - 1 / s) / 2, 0);
    } else {
      // Image is taller: crop top/bottom, biased upward to keep the horizon.
      const s = viewAspect / imgAspect;
      skyTex.repeat.set(1, 1 / s);
      skyTex.offset.set(0, (1 - 1 / s) * 0.62);
    }
  }

  function setTheme(k) {
    if (k === themeKey) return;
    themeKey = k;
    if (terrainGroup) { scene.remove(terrainGroup); disposeTree(terrainGroup); }
    terrainGroup = buildTerrain(k);
    scene.add(terrainGroup);
    const T = THEMES[k] || THEMES.forest;

    // Prefer the painted background from the asset manifest; fall back to the
    // flat theme colour when there is no manifest or no image for this theme.
    let entry = null;
    if (assets) { try { entry = assets.sprite('bg_' + k); } catch (e) { entry = null; } }
    if (skyTex) { skyTex.dispose(); skyTex = null; }
    if (entry && entry.img) {
      skyTex = new THREE.Texture(entry.img);
      skyTex.colorSpace = THREE.SRGBColorSpace;
      skyTex.wrapS = skyTex.wrapT = THREE.ClampToEdgeWrapping;
      skyTex.userData = { el: entry.img };
      skyTex.needsUpdate = true;
      scene.background = skyTex;
    } else {
      scene.background = new THREE.Color(T.sky);
    }
    fitBackground();

    scene.fog = new THREE.Fog(T.fog, 70, 185);
    key.color.setHex(T.sun);
  }

  function setFort(which, hpFrac) {
    if (!forts[which]) {
      const player = which === 'player';
      const palette = {
        base: player ? 0x4a6b8a : 0x8a4a4a, shade: 0x24202a,
        accent: player ? 0x6fa8d0 : 0xd06f6f, metal: 0xc8d0dc,
        glow: player ? 0x6fc8ff : 0xff6f6f,
      };
      const f = buildFort(palette, player);
      f.position.x = player ? -FIELD_HALF : FIELD_HALF;
      f.rotation.y = player ? 0 : Math.PI;
      scene.add(f);
      forts[which] = f;
    }
    // Damage reads as structural collapse: the citadel leans and sinks.
    const dmg = 1 - Math.max(0, Math.min(1, hpFrac));
    forts[which].rotation.z = (which === 'player' ? -1 : 1) * dmg * 0.05;
    forts[which].position.y = -dmg * 0.35;
  }

  function acquire(unit, elementHex, tier) {
    let e = unitPool.get(unit);
    if (!e) {
      const root = new THREE.Group();
      const builder = RACE_BUILDERS[unit.race] || buildQuadruped;
      const beast = builder(paletteFor(elementHex, tier));
      root.add(beast);
      const hp = buildHpBar();
      root.add(hp);
      const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7),
        new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }));
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.02;
      root.add(shadow);
      scene.add(root);
      e = { root, beast, hp };
      unitPool.set(unit, e);
    }
    return e;
  }

  let clock = 0;
  function sync(engine) {
    clock += 1;
    const t = clock / 60;
    setTheme(engine.stageConfig.bgTheme);
    setFort('player', engine.playerFort.currentHp / engine.playerFort.maxHp);
    setFort('enemy', engine.enemyFort.currentHp / engine.enemyFort.maxHp);

    const seen = new Set();
    const all = [];
    for (const u of engine.enemyUnits) all.push(u);
    for (const u of engine.playerUnits) all.push(u);

    for (const u of all) {
      seen.add(u);
      const tier = tierIdx(u.tier);
      const e = acquire(u, elHex(u.element), tier);
      const p = e.beast.userData;
      const x = posToX(u.position);
      const z = laneZ(u.laneIndex);

      const moving = u.state === 'MARCHING';
      const phase = t * (7 + tier) + u.laneIndex * 1.7;
      const stride = moving ? Math.sin(phase) : 0;
      const bob = moving ? Math.abs(Math.sin(phase)) * 0.09 : 0;
      const lunge = u.state === 'ATTACKING' ? Math.sin(clock / 4) * 0.35 : 0;

      e.root.position.set(x + lunge, bob, z);
      // Face the direction of travel; enemies march the other way.
      e.beast.rotation.y = u.isPlayer ? Math.PI / 2 : -Math.PI / 2;

      // Legs swing in opposing pairs.
      const legs = p.legs || [];
      for (let i = 0; i < legs.length; i++) {
        legs[i].rotation.z = moving ? stride * 0.55 * ((i % 2 === 0) ? 1 : -1) : 0;
      }
      // Arms counter-swing; they wind up on attack.
      const arms = p.arms || [];
      for (let i = 0; i < arms.length; i++) {
        if (u.state === 'ATTACKING') arms[i].rotation.x = -1.1 + Math.sin(clock / 3) * 0.5;
        else arms[i].rotation.x = moving ? stride * 0.4 * ((i % 2 === 0) ? -1 : 1) : 0;
      }
      const wings = p.wings || [];
      for (let i = 0; i < wings.length; i++) {
        const s = i === 0 ? 1 : -1;
        wings[i].rotation.x = (0.25 + (moving ? Math.sin(t * 4 + i) * 0.2 : 0)) * s;
      }
      if (p.tail) p.tail.rotation.y = Math.sin(t * 3) * 0.3;

      // HP bar billboards toward the camera and floats above the beast.
      e.hp.position.set(0, (p.height || 2) + 0.55, 0);
      e.hp.quaternion.copy(camera.quaternion);
      const frac = Math.max(0, u.currentHp / u.maxHp);
      e.hp.userData.fill.scale.x = Math.max(0.001, frac);
      e.hp.userData.fill.position.x = -(1 - frac) * 0.63;
      e.hp.userData.fillMat.color.setHex(
        frac > 0.35 ? (u.isPlayer ? 0x66bb6a : 0xef5350) : 0xff1744);

      e.beast.scale.setScalar(1 + tier * 0.16);
      if (u.state === 'DYING') e.beast.scale.multiplyScalar(0.97);
    }

    // Retire units the engine has removed.
    for (const [u, e] of unitPool) {
      if (seen.has(u)) continue;
      scene.remove(e.root);
      disposeTree(e.root);
      unitPool.delete(u);
    }

    syncProjectiles(engine.projectiles);
    syncParticles(engine.particles);
  }

  function syncProjectiles(list) {
    let i = 0;
    for (const p of list) {
      let m = projPool[i];
      if (!m) {
        m = new THREE.Sprite(new THREE.SpriteMaterial({
          map: flashTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        }));
        scene.add(m); projPool[i] = m;
      }
      m.material.color.setHex(elHex(p.element));
      m.scale.setScalar(p.isTurret ? 1.1 : 0.75);
      // Projectile Y is authored in 2D lane space; lift it off the ground.
      m.position.set(posToX(p.currentX), 1.1, laneZ(2));
      m.visible = true;
      m.material.opacity = 0.95;
      i++;
    }
    for (; i < projPool.length; i++) projPool[i].visible = false;
  }

  function syncParticles(list) {
    let i = 0;
    for (const p of list) {
      let s = partPool[i];
      if (!s) {
        s = new THREE.Sprite(new THREE.SpriteMaterial({
          map: flashTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        }));
        scene.add(s); partPool[i] = s;
      }
      const a = Math.max(0, Math.min(1, p.life / p.maxLife));
      s.material.color.set(p.color);
      s.material.opacity = a;
      s.scale.setScalar(Math.max(0.01, p.size * 0.9 * a));
      s.position.set(posToX(p.x), 1.0, laneZ(p.laneIndex === undefined ? 2 : p.laneIndex));
      s.visible = true;
      i++;
    }
    for (; i < partPool.length; i++) partPool[i].visible = false;
  }

  function resize() {
    const w = canvas.clientWidth || canvas.width || 1000;
    const h = canvas.clientHeight || canvas.height || 450;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Keep the whole five-lane field framed on narrow/short viewports.
    const need = FIELD_HALF * 2 + 10;
    camera.position.z = Math.max(26,
      need / (2 * Math.tan((camera.fov * Math.PI / 180) / 2) * camera.aspect) * 0.66);
    camera.lookAt(CAM_TARGET);
    camera.updateProjectionMatrix();
    // The painted background is cover-fitted, so it has to be re-fitted whenever
    // the viewport changes shape.
    fitBackground();
  }

  function highlightLanes(selected, hovered) {
    const lanes = terrainGroup ? terrainGroup.userData.lanes : null;
    if (!lanes) return;
    const T = THEMES[themeKey] || THEMES.forest;
    for (let i = 0; i < lanes.length; i++) {
      const m = lanes[i].material;
      const on = i === selected, hov = i === hovered;
      const k = on ? 1.55 : hov ? 1.28 : 1.0;
      m.color.setHex(shadeOf(T.lane, k));
      m.emissive.setHex(on ? 0x2a5a2a : hov ? 0x142414 : 0x000000);
    }
  }

  /**
   * Map a client Y coordinate to a lane index, or -1 when it misses the field.
   * Projects each lane centre to screen space and takes the nearest, which is
   * both robust to camera angle and consistent with how the 2D renderer bands
   * the field. A raycast would miss whenever the camera is steep, because the
   * lanes stop covering the full canvas height.
   */
  const laneScreenY = [];
  const laneCentre = new THREE.Vector3();
  function laneAtClientY(clientY) {
    const r = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
    const top = r ? r.top : 0;
    const h = r && r.height ? r.height : (canvas.clientHeight || canvas.height || 1);
    let best = -1, bestD = Infinity;
    for (let i = 0; i < LANE_COUNT; i++) {
      laneCentre.set(0, 0.25, laneZ(i)).project(camera);
      const sy = top + ((-laneCentre.y) * 0.5 + 0.5) * h;
      laneScreenY[i] = sy;
      const d = Math.abs(sy - clientY);
      if (d < bestD) { bestD = d; best = i; }
    }
    // Ignore clicks far outside the field (e.g. on the HUD).
    const first = laneScreenY[0], last = laneScreenY[LANE_COUNT - 1];
    const margin = Math.abs(last - first) * 0.5;
    if (bestD > margin) return -1;
    return best;
  }

  /** Matches the 2D renderer's interface so ui.js can use either. */
  function render3D(engine, selectedLane, hoveredLane) {
    resize();
    sync(engine);
    highlightLanes(selectedLane, hoveredLane);
    renderer.render(scene, camera);
  }

  function dispose() {
    if (skyTex) { skyTex.dispose(); skyTex = null; }
    scene.background = null;
    disposeTree(scene);
    renderer.dispose();
  }

  return { render: render3D, sync, resize, dispose, laneAtClientY, scene, camera, renderer };
}

function texCacheHas(tex) {
  for (const t of texCache.values()) if (t === tex) return true;
  return false;
}
function disposeTree(root) {
  root.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m.map && m.map.isCanvasTexture && !texCacheHas(m.map)) m.map.dispose();
        m.dispose();
      }
    }
  });
}
