package com.example.beastforge.data

import com.example.beastforge.model.*

object BeastCatalog {

    val BEAR = BeastCard(
        id = "biped_bear",
        species = "Grizzly Bear",
        name = "Grizzly Bear",
        race = BeastRace.BIPED,
        element = ElementType.EARTH,
        tier = BeastTier.COMMON,
        level = 1,
        baseHp = 220f,
        baseAtk = 32f,
        attackSpeed = 0.9f,
        moveSpeed = 48f,
        range = 35f,
        manaCost = 25,
        cooldownSec = 4.0f,
        lore = "A hulking forest brute wielding earth-shattering claws. Durable frontliner."
    )

    val WEREWOLF = BeastCard(
        id = "biped_werewolf",
        species = "Shadow Werewolf",
        name = "Shadow Werewolf",
        race = BeastRace.BIPED,
        element = ElementType.WIND,
        tier = BeastTier.COMMON,
        level = 1,
        baseHp = 140f,
        baseAtk = 42f,
        attackSpeed = 1.3f,
        moveSpeed = 75f,
        range = 32f,
        manaCost = 30,
        cooldownSec = 4.5f,
        lore = "Rapid predator striking under the blood moon. High speed and piercing DPS."
    )

    val GORILLA = BeastCard(
        id = "biped_gorilla",
        species = "Apex Gorilla",
        name = "Apex Gorilla",
        race = BeastRace.BIPED,
        element = ElementType.EARTH,
        tier = BeastTier.RARE,
        level = 1,
        baseHp = 260f,
        baseAtk = 38f,
        attackSpeed = 0.85f,
        moveSpeed = 45f,
        range = 38f,
        manaCost = 38,
        cooldownSec = 6.0f,
        lore = "A mountain silverback pounding foes into dust with seismic punches."
    )

    val LIZARD = BeastCard(
        id = "biped_lizard",
        species = "Venom Lizard",
        name = "Venom Lizard",
        race = BeastRace.BIPED,
        element = ElementType.POISON,
        tier = BeastTier.COMMON,
        level = 1,
        baseHp = 130f,
        baseAtk = 28f,
        attackSpeed = 1.2f,
        moveSpeed = 65f,
        range = 45f,
        manaCost = 22,
        cooldownSec = 3.5f,
        lore = "Coats its fangs in caustic bile that slowly dissolves opposing armor."
    )

    val TIGER = BeastCard(
        id = "quad_tiger",
        species = "Storm Tiger",
        name = "Storm Tiger",
        race = BeastRace.QUADRUPED,
        element = ElementType.LIGHTNING,
        tier = BeastTier.COMMON,
        level = 1,
        baseHp = 160f,
        baseAtk = 45f,
        attackSpeed = 1.1f,
        moveSpeed = 70f,
        range = 35f,
        manaCost = 32,
        cooldownSec = 5.0f,
        lore = "Crackles with ambient static electricity. Lethal pouncing ambush beast."
    )

    val LION = BeastCard(
        id = "quad_lion",
        species = "Flame Lion",
        name = "Flame Lion",
        race = BeastRace.QUADRUPED,
        element = ElementType.FIRE,
        tier = BeastTier.RARE,
        level = 1,
        baseHp = 210f,
        baseAtk = 48f,
        attackSpeed = 1.0f,
        moveSpeed = 62f,
        range = 36f,
        manaCost = 40,
        cooldownSec = 6.5f,
        lore = "Monarch of the scorched savanna, igniting enemy ranks with fiery roars."
    )

    val RHINO = BeastCard(
        id = "quad_rhino",
        species = "Iron Rhino",
        name = "Iron Rhino",
        race = BeastRace.QUADRUPED,
        element = ElementType.EARTH,
        tier = BeastTier.RARE,
        level = 1,
        baseHp = 340f,
        baseAtk = 26f,
        attackSpeed = 0.75f,
        moveSpeed = 40f,
        range = 35f,
        manaCost = 45,
        cooldownSec = 8.0f,
        lore = "An unstoppable battering ram with thick stone hide that absorbs heavy punishment."
    )

