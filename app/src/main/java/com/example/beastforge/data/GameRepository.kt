package com.example.beastforge.data

import android.content.Context
import android.content.SharedPreferences
import com.example.beastforge.model.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONArray
import org.json.JSONObject

class GameRepository(context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences("beast_forge_prefs", Context.MODE_PRIVATE)

    private val _profile = MutableStateFlow(loadProfile())
    val profile: StateFlow<PlayerProfile> = _profile.asStateFlow()

    private fun loadProfile(): PlayerProfile {
        val coins = prefs.getInt("coins", 600)
        val crystals = prefs.getInt("crystals", 80)
        val stage = prefs.getInt("current_stage", 1)
        val highestArena = prefs.getInt("highest_arena", 0)
        val fortLv = prefs.getInt("fort_lv", 1)
        val mineralLv = prefs.getInt("mineral_lv", 1)
        val turretLv = prefs.getInt("turret_lv", 1)
        val sound = prefs.getBoolean("sound_enabled", true)

        val cardsJson = prefs.getString("unlocked_cards", null)
        val unlockedCards = if (!cardsJson.isNullOrEmpty()) {
            deserializeCards(cardsJson)
        } else {
            BeastCatalog.getStarterUnlocked()
        }

        val deckJson = prefs.getString("deck_ids", null)
        val deckIds = if (!deckJson.isNullOrEmpty()) {
            deserializeDeck(deckJson)
        } else {
            BeastCatalog.getStarterDeck().map { it.id }
        }

        return PlayerProfile(
            coins = coins,
            crystals = crystals,
            currentStage = stage,
            highestArenaWave = highestArena,
            fortLevel = fortLv,
            mineralLevel = mineralLv,
            turretLevel = turretLv,
            unlockedCards = unlockedCards,
            deckCardIds = deckIds,
            soundEnabled = sound
        )
    }

    private fun saveProfile(p: PlayerProfile) {
        prefs.edit().apply {
            putInt("coins", p.coins)
            putInt("crystals", p.crystals)
            putInt("current_stage", p.currentStage)
            putInt("highest_arena", p.highestArenaWave)
            putInt("fort_lv", p.fortLevel)
            putInt("mineral_lv", p.mineralLevel)
            putInt("turret_lv", p.turretLevel)
            putBoolean("sound_enabled", p.soundEnabled)
            putString("unlocked_cards", serializeCards(p.unlockedCards))
            putString("deck_ids", serializeDeck(p.deckCardIds))
            apply()
        }
        _profile.value = p
    }

    fun addRewards(coins: Int, crystals: Int, advanceStage: Boolean = false) {
        val current = _profile.value
        val newStage = if (advanceStage) current.currentStage + 1 else current.currentStage
        saveProfile(
            current.copy(
                coins = current.coins + coins,
                crystals = current.crystals + crystals,
                currentStage = newStage
            )
        )
    }

    fun recordArenaScore(wave: Int) {
        val current = _profile.value
        if (wave > current.highestArenaWave) {
            saveProfile(current.copy(highestArenaWave = wave))
        }
    }

    fun upgradeFort(): Boolean {
        val current = _profile.value
        val cost = current.fortLevel * 250
        if (current.coins >= cost) {
            saveProfile(
                current.copy(
                    coins = current.coins - cost,
                    fortLevel = current.fortLevel + 1
                )
            )
            return true
        }
        return false
    }

    fun upgradeMineral(): Boolean {
        val current = _profile.value
        val cost = current.mineralLevel * 200
        if (current.coins >= cost) {
            saveProfile(
                current.copy(
                    coins = current.coins - cost,
                    mineralLevel = current.mineralLevel + 1
                )
            )
            return true
        }
        return false
    }

    fun upgradeTurret(): Boolean {
        val current = _profile.value
        val cost = current.turretLevel * 220
        if (current.coins >= cost) {
            saveProfile(
                current.copy(
                    coins = current.coins - cost,
                    turretLevel = current.turretLevel + 1
                )
            )
            return true
        }
        return false
    }

    fun evolveBeast(cardId: String): Boolean {
        val current = _profile.value
        val targetCard = current.unlockedCards.find { it.id == cardId } ?: return false
        val crystalCost = when (targetCard.tier) {
            BeastTier.COMMON -> 20
            BeastTier.RARE -> 45
            BeastTier.EPIC -> 90
            BeastTier.LEGENDARY -> 150
            BeastTier.MYTHIC -> return false
        }
        val coinCost = when (targetCard.tier) {
            BeastTier.COMMON -> 300
            BeastTier.RARE -> 700
            BeastTier.EPIC -> 1500
            BeastTier.LEGENDARY -> 3000
            BeastTier.MYTHIC -> return false
        }

        if (current.crystals >= crystalCost && current.coins >= coinCost) {
            val evolved = targetCard.evolve()
            val updatedList = current.unlockedCards.map { if (it.id == cardId) evolved else it }
            saveProfile(
                current.copy(
                    crystals = current.crystals - crystalCost,
                    coins = current.coins - coinCost,
                    unlockedCards = updatedList
                )
            )
            return true
        }
        return false
    }

    fun levelUpBeast(cardId: String): Boolean {
        val current = _profile.value
        val targetCard = current.unlockedCards.find { it.id == cardId } ?: return false
        val cost = targetCard.level * 180
        if (current.coins >= cost) {
            val leveled = targetCard.upgradeLevel()
            val updatedList = current.unlockedCards.map { if (it.id == cardId) leveled else it }
            saveProfile(
                current.copy(
                    coins = current.coins - cost,
                    unlockedCards = updatedList
                )
            )
            return true
        }
        return false
    }

    fun summonBeastPack(useCrystals: Boolean): BeastCard? {
        val current = _profile.value
        val coinCost = 400
        val crystalCost = 35

        if (useCrystals) {
            if (current.crystals < crystalCost) return null
        } else {
            if (current.coins < coinCost) return null
        }

        val pool = BeastCatalog.ALL_BEASTS
        val drawn = pool.random()
        val randomTier = if (useCrystals) {
            val roll = (1..100).random()
            when {
                roll > 85 -> BeastTier.LEGENDARY
                roll > 55 -> BeastTier.EPIC
                else -> BeastTier.RARE
            }
        } else {
            val roll = (1..100).random()
            when {
                roll > 95 -> BeastTier.EPIC
                roll > 75 -> BeastTier.RARE
                else -> BeastTier.COMMON
            }
        }

        val newCard = drawn.copy(
            id = "${drawn.id}_${System.currentTimeMillis() % 10000}",
            tier = randomTier
        )

        val updatedCards = current.unlockedCards + newCard
        val newCoins = if (useCrystals) current.coins else current.coins - coinCost
        val newCrystals = if (useCrystals) current.crystals - crystalCost else current.crystals

        saveProfile(
            current.copy(
                coins = newCoins,
                crystals = newCrystals,
                unlockedCards = updatedCards
            )
        )
        return newCard
    }

    fun setDeck(newDeckIds: List<String>) {
        if (newDeckIds.size in 1..4) {
            val current = _profile.value
            saveProfile(current.copy(deckCardIds = newDeckIds))
        }
    }

    fun toggleSound() {
        val current = _profile.value
        saveProfile(current.copy(soundEnabled = !current.soundEnabled))
    }

    private fun serializeCards(cards: List<BeastCard>): String {
        val arr = JSONArray()
        for (c in cards) {
            val obj = JSONObject().apply {
                put("id", c.id)
                put("species", c.species)
                put("name", c.name)
                put("race", c.race.name)
                put("element", c.element.name)
                put("tier", c.tier.name)
                put("level", c.level)
                put("baseHp", c.baseHp.toDouble())
                put("baseAtk", c.baseAtk.toDouble())
                put("attackSpeed", c.attackSpeed.toDouble())
                put("moveSpeed", c.moveSpeed.toDouble())
                put("range", c.range.toDouble())
                put("manaCost", c.manaCost)
                put("cooldownSec", c.cooldownSec.toDouble())
                put("lore", c.lore)
            }
            arr.put(obj)
        }
        return arr.toString()
    }

    private fun deserializeCards(json: String): List<BeastCard> {
        val list = mutableListOf<BeastCard>()
        try {
            val arr = JSONArray(json)
            for (i in 0 until arr.length()) {
                val obj = arr.getJSONObject(i)
                list.add(
                    BeastCard(
                        id = obj.getString("id"),
                        species = obj.getString("species"),
                        name = obj.getString("name"),
                        race = BeastRace.valueOf(obj.getString("race")),
                        element = ElementType.valueOf(obj.getString("element")),
                        tier = BeastTier.valueOf(obj.getString("tier")),
                        level = obj.optInt("level", 1),
                        baseHp = obj.getDouble("baseHp").toFloat(),
                        baseAtk = obj.getDouble("baseAtk").toFloat(),
                        attackSpeed = obj.optDouble("attackSpeed", 1.0).toFloat(),
                        moveSpeed = obj.optDouble("moveSpeed", 60.0).toFloat(),
                        range = obj.optDouble("range", 35.0).toFloat(),
                        manaCost = obj.optInt("manaCost", 20),
                        cooldownSec = obj.optDouble("cooldownSec", 4.0).toFloat(),
                        lore = obj.optString("lore", "")
                    )
                )
            }
        } catch (e: Exception) {
            return BeastCatalog.getStarterUnlocked()
        }
        return if (list.isNotEmpty()) list else BeastCatalog.getStarterUnlocked()
    }

    private fun serializeDeck(deck: List<String>): String {
        return JSONArray(deck).toString()
    }

    private fun deserializeDeck(json: String): List<String> {
        val list = mutableListOf<String>()
        try {
            val arr = JSONArray(json)
            for (i in 0 until arr.length()) {
                list.add(arr.getString(i))
            }
        } catch (e: Exception) {
            return BeastCatalog.getStarterDeck().map { it.id }
        }
        return if (list.isNotEmpty()) list else BeastCatalog.getStarterDeck().map { it.id }
    }
}
