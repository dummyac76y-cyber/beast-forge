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

`ui.js:makeRenderer()` picks the renderer:

```js
const forceCanvas2D = /[?&]2d(?:[=&]|$)/.test(location.search);
if (globalThis.__beastForge3D?.createRenderer3D && !forceCanvas2D) → WebGL
else → Canvas 2D
```

**The two renderers do not consume the same things.**

| | WebGL (`render3d.js`) | Canvas 2D (`render.js`) |
|---|---|---|
| Manifest sprites | No — builds its own `CanvasTexture` meshes | Yes |
| Backgrounds | Procedural theme colours | Yes, `bg_<theme>` |
| Audio (`audio.js`) | Yes | Yes |
| Fonts | Yes | Yes |

So `web/assets/manifest.json` art is visible on the `?2d` path only. The WebGL
renderer falls back to Canvas 2D automatically when WebGL is unavailable, so
`?2d` is not dead code — it is the fallback, plus the art path.

This asymmetry is deliberate-by-accident, not a design decision anyone wrote
down. Wiring the manifest into `render3d.js` is the obvious next feature.

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