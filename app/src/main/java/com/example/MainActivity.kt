package com.example

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.Surface
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import com.example.beastforge.audio.SoundManager
import com.example.beastforge.data.GameRepository
import com.example.beastforge.model.PlayerProfile
import com.example.beastforge.ui.screens.*
import com.example.beastforge.ui.theme.BeastForgeTheme
import com.example.beastforge.ui.theme.DarkBackground

enum class Screen {
    MAIN_MENU,
    BATTLE_CAMPAIGN,
    BATTLE_ARENA,
    FORGE,
    ROSTER,
    ARMORY
}

class MainActivity : ComponentActivity() {

    private lateinit var soundManager: SoundManager
    private lateinit var repository: GameRepository

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        soundManager = SoundManager(this)
        repository = GameRepository(this)

        setContent {
            BeastForgeTheme {
                val profile by repository.profile.collectAsState()
                var currentScreen by remember { mutableStateOf(Screen.MAIN_MENU) }

                // Sync sound enabled state
                LaunchedEffect(profile.soundEnabled) {
                    soundManager.isEnabled = profile.soundEnabled
                }

                Surface(
                    modifier = Modifier
                        .fillMaxSize()
                        .safeDrawingPadding(),
                    color = DarkBackground
                ) {
                    when (currentScreen) {
                        Screen.MAIN_MENU -> {
                            MainMenuScreen(
                                profile = profile,
                                onNavigateToCampaign = { currentScreen = Screen.BATTLE_CAMPAIGN },
                                onNavigateToArena = { currentScreen = Screen.BATTLE_ARENA },
                                onNavigateToForge = { currentScreen = Screen.FORGE },
                                onNavigateToRoster = { currentScreen = Screen.ROSTER },
                                onNavigateToArmory = { currentScreen = Screen.ARMORY },
                                onToggleSound = { repository.toggleSound() }
                            )
                        }

                        Screen.BATTLE_CAMPAIGN -> {
                            BattleScreen(
                                stageNumber = profile.currentStage,
                                profile = profile,
                                isArenaMode = false,
                                soundManager = soundManager,
                                onBattleEnd = { won, coins, crystals, advance ->
                                    if (won) {
                                        repository.addRewards(coins, crystals, advance)
                                    }
                                    currentScreen = Screen.MAIN_MENU
                                },
                                onExitToMenu = { currentScreen = Screen.MAIN_MENU }
                            )
                        }

                        Screen.BATTLE_ARENA -> {
                            BattleScreen(
                                stageNumber = 1,
                                profile = profile,
                                isArenaMode = true,
                                soundManager = soundManager,
                                onBattleEnd = { won, coins, crystals, _ ->
                                    if (won) {
                                        repository.addRewards(coins, crystals, false)
                                    }
                                    currentScreen = Screen.MAIN_MENU
                                },
                                onExitToMenu = { currentScreen = Screen.MAIN_MENU }
                            )
                        }

                        Screen.FORGE -> {
                            ForgeScreen(
                                profile = profile,
                                onEvolveCard = { cardId -> repository.evolveBeast(cardId) },
                                onLevelUpCard = { cardId -> repository.levelUpBeast(cardId) },
                                onBack = { currentScreen = Screen.MAIN_MENU },
                                onToggleSound = { repository.toggleSound() },
                                soundManager = soundManager
                            )
                        }

                        Screen.ROSTER -> {
                            RosterScreen(
                                profile = profile,
                                onUpdateDeck = { newDeck -> repository.setDeck(newDeck) },
                                onBack = { currentScreen = Screen.MAIN_MENU },
                                onToggleSound = { repository.toggleSound() },
                                soundManager = soundManager
                            )
                        }

                        Screen.ARMORY -> {
                            ArmoryScreen(
                                profile = profile,
                                onUpgradeFort = { repository.upgradeFort() },
                                onUpgradeMineral = { repository.upgradeMineral() },
                                onUpgradeTurret = { repository.upgradeTurret() },
                                onSummonPack = { useCrystals -> repository.summonBeastPack(useCrystals) },
                                onBack = { currentScreen = Screen.MAIN_MENU },
                                onToggleSound = { repository.toggleSound() },
                                soundManager = soundManager
                            )
                        }
                    }
                }
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        soundManager.release()
    }
}
