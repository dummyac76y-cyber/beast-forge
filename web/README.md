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

Static — Vercel, Netlify, GitHub Pages, or any object store.

**Vercel:** import the repo, set the root directory to `web`, framework
"Other". Nothing to build. If you serve from the repo root instead, no
`vercel.json` is needed either — `web/` is just a directory of static files.

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