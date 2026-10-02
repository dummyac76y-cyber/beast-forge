# Asset Registry

Everything under `web/assets/`, who produces it, and what licence it carries.
Regenerate the generated set with:

```bash
npm run assets && npm run assets:promote
```

## Manifest

`web/assets/manifest.json` — the single wiring point. Shipped with the web port
before the AI Studio existed; the promote step **merges** into it and preserves
its `_readme` block and the Cinzel credit. Never replace it wholesale.

## Generated (AI Studio, CC0-1.0)

All procedurally rendered from code. No model weights, no third-party art, no
network access required to rebuild.

### Sprites — Canvas 2D renderer

| Key | File | Dimensions | Consumed by |
|---|---|---|---|
| `unit_biped` | `sprites/units/biped_v001.png` | 78×78 | Canvas 2D |
| `unit_quadruped` | `sprites/units/quadruped_v001.png` | 102×78 | Canvas 2D |
| `unit_dragon` | `sprites/units/dragon_v001.png` | 126×126 | Canvas 2D |
| `fort_player` | `sprites/forts/fort_player_v001.png` | 120×275 | Canvas 2D |
| `fort_enemy` | `sprites/forts/fort_enemy_v001.png` | 120×275 | Canvas 2D |

### Backgrounds — both renderers

The `bg_*` sprites are drawn by the Canvas 2D renderer *and* used as
`scene.background` in the WebGL renderer.

| Key | File | Dimensions |
|---|---|---|
| `bg_forest` | `sprites/bg/bg_forest_v001.png` | 1024×576 |
| `bg_volcano` | `sprites/bg/bg_volcano_v001.png` | 1024×576 |
| `bg_snow` | `sprites/bg/bg_snow_v001.png` | 1024×576 |
| `bg_citadel` | `sprites/bg/bg_citadel_v001.png` | 1024×576 |
| `bg_arena` | `sprites/bg/bg_arena_v001.png` | 1024×576 |

### Textures — WebGL renderer only

Seamless 256×256 tiling detail maps. Used as `roughnessMap` + `bumpMap`, never as
albedo, so they add surface relief without shifting the per-element palette.

| Key | File | Applies to | `repeat` |
|---|---|---|---|
| `tex_fur` | `textures/tex_fur_v001.png` | biped + quadruped | 2 |
| `tex_scale` | `textures/tex_scale_v001.png` | dragon | 2 |
| `tex_stone` | `textures/tex_stone_v001.png` | terrain, lanes, rocks, forts | 3 |

`verify.mjs` decodes each one and fails if it does not tile: the wrap-edge delta
must stay within 2.5× the typical interior pixel delta along the same axis.
Tiling comes from value noise on a lattice that wraps at each octave's frequency.

### Audio

Mono, 22 050 Hz, 16-bit PCM WAV. Keys mirror the `CUES` table in
`web/js/audio.js`, so every sound the game fires has a sample:

`select` `button` `coin` `evolve` `fire` `ice` `light` `wind` `earth` `poison`
`biped_die` `quad_die` `dragon_die` `fire_explode` `fort_ruin` `stage_start`
`victory` `defeat`

Total ≈ 767 KiB for the whole generated set.

### Naming

`<name>_v001.png`. When art changes, bump the version and add a manifest entry —
do not overwrite in place. The promote step enforces this: it refuses to replace
an existing file without `--force`, and refuses to repoint an existing manifest
key at a different file without `--force`.

## Pre-existing (not generated)

| Path | Origin | Licence |
|---|---|---|
| `fonts/cinzel-latin-{500,600,700}-normal.woff2` | Cinzel, The Cinzel Project Authors | SIL OFL 1.1, text at `fonts/OFL.txt` |
| `fonts/OFL.txt` | Cinzel | OFL 1.1 |

Credited in the manifest under the name `Cinzel`. The AI Studio deliberately
does **not** re-add a Cinzel credit — the merge dedupes by name so attribution
is never double-counted.

## Naming contract the renderer expects

From `web/js/assets.js` and `render.js`:

- `unit_<race lowercased>` — `unit_biped`, `unit_quadruped`, `unit_dragon`
- `fort_<side>` — `fort_player`, `fort_enemy`
- `bg_<themekey>` — one per `THEMES` key in `render.js` plus `arena` from `ui.js`

Unit sprites must face **right**: `render.js` draws player units facing right and
mirrors enemy units via `flipOnEnemy`.

Unit art is **element-neutral** because sprites are keyed by race only — one
`unit_biped` serves fire, ice, earth, wind, lightning and poison beasts. The
renderer draws the element aura over the sprite, so affinity stays readable.
Baking an element colour in would be wrong for five of six cases.

## Not covered

`app/src/main/assets/` (the Android port) still has the original APK graphics.
The AI Studio assets are **web-only**. Porting them means copying the files into
`app/src/main/assets/gfx/` and adding an equivalent manifest lookup to the
Android loader — not done.