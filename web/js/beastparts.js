// Painted beast composition.
//
// The original Fort Conquer art ships as TexturePacker sheets of individual
// body parts (body / head / neck_1..5 / tail_1..6 / leg_L_1 / foot_R / ...) with
// no layout data -- every offsetX in those plists is 0, so the original bone
// rig is not recoverable. This module re-imposes a layout of its own and draws
// the parts as a simple layered rig, good enough for an idle bob, a two-frame
// walk cycle and an attack lunge without any skeletal animation system.
//
// Positions are expressed in body-width / body-height units so one template fits
// every species, but joints are resolved from the parts' real pixel sizes rather
// than hard-coded offsets: a foot is placed at the bottom of its own leg, so a
// tiger and a hippo both end up standing on the ground instead of one of them
// floating.
//
// Everything degrades: a missing part, or an atlas that never loaded, makes
// get() return null and the caller falls back to the procedural silhouettes in
// render.js.
'use strict';

// Draw order, back to front.
const ORDER = {
  BIPED: ['leg_R_2', 'leg_L_2', 'foot_R', 'foot_L', 'leg_R_1', 'leg_L_1',
    'body', 'hand_R_2', 'hand_L_2', 'head'],
  QUADRUPED: ['tail_1', 'Hind_leg_R_1', 'Hind_leg_L_1',
    'Hind_foot_R', 'Hind_foot_L', 'body', 'Front_leg_R_1', 'Front_leg_L_1',
    'Front_foot_R', 'Front_foot_L', 'head'],
  DRAGON: ['tail_1', 'Hind_leg_R_1', 'Hind_leg_L_1',
    'Hind_foot_R', 'Hind_foot_L', 'body', 'Front_leg_R_1', 'Front_leg_L_1',
    'Front_foot_R', 'Front_foot_L', 'neck_1', 'neck_2', 'neck_3', 'neck_4',
    'neck_5', 'head']
};

// Anchor points are the centre of the named part unless `at` overrides it.
// `below: p` stacks this part under part p; `y` is measured from the body top.
const LAYOUT = {
  BIPED: {
    order: ORDER.BIPED,
    parts: {
      leg_R_1: { at: 'body', x: 0.20, y: 0.60 },
      leg_L_1: { at: 'body', x: 0.02, y: 0.60 },
      leg_R_2: { below: 'leg_R_1', x: 0.20 },
      leg_L_2: { below: 'leg_L_1', x: 0.02 },
      foot_R: { below: 'leg_R_2', x: 0.22 },
      foot_L: { below: 'leg_L_2', x: 0.04 },
      body:   { x: 0, y: 0 },
      hand_R_2: { at: 'body', x: 0.66, y: 0.28 },
      hand_L_2: { at: 'body', x: 0.56, y: 0.28 },
      head:   { at: 'body', x: 0.62, y: -0.14 }
    }
  },
  QUADRUPED: {
    order: ORDER.QUADRUPED,
    parts: {
      // The tail sprite in the source sheet is nearly as wide as the whole
      // body (hippo: 68px tail on a 105px body). Slung straight back it doubles
      // the creature's bounding box, which forced the width budget to shrink
      // every quadruped below its size category. Overlapping it back under the
      // rump keeps the tail clearly readable while giving the silhouette a
      // sane footprint -- a rig fix rather than a per-sprite scale fudge.
      tail_1: { at: 'body', x: 0.24, y: 0.20 },
      Hind_leg_R_1: { at: 'body', x: 0.22, y: 0.55 },
      Hind_leg_L_1: { at: 'body', x: 0.02, y: 0.55 },
      Hind_foot_R: { below: 'Hind_leg_R_1', x: 0.26 },
      Hind_foot_L: { below: 'Hind_leg_L_1', x: 0.04 },
      body:   { x: 0, y: 0 },
      Front_leg_R_1: { at: 'body', x: 0.66, y: 0.55 },
      Front_leg_L_1: { at: 'body', x: 0.50, y: 0.55 },
      Front_foot_R: { below: 'Front_leg_R_1', x: 0.70 },
      Front_foot_L: { below: 'Front_leg_L_1', x: 0.54 },
      head:   { at: 'body', x: 0.86, y: -0.12 }
    }
  },
  DRAGON: {
    order: ORDER.DRAGON,
    parts: {
      // See QUADRUPED: the dragon tail sprite is 157px wide on a 133px body, so it
      // has to tuck under the rump or the whole creature sprawls.
      tail_1: { at: 'body', x: 0.18, y: 0.20 },
      Hind_leg_R_1: { at: 'body', x: 0.24, y: 0.60 },
      Hind_leg_L_1: { at: 'body', x: 0.04, y: 0.60 },
      Hind_foot_R: { below: 'Hind_leg_R_1', x: 0.28 },
      Hind_foot_L: { below: 'Hind_leg_L_1', x: 0.06 },
      body:   { x: 0, y: 0 },
      Front_leg_R_1: { at: 'body', x: 0.62, y: 0.60 },
      Front_leg_L_1: { at: 'body', x: 0.46, y: 0.60 },
      Front_foot_R: { below: 'Front_leg_R_1', x: 0.66 },
      Front_foot_L: { below: 'Front_leg_L_1', x: 0.50 },
      // The neck is what makes a dragon read as a dragon: five segments
      // stepping up and forward off the shoulders.
      // Each neck segment stacks on the one below it and steps forward, so the
      // neck rises and leans at the same time. No rotation: the chain is then
      // verifiable offline, since a rotated blit cannot be flood-filled.
      neck_1: { at: 'body', x: 0.46, y: 0.16 },
      neck_2: { above: 'neck_1', dx: 0.55 },
      neck_3: { above: 'neck_2', dx: 0.55 },
      neck_4: { above: 'neck_3', dx: 0.55 },
      neck_5: { above: 'neck_4', dx: 0.55 },
      head:   { above: 'neck_5', dx: 0.60 }
    }
  }
};

