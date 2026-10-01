# Beast Forge — Web Port

A browser port of the Kotlin/Jetpack Compose Android app in `app/`, playable on
any device with no build step and no dependencies.

## Run it

```bash
cd web && python3 -m http.server 8000
# open http://localhost:8000
```

Any static server works. Because it uses classic `<script>` tags (not ES
modules), opening `index.html` via `file://` also works.

## Deploy

Pure static — no build step, no dependencies, no server.

**Vercel:** import the repo and press Deploy. A root `vercel.json` already
configures it: it builds `web/**` with `@vercel/static` (zeroConfig, so
filenames are preserved — required because the manifest references exact font
paths) and routes everything else to `web/index.html`.

If you'd rather set it in the dashboard instead: **Root Directory = `web`**,
Framework Preset **Other**, Build Command empty, Output Directory `.`. Both
work — the config file makes the dashboard route optional.

**Netlify:** drag the `web/` folder in, or set publish directory to `web`.
**GitHub Pages:** set the source to the `web/` folder on `main`.

A root `.vercelignore` keeps the 24 MB APK, the 22 MB `extract/` tree and the
Android project out of the deployment. That's 49.5 MB of repo down to a 150 KB
build output — and it means the commercial APK is never served over HTTP.

> **No redirect hop.** Every asset path in the app is relative, so the build
> works whether it's served from `/` or `/web/`. Verified by loading the page
> over real HTTP at the `/web/` subpath: scripts, manifest, fonts, credits and
> the battle loop all resolve and run.

## How it maps to the Kotlin source

| Kotlin | JavaScript | Notes |
|---|---|---|
| `model/GameModels.kt` | `js/models.js` | Enums + data classes. Compose `Color(0xAARRGGBB)` → `'#RRGGBB'` |
| `data/BeastCatalog.kt` | `js/catalog.js` | All 12 beasts, 12 stages, arena waves |
| `game/BattleEngine.kt` | `js/engine.js` | Line-for-line behavioural port |
| `data/GameRepository.kt` | `js/repo.js` | `SharedPreferences` → `localStorage` |
| `ui/components/BeastRenderer.kt` | `js/render.js` | Compose `DrawScope` → Canvas 2D |
| `ui/screens/*`, `MainActivity.kt` | `js/ui.js` | Compose screens → DOM + rAF loop |
| `audio/SoundManager.kt` | `js/audio.js` | Web Audio synth (see note) |
| — | `js/assets.js` | Optional manifest loader for real sprites/fonts/audio |

### Kotlin idioms translated

| Kotlin | JavaScript |
|---|---|
| `coerceIn(a, b)` | `clamp(v, a, b)` |
| `coerceAtLeast` / `coerceAtMost` | `Math.max` / `Math.min` |
| `minByOrNull { }` | `minBy()` — first element wins ties |
| `Random.nextFloat()` | `Math.random()` |
| `data class copy()` | `Object.assign({}, obj, changes)` |

The virtual battlefield space is unchanged at 1000×450 with `LANE_START = 110`
and `LANE_HEIGHT = 55`, so lane hit-testing behaves identically on both
platforms.

## Assets: drop in your own art, fonts and audio

Everything is optional. The game ships with **zero** third-party image and audio
files — every beast, fort, projectile and background is drawn procedurally and
every sound is synthesised. `assets/manifest.json` lets you override any of it.

Delete `assets/manifest.json` and the game still runs perfectly on the
procedural fallback. Add entries and they light up automatically — no code
changes, no rebuild.

```jsonc
{
  "fonts": [
    { "family": "Cinzel", "file": "fonts/cinzel-latin-600-normal.woff2", "weight": 600 }
  ],
  "sprites": {
    "unit_dragon":  { "file": "sprites/units/dragon.png",
                      "frameW": 130, "frameH": 110,
                      "anchorX": 0.5, "anchorY": 0.72,
                      "flipOnEnemy": true },
    "fort_player":  { "file": "sprites/fort.png", "frameW": 140, "frameH": 300 },
    "bg_volcano":   { "file": "sprites/bg_volcano.jpg", "cover": true }
  },
  "audio": {
    "fire":   { "file": "audio/fire.ogg", "volume": 0.7 },
    "victory": { "file": "audio/victory.ogg" }
  },
  "credits": [
    { "name": "My Art Pack", "author": "You", "license": "CC0 1.0", "url": "https://…" }
  ]
}
```

**Sprite keys** the renderer looks up:

| Key | Drawn for |
|---|---|
| `unit_biped` / `unit_quadruped` / `unit_dragon` | unit bodies |
| `fort_player` / `fort_enemy` | fortress walls |
| `bg_forest` `bg_volcano` `bg_snow` `bg_citadel` `bg_arena` | stage backdrops |

