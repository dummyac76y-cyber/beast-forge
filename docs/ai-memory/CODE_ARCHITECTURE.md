# Code Architecture

## Repository shape

| Path | What |
|---|---|
| `web/` | Browser port. Static files, no build step. `vercel.json` publishes it. |
| `app/` | Android port (Kotlin / Jetpack Compose). Gradle. |
| `extract/` | Decomposed APK tree from the original Fort Conquer build. Reference only. |
| `tools/ai-studio/` | Optional dev-time asset + QA toolkit. |
| `docs/ai-memory/` | This directory. |

The web port is the one that gets verified in CI-like fashion here, because the
Android toolchain is absent from this environment.

## Web boot order (`web/index.html`)

Classic scripts load in dependency order, then one ES module:

```
models.js  catalog.js  assets.js  repo.js  engine.js  audio.js  render.js  ui.js
render3d.js  (type=module, deferred — always executes before DOMContentLoaded)
```

These are classic scripts sharing globals through `globalThis`. Adding a `const`
at top level in two of them is a redeclaration `SyntaxError`, which is why
`assets.js` keeps its key table (`SPRITE_KEYS`) as data instead of sharing a
binding with `render.js`.

## Renderer split — the most important thing to know

`ui.js:makeRenderer()` picks the renderer and passes the shared `AssetStore` in:

```js
const forceCanvas2D = /[?&]2d(?:[=&]|$)/.test(location.search);
if (globalThis.__beastForge3D?.createRenderer3D && !forceCanvas2D)
  return three.createRenderer3D(cv, { assets });   // WebGL
return new Renderer(cv, assets);                   // Canvas 2D
```

Both renderers implement the same `render(engine, selectedLane, hoveredLane)` /
`laneAtClientY(y)` / `resize()` interface, so `ui.js` is renderer-agnostic.

### What each renderer consumes from the manifest

| Manifest section | WebGL (`render3d.js`) | Canvas 2D (`render.js`) |
|---|---|---|
| `sprites.unit_<race>` | no — 3D primitive geometry | yes |
| `sprites.fort_<side>` | no — 3D fort geometry | yes |
| `sprites.bg_<theme>` | **yes** — `scene.background`, cover-fitted | yes, `drawImage` |
| `textures.tex_*` | **yes** — `roughnessMap` + `bumpMap` | no |
| `audio.*` | yes | yes |
| `fonts.*` | yes | yes |

### Why the WebGL renderer gets tiling maps, not character sprites

`render3d.js` builds geometry from three.js primitives. Pasting a 2D creature
image onto a capsule would look *worse* than the procedural material it
replaces, and would fight the walk-cycle animation. So the 3D path takes the
kind of art it can actually use:

- **Painted backgrounds** → `scene.background`, cover-fitted to the viewport with
  `repeat`/`offset` (three draws a background texture across the full NDC quad,
  so cropping is just scaling past the edges). Biased upward so the horizon stays
  in frame.
- **Seamless detail maps** → attached as `roughnessMap` and `bumpMap`, never as
  `map`. This is deliberate: an albedo map multiplies into the material colour
  and would darken the per-element palette, whereas roughness/bump variation adds
  real surface interest under the existing lighting while leaving colour and
  brightness untouched.

Every lookup is optional. With no manifest at all, `setTheme()` falls back to the
flat theme colour and `detailMap()` returns `null`, so the renderer behaves
exactly as it did before this existed. `qa/run-qa.mjs` asserts this on both
renderers by aborting every asset request and requiring the scene to still light
up.

`AssetStore` gained a `textures` section (key → `{ img, repeat }`) with a
`texture(key)` accessor and `textureHits`/`textureMisses` counters, mirroring the
`sprites` handling.

## Virtual battlefield space

`render.js` works in a fixed 1000×450 virtual space, scaled to the canvas:
`scaleX = cssW / 1000`, `scaleY = cssH / 450`.

