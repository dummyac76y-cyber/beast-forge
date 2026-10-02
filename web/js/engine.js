// Port of app/src/main/java/com/example/beastforge/game/BattleEngine.kt
//
// Line-for-line behavioural port. Kotlin idioms mapped as:
//   coerceIn(a,b)      -> clamp(v, a, b)
//   coerceAtLeast(n)   -> Math.max(v, n)
//   coerceAtMost(n)    -> Math.min(v, n)
//   minByOrNull { }    -> first element minimising the selector (first wins ties)
//   Random.nextFloat() -> Math.random()
//   Color(0xAARRGGBB)  -> '#RRGGBB'
'use strict';

// Battlefield geometry comes from battle-config.js in the browser and from the
// module directly under Node (the headless battle sim runs here).
const BATTLE = (typeof globalThis !== 'undefined' && globalThis.BeastForgeBattle)
  || (typeof require !== 'undefined' ? require('./battle-config.js') : null);

if (typeof require !== 'undefined' && typeof module !== 'undefined') {
  var M = require('./models.js');
  var CAT = require('./catalog.js');
  var cardHp = M.cardHp, cardAtk = M.cardAtk, isRanged = M.isRanged;
  var isStrongAgainst = M.isStrongAgainst;
  var profileFortMaxHp = M.profileFortMaxHp, profileTurretAtk = M.profileTurretAtk,
      profileTurretCooldown = M.profileTurretCooldown,
      profileMaxMana = M.profileMaxMana, profileManaRegen = M.profileManaRegen;
}

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
// Kotlin `minByOrNull`: returns null on an empty sequence.
function minBy(arr, sel) {
  if (arr.length === 0) return null;
  let best = arr[0], bv = sel(best);
  for (let i = 1; i < arr.length; i++) { const v = sel(arr[i]); if (v < bv) { best = arr[i]; bv = v; } }
  return best;
}
function maxBy(arr, sel) {
  if (arr.length === 0) return null;
  let best = arr[0], bv = sel(best);
  for (let i = 1; i < arr.length; i++) { const v = sel(arr[i]); if (v > bv) { best = arr[i]; bv = v; } }
  return best;
}


class BattleEngine {
  constructor(stageConfig, playerProfile, soundManager, isArenaMode) {
    this.stageConfig = stageConfig;
    this.playerProfile = playerProfile;
    this.soundManager = soundManager || null;   // nullable, exactly as in Kotlin
    this.isArenaMode = !!isArenaMode;

    this.playerFort = {
      maxHp: profileFortMaxHp(playerProfile), currentHp: profileFortMaxHp(playerProfile),
      turretAtk: profileTurretAtk(playerProfile), turretRange: 280,
      turretCooldown: profileTurretCooldown(playerProfile), turretTimer: 0
    };
    this.enemyFort = {
      maxHp: stageConfig.enemyFortHp, currentHp: stageConfig.enemyFortHp,
      turretAtk: 25 + stageConfig.stageNumber * 8, turretRange: 260,
      turretCooldown: 2.2, turretTimer: 0
    };

    this.playerUnits = [];
    this.enemyUnits = [];
    this.projectiles = [];
    this.particles = [];
    this.floatingTexts = [];

    this.mana = 35;
    this.maxMana = profileMaxMana(playerProfile);
    this.manaRegenRate = profileManaRegen(playerProfile);

    this.cardCooldowns = {};
    this.catapultCooldownTimer = 0;
    this.catapultMaxCooldown = 25;

    this.battleTime = 0;
    this.isGameOver = false;
    this.isVictory = false;
    this.isPaused = false;
    this.gameSpeed = 1.0;

    this.pendingSpawns = stageConfig.enemySpawns.slice();
    this.arenaWave = 1;
    this.arenaScore = 0;

    this.nextId = 1;
    if (this.soundManager) this.soundManager.play('stage_start');
  }

  play(key, vol) { if (this.soundManager) this.soundManager.play(key, vol); }

