package com.example.beastforge.ui.theme

import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val DarkGold = Color(0xFFFFB300)
val BrightGold = Color(0xFFFFD54F)
val FireRed = Color(0xFFFF3D00)
val IceBlue = Color(0xFF00B0FF)
val LightningYellow = Color(0xFFFFEA00)
val EarthGreen = Color(0xFF4CAF50)
val PoisonPurple = Color(0xFF9C27B0)
val WindCyan = Color(0xFF00E5FF)

val DarkBackground = Color(0xFF0C0A10)
val SurfaceDark = Color(0xFF16131F)
val SurfaceDarkVariant = Color(0xFF221C30)
val PrimaryAmber = Color(0xFFFF9800)
val SecondaryRed = Color(0xFFE64A19)
val TertiaryBlue = Color(0xFF0288D1)

private val BeastDarkColorScheme = darkColorScheme(
    primary = PrimaryAmber,
    onPrimary = Color.Black,
    primaryContainer = Color(0xFF5D3A00),
    onPrimaryContainer = BrightGold,
    secondary = SecondaryRed,
    onSecondary = Color.White,
    background = DarkBackground,
    surface = SurfaceDark,
    surfaceVariant = SurfaceDarkVariant,
    onBackground = Color(0xFFEDE7F6),
    onSurface = Color(0xFFEDE7F6)
)

@Composable
fun BeastForgeTheme(
    content: @Composable () -> Unit
) {
    androidx.compose.material3.MaterialTheme(
        colorScheme = BeastDarkColorScheme,
        content = content
    )
}
