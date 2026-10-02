"""Kokoro (primary) and Piper (fallback) text-to-speech adapters.

Both produce a plain WAV the game can consume; the engine choice never
requires a game code change, because the studio's contract is simply
"file arrives at a path". `ai-studio voice --engine kokoro|piper|auto`
implements the switch.

Kokoro: small (~82M params) neural TTS, CPU friendly but its pip package pulls
misaki[en] -> torch, so it is the heavier of the two.
Piper: tiny ONNX voices (~60MB), very fast on CPU. Chosen automatically as the
fallback when Kokoro is missing.
"""
from __future__ import annotations

import json
import shutil
import struct
import subprocess
import sys
import wave
from pathlib import Path

from bf_studio import path_for


class TTSUnavailable(RuntimeError):
    pass


# --------------------------------------------------------------------------
def write_wav(dest: Path, samples, sample_rate: int) -> Path:
    """Write float samples in [-1, 1] as 16-bit mono PCM."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    import array
    buf = array.array("h")
    for s in samples:
        v = int(max(-1.0, min(1.0, float(s))) * 32767)
        buf.append(v)
    with wave.open(str(dest), "wb") as fh:
        fh.setnchannels(1)
        fh.setsampwidth(2)
        fh.setframerate(sample_rate)
        fh.writeframes(buf.tobytes())
    return dest


def wav_duration(path: Path) -> float:
    with wave.open(str(path), "rb") as fh:
        return fh.getnframes() / float(fh.getframerate())


# --------------------------------------------------------------------------
class KokoroAdapter:
    name = "Kokoro"

    def __init__(self, cfg: dict, log=print):
        self.cfg = cfg
        self.log = log
        self.voice = cfg["kokoro"].get("voice", "af_heart")
        self.speed = float(cfg["kokoro"].get("speed", 1.0))
        self.sample_rate = int(cfg["kokoro"].get("sample_rate", 24000))

    def importable(self) -> bool:
        try:
            import importlib.util
            return importlib.util.find_spec("kokoro") is not None
        except Exception:
            return False

    def available(self) -> bool:
        return self.importable()

    def voices(self) -> list[str]:
        """Kokoro's built-in American/English voice names."""
        return [
            "af_heart", "af_bella", "af_nicole", "af_sarah", "af_sky",
            "am_adam", "am_michael", "bf_emma", "bf_isabella", "bm_george", "bm_lewis",
        ]

    def synthesize(self, text: str, dest: Path, voice: str | None = None) -> Path:
        if not self.importable():
            raise TTSUnavailable(
                "kokoro is not importable. Install into the studio venv:\n"
                "  python3 -m venv ~/.local/share/beast-forge-ai/venv\n"
                "  ~/.local/share/beast-forge-ai/venv/bin/pip install 'kokoro>=0.9' "
                "'misaki[en]'")
        voice = voice or self.voice
        self.log(f"  engine: Kokoro  voice={voice}  speed={self.speed}")
        script = (
            "import sys, wave, numpy as np\n"
            "from kokoro import KPipeline\n"
            "text, out_path, voice, speed, sr = sys.argv[1:6]\n"
            # argv is always strings; kokoro needs a real float for `speed`.
            "speed, sr = float(speed), int(sr)\n"
            "pipeline = KPipeline(lang_code='a')\n"
            "chunks = []\n"
            "for _, _, audio in pipeline(text, voice=voice, speed=speed):\n"
            "    chunks.append(np.asarray(audio, dtype='float32'))\n"
            "if not chunks:\n"
            "    sys.exit('kokoro produced no audio')\n"
            "data = np.concatenate(chunks) if len(chunks) > 1 else chunks[0]\n"
            "pcm = np.clip(data * 32767, -32768, 32767).astype('<i2')\n"
            "with wave.open(out_path, 'wb') as w:\n"
            "    w.setnchannels(1); w.setsampwidth(2); w.setframerate(int(sr))\n"
            "    w.writeframes(pcm.tobytes())\n"
        )
        r = subprocess.run(
            [sys.executable, "-c", script, text, str(dest), voice,
             str(self.speed), str(self.sample_rate)],
            capture_output=True, text=True,
        )
        if r.returncode != 0 or not dest.exists():
            raise TTSUnavailable("Kokoro failed:\n" + (r.stderr or r.stdout)[-600:])
        return dest