  update(deltaTime) {
    if (this.isGameOver || this.isPaused) return;
    const dt = clamp(deltaTime * this.gameSpeed, 0, 0.1);
    this.battleTime += dt;

    // 1. Mana regen
    this.mana = Math.min(this.mana + this.manaRegenRate * dt, this.maxMana);

    // 2. Cooldowns
    for (const key of Object.keys(this.cardCooldowns)) {
      const cd = this.cardCooldowns[key] || 0;
      if (cd > 0) this.cardCooldowns[key] = Math.max(cd - dt, 0);
    }
    if (this.catapultCooldownTimer > 0) this.catapultCooldownTimer = Math.max(this.catapultCooldownTimer - dt, 0);

    // 3. Enemy spawns -- consume from the pending queue as their time arrives.
    for (let i = this.pendingSpawns.length - 1; i >= 0; i--) {
      const spawn = this.pendingSpawns[i];
      if (this.battleTime >= spawn.spawnTimeSec) {
        this.spawnEnemyUnit(spawn.beastCard, spawn.laneIndex);
        this.pendingSpawns.splice(i, 1);
      }
    }

    // Arena: endless restocking once the field is clear.
    if (this.isArenaMode && this.pendingSpawns.length === 0 && this.enemyUnits.length === 0) {
      this.arenaWave++;
      this.arenaScore += 500 * this.arenaWave;
      const nextSpawns = CAT.generateArenaSpawns(this.arenaWave);
      for (const s of nextSpawns) {
        this.pendingSpawns.push(Object.assign({}, s, { spawnTimeSec: this.battleTime + s.spawnTimeSec }));
      }
      this.play('stage_start');
      this.addFloatingText('WAVE ' + this.arenaWave + '!', 500, 150, '#FFD54F');
    }

    // 4-8
    this.updateLanes(dt);
    this.updateFortTurrets(dt);
    this.updateProjectiles(dt);
    this.updateVFX(dt);
    this.checkFortressState();
  }

  spawnEnemyUnit(c, laneIndex) {
    this.enemyUnits.push({
      id: 'enemy_' + (this.nextId++), cardId: c.id, isPlayer: false,
      name: c.name, species: c.species, race: c.race, element: c.element, tier: c.tier,
      maxHp: cardHp(c), currentHp: cardHp(c), atk: cardAtk(c),
      attackSpeed: c.attackSpeed, moveSpeed: c.moveSpeed, range: c.range, isRanged: isRanged(c),
      laneIndex, position: BATTLE.playerFrontLine(),
      state: 'MARCHING', attackTimer: 0, stateTimer: 0,
      burnTimer: 0, frozenTimer: 0, poisonedTimer: 0
    });
  }

  canSummon(c) {
    if (this.isGameOver) return false;
    const cd = this.cardCooldowns[c.id] || 0;
    return this.mana >= c.manaCost && cd <= 0;
  }

  summonUnit(c, laneIndex) {
    if (!this.canSummon(c)) return false;
    this.mana -= c.manaCost;
    this.cardCooldowns[c.id] = c.cooldownSec;
    this.playerUnits.push({
      id: 'player_' + (this.nextId++), cardId: c.id, isPlayer: true,
      name: c.name, species: c.species, race: c.race, element: c.element, tier: c.tier,
      maxHp: cardHp(c), currentHp: cardHp(c), atk: cardAtk(c),
      attackSpeed: c.attackSpeed, moveSpeed: c.moveSpeed, range: c.range, isRanged: isRanged(c),
      laneIndex, position: BATTLE.enemyFrontLine(),
      state: 'MARCHING', attackTimer: 0, stateTimer: 0,
      burnTimer: 0, frozenTimer: 0, poisonedTimer: 0
    });
    this.play('select');
    this.spawnSummonVfx(80, laneIndex, M.ELEMENT[c.element].color);
    return true;
  }

