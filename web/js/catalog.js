// Port of app/src/main/java/com/example/beastforge/data/BeastCatalog.kt
'use strict';

if (typeof require !== 'undefined' && typeof module !== 'undefined') {
  var card = require('./models.js').card;
}

const BEAR = card('biped_bear', 'Grizzly Bear', 'Grizzly Bear', 'BIPED', 'EARTH', 'COMMON',
  1, 220, 32, 0.9, 48, 35, 25, 4.0,
  'A hulking forest brute wielding earth-shattering claws. Durable frontliner.');
const WEREWOLF = card('biped_werewolf', 'Shadow Werewolf', 'Shadow Werewolf', 'BIPED', 'WIND', 'COMMON',
  1, 140, 42, 1.3, 75, 32, 30, 4.5,
  'Rapid predator striking under the blood moon. High speed and piercing DPS.');
const GORILLA = card('biped_gorilla', 'Apex Gorilla', 'Apex Gorilla', 'BIPED', 'EARTH', 'RARE',
  1, 260, 38, 0.85, 45, 38, 38, 6.0,
  'A mountain silverback pounding foes into dust with seismic punches.');
const LIZARD = card('biped_lizard', 'Venom Lizard', 'Venom Lizard', 'BIPED', 'POISON', 'COMMON',
  1, 130, 28, 1.2, 65, 45, 22, 3.5,
  'Coats its fangs in caustic bile that slowly dissolves opposing armor.');
const TIGER = card('quad_tiger', 'Storm Tiger', 'Storm Tiger', 'QUADRUPED', 'LIGHTNING', 'COMMON',
  1, 160, 45, 1.1, 70, 35, 32, 5.0,
  'Crackles with ambient static electricity. Lethal pouncing ambush beast.');
const LION = card('quad_lion', 'Flame Lion', 'Flame Lion', 'QUADRUPED', 'FIRE', 'RARE',
  1, 210, 48, 1.0, 62, 36, 40, 6.5,
  'Monarch of the scorched savanna, igniting enemy ranks with fiery roars.');
const RHINO = card('quad_rhino', 'Iron Rhino', 'Iron Rhino', 'QUADRUPED', 'EARTH', 'RARE',
  1, 340, 26, 0.75, 40, 35, 45, 8.0,
  'An unstoppable battering ram with thick stone hide that absorbs heavy punishment.');
const HIPPO = card('quad_hippo', 'Glacier Hippo', 'Glacier Hippo', 'QUADRUPED', 'ICE', 'COMMON',
  1, 290, 24, 0.8, 38, 34, 35, 6.0,
  'Submerged in arctic rivers, crushing invaders between frosted jaws.');
const FIRE_DRAGON = card('dragon_fire', 'Fire Dragon', 'Fire Dragon', 'DRAGON', 'FIRE', 'EPIC',
  1, 280, 65, 0.9, 55, 160, 65, 12.0,
  'Flying horror unleashing searing columns of flame from safe distance.');
const ICE_DRAGON = card('dragon_ice', 'Frost Dragon', 'Frost Dragon', 'DRAGON', 'ICE', 'EPIC',
  1, 270, 58, 0.95, 52, 150, 60, 11.0,
  'Breathes freezing blizzards that chill enemies and slow their movement.');
const DESERT_DRAGON = card('dragon_desert', 'Gale Dragon', 'Gale Dragon', 'DRAGON', 'WIND', 'EPIC',
  1, 240, 62, 1.15, 68, 155, 58, 10.0,
  'Whips up razor-sharp dust vortices, evading ground obstacles with grace.');
const SWAMP_DRAGON = card('dragon_swamp', 'Corrosion Drake', 'Corrosion Drake', 'DRAGON', 'POISON', 'LEGENDARY',
  1, 320, 72, 1.0, 50, 160, 75, 14.0,
  'Ancient swamp behemoth spitting acid clouds that erode fortress stones.');

const ALL_BEASTS = [BEAR, WEREWOLF, GORILLA, LIZARD, TIGER, LION, RHINO,
  HIPPO, FIRE_DRAGON, ICE_DRAGON, DESERT_DRAGON, SWAMP_DRAGON];

const STAGE_NAMES = ['Verdant Outskirts', 'Whispering Glade', 'Savage Steppes',
  'Scorched Gorge', 'Obsidian Foothills', 'Frozen Peaks', 'Glacial Chasm',
  'Poison Mire', 'Dredge Citadel', 'Wyrm Caverns', 'Titan Bastion', 'Abyssal Spire'];
const STAGE_THEMES = ['forest', 'forest', 'volcano', 'volcano', 'snow',
  'snow', 'citadel', 'citadel'];

