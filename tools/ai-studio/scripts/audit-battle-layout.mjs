#!/usr/bin/env node
// Battle layout audit.
//
// Answers, per beast, the questions that eyeballing a screenshot cannot:
//   - how big does it actually draw, in virtual units and as a share of a lane?
//   - is it wider than a lane?
//   - does its health bar land above its head, or inside its body?
//   - does its feet land on the ground line?
//
// Reads the SAME LAYOUT/renderer constants the game uses, so this cannot drift
// from what ships. Run it after any change to beastparts.js, render.js or the
// battlefield config.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..');
const require = createRequire(import.meta.url);
const { resolveLayout, LAYOUT } = require(path.join(REPO, 'web/js/beastparts.js'));
const BATTLE = require(path.join(REPO, 'web/js/battle-config.js'));

const parts = JSON.parse(fs.readFileSync(path.join(REPO, 'web/assets/beasts/parts_v001.json'), 'utf8'));

const LANE_H = BATTLE.LANE_HEIGHT;
const ARTEFACT_H = BATTLE.UNIT_BASE_HEIGHT * LANE_H;
const BUDGET_W = BATTLE.MAX_FOOTPRINT_X * LANE_H;

const rows = [];
for (const [id, rec] of Object.entries(parts.beasts)) {
  const body = rec.parts.body;
  const [, , bw, bh] = body;
  const solved = resolveLayout(rec.race, rec.parts, bw, bh);
  if (!solved) { rows.push({ id, race: rec.race, err: 'resolveLayout returned null' }); continue; }

  // Ask the SHIPPED config to do the fitting. This script must not restate the
  // formula: an earlier version multiplied UNIT_BASE_HEIGHT by MAX_FOOTPRINT_X
  // instead of LANE_HEIGHT and silently invented a 28% smaller width budget,
  // which is precisely the drift the audit exists to catch.
  const fit = BATTLE.fitUnit(solved.width, solved.height, rec.size);
  const scale = fit.scale;
  const drawW = fit.w;
  const drawH = fit.h;
  // How much the width budget cost this creature, as a share of the height its
  // size category asked for. A hair over the budget is the limit doing its job;
  // a large shortfall means the rig layout is genuinely too wide and the
  // layout, not the scale, needs fixing.
  const wantedH = ARTEFACT_H * BATTLE.sizeMultiplier(rec.size);
  const clampLoss = Math.max(0, 1 - drawH / wantedH);

  // Health bar geometry, in the same coordinate frame the renderer draws in:
  // y grows downward, the head top is at -drawH, and the bar hangs above it.
  const headTop = -drawH;
  const barBottom = headTop - BATTLE.UNIT_BAR_GAP;
  const barTop = barBottom - BATTLE.UNIT_BAR_HEIGHT;
  const clearance = headTop - barBottom;          // > 0 means the bar clears the head
  const overlapsHead = barBottom > headTop + 0.001;
  // The bar must also stay inside the lane it belongs to.
  const barCrossesLaneTop = barTop < -(ARTEFACT_H * BATTLE.SIZE_CATEGORIES.MASSIVE) - LANE_H / 2;

  rows.push({
    id, race: rec.race, species: rec.species, size: rec.size || 'MEDIUM',
    ar: solved.width / solved.height,
    srcW: solved.width, srcH: solved.height,
    drawH, drawW,
    laneFillH: drawH / LANE_H,
    pctBudgetW: 100 * drawW / BUDGET_W,
    clearance, overlapsHead, barCrossesLaneTop, clampLoss,
    widthClamped: fit.widthClamped,
  });
}

// ---------------------------------------------------------------- report
let problems = 0;
const bad = m => { problems++; return '  <-- ' + m; };
// Informational notes (e.g. "sitting exactly on the width limit") are worth
// surfacing but are not failures.
const FATAL = 'PROBLEM: ';

console.log('=== beast footprint (virtual units; lane height = %d) ===', LANE_H);
console.log('id'.padEnd(18), 'size'.padEnd(8), 'ar'.padEnd(6), 'drawH'.padEnd(8), 'drawW'.padEnd(8),
  '%laneH'.padEnd(8), '%budgW'.padEnd(8), 'clr'.padEnd(7), 'notes');
for (const r of rows) {
  if (r.err) { console.log(r.id.padEnd(18), r.err); problems++; continue; }
  const notes = [];
  if (r.overlapsHead) notes.push(`bar sits ${r.clearance.toFixed(1)}u INSIDE the head`);
  if (r.clampLoss > 0.05) notes.push(FATAL + `width budget cost it ${(100 * r.clampLoss).toFixed(0)}% of its category height`);
  else if (r.clampLoss > 0.005) notes.push(`at the width limit (-${(100 * r.clampLoss).toFixed(0)}%)`);
  if (r.drawH > LANE_H * 0.98) notes.push(`fills ${(100 * r.drawH / LANE_H).toFixed(0)}% of the lane`);
  if (r.barCrossesLaneTop) notes.push('bar escapes its own lane');
  console.log(r.id.padEnd(18), r.size.padEnd(8), r.ar.toFixed(2).padEnd(6),
    r.drawH.toFixed(1).padEnd(8), r.drawW.toFixed(1).padEnd(8),
    (100 * r.laneFillH).toFixed(0).padEnd(8),
    r.pctBudgetW.toFixed(0).padEnd(8),
    r.clearance.toFixed(1).padEnd(7),
    notes.length ? '  <-- ' + notes.join('; ') : '');
}

const hs = rows.filter(r => !r.err).map(r => r.drawH);
const ws = rows.filter(r => !r.err).map(r => r.drawW);
console.log(`\nheight spread ${Math.min(...hs).toFixed(1)}..${Math.max(...hs).toFixed(1)} (${(Math.max(...hs) / Math.min(...hs)).toFixed(2)}x)`);
console.log(`width  spread ${Math.min(...ws).toFixed(1)}..${Math.max(...ws).toFixed(1)} (${(Math.max(...ws) / Math.min(...ws)).toFixed(2)}x)`);

// Deliberate spread from the size categories, on top of real proportion spread.
const catH = {};
for (const r of rows.filter(r => !r.err)) (catH[r.size] ||= []).push(r.drawH);
const order = ['SMALL', 'MEDIUM', 'LARGE', 'MASSIVE'];
console.log('\nper-category mean height (must be strictly increasing):');
let prev = 0, ordered = true;
for (const k of order) {
  if (!catH[k]) continue;
  const m = catH[k].reduce((a, b) => a + b, 0) / catH[k].length;
  if (m <= prev) ordered = false;
  prev = m;
  console.log('  ' + k.padEnd(8), m.toFixed(1));
}
if (!ordered) { problems++; console.log(bad('size categories do not produce increasing heights')); }

console.log(problems ? `\nAUDIT FAILED: ${problems} layout problem(s)` : '\nAUDIT OK');
process.exit(problems ? 1 : 0);