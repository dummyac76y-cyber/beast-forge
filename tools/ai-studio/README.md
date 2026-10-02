# Beast Forge AI Studio

An **optional** local development toolkit for producing Beast Forge assets:
art, music, sound effects, character voices, and automated web QA.

Everything runs locally against open-source engines. There are **no accounts,
no API keys, no paid services and no cloud calls**. The game itself does not
depend on any of this — see [The game never needs the AI Studio](#the-game-never-needs-the-ai-studio).

```
Beast Forge
    |
    +-- AI Game Studio                       (tools/ai-studio)
          |
          +-- Art Generator      -> ComfyUI
          +-- Music Generator    -> ACE-Step
          +-- Voice Generator    -> Kokoro (primary), Piper (fallback)
          +-- Game QA            -> Playwright
```

---

## Quick start

```bash
# From the repository root
tools/ai-studio/scripts/ai-studio doctor      # what is actually available
tools/ai-studio/scripts/ai-studio status      # paths + staged assets
tools/ai-studio/scripts/ai-studio test       # automated web QA (CPU friendly)
```

If the `tools/ai-studio` directory is not on your `PATH`, either call the
script by path as above, or symlink it:

```bash
ln -s "$(pwd)/tools/ai-studio/scripts/ai-studio" ~/.local/bin/ai-studio
```

---

## Layout

```
tools/ai-studio/
├── README.md                    this file
├── config/studio.json           paths, engine endpoints, voices (BF_* env overrides)
├── scripts/
│   ├── ai-studio                the unified CLI (entry point)
│   ├── bf_studio.py             config, probing, staging/promotion helpers
│   ├── bf_comfyui.py            ComfyUI adapter (HTTP API)
│   ├── bf_acestep.py            ACE-Step adapter + music presets
│   └── bf_voice.py              Kokoro + Piper adapters, engine selection
├── comfyui/
│   ├── workflows/               API-format workflow graphs
│   └── outputs/                 scratch output
├── audio/
│   ├── music/  sfx/  ambience/  generated audio
│   └── prompts/                 structured music requests (JSON)
├── voice/
│   ├── kokoro/  piper/          generated voice
│   ├── prompts/                 structured voice requests (JSON)
│   └── outputs/
├── qa/playwright/               automated browser tests
│   ├── run.js                   the suite
│   ├── server.js                dependency-free static server
│   └── package.json
└── models/                      (empty) local model cache pointer
```

Generated assets are staged under `tools/ai-studio/outputs/` and are **never**
written straight into the game. Use `ai-studio promote` to move a reviewed file
into `web/assets/generated/<category>/`, where it receives a versioned filename
so nothing is ever silently overwritten.

---

## Commands

| Command | Purpose |
|---|---|
| `ai-studio doctor` | Detect every engine for real and print READY / NOT INSTALLED / NOT RUNNING |
| `ai-studio status` | Show resolved config, model root, staged assets and disk usage |
| `ai-studio art` | Generate art through a running ComfyUI |
| `ai-studio music` | Generate music through ACE-Step |
| `ai-studio voice` | Generate voice through Kokoro or Piper |
| `ai-studio test` | Run the Playwright web QA suite |
| `ai-studio promote` | Copy a staged asset into the game under a versioned name |

Every value in `config/studio.json` can be overridden by an environment
variable using the same name uppercased with dots replaced by underscores:

```bash
export BF_COMFYUI_URL=http://192.168.1.20:8188   # a ComfyUI on another machine
export BF_MODEL_ROOT=/mnt/big-disk/bf-ai
export BF_KOKORO_VOICE=af_bella
export BF_QA_BASE_URL=http://127.0.0.1:8080
```

---

## Art — ComfyUI

ComfyUI is used as a **service over HTTP**. Beast Forge does not vendor, import
or duplicate any of ComfyUI's code; it POSTs an API-format workflow graph and
downloads the result. This means ComfyUI can live on a different machine.

**Setup (performed by you — the studio never installs it for you):**

```bash
git clone https://github.com/Comfy-Org/ComfyUI \
    ~/.local/share/beast-forge-ai/ComfyUI
cd ~/.local/share/beast-forge-ai/ComfyUI
python3 -m venv venv && ./venv/bin/pip install -r requirements.txt
```

**Model weights must be downloaded by you.** Put at least one checkpoint in
`ComfyUI/models/checkpoints/`, for example:

| Model | Size | Notes |
|---|---|---|
| `sd_turbo` | ~2.5 GB | 1–4 steps. The only practical option without a GPU. |
| SDXL base | ~7 GB | Best quality, needs a GPU to be pleasant |

They are large and are **never** committed to this repository.

**Run it:**

```bash
cd ~/.local/share/beast-forge-ai/ComfyUI && ./venv/bin/python main.py --cpu
# GPU machine: ./venv/bin/python main.py
```

**Use it:**

```bash
ai-studio art --preset character \
  --prompt "dark fantasy grizzly bear beastman, full body side view, painted concept art" \
  --name grizzly --seed 7
```

Presets: `character`, `enemy`, `background`, `prop`, `ui`, `vfx`, `texture`.

To use your own graph, build it in ComfyUI, choose **Workflow → Save (API
Format)** and drop the JSON into `tools/ai-studio/comfyui/workflows/`. The
adapter rebinds values by input *name* (`"6.text"`, `"3.steps"`, `"5.width"`),
so you can rearrange the graph as long as those names survive.

---

## Music — ACE-Step

**The heaviest component and strongly GPU-preferred.** On a CPU-only machine
ACE-Step is impractical — expect minutes of wall clock per second of audio.
`ai-studio doctor` will say so explicitly rather than pretending otherwise.

```bash
git clone https://github.com/ace-step/ACE-Step \
    ~/.local/share/beast-forge-ai/ACE-Step
# follow that repo's install instructions, then start its local service
```

Usage — a named preset, or a structured request file:

```bash
ai-studio music --preset forest
ai-studio music --request tools/ai-studio/audio/prompts/forest_night.json
```

A request file looks like this:

```json
{
  "title": "Forest Night Exploration",
  "mood": ["cozy", "peaceful", "mysterious"],
  "style": "dark fantasy pixel-game atmosphere",
  "vocals": "none",
  "duration": 120,
  "loop": true
}
```

Built-in presets: `menu`, `forest`, `combat`, `boss`, `victory`, `defeat`,
`forge`, `arena`.

Note that the game has **no music system at present**. Generated tracks land in
staging; wiring playback into `web/js/` is a gameplay-facing change and is
deliberately left as a separate, explicit step.

---

## Voice — Kokoro and Piper

Both produce a plain WAV. Switching between them never requires a game code
change, because the contract is simply "a file arrives at a path".

**Piper** (lightweight, CPU-fast, ~60 MB voices):

```bash
python3 -m pip install piper-tts
mkdir -p ~/.local/share/beast-forge-ai/piper/voices
# download en_US-lessac-medium.onnx (+ .onnx.json) from
# https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_US/lessac/medium
ai-studio voice --engine piper --text "You should not have come here."
```

**Kokoro** (higher quality, heavier — its package pulls torch via `misaki[en]`):

On a CPU-only machine, install torch **first** from the CPU wheel index, then
Kokoro. Otherwise pip resolves `torch` from PyPI, which on Linux pulls the CUDA
build and ~2.5 GB of `nvidia-*` wheels you will never use:

```bash
python3 -m pip install --upgrade pip                       # 22.x hits a resolvelib bug
python3 -m pip install --index-url https://download.pytorch.org/whl/cpu torch
python3 -m pip install 'kokoro>=0.9' 'misaki[en]'          # torch already satisfied
```

Kokoro fetches its ~330 MB model on first synthesis, so the first run is slow.

```bash
ai-studio voice --engine kokoro --preset guardian
```

Engine selection:

```bash
ai-studio voice --engine auto     # Kokoro when importable, else Piper
ai-studio voice --engine kokoro
ai-studio voice --engine piper
```

Presets: `guardian`, `commander`, `smugglers`, `enemy`. Or supply a request
file:

```json
{
  "character": "Forest Guardian",
  "personality": "calm and mysterious",
  "voice": "am_michael",
  "lines": ["You should not have come here."]
}
```

---

## QA — Playwright

Automated browser tests for the web build. **No GPU required** — Chromium runs
on SwiftShader here.

```bash
ai-studio test --setup    # one-time: installs playwright + chromium
ai-studio test            # run the suite
ai-studio test --headed   # watch it
```

The suite starts its own static server on `web/` (laid out exactly like
production, where `vercel.json` sets `outputDirectory: "web"`), then drives a
real Chromium. It covers page load, main menu, all six routes, entering a
battle, canvas + WebGL context acquisition, live simulation state, battle
controls (pause / speed / retreat), save-and-load persistence, the asset
manifest, failed network requests, mobile layout, and console errors.

Tests are deliberately deterministic: stable selectors only
(`#screen`, `[data-screen]`, `#battleCanvas`, `#cardbar`, `#catBtn`, …), a
seeded `localStorage` profile per test, and waits on *conditions* rather than
sleeps.

Chromium needs some system libraries. On Debian/Ubuntu:

```bash
tools/ai-studio/qa/playwright/node_modules/.bin/playwright install-deps chromium
```

---

## The game never needs the AI Studio

This is a hard requirement and it holds:

* If ComfyUI is offline, Beast Forge still runs.
* If ACE-Step is unavailable, Beast Forge still runs.
* If Kokoro is unavailable, Beast Forge still runs.
* If Piper is unavailable, Beast Forge still runs.
* If Playwright is unavailable, Beast Forge still runs.

Nothing in `web/`, `app/` or `vercel.json` imports or references this toolkit.
Generated assets are inert files that the game only loads if a manifest
explicitly points at them — and the shipped manifest's `sprites` and `audio`
maps are empty, so the game uses its procedural rendering and synthesised
audio by default.

---

## Model downloads

The studio never downloads model weights for you, and never commits them.
Each engine needs weights fetched once by you:

| Engine | What to download | Where |
|---|---|---|
| ComfyUI | checkpoint `.safetensors` | `ComfyUI/models/checkpoints/` |
| ACE-Step | model weights (multi-GB) | per that repo's docs |
| Kokoro | voice pack (`voices/` + `hexgrad/Kokoro-82M`) | per `kokoro` docs |
| Piper | one `<voice>.onnx` (+ `.onnx.json`) | `models/piper/voices/` |

All of this lives under `model_root` (`~/.local/share/beast-forge-ai` by
default), **outside the repository**, so git never sees it.

---

## Resource expectations

Measured on the machine this toolkit was developed on (4 vCPU, 11 GB RAM, no
GPU, 16 GB free disk):

| Engine | GPU | CPU-only reality |
|---|---|---|
| Playwright | not needed | Fast. Full suite runs in seconds. |
| Piper | not needed | Fast. Synthesis is near-real-time. |
| Kokoro | helpful | Usable. ~330 MB model fetched on first run. |
| ComfyUI | strongly preferred | Works but very slow — minutes per image at low step counts. |
| ACE-Step | effectively required | Impractical: minutes per second of audio. |

If none of them are installed, `ai-studio doctor` reports each as
`NOT INSTALLED` with the exact command needed, and the game is unaffected.

---

## Troubleshooting

**`ai-studio doctor` says NOT INSTALLED but I installed it.**
The studio looks in `model_root` (`BF_MODEL_ROOT` to change). If you installed
somewhere else, either point the env var at it or update
`config/studio.json`.

**ComfyUI "did not finish within Ns".**
Normal on CPU. Raise `comfyui.timeout_sec` in the config, or lower the step
count / resolution via `--preset`.

**Piper cannot find its voice.**
The file must be named exactly `<voice>.onnx` inside `model_root/piper/voices/`.
Both the `.onnx` and the `.onnx.json` are required.

**Kokoro import fails.**
`kokoro` needs `misaki[en]`, which needs `torch`. On a machine without it,
use `--engine piper`.

**QA: "Chromium missing system libraries".**
Run `playwright install-deps chromium`.

**QA: WebGL context check fails.**
The suite asserts the renderer obtained a GL context. On a headless CPU box
Chromium uses SwiftShader; the launch args already request it. If you override
the browser args, keep `--use-gl=swiftshader --enable-unsafe-swiftshader`.

**Everything I generated vanished.**
Model installs default outside `/tmp` on purpose — `/tmp` is wiped on many
containers. Check that `model_root` is not under `/tmp`.

---

## Troubleshooting the game itself

See `web/README.md` for the web build, and `README.md` at the repository root
for the Android project. Neither requires anything in this directory.