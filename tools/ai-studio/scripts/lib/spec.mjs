// The asset contract.
//
// This is the single place that knows which sprite/audio keys the game looks up
// and what shape they must be. The values are copied from the game's own source
// so the manifest can never drift from the renderer:
//
//   sprite keys  -> web/js/assets.js   (SPRITE_KEYS) + render.js call sites
//   unit sizes   -> render.js drawUnit(): blits frameW x frameH centred on the
//                   unit's lane position; anchorY ~0.72 puts the feet on the lane
//   fort size    -> render.js drawFort(): width = max(frameW,120),
//                   height = 5 * LANE_HEIGHT = 275, centred on lane 2.5
//   backgrounds  -> render.js drawBackground(): stretched full-bleed
//   audio keys   -> web/js/audio.js CUES + engine.js/ui.js play('...') call sites
//
// Verify with: node tools/ai-studio/scripts/verify.mjs
// (it re-derives the keys from the game source and fails on any mismatch).

/** Virtual battlefield metrics, mirrored from render.js. */
export const VW = 1000, VH = 450, LANE_START = 110, LANE_HEIGHT = 55, LANE_COUNT = 5;

/**
 * Neutral palettes on purpose: one sprite is shared by every unit of a race
 * across all six elements (render.js keys sprites by race only), so any element
 * tint baked into the art would be wrong for five of six cases. The renderer
 * draws the element aura on top regardless, so affinity stays readable.
 */
export const UNIT_PALETTE = {
  hide: rgbOf('#3E4757'),
  hideLit: rgbOf('#5D6A80'),
  rim: rgbOf('#C6D2E6'),
  eye: rgbOf('#FFD54F'),
};