  triggerCatapultSuperweapon() {
    if (this.catapultCooldownTimer > 0 || this.isGameOver) return false;
    this.catapultCooldownTimer = this.catapultMaxCooldown;
    this.play('fire_explode');
    for (const enemy of this.enemyUnits) {
      const damage = 220 + this.playerProfile.turretLevel * 45;
      enemy.currentHp -= damage;
      this.addFloatingText('-' + Math.trunc(damage) + ' CRIT!', enemy.position, this.getLaneY(enemy.laneIndex) - 20, '#FF1744');
      this.spawnExplosionParticles(enemy.position, this.getLaneY(enemy.laneIndex), '#FF5722', 15, null);
    }
    this.enemyFort.currentHp = Math.max(this.enemyFort.currentHp - 250, 0);
    this.addFloatingText('-250 FORT HIT!', BATTLE.FORT_ENEMY.x, 180, '#FF3D00');
    return true;
  }

  updateLanes(dt) {
    for (let lane = 0; lane < 5; lane++) {
      // Front-most player unit first; lowest-position enemy unit first.
      const pUnits = this.playerUnits.filter(u => u.laneIndex === lane).sort((a, b) => b.position - a.position);
      const eUnits = this.enemyUnits.filter(u => u.laneIndex === lane).sort((a, b) => a.position - b.position);

      for (const p of pUnits) {
        if (p.currentHp <= 0) continue;
        p.attackTimer = Math.max(p.attackTimer - dt, 0);
        const leadEnemy = eUnits.find(e => e.position > p.position) || null;
        const distToEnemy = leadEnemy ? leadEnemy.position - p.position : Number.MAX_VALUE;
        const distToFort = BATTLE.playerFrontLine() - p.position;

        if (distToEnemy <= p.range) {
          p.state = 'ATTACKING';
          if (p.attackTimer <= 0) { this.performAttack(p, leadEnemy, lane); p.attackTimer = 1.0 / p.attackSpeed; }
        } else if (distToFort <= p.range + 20) {
          p.state = 'ATTACKING';
          if (p.attackTimer <= 0) { this.attackFort(p, this.enemyFort, true, lane); p.attackTimer = 1.0 / p.attackSpeed; }
        } else {
          p.state = 'MARCHING';
          const nextPos = p.position + p.moveSpeed * dt;
          const maxAllowed = leadEnemy ? leadEnemy.position - 25 : BATTLE.playerFrontLine();
          p.position = Math.min(nextPos, maxAllowed);
        }
      }

      for (const e of eUnits) {
        if (e.currentHp <= 0) continue;
        e.attackTimer = Math.max(e.attackTimer - dt, 0);
        const leadPlayer = pUnits.find(p => p.position < e.position) || null;
        const distToPlayer = leadPlayer ? e.position - leadPlayer.position : Number.MAX_VALUE;
        const distToFort = e.position - BATTLE.enemyFrontLine();

        if (distToPlayer <= e.range) {
          e.state = 'ATTACKING';
          if (e.attackTimer <= 0) { this.performAttack(e, leadPlayer, lane); e.attackTimer = 1.0 / e.attackSpeed; }
        } else if (distToFort <= e.range + 20) {
          e.state = 'ATTACKING';
          if (e.attackTimer <= 0) { this.attackFort(e, this.playerFort, false, lane); e.attackTimer = 1.0 / e.attackSpeed; }
        } else {
          e.state = 'MARCHING';
          const nextPos = e.position - e.moveSpeed * dt;
          const minAllowed = leadPlayer ? leadPlayer.position + 25 : BATTLE.enemyFrontLine();
          e.position = Math.max(nextPos, minAllowed);
        }
      }
    }

    // Reap the dead.
    const deadPlayer = this.playerUnits.filter(u => u.currentHp <= 0);
    for (const u of deadPlayer) { this.playDeathSound(u.race); this.spawnDeathVfx(u.position, u.laneIndex); }
    this.playerUnits = this.playerUnits.filter(u => u.currentHp > 0);

    const deadEnemy = this.enemyUnits.filter(u => u.currentHp <= 0);
    for (const u of deadEnemy) {
      this.playDeathSound(u.race);
      this.spawnDeathVfx(u.position, u.laneIndex);
      this.mana = Math.min(this.mana + 6, this.maxMana);   // kill reward
      this.arenaScore += 40;
    }
    this.enemyUnits = this.enemyUnits.filter(u => u.currentHp > 0);
  }