/**
 * Turn a layout plus a species' part rects into absolute draw instructions, in
 * pixel units relative to the body box's top-left.
 *
 * Each part rect is [atlasX, atlasY, w, h, trimX, trimY, trimW, trimH]. Joints
 * are anchored on the *painted* extent (the trim), never the padded box, so a
 * creature stands on its actual feet rather than on transparent padding.
 *
 * Exported so the offline layout checker can measure exactly what the renderer
 * will draw -- one source of truth, no second copy of these numbers to drift.
 */
function resolveLayout(race, parts, bodyW, bodyH) {
  const layout = LAYOUT[race];
  if (!layout) return null;
  const at = {};

  /** Geometry of one part in body-relative pixel units, painted extents only. */
  const geom = (name) => {
    const r = parts[name];
    if (!r) return null;
    const tw = r.length > 7 ? r[6] : r[2];
    const th = r.length > 7 ? r[7] : r[3];
    return { rect: r, w: tw, h: th };
  };

  // `body` resolves first even though it is not first in draw order.
  const bodyGeom = geom('body') || { rect: [0, 0, bodyW, bodyH], w: bodyW, h: bodyH };
  at.body = { name: 'body', rect: bodyGeom.rect, x: 0, y: 0, w: bodyGeom.w, h: bodyGeom.h, rot: 0 };

  const place = (name) => {
    const g = geom(name);
    if (!g) return null;
    const spec = layout.parts[name] || {};
    let x, y;
    const joint = Math.max(3, g.h * 0.28);
    if (spec.below) {
      const p = at[spec.below];
      if (!p) return null;
      x = p.x + (p.w - g.w) / 2;
      y = p.y + p.h - joint;
    } else if (spec.above) {
      const p = at[spec.above];
      if (!p) return null;
      x = p.x + p.w * (spec.dx || 0) - g.w / 2;
      y = p.y - g.h + joint;
    } else if (spec.behind) {
      // Chains a part off the trailing edge of another (tail segments).
      const p = at[spec.behind];
      if (!p) return null;
      x = p.x - g.w + joint;
      y = p.y + (p.h - g.h) * (spec.dy || 0);
    } else {
      const host = at[spec.at || 'body'];
      if (!host) return null;
      x = host.x + host.w * (spec.x || 0) - g.w / 2;
      y = host.y + host.h * (spec.y || 0) - g.h / 2;
    }
    const node = { name, rect: g.rect, x, y, w: g.w, h: g.h, rot: spec.rot || 0 };
    at[name] = node;
    return node;
  };

  // Draw order is not dependency order: a foot sits under a shin, which sits
  // under a thigh, and the foot is drawn first so it stays behind. Resolve in
  // dependency order, then re-sort into draw order for painting.
  const pending = layout.order.filter((n) => n !== 'body');
  const placed = [];
  let progress = true;
  while (pending.length && progress) {
    progress = false;
    for (let i = 0; i < pending.length; i++) {
      const name = pending[i];
      const spec = layout.parts[name] || {};
      const dep = spec.below || spec.above || spec.behind || spec.at;
      if (dep && dep !== 'body' && !at[dep]) continue;
      const node = place(name);
      pending.splice(i, 1);
      if (node) placed.push(node);
      progress = true;
      break;
    }
  }
  // Anything still pending had a missing parent part; skip it rather than draw
  // it in the wrong place.
  const byName = new Map(placed.map((n) => [n.name, n]));
  const out = layout.order.filter((n) => n !== 'body').map((n) => byName.get(n)).filter(Boolean);
  if (out.length === 0) return null;

  // Normalise so the creature's painted top-left is the origin. Callers place
  // the rig by its bottom edge, which is now the true ground contact.
  let minX = 0, minY = 0, maxX = at.body.w, maxY = at.body.h;
  for (const n of [at.body, ...out]) {
    minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.w); maxY = Math.max(maxY, n.y + n.h);
  }
  for (const n of [at.body, ...out]) { n.x -= minX; n.y -= minY; }
  return { nodes: out, body: at.body, width: maxX - minX, height: maxY - minY };
}

