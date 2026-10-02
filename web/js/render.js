// Canvas 2D renderer. Replaces the Compose DrawScope pipeline in
// app/src/main/java/com/example/beastforge/ui/components/BeastRenderer.kt.
//
// Virtual battlefield space is 1000 x 450; scaleX/scaleY map it to the canvas,
// exactly as the Kotlin version derived its positions from canvasH * (y / 450f).
'use strict';

if (typeof require !== 'undefined' && typeof module !== 'undefined') {
  var M = require('./models.js');
}

const VW = 1000, VH = 450;
const LANE_START = 110, LANE_HEIGHT = 55;

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

  // Blit a sprite centred on (x,y) in virtual space, optionally mirrored.
  drawSprite(spec, x, y, w, h, mirror) {
    const { ctx } = this;
    const px = x * this.scaleX, py = y * this.scaleY;
    const pw = w * this.scaleX, ph = h * this.scaleY;
    ctx.save();
    ctx.translate(px, py);
    if (mirror) ctx.scale(-1, 1);
    ctx.drawImage(spec.img, -pw * spec.anchorX, -ph * spec.anchorY, pw, ph);
    ctx.restore();
  }

  resize() {
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    const cssW = this.canvas.clientWidth || VW;
    const cssH = this.canvas.clientHeight || VH;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cssW = cssW; this.cssH = cssH;
    this.scaleX = cssW / VW;
    this.scaleY = cssH / VH;
  }

  clear() { this.ctx.clearRect(0, 0, this.cssW, this.cssH); }

  // Screen-space pixel back to virtual lane index (mirrors the Kotlin hit test).
  laneAtClientY(clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const y = clientY - rect.top;
    const lane = Math.floor((y / this.scaleY - LANE_START) / LANE_HEIGHT);
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
      this.drawAtmosphere(themeKey);
      return;
    }
    const bg = this.sprite('bg_' + themeKey);
    if (bg) {
      this.coverDraw(bg.img, 0.5);
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
    const gy = this.cssH * (LANE_START / VH);
    const gg = ctx.createLinearGradient(0, gy, 0, this.cssH);
    gg.addColorStop(0, t.ground); gg.addColorStop(1, t.sky[2]);
    ctx.fillStyle = gg;
    ctx.fillRect(0, gy, this.cssW, this.cssH - gy);
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
    const gy = H * (LANE_START / VH);
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

  drawLanes(selectedLane, hoveredLane) {
    const { ctx } = this;
    for (let i = 0; i < 5; i++) {
      const y = (LANE_START + i * LANE_HEIGHT) * this.scaleY;
      const h = LANE_HEIGHT * this.scaleY;
      const active = i === selectedLane || i === hoveredLane;
      ctx.fillStyle = active ? 'rgba(255,213,79,0.13)' : (i % 2 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.10)');
      ctx.fillRect(0, y, this.cssW, h);
      ctx.strokeStyle = active ? 'rgba(255,213,79,0.55)' : 'rgba(255,255,255,0.07)';
      ctx.lineWidth = active ? 2 : 1;
      ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(this.cssW, y + 0.5); ctx.stroke();
    }
  }

  drawFort(fort, isPlayer) {
    const { ctx } = this;
    const x = (isPlayer ? 60 : 940) * this.scaleX;
    const w = 46 * this.scaleX;
    const y0 = (LANE_START - 8) * this.scaleY;
    const h = (5 * LANE_HEIGHT + 16) * this.scaleY;
    const frac = Math.max(0, fort.currentHp / fort.maxHp);

    this.drawFortHpBar(x, y0, frac, isPlayer);

    // Painted fortress from the original build, with a damage state: the
    // castle visibly collapses as its HP falls instead of only shrinking.
    const state = frac > 0.66 ? 1 : (frac > 0.33 ? 2 : 3);
    const painted = this.fortFrame(`castle_${isPlayer ? 1 : 2}_${state}`);
    if (painted) {
      const [rx, ry, rw, rh] = painted.rect;
      // Anchor to the same virtual point the lanes do, and scale so a 480px
      // painted tower covers the full five-lane height.
      const targetH = (5 * LANE_HEIGHT + 24) * this.scaleY;
      const k = targetH / rh;
      const targetW = rw * k;
      const cx = (isPlayer ? 60 : 940) * this.scaleX;
      const baseY = (LANE_START + 5 * LANE_HEIGHT + 8) * this.scaleY;
      ctx.save();
      if (!isPlayer) { ctx.translate(cx, baseY); ctx.scale(-1, 1); ctx.translate(-cx, -baseY); }
      ctx.drawImage(painted.img, rx, ry, rw, rh,
        cx - targetW / 2, baseY - targetH, targetW, targetH);
      ctx.restore();
      return;
    }

    // Painted fort sprite wins when supplied.
    const spec = this.sprite('fort_' + (isPlayer ? 'player' : 'enemy'));
    if (spec) {
      this.drawSprite(spec, isPlayer ? 60 : 940,
        (LANE_START + 2.5 * LANE_HEIGHT) * this.scaleY / this.scaleY,
        Math.max(spec.frameW || 120, 120), (5 * LANE_HEIGHT) || 300, !isPlayer);
      const bw = 60 * this.scaleX, bh = 6 * this.scaleY;
      const bx = (isPlayer ? 60 : 940) * this.scaleX - bw / 2;
      const by = (LANE_START - 16) * this.scaleY;
      ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = frac > 0.35 ? (isPlayer ? '#4CAF50' : '#FF5252') : '#FF1744';
      ctx.fillRect(bx, by, bw * frac, bh);
      return;
    }

    // Curtain wall.
    ctx.fillStyle = isPlayer ? '#3A3F4B' : '#4A3038';
    ctx.fillRect(x - w / 2, y0, w, h);
    ctx.fillStyle = isPlayer ? '#4A5160' : '#5C3A44';
    for (let i = 0; i < 6; i++) {
      ctx.fillRect(x - w / 2, y0 + (h / 6) * i, w, 5 * this.scaleY);
    }
    // Battlements.
    ctx.fillStyle = isPlayer ? '#6C7686' : '#7A4C58';
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(x - w / 2 + (w / 4) * i, y0 - 7 * this.scaleY, w / 5, 8 * this.scaleY);
    }
    // HP bar.
    const bw = 60 * this.scaleX, bh = 6 * this.scaleY;
    const bx = x - bw / 2, by = y0 - 16 * this.scaleY;
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = frac > 0.35 ? (isPlayer ? '#4CAF50' : '#FF5252') : '#FF1744';
    ctx.fillRect(bx, by, bw * frac, bh);
  }

  /** Shared HP bar so every fort path draws it identically. */
  drawFortHpBar(cx, y0, frac, isPlayer) {
    const { ctx } = this;
    const bw = 60 * this.scaleX, bh = 7 * this.scaleY;
    const bx = cx - bw / 2, by = y0 - 18 * this.scaleY;
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
    ctx.fillStyle = frac > 0.35 ? (isPlayer ? '#4CAF50' : '#FF5252') : '#FF1744';
    ctx.fillRect(bx, by, bw * frac, bh);
    // Notches at quarter marks: readable at a glance even when the bar is tiny.
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    for (let i = 1; i < 4; i++) ctx.fillRect(bx + (bw / 4) * i, by, 1, bh);
    ctx.strokeStyle = isPlayer ? 'rgba(120,220,160,0.55)' : 'rgba(255,140,140,0.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx - 0.5, by - 0.5, bw + 1, bh + 1);
  }

  // Beast silhouettes by race, tinted by element.
  drawUnit(u) {
    const { ctx } = this;
    const x = u.position * this.scaleX;
    const y = this.laneY(u.laneIndex);
    const col = M.ELEMENT[u.element].color;
    const s = this.scaleY / 1.0;
    const hpFrac = Math.max(0, u.currentHp / u.maxHp);
    const bob = u.state === 'MARCHING' ? Math.sin(performance.now() / 90 + u.laneIndex) * 2 : 0;
    const r = 15 * s;

    // Painted creature from the original build, composed from its parts and
    // posed by the rig. Preferred over the older generated unit_* sprite.
    if (this.rig) {
      const pose = u.state === 'DYING' ? 'die'
        : u.state === 'ATTACKING' ? 'attack'
        : u.state === 'MARCHING' ? 'walk' : 'idle';
      // Target a consistent on-screen height so a hippo and a dragon both read
      // at the same weight; the rig knows each creature's true proportions.
      const rig = this.rig.get(u.cardId);
      if (rig) {
        const targetH = (LANE_HEIGHT * 0.86) * this.scaleY;
        const drawn = this.rig.draw(ctx, u.cardId, x, y, pose, this.time, {
          scale: targetH / rig.height,
          facing: u.isPlayer ? 1 : -1,
          flash: u.state === 'ATTACKING' ? 0.22 : 0
        });
        if (drawn) {
          // Element aura under the creature keeps affinity readable whatever
          // the painted beast happens to look like.
          const aura = ctx.createRadialGradient(x, y - r * 0.6, 2, x, y - r * 0.6, r * 1.9);
          aura.addColorStop(0, col + '2e'); aura.addColorStop(1, col + '00');
          ctx.fillStyle = aura;
          ctx.beginPath(); ctx.arc(x, y - r * 0.6, r * 1.9, 0, Math.PI * 2); ctx.fill();
          this.drawUnitBars(u, x, y, r, 0);
          return;
        }
      }
    }

    // Painted unit sprite wins when supplied; element aura is still drawn so the
    // player can read affinity at a glance regardless of art source.
    const spec = this.sprite('unit_' + String(u.race).toLowerCase());
    if (spec) {
      const aura = ctx.createRadialGradient(x, y, 2, x, y, r * 2.1);
      aura.addColorStop(0, col + '33'); aura.addColorStop(1, col + '00');
      ctx.fillStyle = aura;
      ctx.beginPath(); ctx.arc(x, y, r * 2.1, 0, Math.PI * 2); ctx.fill();
      this.drawSprite(spec, x, y + bob, spec.frameW || r * 3, spec.frameH || r * 3,
        spec.flipOnEnemy ? !u.isPlayer : false);
      this.drawUnitBars(u, x, y, r, bob);
      return;
    }

    ctx.save();
    ctx.translate(x, y + bob);
    ctx.globalAlpha = u.state === 'DYING' ? 0.5 : 1;

    // Element aura.
    const aura = ctx.createRadialGradient(0, 0, 2, 0, 0, r * 2.1);
    aura.addColorStop(0, col + '55'); aura.addColorStop(1, col + '00');
    ctx.fillStyle = aura;
    ctx.beginPath(); ctx.arc(0, 0, r * 2.1, 0, Math.PI * 2); ctx.fill();

    // Facing: player advances right, enemy advances left.
    ctx.scale(u.isPlayer ? 1 : -1, 1);
    ctx.fillStyle = col; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.5;

    if (u.race === 'DRAGON') {
      // Wings + body + horned head.
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
      // Tail.
      ctx.beginPath(); ctx.moveTo(-r, r * 0.2); ctx.quadraticCurveTo(-r * 1.8, r * 0.9, -r * 1.5, r * 1.5); ctx.stroke();
    } else if (u.race === 'QUADRUPED') {
      ctx.fillRect(-r * 1.15, -r * 0.35, r * 2.0, r * 0.95); ctx.strokeRect(-r * 1.15, -r * 0.35, r * 2.0, r * 0.95);
      ctx.beginPath(); ctx.ellipse(r * 1.05, -r * 0.45, r * 0.5, r * 0.45, 0, 0, Math.PI * 2); ctx.fill();
      for (const lx of [-0.85, -0.3, 0.45, 0.9]) {
        ctx.fillRect(r * lx - 1.6, r * 0.5, r * 0.32, r * 0.85);
      }
      ctx.beginPath(); ctx.moveTo(-r * 1.1, 0); ctx.quadraticCurveTo(-r * 1.8, -r * 0.7, -r * 1.45, -r * 1.25); ctx.stroke();
    } else {
      // Biped: torso, head, two limbs.
      ctx.beginPath(); ctx.ellipse(0, -r * 0.15, r * 0.72, r * 0.95, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(r * 0.42, -r * 1.05, r * 0.46, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(-r * 0.5, r * 0.6, r * 0.36, r * 0.95);
      ctx.fillRect(r * 0.18, r * 0.6, r * 0.36, r * 0.95);
      ctx.beginPath(); ctx.moveTo(r * 0.2, -r * 0.5); ctx.lineTo(r * 1.25, -r * 0.15); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(r * 0.2, -r * 0.3); ctx.lineTo(r * 1.05, r * 0.45); ctx.stroke();
    }
    ctx.restore();

    // Attack flash.
    if (u.state === 'ATTACKING') {
      ctx.save();
      ctx.globalAlpha = 0.28; ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(x, y, r * 1.55, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // HP bar + tier pip, shared by the sprite and vector paths.
    this.drawUnitBars(u, x, y, r, bob);
  }

  drawUnitBars(u, x, y, r, bob) {
    const { ctx } = this;
    const hpFrac = Math.max(0, u.currentHp / u.maxHp);
    const bw = 26 * this.scaleX, bh = 3.5 * this.scaleY;
    const by = y - r * 1.75 - (bob || 0);
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(x - bw / 2, by, bw, bh);
    ctx.fillStyle = u.isPlayer ? '#66BB6A' : '#EF5350';
    ctx.fillRect(x - bw / 2, by, bw * hpFrac, bh);
    ctx.fillStyle = M.TIER[u.tier].color;
    ctx.fillRect(x - bw / 2 - 5 * this.scaleX, by, 2.5 * this.scaleX, bh);
  }

  laneY(laneIndex) { return (LANE_START + laneIndex * LANE_HEIGHT + LANE_HEIGHT * 0.5) * this.scaleY; }

  drawProjectiles(list) {
    const { ctx } = this;
    for (const p of list) {
      const x = p.currentX * this.scaleX, y = p.currentY * this.scaleY;
      const col = M.ELEMENT[p.element].color;
      const rr = (p.isTurret ? 5 : 3.5) * this.scaleY;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rr * 3);
      g.addColorStop(0, col); g.addColorStop(1, col + '00');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, rr * 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x, y, rr * 0.55, 0, Math.PI * 2); ctx.fill();
    }
  }

  drawParticles(list) {
    const { ctx } = this;
    for (const p of list) {
      const a = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x * this.scaleX, p.y * this.scaleY, p.size * this.scaleY * a, 0, Math.PI * 2);
      ctx.fill();
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
      const y = (t.y - (1 - a) * 26) * this.scaleY;
      ctx.fillText(t.text, t.x * this.scaleX, y);
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

    // BACKDROP -> ATMOSPHERE -> BOARD -> UNITS -> VFX -> FOREGROUND
    this.drawBackground(engine.stageConfig.bgTheme);
    this.drawLanes(selectedLane, hoveredLane);
    this.drawFort(engine.playerFort, true);
    this.drawFort(engine.enemyFort, false);
    for (const u of engine.enemyUnits) this.drawUnit(u);
    for (const u of engine.playerUnits) this.drawUnit(u);
    this.drawProjectiles(engine.projectiles);
    this.drawParticles(engine.particles);
    this.drawFloatingTexts(engine.floatingTexts);
    this.drawVignette();
  }
}

if (typeof module !== 'undefined') {
  module.exports = { Renderer, VW, VH, LANE_START, LANE_HEIGHT };
}