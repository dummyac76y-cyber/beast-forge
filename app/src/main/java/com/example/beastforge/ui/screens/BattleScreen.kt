package com.example.beastforge.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.beastforge.audio.SoundManager
import com.example.beastforge.data.BeastCatalog
import com.example.beastforge.game.BattleEngine
import com.example.beastforge.model.BeastCard
import com.example.beastforge.model.PlayerProfile
import com.example.beastforge.model.StageConfig
import com.example.beastforge.ui.components.BattleBottomDeck
import com.example.beastforge.ui.components.BattleTopBar
import com.example.beastforge.ui.components.BeastRenderer
import com.example.beastforge.ui.theme.*
import kotlinx.coroutines.isActive

@Composable
fun BattleScreen(
    stageNumber: Int,
    profile: PlayerProfile,
    isArenaMode: Boolean = false,
    soundManager: SoundManager? = null,
    onBattleEnd: (won: Boolean, coins: Int, crystals: Int, advance: Boolean) -> Unit,
    onExitToMenu: () -> Unit
) {
    val stageConfig = remember(stageNumber, isArenaMode) {
        if (isArenaMode) {
            StageConfig(
                stageNumber = 1,
                name = "Endless Titan Arena",
                description = "Endure relentless waves of monstrosities.",
                bgTheme = "arena",
                enemyFortHp = 3000f,
                enemySpawns = BeastCatalog.generateArenaSpawns(1),
                rewardCoins = 0,
                rewardCrystals = 0
            )
        } else {
            BeastCatalog.getStage(stageNumber)
        }
    }

    val engine = remember {
        BattleEngine(
            stageConfig = stageConfig,
            playerProfile = profile,
            soundManager = soundManager,
            isArenaMode = isArenaMode
        )
    }

    val deckCards = remember(profile) {
        val owned = profile.unlockedCards.associateBy { it.id }
        profile.deckCardIds.mapNotNull { owned[it] }.ifEmpty {
            BeastCatalog.getStarterDeck()
        }
    }

    var selectedCard by remember { mutableStateOf<BeastCard?>(deckCards.firstOrNull()) }
    var tickCount by remember { mutableLongStateOf(0L) }
    var rewardsClaimed by remember { mutableStateOf(false) }

    // Game Loop
    LaunchedEffect(engine.isPaused, engine.isGameOver) {
        var lastTimeNanos = System.nanoTime()
        while (isActive && !engine.isGameOver) {
            withFrameNanos { nowNanos ->
                val dt = (nowNanos - lastTimeNanos) / 1_000_000_000f
                lastTimeNanos = nowNanos
                if (!engine.isPaused) {
                    engine.update(dt)
                    tickCount++
                }
            }
        }
        // Force refresh for game over
        tickCount++
    }

    BackHandler {
        onExitToMenu()
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(DarkBackground)
    ) {
        // 1. Battlefield Canvas
        BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
            val canvasW = constraints.maxWidth.toFloat()
            val canvasH = constraints.maxHeight.toFloat()

            Canvas(
                modifier = Modifier
                    .fillMaxSize()
                    .pointerInput(selectedCard, engine.mana) {
                        detectTapGestures { offset ->
                            val laneHeight = canvasH * (55f / 450f)
                            val laneStart = canvasH * (110f / 450f)
                            val clickedLane = ((offset.y - laneStart) / laneHeight).toInt()
                            if (clickedLane in 0..4) {
                                selectedCard?.let { card ->
                                    val success = engine.summonUnit(card, clickedLane)
                                    if (success) {
                                        tickCount++
                                    }
                                }
                            }
                        }
                    }
                    .testTag("battlefield_canvas")
            ) {
                // Read tickCount to trigger redraw
                if (tickCount >= 0) {
                    BeastRenderer.renderBattlefield(this, engine, canvasW, canvasH)
                }
            }

            // Lane Touch Guide Indicator if Card is Selected
            val laneH = canvasH * (55f / 450f)
            val laneTop = canvasH * (110f / 450f)
            for (lane in 0..4) {
                val y = laneTop + lane * laneH
                Box(
                    modifier = Modifier
                        .offset(x = 10.dp, y = (y / (canvasH / 450f)).dp)
                        .height((laneH / (canvasH / 450f)).dp)
                        .width(40.dp)
                        .clickable {
                            selectedCard?.let { card ->
                                if (engine.summonUnit(card, lane)) tickCount++
                            }
                        }
                        .testTag("lane_target_$lane"),
                    contentAlignment = Alignment.Center
                ) {
                    Surface(
                        shape = CircleShape,
                        color = (selectedCard?.element?.color ?: PrimaryAmber).copy(alpha = 0.25f),
                        border = androidx.compose.foundation.BorderStroke(1.dp, (selectedCard?.element?.color ?: PrimaryAmber).copy(alpha = 0.5f))
                    ) {
                        Text(
                            text = "L${lane + 1}",
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color.White,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                        )
                    }
                }
            }

            // Floating Combat Damage Numbers Overlay
            for (t in engine.floatingTexts) {
                val scaleX = canvasW / 1000f
                val scaleY = canvasH / 450f
                val lifePct = (t.life / t.maxLife).coerceIn(0f, 1f)
                val alpha = lifePct
                val yOffset = (1f - lifePct) * 20f

                Text(
                    text = t.text,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Black,
                    color = t.color.copy(alpha = alpha),
                    modifier = Modifier.offset(
                        x = (t.x * scaleX / (canvasW / 1000f) * 0.95f).dp,
                        y = ((t.y - yOffset) * scaleY / (canvasH / 450f) * 0.95f).dp
                    )
                )
            }
        }

        // 2. Top HUD
        BattleTopBar(
            engine = engine,
            onTogglePause = {
                engine.isPaused = !engine.isPaused
                tickCount++
            },
            onToggleSpeed = {
                engine.gameSpeed = if (engine.gameSpeed == 1.0f) 2.0f else 1.0f
                tickCount++
            },
            modifier = Modifier.align(Alignment.TopCenter)
        )

        // 3. Bottom Deck & Summon Bar
        BattleBottomDeck(
            engine = engine,
            deckCards = deckCards,
            selectedCard = selectedCard,
            onSelectCard = { card ->
                selectedCard = card
                tickCount++
            },
            onTriggerCatapult = {
                if (engine.triggerCatapultSuperweapon()) {
                    tickCount++
                }
            },
            modifier = Modifier.align(Alignment.BottomCenter)
        )

        // 4. Victory / Defeat Dialogs
        AnimatedVisibility(
            visible = engine.isGameOver,
            enter = fadeIn(),
            exit = fadeOut(),
            modifier = Modifier.align(Alignment.Center)
        ) {
            val isWon = engine.isVictory
            val rewardCoins = if (isArenaMode) engine.arenaScore / 2 else stageConfig.rewardCoins
            val rewardCrystals = if (isArenaMode) engine.arenaWave * 4 else stageConfig.rewardCrystals

            Surface(
                modifier = Modifier
                    .width(360.dp)
                    .clip(RoundedCornerShape(20.dp))
                    .border(
                        2.dp,
                        if (isWon) BrightGold else Color(0xFFFF1744),
                        RoundedCornerShape(20.dp)
                    )
                    .testTag("game_result_dialog"),
                color = SurfaceDark
            ) {
                Column(
                    modifier = Modifier.padding(20.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    // Header Trophy / Skull
                    Box(
                        modifier = Modifier
                            .size(60.dp)
                            .clip(CircleShape)
                            .background(
                                if (isWon) Brush.radialGradient(listOf(Color(0xFFFFEA00), Color(0xFFFF8F00)))
                                else Brush.radialGradient(listOf(Color(0xFFFF5252), Color(0xFFB71C1C)))
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = if (isWon) Icons.Default.EmojiEvents else Icons.Default.Dangerous,
                            contentDescription = if (isWon) "Victory" else "Defeat",
                            tint = Color.White,
                            modifier = Modifier.size(34.dp)
                        )
                    }

                    Text(
                        text = if (isWon) "VICTORY CONQUERED!" else "CITADEL FALLEN!",
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Black,
                        color = if (isWon) BrightGold else Color(0xFFFF5252),
                        letterSpacing = 1.sp
                    )

                    Text(
                        text = if (isWon) {
                            if (isArenaMode) "You survived ${engine.arenaWave} relentless waves!"
                            else "Stage ${stageConfig.stageNumber} successfully liberated!"
                        } else {
                            "The monster horde overwhelmed your defenses. Strengthen your beasts and fort!"
                        },
                        fontSize = 12.sp,
                        color = Color.LightGray,
                        textAlign = TextAlign.Center
                    )

                    // Rewards display
                    if (isWon) {
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(16.dp),
                            modifier = Modifier
                                .background(Color(0xFF0F0D15), RoundedCornerShape(10.dp))
                                .padding(horizontal = 16.dp, vertical = 8.dp)
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text("+$rewardCoins ", fontWeight = FontWeight.Bold, color = BrightGold)
                                Text("Coins", fontSize = 11.sp, color = Color.Gray)
                            }
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text("+$rewardCrystals ", fontWeight = FontWeight.Bold, color = IceBlue)
                                Text("Crystals", fontSize = 11.sp, color = Color.Gray)
                            }
                        }
                    }

                    // Action Buttons
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        OutlinedButton(
                            onClick = {
                                if (isWon && !rewardsClaimed) {
                                    rewardsClaimed = true
                                    onBattleEnd(true, rewardCoins, rewardCrystals, !isArenaMode)
                                } else {
                                    onExitToMenu()
                                }
                            },
                            modifier = Modifier
                                .weight(1f)
                                .testTag("exit_to_menu_button"),
                            shape = RoundedCornerShape(10.dp)
                        ) {
                            Text("MENU", fontWeight = FontWeight.Bold, color = Color.White)
                        }

                        Button(
                            onClick = {
                                if (isWon && !rewardsClaimed) {
                                    rewardsClaimed = true
                                    onBattleEnd(true, rewardCoins, rewardCrystals, !isArenaMode)
                                } else {
                                    // Retry
                                    onBattleEnd(false, 0, 0, false)
                                }
                            },
                            modifier = Modifier
                                .weight(1f)
                                .testTag("next_stage_button"),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = if (isWon) FireRed else PrimaryAmber
                            ),
                            shape = RoundedCornerShape(10.dp)
                        ) {
                            Text(
                                text = if (isWon) "CLAIM" else "RETRY",
                                fontWeight = FontWeight.Black,
                                color = Color.White
                            )
                        }
                    }
                }
            }
        }
    }
}
