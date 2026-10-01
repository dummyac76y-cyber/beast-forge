package com.example.beastforge.ui.screens

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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.beastforge.model.PlayerProfile
import com.example.beastforge.ui.components.CurrencyBar
import com.example.beastforge.ui.theme.*

@Composable
fun MainMenuScreen(
    profile: PlayerProfile,
    onNavigateToCampaign: () -> Unit,
    onNavigateToArena: () -> Unit,
    onNavigateToForge: () -> Unit,
    onNavigateToRoster: () -> Unit,
    onNavigateToArmory: () -> Unit,
    onToggleSound: () -> Unit
) {
    val infiniteTransition = rememberInfiniteTransition(label = "pulse")
    val glowAlpha by infiniteTransition.animateFloat(
        initialValue = 0.4f,
        targetValue = 0.9f,
        animationSpec = infiniteRepeatable(
            animation = tween(1800, easing = EaseInOutCubic),
            repeatMode = RepeatMode.Reverse
        ),
        label = "glow"
    )

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.radialGradient(
                    colors = listOf(
                        Color(0xFF261226),
                        Color(0xFF140D1F),
                        Color(0xFF08060C)
                    )
                )
            )
    ) {
        Column(
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            // Top Bar
            CurrencyBar(
                coins = profile.coins,
                crystals = profile.crystals,
                soundEnabled = profile.soundEnabled,
                onToggleSound = onToggleSound,
                stageNumber = profile.currentStage
            )

            // Center: Title Banner & Play Options
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .padding(horizontal = 24.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                // Left Column: Game Title & Lore
                Column(
                    modifier = Modifier.weight(1.1f),
                    verticalArrangement = Arrangement.Center
                ) {
                    // Beast Crest Icon
                    Box(
                        modifier = Modifier
                            .size(60.dp)
                            .clip(CircleShape)
                            .background(Brush.radialGradient(listOf(FireRed, PrimaryAmber)))
                            .border(2.dp, BrightGold, CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.Shield,
                            contentDescription = "Beast Forge Crest",
                            tint = Color.White,
                            modifier = Modifier.size(34.dp)
                        )
                    }

                    Spacer(Modifier.height(8.dp))

                    Text(
                        text = "BEAST FORGE",
                        fontSize = 32.sp,
                        fontWeight = FontWeight.Black,
                        color = BrightGold,
                        letterSpacing = 2.sp
                    )

                    Text(
                        text = "FORT CONQUER DOMINION",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold,
                        color = PrimaryAmber.copy(alpha = glowAlpha),
                        letterSpacing = 3.sp
                    )

                    Spacer(Modifier.height(8.dp))

                    Text(
                        text = "Breed monstrous hybrid beasts, master elemental forces, and defend your fortress against unrelenting waves.",
                        fontSize = 11.sp,
                        color = Color.LightGray,
                        lineHeight = 15.sp,
                        modifier = Modifier.padding(end = 16.dp)
                    )

                    Spacer(Modifier.height(14.dp))

                    // Player Stats Badges
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        StatBadge(
                            title = "Citadel",
                            value = "Lv.${profile.fortLevel}",
                            icon = Icons.Default.Castle,
                            color = Color(0xFF00E676)
                        )
                        StatBadge(
                            title = "Arena Best",
                            value = "Wave ${profile.highestArenaWave}",
                            icon = Icons.Default.EmojiEvents,
                            color = BrightGold
                        )
                        StatBadge(
                            title = "Beasts",
                            value = "${profile.unlockedCards.size}",
                            icon = Icons.Default.Pets,
                            color = IceBlue
                        )
                    }
                }

                // Right Column: Navigation Action Cards
                Column(
                    modifier = Modifier
                        .weight(0.9f)
                        .padding(start = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    // Campaign Button (Primary Action)
                    MainMenuButton(
                        title = "CONQUER STAGES",
                        subtitle = "Stage ${profile.currentStage} Defense",
                        icon = Icons.Default.SportsKabaddi,
                        brush = Brush.horizontalGradient(listOf(FireRed, Color(0xFFFF9800))),
                        onClick = onNavigateToCampaign,
                        testTag = "play_campaign_button"
                    )

                    // Arena Mode Button
                    MainMenuButton(
                        title = "TITAN ARENA",
                        subtitle = "Endless Monster Rush",
                        icon = Icons.Default.LocalFireDepartment,
                        brush = Brush.horizontalGradient(listOf(Color(0xFF7B1FA2), Color(0xFFE91E63))),
                        onClick = onNavigateToArena,
                        testTag = "play_arena_button"
                    )

                    // Forge & Evolution Button
                    MainMenuButton(
                        title = "BEAST FORGE",
                        subtitle = "Evolve & Mutate Cards",
                        icon = Icons.Default.AutoFixHigh,
                        brush = Brush.horizontalGradient(listOf(Color(0xFF00897B), Color(0xFF00ACC1))),
                        onClick = onNavigateToForge,
                        testTag = "beast_forge_button"
                    )

                    // Quick Action Row: Roster & Armory
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Button(
                            onClick = onNavigateToRoster,
                            modifier = Modifier
                                .weight(1f)
                                .height(44.dp)
                                .testTag("roster_button"),
                            colors = ButtonDefaults.buttonColors(containerColor = SurfaceDarkVariant),
                            shape = RoundedCornerShape(10.dp),
                            border = androidx.compose.foundation.BorderStroke(1.dp, PrimaryAmber.copy(alpha = 0.5f))
                        ) {
                            Icon(Icons.Default.Dashboard, contentDescription = "Deck", modifier = Modifier.size(16.dp), tint = PrimaryAmber)
                            Spacer(Modifier.width(6.dp))
                            Text("DECK", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = BrightGold)
                        }

                        Button(
                            onClick = onNavigateToArmory,
                            modifier = Modifier
                                .weight(1f)
                                .height(44.dp)
                                .testTag("armory_button"),
                            colors = ButtonDefaults.buttonColors(containerColor = SurfaceDarkVariant),
                            shape = RoundedCornerShape(10.dp),
                            border = androidx.compose.foundation.BorderStroke(1.dp, IceBlue.copy(alpha = 0.5f))
                        ) {
                            Icon(Icons.Default.Storefront, contentDescription = "Armory", modifier = Modifier.size(16.dp), tint = IceBlue)
                            Spacer(Modifier.width(6.dp))
                            Text("ARMORY", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color(0xFF80D8FF))
                        }
                    }
                }
            }

            // Bottom Footer
            Surface(
                modifier = Modifier.fillMaxWidth(),
                color = Color.Black.copy(alpha = 0.4f)
            ) {
                Text(
                    text = "Beast Forge Dominion • 5-Lane Tactical Warfare • Elemental Evolution System",
                    fontSize = 10.sp,
                    color = Color.Gray,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(vertical = 4.dp)
                )
            }
        }
    }
}