  performAttack(attacker, target, lane) {
    const y = this.getLaneY(lane);
    if (attacker.isRanged) {
      this.projectiles.push({
        id: this.nextId++, isPlayer: attacker.isPlayer, laneIndex: lane,
        currentX: attacker.position, currentY: y - 10,
        targetX: target.position, targetY: y - 10,
        speed: 360, damage: attacker.atk, element: attacker.element, isTurret: false
      });
      this.playElementSound(attacker.element);
    } else {
      let damage = attacker.atk;
      const isCrit = isStrongAgainst(attacker.element, target.element);
      if (isCrit) damage *= 1.5;
      target.currentHp -= damage;
      const textColor = isCrit ? '#FFD600' : '#FFFFFF';
      const textStr = (isCrit ? Math.trunc(damage) + '!' : '' + Math.trunc(damage));
      this.addFloatingText(textStr, target.position, y - 25, textColor);
      this.spawnHitParticles(target.position, y, M.ELEMENT[attacker.element].color, attacker.element);
      this.playElementSound(attacker.element);
    }
  }

  attackFort(attacker, targetFort, isEnemyFort, lane) {
    const y = this.getLaneY(lane);
    const damage = attacker.atk;
    targetFort.currentHp = Math.max(targetFort.currentHp - damage, 0);
    const fortX = isEnemyFort ? BATTLE.FORT_ENEMY.x : BATTLE.FORT_PLAYER.x;
    this.addFloatingText('-' + Math.trunc(damage), fortX, y - 15, '#FF5252');
    this.spawnHitParticles(fortX, y, M.ELEMENT[attacker.element].color, attacker.element);
    this.playElementSound(attacker.element);
  }

  updateFortTurrets(dt) {
    // Player turret: engages the enemy nearest the player wall.
    this.playerFort.turretTimer = Math.max(this.playerFort.turretTimer - dt, 0);
    if (this.playerFort.turretTimer <= 0) {
      const target = minBy(this.enemyUnits.filter(u => u.position <= this.playerFort.turretRange), u => u.position);
      if (target) {
        this.projectiles.push({
          id: this.nextId++, isPlayer: true, laneIndex: target.laneIndex,
          currentX: BATTLE.FORT_PLAYER.x + 8, currentY: 120, targetX: target.position, targetY: this.getLaneY(target.laneIndex),
          speed: 450, damage: this.playerFort.turretAtk, element: 'LIGHTNING', isTurret: true
        });
        this.playerFort.turretTimer = this.playerFort.turretCooldown;
        this.play('light');
      }
    }
    // Enemy turret: targets the player unit that has pushed deepest.
    this.enemyFort.turretTimer = Math.max(this.enemyFort.turretTimer - dt, 0);
    if (this.enemyFort.turretTimer <= 0) {
      const target = maxBy(this.playerUnits.filter(u => u.position >= BATTLE.BATTLEFIELD_W - this.enemyFort.turretRange), u => u.position);
      if (target) {
        this.projectiles.push({
          id: this.nextId++, isPlayer: false, laneIndex: target.laneIndex,
          currentX: BATTLE.FORT_ENEMY.x - 8, currentY: 120, targetX: target.position, targetY: this.getLaneY(target.laneIndex),
          speed: 450, damage: this.enemyFort.turretAtk, element: 'FIRE', isTurret: true
        });
        this.enemyFort.turretTimer = this.enemyFort.turretCooldown;
        this.play('fire');
      }
    }
  }

  updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const dx = p.targetX - p.currentX, dy = p.targetY - p.currentY;
      const dist = Math.hypot(dx, dy);
      const step = p.speed * dt;

