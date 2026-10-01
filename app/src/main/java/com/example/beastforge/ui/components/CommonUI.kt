package com.example.beastforge.ui.components

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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.beastforge.model.BeastCard
import com.example.beastforge.model.BeastRace
import com.example.beastforge.ui.theme.*

@Composable
fun CurrencyBar(
    coins: Int,
    crystals: Int,
    soundEnabled: Boolean,
    onToggleSound: () -> Unit,
    modifier: Modifier = Modifier,
    stageNumber: Int? = null
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Stage progress badge if present
        if (stageNumber != null) {
            Surface(
                shape = RoundedCornerShape(8.dp),
                color = SurfaceDarkVariant,
                border = androidx.compose.foundation.BorderStroke(1.dp, PrimaryAmber.copy(alpha = 0.5f))
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Default.Shield,
                        contentDescription = "Stage",
                        tint = PrimaryAmber,
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(Modifier.width(4.dp))
                    Text(
                        text = "STAGE $stageNumber",
                        fontWeight = FontWeight.Bold,
                        fontSize = 12.sp,
                        color = BrightGold
                    )
                }
            }
        } else {
            Spacer(Modifier.width(10.dp))
        }

        // Coins & Crystals
        Row(
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Gold Coins
            Surface(
                shape = RoundedCornerShape(16.dp),
                color = Color(0xFF1E1B18),
                border = androidx.compose.foundation.BorderStroke(1.dp, BrightGold.copy(alpha = 0.6f))
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .size(18.dp)
                            .clip(CircleShape)
                            .background(Brush.radialGradient(listOf(Color(0xFFFFEA00), Color(0xFFFF8F00)))),
                        contentAlignment = Alignment.Center
                    ) {
                        Text("G", fontSize = 11.sp, fontWeight = FontWeight.Black, color = Color(0xFF3E2723))
                    }
                    Spacer(Modifier.width(6.dp))
                    Text(
                        text = "$coins",
                        fontWeight = FontWeight.Bold,
                        fontSize = 13.sp,
                        color = BrightGold
                    )
                }
            }

            // Crystals
            Surface(
                shape = RoundedCornerShape(16.dp),
                color = Color(0xFF151B24),
                border = androidx.compose.foundation.BorderStroke(1.dp, IceBlue.copy(alpha = 0.6f))
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .size(18.dp)
                            .clip(CircleShape)
                            .background(Brush.radialGradient(listOf(Color(0xFF80D8FF), Color(0xFF0091EA)))),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.Diamond,
                            contentDescription = "Crystal",
                            tint = Color.White,
                            modifier = Modifier.size(13.dp)
                        )
                    }
                    Spacer(Modifier.width(6.dp))
                    Text(
                        text = "$crystals",
                        fontWeight = FontWeight.Bold,
                        fontSize = 13.sp,
                        color = Color(0xFF80D8FF)
                    )
                }
            }

            // Audio Toggle Button
            IconButton(
                onClick = onToggleSound,
                modifier = Modifier
                    .size(34.dp)
                    .clip(CircleShape)
                    .background(SurfaceDarkVariant)
                    .testTag("sound_toggle_button")
            ) {
                Icon(
                    imageVector = if (soundEnabled) Icons.Default.VolumeUp else Icons.Default.VolumeOff,
                    contentDescription = "Toggle Audio",
                    tint = if (soundEnabled) PrimaryAmber else Color.Gray,
                    modifier = Modifier.size(18.dp)
                )
            }
        }
    }
}

@Composable
fun BeastCardItem(
    card: BeastCard,
    isSelected: Boolean = false,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    showEquippedTag: Boolean = false
) {
    val tierBorder = card.tier.color
    val raceIcon = when (card.race) {
        BeastRace.BIPED -> Icons.Default.DirectionsRun
        BeastRace.QUADRUPED -> Icons.Default.Pets
        BeastRace.DRAGON -> Icons.Default.Air
    }

    Surface(
        modifier = modifier
            .width(135.dp)
            .height(175.dp)
            .clip(RoundedCornerShape(12.dp))
            .border(
                width = if (isSelected) 3.dp else 1.5.dp,
                color = if (isSelected) BrightGold else tierBorder.copy(alpha = 0.7f),
                shape = RoundedCornerShape(12.dp)
            )
            .clickable { onClick() }
            .testTag("beast_card_${card.id}"),
        color = SurfaceDarkVariant
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(6.dp),
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            // Header: Mana Cost & Element badge
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Mana Orb
                Box(
                    modifier = Modifier
                        .size(24.dp)
                        .clip(CircleShape)
                        .background(Brush.radialGradient(listOf(Color(0xFF80D8FF), Color(0xFF0091EA)))),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        "${card.manaCost}",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Black,
                        color = Color.White
                    )
                }

                // Element badge
                Surface(
                    shape = RoundedCornerShape(6.dp),
                    color = card.element.color.copy(alpha = 0.25f),
                    border = androidx.compose.foundation.BorderStroke(1.dp, card.element.color.copy(alpha = 0.8f))
                ) {
                    Text(
                        text = card.element.displayName.uppercase(),
                        fontSize = 9.sp,
                        fontWeight = FontWeight.Bold,
                        color = card.element.color,
                        modifier = Modifier.padding(horizontal = 4.dp, vertical = 1.dp)
                    )
                }
            }

            // Center: Beast Avatar / Icon Plate
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(65.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(
                        Brush.radialGradient(
                            listOf(
                                card.element.color.copy(alpha = 0.35f),
                                Color(0xFF100E17)
                            )
                        )
                    ),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = raceIcon,
                    contentDescription = card.species,
                    tint = card.element.color,
                    modifier = Modifier.size(38.dp)
                )

                // Tier badge at top right of frame
                Surface(
                    shape = RoundedCornerShape(4.dp),
                    color = card.tier.color,
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .padding(3.dp)
                ) {
                    Text(
                        text = card.tier.displayName,
                        fontSize = 8.sp,
                        fontWeight = FontWeight.Black,
                        color = Color.Black,
                        modifier = Modifier.padding(horizontal = 3.dp, vertical = 1.dp)
                    )
                }
            }

            // Name & Level
            Column {
                Text(
                    text = card.name,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                    maxLines = 1
                )
                Text(
                    text = "Lv.${card.level} • ${card.race.displayName}",
                    fontSize = 9.sp,
                    color = Color.LightGray
                )
            }

            // Stats: HP & ATK
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFF0F0D15), RoundedCornerShape(4.dp))
                    .padding(horizontal = 4.dp, vertical = 2.dp),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Default.Favorite,
                        contentDescription = "HP",
                        tint = Color(0xFF00E676),
                        modifier = Modifier.size(10.dp)
                    )
                    Spacer(Modifier.width(2.dp))
                    Text("${card.hp.toInt()}", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Color(0xFF00E676))
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Default.FlashOn,
                        contentDescription = "ATK",
                        tint = FireRed,
                        modifier = Modifier.size(10.dp)
                    )
                    Spacer(Modifier.width(2.dp))
                    Text("${card.atk.toInt()}", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = FireRed)
                }
            }

            if (showEquippedTag) {
                Surface(
                    shape = RoundedCornerShape(4.dp),
                    color = PrimaryAmber,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = "EQUIPPED",
                        fontSize = 8.sp,
                        fontWeight = FontWeight.Black,
                        color = Color.Black,
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                        modifier = Modifier.padding(vertical = 1.dp)
                    )
                }
            }
        }
    }
}
