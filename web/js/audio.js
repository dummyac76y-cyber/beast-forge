// Web Audio cue synth.
//
// The Android SoundManager loads 19 clips from assets/mfx/*.ogg, but that
// directory does not exist in the project -- every load throws and is
// swallowed, so the app runs silent. Rather than reproduce that, the web port
// synthesises equivalent cues. Same call signature as SoundManager.play(key).
'use strict';

if (typeof require !== 'undefined' && typeof module !== 'undefined') {
  var M = require('./models.js');
}

// key -> [waveform, baseFreq, freqSweep, durationSec, peakGain]
const CUES = {
  select:        ['triangle', 520, 780, 0.10, 0.16],
  button:        ['sine',     420, 560, 0.08, 0.14],
  coin:          ['square',   880, 1320, 0.12, 0.10],
  evolve:        ['sawtooth', 300, 900, 0.45, 0.14],
  fire:          ['sawtooth', 300, 120, 0.16, 0.10],
  ice:           ['triangle', 900, 1500, 0.16, 0.09],
  light:         ['square',   1200, 700, 0.10, 0.09],
  wind:          ['sine',     700, 400, 0.18, 0.08],
  earth:         ['sawtooth', 150, 70,  0.22, 0.12],
  poison:        ['sine',     260, 180, 0.24, 0.10],
  biped_die:     ['sawtooth', 240, 90,  0.24, 0.11],
  quad_die:      ['sawtooth', 200, 75,  0.26, 0.11],
  dragon_die:    ['sawtooth', 160, 55,  0.40, 0.13],
  fire_explode:  ['sawtooth', 420, 60,  0.42, 0.16],
  fort_ruin:     ['sawtooth', 110, 40,  0.60, 0.16],
  stage_start:   ['sine',     440, 660, 0.26, 0.12],
  victory:       ['sine',     523, 1046, 0.55, 0.14],
  defeat:        ['sine',     330, 165, 0.60, 0.13]
};

class AudioMan {
  constructor(assets) {
    this.ctx = null;
    this.enabled = true;
    this.lastPlay = {};       // per-key throttle
    this.assets = assets || (typeof globalThis !== 'undefined' ? globalThis.__beastForgeAssets : null);
  }

  // Browsers require a user gesture before audio starts.
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (AC) this.ctx = new AC();
  }

  /** Play a decoded sample from the manifest, if one was supplied. */
  _playSample(clip, volume) {
    if (!this.ctx || !clip || !clip.buffer) return false;
    try {
      const src = this.ctx.createBufferSource();
      const gain = this.ctx.createGain();
      src.buffer = clip.buffer;
      const v = (volume === undefined ? 0.8 : volume) * (clip.volume !== undefined ? clip.volume : 0.8);
      gain.gain.value = v;
      src.connect(gain); gain.connect(this.ctx.destination);
      src.start();
      return true;
    } catch (e) {
      return false;   // fall through to synthesis
    }
  }

  play(key, volume) {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    if (this.lastPlay[key] && now - this.lastPlay[key] < 0.035) return;  // avoid machine-gunning
    this.lastPlay[key] = now;

    // Real sample wins when the manifest provided one; otherwise synthesise.
    let clip = null;
    if (this.assets && typeof this.assets.audioClip === 'function') {
      try { clip = this.assets.audioClip(key); } catch (e) { clip = null; }
    }
    if (clip && this._playSample(clip, volume)) return;

    const cue = CUES[key];
    if (!cue) return;
    const [wave, f0, f1, dur, peak] = cue;
    const vol = (volume === undefined ? 0.8 : volume) * peak;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(f0, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), now + dur);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(vol, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(gain); gain.connect(this.ctx.destination);
    osc.start(now); osc.stop(now + dur + 0.02);
  }
}

if (typeof module !== 'undefined') {
  module.exports = { AudioMan, CUES };
}