    val HIPPO = BeastCard(
        id = "quad_hippo",
        species = "Glacier Hippo",
        name = "Glacier Hippo",
        race = BeastRace.QUADRUPED,
        element = ElementType.ICE,
        tier = BeastTier.COMMON,
        level = 1,
        baseHp = 290f,
        baseAtk = 24f,
        attackSpeed = 0.8f,
        moveSpeed = 38f,
        range = 34f,
        manaCost = 35,
        cooldownSec = 6.0f,
        lore = "Submerged in arctic rivers, crushing invaders between frosted jaws."
    )

    val FIRE_DRAGON = BeastCard(
        id = "dragon_fire",
        species = "Fire Dragon",
        name = "Fire Dragon",
        race = BeastRace.DRAGON,
        element = ElementType.FIRE,
        tier = BeastTier.EPIC,
        level = 1,
        baseHp = 280f,
        baseAtk = 65f,
        attackSpeed = 0.9f,
        moveSpeed = 55f,
        range = 160f,
        manaCost = 65,
        cooldownSec = 12.0f,
        lore = "Flying horror unleashing searing columns of flame from safe distance."
    )

    val ICE_DRAGON = BeastCard(
        id = "dragon_ice",
        species = "Frost Dragon",
        name = "Frost Dragon",
        race = BeastRace.DRAGON,
        element = ElementType.ICE,
        tier = BeastTier.EPIC,
        level = 1,
        baseHp = 270f,
        baseAtk = 58f,
        attackSpeed = 0.95f,
        moveSpeed = 52f,
        range = 150f,
        manaCost = 60,
        cooldownSec = 11.0f,
        lore = "Breathes freezing blizzards that chill enemies and slow their movement."
    )

    val DESERT_DRAGON = BeastCard(
        id = "dragon_desert",
        species = "Gale Dragon",
        name = "Gale Dragon",
        race = BeastRace.DRAGON,
        element = ElementType.WIND,
        tier = BeastTier.EPIC,
        level = 1,
        baseHp = 240f,
        baseAtk = 62f,
        attackSpeed = 1.15f,
        moveSpeed = 68f,
        range = 155f,
        manaCost = 58,
        cooldownSec = 10.0f,
        lore = "Whips up razor-sharp dust vortices, evading ground obstacles with grace."
    )

    val SWAMP_DRAGON = BeastCard(
        id = "dragon_swamp",
        species = "Corrosion Drake",
        name = "Corrosion Drake",
        race = BeastRace.DRAGON,
        element = ElementType.POISON,
        tier = BeastTier.LEGENDARY,
        level = 1,
        baseHp = 320f,
        baseAtk = 72f,
        attackSpeed = 1.0f,
        moveSpeed = 50f,
        range = 160f,
        manaCost = 75,
        cooldownSec = 14.0f,
        lore = "Ancient swamp behemoth spitting acid clouds that erode fortress stones."
    )

    val ALL_BEASTS = listOf(
        BEAR, WEREWOLF, GORILLA, LIZARD,
        TIGER, LION, RHINO, HIPPO,
        FIRE_DRAGON, ICE_DRAGON, DESERT_DRAGON, SWAMP_DRAGON
    )

    fun getStarterDeck(): List<BeastCard> = listOf(
        BEAR,
        TIGER,
        WEREWOLF,
        FIRE_DRAGON
    )

    fun getStarterUnlocked(): List<BeastCard> = listOf(
        BEAR,
        TIGER,
        WEREWOLF,
        HIPPO,
        LIZARD,
        FIRE_DRAGON
    )

