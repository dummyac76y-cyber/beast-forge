package com.example.beastforge.audio

import android.content.Context
import android.media.AudioAttributes
import android.media.SoundPool
import android.util.Log

class SoundManager(private val context: Context) {
    private var soundPool: SoundPool? = null
    private val soundMap = mutableMapOf<String, Int>()
    var isEnabled: Boolean = true

    init {
        try {
            val audioAttributes = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_GAME)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()

            soundPool = SoundPool.Builder()
                .setMaxStreams(8)
                .setAudioAttributes(audioAttributes)
                .build()

            loadSound("button", "mfx/3button.ogg")
            loadSound("select", "mfx/3selected.ogg")
            loadSound("evolve", "mfx/2evolve.ogg")
            loadSound("coin", "mfx/6coin.ogg")
            loadSound("fort_ruin", "mfx/4fort_ruin.ogg")
            loadSound("fire_explode", "mfx/8fire_explode.ogg")
            loadSound("stage_start", "mfx/sound_stage_start.ogg")
            loadSound("victory", "mfx/sound_pass_3.2.ogg")
            loadSound("defeat", "mfx/sound_fail_3.3.ogg")
            loadSound("fire", "mfx/1-2fire.ogg")
            loadSound("ice", "mfx/1-4ice.ogg")
            loadSound("light", "mfx/1-3light.ogg")
            loadSound("wind", "mfx/1-1wind.ogg")
            loadSound("earth", "mfx/1-5earth.ogg")
            loadSound("poison", "mfx/1-6poison.ogg")
            loadSound("biped_die", "mfx/9-1biped_die.ogg")
            loadSound("quad_die", "mfx/9-2quad_die.ogg")
            loadSound("dragon_die", "mfx/9-3dragon_die.ogg")
        } catch (e: Exception) {
            Log.e("SoundManager", "Error initializing sound pool", e)
        }
    }

    private fun loadSound(key: String, assetPath: String) {
        try {
            val afd = context.assets.openFd(assetPath)
            val soundId = soundPool?.load(afd, 1) ?: -1
            if (soundId != -1) {
                soundMap[key] = soundId
            }
        } catch (e: Exception) {
            // Log quietly and ignore if asset cannot be opened
            Log.d("SoundManager", "Could not load sound $assetPath: ${e.message}")
        }
    }

    fun play(key: String, volume: Float = 0.8f) {
        if (!isEnabled) return
        val soundId = soundMap[key] ?: return
        try {
            soundPool?.play(soundId, volume, volume, 1, 0, 1.0f)
        } catch (e: Exception) {
            Log.d("SoundManager", "Failed to play sound: $key")
        }
    }

    fun release() {
        soundPool?.release()
        soundPool = null
    }
}
