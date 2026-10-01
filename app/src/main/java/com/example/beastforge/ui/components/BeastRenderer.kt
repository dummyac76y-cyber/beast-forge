package com.example.beastforge.ui.components

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import com.example.beastforge.game.BattleEngine
import com.example.beastforge.model.*
import kotlin.math.sin

object BeastRenderer {

    fun renderBattlefield(
        drawScope: DrawScope,
        engine: BattleEngine,
        width: Float,
        height: Float
    ) {
        val scaleX = width / 1000f
        val scaleY = height / 450f

        with(drawScope) {
            // 1. Draw Battlefield Terrain
            drawBattlefieldBackground(scaleX, scaleY, engine.stageConfig.bgTheme)

            // 2. Draw 5 Lanes
            drawLanes(scaleX, scaleY)

            // 3. Draw Fortresses
            drawPlayerFort(scaleX, scaleY, engine.playerFort)
            drawEnemyFort(scaleX, scaleY, engine.enemyFort)

            // 4. Draw Units
            val allUnits = (engine.playerUnits + engine.enemyUnits).sortedBy { it.laneIndex * 1000 + it.position }
            for (unit in allUnits) {
                drawUnit(unit, scaleX, scaleY, engine.battleTime)
            }

            // 5. Draw Projectiles
            for (p in engine.projectiles) {
                drawProjectile(p, scaleX, scaleY)
            }

            // 6. Draw Particles
            for (particle in engine.particles) {
                val alpha = (particle.life / particle.maxLife).coerceIn(0f, 1f)
                drawCircle(
                    color = particle.color.copy(alpha = alpha),
                    radius = particle.size * scaleX,
                    center = Offset(particle.x * scaleX, particle.y * scaleY)
                )
            }
        }
    }

    private fun DrawScope.drawBattlefieldBackground(scaleX: Float, scaleY: Float, theme: String) {
        // Sky & Terrain Gradients
        val (skyTop, skyBottom, groundTop, groundBottom) = when (theme) {
            "volcano" -> listOf(
                Color(0xFF3E120A),
                Color(0xFF6B1D0E),
                Color(0xFF2A1510),
                Color(0xFF180A06)
            )
            "snow" -> listOf(
                Color(0xFF102A43),
                Color(0xFF243B53),
                Color(0xFFD9E2EC),
                Color(0xFF829AB1)
            )
            "citadel" -> listOf(
                Color(0xFF1B1429),
                Color(0xFF2E1F47),
                Color(0xFF18151F),
                Color(0xFF0F0B14)
            )
            else -> listOf( // "forest"
                Color(0xFF0D1B2A),
                Color(0xFF1B4965),
                Color(0xFF2D6A4F),
                Color(0xFF1B4332)
            )
        }

        // Sky
        drawRect(
            brush = Brush.verticalGradient(
                colors = listOf(skyTop, skyBottom),
                startY = 0f,
                endY = 110f * scaleY
            ),
            topLeft = Offset.Zero,
            size = Size(1000f * scaleX, 110f * scaleY)
        )

        // Distant Mountains / Citadel Silhouette
        val mountainPath = Path().apply {
            moveTo(0f, 110f * scaleY)
            lineTo(120f * scaleX, 60f * scaleY)
            lineTo(260f * scaleX, 90f * scaleY)
            lineTo(450f * scaleX, 40f * scaleY)
            lineTo(620f * scaleX, 85f * scaleY)
            lineTo(820f * scaleX, 50f * scaleY)
            lineTo(1000f * scaleX, 110f * scaleY)
            close()
        }
        drawPath(mountainPath, color = skyTop.copy(alpha = 0.85f))

        // Ground arena
        drawRect(
            brush = Brush.verticalGradient(
                colors = listOf(groundTop, groundBottom),
                startY = 110f * scaleY,
                endY = 450f * scaleY
            ),
            topLeft = Offset(0f, 110f * scaleY),
            size = Size(1000f * scaleX, 340f * scaleY)
        )
    }

    private fun DrawScope.drawLanes(scaleX: Float, scaleY: Float) {
        val laneStart = 110f
        val laneHeight = 55f

        for (i in 0 until 5) {
            val y = (laneStart + i * laneHeight) * scaleY
            val h = laneHeight * scaleY

            // Subtle lane striping
            val laneColor = if (i % 2 == 0) Color.White.copy(alpha = 0.035f) else Color.Black.copy(alpha = 0.05f)
            drawRect(
                color = laneColor,
                topLeft = Offset(80f * scaleX, y),
                size = Size(840f * scaleX, h)
            )

            // Lane Divider
            drawLine(
                color = Color.White.copy(alpha = 0.12f),
                start = Offset(70f * scaleX, y + h),
                end = Offset(930f * scaleX, y + h),
                strokeWidth = 1.5f * scaleY
            )
        }
    }

