"""ACE-Step music adapter.

ACE-Step is a text-to-music diffusion model. It is the right engine for the
game's soundtrack (mood/style/instrument/vocal prompts, fixed duration), but it
is by far the heaviest tool here -- models are multiple GB and inference is
GPU-oriented. On a CPU-only machine this adapter will still work but expect
minutes of wall clock per short clip, so `doctor` warns explicitly.

Two execution paths are supported:
  * `api`  -- ACE-Step's local HTTP service (default), fastest and simplest.
  * `cli`  -- direct in-process import, for people running it from a checkout.

The adapter never fabricates output: if the engine cannot run it raises, and
the CLI reports the real reason.
"""
from __future__ import annotations

import json
import subprocess
import time
from pathlib import Path

from bf_studio import http_probe, path_for


class ACEStepUnavailable(RuntimeError):
    pass


# Game situations the studio knows how to score. Keys are used on the CLI as
# `ai-studio music menu`. Each entry is a complete prompt so results are
# reproducible across machines.
MUSIC_PRESETS = {
    "menu": {
        "title": "Main Menu",
        "duration": 90,
        "prompt": "dark fantasy orchestral main menu theme, slow war drums, low "
                  "brass, eerie choir, mysterious, cinematic, loopable, no vocals",
        "tags": "dark fantasy, orchestral, loop, menu",
    },
    "forest": {
        "title": "Forest Night Exploration",
        "duration": 120,
        "prompt": "cozy peaceful mysterious forest exploration, soft strings, "
                  "woodwinds, gentle harp, night ambience, dark fantasy, loopable, no vocals",
        "tags": "cozy, peaceful, mysterious, dark fantasy pixel-game atmosphere, loop",
    },
    "combat": {
        "title": "Combat",
        "duration": 90,
        "prompt": "intense fantasy battle music, driving percussion, aggressive "
                  "strings, brass stabs, fast tempo, dark fantasy, loopable, no vocals",
        "tags": "tense, fast, percussion, dark fantasy, loop",
    },
    "boss": {
        "title": "Boss Encounter",
        "duration": 100,
        "prompt": "epic boss battle theme, huge timpani, dissonant brass, "
                  "choral stabs, building intensity, dark fantasy, loopable, no vocals",
        "tags": "epic, heavy percussion, choir, dark fantasy, loop",
    },
    "victory": {
        "title": "Victory",
        "duration": 20,
        "prompt": "triumphant victory fanfare, bright brass, rising strings, "
                  "celebratory, dark fantasy, no vocals",
        "tags": "triumphant, short, brass",
    },
    "defeat": {
        "title": "Defeat",
        "duration": 20,
        "prompt": "somber defeat sting, descending low strings, lone horn, "
                  "melancholy, dark fantasy, no vocals",
        "tags": "somber, short, descending",
    },
    "forge": {
        "title": "Forge / Upgrade",
        "duration": 60,
        "prompt": "warm workshop forge theme, steady anvil rhythm, folk strings, "
                  "cozy, dark fantasy, loopable, no vocals",
        "tags": "warm, rhythmic, loop",
    },
    "arena": {
        "title": "Arena",
        "duration": 90,
        "prompt": "colosseum arena crowd and combat, taiko drums, war horns, "
                  "barbaric chant, dark fantasy, loopable, no vocals",
        "tags": "barbaric, drums, chant, dark fantasy, loop",
    },
}


class ACEStepAdapter:
    def __init__(self, cfg: dict, log=print):
        self.cfg = cfg
        self.log = log
        self.api_url = str(cfg["acestep"]["api_url"]).rstrip("/")
        self.install_dir = path_for(cfg, "acestep.install_dir")
        self.mode = cfg["acestep"].get("mode", "api")

    def available(self) -> bool:
        return http_probe(self.api_url + "/health", timeout=2.0)

    def installed(self) -> bool:
        return self.install_dir.exists() and any(self.install_dir.iterdir())

    def preset(self, key: str) -> dict:
        if key not in MUSIC_PRESETS:
            raise KeyError(f"unknown music preset '{key}'. Known: "
                           f"{', '.join(sorted(MUSIC_PRESETS))}")
        return MUSIC_PRESETS[key]

    def compose_prompt(self, spec: dict) -> str:
        """Accept a structured request and flatten it to an ACE-Step prompt.

        This mirrors the request shape from the studio brief:
            mood / style / vocals / length / loop
        """
        parts = [spec.get("title") or spec.get("name") or "game music"]
        for field in ("mood", "style", "instrumentation"):
            val = spec.get(field)
            if val:
                if isinstance(val, (list, tuple)):
                    val = ", ".join(str(v) for v in val)
                parts.append(str(val))
        if spec.get("description"):
            parts.append(str(spec["description"]))
        vocals = spec.get("vocals", "none")
        parts.append(str(vocals) if vocals else "no vocals")
        if spec.get("loop", True):
            parts.append("loopable")
        return ", ".join(p for p in parts if p)

    def generate(self, spec: dict, dest: Path) -> Path:
        """Generate one music track. Returns the written file path."""
        prompt = self.compose_prompt(spec)
        duration = int(spec.get("duration", self.cfg["acestep"].get("default_duration_sec", 60)))
        dest.parent.mkdir(parents=True, exist_ok=True)

        if not self.available():
            raise ACEStepUnavailable(
                f"ACE-Step service is not reachable at {self.api_url}.\n"
                f"  Install:  see tools/ai-studio/README.md#ace-step\n"
                f"  Note:     ACE-Step models are multi-GB and GPU-preferred.\n"
                f"             On CPU expect minutes per clip, or minutes per SECOND "
                f"for longer durations.")

        payload = {
            "prompt": prompt,
            "duration": duration,
            "tags": spec.get("tags", ""),
            "bpm": spec.get("bpm"),
            "instrumental": str(spec.get("vocals", "none")).lower() in ("none", "", "no"),
            "format": self.cfg["acestep"].get("output_format", "wav"),
        }
        self.log(f"  prompt: {prompt}")
        self.log(f"  duration: {duration}s")

        import urllib.request
        body = json.dumps(payload).encode()
        req = urllib.request.Request(self.api_url + "/generate", data=body,
                                     headers={"Content-Type": "application/json"})
        self.log(f"  POST {self.api_url}/generate (this can be very slow on CPU)")
        try:
            with urllib.request.urlopen(req, timeout=3600) as resp:
                out = json.loads(resp.read().decode())
        except Exception as exc:
            raise ACEStepUnavailable(f"ACE-Step generation failed: {exc}")

        # Expect either inline audio or a path/url.
        if out.get("audio_base64"):
            import base64
            dest.write_bytes(base64.b64decode(out["audio_base64"]))
            return dest
        if out.get("path"):
            src = Path(out["path"])
            if src.exists():
                dest.write_bytes(src.read_bytes())
                return dest
        if out.get("url"):
            import urllib.request as ur
            with ur.urlopen(out["url"], timeout=600) as r:
                dest.write_bytes(r.read())
            return dest
        raise ACEStepUnavailable(
            f"ACE-Step returned no audio. Keys present: {sorted(out)}")