# --------------------------------------------------------------------------
class PiperAdapter:
    name = "Piper"

    def __init__(self, cfg: dict, log=print):
        self.cfg = cfg
        self.log = log
        self.voice = cfg["piper"].get("voice", "en_US-lessac-medium")
        self.length_scale = float(cfg["piper"].get("length_scale", 1.0))

    def _bin(self) -> str | None:
        for cand in ("piper", "piper-tts"):
            path = shutil.which(cand)
            if path:
                return path
        return None

    def voice_file(self) -> Path | None:
        """Piper stores voices as <voice>.onnx (+ .onnx.json) in a voices dir."""
        install = path_for(self.cfg, "piper.install_dir")
        for base in (install / "voices", install, Path.home() / ".local/share/piper"):
            if not base.exists():
                continue
            hits = sorted(base.rglob(f"{self.voice}.onnx"))
            if hits:
                return hits[0]
        return None

    def available(self) -> bool:
        return self._bin() is not None and self.voice_file() is not None

    def voices(self) -> list[str]:
        install = path_for(self.cfg, "piper.install_dir")
        seen = []
        for base in (install / "voices", Path.home() / ".local/share/piper"):
            if base.exists():
                seen += [p.stem for p in base.rglob("*.onnx")]
        return sorted(set(seen))

    def synthesize(self, text: str, dest: Path, voice: str | None = None) -> Path:
        if voice:
            self.voice = voice
        bin_path = self._bin()
        if not bin_path:
            raise TTSUnavailable(
                "piper executable not found. Install with:\n"
                "  python3 -m pip install piper-tts\n"
                "  # or: pipx install piper-tts")
        model = self.voice_file()
        if not model:
            raise TTSUnavailable(
                f"Piper voice '{self.voice}' not found. Download it into\n"
                f"  {path_for(self.cfg, 'piper.install_dir') / 'voices'}/\n"
                f"from https://huggingface.co/rhasspy/piper-voices "
                f"(the file must be named {self.voice}.onnx)")
        dest.parent.mkdir(parents=True, exist_ok=True)
        self.log(f"  engine: Piper  voice={self.voice}")
        cmd = [bin_path, "--model", str(model), "--output_file", str(dest)]
        if self.length_scale != 1.0:
            cmd += ["--length_scale", str(self.length_scale)]
        r = subprocess.run(cmd, input=text.encode(), capture_output=True)
        if r.returncode != 0 or not dest.exists():
            raise TTSUnavailable("Piper failed:\n"
                                 + r.stderr.decode(errors="replace")[-600:])
        return dest


# --------------------------------------------------------------------------
def pick_engine(cfg: dict, requested: str = "auto") -> tuple[object, str]:
    """Resolve the requested engine to a concrete adapter.

    auto -> Kokoro when importable, else Piper, else raise with both reasons.
    """
    kokoro = KokoroAdapter(cfg)
    piper = PiperAdapter(cfg)

    if requested == "kokoro":
        if not kokoro.available():
            raise TTSUnavailable("Kokoro requested but not importable. "
                                 "See README 'Voice'.")
        return kokoro, "kokoro"
    if requested == "piper":
        if not piper.available():
            raise TTSUnavailable("Piper requested but not available (need the "
                                 "executable and a voice .onnx).")
        return piper, "piper"

    if requested not in ("auto", "", None):
        raise TTSUnavailable(f"unknown voice engine '{requested}' "
                             f"(expected auto, kokoro or piper)")
    if kokoro.available():
        return kokoro, "kokoro"
    if piper.available():
        return piper, "piper"
    raise TTSUnavailable(
        "No TTS engine available.\n"
        "  Kokoro: pip install 'kokoro>=0.9' 'misaki[en]'\n"
        "  Piper:   pip install piper-tts   + download a voice .onnx")


# Voice presets matching the game's tone. Purely prompt/voice metadata.
VOICE_PRESETS = {
    "guardian": {
        "character": "Forest Guardian",
        "personality": "calm and mysterious",
        "voice": "am_michael",
        "lines": ["You should not have come here.",
                  "The wild remembers those who listen.",
                  "Pass, and take what the forest offers."],
    },
    "commander": {
        "character": "Beast Commander",
        "personality": "direct, battle-hardened, encouraging",
        "voice": "am_adam",
        "lines": ["Deploy the beasts. Hold the lanes.",
                  "We do not wait for them. We meet them."],
    },
    "smugglers": {
        "character": "Merchant",
        "personality": "greedy but charming",
        "voice": "am_michael",
        "lines": ["Fresh stock, straight off the caravan..."],
    },
    "enemy": {
        "character": "Enemy Beast",
        "personality": "feral, aggressive",
        "voice": "bf_emma",
        "lines": ["Grrrrraaaaah!", "Roooar!"],
    },
}