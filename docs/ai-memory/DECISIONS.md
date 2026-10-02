# Decisions

Format: decision, date, rationale, what was rejected.

---

## D1 — Ship procedurally generated assets instead of AI-generated ones

**Date:** 2026-10-02

The AI Studio's master skill mandates ComfyUI for art and ACE-Step for music.
Neither is installed, there is no GPU, and no model weights may be committed. The
alternative was to report "no assets generated".

Instead, `tools/ai-studio/scripts/lib/art.mjs` draws the sprites and
`renderCue()` synthesises the audio from code, deterministically, with zero
dependencies.

**Why this is honest and not a shortcut:** the generated files are labelled
procedural in the manifest credits, in `tools/ai-studio/README.md`, and in this
memory. Nobody claims model output. The provider table in the README states every
AI engine's real status.

**Rejected:** installing a diffusion model to generate ten small sprites on a
CPU-only box (hours to days, gigabytes, and a model download the game would then
depend on for reproducibility); faking the pipeline with placeholder images and
reporting them as AI-generated.

**Consequence:** art is stylistically simple vector work. Replacing it with real
model output later needs no game changes — same manifest, same keys.

---

## D2 — Hand-rolled PNG/WAV encoders over an image library

**Date:** 2026-10-02

The host has no Pillow, no numpy, no npm packages. `sharp` and `canvas` need
native builds. Everything needed is `zlib.deflateSync` (ships with Node) and a
scanline filler.

**Rejected:** `npm i sharp` / `canvas` (native build, large tree, new failure
modes); Python + Pillow (a second runtime for one task, and the skill says match
the existing runtime).

**Consequence:** ~250 lines of encoder code in `lib/png.mjs`, `lib/wav.mjs`,
`lib/raster.mjs`. It uses adaptive per-scanline PNG filtering, so gradients
compress well (a 1024×576 background is ~80 KiB, not ~1 MiB).

---

## D3 — Generate to staging, promote deliberately

**Date:** 2026-10-02

Generation writes to `tools/ai-studio/{art,audio}/outputs/` (gitignored).
Only `--promote` copies into `web/assets/` and merges the manifest.

**Why:** the skill requires generated output to land in an output directory and
be promoted intentionally, never auto-replacing a game asset. The guard is
enforced in code and has already fired once — the first promote attempt correctly
refused to clobber the pre-existing `manifest.json`, which exposed that the
manifest had to be *merged*, not rewritten.

**Also:** `--force` is required to overwrite any existing asset file or to repoint
an existing manifest key. `-v001` versioning plus this guard means replacing art
is always a conscious act.

---

## D4 — Verify the manifest against the game source, not against itself

**Date:** 2026-10-02

`verify.mjs` does not ask `spec.mjs` what keys exist and then check that the
manifest matches. It re-derives the keys from `web/js/*.js` — races from
`models.js`, themes from `render.js`, audio from the `CUES` table plus every
`play('…')` call site and every element/race→cue map — and then checks coverage.

**Why:** a manifest that only agrees with itself proves nothing. This way, adding
a new `play('boss_roar')` to `engine.js` without a matching sample fails the
build.

**Rejected:** hand-maintained key list (rots silently, which is exactly what it
did before this check existed).

---

## D5 — Fix the `onGameOver` bug rather than work around it in QA

**Date:** 2026-10-02

QA surfaced `TypeError: Cannot read properties of null (reading 'isVictory')` on
every completed battle. Root cause is in `web/js/ui.js`:

```js
function onGameOver() {
  stopLoop();              // sets engine = null
  const won = engine.isVictory;   // boom
```

`stopLoop()` nulls `engine`, and `onGameOver` then reads `engine` five times
afterwards. Every battle's end-of-battle screen threw, so **the victory/defeat
overlay never rendered and campaign rewards were never granted**.

Fixed by reading the needed values before `stopLoop()`. This is a bug fix, not a
feature — the function was already written to do exactly this.

**Why not leave it:** the task was "make sure it's playable". A game that cannot
show you the result of a match is not playable. The fix is four lines and touches
no behaviour other than the crash.

---

## D6 — Give the WebGL renderer tiling maps, not character sprites

**Date:** 2026-10-02 · **Supersedes the "leave render3d.js alone" stance in D6 of the first pass**

`render3d.js` never read the manifest, so generated sprites were invisible on the
default WebGL path. Two ways to close that:

**(a) texture the 3D beasts with the character sprites.** Rejected. The renderer
builds geometry from primitives — a capsule, a cone, a sphere — and animates
them with walk cycles. A flat 2D creature image wrapped onto a capsule would look
worse than the procedural material it replaced, and would not animate. The art
and the renderer disagree about what a unit *is*.

**(b) give the 3D path the kind of art it can actually use.** Chosen.

- Painted `bg_<theme>` art → `scene.background`, cover-fitted.
- New seamless tiling maps → `roughnessMap` + `bumpMap`.

