package com.example.beastforge.ui.screens

import androidx.activity.compose.BackHandler
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.beastforge.audio.SoundManager
import com.example.beastforge.model.BeastCard
import com.example.beastforge.model.BeastRace
import com.example.beastforge.model.PlayerProfile
import com.example.beastforge.ui.components.BeastCardItem
import com.example.beastforge.ui.components.CurrencyBar
import com.example.beastforge.ui.theme.*

@Composable
fun RosterScreen(
    profile: PlayerProfile,
    onUpdateDeck: (List<String>) -> Unit,
    onBack: () -> Unit,
    onToggleSound: () -> Unit,
    soundManager: SoundManager? = null
) {
    BackHandler { onBack() }

    var selectedBeast by remember { mutableStateOf(profile.unlockedCards.firstOrNull()) }
    var selectedRaceFilter by remember { mutableStateOf<BeastRace?>(null) }

    val equippedCards = remember(profile.deckCardIds, profile.unlockedCards) {
        val map = profile.unlockedCards.associateBy { it.id }
        profile.deckCardIds.mapNotNull { map[it] }
    }

    val filteredCards = remember(profile.unlockedCards, selectedRaceFilter) {
        if (selectedRaceFilter == null) profile.unlockedCards
        else profile.unlockedCards.filter { it.race == selectedRaceFilter }
    }

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
                    .testTag("roster_back_button")
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

        // Active Deck (4 Slots)
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 4.dp),
            color = SurfaceDark,
            shape = RoundedCornerShape(12.dp),
            border = androidx.compose.foundation.BorderStroke(1.dp, PrimaryAmber.copy(alpha = 0.5f))
        ) {
            Column(modifier = Modifier.padding(10.dp)) {
                Text(
                    text = "ACTIVE BATTLE DECK (MAX 4):",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Black,
                    color = BrightGold
                )
                Spacer(Modifier.height(6.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    for (i in 0 until 4) {
                        val card = equippedCards.getOrNull(i)
                        if (card != null) {
                            BeastCardItem(
                                card = card,
                                isSelected = selectedBeast?.id == card.id,
                                onClick = {
                                    selectedBeast = card
                                    soundManager?.play("select")
                                },
                                showEquippedTag = true
                            )
                        } else {
                            Surface(
                                modifier = Modifier
                                    .width(135.dp)
                                    .height(175.dp),
                                shape = RoundedCornerShape(12.dp),
                                color = SurfaceDarkVariant.copy(alpha = 0.4f),
                                border = androidx.compose.foundation.BorderStroke(1.dp, Color.Gray.copy(alpha = 0.3f))
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Text(
                                        text = "+ Slot ${i + 1}\nEmpty",
                                        fontSize = 11.sp,
                                        color = Color.Gray
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }

        // Filter Tabs & Equip Button
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                FilterTab(
                    label = "ALL",
                    isSelected = selectedRaceFilter == null,
                    onClick = { selectedRaceFilter = null }
                )
                FilterTab(
                    label = "BIPED",
                    isSelected = selectedRaceFilter == BeastRace.BIPED,
                    onClick = { selectedRaceFilter = BeastRace.BIPED }
                )
                FilterTab(
                    label = "QUAD",
                    isSelected = selectedRaceFilter == BeastRace.QUADRUPED,
                    onClick = { selectedRaceFilter = BeastRace.QUADRUPED }
                )
                FilterTab(
                    label = "DRAGON",
                    isSelected = selectedRaceFilter == BeastRace.DRAGON,
                    onClick = { selectedRaceFilter = BeastRace.DRAGON }
                )
            }

            // Equip / Unequip Button for Selected Beast
            if (selectedBeast != null) {
                val isEquipped = profile.deckCardIds.contains(selectedBeast!!.id)
                Button(
                    onClick = {
                        val currentList = profile.deckCardIds.toMutableList()
                        if (isEquipped) {
                            if (currentList.size > 1) {
                                currentList.remove(selectedBeast!!.id)
                                onUpdateDeck(currentList)
                                soundManager?.play("button")
                            }
                        } else {
                            if (currentList.size < 4) {
                                currentList.add(selectedBeast!!.id)
                            } else {
                                currentList[0] = selectedBeast!!.id
                            }
                            onUpdateDeck(currentList)
                            soundManager?.play("select")
                        }
                    },
                    modifier = Modifier
                        .height(34.dp)
                        .testTag("equip_toggle_button"),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (isEquipped) Color(0xFFC62828) else Color(0xFF2E7D32)
                    ),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text(
                        text = if (isEquipped) "REMOVE FROM DECK" else "EQUIP TO DECK",
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }

        // Collection Roster Row
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
                .padding(horizontal = 16.dp, vertical = 4.dp),
            color = Color.Transparent
        ) {
            LazyRow(
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                contentPadding = PaddingValues(vertical = 4.dp)
            ) {
                items(filteredCards) { card ->
                    val isEquipped = profile.deckCardIds.contains(card.id)
                    BeastCardItem(
                        card = card,
                        isSelected = card.id == selectedBeast?.id,
                        onClick = {
                            selectedBeast = card
                            soundManager?.play("select")
                        },
                        showEquippedTag = isEquipped
                    )
                }
            }
        }
    }
}

@Composable
fun FilterTab(
    label: String,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    Surface(
        shape = RoundedCornerShape(8.dp),
        color = if (isSelected) PrimaryAmber else SurfaceDarkVariant,
        modifier = Modifier
            .clickable { onClick() }
            .testTag("filter_tab_$label"),
        border = androidx.compose.foundation.BorderStroke(1.dp, if (isSelected) BrightGold else Color.Gray.copy(alpha = 0.3f))
    ) {
        Text(
            text = label,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            color = if (isSelected) Color.Black else Color.White,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp)
        )
    }
}
