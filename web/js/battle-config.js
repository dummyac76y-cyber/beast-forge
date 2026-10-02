// Battlefield geometry and unit presentation constants.
//
// SINGLE SOURCE OF TRUTH. The web renderer, the BattleEngine lane maths, the
// layout audit and the QA harness all read these numbers. Previously the lane
// constants were duplicated as literals in render.js and again inside
// engine.js, which is exactly how a renderer and a hit test drift apart and a
// unit ends up drawn in a different lane than the one you clicked.
//
// Coordinates are VIRTUAL: the battlefield is always BATTLEFIELD_W x
// BATTLEFIELD_H "design units" and is stretched to the canvas at paint time.
// Nothing outside this file should hard-code a lane position.
'use strict';

// Wrapped in an IIFE on purpose: this file is loaded with a classic <script>
// tag, where top-level `const`s share ONE global lexical scope. Declaring
// LANE_START here collided with render.js's own LANE_START and threw
// "Identifier 'LANE_START' has already been declared" at load, taking the whole
// renderer down with it. The only export is globalThis.BeastForgeBattle.
(function (root) {

const BATTLEFIELD_W = 1000;
const BATTLEFIELD_H = 450;

const LANE_COUNT = 5;
const LANE_START = 110;                 // virtual Y of the top of lane 1
const LANE_HEIGHT = 55;

// The playfield band. Background art is toned down inside this band so units
// read against it; everything above FIELD_TOP is "sky", everything below
// FIELD_BOTTOM is foreground.
const FIELD_TOP = LANE_START;
const FIELD_BOTTOM = LANE_START + LANE_COUNT * LANE_HEIGHT;

// ---------------------------------------------------------------- units
// Every beast is fitted to this height as a fraction of one lane, then scaled
// by its size category. The base is a FRACTION, not a pixel count, so the
// board keeps its proportions at any canvas size.
const UNIT_BASE_HEIGHT = 0.72;          // MEDIUM beast, as a fraction of lane height

// Perceived size should be intentional, not an accident of how the creature
// happened to be painted. Raw aspect ratios across the twelve beasts span
// 0.70 (gorilla) to 2.16 (fire dragon); the category is what makes a dragon
// read as bigger than a lizard despite that.
const SIZE_CATEGORIES = {
  SMALL: 0.74,
  MEDIUM: 1.00,
  LARGE: 1.14,
  MASSIVE: 1.30
};

// Hard cap on a drawn beast's width, in lane heights. A creature that exceeds
// this is fitted down; the audit reports it as a layout defect rather than
// letting one dragon sprawl across three lanes.
const MAX_FOOTPRINT_X = 1.15;

// ---------------------------------------------------------------- bars
// Health bars hang a fixed gap above the creature's ACTUAL rendered top, which
// the rig knows. They are never positioned from a constant that assumes a
// particular sprite size.
const UNIT_BAR_GAP = 5;                 // virtual units, head top -> bar bottom
const UNIT_BAR_HEIGHT = 4.2;
const UNIT_BAR_MIN_W = 20;
const UNIT_BAR_MAX_W = 34;

// ---------------------------------------------------------------- forts
// Each fortress is scaled by ONE factor derived from that side's tallest
// damage frame, then every damage state reuses it. Scaling each frame to a
// common height instead would magnify the *ruined* art (its source frame is
// much shorter), so a battered castle would render taller than an intact one.
const FORT_PLAYER = { x: 62, height: 296 };
const FORT_ENEMY = { x: 938, height: 286 };
const FORT_BASE_Y = FIELD_BOTTOM + 12;  // ground line the fortress stands on

// How far in front of a fortress its beasts deploy, and the furthest a unit may
// advance. Units spawn clear of the castle, not on top of it -- and the two
// numbers are the same distance for the same reason: a unit can reach the wall
// but never overlap it.
const FORT_DEPLOY_OFFSET = 22;

const BattleConfig = {
  BATTLEFIELD_W, BATTLEFIELD_H,
  LANE_COUNT, LANE_START, LANE_HEIGHT,
  FIELD_TOP, FIELD_BOTTOM,
  UNIT_BASE_HEIGHT, SIZE_CATEGORIES, MAX_FOOTPRINT_X,
  UNIT_BAR_GAP, UNIT_BAR_HEIGHT, UNIT_BAR_MIN_W, UNIT_BAR_MAX_W,
  FORT_PLAYER, FORT_ENEMY, FORT_BASE_Y, FORT_DEPLOY_OFFSET,

  /** Furthest-forward virtual X a player-owned beast may occupy. */
  playerFrontLine() { return FORT_ENEMY.x - FORT_DEPLOY_OFFSET; },
  /** Furthest-forward virtual X an enemy-owned beast may occupy. */
  enemyFrontLine() { return FORT_PLAYER.x + FORT_DEPLOY_OFFSET; },

  /** Virtual Y of a lane's ground line -- where a unit's FEET belong. */
  laneGroundY(laneIndex) {
    return LANE_START + laneIndex * LANE_HEIGHT + LANE_HEIGHT * 0.5;
  },

  /** Lane index for a virtual Y, or -1 when outside the playfield. */
  laneAtY(virtualY) {
    const lane = Math.floor((virtualY - LANE_START) / LANE_HEIGHT);
    return (lane >= 0 && lane < LANE_COUNT) ? lane : -1;
  },

  /** Multiplier for a beast's size category; unknown categories fall back. */
  sizeMultiplier(name) {
    return SIZE_CATEGORIES[name] || SIZE_CATEGORIES.MEDIUM;
  },

  /**
   * Fit a creature of `w` x `h` source units into its lane.
   *
   * Returns the scale to apply, plus the resulting drawn size. Height is the
   * primary axis -- a beast that is short in the art is not made tall -- but
   * the result is additionally clamped to MAX_FOOTPRINT_X lane widths so one
   * very wide creature cannot cover its neighbours.
   *
   * `fit` is what makes this shared: render.js and the offline audit both call
   * it, so the number QA measures is the number the game draws.
   */
  fitUnit(w, h, sizeName) {
    const targetH = UNIT_BASE_HEIGHT * LANE_HEIGHT * this.sizeMultiplier(sizeName);
    const maxW = MAX_FOOTPRINT_X * LANE_HEIGHT;
    const scale = Math.min(targetH / h, maxW / w);
    return {
      scale,
      w: w * scale,
      h: h * scale,
      widthClamped: targetH / h > maxW / w
    };
  }
};

root.BeastForgeBattle = BattleConfig;
// CommonJS has to be assigned from inside the IIFE, where BattleConfig is in
// scope; outside it the name is invisible.
if (typeof module !== 'undefined' && module.exports) module.exports = BattleConfig;

})(typeof globalThis !== 'undefined' ? globalThis : this);