// Port of app/src/main/java/com/example/beastforge/model/GameModels.kt
// Compose `Color` (0xAARRGGBB) becomes a plain '#RRGGBB' string.
'use strict';

const THEME = {
  DarkGold: '#FFB300', BrightGold: '#FFD54F', FireRed: '#FF3D00',
  IceBlue: '#00B0FF', LightningYellow: '#FFEA00', EarthGreen: '#4CAF50',
  PoisonPurple: '#9C27B0', WindCyan: '#00E5FF',
  Background: '#0C0A10', Surface: '#16131F', SurfaceVariant: '#221C30',
  PrimaryAmber: '#FF9800', SecondaryRed: '#E64A19', TertiaryBlue: '#0288D1',
  OnSurface: '#EDE7F6', Crit: '#FFD600', Damage: '#FF5252', White: '#FFFFFF',
  Death: '#616161'
};

const RACE = {
  BIPED:   { key: 'BIPED',   displayName: 'Biped' },
  QUADRUPED:{ key: 'QUADRUPED',displayName: 'Quadruped' },
  DRAGON:  { key: 'DRAGON',  displayName: 'Dragon' }
};

const ELEMENT = {
  FIRE:      { key: 'FIRE',      displayName: 'Fire',      color: THEME.FireRed },
  ICE:       { key: 'ICE',       displayName: 'Ice',       color: THEME.IceBlue },
  LIGHTNING: { key: 'LIGHTNING', displayName: 'Lightning', color: THEME.LightningYellow },
  EARTH:     { key: 'EARTH',     displayName: 'Earth',     color: THEME.EarthGreen },
  POISON:    { key: 'POISON',    displayName: 'Poison',    color: THEME.PoisonPurple },
  WIND:      { key: 'WIND',      displayName: 'Wind',      color: THEME.WindCyan }
};

// Counter wheel: FIRE->ICE, ICE->WIND, WIND->EARTH, EARTH->LIGHTNING,
// LIGHTNING->POISON, POISON->FIRE.
const COUNTER = {
  FIRE: 'ICE', ICE: 'WIND', WIND: 'EARTH',
  EARTH: 'LIGHTNING', LIGHTNING: 'POISON', POISON: 'FIRE'
};

function counterElement(e) { return COUNTER[e]; }
function isStrongAgainst(a, b) { return COUNTER[a] === b; }

const TIER = {
  COMMON:    { key: 'COMMON',    displayName: 'Feral',    color: '#B0BEC5', multiplier: 1.0 },
  RARE:      { key: 'RARE',      displayName: 'Armored',  color: '#42A5F5', multiplier: 1.35 },
  EPIC:      { key: 'EPIC',      displayName: 'Elemental',color: '#AB47BC', multiplier: 1.8 },
  LEGENDARY: { key: 'LEGENDARY', displayName: 'Apex',     color: '#FFB300', multiplier: 2.4 },
  MYTHIC:    { key: 'MYTHIC',    displayName: 'Ancient',  color: '#FF1744', multiplier: 3.2 }
};

const TIER_ORDER = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'];

function evolveCard(c) {
  const idx = TIER_ORDER.indexOf(c.tier);
  const nextTier = TIER_ORDER[Math.min(idx + 1, TIER_ORDER.length - 1)];
  const prefix = { RARE: 'Armored', EPIC: 'Infernal', LEGENDARY: 'Apex', MYTHIC: 'Titan' }[nextTier];
  const evolvedName = prefix ? prefix + ' ' + c.species : c.name;
  return Object.assign({}, c, {
    name: evolvedName,
    tier: nextTier,
    level: 1,
    // Dragons gain reach at EPIC and above.
    range: (TIER_ORDER.indexOf(nextTier) >= TIER_ORDER.indexOf('EPIC') && c.race === 'DRAGON')
      ? 160 : c.range
  });
}

function upgradeCard(c) { return Object.assign({}, c, { level: c.level + 1 }); }

// Derived stats. Kotlin did `(x).toInt().toFloat()` -- truncate toward zero.
function cardHp(c)   { return Math.trunc(c.baseHp  * TIER[c.tier].multiplier * (1 + (c.level - 1) * 0.15)); }
function cardAtk(c)  { return Math.trunc(c.baseAtk * TIER[c.tier].multiplier * (1 + (c.level - 1) * 0.15)); }
function isRanged(c) { return c.range > 80 || c.race === 'DRAGON'; }

function profileFortMaxHp(p)      { return 800 + (p.fortLevel - 1) * 250; }
function profileTurretAtk(p)      { return 30 + (p.turretLevel - 1) * 15; }
function profileTurretCooldown(p){ return Math.max(0.8, 2.0 - (p.turretLevel - 1) * 0.15); }
function profileMaxMana(p)        { return 100 + (p.mineralLevel - 1) * 20; }
function profileManaRegen(p)      { return 7.0 + (p.mineralLevel - 1) * 1.5; }

// Constructor mirroring the Kotlin BeastCard data class, with defaults.
function card(id, species, name, race, element, tier, level,
              baseHp, baseAtk, attackSpeed, moveSpeed, range,
              manaCost, cooldownSec, lore) {
  return {
    id, species, name, race, element, tier, level,
    baseHp, baseAtk,
    attackSpeed: attackSpeed !== undefined ? attackSpeed : 1.0,
    moveSpeed:   moveSpeed   !== undefined ? moveSpeed   : 60,
    range:       range       !== undefined ? range       : 40,
    manaCost:    manaCost    !== undefined ? manaCost    : 20,
    cooldownSec: cooldownSec !== undefined ? cooldownSec : 4,
    lore: lore || '',
    count: 1
  };
}

function defaultProfile() {
  return {
    coins: 600, crystals: 80, currentStage: 1, highestArenaWave: 0,
    fortLevel: 1, mineralLevel: 1, turretLevel: 1, soundEnabled: true,
    unlockedCards: null,   // filled by catalog
    deckCardIds: null      // filled by catalog
  };
}

// Unconditional global alias. engine.js and render.js reference M.ELEMENT and
// friends; their own `M` bindings only exist under the Node require guard, so
// without this the browser build would throw on an undefined `M`.
var M = {
  THEME, RACE, ELEMENT, TIER, TIER_ORDER, counterElement, isStrongAgainst,
  evolveCard, upgradeCard, cardHp, cardAtk, isRanged,
  profileFortMaxHp, profileTurretAtk, profileTurretCooldown,
  profileMaxMana, profileManaRegen, defaultProfile, card
};

if (typeof module !== 'undefined') {
  module.exports = { THEME, RACE, ELEMENT, TIER, TIER_ORDER, counterElement,
    isStrongAgainst, evolveCard, upgradeCard, cardHp, cardAtk, isRanged,
    profileFortMaxHp, profileTurretAtk, profileTurretCooldown,
    profileMaxMana, profileManaRegen, defaultProfile, card };
}