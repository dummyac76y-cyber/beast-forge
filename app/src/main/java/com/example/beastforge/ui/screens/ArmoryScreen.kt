package com.example.beastforge.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.beastforge.audio.SoundManager
import com.example.beastforge.model.BeastCard
import com.example.beastforge.model.PlayerProfile
import com.example.beastforge.ui.components.BeastCardItem
import com.example.beastforge.ui.components.CurrencyBar
import com.example.beastforge.ui.theme.*

@Composable
fun ArmoryScreen(
    profile: PlayerProfile,
    onUpgradeFort: () -> Boolean,
    onUpgradeMineral: () -> Boolean,
    onUpgradeTurret: () -> Boolean,
    onSummonPack: (useCrystals: Boolean) -> BeastCard?,
    onBack: () -> Unit,
    onToggleSound: () -> Unit,
    soundManager: SoundManager? = null
) {
    BackHandler { onBack() }

    var summonedBeast by remember { mutableStateOf<BeastCard?>(null) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(DarkBackground)
    ) {
        // Top Bar
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(
                onClick = onBack,
                modifier = Modifier
                    .size(36.dp)
                    .clip(CircleShape)
                    .background(SurfaceDarkVariant)
                    .testTag("armory_back_button")
            ) {
                Icon(
                    imageVector = Icons.Default.ArrowBack,
                    contentDescription = "Back",
                    tint = Color.White
                )
            }
            CurrencyBar(
                coins = profile.coins,
                crystals = profile.crystals,
                soundEnabled = profile.soundEnabled,
                onToggleSound = onToggleSound,
                modifier = Modifier.weight(1f)
            )
        }

        // Armory Main Content: 2 Columns
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
                .padding(horizontal = 16.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Left Column: Citadel Infrastructure Upgrades
            Column(
                modifier = Modifier
                    .weight(1.1f)
                    .fillMaxHeight()
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Text(
                    text = "CITADEL DEFENSE UPGRADES",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Black,
                    color = BrightGold
                )

                // 1. Fort Wall
                val fortCost = profile.fortLevel * 250
                UpgradeCard(
                    title = "Citadel Wall & Parapets",
                    level = profile.fortLevel,
                    statLabel = "Max HP: ${profile.fortMaxHp.toInt()} (+250)",
                    cost = fortCost,
                    canAfford = profile.coins >= fortCost,
                    icon = Icons.Default.Castle,
                    color = Color(0xFF00E676),
                    onUpgrade = {
                        if (onUpgradeFort()) soundManager?.play("coin")
                    },
                    testTag = "upgrade_fort_button"
                )

                // 2. Turret / Ballista
                val turretCost = profile.turretLevel * 220
                UpgradeCard(
                    title = "Arcane Ballista Turret",
                    level = profile.turretLevel,
                    statLabel = "ATK: ${profile.turretAtk.toInt()} (+15) • Cooldown: ${String.format("%.1fs", profile.turretCooldown)}",
                    cost = turretCost,
                    canAfford = profile.coins >= turretCost,
                    icon = Icons.Default.FlashOn,
                    color = LightningYellow,
                    onUpgrade = {
                        if (onUpgradeTurret()) soundManager?.play("coin")
                    },
                    testTag = "upgrade_turret_button"
                )

                // 3. Mineral Mine
                val mineCost = profile.mineralLevel * 200
                UpgradeCard(
                    title = "Mana Well Extractor",
                    level = profile.mineralLevel,
                    statLabel = "Regen: +${String.format("%.1f", profile.manaRegenRate)}/s • Cap: ${profile.maxMana.toInt()}",
                    cost = mineCost,
                    canAfford = profile.coins >= mineCost,
                    icon = Icons.Default.Opacity,
                    color = IceBlue,
                    onUpgrade = {
                        if (onUpgradeMineral()) soundManager?.play("coin")
                    },
                    testTag = "upgrade_mineral_button"
                )
            }

            // Right Column: Beast Card Summons & Packs
            Column(
                modifier = Modifier
                    .weight(0.9f)
                    .fillMaxHeight(),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Text(
                    text = "BEAST CONVOCATION (SUMMON)",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Black,
                    color = BrightGold
                )

                // Silver Beast Pack (Coins)
                SummonPackCard(
                    title = "Silver Beast Pack",
                    subtitle = "Draws Feral, Armored, or Epic Beasts",
                    costText = "400 Coins",
                    icon = Icons.Default.Pets,
                    brush = Brush.horizontalGradient(listOf(Color(0xFF455A64), Color(0xFF607D8B))),
                    canAfford = profile.coins >= 400,
                    onSummon = {
                        val card = onSummonPack(false)
                        if (card != null) {
                            summonedBeast = card
                            soundManager?.play("coin")
                        }
                    },
                    testTag = "summon_silver_pack"
                )

                // Golden Wyrm Pack (Crystals)
                SummonPackCard(
                    title = "Golden Wyrm Pack",
                    subtitle = "Guaranteed Armored, Epic, or Legendary Dragons!",
                    costText = "35 Crystals",
                    icon = Icons.Default.AutoAwesome,
                    brush = Brush.horizontalGradient(listOf(Color(0xFFE65100), Color(0xFFFFB300))),
                    canAfford = profile.crystals >= 35,
                    onSummon = {
                        val card = onSummonPack(true)
                        if (card != null) {
                            summonedBeast = card
                            soundManager?.play("evolve")
                        }
                    },
                    testTag = "summon_golden_pack"
                )
            }
        }

        // Summon Result Dialog Overlay
        AnimatedVisibility(
            visible = summonedBeast != null,
            enter = fadeIn(),
            exit = fadeOut()
        ) {
            summonedBeast?.let { card ->
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color.Black.copy(alpha = 0.8f))
                        .clickable { summonedBeast = null },
                    contentAlignment = Alignment.Center
                ) {
                    Surface(
                        modifier = Modifier
                            .width(320.dp)
                            .clip(RoundedCornerShape(16.dp))
                            .border(2.dp, BrightGold, RoundedCornerShape(16.dp))
                            .testTag("summon_result_dialog"),
                        color = SurfaceDark
                    ) {
                        Column(
                            modifier = Modifier.padding(16.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Text(
                                text = "BEAST SUMMONED!",
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Black,
                                color = BrightGold
                            )

                            BeastCardItem(
                                card = card,
                                isSelected = true,
                                onClick = {}
                            )

                            Text(
                                text = "${card.name} has joined your fortress dominion!",
                                fontSize = 11.sp,
                                color = Color.LightGray,
                                textAlign = TextAlign.Center
                            )

                            Button(
                                onClick = { summonedBeast = null },
                                colors = ButtonDefaults.buttonColors(containerColor = PrimaryAmber),
                                shape = RoundedCornerShape(8.dp),
                                modifier = Modifier.testTag("dismiss_summon_button")
                            ) {
                                Text("AWESOME!", fontWeight = FontWeight.Black, color = Color.Black)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun UpgradeCard(
    title: String,
    level: Int,
    statLabel: String,
    cost: Int,
    canAfford: Boolean,
    icon: ImageVector,
    color: Color,
    onUpgrade: () -> Unit,
    testTag: String
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = SurfaceDarkVariant,
        shape = RoundedCornerShape(10.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, color.copy(alpha = 0.3f))
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .clip(CircleShape)
                        .background(color.copy(alpha = 0.2f)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(imageVector = icon, contentDescription = title, tint = color, modifier = Modifier.size(20.dp))
                }
                Spacer(Modifier.width(10.dp))
                Column {
                    Text(text = "$title Lv.$level", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color.White)
                    Text(text = statLabel, fontSize = 10.sp, color = Color.LightGray)
                }
            }

            Button(
                onClick = onUpgrade,
                enabled = canAfford,
                colors = ButtonDefaults.buttonColors(
                    containerColor = color,
                    disabledContainerColor = Color(0xFF37474F)
                ),
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier
                    .height(34.dp)
                    .testTag(testTag)
            ) {
                Text(text = "$cost G", fontSize = 10.sp, fontWeight = FontWeight.Black, color = Color.Black)
            }
        }
    }
}

@Composable
fun SummonPackCard(
    title: String,
    subtitle: String,
    costText: String,
    icon: ImageVector,
    brush: Brush,
    canAfford: Boolean,
    onSummon: () -> Unit,
    testTag: String
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .border(1.dp, BrightGold.copy(alpha = 0.4f), RoundedCornerShape(12.dp)),
        color = Color.Transparent
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(brush)
                .padding(14.dp)
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(imageVector = icon, contentDescription = title, tint = Color.White, modifier = Modifier.size(24.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(text = title, fontSize = 13.sp, fontWeight = FontWeight.Black, color = Color.White)
                }

                Text(text = subtitle, fontSize = 10.sp, color = Color.White.copy(alpha = 0.9f))

                Button(
                    onClick = onSummon,
                    enabled = canAfford,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color.Black.copy(alpha = 0.6f),
                        disabledContainerColor = Color.Black.copy(alpha = 0.3f)
                    ),
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(36.dp)
                        .testTag(testTag)
                ) {
                    Text(text = "SUMMON ($costText)", fontSize = 11.sp, fontWeight = FontWeight.Black, color = BrightGold)
                }
            }
        }
    }
}
