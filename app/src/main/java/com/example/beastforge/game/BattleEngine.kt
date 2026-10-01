package com.example.beastforge.game

import androidx.compose.ui.graphics.Color
import com.example.beastforge.audio.SoundManager
import com.example.beastforge.model.*
import kotlin.math.cos
import kotlin.math.sin
import kotlin.random.Random

class BattleEngine(
    val stageConfig: StageConfig,
    val playerProfile: PlayerProfile,
    val soundManager: SoundManager? = null,
    val isArenaMode: Boolean = false
) {
    var playerFort = Fortress(
        maxHp = playerProfile.fortMaxHp,
        currentHp = playerProfile.fortMaxHp,
        turretAtk = playerProfile.turretAtk,
        turretRange = 280f,
        turretCooldown = playerProfile.turretCooldown
    )
        private set

    var enemyFort = Fortress(
        maxHp = stageConfig.enemyFortHp,
        currentHp = stageConfig.enemyFortHp,
        turretAtk = 25f + stageConfig.stageNumber * 8f,
        turretRange = 260f,
        turretCooldown = 2.2f
    )
        private set

    val playerUnits = mutableListOf<BattleUnit>()
    val enemyUnits = mutableListOf<BattleUnit>()
    val projectiles = mutableListOf<Projectile>()
    val particles = mutableListOf<Particle>()
    val floatingTexts = mutableListOf<FloatingText>()

    var mana: Float = 35f
        private set
    val maxMana: Float = playerProfile.maxMana
    val manaRegenRate: Float = playerProfile.manaRegenRate

    val cardCooldowns = mutableMapOf<String, Float>()
    var catapultCooldownTimer: Float = 0f
    val catapultMaxCooldown: Float = 25f

    var battleTime: Float = 0f
        private set
    var isGameOver: Boolean = false
        private set
    var isVictory: Boolean = false
        private set
    var isPaused: Boolean = false
    var gameSpeed: Float = 1.0f

    private val pendingSpawns = stageConfig.enemySpawns.toMutableList()
    var arenaWave: Int = 1
        private set
    var arenaScore: Int = 0
        private set

    private var nextId: Long = 1L

    init {
        soundManager?.play("stage_start")
    }

    fun update(deltaTime: Float) {
        if (isGameOver || isPaused) return
        val dt = (deltaTime * gameSpeed).coerceIn(0f, 0.1f)
        battleTime += dt

        // 1. Mana Regen
        mana = (mana + manaRegenRate * dt).coerceAtMost(maxMana)

        // 2. Cooldowns
        for (key in cardCooldowns.keys.toList()) {
            val cd = cardCooldowns[key] ?: 0f
            if (cd > 0f) {
                cardCooldowns[key] = (cd - dt).coerceAtLeast(0f)
            }
        }
        if (catapultCooldownTimer > 0f) {
            catapultCooldownTimer = (catapultCooldownTimer - dt).coerceAtLeast(0f)
        }

        // 3. Enemy Spawns
        val iterator = pendingSpawns.iterator()
        while (iterator.hasNext()) {
            val spawn = iterator.next()
            if (battleTime >= spawn.spawnTimeSec) {
                spawnEnemyUnit(spawn.beastCard, spawn.laneIndex)
                iterator.remove()
            }
        }

        // Arena mode endless wave restocking
        if (isArenaMode && pendingSpawns.isEmpty() && enemyUnits.isEmpty()) {
            arenaWave++
            arenaScore += 500 * arenaWave
            val nextSpawns = com.example.beastforge.data.BeastCatalog.generateArenaSpawns(arenaWave)
            for (s in nextSpawns) {
                pendingSpawns.add(s.copy(spawnTimeSec = battleTime + s.spawnTimeSec))
            }
            soundManager?.play("stage_start")
            addFloatingText("WAVE $arenaWave!", 500f, 150f, Color(0xFFFFD54F))
        }

        // 4. Update Units in each of the 5 lanes
        updateLanes(dt)

        // 5. Fort Turrets
        updateFortTurrets(dt)

        // 6. Projectiles
        updateProjectiles(dt)

        // 7. Particles & Floating Texts
        updateVFX(dt)

        // 8. Win / Loss Check
        checkFortressState()
    }

    private fun spawnEnemyUnit(card: BeastCard, laneIndex: Int) {
        val unit = BattleUnit(
            id = "enemy_${nextId++}",
            cardId = card.id,
            isPlayer = false,
            name = card.name,
            species = card.species,
            race = card.race,
            element = card.element,
            tier = card.tier,
            maxHp = card.hp,
            currentHp = card.hp,
            atk = card.atk,
            attackSpeed = card.attackSpeed,
            moveSpeed = card.moveSpeed,
            range = card.range,
            isRanged = card.isRanged,
            laneIndex = laneIndex,
            position = 920f
        )
        enemyUnits.add(unit)
    }

    fun canSummon(card: BeastCard): Boolean {
        if (isGameOver) return false
        val cd = cardCooldowns[card.id] ?: 0f
        return mana >= card.manaCost && cd <= 0f
    }

    fun summonUnit(card: BeastCard, laneIndex: Int): Boolean {
        if (!canSummon(card)) return false

        mana -= card.manaCost
        cardCooldowns[card.id] = card.cooldownSec

        val unit = BattleUnit(
            id = "player_${nextId++}",
            cardId = card.id,
            isPlayer = true,
            name = card.name,
            species = card.species,
            race = card.race,
            element = card.element,
            tier = card.tier,
            maxHp = card.hp,
            currentHp = card.hp,
            atk = card.atk,
            attackSpeed = card.attackSpeed,
            moveSpeed = card.moveSpeed,
            range = card.range,
            isRanged = card.isRanged,
            laneIndex = laneIndex,
            position = 80f
        )
        playerUnits.add(unit)

        soundManager?.play("select")
        spawnSummonVfx(80f, laneIndex, card.element.color)
        return true
    }

    fun triggerCatapultSuperweapon(): Boolean {
        if (catapultCooldownTimer > 0f || isGameOver) return false
        catapultCooldownTimer = catapultMaxCooldown

        soundManager?.play("fire_explode")
        // Strike all enemy units currently on field
        for (enemy in enemyUnits) {
            val damage = 220f + playerProfile.turretLevel * 45f
            enemy.currentHp -= damage
            addFloatingText("-${damage.toInt()} CRIT!", enemy.position, getLaneY(enemy.laneIndex) - 20f, Color(0xFFFF1744))
            spawnExplosionParticles(enemy.position, getLaneY(enemy.laneIndex), Color(0xFFFF5722), 15)
        }
        // Also damage enemy fort
        enemyFort.currentHp = (enemyFort.currentHp - 250f).coerceAtLeast(0f)
        addFloatingText("-250 FORT HIT!", 920f, 180f, Color(0xFFFF3D00))

        return true
    }

    private fun updateLanes(dt: Float) {
        for (lane in 0 until 5) {
            val pUnits = playerUnits.filter { it.laneIndex == lane }.sortedByDescending { it.position }
            val eUnits = enemyUnits.filter { it.laneIndex == lane }.sortedBy { it.position }

            // Update Player Units in this lane
            for (p in pUnits) {
                if (p.currentHp <= 0f) continue
                p.attackTimer = (p.attackTimer - dt).coerceAtLeast(0f)

                // Leading enemy in front
                val leadEnemy = eUnits.firstOrNull { it.position > p.position }
                val distToEnemy = if (leadEnemy != null) leadEnemy.position - p.position else Float.MAX_VALUE
                val distToFort = 920f - p.position

                if (distToEnemy <= p.range) {
                    // Attack Enemy Unit
                    p.state = UnitAnimState.ATTACKING
                    if (p.attackTimer <= 0f) {
                        performAttack(p, leadEnemy!!, lane)
                        p.attackTimer = 1.0f / p.attackSpeed
                    }
                } else if (distToFort <= p.range + 20f) {
                    // Attack Enemy Fortress
                    p.state = UnitAnimState.ATTACKING
                    if (p.attackTimer <= 0f) {
                        attackFort(p, enemyFort, isEnemyFort = true, lane)
                        p.attackTimer = 1.0f / p.attackSpeed
                    }
                } else {
                    // March Forward
                    p.state = UnitAnimState.MARCHING
                    val nextPos = p.position + p.moveSpeed * dt
                    val maxAllowed = if (leadEnemy != null) leadEnemy.position - 25f else 920f
                    p.position = nextPos.coerceAtMost(maxAllowed)
                }
            }

            // Update Enemy Units in this lane
            for (e in eUnits) {
                if (e.currentHp <= 0f) continue
                e.attackTimer = (e.attackTimer - dt).coerceAtLeast(0f)

                // Leading player unit in front (smaller position)
                val leadPlayer = pUnits.firstOrNull { it.position < e.position }
                val distToPlayer = if (leadPlayer != null) e.position - leadPlayer.position else Float.MAX_VALUE
                val distToFort = e.position - 80f

                if (distToPlayer <= e.range) {
                    // Attack Player Unit
                    e.state = UnitAnimState.ATTACKING
                    if (e.attackTimer <= 0f) {
                        performAttack(e, leadPlayer!!, lane)
                        e.attackTimer = 1.0f / e.attackSpeed
                    }
                } else if (distToFort <= e.range + 20f) {
                    // Attack Player Fortress
                    e.state = UnitAnimState.ATTACKING
                    if (e.attackTimer <= 0f) {
                        attackFort(e, playerFort, isEnemyFort = false, lane)
                        e.attackTimer = 1.0f / e.attackSpeed
                    }
                } else {
                    // March Leftward
                    e.state = UnitAnimState.MARCHING
                    val nextPos = e.position - e.moveSpeed * dt
                    val minAllowed = if (leadPlayer != null) leadPlayer.position + 25f else 80f
                    e.position = nextPos.coerceAtLeast(minAllowed)
                }
            }
        }

        // Clean up dead units
        val deadPlayer = playerUnits.filter { it.currentHp <= 0f }
        for (u in deadPlayer) {
            playDeathSound(u.race)
            spawnDeathVfx(u.position, u.laneIndex)
        }
        playerUnits.removeAll(deadPlayer)

        val deadEnemy = enemyUnits.filter { it.currentHp <= 0f }
        for (u in deadEnemy) {
            playDeathSound(u.race)
            spawnDeathVfx(u.position, u.laneIndex)
            // Reward mana on kill!
            mana = (mana + 6f).coerceAtMost(maxMana)
            arenaScore += 40
        }
        enemyUnits.removeAll(deadEnemy)
    }

    private fun performAttack(attacker: BattleUnit, target: BattleUnit, lane: Int) {
        val y = getLaneY(lane)

        if (attacker.isRanged) {
            // Spawn Ranged Projectile
            projectiles.add(
                Projectile(
                    id = nextId++,
                    isPlayer = attacker.isPlayer,
                    laneIndex = lane,
                    currentX = attacker.position,
                    currentY = y - 10f,
                    targetX = target.position,
                    targetY = y - 10f,
                    speed = 360f,
                    damage = attacker.atk,
                    element = attacker.element
                )
            )
            playElementSound(attacker.element)
        } else {
            // Melee Impact
            var damage = attacker.atk
            val isCrit = attacker.element.isStrongAgainst(target.element)
            if (isCrit) {
                damage *= 1.5f
            }
            target.currentHp -= damage

            val textColor = if (isCrit) Color(0xFFFFD600) else Color.White
            val textStr = if (isCrit) "${damage.toInt()}!" else "${damage.toInt()}"
            addFloatingText(textStr, target.position, y - 25f, textColor)

            spawnHitParticles(target.position, y, attacker.element.color)
            playElementSound(attacker.element)
        }
    }

    private fun attackFort(attacker: BattleUnit, targetFort: Fortress, isEnemyFort: Boolean, lane: Int) {
        val y = getLaneY(lane)
        val damage = attacker.atk
        targetFort.currentHp = (targetFort.currentHp - damage).coerceAtLeast(0f)

        val fortX = if (isEnemyFort) 940f else 60f
        addFloatingText("-${damage.toInt()}", fortX, y - 15f, Color(0xFFFF5252))
        spawnHitParticles(fortX, y, attacker.element.color)
        playElementSound(attacker.element)
    }

    private fun updateFortTurrets(dt: Float) {
        // Player Fortress Turret
        playerFort.turretTimer = (playerFort.turretTimer - dt).coerceAtLeast(0f)
        if (playerFort.turretTimer <= 0f) {
            val target = enemyUnits.filter { it.position <= playerFort.turretRange }.minByOrNull { it.position }
            if (target != null) {
                projectiles.add(
                    Projectile(
                        id = nextId++,
                        isPlayer = true,
                        laneIndex = target.laneIndex,
                        currentX = 70f,
                        currentY = 120f,
                        targetX = target.position,
                        targetY = getLaneY(target.laneIndex),
                        speed = 450f,
                        damage = playerFort.turretAtk,
                        element = ElementType.LIGHTNING,
                        isTurret = true
                    )
                )
                playerFort.turretTimer = playerFort.turretCooldown
                soundManager?.play("light")
            }
        }

        // Enemy Fortress Turret
        enemyFort.turretTimer = (enemyFort.turretTimer - dt).coerceAtLeast(0f)
        if (enemyFort.turretTimer <= 0f) {
            val target = playerUnits.filter { it.position >= 1000f - enemyFort.turretRange }.maxByOrNull { it.position }
            if (target != null) {
                projectiles.add(
                    Projectile(
                        id = nextId++,
                        isPlayer = false,
                        laneIndex = target.laneIndex,
                        currentX = 930f,
                        currentY = 120f,
                        targetX = target.position,
                        targetY = getLaneY(target.laneIndex),
                        speed = 450f,
                        damage = enemyFort.turretAtk,
                        element = ElementType.FIRE,
                        isTurret = true
                    )
                )
                enemyFort.turretTimer = enemyFort.turretCooldown
                soundManager?.play("fire")
            }
        }
    }

    private fun updateProjectiles(dt: Float) {
        val iter = projectiles.iterator()
        while (iter.hasNext()) {
            val p = iter.next()
            val dx = p.targetX - p.currentX
            val dy = p.targetY - p.currentY
            val dist = kotlin.math.hypot(dx, dy)
            val step = p.speed * dt

            if (dist <= step || dist < 12f) {
                // Impact!
                iter.remove()
                val targetUnits = if (p.isPlayer) enemyUnits else playerUnits
                val hitUnit = targetUnits.filter { it.laneIndex == p.laneIndex }
                    .minByOrNull { kotlin.math.abs(it.position - p.targetX) }

                if (hitUnit != null && kotlin.math.abs(hitUnit.position - p.targetX) < 45f) {
                    var damage = p.damage
                    val isCrit = p.element.isStrongAgainst(hitUnit.element)
                    if (isCrit) damage *= 1.4f
                    hitUnit.currentHp -= damage

                    val text = if (isCrit) "${damage.toInt()} CRIT!" else "${damage.toInt()}"
                    addFloatingText(text, hitUnit.position, getLaneY(p.laneIndex) - 25f, if (isCrit) Color(0xFFFFD54F) else Color.White)
                }

                spawnExplosionParticles(p.targetX, p.targetY, p.element.color, 8)
                if (p.isTurret) {
                    soundManager?.play("fire_explode")
                }
            } else {
                p.currentX += (dx / dist) * step
                p.currentY += (dy / dist) * step
            }
        }
    }

    private fun updateVFX(dt: Float) {
        // Floating Texts
        val textIter = floatingTexts.iterator()
        while (textIter.hasNext()) {
            val t = textIter.next()
            t.life -= dt
            if (t.life <= 0f) textIter.remove()
        }

        // Particles
        val pIter = particles.iterator()
        while (pIter.hasNext()) {
            val p = pIter.next()
            p.life -= dt
            if (p.life <= 0f) {
                pIter.remove()
            } else {
                p.x += p.vx * dt
                p.y += p.vy * dt
            }
        }
    }

    private fun checkFortressState() {
        if (enemyFort.currentHp <= 0f && !isGameOver) {
            isGameOver = true
            isVictory = true
            soundManager?.play("fort_ruin")
            soundManager?.play("victory")
            spawnExplosionParticles(930f, 200f, Color(0xFFFF5722), 40)
        } else if (playerFort.currentHp <= 0f && !isGameOver) {
            isGameOver = true
            isVictory = false
            soundManager?.play("fort_ruin")
            soundManager?.play("defeat")
            spawnExplosionParticles(70f, 200f, Color(0xFFFF1744), 40)
        }
    }

    private fun addFloatingText(text: String, x: Float, y: Float, color: Color) {
        floatingTexts.add(FloatingText(nextId++, text, x, y, color))
    }

    private fun spawnSummonVfx(x: Float, lane: Int, color: Color) {
        val y = getLaneY(lane)
        for (i in 0 until 12) {
            val angle = Random.nextFloat() * 2f * Math.PI.toFloat()
            val speed = Random.nextFloat() * 120f + 30f
            particles.add(
                Particle(
                    x = x,
                    y = y,
                    vx = cos(angle) * speed,
                    vy = sin(angle) * speed,
                    color = color,
                    size = Random.nextFloat() * 6f + 4f,
                    life = 0.5f,
                    maxLife = 0.5f
                )
            )
        }
    }

    private fun spawnHitParticles(x: Float, y: Float, color: Color) {
        for (i in 0 until 6) {
            val angle = Random.nextFloat() * 2f * Math.PI.toFloat()
            val speed = Random.nextFloat() * 90f + 20f
            particles.add(
                Particle(
                    x = x,
                    y = y,
                    vx = cos(angle) * speed,
                    vy = sin(angle) * speed,
                    color = color,
                    size = Random.nextFloat() * 4f + 3f,
                    life = 0.35f,
                    maxLife = 0.35f
                )
            )
        }
    }

    private fun spawnExplosionParticles(x: Float, y: Float, color: Color, count: Int) {
        for (i in 0 until count) {
            val angle = Random.nextFloat() * 2f * Math.PI.toFloat()
            val speed = Random.nextFloat() * 220f + 50f
            particles.add(
                Particle(
                    x = x,
                    y = y,
                    vx = cos(angle) * speed,
                    vy = sin(angle) * speed,
                    color = color,
                    size = Random.nextFloat() * 8f + 4f,
                    life = 0.7f,
                    maxLife = 0.7f
                )
            )
        }
    }

    private fun spawnDeathVfx(x: Float, lane: Int) {
        val y = getLaneY(lane)
        spawnExplosionParticles(x, y, Color(0xFF616161), 10)
    }

    private fun playDeathSound(race: BeastRace) {
        when (race) {
            BeastRace.BIPED -> soundManager?.play("biped_die")
            BeastRace.QUADRUPED -> soundManager?.play("quad_die")
            BeastRace.DRAGON -> soundManager?.play("dragon_die")
        }
    }

    private fun playElementSound(element: ElementType) {
        when (element) {
            ElementType.FIRE -> soundManager?.play("fire")
            ElementType.ICE -> soundManager?.play("ice")
            ElementType.LIGHTNING -> soundManager?.play("light")
            ElementType.WIND -> soundManager?.play("wind")
            ElementType.EARTH -> soundManager?.play("earth")
            ElementType.POISON -> soundManager?.play("poison")
        }
    }

    fun getLaneY(laneIndex: Int): Float {
        // Standard virtual coordinate height: 0 to 450, 5 lanes centered
        val laneStart = 110f
        val laneHeight = 55f
        return laneStart + laneIndex * laneHeight + laneHeight * 0.5f
    }
}
