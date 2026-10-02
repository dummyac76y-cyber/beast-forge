# Art Bible — Beast Forge

The visual contract for the game. Read this before generating, importing or
editing any artwork. It is the answer to "does this belong?".

**Authority:** if this file contradicts the code, the code is right and this file
is stale — fix this file.

## 1. What Beast Forge is

A **2D** dark-fantasy lane-defence game. Ancient fortress, magical beasts, five
lanes, tactical cards. The reference feeling is a hand-painted mobile fantasy
game: a fortress at dusk, torchlight on wet stone, banners in the wind.

It is **not** a website. No dashboard grids, no card-wall layouts, no corporate
spacing, no glossy glassmorphism. Screens look like *places*, with UI laid over
them like parchment and iron fittings.

**Hard rule: no 3D.** No 3D models, 3D environments or 3D UI. `web/js/render3d.js`
retains a WebGL path from an earlier iteration; it is kept working behind `?3d`
but is **not** the renderer and receives no new art. The renderer is Canvas 2D
(`web/js/render.js`), and all art direction targets it.

## 2. Where the art comes from

| Source | What | Licence |
|---|---|---|
| Original Fort Conquer build (`extract/assets/gfx/`, `app/src/main/assets/gfx/`) | Painted backdrops, per-species creature parts, fortresses, UI frames | **Third-party commercial art — redistribution rights unresolved.** Already committed in this repo; the owner must confirm before shipping. |
| Procedural pipeline (`tools/ai-studio/scripts/lib/art.mjs`) | Tiling detail maps, fallback sprites | CC0-1.0, generated |
| Cinzel | Display typeface | SIL OFL 1.1 |

The original art is the visual foundation and the single source of creature
identity. **Never regenerate a creature that already has painted parts.** Extend
the existing rig instead — see §7.

## 3. Palette

Base is very dark purple-black. Accent is warm forge gold. Magic is elemental
and controlled. Values are shared by the web CSS (`--` tokens), the Kotlin
theme (`ui/theme/Theme.kt`) and `web/js/models.js` `THEME`.

### Foundation
| Role | Hex | Use |
|---|---|---|
| Void | `#08060C` | Page behind everything, deepest shadow |
| Stone dark | `#0C0A10` | Base background |
| Stone | `#16131F` | Panel fill |
| Stone raised | `#221C30` | Raised panel, card fill |
| Iron line | `#33294A` | Borders, dividers |

### Accent
| Role | Hex | Use |
|---|---|---|
| Forge gold | `#FFB300` | Primary action, selected state |
| Bright gold | `#FFD54F` | Titles, hover, emphasis |
| Ember | `#FF9800` | Warm secondary, CTA gradient top |

### Elements
Fire `#FF3D00` · Ice `#00B0FF` · Lightning `#FFEA00` · Wind `#00E5FF` ·
Earth `#4CAF50` · Poison `#9C27B0`

Elements are the **only** saturated colour in the UI. If a screen has more than
one glowing element colour at a time, something is wrong.

### Text
Primary `#EDE7F6` on dark stone. Secondary/dim `#9B90B3`.

### Tiers
Feral `#B0BEC5` · Armored `#42A5F5` · Elemental `#AB47BC` · Apex `#FFB300` ·
Ancient `#FF1744`. Tier is also encoded as border width, never colour alone.

## 4. Typography

**Two fonts. No more.**

- **Display — Cinzel** (600/700). Screen titles, locations, stage names, major
  headings. Small caps feel, letter-spaced. Never for body text or numbers.
- **UI — system sans** (`system-ui, -apple-system, Segoe UI, Roboto`). Buttons,
  stats, descriptions, everything a player has to read quickly at 12–14px.

Rules: uppercase for display only. Body copy never below 13px. Numbers in stats
use tabular alignment. Do not introduce a third face for "flavour" — Cinzel
already does that job.

## 5. Materials and shapes

Surfaces are physical objects, not rectangles:

- **Dark stone** — panels. Matte, `#16131F`, 1px `#33294A` border, small radius
  (10–14px). Never glossy.
- **Iron** — frames and the nav bar. Darker, harder border, gold hairline accent.
- **Wood** — Forge and Roster furniture, warm brown, only as a background note.
- **Parchment** — long-form text only (lore, tooltips). Warm off-white, never
  behind an action.
- **Gold** — reserved for the single most important thing on screen. One primary
  gold element per screen, maximum.

Glow is a *signal*, not a texture. Use it on: the selected nav item, the primary
button, the active lane, a ready catapult. Nowhere else.

## 6. Layer order

Every scene is built in this order. Skipping a layer is what makes a screen look
flat.

```
BACKDROP    sky / painted environment
MIDGROUND   terrain, fortress, structures
BOARD       lanes, the play surface
ENTITIES    creatures, projectiles, fortresses
VFX         particles, flashes, floating text
ATMOSPHERE  fog, motes, light shaft
FOREGROUND  vignette, frame, edge darkening
```

