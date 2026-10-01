// Port of app/src/main/java/com/example/beastforge/data/GameRepository.kt
// SharedPreferences -> localStorage. JSONObject/JSONArray -> JSON.
// Android defaults differed from the PlayerProfile defaults; the loader's
// values are authoritative and are reproduced exactly.
'use strict';

if (typeof require !== 'undefined' && typeof module !== 'undefined') {
  var M = require('./models.js');
  var CAT = require('./catalog.js');
  var upgradeCard = M.upgradeCard, evolveCard = M.evolveCard;
}

const PREFS_KEY = 'beast_forge_prefs';

const EVOLVE_CRYSTALS = { COMMON: 20, RARE: 45, EPIC: 90, LEGENDARY: 150, MYTHIC: null };
const EVOLVE_COINS    = { COMMON: 300, RARE: 700, EPIC: 1500, LEGENDARY: 3000, MYTHIC: null };

function deepCloneProfile(p) { return JSON.parse(JSON.stringify(p)); }

class GameRepository {
  constructor(storage) {
    this.storage = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    this.listeners = [];
    this.profile = this.load();
  }

  subscribe(fn) { this.listeners.push(fn); return () => { this.listeners = this.listeners.filter(f => f !== fn); }; }
  _emit() { for (const fn of this.listeners) fn(this.profile); }

  _readAll() {
    if (!this.storage) return {};
    try { return JSON.parse(this.storage.getItem(PREFS_KEY) || '{}'); }
    catch (e) { return {}; }
  }

  load() {
    const raw = this._readAll();
    const int = (k, d) => (typeof raw[k] === 'number' ? raw[k] : d);

    let unlockedCards = null;
    if (raw.unlocked_cards) {
      try { unlockedCards = JSON.parse(raw.unlocked_cards); } catch (e) { unlockedCards = null; }
    }
    if (!unlockedCards || !unlockedCards.length) unlockedCards = CAT.getStarterUnlocked();

    let deckIds = null;
    if (raw.deck_ids) {
      try { deckIds = JSON.parse(raw.deck_ids); } catch (e) { deckIds = null; }
    }
    if (!deckIds || !deckIds.length) deckIds = CAT.getStarterDeck().map(c => c.id);

    return {
      coins: int('coins', 600),
      crystals: int('crystals', 80),
      currentStage: int('current_stage', 1),
      highestArenaWave: int('highest_arena', 0),
      fortLevel: int('fort_lv', 1),
      mineralLevel: int('mineral_lv', 1),
      turretLevel: int('turret_lv', 1),
      soundEnabled: typeof raw.sound_enabled === 'boolean' ? raw.sound_enabled : true,
      unlockedCards,
      deckCardIds: deckIds
    };
  }

  save(p) {
    this.profile = p;
    if (this.storage) {
      try {
        this.storage.setItem(PREFS_KEY, JSON.stringify({
          coins: p.coins, crystals: p.crystals,
          current_stage: p.currentStage, highest_arena: p.highestArenaWave,
          fort_lv: p.fortLevel, mineral_lv: p.mineralLevel, turret_lv: p.turretLevel,
          sound_enabled: p.soundEnabled,
          unlocked_cards: JSON.stringify(p.unlockedCards),
          deck_ids: JSON.stringify(p.deckCardIds)
        }));
      } catch (e) { /* quota / private mode -- run in-memory */ }
    }
    this._emit();
  }

  reset() { if (this.storage) this.storage.removeItem(PREFS_KEY); this.profile = this.load(); this._emit(); }

  addRewards(coins, crystals, advanceStage) {
    const c = this.profile;
    this.save(Object.assign({}, c, {
      coins: c.coins + coins,
      crystals: c.crystals + crystals,
      currentStage: advanceStage ? c.currentStage + 1 : c.currentStage
    }));
  }

  recordArenaScore(wave) {
    const c = this.profile;
    if (wave > c.highestArenaWave) this.save(Object.assign({}, c, { highestArenaWave: wave }));
  }

  upgradeFort() {
    const c = this.profile, cost = c.fortLevel * 250;
    if (c.coins >= cost) { this.save(Object.assign({}, c, { coins: c.coins - cost, fortLevel: c.fortLevel + 1 })); return true; }
    return false;
  }
  upgradeMineral() {
    const c = this.profile, cost = c.mineralLevel * 200;
    if (c.coins >= cost) { this.save(Object.assign({}, c, { coins: c.coins - cost, mineralLevel: c.mineralLevel + 1 })); return true; }
    return false;
  }
  upgradeTurret() {
    const c = this.profile, cost = c.turretLevel * 220;
    if (c.coins >= cost) { this.save(Object.assign({}, c, { coins: c.coins - cost, turretLevel: c.turretLevel + 1 })); return true; }
    return false;
  }

  evolveBeast(cardId) {
    const c = this.profile;
    const target = c.unlockedCards.find(x => x.id === cardId);
    if (!target) return false;
    const crystalCost = EVOLVE_CRYSTALS[target.tier];
    const coinCost = EVOLVE_COINS[target.tier];
    if (crystalCost === null || coinCost === null) return false;   // MYTHIC is terminal
    if (c.crystals >= crystalCost && c.coins >= coinCost) {
      const evolved = evolveCard(target);
      this.save(Object.assign({}, c, {
        crystals: c.crystals - crystalCost, coins: c.coins - coinCost,
        unlockedCards: c.unlockedCards.map(x => x.id === cardId ? evolved : x)
      }));
      return true;
    }
    return false;
  }

  levelUpBeast(cardId) {
    const c = this.profile;
    const target = c.unlockedCards.find(x => x.id === cardId);
    if (!target) return false;
    const cost = target.level * 180;
    if (c.coins >= cost) {
      const leveled = upgradeCard(target);
      this.save(Object.assign({}, c, {
        coins: c.coins - cost,
        unlockedCards: c.unlockedCards.map(x => x.id === cardId ? leveled : x)
      }));
      return true;
    }
    return false;
  }

  summonBeastPack(useCrystals) {
    const c = this.profile;
    const coinCost = 400, crystalCost = 35;
    if (useCrystals) { if (c.crystals < crystalCost) return null; }
    else { if (c.coins < coinCost) return null; }

    const drawn = CAT.ALL_BEASTS[Math.floor(Math.random() * CAT.ALL_BEASTS.length)];
    const roll = Math.floor(Math.random() * 100) + 1;   // Kotlin (1..100).random()
    const randomTier = useCrystals
      ? (roll > 85 ? 'LEGENDARY' : roll > 55 ? 'EPIC' : 'RARE')
      : (roll > 95 ? 'EPIC' : roll > 75 ? 'RARE' : 'COMMON');

    const newCard = Object.assign({}, drawn, {
      id: drawn.id + '_' + (Date.now() % 10000), tier: randomTier
    });

    this.save(Object.assign({}, c, {
      coins: useCrystals ? c.coins : c.coins - coinCost,
      crystals: useCrystals ? c.crystals - crystalCost : c.crystals,
      unlockedCards: c.unlockedCards.concat([newCard])
    }));
    return newCard;
  }

  setDeck(newDeckIds) {
    if (newDeckIds.length >= 1 && newDeckIds.length <= 4) {
      this.save(Object.assign({}, this.profile, { deckCardIds: newDeckIds.slice() }));
    }
  }

  toggleSound() {
    this.save(Object.assign({}, this.profile, { soundEnabled: !this.profile.soundEnabled }));
  }
}

if (typeof module !== 'undefined') {
  module.exports = { GameRepository, PREFS_KEY };
}