**Why not `map` for the tiling maps:** `MeshStandardMaterial` multiplies
`map × color`. A tiling albedo would darken every per-element palette by its mean
value and shift hues — a silent regression in the thing the palette exists to
communicate. `roughnessMap` and `bumpMap` vary the surface *response to light*
without touching colour or brightness, which is exactly what "make it look less
flat" needs. Every lookup is optional and falls back to the previous procedural
behaviour, asserted in QA by aborting all asset requests on both renderers.

## D6b — Make promote idempotent instead of erroring on identical bytes

**Date:** 2026-10-02

The first promote guard refused to write *any* existing file without `--force`,
which made the documented workflow `assets && assets:promote` fail on the second
run even though generation is deterministic and the output was byte-identical.

Now a file whose staged bytes equal the committed bytes is a silent no-op, and
only a genuine content difference requires `--force`. Protection is unchanged where
it matters — you still cannot accidentally replace a real game asset, but
re-promoting unchanged art is no longer a papercut.

Verified: two consecutive generations produced 31/31 byte-identical files, and
every already-promoted asset matched its regenerated counterpart exactly.

---

## D7 — Use Playwright despite it being a dependency

**Date:** 2026-10-02

`playwright` is the only npm dependency added, as a devDependency, used only by
`npm run qa`.

**Why:** the skill names Playwright as the QA provider, and "make sure it's
playable" cannot be honestly verified without a real browser. Headless Chromium
is forced through SwiftShader so the WebGL path is genuinely exercised instead of
silently falling back to 2D.

**Not committed:** `node_modules/`. The browser binary lives in the Playwright
cache outside the repo. A fresh clone needs
`npm i && npx playwright install chromium && npx playwright install-deps chromium`.

---

## D8 — Do not untrack the committed `.gradle/` cache

**Date:** 2026-10-02

Seven `.gradle/**/*.bin` files were committed before `.gitignore` covered them.
They are build cache, not source. `/.gradle/` is now ignored, so new cache files
stop being added, but the existing seven remain tracked.

**Why not `git rm --cached`:** untracking files is a destructive, history-affecting
change to someone's repository and belongs in its own reviewed commit, not in a
tooling change. Flagged here and in `.gitignore` instead.
---

## D9 — Canvas 2D is the default renderer; WebGL is opt-in via `?3d`

**Date:** 2026-10-02

**Decision:** `web/js/ui.js` selects Canvas 2D unless the URL carries `?3d`.
`render3d.js` is retained and still passes QA, but is no longer the default.

**Why:** the original painted art is flat 2D sprite atlases. Compositing them
in Canvas 2D through `BeastRig` is both simpler and visually faithful; the WebGL
path was reinterpreting the same art as lit geometry. Two renderers meant two
places for art direction to drift. Keeping WebGL reachable means nothing is lost
for anyone who prefers it, and `npm run qa` still exercises both so the opt-in
path cannot silently rot.

**Cost accepted:** the WebGL path loses its "primary" status in the docs and in
the QA narrative. The QA harness asserts *which* renderer actually came up,
because `ui.js` falls back to 2D when WebGL is unavailable and a silent fallback
must never be mistaken for a WebGL pass.

---

## D10 — Imported painted art is credited as UNRESOLVED, not as CC0

**Date:** 2026-10-02

**Decision:** `manifest.credits` carries a separate entry for the imported
Fort Conquer art with `license: "UNRESOLVED — do not redistribute commercially
until cleared"`, naming the two importer scripts and their source trees. The
CC0 procedural entry is rescoped to say it covers only the generated set.

**Why:** the pre-existing CC0 entry asserted "No model weights, no third-party
art." That was true when written and became false the moment the painted
atlases were added. Rolling both provenances into one CC0 line would have been
the easy path and would have quietly misrepresented the licensing position in
the running game's credits line, where an end user actually sees it.

**Not decided:** whether the imported art can be shipped at all. That needs the
original rights holder, and is tracked in `ART_BIBLE.md`.

---

## D11 — Painted scenes live in a separate `scenes` manifest section

**Date:** 2026-10-02

**Decision:** backdrops are registered under `scenes`, not `sprites`, even though
both are images.

**Why:** `verify.mjs` decodes every `sprites` entry and asserts it is a PNG whose
header dimensions match `frameW`/`frameH`. The original backdrops are JPEG, and
the pipeline has no JPEG decoder to measure one with. Rather than weaken the
sprite contract for every future sprite, the painted scenes got their own
section with its own loader path (`AssetStore.scene` / `sceneUrl`).

---

## D12 — `AssetStore.sceneUrl()` exists so URL construction never leaks into the UI

**Date:** 2026-10-02

**Decision:** backdrops are painted in the DOM by setting
`layer.style.backgroundImage` from `assets.sceneUrl(key)`.

**Why:** the loader records intentionally do not carry `file`, so the first
implementation reached `assets.url(s.file)` directly and produced
`assets//undefined` — a 404 that looked like a missing file but was a bug. Two
defects compounded it: `AssetStore`'s base path was built as `'assets//'`
whenever no explicit base was passed, and scene records dropped `file` entirely.
Both are fixed at the source, and `sceneUrl()` is the single accessor so the
same mistake cannot recur in the next screen. See `BUG_MEMORY.md`.
