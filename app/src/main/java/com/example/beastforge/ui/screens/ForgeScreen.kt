package com.example.beastforge.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
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
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.beastforge.audio.SoundManager
import com.example.beastforge.model.BeastCard
import com.example.beastforge.model.BeastTier
import com.example.beastforge.model.PlayerProfile
import com.example.beastforge.ui.components.BeastCardItem
import com.example.beastforge.ui.components.CurrencyBar
import com.example.beastforge.ui.theme.*

@Composable
fun ForgeScreen(
    profile: PlayerProfile,
    onEvolveCard: (String) -> Boolean,
    onLevelUpCard: (String) -> Boolean,
    onBack: () -> Unit,
    onToggleSound: () -> Unit,
    soundManager: SoundManager? = null
) {
    BackHandler { onBack() }

    var selectedCardId by remember(profile.unlockedCards) {
        mutableStateOf(profile.unlockedCards.firstOrNull()?.id ?: "")
    }

    val selectedCard = profile.unlockedCards.find { it.id == selectedCardId }
        ?: profile.unlockedCards.firstOrNull()

    val nextTierPreview = selectedCard?.let { card ->
        if (card.tier < BeastTier.MYTHIC) card.evolve() else null
    }

    val crystalCost = when (selectedCard?.tier) {
        BeastTier.COMMON -> 20
        BeastTier.RARE -> 45
        BeastTier.EPIC -> 90
        BeastTier.LEGENDARY -> 150
        else -> 0
    }
    val coinCost = when (selectedCard?.tier) {
        BeastTier.COMMON -> 300
        BeastTier.RARE -> 700
        BeastTier.EPIC -> 1500
        BeastTier.LEGENDARY -> 3000
        else -> 0
    }
    val levelUpCost = (selectedCard?.level ?: 1) * 180

    val canEvolve = selectedCard != null &&
            selectedCard.tier < BeastTier.MYTHIC &&
            profile.crystals >= crystalCost &&
            profile.coins >= coinCost

    val canLevelUp = selectedCard != null && profile.coins >= levelUpCost

    val infiniteTransition = rememberInfiniteTransition(label = "forge_glow")
    val forgeGlow by infiniteTransition.animateFloat(
        initialValue = 0.5f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(1200, easing = EaseInOutSine),
            repeatMode = RepeatMode.Reverse
        ),
        label = "forge_pulse"
    )

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
                    .testTag("forge_back_button")
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

        // Center Forge Crucible & Evolution Altar
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
                .padding(horizontal = 16.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Left: Current Beast Card
            if (selectedCard != null) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.weight(1f)
                ) {
                    Text(
                        text = "CURRENT FORM",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.LightGray
                    )
                    Spacer(Modifier.height(6.dp))
                    BeastCardItem(
                        card = selectedCard,
                        isSelected = true,
                        onClick = {}
                    )

                    Spacer(Modifier.height(8.dp))

                    // Level Up Button
                    Button(
                        onClick = {
                            if (onLevelUpCard(selectedCard.id)) {
                                soundManager?.play("coin")
                            }
                        },
                        enabled = canLevelUp,
                        modifier = Modifier
                            .height(36.dp)
                            .testTag("level_up_button"),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2E7D32)),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text(
                            text = "TRAIN LV.${selectedCard.level + 1} ($levelUpCost G)",
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }

            // Center: Mutation Crucible / Altar Arrow
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
                modifier = Modifier.weight(1.2f)
            ) {
                Box(
                    modifier = Modifier
                        .size(70.dp)
                        .clip(CircleShape)
                        .background(
                            Brush.radialGradient(
                                listOf(
                                    FireRed.copy(alpha = forgeGlow),
                                    Color(0xFF3E120A)
                                )
                            )
                        )
                        .border(2.dp, BrightGold, CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.AutoFixHigh,
                        contentDescription = "Mutate",
                        tint = BrightGold,
                        modifier = Modifier.size(36.dp)
                    )
                }

                Spacer(Modifier.height(10.dp))

                Text(
                    text = "ELEMENTAL FUSION",
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Black,
                    color = BrightGold
                )

                Text(
                    text = if (selectedCard?.tier == BeastTier.MYTHIC) "MAX TIER REACHED"
                    else "Combine essence to unlock next tier",
                    fontSize = 10.sp,
                    color = Color.Gray,
                    textAlign = TextAlign.Center
                )

                Spacer(Modifier.height(12.dp))

                // Evolve Button
                Button(
                    onClick = {
                        selectedCard?.let { card ->
                            if (onEvolveCard(card.id)) {
                                soundManager?.play("evolve")
                            }
                        }
                    },
                    enabled = canEvolve,
                    modifier = Modifier
                        .height(44.dp)
                        .fillMaxWidth(0.9f)
                        .testTag("evolve_button"),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = FireRed,
                        disabledContainerColor = Color(0xFF37474F)
                    ),
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text(
                            text = "EVOLVE",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Black,
                            color = Color.White
                        )
                        if (selectedCard != null && selectedCard.tier < BeastTier.MYTHIC) {
                            Text(
                                text = "($coinCost G + $crystalCost 💎)",
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                color = BrightGold
                            )
                        }
                    }
                }
            }

            // Right: Evolved Mutation Preview
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.weight(1f)
            ) {
                Text(
                    text = "MUTATED SPECIMEN",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    color = BrightGold
                )
                Spacer(Modifier.height(6.dp))

                if (nextTierPreview != null) {
                    BeastCardItem(
                        card = nextTierPreview,
                        isSelected = false,
                        onClick = {}
                    )
                    Spacer(Modifier.height(6.dp))
                    Text(
                        text = "+35% HP • +40% ATK",
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF00E676)
                    )
                } else {
                    Surface(
                        modifier = Modifier
                            .width(135.dp)
                            .height(175.dp),
                        shape = RoundedCornerShape(12.dp),
                        color = SurfaceDarkVariant.copy(alpha = 0.5f),
                        border = androidx.compose.foundation.BorderStroke(1.dp, Color.Gray.copy(alpha = 0.3f))
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Text(
                                text = "Apex Tier\nMax Evolution",
                                fontSize = 11.sp,
                                color = Color.Gray,
                                textAlign = TextAlign.Center
                            )
                        }
                    }
                }
            }
        }

        // Bottom: Owned Beasts Carousel to Select for Forge
        Surface(
            modifier = Modifier.fillMaxWidth(),
            color = SurfaceDark,
            border = androidx.compose.foundation.BorderStroke(1.dp, Color.White.copy(alpha = 0.1f))
        ) {
            Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)) {
                Text(
                    text = "SELECT BEAST FOR MUTATION FORGE:",
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.LightGray
                )
                Spacer(Modifier.height(4.dp))
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    contentPadding = PaddingValues(vertical = 4.dp)
                ) {
                    items(profile.unlockedCards) { card ->
                        BeastCardItem(
                            card = card,
                            isSelected = card.id == selectedCardId,
                            onClick = {
                                selectedCardId = card.id
                                soundManager?.play("select")
                            }
                        )
                    }
                }
            }
        }
    }
}