    private fun DrawScope.drawPlayerFort(scaleX: Float, scaleY: Float, fort: Fortress) {
        val fortWidth = 75f * scaleX
        val fortHeight = 300f * scaleY
        val startY = 100f * scaleY

        // Fortress Wall Base
        drawRoundRect(
            brush = Brush.horizontalGradient(
                colors = listOf(Color(0xFF2C3E50), Color(0xFF4CA1AF)),
                startX = 0f,
                endX = fortWidth
            ),
            topLeft = Offset(5f * scaleX, startY),
            size = Size(fortWidth, fortHeight),
            cornerRadius = androidx.compose.ui.geometry.CornerRadius(10f * scaleX, 10f * scaleY)
        )

        // Battlements Crenellations
        for (i in 0 until 5) {
            val cy = startY + i * 55f * scaleY + 10f * scaleY
            drawRect(
                color = Color(0xFF1ABC9C),
                topLeft = Offset(fortWidth - 10f * scaleX, cy),
                size = Size(15f * scaleX, 30f * scaleY)
            )
        }

        // Ballista / Turret Top
        val turretCenter = Offset(65f * scaleX, startY + 20f * scaleY)
        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(Color(0xFF00E5FF), Color(0xFF0091EA)),
                center = turretCenter,
                radius = 24f * scaleX
            ),
            radius = 22f * scaleX,
            center = turretCenter
        )
        // Energy Core Glow
        drawCircle(
            color = Color.White,
            radius = 8f * scaleX,
            center = turretCenter
        )

        // Health Bar Above Fort
        drawFortHealthBar(
            currentHp = fort.currentHp,
            maxHp = fort.maxHp,
            x = 10f * scaleX,
            y = 75f * scaleY,
            width = 75f * scaleX,
            height = 10f * scaleY,
            barColor = Color(0xFF00E676)
        )
    }

    private fun DrawScope.drawEnemyFort(scaleX: Float, scaleY: Float, fort: Fortress) {
        val startX = 920f * scaleX
        val fortWidth = 75f * scaleX
        val fortHeight = 300f * scaleY
        val startY = 100f * scaleY

        // Dark Bastion Wall Base
        drawRoundRect(
            brush = Brush.horizontalGradient(
                colors = listOf(Color(0xFFB71C1C), Color(0xFF311B92)),
                startX = startX,
                endX = startX + fortWidth
            ),
            topLeft = Offset(startX, startY),
            size = Size(fortWidth, fortHeight),
            cornerRadius = androidx.compose.ui.geometry.CornerRadius(10f * scaleX, 10f * scaleY)
        )

        // Dark Spires
        for (i in 0 until 5) {
            val cy = startY + i * 55f * scaleY + 10f * scaleY
            drawRect(
                color = Color(0xFFFF1744),
                topLeft = Offset(startX - 8f * scaleX, cy),
                size = Size(15f * scaleX, 30f * scaleY)
            )
        }

        // Inferno Cannon Top
        val cannonCenter = Offset(startX + 12f * scaleX, startY + 20f * scaleY)
        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(Color(0xFFFF5722), Color(0xFFBF360C)),
                center = cannonCenter,
                radius = 24f * scaleX
            ),
            radius = 22f * scaleX,
            center = cannonCenter
        )
        // Fiery Core Glow
        drawCircle(
            color = Color(0xFFFFD54F),
            radius = 8f * scaleX,
            center = cannonCenter
        )

        // Health Bar Above Enemy Fort
        drawFortHealthBar(
            currentHp = fort.currentHp,
            maxHp = fort.maxHp,
            x = 915f * scaleX,
            y = 75f * scaleY,
            width = 75f * scaleX,
            height = 10f * scaleY,
            barColor = Color(0xFFFF1744)
        )
    }

    private fun DrawScope.drawFortHealthBar(
        currentHp: Float,
        maxHp: Float,
        x: Float,
        y: Float,
        width: Float,
        height: Float,
        barColor: Color
    ) {
        val pct = (currentHp / maxHp).coerceIn(0f, 1f)
        // Background
        drawRoundRect(
            color = Color.Black.copy(alpha = 0.7f),
            topLeft = Offset(x, y),
            size = Size(width, height),
            cornerRadius = androidx.compose.ui.geometry.CornerRadius(4f, 4f)
        )
        // Fill
        if (pct > 0f) {
            drawRoundRect(
                color = barColor,
                topLeft = Offset(x + 1f, y + 1f),
                size = Size((width - 2f) * pct, height - 2f),
                cornerRadius = androidx.compose.ui.geometry.CornerRadius(3f, 3f)
            )
        }
    }

    private fun DrawScope.drawUnit(unit: BattleUnit, scaleX: Float, scaleY: Float, time: Float) {
        val laneY = (110f + unit.laneIndex * 55f + 27.5f) * scaleY
        val bob = sin(time * 8f + unit.position) * 4f * scaleY
        val cx = unit.position * scaleX
        val cy = laneY + bob

        // Direction: Player faces right (+1), Enemy faces left (-1)
        val dir = if (unit.isPlayer) 1f else -1f
        val bodyColor = unit.element.color
        val tierStroke = when (unit.tier) {
            BeastTier.COMMON -> 1.5f
            BeastTier.RARE -> 2.5f
            BeastTier.EPIC -> 3.5f
            BeastTier.LEGENDARY -> 4.5f
            BeastTier.MYTHIC -> 6f
        } * scaleX

        when (unit.race) {
            BeastRace.BIPED -> drawBipedBeast(cx, cy, dir, scaleX, scaleY, unit, bodyColor, tierStroke)
            BeastRace.QUADRUPED -> drawQuadBeast(cx, cy, dir, scaleX, scaleY, unit, bodyColor, tierStroke)
            BeastRace.DRAGON -> drawDragonBeast(cx, cy, dir, scaleX, scaleY, unit, bodyColor, tierStroke, time)
        }

        // Unit Mini Health Bar
        val hpPct = (unit.currentHp / unit.maxHp).coerceIn(0f, 1f)
        val barW = 34f * scaleX
        val barH = 5f * scaleY
        val barX = cx - barW / 2f
        val barY = cy - 32f * scaleY

        drawRect(
            color = Color.Black.copy(alpha = 0.7f),
            topLeft = Offset(barX, barY),
            size = Size(barW, barH)
        )
        val hpColor = if (unit.isPlayer) Color(0xFF00E676) else Color(0xFFFF1744)
        drawRect(
            color = hpColor,
            topLeft = Offset(barX + 0.5f, barY + 0.5f),
            size = Size(barW * hpPct, barH - 1f)
        )
    }

    private fun DrawScope.drawBipedBeast(
        cx: Float,
        cy: Float,
        dir: Float,
        scaleX: Float,
        scaleY: Float,
        unit: BattleUnit,
        elementColor: Color,
        tierStroke: Float
    ) {
        val size = (if (unit.tier >= BeastTier.EPIC) 22f else 18f) * scaleX

        // Body Torso
        val torsoColor = if (unit.isPlayer) Color(0xFF37474F) else Color(0xFF4A148C)
        drawRoundRect(
            color = torsoColor,
            topLeft = Offset(cx - size * 0.7f, cy - size),
            size = Size(size * 1.4f, size * 1.6f),
            cornerRadius = androidx.compose.ui.geometry.CornerRadius(6f * scaleX, 6f * scaleY)
        )

        // Elemental Chest Plate
        drawCircle(
            color = elementColor,
            radius = size * 0.45f,
            center = Offset(cx, cy - size * 0.2f)
        )

        // Beast Head with Horns/Ears
        val headCenter = Offset(cx + dir * size * 0.5f, cy - size * 1.2f)
        drawCircle(
            color = torsoColor,
            radius = size * 0.6f,
            center = headCenter
        )
        // Glowing Eyes
        drawCircle(
            color = elementColor,
            radius = size * 0.18f,
            center = Offset(headCenter.x + dir * size * 0.25f, headCenter.y - size * 0.05f)
        )

        // Claws / Weapon
        val armPath = Path().apply {
            moveTo(cx, cy - size * 0.5f)
            lineTo(cx + dir * size * 1.3f, cy - size * 0.2f)
            lineTo(cx + dir * size * 1.6f, cy - size * 0.6f)
        }
        drawPath(
            path = armPath,
            color = elementColor,
            style = Stroke(width = tierStroke)
        )
    }

    private fun DrawScope.drawQuadBeast(
        cx: Float,
        cy: Float,
        dir: Float,
        scaleX: Float,
        scaleY: Float,
        unit: BattleUnit,
        elementColor: Color,
        tierStroke: Float
    ) {
        val size = (if (unit.tier >= BeastTier.EPIC) 24f else 19f) * scaleX
        val bodyColor = if (unit.isPlayer) Color(0xFF455A64) else Color(0xFF880E4F)

        // Quadruped Elongated Body
        drawRoundRect(
            color = bodyColor,
            topLeft = Offset(cx - size, cy - size * 0.6f),
            size = Size(size * 2f, size * 1.1f),
            cornerRadius = androidx.compose.ui.geometry.CornerRadius(8f * scaleX, 8f * scaleY)
        )

        // Fangs / Predatory Head
        val headX = cx + dir * size * 1.1f
        val headY = cy - size * 0.4f
        drawCircle(
            color = bodyColor,
            radius = size * 0.55f,
            center = Offset(headX, headY)
        )
        // Glowing Eye
        drawCircle(
            color = elementColor,
            radius = size * 0.2f,
            center = Offset(headX + dir * size * 0.2f, headY - size * 0.1f)
        )

        // 4 Prowling Legs
        val legStroke = Stroke(width = tierStroke.coerceAtLeast(3f))
        for (i in listOf(-0.6f, -0.2f, 0.4f, 0.8f)) {
            val lx = cx + i * size
            drawLine(
                color = elementColor,
                start = Offset(lx, cy + size * 0.3f),
                end = Offset(lx + dir * 6f * scaleX, cy + size * 0.9f),
                strokeWidth = legStroke.width
            )
        }

        // Elemental Spine Spikes
        for (j in -2..2) {
            drawCircle(
                color = elementColor,
                radius = 3f * scaleX,
                center = Offset(cx + j * 7f * scaleX, cy - size * 0.7f)
            )
        }
    }

    private fun DrawScope.drawDragonBeast(
        cx: Float,
        cy: Float,
        dir: Float,
        scaleX: Float,
        scaleY: Float,
        unit: BattleUnit,
        elementColor: Color,
        tierStroke: Float,
        time: Float
    ) {
        val size = 26f * scaleX
        val dragonColor = if (unit.isPlayer) Color(0xFF1E3A8A) else Color(0xFF4C0519)

        // Wing Flapping Sine
        val wingFlap = sin(time * 12f) * 15f * scaleY

        // Majestic Dragon Wings
        val wingPath = Path().apply {
            moveTo(cx - dir * 10f * scaleX, cy - size * 0.5f)
            lineTo(cx - dir * 30f * scaleX, cy - size * 1.5f + wingFlap)
            lineTo(cx + dir * 10f * scaleX, cy - size * 1.2f + wingFlap)
            close()
        }
        drawPath(
            path = wingPath,
            brush = Brush.verticalGradient(
                colors = listOf(elementColor, elementColor.copy(alpha = 0.5f)),
                startY = cy - size * 1.5f,
                endY = cy
            )
        )

        // Serpentine Torso
        drawOval(
            color = dragonColor,
            topLeft = Offset(cx - size * 0.9f, cy - size * 0.6f),
            size = Size(size * 1.8f, size * 1.1f)
        )

        // Dragon Head & Horns
        val headX = cx + dir * size * 1.2f
        val headY = cy - size * 0.8f
        drawCircle(
            color = dragonColor,
            radius = size * 0.5f,
            center = Offset(headX, headY)
        )
        // Horns
        drawLine(
            color = elementColor,
            start = Offset(headX, headY - size * 0.2f),
            end = Offset(headX - dir * 14f * scaleX, headY - size * 0.8f),
            strokeWidth = 3f * scaleX
        )
        // Glowing Eye
        drawCircle(
            color = elementColor,
            radius = size * 0.22f,
            center = Offset(headX + dir * size * 0.2f, headY - size * 0.05f)
        )

        // Breath / Fireball at snout
        drawCircle(
            color = elementColor.copy(alpha = 0.8f),
            radius = size * 0.25f,
            center = Offset(headX + dir * size * 0.55f, headY + size * 0.1f)
        )
    }

    private fun DrawScope.drawProjectile(p: Projectile, scaleX: Float, scaleY: Float) {
        val px = p.currentX * scaleX
        val py = p.currentY * scaleY
        val radius = (if (p.isTurret) 10f else 6f) * scaleX

        // Glowing Projectile Core
        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(Color.White, p.element.color, p.element.color.copy(alpha = 0f)),
                center = Offset(px, py),
                radius = radius * 2f
            ),
            radius = radius * 2f,
            center = Offset(px, py)
        )
        drawCircle(
            color = Color.White,
            radius = radius * 0.6f,
            center = Offset(px, py)
        )
    }
}
