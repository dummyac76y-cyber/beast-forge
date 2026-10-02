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

## D6 — Leave `render3d.js` alone

**Date:** 2026-10-02

`render3d.js` never reads the manifest, so generated sprites are invisible on the
default WebGL path. Wiring textures into the 3D meshes would fix that, but it is
a renderer change — architecture-level work the skill says to ask about first,
and not something to smuggle into an asset commit.

**Instead:** documented in README, `CODE_ARCHITECTURE.md` and `ASSET_REGISTRY.md`,
and the QA suite *reports* the sprite-draw count per renderer rather than
asserting art everywhere, so the gap is visible instead of hidden.

Note the game prefers WebGL and silently falls back to Canvas 2D when WebGL is
unavailable, so the art path is reachable for real users too.

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