- `LANE_START = 110`, `LANE_HEIGHT = 55`, 5 lanes → lanes span y 110..385
- Lane hit test: `floor((y - 110) / 55)`, so lane *i* is centred at
  `(0.2444 + i * 0.1222)` of canvas height
- Forts at x = 60 (player) and x = 940 (enemy)

Both renderers implement the same `render(engine, selectedLane, hoveredLane)` /
`laneAtClientY(y)` / `resize()` interface, so `ui.js` is renderer-agnostic.

## Asset pipeline

```
tools/ai-studio/scripts/lib/spec.mjs     ← the contract (single source of truth)
        │
        ├─ generate-assets.mjs  →  tools/ai-studio/{art,audio}/outputs/   (gitignored)
        │                              │
        │                              └─ --promote → web/assets/ + manifest.json (merged)
        │
        └─ verify.mjs  re-derives the contract from web/js/*.js and fails on drift
```

Promoting is idempotent: generation is deterministic, so re-running
`assets && assets:promote` rewrites nothing and exits cleanly. Only a genuine
content change to an existing asset needs `--force`.

`web/js/assets.js` (`AssetStore`) is the consumer. Design contract, quoted from
its own header:

> the game MUST run identically with zero asset files present

It never rejects. A missing manifest, a 404, a malformed JSON entry — all resolve
to `null` and the caller draws the procedural version.

Audio is fetched as raw bytes during page load and **decoded only after a user
gesture** (`AudioMan.unlock()` → `decodePending()`), because constructing an
`AudioContext` before a gesture makes Chrome log a warning and leaves it
suspended.

## Testing

| Command | Covers |
|---|---|
| `npm run verify` | Asset contract vs game source, file integrity, headless battle sim |
| `npm run qa` | Real Chromium, both renderers, plus assets-blocked degradation |
| `npm run doctor` | Honest environment and provider status |

There is no `package.json` test script in the upstream repo and no pre-existing
test framework — `tools/ai-studio/` introduced both.
## Screen composition (`web/js/ui.js`)

Every non-battle screen is built through one helper:

```js
const root = scene({ back: 'scene_citadel' }, 14);   // scene key, parallax depth
const body = sceneBody(root);                        // content goes here
host.appendChild(root);
```

`scene()` emits a `.scene` root containing `.layer` elements
(`lyr-back` `lyr-mid` `lyr-near` `lyr-haze` `lyr-fog` `lyr-firelight`
`lyr-frame`) plus one `.scene-body` content slot. Layers are only emitted for
scene keys the manifest actually resolved, so with every asset blocked the
screen still gets graded scrims rather than a flat void.

Pointer parallax writes `--px` / `--py` on the root; each layer shifts by its
own `--dx` / `--dy`. It is disabled under `prefers-reduced-motion`.

Notable constraint: `BeastRig.draw(ctx, cardId, x, y, ...)` takes the rig's
**left edge and ground line**, not a centre point. The roster and forge
portraits therefore compute `left = (size - rig.width * scale) / 2` explicitly.
Passing `size / 2` puts every beast hard against the right edge of its tile —
`npm run qa` now measures portrait centring so that regression cannot return.

## Beast rig (`web/js/beastparts.js`)

`resolveLayout(race, parts, bw, bh)` composes the original painted parts into a
drawable rig at draw time. The plists in the source tree record zero offsets for
every frame, so the original bone layout is unrecoverable and this rig is a new
one, not a reconstruction.

Exposed three ways for compatibility: `globalThis.__beastForgeRig`, named script
globals (`BeastRig`, `LAYOUT`, `resolveLayout`) for classic `<script>` order,
and `module.exports` for Node. `beastparts.js` loads **before** `render.js` in
`web/index.html`.

`check-beast-layout.mjs` composes all twelve beasts and asserts silhouette
coherence, coverage, grounding and joint connectivity.

## Asset lookups by hit/miss

`AssetStore` counts `sceneHits` / `sceneMisses` alongside the existing sprite and
texture counters. QA asserts the renderer actually *consumed* manifest art rather
than silently falling through to procedural drawing, because a silent fallback
looks exactly like success from the outside.
