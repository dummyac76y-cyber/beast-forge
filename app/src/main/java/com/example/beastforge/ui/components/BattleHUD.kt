package com.example.beastforge.ui.components

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.beastforge.game.BattleEngine
import com.example.beastforge.model.BeastCard
import com.example.beastforge.ui.theme.*

@Composable
fun BattleTopBar(
    engine: BattleEngine,
    onTogglePause: () -> Unit,
    onToggleSpeed: () -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 6.dp),
        color = Color(0xCC0E0C14),
        shape = RoundedCornerShape(12.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, Color.White.copy(alpha = 0.15f))
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            // Player Fort HP
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.weight(1f)
            ) {
                Icon(
                    imageVector = Icons.Default.Shield,
                    contentDescription = "Player Fort",
                    tint = Color(0xFF00E676),
                    modifier = Modifier.size(20.dp)
                )
                Spacer(Modifier.width(6.dp))
                Column {
                    val pPct = (engine.playerFort.currentHp / engine.playerFort.maxHp).coerceIn(0f, 1f)
                    LinearProgressIndicator(
                        progress = { pPct },
                        modifier = Modifier
                            .width(130.dp)
                            .height(8.dp)
                            .clip(RoundedCornerShape(4.dp)),
                        color = Color(0xFF00E676),
                        trackColor = Color.Black.copy(alpha = 0.6f)
                    )
                    Text(
                        text = "${engine.playerFort.currentHp.toInt()} / ${engine.playerFort.maxHp.toInt()}",
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF00E676)
                    )
                }
            }

            // Center: Stage or Arena Info
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.padding(horizontal = 8.dp)
            ) {
                Text(
                    text = if (engine.isArenaMode) "ARENA WAVE ${engine.arenaWave}" else engine.stageConfig.name.uppercase(),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Black,
                    color = BrightGold,
                    textAlign = TextAlign.Center
                )
                if (engine.isArenaMode) {
                    Text(
                        text = "Score: ${engine.arenaScore}",
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.LightGray
                    )
                } else {
                    Text(
                        text = "STAGE ${engine.stageConfig.stageNumber}",
                        fontSize = 10.sp,
                        color = Color.LightGray
                    )
                }
            }

            // Controls & Enemy Fort HP
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.End,
                modifier = Modifier.weight(1f)
            ) {
                Column(horizontalAlignment = Alignment.End) {
                    val ePct = (engine.enemyFort.currentHp / engine.enemyFort.maxHp).coerceIn(0f, 1f)
                    LinearProgressIndicator(
                        progress = { ePct },
                        modifier = Modifier
                            .width(130.dp)
                            .height(8.dp)
                            .clip(RoundedCornerShape(4.dp)),
                        color = Color(0xFFFF1744),
                        trackColor = Color.Black.copy(alpha = 0.6f)
                    )
                    Text(
                        text = "${engine.enemyFort.currentHp.toInt()} / ${engine.enemyFort.maxHp.toInt()}",
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFFFF1744)
                    )
                }
                Spacer(Modifier.width(6.dp))
                Icon(
                    imageVector = Icons.Default.Warning,
                    contentDescription = "Enemy Fort",
                    tint = Color(0xFFFF1744),
                    modifier = Modifier.size(20.dp)
                )

                Spacer(Modifier.width(12.dp))

                // Speed 1x / 2x Toggle
                Button(
                    onClick = onToggleSpeed,
                    modifier = Modifier
                        .height(28.dp)
                        .testTag("speed_toggle_button"),
                    contentPadding = PaddingValues(horizontal = 8.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = SurfaceDarkVariant)
                ) {
                    Text(
                        text = "${engine.gameSpeed.toInt()}X",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = BrightGold
                    )
                }

                Spacer(Modifier.width(6.dp))

                // Pause Button
                IconButton(
                    onClick = onTogglePause,
                    modifier = Modifier
                        .size(28.dp)
                        .clip(CircleShape)
                        .background(SurfaceDarkVariant)
                        .testTag("pause_button")
                ) {
                    Icon(
                        imageVector = if (engine.isPaused) Icons.Default.PlayArrow else Icons.Default.Pause,
                        contentDescription = "Pause",
                        tint = Color.White,
                        modifier = Modifier.size(16.dp)
                    )
                }
            }
        }
    }
}

