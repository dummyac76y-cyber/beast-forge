// Canvas 2D renderer. Replaces the Compose DrawScope pipeline in
// app/src/main/java/com/example/beastforge/ui/components/BeastRenderer.kt.
//
// Coordinate model, stated once so nothing below has to re-derive it:
//
//   VIRTUAL space is BATTLEFIELD_W x BATTLEFIELD_H. Every gameplay coordinate
//   (unit position, lane index, projectile, particle, floating text) is in
//   virtual units. It is converted to CSS pixels EXACTLY ONCE, by the two
//   helpers `sx()` and `sy()`.
//
//   That "exactly once" is the whole point. drawSprite() used to apply
//   scaleX/scaleY itself while its callers had already applied them, so the
//   generated-sprite path double-stretched both position and size: at a
//   1202x540 canvas a unit at virtual x=300 drew at 300*1.202*1.202 and its
//   lane y was multiplied by 1.2 twice. The painted rig path masked it because
//   it returned first, which is why the bug survived.
//
// Grounding: (x, laneGroundY) is the GROUND CONTACT POINT -- where the feet
// are. Sprites are drawn upward from it. The rig guarantees its bounding box
// bottom is the lowest painted pixel, so feet meet the plane exactly.
//
// Draw order is asserted in render() and by QA; see LAYER_ORDER.
'use strict';

if (typeof require !== 'undefined' && typeof module !== 'undefined') {
  var M = require('./models.js');
}

// Battle geometry lives in battle-config.js, which is also read by
// engine.js, the layout audit and QA. Nothing here redefines a lane.
const CFG = (typeof globalThis !== 'undefined' && globalThis.BeastForgeBattle) || require('./battle-config.js');


// Small rounded-rect path helper. Canvas has native roundRect, but not in every
// engine the web build still supports, and a missing bar corner is not worth a
// crash.
function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  if (ctx.roundRect) { ctx.roundRect(x, y, w, h, rr); return; }
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

const THEMES = {
  forest:  { sky: ['#0B2027', '#1B4332', '#2D6A4F'], ground: '#1B4332', accent: '#40916C' },
  volcano: { sky: ['#2B0A0A', '#6A1B09', '#A63603'], ground: '#4A1206', accent: '#D97706' },
  snow:    { sky: ['#0F1B2B', '#264653', '#4A6FA5'], ground: '#2A3F5F', accent: '#8EC5FF' },
  citadel: { sky: ['#14121F', '#2E2445', '#4C3A6B'], ground: '#241C36', accent: '#9C6BD6' },
  arena:   { sky: ['#1A1024', '#3B1F4E', '#6B2D5C'], ground: '#2A1733', accent: '#E0568A' }
};