function rgbOf(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Stage themes. Keys must cover catalog.js STAGE_THEMES + ui.js arena. */
export const THEMES = {
  forest: {
    sky: ['#0B2027', '#1B4332', '#2D6A4F'], ground: '#1B4332', accent: '#40916C',
    ridges: ['#08161B', '#12292A', '#1B4332'], particle: '#8FE3B0', particleCount: 90, particleSize: 2
  },
  volcano: {
    sky: ['#2B0A0A', '#6A1B09', '#A63603'], ground: '#4A1206', accent: '#D97706',
    ridges: ['#1A0705', '#3A0F06', '#4A1206'], particle: '#FFB347', particleCount: 130, particleSize: 2
  },
  snow: {
    sky: ['#0F1B2B', '#264653', '#4A6FA5'], ground: '#2A3F5F', accent: '#8EC5FF',
    ridges: ['#0B1524', '#18293C', '#2A3F5F'], particle: '#E8F4FF', particleCount: 160, particleSize: 2
  },
  citadel: {
    sky: ['#14121F', '#2E2445', '#4C3A6B'], ground: '#241C36', accent: '#9C6BD6',
    ridges: ['#0C0A15', '#1A1428', '#241C36'], particle: '#C4A7FF', particleCount: 100, particleSize: 2
  },
  arena: {
    sky: ['#1A1024', '#3B1F4E', '#6B2D5C'], ground: '#2A1733', accent: '#E0568A',
    ridges: ['#120A1A', '#241230', '#2A1733'], particle: '#FF9EC7', particleCount: 110, particleSize: 2
  }
};

export const BG_W = 1024, BG_H = 576;

/** Sprite specs. frameW/frameH are virtual pixels; anchors are frame fractions. */
export const SPRITES = {
  unit_biped:     { file: 'sprites/units/biped_v001.png',     frameW: 78,  frameH: 78,  anchorX: 0.5, anchorY: 0.72, flipOnEnemy: true },
  unit_quadruped: { file: 'sprites/units/quadruped_v001.png', frameW: 102, frameH: 78,  anchorX: 0.5, anchorY: 0.74, flipOnEnemy: true },
  unit_dragon:    { file: 'sprites/units/dragon_v001.png',    frameW: 126, frameH: 126, anchorX: 0.5, anchorY: 0.74, flipOnEnemy: true },
  fort_player:    { file: 'sprites/forts/fort_player_v001.png', frameW: 120, frameH: LANE_COUNT * LANE_HEIGHT, anchorX: 0.5, anchorY: 0.5 },
  fort_enemy:     { file: 'sprites/forts/fort_enemy_v001.png',  frameW: 120, frameH: LANE_COUNT * LANE_HEIGHT, anchorX: 0.5, anchorY: 0.5 }
};

/** Background sprites: one per theme, stretched to cover the canvas. */
export const BACKGROUNDS = Object.fromEntries(
  Object.keys(THEMES).map(theme => [
    'bg_' + theme,
    { file: `sprites/bg/bg_${theme}_v001.png`, frameW: BG_W, frameH: BG_H, cover: true, flipOnEnemy: false }
  ])
);

/**
 * Audio cues. Waveform/frequency/duration mirror web/js/audio.js CUES so the
 * rendered samples stay in character with the synth fallback, but `noise`,
 * `harmonics` and `sweepShape` add the bite the procedural synth lacks.
 * Volumes are deliberately a little under 1.0 -- many cues can overlap.
 */
export const AUDIO = {
  select:       { file: 'audio/select.wav',       volume: 0.55, wave: 'triangle', f0: 520,  f1: 780,  dur: 0.10, gain: 0.16, harmonics: 1 },
  button:       { file: 'audio/button.wav',       volume: 0.50, wave: 'sine',     f0: 420,  f1: 560,  dur: 0.08, gain: 0.14, harmonics: 1 },
  coin:         { file: 'audio/coin.wav',         volume: 0.45, wave: 'square',   f0: 880,  f1: 1320, dur: 0.12, gain: 0.10, harmonics: 1 },
  evolve:       { file: 'audio/evolve.wav',       volume: 0.60, wave: 'sawtooth', f0: 300,  f1: 900,  dur: 0.45, gain: 0.14, harmonics: 2 },
  fire:         { file: 'audio/fire.wav',         volume: 0.45, wave: 'sawtooth', f0: 300,  f1: 120,  dur: 0.16, gain: 0.10, harmonics: 2, noise: 0.25 },
  ice:          { file: 'audio/ice.wav',          volume: 0.45, wave: 'triangle', f0: 900,  f1: 1500, dur: 0.16, gain: 0.09, harmonics: 1 },
  light:        { file: 'audio/light.wav',        volume: 0.40, wave: 'square',   f0: 1200, f1: 700,  dur: 0.10, gain: 0.09, harmonics: 1 },
  wind:         { file: 'audio/wind.wav',         volume: 0.40, wave: 'sine',     f0: 700,  f1: 400,  dur: 0.18, gain: 0.08, harmonics: 1, noise: 0.35 },
  earth:        { file: 'audio/earth.wav',        volume: 0.50, wave: 'sawtooth', f0: 150,  f1: 70,   dur: 0.22, gain: 0.12, harmonics: 2, noise: 0.3 },
  poison:       { file: 'audio/poison.wav',       volume: 0.45, wave: 'sine',     f0: 260,  f1: 180,  dur: 0.24, gain: 0.10, harmonics: 1, noise: 0.2 },
  biped_die:    { file: 'audio/biped_die.wav',    volume: 0.50, wave: 'sawtooth', f0: 240,  f1: 90,   dur: 0.24, gain: 0.11, harmonics: 2 },
  quad_die:     { file: 'audio/quad_die.wav',     volume: 0.50, wave: 'sawtooth', f0: 200,  f1: 75,   dur: 0.26, gain: 0.11, harmonics: 2 },
  dragon_die:   { file: 'audio/dragon_die.wav',   volume: 0.55, wave: 'sawtooth', f0: 160,  f1: 55,   dur: 0.40, gain: 0.13, harmonics: 3, noise: 0.25 },
  fire_explode: { file: 'audio/fire_explode.wav', volume: 0.60, wave: 'sawtooth', f0: 420,  f1: 60,   dur: 0.42, gain: 0.16, harmonics: 2, noise: 0.7 },
  fort_ruin:    { file: 'audio/fort_ruin.wav',    volume: 0.65, wave: 'sawtooth', f0: 110,  f1: 40,   dur: 0.60, gain: 0.16, harmonics: 3, noise: 0.8 },
  stage_start:  { file: 'audio/stage_start.wav',  volume: 0.55, wave: 'sine',     f0: 440,  f1: 660,  dur: 0.26, gain: 0.12, harmonics: 2 },
  victory:      { file: 'audio/victory.wav',      volume: 0.60, wave: 'sine',     f0: 523,  f1: 1046, dur: 0.55, gain: 0.14, harmonics: 2 },
  defeat:       { file: 'audio/defeat.wav',       volume: 0.60, wave: 'sine',     f0: 330,  f1: 165,  dur: 0.60, gain: 0.13, harmonics: 2 }
};

/**
 * Attribution carried in the manifest and surfaced by the UI credits line.
 * Only entries this tool owns belong here -- Cinzel is already credited in the
 * manifest, and re-adding it would double-count the font.
 */
export const CREDITS = [
  {
    name: 'Beast Forge AI Studio procedural asset set',
    license: 'CC0-1.0',
    author: 'Generated by tools/ai-studio/scripts/generate-assets.mjs',
    note: 'Sprites, backgrounds and audio cues are rendered deterministically from code in this repository. No model weights, no third-party art.'
  }
];

export const ALL_SPRITES = { ...SPRITES, ...BACKGROUNDS };