@Composable
fun BattleBottomDeck(
    engine: BattleEngine,
    deckCards: List<BeastCard>,
    selectedCard: BeastCard?,
    onSelectCard: (BeastCard) -> Unit,
    onTriggerCatapult: () -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 8.dp, vertical = 4.dp),
        color = Color(0xDD120F1A),
        shape = RoundedCornerShape(16.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, PrimaryAmber.copy(alpha = 0.4f))
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            // Mana Crystal Orb
            val manaPct = (engine.mana / engine.maxMana).coerceIn(0f, 1f)
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.padding(start = 4.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(54.dp)
                        .clip(CircleShape)
                        .background(Color(0xFF0A192F))
                        .border(2.dp, IceBlue, CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    // Liquid Mana fill
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .fillMaxHeight(manaPct)
                            .align(Alignment.BottomCenter)
                            .background(
                                Brush.verticalGradient(
                                    listOf(Color(0xFF80D8FF), Color(0xFF0288D1))
                                )
                            )
                    )
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            text = "${engine.mana.toInt()}",
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Black,
                            color = Color.White
                        )
                        Text(
                            text = "/${engine.maxMana.toInt()}",
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFFB3E5FC)
                        )
                    }
                }
            }

            // 4 Equipped Battle Cards
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                for (card in deckCards) {
                    val cooldown = engine.cardCooldowns[card.id] ?: 0f
                    val isOnCooldown = cooldown > 0f
                    val hasEnoughMana = engine.mana >= card.manaCost
                    val isSelected = selectedCard?.id == card.id

                    BattleDeckCardButton(
                        card = card,
                        cooldownRemaining = cooldown,
                        isOnCooldown = isOnCooldown,
                        hasEnoughMana = hasEnoughMana,
                        isSelected = isSelected,
                        onClick = { onSelectCard(card) }
                    )
                }
            }

            // Catapult Superweapon Button
            val isCatapultReady = engine.catapultCooldownTimer <= 0f
            Box(
                modifier = Modifier
                    .size(56.dp)
                    .clip(CircleShape)
                    .background(
                        if (isCatapultReady) Brush.radialGradient(listOf(Color(0xFFFF7043), Color(0xFFD84315)))
                        else Brush.radialGradient(listOf(Color(0xFF424242), Color(0xFF212121)))
                    )
                    .border(
                        width = 2.dp,
                        color = if (isCatapultReady) BrightGold else Color.Gray,
                        shape = CircleShape
                    )
                    .clickable(enabled = isCatapultReady) { onTriggerCatapult() }
                    .testTag("catapult_superweapon_button"),
                contentAlignment = Alignment.Center
            ) {
                if (isCatapultReady) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            imageVector = Icons.Default.Whatshot,
                            contentDescription = "Catapult Strike",
                            tint = BrightGold,
                            modifier = Modifier.size(24.dp)
                        )
                        Text(
                            text = "BLAST",
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Black,
                            color = Color.White
                        )
                    }
                } else {
                    Text(
                        text = "${engine.catapultCooldownTimer.toInt()}s",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.LightGray
                    )
                }
            }
        }
    }
}

@Composable
fun BattleDeckCardButton(
    card: BeastCard,
    cooldownRemaining: Float,
    isOnCooldown: Boolean,
    hasEnoughMana: Boolean,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    val alpha = if (hasEnoughMana && !isOnCooldown) 1f else 0.5f

    Surface(
        modifier = Modifier
            .width(82.dp)
            .height(64.dp)
            .clip(RoundedCornerShape(10.dp))
            .border(
                width = if (isSelected) 2.5.dp else 1.dp,
                color = if (isSelected) BrightGold else card.element.color.copy(alpha = alpha),
                shape = RoundedCornerShape(10.dp)
            )
            .clickable(enabled = !isOnCooldown) { onClick() }
            .testTag("deck_card_button_${card.id}"),
        color = SurfaceDarkVariant.copy(alpha = alpha)
    ) {
        Box(modifier = Modifier.fillMaxSize()) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(4.dp),
                verticalArrangement = Arrangement.SpaceBetween
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Mana Cost
                    Box(
                        modifier = Modifier
                            .size(16.dp)
                            .clip(CircleShape)
                            .background(if (hasEnoughMana) IceBlue else Color.Red),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "${card.manaCost}",
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Black,
                            color = Color.White
                        )
                    }

                    // Element Tag
                    Text(
                        text = card.element.displayName.take(3).uppercase(),
                        fontSize = 8.sp,
                        fontWeight = FontWeight.Bold,
                        color = card.element.color
                    )
                }

                // Name & Race
                Text(
                    text = card.species,
                    fontSize = 9.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                    maxLines = 1
                )

                // Stats preview
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text("⚔${card.atk.toInt()}", fontSize = 8.sp, color = FireRed, fontWeight = FontWeight.Bold)
                    Text("♥${card.hp.toInt()}", fontSize = 8.sp, color = Color(0xFF00E676), fontWeight = FontWeight.Bold)
                }
            }

            // Cooldown Overlay
            if (isOnCooldown) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color.Black.copy(alpha = 0.7f)),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = String.format("%.1fs", cooldownRemaining),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Black,
                        color = BrightGold
                    )
                }
            }

            // Selected Indicator
            if (isSelected) {
                Box(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .size(8.dp)
                        .clip(CircleShape)
                        .background(BrightGold)
                )
            }
        }
    }
}