@Composable
fun MainMenuButton(
    title: String,
    subtitle: String,
    icon: ImageVector,
    brush: Brush,
    onClick: () -> Unit,
    testTag: String
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .height(50.dp)
            .clip(RoundedCornerShape(12.dp))
            .clickable { onClick() }
            .testTag(testTag),
        color = Color.Transparent
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(brush)
                .padding(horizontal = 14.dp, vertical = 6.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxSize(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = icon,
                        contentDescription = title,
                        tint = Color.White,
                        modifier = Modifier.size(24.dp)
                    )
                    Spacer(Modifier.width(12.dp))
                    Column {
                        Text(
                            text = title,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Black,
                            color = Color.White
                        )
                        Text(
                            text = subtitle,
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color.White.copy(alpha = 0.85f)
                        )
                    }
                }
                Icon(
                    imageVector = Icons.Default.ChevronRight,
                    contentDescription = "Navigate",
                    tint = Color.White,
                    modifier = Modifier.size(20.dp)
                )
            }
        }
    }
}

@Composable
fun StatBadge(
    title: String,
    value: String,
    icon: ImageVector,
    color: Color
) {
    Surface(
        shape = RoundedCornerShape(8.dp),
        color = SurfaceDarkVariant,
        border = androidx.compose.foundation.BorderStroke(1.dp, color.copy(alpha = 0.4f))
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(imageVector = icon, contentDescription = title, tint = color, modifier = Modifier.size(14.dp))
            Spacer(Modifier.width(4.dp))
            Column {
                Text(title, fontSize = 8.sp, color = Color.Gray)
                Text(value, fontSize = 10.sp, fontWeight = FontWeight.Bold, color = color)
            }
        }
    }
}