Depth reads through **atmospheric perspective**: distant layers desaturate and
lose contrast toward the backdrop colour. Never scale depth by making far things
smaller and near things huge — that is what makes 2D look like a diorama.

### Parallax

Subtle, and only on non-interactive screens (Base, Campaign, Forge, Armory,
Roster). The battlefield itself is **fixed** — parallax behind moving units is a
readability tax with no gameplay payoff.

Rules: total drift across the full pointer/scroll range ≤ 3% of screen width.
Near layers move ~2× far layers. Never more than 4 layers. Parallax must never
move a control the player has to hit.

## 7. Creature identity

One painted species per beast, reused everywhere. The catalog maps 1:1 onto the
original art:

| Beast | Species | Race |
|---|---|---|
| Grizzly Bear | Brown bear | BIPED |
| Shadow Werewolf | Werewolf | BIPED |
| Apex Gorilla | Gorilla | BIPED |
| Venom Lizard | lizards | BIPED |
| Storm Tiger | tiger | QUADRUPED |
| Flame Lion | Lion | QUADRUPED |
| Iron Rhino | rhinoceros | QUADRUPED |
| Glacier Hippo | Hippo | QUADRUPED |
| Fire Dragon | Fire Dragon | DRAGON |
| Frost Dragon | Ice Dragon | DRAGON |
| Gale Dragon | Desert Dragon | DRAGON |
| Corrosion Drake | Swamp dragon | DRAGON |

The same painted parts appear on the Roster card, in the deck bar, on the
campaign map and on the battlefield. **A beast must be recognisable at 40px on
the battlefield and at 300px in the Roster.** Never generate an unrelated
variant of a species that already exists.

### The rig

The original sheets are TexturePacker atlases of body parts with no layout data
(every `offsetX` is 0), so the original bone rig is unrecoverable.
`web/js/beastparts.js` imposes its own layout, and
`tools/ai-studio/scripts/check-beast-layout.mjs` verifies it numerically:

- joints anchor on **painted pixels**, not trimmed boxes, or creatures float
- joints overlap by ~28% of the parent's height, or seams appear
- negative `y` offsets position a part's *centre* and open gaps; use `above` /
  `below` / `behind` to chain
- every part must be 8-connected to the body

Run that checker after any layout change. It is cheaper and more reliable than
eyeballing it.

Animation budget: idle bob, two-frame walk, attack lunge, death collapse.
Painted frames are composited from parts — no skeletal system, no per-frame
allocation.

## 8. Scale and readability

Battlefield creatures render at `LANE_HEIGHT * 0.86` (≈47 virtual px). Every
beast is scaled to that same height regardless of its true proportions, so a
hippo and a dragon carry equal visual weight.

Readability rules that override decoration:

- Units are never obscured by VFX, fog or foreground elements.
- Health bars sit above the creature, never behind it.
- The active lane is the only lane with a highlight.
- Element identity is carried by an aura *under* the creature plus the card, so
  painted beast colour never has to encode element.

## 9. Motion

Lightweight, because this runs on mid-range Android:

- 150–220ms for UI state, `ease-out`. Nothing slower except atmosphere.
- Atmosphere (fog, motes, light shaft) is continuous and slow.
- One ambient pulse per screen at most.
- **No `backdrop-filter: blur()` on large surfaces.** Blurring a full-screen
  battlefield is expensive enough to stall software compositing outright, and it
  has already caused a QA timeout. Use layered gradients for scrims.

## 10. Performance budget

| Asset | Rule |
|---|---|
| Backdrops | One painted JPEG per scene, ≤ 120 KB, cover-fitted |
| Creatures | Packed part atlas per race, ≤ 350 KB; trim aggressively |
| Detail maps | 256×256 tiling, opaque greyscale, shared |
| Audio | Mono WAV, ≤ 0.7s, existing 18-cue set |
| Draw calls | Batch by avoiding per-frame gradients in loops |

Total web asset budget: **under 3 MB**. Current: ~2.4 MB.

## 11. Screen checklist

Before calling a screen done:

- [ ] Does it read as a *place*, not a page of cards?
- [ ] Is there one obvious primary action?
- [ ] Is there one gold element, and only one?
- [ ] Are all seven layers present, or is the omission deliberate?
- [ ] Does it still work with every asset blocked? (QA enforces this.)
- [ ] Does it work at 360px wide and at 2560px wide?
- [ ] Does it use only Cinzel + system sans?

## 12. Naming and versioning

`<name>_v001.png`. Bump the version and register a new manifest key — never
overwrite in place. The importers refuse to repoint an existing key without
`--force`, and the verifier checks manifest dimensions against the real file.

Creature parts: `beasts/beasts_<sheet>_v001.png` + `parts_v001.json` sidecar.
Scenes: `scenes/<name>_v001.jpg`. Fortresses: `forts/forts_v001.png`.