const randInt = n => Math.floor(Math.random() * n);
const pick = a => a[randInt(a.length)];

function getStarterDeck()   { return [BEAR, TIGER, WEREWOLF, FIRE_DRAGON]; }
function getStarterUnlocked(){ return [BEAR, TIGER, WEREWOLF, HIPPO, LIZARD, FIRE_DRAGON]; }

function getStage(stageNumber) {
  const s = Math.min(Math.max(stageNumber, 1), 20);
  const theme = STAGE_THEMES[(s - 1) % STAGE_THEMES.length];
  const name  = s - 1 < STAGE_NAMES.length ? STAGE_NAMES[s - 1] : 'Dominion ' + s;

  const fortHp = 700 + s * 180;
  const spawns = [];
  const spawnCount = 12 + s * 4;
  let time = 3.0;

  let pool;
  if (s <= 2)      pool = [BEAR, LIZARD, HIPPO];
  else if (s <= 5) pool = [BEAR, WEREWOLF, TIGER, HIPPO, LIZARD];
  else if (s <= 8) pool = [BEAR, WEREWOLF, GORILLA, TIGER, LION, RHINO];
  else             pool = [BEAR, WEREWOLF, GORILLA, TIGER, LION, RHINO, FIRE_DRAGON, ICE_DRAGON];

  for (let i = 0; i < spawnCount; i++) {
    const base = pick(pool);
    const tier = (s >= 8 && i % 4 === 0) ? 'EPIC'
               : (s >= 4 && i % 3 === 0) ? 'RARE'
               : 'COMMON';
    const enemy = Object.assign({}, base, { tier, level: Math.max(1, Math.trunc(s / 2)) });
    spawns.push({ spawnTimeSec: time, laneIndex: randInt(5), beastCard: enemy });
    time += Math.max(1.8, 5.0 - s * 0.15);
  }

  let boss = null;
  if (s % 3 === 0) {
    if (theme === 'volcano')      boss = Object.assign({}, FIRE_DRAGON, { name: 'Infernal Titan Drake',  tier: 'MYTHIC',    level: s });
    else if (theme === 'snow')     boss = Object.assign({}, ICE_DRAGON,  { name: 'Abominable Frost Wyrm', tier: 'MYTHIC',   level: s });
    else                           boss = Object.assign({}, RHINO,        { name: 'Colossus Behemoth',     tier: 'LEGENDARY', level: s });
    spawns.push({ spawnTimeSec: time + 2, laneIndex: 2, beastCard: boss });
  }

  return {
    stageNumber: s, name,
    description: 'Conquer enemy fortress and crush invading beasts across 5 lanes.',
    bgTheme: theme, enemyFortHp: fortHp, enemySpawns: spawns,
    rewardCoins: 150 + s * 60, rewardCrystals: 15 + s * 5, bossCard: boss
  };
}

function generateArenaSpawns(waveNumber) {
  const count = 8 + waveNumber * 3;
  const spawns = [];
  let time = 2.0;
  for (let i = 0; i < count; i++) {
    const base = pick(ALL_BEASTS);
    const tier = (waveNumber > 10 && i % 2 === 0) ? 'LEGENDARY'
               : (waveNumber > 5  && i % 3 === 0) ? 'EPIC'
               : (waveNumber > 2  && i % 4 === 0) ? 'RARE'
               : 'COMMON';
    const unit = Object.assign({}, base, { tier, level: Math.max(1, Math.trunc(waveNumber / 2)) });
    spawns.push({ spawnTimeSec: time, laneIndex: randInt(5), beastCard: unit });
    time += Math.max(1.2, 3.8 - waveNumber * 0.1);
  }
  return spawns;
}

// Unconditional global alias. engine.js, repo.js and ui.js all reference CAT.*
// directly; under Node their own `var CAT` locals are assigned from require(),
// but in the browser those guarded bodies never run, so without this alias CAT
// would be an undefined hoisted var and every call site would throw.
var CAT = {
  BEAR, WEREWOLF, GORILLA, LIZARD, TIGER, LION, RHINO, HIPPO,
  FIRE_DRAGON, ICE_DRAGON, DESERT_DRAGON, SWAMP_DRAGON,
  ALL_BEASTS, getStarterDeck, getStarterUnlocked,
  getStage, generateArenaSpawns
};

if (typeof module !== 'undefined') {
  module.exports = { BEAR, WEREWOLF, GORILLA, LIZARD, TIGER, LION, RHINO, HIPPO,
    FIRE_DRAGON, ICE_DRAGON, DESERT_DRAGON, SWAMP_DRAGON,
    ALL_BEASTS, getStarterDeck, getStarterUnlocked,
    getStage, generateArenaSpawns, card };
}