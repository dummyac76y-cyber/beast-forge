# Asset Registry

Everything under `web/assets/`, who produces it, and what licence it carries.

There are now **two provenances** in this directory and they must not be
conflated:

1. **Imported** — the original painted art, cropped byte-for-byte out of the
   build's own source tree. Third-party works. Licensing **unresolved**.
2. **Generated** — procedural art, textures and audio rendered from code in
   this repository. CC0-1.0.

Regenerate the generated set with:

```bash
npm run assets && npm run assets:promote
```

Re-import the painted set with:

```bash
node tools/ai-studio/scripts/import-original-art.mjs
node tools/ai-studio/scripts/import-scene-art.mjs
```

Both importers are idempotent and guarded by the same manifest helper, so
re-running them will not repoint an existing key at a different file without
`--force`.

## Manifest

`web/assets/manifest.json` — the single wiring point. Shipped with the web port
before the AI Studio existed; the promote step **merges** into it and preserves
its `_readme` block and the Cinzel credit. Never replace it wholesale.

Sections: `sprites` `audio` `textures` `fonts` `credits` `beasts` `scenes`
`forts` `generatedBy`.

## Imported — original painted art (third-party, licence UNRESOLVED)

Source trees, read-only:

- `extract/assets/gfx/unit/{biped,quad,dragon}/*.plist|*.png` — beast parts
- `app/src/main/assets/gfx/{bg,cover}` — biome backdrops, arena, cover, forts

| Manifest key | File | Contents |
|---|---|---|
| `beasts_biped` | `beasts/beasts_biped_v001.png` | 996×124 atlas, parts + `beasts/parts_v001.json` |
| `beasts_quad` | `beasts/beasts_quad_v001.png` | 1016×116 atlas, same sidecar |
| `beasts_dragon` | `beasts/beasts_dragon_v001.png` | 992×264 atlas, same sidecar |
| `fort_atlas` | `forts/forts_v001.png` | `forts/forts_v001.json`, frames `castle_1_1..3` / `castle_2_1..3` |
| `scene_base` | `scenes/cover_bg_v001.jpg` | cover art behind the Base screen |
| `scene_forest` | `scenes/bg1_v001.jpg` | Verdant biome |
| `scene_volcano` | `scenes/bg2_v001.jpg` | Ember biome, Beast Forge backdrop |
| `scene_snow` | `scenes/bg3_v001.jpg` | Frost biome |
| `scene_citadel` | `scenes/bg4_v001.jpg` | Citadel, Campaign + Armory backdrop |
| `scene_arena` | `scenes/arena_bg_v001.jpg` | Titan Arena backdrop |

Three important constraints:

- **TexturePacker plists record zero offsets for every frame.** The original
  bone layout is therefore unrecoverable from the source data. `resolveLayout()`
  in `web/js/beastparts.js` imposes a new rig over the painted parts instead.
- **Beast mapping is 1:1** with the twelve beasts: Brown bear, Werewolf,
  Gorilla, the lizards, tiger, Lion, rhinoceros, Hippo, Fire Dragon, Ice Dragon,
  Desert Dragon and Swamp dragon.
- **Painted scenes are JPEG, so they live in `scenes`, not `sprites`.**
  `verify.mjs` validates every `sprites` entry as a PNG whose dimensions match
  `frameW`/`frameH`; there is no JPEG decoder in the pipeline to measure one.

`check-beast-layout.mjs` composes all twelve through `resolveLayout()` and
asserts coherent silhouettes, real coverage, grounding and joint connectivity.

## Generated (AI Studio, CC0-1.0)

All procedurally rendered from code. No model weights, no third-party art, no
network access required to rebuild. **These are fallbacks** — the generated
units and backdrops are still shipped and still used when the manifest's
imported sections are absent or fail to decode.

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

## Credits and licensing posture

`manifest.credits` carries **three** entries and the UI credits line renders all
of them, so the unresolved position is visible in the running game rather than
buried in a file:

1. `Cinzel` — SIL OFL 1.1.
2. `Original Fort Conquer painted art` — **licence UNRESOLVED; do not
   redistribute commercially until cleared.** The note names the two importer
   scripts and their source trees.
3. `Beast Forge AI Studio procedural asset set` — CC0-1.0, scoped explicitly to
   the generated set only.

The earlier CC0 entry claimed "no third-party art", which stopped being true
once the painted atlases landed. Do not let that wording come back.

## Naming contract the renderer expects

From `web/js/assets.js` and `render.js`:

- `unit_<race lowercased>` — `unit_biped`, `unit_quadruped`, `unit_dragon`
- `fort_<side>` — `fort_player`, `fort_enemy`
- `bg_<themekey>` — one per `THEMES` key in `render.js` plus `arena` from `ui.js`
- `scene_<key>` — painted backdrops, looked up by `AssetStore.sceneUrl(key)`

Unit sprites must face **right**: `render.js` draws player units facing right and
mirrors enemy units via `flipOnEnemy`.

Imported beast parts are composed by the rig instead, so they carry no facing
convention of their own — `BeastRig.draw` takes `facing` directly.

Unit art is **element-neutral** because sprites are keyed by race only — one
`unit_biped` serves fire, ice, earth, wind, lightning and poison beasts. The
renderer draws the element aura over the sprite, so affinity stays readable.
Baking an element colour in would be wrong for five of six cases.

## Not covered

`app/src/main/assets/` (the Android port) still has the original APK graphics,
and `BeastRenderer.kt` draws everything procedurally — the Kotlin side references
none of the atlases in `app/src/main/assets/gfx/`. The AI Studio assets are
**web-only**. Porting them means copying the files into
`app/src/main/assets/gfx/` and adding an equivalent manifest lookup to the
Android loader — not done.

Known latent Android bug, separate from art: `SoundManager.kt` loads 17 sounds
from `assets/mfx/*.ogg`, but no `mfx/` directory exists in the tree, so every
load throws and is swallowed. The Android port runs silent.