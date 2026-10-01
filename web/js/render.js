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
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scaleX = 1; this.scaleY = 1;
    this.resize();
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

  drawBackground(themeKey) {
    const t = THEMES[themeKey] || THEMES.forest;
    const { ctx } = this;
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

    // HP bar + tier pip.
    const bw = 26 * this.scaleX, bh = 3.5 * this.scaleY;
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(x - bw / 2, y - r * 1.75, bw, bh);
    ctx.fillStyle = u.isPlayer ? '#66BB6A' : '#EF5350';
    ctx.fillRect(x - bw / 2, y - r * 1.75, bw * hpFrac, bh);
    ctx.fillStyle = M.TIER[u.tier].color;
    ctx.fillRect(x - bw / 2 - 5 * this.scaleX, y - r * 1.75, 2.5 * this.scaleX, bh);
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
    this.drawBackground(engine.stageConfig.bgTheme);
    this.drawLanes(selectedLane, hoveredLane);
    this.drawFort(engine.playerFort, true);
    this.drawFort(engine.enemyFort, false);
    for (const u of engine.enemyUnits) this.drawUnit(u);
    for (const u of engine.playerUnits) this.drawUnit(u);
    this.drawProjectiles(engine.projectiles);
    this.drawParticles(engine.particles);
    this.drawFloatingTexts(engine.floatingTexts);
  }
}

if (typeof module !== 'undefined') {
  module.exports = { Renderer, VW, VH, LANE_START, LANE_HEIGHT };
}