class Renderer {
  constructor(canvas, assets) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.assets = assets || (typeof globalThis !== 'undefined' ? globalThis.__beastForgeAssets : null);
    this.scaleX = 1; this.scaleY = 1;
    // Painted creature rig. Null-safe: with no atlas loaded every draw falls
    // through to the procedural silhouettes below.
    const Rig = typeof globalThis !== 'undefined' && globalThis.__beastForgeRig;
    this.rig = Rig ? new Rig.BeastRig(this.assets) : null;
    this.time = 0;
    this.resize();
  }

  // Returns a loaded sprite entry, or null. Null is the normal case and means
  // "draw the procedural version instead".
  sprite(kind, arg) {
    if (!this.assets || typeof this.assets.sprite !== 'function') return null;
    try { return this.assets.sprite(kind, arg); } catch (e) { return null; }
  }

  scene(key) {
    if (!this.assets || typeof this.assets.scene !== 'function') return null;
    try { return this.assets.scene(key); } catch (e) { return null; }
  }

  fortFrame(name) {
    if (!this.assets || typeof this.assets.fortFrames !== 'function') return null;
    try { return this.assets.fortFrames(name); } catch (e) { return null; }
  }

  // Virtual -> CSS pixel. The ONLY place that conversion happens.
  sx(v) { return v * this.scaleX; }
  sy(v) { return v * this.scaleY; }

  /**
   * Blit a sprite whose top-left corner is at VIRTUAL (x, y), sized in VIRTUAL
   * units, optionally mirrored.
   *
   * Takes virtual coordinates only. Callers must not pre-scale: doing so was
   * the double-stretch bug described in the file header.
   */
  drawSprite(spec, vx, vy, vw, vh, mirror) {
    const { ctx } = this;
    const px = this.sx(vx), py = this.sy(vy);
    const pw = vw * this.scaleX, ph = vh * this.scaleY;
    ctx.save();
    ctx.translate(px, py);
    if (mirror) ctx.scale(-1, 1);
    ctx.drawImage(spec.img,
      -pw * spec.anchorX, -ph * spec.anchorY, pw, ph);
    ctx.restore();
  }

  /**
   * Blit a sprite horizontally centred on VIRTUAL x with its BOTTOM edge on
   * VIRTUAL y. This is the grounding contract for ground-based art: the caller's
   * y is always a ground line, never a centre, so nothing can half-sink into
   * the battlefield by accident.
   */
  drawSpriteGrounded(spec, vx, groundVy, vw, vh, mirror) {
    const { ctx } = this;
    const pw = vw * this.scaleX, ph = vh * this.scaleY;
    const px = this.sx(vx), baseY = this.sy(groundVy);
    const anchorY = spec.anchorY === undefined ? 0.5 : spec.anchorY;
    const anchorX = spec.anchorX === undefined ? 0.5 : spec.anchorX;
    // drawImage's y is the frame's top; the frame's bottom is top + ph.
    const top = baseY - ph + ph * anchorY;
    const left = px - pw * anchorX;
    ctx.save();
    if (mirror) {
      ctx.translate(px, 0);
      ctx.scale(-1, 1);
      ctx.translate(-px, 0);
    }
    ctx.drawImage(spec.img, left, top, pw, ph);
    ctx.restore();
  }

  resize() {
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    const cssW = this.canvas.clientWidth || CFG.BATTLEFIELD_W;
    const cssH = this.canvas.clientHeight || CFG.BATTLEFIELD_H;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cssW = cssW; this.cssH = cssH;
    this.scaleX = cssW / CFG.BATTLEFIELD_W;
    this.scaleY = cssH / CFG.BATTLEFIELD_H;
  }

  clear() { this.ctx.clearRect(0, 0, this.cssW, this.cssH); }

  // Screen-space pixel back to virtual lane index (mirrors the Kotlin hit test).
  laneAtClientY(clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const y = clientY - rect.top;
    const lane = CFG.laneAtY(y / this.scaleY);
    return (lane >= 0 && lane < 5) ? lane : -1;
  }

  /**
   * Cover-fit an image over the whole canvas. Anchored to the top rather than
   * centred: the painted backdrops put the horizon in their upper third, and
   * centring pushes it behind the lanes and wastes the composition.
   */
  coverDraw(img, biasY) {
    const { ctx } = this;
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    if (!iw || !ih) return;
    const sr = iw / ih, dr = this.cssW / this.cssH;
    let sw = iw, sh = ih, sx = 0, sy = 0;
    if (sr > dr) { sw = sh * dr; sx = (iw - sw) / 2; }
    else { sh = sw / dr; sy = (ih - sh) * (biasY === undefined ? 0.25 : biasY); }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, this.cssW, this.cssH);
  }

  drawBackground(themeKey) {
    const t = THEMES[themeKey] || THEMES.forest;
    const { ctx } = this;

    // Painted backdrop from the original build, preferred over both the
    // procedural gradient and the older generated bg_* sprite.
    const painted = this.scene('scene_' + themeKey);
    if (painted) {
      this.coverDraw(painted.img, 0.2);
      this.drawDepthGrade();
      this.drawAtmosphere(themeKey);
      return;
    }
    const bg = this.sprite('bg_' + themeKey);
    if (bg) {
      this.coverDraw(bg.img, 0.5);
      this.drawDepthGrade();
      this.drawAtmosphere(themeKey);
      return;
    }

    const g = ctx.createLinearGradient(0, 0, 0, this.cssH);
    g.addColorStop(0, t.sky[0]); g.addColorStop(0.55, t.sky[1]); g.addColorStop(1, t.sky[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.cssW, this.cssH);

    // Distant ridgeline.
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = t.ground;
    ctx.beginPath();
    ctx.moveTo(0, this.cssH * 0.42);
    for (let x = 0; x <= this.cssW; x += this.cssW / 12) {
      const n = Math.sin(x * 0.011) * 26 + Math.cos(x * 0.027) * 14;
      ctx.lineTo(x, this.cssH * 0.30 + n);
    }
    ctx.lineTo(this.cssW, this.cssH); ctx.lineTo(0, this.cssH); ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Ground plane.
    const gy = this.sy(CFG.FIELD_TOP);
    const gg = ctx.createLinearGradient(0, gy, 0, this.cssH);
    gg.addColorStop(0, t.ground); gg.addColorStop(1, t.sky[2]);
    ctx.fillStyle = gg;
    ctx.fillRect(0, gy, this.cssW, this.cssH - gy);
  }

  /**
   * Depth grade: pushes the backdrop AWAY from the viewer.
   *
   * Painted backdrops are finished illustrations with their own full-contrast
   * palette. Left untouched they read as the subject, and beasts drawn over them
   * look like stickers. Two cheap passes fix the layering without repainting
   * the art:
   *
   *   1. a partial desaturation of the whole frame (a grey fill in
   *      'saturation' blend mode takes the colour out of the backdrop);
   *   2. a cool dark wash that is strongest at the top and vanishes by the
   *      horizon, so the sky recedes and the ground plane comes forward.
   *
   * Applied before the playfield plate, so the battlefield keeps its colour and
   * the contrast between "world" and "gameplay" is deliberate rather than
   * accidental. These are graded passes, not a colour-scheme override -- the
   * element palette still reads.
   */
  drawDepthGrade() {
    const { ctx } = this;
    const W = this.cssW, H = this.cssH;
    ctx.save();

    // 1. Knock the backdrop back. Strength is deliberately modest: enough to
    // stop the art competing, not enough to grey out the biome.
    ctx.globalCompositeOperation = 'saturation';
    ctx.globalAlpha = 0.34;
    ctx.fillStyle = 'hsl(0,0%,50%)';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    // 2. Cool depth wash, heaviest in the sky.
    const wash = ctx.createLinearGradient(0, 0, 0, this.sy(CFG.FIELD_TOP) + H * 0.06);
    wash.addColorStop(0.00, 'rgba(8,12,22,0.52)');
    wash.addColorStop(0.45, 'rgba(10,16,28,0.30)');
    wash.addColorStop(0.82, 'rgba(14,20,30,0.12)');
    wash.addColorStop(1.00, 'rgba(20,24,30,0.00)');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, W, this.sy(CFG.FIELD_TOP) + H * 0.06);

    // 3. Horizon haze: a thin warm band right above the playfield so the
    // ground plane separates from the backdrop instead of bleeding into it.
    const hz = this.sy(CFG.FIELD_TOP);
    const hazeH = Math.max(4, H * 0.035);
    const haze = ctx.createLinearGradient(0, hz - hazeH, 0, hz + hazeH * 0.4);
    haze.addColorStop(0, 'rgba(0,0,0,0)');
    haze.addColorStop(0.7, 'rgba(196,178,148,0.10)');
    haze.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, hz - hazeH, W, hazeH * 1.4);

    ctx.restore();
  }

  /**
   * Atmosphere pass, drawn between the backdrop and the units.
   *
   * Deliberately restrained: a drifting ground fog, one soft light shaft, a
   * handful of drifting motes and a corner vignette. The point is to give the
   * painted backdrop depth and keep the eye in the middle of the board, not to
   * fog up the lanes. Everything is a pure function of this.time, so a frame
   * is reproducible and the whole pass is a handful of gradient fills.
   */
  drawAtmosphere(themeKey) {
    const { ctx } = this;
    const t = THEMES[themeKey] || THEMES.forest;
    const W = this.cssW, H = this.cssH;
    const gy = this.sy(CFG.FIELD_TOP);
    const tm = this.time;

    // Ground fog: two slow horizontal bands drifting in opposite directions.
    for (let i = 0; i < 2; i++) {
      const speed = i ? -7 : 11;
      const y = gy + (i ? H * 0.10 : -H * 0.03) + Math.sin(tm * 0.25 + i) * H * 0.012;
      const h = H * (i ? 0.20 : 0.13);
      const off = ((tm * speed) % (W * 0.5) + W * 0.5) % (W * 0.5);
      const g = ctx.createLinearGradient(0, y - h * 0.5, 0, y + h * 0.5);
      g.addColorStop(0, 'rgba(190,205,235,0)');
      g.addColorStop(0.5, `rgba(190,205,235,${i ? 0.07 : 0.05})`);
      g.addColorStop(1, 'rgba(190,205,235,0)');
      ctx.fillStyle = g;
      ctx.fillRect(-off, y - h * 0.5, W * 1.5, h);
    }

    // Light shaft from the upper left, breathing slowly.
    const shaft = ctx.createLinearGradient(0, 0, W * 0.55, H * 0.8);
    const sa = 0.05 + Math.sin(tm * 0.5) * 0.015;
    shaft.addColorStop(0, `rgba(255,236,190,${sa})`);
    shaft.addColorStop(1, 'rgba(255,236,190,0)');
    ctx.fillStyle = shaft;
    ctx.beginPath();
    ctx.moveTo(W * 0.02, 0); ctx.lineTo(W * 0.34, 0);
    ctx.lineTo(W * 0.62, H); ctx.lineTo(W * 0.16, H);
    ctx.closePath(); ctx.fill();

    // Ambient motes. Fixed positions from a cheap hash, so they never
    // respawn visibly and there is no allocation per frame.
    ctx.fillStyle = t.particle || 'rgba(255,213,79,0.5)';
    for (let i = 0; i < 26; i++) {
      const seed = i * 2654435761 % 1000 / 1000;
      const bx = ((i * 97) % 100) / 100;
      const sp = 0.012 + seed * 0.03;
      const y = H - ((tm * sp * H) + seed * H * 2) % (H * 1.15);
      const x = bx * W + Math.sin(tm * 0.6 + i) * W * 0.012;
      const a = 0.10 + seed * 0.22;
      ctx.globalAlpha = a * (0.5 + 0.5 * Math.sin(tm * 1.3 + i * 2));
      ctx.beginPath();
      ctx.arc(x, y, 0.8 + seed * 1.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** Corner darkening drawn last, so the board sits inside a frame. */
  drawVignette() {
    const { ctx } = this;
    const W = this.cssW, H = this.cssH;
    const g = ctx.createRadialGradient(W / 2, H * 0.52, H * 0.25, W / 2, H * 0.52, H * 0.95);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  /**
   * The battlefield plate.
   *
   * The painted backdrops are detailed illustrations, and measured at the lane
   * band they carry an sd of 27-44 -- busy enough that units fought the scenery
   * for attention. Two things fix that without repainting the art:
   *
   *   1. a darkened, slightly desaturated plate over FIELD_TOP..FIELD_BOTTOM,
   *      which drops the local contrast behind units without hiding the art;
   *   2. lane separation as engraved ground lines plus a soft alternating tint,
   *      rather than translucent full-width rectangles with hard borders.
   *
   * Measured lane-boundary contrast before this was +/-3/255, i.e. invisible.
   * The engraved line below is designed to clear a 10/255 threshold while
   * staying clearly "part of the ground" rather than "UI rectangles".
   */
  drawLanes(selectedLane, hoveredLane) {
    const { ctx } = this;
    const top = this.sy(CFG.FIELD_TOP);
    const h = (CFG.FIELD_BOTTOM - CFG.FIELD_TOP) * this.scaleY;
    const W = this.cssW;

    ctx.save();
    // (1) Playfield plate. Soft-edged so it does not read as a rectangle.
    const plate = ctx.createLinearGradient(0, top - h * 0.10, 0, top + h * 1.10);
    plate.addColorStop(0.00, 'rgba(6,9,14,0.00)');
    plate.addColorStop(0.14, 'rgba(6,9,14,0.42)');
    plate.addColorStop(0.86, 'rgba(6,9,14,0.42)');
    plate.addColorStop(1.00, 'rgba(6,9,14,0.00)');
    ctx.fillStyle = plate;
    ctx.fillRect(0, top - h * 0.10, W, h * 1.20);

    // (2) Alternating lane tint. Enough that adjacent lanes differ in mean
    // luminance, not enough to look like coloured UI bands.
    for (let i = 0; i < CFG.LANE_COUNT; i++) {
      const y = this.sy(CFG.LANE_START + i * CFG.LANE_HEIGHT);
      const lh = CFG.LANE_HEIGHT * this.scaleY;
      ctx.fillStyle = i % 2 ? 'rgba(255,244,220,0.058)' : 'rgba(0,0,0,0.135)';
      ctx.fillRect(0, y, W, lh);
    }

    // (3) Engraved separators: a dark groove with a warm upper lip reads as a
    // worn track boundary rather than a UI divider. Sized in virtual units so
    // the step is the same physical weight at any canvas scale.
    for (let i = 0; i <= CFG.LANE_COUNT; i++) {
      const y = this.sy(CFG.LANE_START + i * CFG.LANE_HEIGHT);
      const groove = Math.max(2, 2.4 * this.scaleY);
      const lip = Math.max(1, 1.1 * this.scaleY);
      ctx.fillStyle = 'rgba(0,0,0,0.52)';
      ctx.fillRect(0, y, W, groove);
      ctx.fillStyle = 'rgba(255,236,198,0.17)';
      ctx.fillRect(0, y + groove, W, lip);
    }

    // (4) The active lane, if any. Bounded to the plate so it lights the track
    // rather than the whole screen.
    const active = hoveredLane >= 0 ? hoveredLane : selectedLane;
    if (active >= 0 && active < CFG.LANE_COUNT) {
      const y = this.sy(CFG.LANE_START + active * CFG.LANE_HEIGHT);
      const lh = CFG.LANE_HEIGHT * this.scaleY;
      const g = ctx.createLinearGradient(0, y, 0, y + lh);
      g.addColorStop(0, 'rgba(255,205,110,0.10)');
      g.addColorStop(0.5, 'rgba(255,205,110,0.055)');
      g.addColorStop(1, 'rgba(255,205,110,0.10)');
      ctx.fillStyle = g;
      ctx.fillRect(0, y, W, lh);
      // Deploy markers: a chevron at the player's deployment edge.
      ctx.fillStyle = 'rgba(255,205,110,0.34)';
      const my = y + lh / 2;
      const mh = 7 * this.scaleY;
      for (const mx of [0.06 * W, 0.94 * W]) {
        ctx.beginPath();
        ctx.moveTo(mx - mh * 0.5, my - mh);
        ctx.lineTo(mx + mh * 0.5, my);
        ctx.lineTo(mx - mh * 0.5, my + mh);
        ctx.closePath();
        ctx.fill();
      }
    }

    // (5) Soften the plate into the surrounding art at both edges.
    const topFade = ctx.createLinearGradient(0, top - h * 0.16, 0, top);
    topFade.addColorStop(0, 'rgba(6,9,14,0)');
    topFade.addColorStop(1, 'rgba(6,9,14,0.34)');
    ctx.fillStyle = topFade;
    ctx.fillRect(0, top - h * 0.16, W, h * 0.16);
    const botFade = ctx.createLinearGradient(0, CFG.FIELD_BOTTOM * this.scaleY, 0, CFG.FIELD_BOTTOM * this.scaleY + h * 0.16);
    botFade.addColorStop(0, 'rgba(6,9,14,0.34)');
    botFade.addColorStop(1, 'rgba(6,9,14,0)');
    ctx.fillStyle = botFade;
    ctx.fillRect(0, CFG.FIELD_BOTTOM * this.scaleY, W, h * 0.16);
    ctx.restore();
  }

  /**
   * One scale factor per fortress side, derived from that side's TALLEST damage
   * frame, then reused for every damage state.
   *
   * The bug this replaces: each frame was scaled to a common target height
   * (`k = targetH / rh`). The ruined enemy frame is only 291px tall where the
   * intact one is 480px, so scaling each to the same height MAGNIFIED the ruin
   * by 1.65x -- a battered castle rendered taller and fatter than a pristine
   * one. Damage states inverted.
   *
   * With a single factor, a shorter source frame simply draws shorter, which is
   * exactly what a collapsing fortress should look like.
   */
  fortScale(isPlayer) {
    const spec = isPlayer ? CFG.FORT_PLAYER : CFG.FORT_ENEMY;
    const prefix = `castle_${isPlayer ? 1 : 2}_`;
    let tallest = 0;
    for (let st = 1; st <= 3; st++) {
      const f = this.fortFrame(prefix + st);
      if (f) tallest = Math.max(tallest, f.rect[3]);
    }
    return tallest ? spec.height / tallest : 1;
  }

  drawFort(fort, isPlayer) {
    const { ctx } = this;
    const spec = isPlayer ? CFG.FORT_PLAYER : CFG.FORT_ENEMY;
    const cx = this.sx(spec.x);
    const baseY = this.sy(CFG.FORT_BASE_Y);
    const frac = Math.max(0, Math.min(1, fort.currentHp / fort.maxHp));

    // Painted fortress with a real damage state: the castle visibly collapses
    // as its HP falls instead of only shrinking.
    const state = frac > 0.66 ? 1 : (frac > 0.33 ? 2 : 3);
    const painted = this.fortFrame(`castle_${isPlayer ? 1 : 2}_${state}`);
    let topY = baseY - spec.height * this.scaleY;
    let drawW = 0;

    if (painted) {
      const [rx, ry, rw, rh] = painted.rect;
      const k = this.fortScale(isPlayer) * this.scaleY;
      const targetW = rw * k, targetH = rh * k;
      drawW = targetW;
      // Anchored at the base line, so every damage state stands on the same
      // ground and a shorter ruin simply occupies less vertical space.
      ctx.save();
      if (!isPlayer) {
        ctx.translate(cx, 0); ctx.scale(-1, 1); ctx.translate(-cx, 0);
      }
      ctx.drawImage(painted.img, rx, ry, rw, rh,
        cx - targetW / 2, baseY - targetH, targetW, targetH);
      ctx.restore();
      topY = baseY - targetH;
    } else {
      const gspec = this.sprite('fort_' + (isPlayer ? 'player' : 'enemy'));
      if (gspec) {
        const hV = CFG.FORT_PLAYER.height, wV = hV * 0.42;
        drawW = wV * this.scaleX;
        ctx.save();
        ctx.globalAlpha = 1;
        this.drawSpriteGrounded(gspec, spec.x, CFG.FORT_BASE_Y, wV, hV, !isPlayer);
        ctx.restore();
        topY = this.sy(CFG.FORT_BASE_Y - hV);
      } else {
        // Procedural curtain wall fallback.
        const h = (CFG.FIELD_BOTTOM - CFG.FIELD_TOP + 24);
        const w = 46;
        const y0 = baseY - h * this.scaleY;
        drawW = w * this.scaleX;
        ctx.fillStyle = isPlayer ? '#3A3F4B' : '#4A3038';
        ctx.fillRect(cx - drawW / 2, y0, drawW, h * this.scaleY);
        ctx.fillStyle = isPlayer ? '#4A5160' : '#5C3A44';
        for (let i = 0; i < 6; i++) {
          ctx.fillRect(cx - drawW / 2, y0 + (h * this.scaleY / 6) * i, drawW, 5 * this.scaleY);
        }
        ctx.fillStyle = isPlayer ? '#6C7686' : '#7A4C58';
        for (let i = 0; i < 4; i++) {
          ctx.fillRect(cx - drawW / 2 + (drawW / 4) * i, y0 - 7 * this.scaleY, drawW / 5, 8 * this.scaleY);
        }
        topY = y0 - 7 * this.scaleY;
      }
    }

    // HP bar is placed from the fortress's ACTUAL drawn top, so it tracks the
    // art as the castle collapses instead of floating at a fixed offset.
    this.drawFortHpBar(cx, topY, drawW, frac, isPlayer);
  }

  /** Shared HP bar so every fort path draws it identically. */
  drawFortHpBar(cx, topY, drawW, frac, isPlayer) {
    const { ctx } = this;
    const bw = Math.max(46, Math.min(drawW, 120));
    const bh = Math.max(5, 7 * this.scaleY);
    const bx = cx - bw / 2;
    const by = topY - 14 * this.scaleY - bh;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    roundRect(ctx, bx - 1.5, by - 1.5, bw + 3, bh + 3, 2);
    ctx.fill();
    ctx.fillStyle = frac > 0.35 ? (isPlayer ? '#4CAF50' : '#FF5252') : '#FF1744';
    ctx.fillRect(bx, by, bw * frac, bh);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    for (let i = 1; i < 4; i++) ctx.fillRect(bx + (bw / 4) * i, by, 1, bh);
    ctx.strokeStyle = isPlayer ? 'rgba(120,220,160,0.55)' : 'rgba(255,140,140,0.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx - 0.5, by - 0.5, bw + 1, bh + 1);
    ctx.restore();
  }

  // Beast silhouettes by race, tinted by element.
  drawUnit(u) {
    const { ctx } = this;
    const vx = u.position;                              // VIRTUAL x
    const vy = CFG.laneGroundY(u.laneIndex);            // VIRTUAL ground line
    const x = this.sx(vx), y = this.sy(vy);             // CSS px
    const col = M.ELEMENT[u.element].color;
    // Idle bob is a pure function of this.time so a paused battle still breathes
    // and a given frame is reproducible.
    const bob = u.state === 'MARCHING' ? Math.sin(this.time * 7 + u.laneIndex) * 2.2 : 0;
    const alpha = u.state === 'DYING' ? 0.55 : 1;

    // Painted creature from the original build, composed from its parts and
    // posed by the rig.
    //
    // `footprint()` returns the scale AND the resulting drawn size from the
    // shared config, so the bar below is placed against the real head position
    // rather than a nominal sprite height.
    if (this.rig) {
      const pose = u.state === 'DYING' ? 'die'
        : u.state === 'ATTACKING' ? 'attack'
        : u.state === 'MARCHING' ? 'walk' : 'idle';
      const fp = this.rig.footprint(u.cardId);
      if (fp) {
        // The rig draws from its left edge with (x, y) as the ground contact.
        const left = vx - fp.width / 2;
        const drawn = this.rig.draw(ctx, u.cardId,
          this.sx(left), this.sy(vy) + bob, pose, this.time, {
            scale: fp.scale * this.scaleY,
            alpha,
            facing: u.isPlayer ? 1 : -1,
            flash: u.state === 'ATTACKING' ? 0.22 : 0
          });
        if (drawn) {
          this.drawUnitAura(x, y, col, fp.width, fp.height);
          // Bars are derived from what was actually drawn.
          this.drawUnitBars(u, x, y, bob, fp.width, fp.height);
          return;
        }
      }
    }

    // Generated unit sprite fallback. Same footing as the rig path: virtual
    // coordinates in, virtual dimensions, feet on the lane ground line.
    const spec = this.sprite('unit_' + String(u.race).toLowerCase());
    if (spec) {
      const natW = spec.frameW || 78, natH = spec.frameH || 78;
      const fit = CFG.fitUnit(natW, natH, 'MEDIUM');
      this.drawUnitAura(x, y, col, fit.w, fit.h);
      ctx.save();
      ctx.globalAlpha = alpha;
      this.drawSpriteGrounded(spec, vx, vy + bob, fit.w, fit.h,
        spec.flipOnEnemy ? !u.isPlayer : false);
      ctx.restore();
      this.drawUnitBars(u, x, this.sy(vy + bob), 0, fit.w, fit.h);
      return;
    }

    // Procedural silhouette fallback -- also grounded on the lane.
    const r = (CFG.UNIT_BASE_HEIGHT * CFG.LANE_HEIGHT) * 0.5 * this.scaleY;
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.globalAlpha = alpha;
    this.drawUnitAura(0, 0, col, r * 2.6, r * 2.6);
    ctx.scale(u.isPlayer ? 1 : -1, 1);
    ctx.fillStyle = col; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.5;
    this.drawProceduralBeast(u.race, r);
    ctx.restore();

    if (u.state === 'ATTACKING') {
      ctx.save();
      ctx.globalAlpha = 0.28; ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(x, y, r * 1.55, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    this.drawUnitBars(u, x, y, bob, r * 2.4, r * 2.4);
  }

  /** Element aura on the ground under a unit. Keeps affinity readable. */
  drawUnitAura(x, y, col, w, h) {
    const { ctx } = this;
    const rad = Math.max(8, w * 0.62) * this.scaleY;
    const g = ctx.createRadialGradient(x, y - h * this.scaleY * 0.30, 2, x, y - h * this.scaleY * 0.30, rad);
    g.addColorStop(0, col + '33');
    g.addColorStop(1, col + '00');
    ctx.save();
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y - h * this.scaleY * 0.06, rad, rad * 0.52, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawProceduralBeast(race, r) {
    const { ctx } = this;
    if (race === 'DRAGON') {
      ctx.beginPath();
      ctx.moveTo(-r * 0.2, -r * 0.2); ctx.lineTo(-r * 1.6, -r * 1.1);
      ctx.lineTo(-r * 0.5, r * 0.4); ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-r * 0.2, r * 0.2); ctx.lineTo(-r * 1.6, r * 1.0);
      ctx.lineTo(-r * 0.5, -r * 0.4); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, 0, r * 1.05, r * 0.72, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(r * 0.8, -r * 0.55); ctx.lineTo(r * 1.5, -r * 0.15); ctx.lineTo(r * 0.8, r * 0.15);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(r * 0.9, -r * 0.6); ctx.lineTo(r * 1.15, -r * 1.25);
      ctx.moveTo(r * 1.15, -r * 0.6); ctx.lineTo(r * 1.45, -r * 1.1);
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-r, r * 0.2); ctx.quadraticCurveTo(-r * 1.8, r * 0.9, -r * 1.5, r * 1.5); ctx.stroke();
    } else if (race === 'QUADRUPED') {
      ctx.fillRect(-r * 1.15, -r * 0.35, r * 2.0, r * 0.95); ctx.strokeRect(-r * 1.15, -r * 0.35, r * 2.0, r * 0.95);
      ctx.beginPath(); ctx.ellipse(r * 1.05, -r * 0.45, r * 0.5, r * 0.45, 0, 0, Math.PI * 2); ctx.fill();
      for (const lx of [-0.85, -0.3, 0.45, 0.9]) ctx.fillRect(r * lx - 1.6, r * 0.5, r * 0.32, r * 0.85);
      ctx.beginPath(); ctx.moveTo(-r * 1.1, 0); ctx.quadraticCurveTo(-r * 1.8, -r * 0.7, -r * 1.45, -r * 1.25); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.ellipse(0, -r * 0.15, r * 0.72, r * 0.95, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(r * 0.42, -r * 1.05, r * 0.46, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(-r * 0.5, r * 0.6, r * 0.36, r * 0.95);
      ctx.fillRect(r * 0.18, r * 0.6, r * 0.36, r * 0.95);
      ctx.beginPath(); ctx.moveTo(r * 0.2, -r * 0.5); ctx.lineTo(r * 1.25, -r * 0.15); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(r * 0.2, -r * 0.3); ctx.lineTo(r * 1.05, r * 0.45); ctx.stroke();
    }
  }

  /**
   * HP bar + tier pip.
   *
   * `drawW`/`drawH` are the unit's ACTUAL drawn size in virtual units. The bar
   * is centred on the unit and hung a fixed gap above its head, so it follows
   * a moving unit, follows a dying unit's collapse, and adapts to a bigger
   * creature instead of assuming one nominal sprite height.
   */
  drawUnitBars(u, x, groundY, bob, drawW, drawH) {
    const { ctx } = this;
    const hpFrac = Math.max(0, Math.min(1, u.currentHp / u.maxHp));
    const hPx = drawH * this.scaleY;
    // Bar width follows the creature, clamped so a MASSIVE dragon does not get
    // an enormous bar and a SMALL goblin does not get an unreadable one.
    const bwV = Math.max(CFG.UNIT_BAR_MIN_W, Math.min(CFG.UNIT_BAR_MAX_W, drawW * 0.72));
    const bw = bwV * this.scaleX;
    const bh = Math.max(3, CFG.UNIT_BAR_HEIGHT * this.scaleY);
    // Head top in CSS px, then a gap upward.
    const headTop = groundY - hPx + (bob || 0);
    const by = headTop - CFG.UNIT_BAR_GAP * this.scaleY - bh;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    roundRect(ctx, x - bw / 2 - 1, by - 1, bw + 2, bh + 2, 1.5);
    ctx.fill();
    ctx.fillStyle = u.isPlayer ? '#5FBF6B' : '#E05A52';
    ctx.fillRect(x - bw / 2, by, bw * hpFrac, bh);
    // Tier pip, offset outside the bar so it never eats HP width.
    ctx.fillStyle = M.TIER[u.tier].color;
    ctx.fillRect(x - bw / 2 - 4 * this.scaleX, by, 2.4 * this.scaleX, bh);
    ctx.restore();
  }

  laneY(laneIndex) { return this.sy(CFG.laneGroundY(laneIndex)); }

  drawProjectiles(list) {
    const { ctx } = this;
    for (const p of list) {
      const x = this.sx(p.currentX), y = this.sy(p.currentY);
      const col = M.ELEMENT[p.element].color;
      const rr = (p.isTurret ? 5 : 3.5) * this.scaleY;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rr * 3);
      g.addColorStop(0, col); g.addColorStop(1, col + '00');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, rr * 3, 0, Math.PI * 2); ctx.fill();
      drawElementBolt(ctx, p.element, x, y, rr, this.time, p.isTurret);
    }
  }

  drawParticles(list) {
    const { ctx } = this;
    for (const p of list) {
      const a = Math.max(0, Math.min(1, p.life / p.maxLife));
      ctx.globalAlpha = a;
      drawElementParticle(ctx, p.element || 'EARTH', this.sx(p.x), this.sy(p.y),
        p.size * this.scaleY * a, p.color);
    }
    ctx.globalAlpha = 1;
  }

  drawFloatingTexts(list) {
    const { ctx } = this;
    ctx.textAlign = 'center';
    for (const t of list) {
      const a = Math.max(0, Math.min(1, t.life / t.maxLife));
      ctx.globalAlpha = a;
      ctx.fillStyle = t.color;
      ctx.font = 'bold ' + (13 * this.scaleY).toFixed(1) + 'px system-ui, sans-serif';
      const y = this.sy(t.y) - (1 - a) * 26 * this.scaleY;
      ctx.fillText(t.text, this.sx(t.x), y);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  render(engine, selectedLane, hoveredLane) {
    this.resize();
    this.clear();
    // Wall-clock, not the engine clock: atmosphere and idle animation keep
    // moving while the battle is paused, so the scene never looks frozen.
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
    if (this._lastFrame === undefined) this._lastFrame = now;
    this.time += Math.min(0.05, now - this._lastFrame);
    this._lastFrame = now;

    // Strict back-to-front. The background and the playfield plate are painted
    // first and nothing environmental is allowed back over a unit.
    for (const step of LAYER_ORDER) {
      switch (step) {
        case 'background': this.drawBackground(engine.stageConfig.bgTheme); break;
        case 'battlefield': this.drawLanes(selectedLane, hoveredLane); break;
        case 'forts':
          this.drawFort(engine.playerFort, true);
          this.drawFort(engine.enemyFort, false);
          break;
        case 'units':
          for (const u of engine.enemyUnits) this.drawUnit(u);
          for (const u of engine.playerUnits) this.drawUnit(u);
          break;
        case 'projectiles': this.drawProjectiles(engine.projectiles); break;
        case 'vfx': this.drawParticles(engine.particles); break;
        case 'texts': this.drawFloatingTexts(engine.floatingTexts); break;
        case 'foreground': this.drawVignette(); break;
      }
    }
  }
}

// Authoritative paint order. render() walks this list, and QA asserts the live
// renderer honours it -- so a background asset can never accidentally end up
// drawn over a gameplay unit.
const LAYER_ORDER = [
  'background', 'battlefield', 'forts', 'units', 'projectiles', 'vfx', 'texts', 'foreground'
];

// ---------------------------------------------------------------- VFX
// Flat 2D effects, shape chosen per element so a glance at the board tells you
// what hit you. Everything is drawn from a time seed, so a frame is
// reproducible and nothing allocates per particle.

/** In-flight projectile body. */
function drawElementBolt(ctx, element, x, y, r, time, isTurret) {
  const col = M.ELEMENT[element] ? M.ELEMENT[element].color : '#FFD54F';
  ctx.save();
  ctx.translate(x, y);
  switch (element) {
    case 'FIRE':
      // Teardrop with a bright core.
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(0, -r * 1.5);
      ctx.quadraticCurveTo(r, 0, 0, r);
      ctx.quadraticCurveTo(-r, 0, 0, -r * 1.5);
      ctx.fill();
      ctx.fillStyle = '#FFF3C4';
      ctx.beginPath(); ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2); ctx.fill();
      break;
    case 'ICE': {
      // Faceted shard with internal facet lines.
      ctx.fillStyle = col;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + time * 0.6;
        const rr = r * (i % 2 ? 1.25 : 0.8);
        ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-r * 0.6, -r * 0.6); ctx.lineTo(r * 0.6, r * 0.6);
      ctx.moveTo(r * 0.6, -r * 0.6); ctx.lineTo(-r * 0.6, r * 0.6);
      ctx.stroke();
      break;
    }
    case 'LIGHTNING': {
      // Jittered bolt, flickering on a fast clock.
      const seed = Math.floor(time * 22) % 5;
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(1.2, r * 0.4);
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i <= 4; i++) {
        const t = i / 4;
        const j = (seed * 7 + i * 13) % 5 - 2;
        ctx.lineTo((t - 0.5) * r * 3.4, j * r * 0.42);
      }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = Math.max(0.6, r * 0.16);
      ctx.stroke();
      break;
    }
    case 'POISON': {
      // Bubbles of varying radius.
      ctx.fillStyle = col;
      for (let i = 0; i < 3; i++) {
        const a = time * 2 + i * 2.1;
        const rr = r * (0.42 + (i % 2) * 0.3);
        ctx.globalAlpha = 0.85 - i * 0.2;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r * 0.5, Math.sin(a * 1.3) * r * 0.5, rr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'EARTH':
      // Angular chip.
      ctx.fillStyle = col;
      ctx.rotate(time * 3);
      ctx.fillRect(-r * 0.9, -r * 0.7, r * 1.8, r * 1.4);
      break;
    case 'WIND':
      // Curved motion trails.
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(1, r * 0.3);
      ctx.lineCap = 'round';
      for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        ctx.arc(0, 0, r * (0.7 + i * 0.5), time * 6 + i, time * 6 + i + 2.2);
        ctx.stroke();
      }
      break;
    default:
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2); ctx.fill();
  }
  if (isTurret) {
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, r * 1.5, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

/** One impact/death particle. */
function drawElementParticle(ctx, element, x, y, r, fallbackColor) {
  const col = (M.ELEMENT[element] && M.ELEMENT[element].color) || fallbackColor || '#FFD54F';
  ctx.save();
  ctx.translate(x, y);
  switch (element) {
    case 'ICE':
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(0, -r); ctx.lineTo(r * 0.7, r * 0.5); ctx.lineTo(-r * 0.7, r * 0.5);
      ctx.closePath(); ctx.fill();
      break;
    case 'EARTH':
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(-r, r * 0.4); ctx.lineTo(-r * 0.3, -r); ctx.lineTo(r * 0.8, -r * 0.2);
      ctx.lineTo(r * 0.4, r * 0.8);
      ctx.closePath(); ctx.fill();
      break;
    case 'LIGHTNING':
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(1, r * 0.4);
      ctx.beginPath();
      ctx.moveTo(-r, -r); ctx.lineTo(0, r * 0.2); ctx.lineTo(-r * 0.3, r * 0.3); ctx.lineTo(r, r);
      ctx.stroke();
      break;
    case 'WIND':
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(1, r * 0.34);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0.6, 4.2);
      ctx.stroke();
      break;
    default:
      // Fire and poison both read best as soft motes; fire keeps a warm core.
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      if (element === 'FIRE') {
        ctx.fillStyle = 'rgba(255,240,190,0.85)';
        ctx.beginPath(); ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2); ctx.fill();
      }
  }
  ctx.restore();
}

if (typeof module !== 'undefined' && module.exports) {
  // Lane constants are read through CFG rather than re-exported as local consts:
  // top-level consts in a classic script share one global scope, so a name here
  // is a collision waiting to happen (see BUG_MEMORY.md B12).
  module.exports = {
    Renderer, LAYER_ORDER,
    BATTLEFIELD_W: CFG.BATTLEFIELD_W, BATTLEFIELD_H: CFG.BATTLEFIELD_H,
    LANE_START: CFG.LANE_START, LANE_HEIGHT: CFG.LANE_HEIGHT
  };
}