      if (dist <= step || dist < 12) {
        this.projectiles.splice(i, 1);
        const targetUnits = p.isPlayer ? this.enemyUnits : this.playerUnits;
        const hitUnit = minBy(targetUnits.filter(u => u.laneIndex === p.laneIndex), u => Math.abs(u.position - p.targetX));
        if (hitUnit && Math.abs(hitUnit.position - p.targetX) < 45) {
          let damage = p.damage;
          const isCrit = isStrongAgainst(p.element, hitUnit.element);
          if (isCrit) damage *= 1.4;
          hitUnit.currentHp -= damage;
          this.addFloatingText(isCrit ? Math.trunc(damage) + ' CRIT!' : '' + Math.trunc(damage),
            hitUnit.position, this.getLaneY(p.laneIndex) - 25, isCrit ? '#FFD54F' : '#FFFFFF');
        }
        this.spawnExplosionParticles(p.targetX, p.targetY, M.ELEMENT[p.element].color, 8, p.element);
        if (p.isTurret) this.play('fire_explode');
      } else {
        p.currentX += (dx / dist) * step;
        p.currentY += (dy / dist) * step;
      }
    }
  }

  updateVFX(dt) {
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      this.floatingTexts[i].life -= dt;
      if (this.floatingTexts[i].life <= 0) this.floatingTexts.splice(i, 1);
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) this.particles.splice(i, 1);
      else { p.x += p.vx * dt; p.y += p.vy * dt; }
    }
  }

  checkFortressState() {
    if (this.enemyFort.currentHp <= 0 && !this.isGameOver) {
      this.isGameOver = true; this.isVictory = true;
      this.play('fort_ruin'); this.play('victory');
      this.spawnExplosionParticles(BATTLE.FORT_ENEMY.x, 200, '#FF5722', 40, 'FIRE');
    } else if (this.playerFort.currentHp <= 0 && !this.isGameOver) {
      this.isGameOver = true; this.isVictory = false;
      this.play('fort_ruin'); this.play('defeat');
      this.spawnExplosionParticles(BATTLE.FORT_PLAYER.x, 200, '#FF1744', 40, 'FIRE');
    }
  }

  addFloatingText(text, x, y, color) {
    this.floatingTexts.push({ id: this.nextId++, text, x, y, color, life: 0.8, maxLife: 0.8 });
  }
  /**
   * `element` travels with the particle so the renderer can draw a shape that
   * matches the element. Without it every impact fell back to the same generic
   * dot and fire, ice and lightning were indistinguishable on the board.
   */
  _burst(x, y, color, count, speedLo, speedHi, sizeLo, sizeHi, life, element) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * (speedHi - speedLo) + speedLo;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        color, element: element || null,
        size: Math.random() * (sizeHi - sizeLo) + sizeLo,
        life, maxLife: life
      });
    }
  }
  spawnSummonVfx(x, lane, color, element) { this._burst(x, this.getLaneY(lane), color, 12, 30, 150, 4, 10, 0.5, element); }
  spawnHitParticles(x, y, color, element)  { this._burst(x, y, color, 6, 20, 110, 3, 7, 0.35, element); }
  spawnExplosionParticles(x, y, c, n, element) { this._burst(x, y, c, n, 50, 270, 4, 12, 0.7, element); }
  // A death is ash and dust, never elemental: the creature is gone, so there is
  // no element to read.
  spawnDeathVfx(x, lane) { this._burst(x, this.getLaneY(lane), '#8d7b6a', 10, 50, 270, 4, 12, 0.7, null); }

  playDeathSound(race) {
    const s = { BIPED: 'biped_die', QUADRUPED: 'quad_die', DRAGON: 'dragon_die' }[race];
    if (s) this.play(s);
  }
  playElementSound(element) {
    this.play({ FIRE: 'fire', ICE: 'ice', LIGHTNING: 'light',
                WIND: 'wind', EARTH: 'earth', POISON: 'poison' }[element]);
  }

  getLaneY(laneIndex) {
    // Delegates to the shared battlefield config. These two numbers used to be
    // literals here AND in render.js; a change to one silently desynced lane
    // maths from the hit test, and units rendered in a different lane than the
    // one that was clicked.
    return BATTLE.laneGroundY(laneIndex);
  }
}

if (typeof module !== 'undefined') {
  module.exports = { BattleEngine, clamp, minBy, maxBy };
}