`anchorX`/`anchorY` are fractions of the frame, so you can align feet to the
lane regardless of canvas size. Any key you omit falls back to the vector art.

**Audio keys** are the names the engine already fires: `select`, `button`,
`coin`, `evolve`, `fire`, `ice`, `light`, `wind`, `earth`, `poison`,
`biped_die`, `quad_die`, `dragon_die`, `fire_explode`, `fort_ruin`,
`stage_start`, `victory`, `defeat`. Supplied samples take priority; anything
missing is synthesised.

**Credits.** Entries in `credits` render in a footer line and should also be
recorded in [`CREDITS.md`](CREDITS.md). Attribution stays with the asset — only
add files you have the right to redistribute, and don't strip copyright notices
from a font or texture.

### Bundled font

Cinzel (SIL OFL 1.1), used for all display type, in three weights. The OFL text
ships alongside it at `assets/fonts/OFL.txt`. This is the **only** third-party
file in `web/`.

## Deliberate differences

**Audio is synthesised, not sampled.** `SoundManager.kt` loads 19 clips from
`assets/mfx/*.ogg`, but that directory does not exist anywhere in the project —
every `loadSound` call throws and is swallowed, so the Android build runs
completely silent despite the README claiming "full authentic sound effects".
Rather than reproduce that, `js/audio.js` synthesises equivalent cues with
oscillators. Same `play(key)` signature.

**Drawing uses Canvas 2D, not WebGL.** The original is a Compose `DrawScope`
pipeline doing per-unit vector shapes (circles, rects, paths) — not textures.
Canvas 2D reproduces it faithfully and keeps the port dependency-free.

## Verification

The port was checked against the Kotlin semantics, not just made to parse:

- **Engine** — headless simulations confirm victory and defeat paths, arena
  wave restocking, catapult damage plus cooldown blocking, mana regen and kill
  rewards, the `dt` clamp (`48 × 0.1 = 4.8` units max per frame), pause, and
  `minByOrNull` first-wins tie behaviour.
- **Math** — evolution chain `COMMON→RARE→EPIC→LEGENDARY→MYTHIC` (terminal),
  dragon reach gain at EPIC+, and the profile formulas (`fortMaxHp`,
  `turretCooldown`, `maxMana`) checked against expected values.
- **Economy** — upgrade costs, evolve costs, `MYTHIC` evolve rejection,
  unknown-card rejection, pack rolls, deck size limits, and a corrupt-JSON
  recovery path.
- **UI** — the real `index.html` was loaded in jsdom with the scripts executed
  as genuine classic scripts, then driven: menu → campaign → battle → deploy →
  rAF loop → pause/speed/catapult/retreat → localStorage persistence.
- **Renderer** — all 5 themes, 18 unit/element combinations, projectiles,
  particles, floating damage text, and lane hit-test geometry.
- **Asset contract** — three modes exercised in jsdom against the real
  `index.html`: no manifest (5,296 draw calls, 0 `drawImage`, purely
  procedural, zero errors); manifest present (font loads, credits render);
  sprites present (144 `drawImage` calls, blit path confirmed). Also confirms
  the game survives `fetch` being unavailable entirely.

## Bug found in the Kotlin original

**`SoundManager` can never load anything.** It references 19 clips under
`assets/mfx/*.ogg`, but `app/src/main/assets/` contains only `font/` and `gfx/`
— there is no `mfx/` directory. Each `loadSound` call throws inside a
`try/catch` that only logs, so `soundMap` stays empty, every `play(key)` hits
the `?: return` early-return, and the app runs completely silent. The
generated README advertises "Full authentic sound effects" for spells,
attacks, evolutions and summoning, none of which are audible.

Fixed in the web port by synthesising the cues. The Android build in `app/` is
left exactly as generated — I did not modify it.
## Deploy troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `404 NOT_FOUND` | Deployed with no static output — usually the APK-only repo before `web/` existed | Confirm the build log shows `web/**` being collected; `vercel.json` at the repo root |
| Blank page, no menu | Scripts blocked or wrong mount | Check `vercel.json` has `"use": "@vercel/static"` with `"zeroConfig": true`; without `zeroConfig` filenames get hashed and the manifest's font paths 404 |
| Game runs but no custom art | Manifest 404 or `fetch` unavailable | Console logs `[beast-forge] assets: <summary>`; check `assets/manifest.json` is served at `/assets/manifest.json` |
| Fonts look like fallback serif | `assets/fonts/*.woff2` 404 | Confirm the build output preserved filenames |
| Opens via `file://` and art/fonts are missing | `fetch` is blocked on `file://` | Serve over HTTP (`python3 -m http.server`). The game still plays — it falls back to procedural art |
