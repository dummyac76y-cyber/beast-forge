package com.example.beastforge.model

import androidx.compose.ui.graphics.Color
import com.example.beastforge.ui.theme.*

enum class BeastRace(val displayName: String) {
    BIPED("Biped"),
    QUADRUPED("Quadruped"),
    DRAGON("Dragon")
}

enum class ElementType(val displayName: String, val color: Color) {
    FIRE("Fire", FireRed),
    ICE("Ice", IceBlue),
    LIGHTNING("Lightning", LightningYellow),
    EARTH("Earth", EarthGreen),
    POISON("Poison", PoisonPurple),
    WIND("Wind", WindCyan);

    fun counterElement(): ElementType = when (this) {
        FIRE -> ICE
        ICE -> WIND
        WIND -> EARTH
        EARTH -> LIGHTNING
        LIGHTNING -> POISON
        POISON -> FIRE
    }

    fun isStrongAgainst(other: ElementType): Boolean = counterElement() == other
}

enum class BeastTier(val displayName: String, val color: Color, val multiplier: Float) {
    COMMON("Feral", Color(0xFFB0BEC5), 1.0f),
    RARE("Armored", Color(0xFF42A5F5), 1.35f),
    EPIC("Elemental", Color(0xFFAB47BC), 1.8f),
    LEGENDARY("Apex", Color(0xFFFFB300), 2.4f),
    MYTHIC("Ancient", Color(0xFFFF1744), 3.2f)
}

data class BeastCard(
    val id: String,
    val species: String,
    val name: String,
    val race: BeastRace,
    val element: ElementType,
    val tier: BeastTier = BeastTier.COMMON,
    val level: Int = 1,
    val baseHp: Float,
    val baseAtk: Float,
    val attackSpeed: Float = 1.0f, // attacks per second
    val moveSpeed: Float = 60f, // pixels/units per second
    val range: Float = 40f, // melee vs ranged
    val manaCost: Int = 20,
    val cooldownSec: Float = 4f,
    val lore: String = "",
    val count: Int = 1
) {
    val hp: Float get() = (baseHp * tier.multiplier * (1f + (level - 1) * 0.15f)).toInt().toFloat()
    val atk: Float get() = (baseAtk * tier.multiplier * (1f + (level - 1) * 0.15f)).toInt().toFloat()
    val isRanged: Boolean get() = range > 80f || race == BeastRace.DRAGON

    fun evolve(): BeastCard {
        val nextTier = when (tier) {
            BeastTier.COMMON -> BeastTier.RARE
            BeastTier.RARE -> BeastTier.EPIC
            BeastTier.EPIC -> BeastTier.LEGENDARY
            BeastTier.LEGENDARY -> BeastTier.MYTHIC
            BeastTier.MYTHIC -> BeastTier.MYTHIC
        }
        val evolvedName = when (nextTier) {
            BeastTier.RARE -> "Armored $species"
            BeastTier.EPIC -> "Infernal $species"
            BeastTier.LEGENDARY -> "Apex $species"
            BeastTier.MYTHIC -> "Titan $species"
            else -> name
        }
        return copy(
            name = evolvedName,
            tier = nextTier,
            level = 1,
            range = if (nextTier >= BeastTier.EPIC && race == BeastRace.DRAGON) 160f else range
        )
    }

    fun upgradeLevel(): BeastCard {
        return copy(level = level + 1)
    }
}

enum class UnitAnimState {
    MARCHING,
    ATTACKING,
    HURT,
    DYING
}

data class BattleUnit(
    val id: String,
    val cardId: String,
    val isPlayer: Boolean,
    val name: String,
    val species: String,
    val race: BeastRace,
    val element: ElementType,
    val tier: BeastTier,
    val maxHp: Float,
    var currentHp: Float,
    val atk: Float,
    val attackSpeed: Float,
    val moveSpeed: Float,
    val range: Float,
    val isRanged: Boolean,
    val laneIndex: Int,
    var position: Float, // 0 to 1000
    var state: UnitAnimState = UnitAnimState.MARCHING,
    var attackTimer: Float = 0f,
    var stateTimer: Float = 0f,
    var burnTimer: Float = 0f,
    var frozenTimer: Float = 0f,
    var poisonedTimer: Float = 0f
)

data class Fortress(
    val maxHp: Float,
    var currentHp: Float,
    val turretAtk: Float = 35f,
    val turretRange: Float = 220f,
    val turretCooldown: Float = 2.0f,
    var turretTimer: Float = 0f
)

data class FloatingText(
    val id: Long,
    val text: String,
    val x: Float,
    val y: Float,
    val color: Color,
    var life: Float = 0.8f,
    val maxLife: Float = 0.8f
)

data class Projectile(
    val id: Long,
    val isPlayer: Boolean,
    val laneIndex: Int,
    var currentX: Float,
    var currentY: Float,
    val targetX: Float,
    val targetY: Float,
    val speed: Float,
    val damage: Float,
    val element: ElementType,
    val isTurret: Boolean = false
)

data class Particle(
    var x: Float,
    var y: Float,
    var vx: Float,
    var vy: Float,
    val color: Color,
    val size: Float,
    var life: Float,
    val maxLife: Float
)

data class EnemySpawn(
    val spawnTimeSec: Float,
    val laneIndex: Int,
    val beastCard: BeastCard
)

data class StageConfig(
    val stageNumber: Int,
    val name: String,
    val description: String,
    val bgTheme: String, // "forest", "volcano", "snow", "citadel", "arena"
    val enemyFortHp: Float,
    val enemySpawns: List<EnemySpawn>,
    val rewardCoins: Int,
    val rewardCrystals: Int,
    val bossCard: BeastCard? = null
)

data class PlayerProfile(
    val coins: Int = 500,
    val crystals: Int = 50,
    val currentStage: Int = 1,
    val highestArenaWave: Int = 0,
    val fortLevel: Int = 1,
    val mineralLevel: Int = 1,
    val turretLevel: Int = 1,
    val unlockedCards: List<BeastCard> = emptyList(),
    val deckCardIds: List<String> = emptyList(),
    val soundEnabled: Boolean = true
) {
    val fortMaxHp: Float get() = 800f + (fortLevel - 1) * 250f
    val turretAtk: Float get() = 30f + (turretLevel - 1) * 15f
    val turretCooldown: Float get() = maxOf(0.8f, 2.0f - (turretLevel - 1) * 0.15f)
    val maxMana: Float get() = 100f + (mineralLevel - 1) * 20f
    val manaRegenRate: Float get() = 7.0f + (mineralLevel - 1) * 1.5f // mana per sec
}