    fun getStage(stageNumber: Int): StageConfig {
        val stageIndex = stageNumber.coerceIn(1, 20)
        val stageNames = listOf(
            "Verdant Outskirts",
            "Whispering Glade",
            "Savage Steppes",
            "Scorched Gorge",
            "Obsidian Foothills",
            "Frozen Peaks",
            "Glacial Chasm",
            "Poison Mire",
            "Dredge Citadel",
            "Wyrm Caverns",
            "Titan Bastion",
            "Abyssal Spire"
        )
        val themes = listOf("forest", "forest", "volcano", "volcano", "snow", "snow", "citadel", "citadel")
        val theme = themes[(stageIndex - 1) % themes.size]
        val name = stageNames.getOrElse(stageIndex - 1) { "Dominion $stageIndex" }

        val fortHp = 700f + (stageIndex * 180f)
        val spawns = mutableListOf<EnemySpawn>()

        val spawnCount = 12 + stageIndex * 4
        var time = 3.0f

        val possibleEnemies = when {
            stageIndex <= 2 -> listOf(BEAR, LIZARD, HIPPO)
            stageIndex <= 5 -> listOf(BEAR, WEREWOLF, TIGER, HIPPO, LIZARD)
            stageIndex <= 8 -> listOf(BEAR, WEREWOLF, GORILLA, TIGER, LION, RHINO)
            else -> listOf(BEAR, WEREWOLF, GORILLA, TIGER, LION, RHINO, FIRE_DRAGON, ICE_DRAGON)
        }

        for (i in 0 until spawnCount) {
            val enemyBase = possibleEnemies.random()
            val enemyTier = when {
                stageIndex >= 8 && i % 4 == 0 -> BeastTier.EPIC
                stageIndex >= 4 && i % 3 == 0 -> BeastTier.RARE
                else -> BeastTier.COMMON
            }
            val enemy = enemyBase.copy(
                tier = enemyTier,
                level = maxOf(1, stageIndex / 2)
            )
            val lane = (0..4).random()
            spawns.add(EnemySpawn(time, lane, enemy))
            time += maxOf(1.8f, 5.0f - (stageIndex * 0.15f))
        }

        // Add a Boss spawn at end of stage
        val bossBeast = if (stageIndex % 3 == 0) {
            when (theme) {
                "volcano" -> FIRE_DRAGON.copy(name = "Infernal Titan Drake", tier = BeastTier.MYTHIC, level = stageIndex)
                "snow" -> ICE_DRAGON.copy(name = "Abominable Frost Wyrm", tier = BeastTier.MYTHIC, level = stageIndex)
                else -> RHINO.copy(name = "Colossus Behemoth", tier = BeastTier.LEGENDARY, level = stageIndex)
            }
        } else null

        if (bossBeast != null) {
            spawns.add(EnemySpawn(time + 2f, 2, bossBeast))
        }

        return StageConfig(
            stageNumber = stageIndex,
            name = name,
            description = "Conquer enemy fortress and crush invading beasts across 5 lanes.",
            bgTheme = theme,
            enemyFortHp = fortHp,
            enemySpawns = spawns,
            rewardCoins = 150 + stageIndex * 60,
            rewardCrystals = 15 + stageIndex * 5,
            bossCard = bossBeast
        )
    }

    fun generateArenaSpawns(waveNumber: Int): List<EnemySpawn> {
        val count = 8 + waveNumber * 3
        val spawns = mutableListOf<EnemySpawn>()
        var time = 2.0f
        for (i in 0 until count) {
            val base = ALL_BEASTS.random()
            val tier = when {
                waveNumber > 10 && i % 2 == 0 -> BeastTier.LEGENDARY
                waveNumber > 5 && i % 3 == 0 -> BeastTier.EPIC
                waveNumber > 2 && i % 4 == 0 -> BeastTier.RARE
                else -> BeastTier.COMMON
            }
            val unit = base.copy(tier = tier, level = maxOf(1, waveNumber / 2))
            val lane = (0..4).random()
            spawns.add(EnemySpawn(time, lane, unit))
            time += maxOf(1.2f, 3.8f - (waveNumber * 0.1f))
        }
        return spawns
    }
}