/**
 * Resolves card ids into drawable rigs, caching per card: the same beast appears
 * many times a frame and each lookup would otherwise re-walk the atlas table.
 */
class BeastRig {
  constructor(assets) {
    this.assets = assets;
    this.cache = new Map();
  }

  /** @returns {null | {img, race, species, size, nodes, body, width, height}} */
  get(cardId) {
    if (this.cache.has(cardId)) return this.cache.get(cardId);
    const found = this.assets && this.assets.beastParts
      ? this.assets.beastParts(cardId) : null;
    let rig = null;
    if (found && found.parts && found.parts.body) {
      const [, , bw, bh] = found.parts.body;
      const solved = resolveLayout(found.race, found.parts, bw, bh);
      if (solved) rig = { img: found.img, race: found.race, species: found.species,
        size: found.size || 'MEDIUM', nodes: solved.nodes, body: solved.body,
        width: solved.width, height: solved.height };
    }
    this.cache.set(cardId, rig);
    return rig;
  }

  /**
   * How this creature should be scaled into its lane, and how big that makes it.
   *
   * Delegates to BattleConfig.fitUnit so the renderer and the offline audit
   * cannot disagree, and returns the drawn WIDTH and HEIGHT alongside the
   * scale -- the caller needs those to place health bars above the actual head
   * instead of guessing from a nominal sprite size.
   *
   * Returns null for an unknown card, which the caller must treat as "draw the
   * fallback", never as "scale 0".
   */
  footprint(cardId) {
    const rig = this.get(cardId);
    if (!rig) return null;
    const cfg = (typeof globalThis !== 'undefined' && globalThis.BeastForgeBattle) || null;
    if (!cfg || !cfg.fitUnit) return null;
    const fit = cfg.fitUnit(rig.width, rig.height, rig.size);
    return {
      rig, size: rig.size,
      scale: fit.scale, width: fit.w, height: fit.h,
      widthClamped: fit.widthClamped
    };
  }

  /**
   * Draw a beast standing on the ground line at (x, y).
   *
   * @param pose 'idle' | 'walk' | 'attack' | 'die'
   * @param t    seconds; every pose value is a pure function of t
   * @param opts { scale, facing (1 right / -1 left), flash (0..1), alpha }
   */
  draw(ctx, cardId, x, y, pose, t, opts) {
    const rig = this.get(cardId);
    if (!rig) return false;
    const o = opts || {};
    const s = o.scale || 1;
    const facing = o.facing === -1 ? -1 : 1;

    const cyc = t * (pose === 'walk' ? 7 : 2.2);
    const bob = pose === 'walk' ? Math.sin(cyc * 2) * 0.04 : Math.sin(cyc) * 0.015;
    const lunge = pose === 'attack' ? Math.max(0, Math.sin(t * 9)) * 0.14 : 0;
    const step = pose === 'walk' ? Math.sin(cyc * 2) : 0;
    const die = pose === 'die' ? Math.min(1, t * 2.2) : 0;

    ctx.save();
    ctx.globalAlpha = o.alpha !== undefined ? o.alpha : 1;
    ctx.translate(x + lunge * rig.width * s * facing, y);
    if (die) {
      // Collapse: sink and rotate rather than fade, so a death still reads at
      // a glance in a busy lane.
      ctx.translate(0, die * rig.height * s * 0.35);
      ctx.rotate(die * 1.1 * facing);
      ctx.globalAlpha *= (1 - die * 0.55);
    }
    ctx.scale(s * facing, s);
    ctx.translate(0, -rig.height + bob * rig.height);

    for (const n of rig.nodes) {
      // Legs swing on the walk cycle; feet ride along with them.
      const swing = /leg|foot/i.test(n.name)
        ? step * 0.14 * rig.body.h * (/_L/.test(n.name) ? 1 : -1) : 0;
      ctx.save();
      ctx.translate(n.x + n.w / 2 + swing, n.y + n.h / 2);
      if (n.rot) ctx.rotate(n.rot);
      ctx.drawImage(rig.img, n.rect[0], n.rect[1], n.w, n.h, -n.w / 2, -n.h / 2, n.w, n.h);
      ctx.restore();
    }

    if (o.flash) {
      // Hit flash without a second pass per part: re-stroke the silhouette by
      // drawing the whole rig once more through a white tint.
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = '#fff';
      ctx.globalAlpha = o.flash * 0.8;
      ctx.fillRect(-rig.width, -rig.height, rig.width * 2, rig.height * 2);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
    return true;
  }
}

// Classic <script> order in index.html means the browser picks this up via the
// global; Node picks it up through module.exports. Declared last either way.
if (typeof module !== 'undefined' && module.exports) module.exports = { BeastRig, LAYOUT, resolveLayout };
if (typeof globalThis !== 'undefined') globalThis.__beastForgeRig = { BeastRig, LAYOUT, resolveLayout, footprintOf: (id, cfg) => {
  const r = new BeastRig(globalThis.__beastForgeAssets);
  return r.footprint(id);
} };
