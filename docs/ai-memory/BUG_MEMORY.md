# Bug Memory

Bugs found, root-caused and fixed. Record the *cause*, not just the symptom —
the next agent needs to know what class of mistake to look for.

---

## B1 — End-of-battle screen never appeared; rewards never granted

**Status:** FIXED (2026-10-02) · **Found by:** `npm run qa`
**File:** `web/js/ui.js`

**Symptom.** Every completed battle threw
`TypeError: Cannot read properties of null (reading 'isVictory')` as a page error.
The victory/defeat modal did not render. Campaign rewards were silently never
added, because `repo.addRewards()` was reached only after the throw.

**Root cause.** An ordering bug between two closures:

```js
function stopLoop() { if (rafId) cancelAnimationFrame(rafId); rafId = null; engine = null; }

function onGameOver() {
  stopLoop();                        // ← nulls `engine`
  const won = engine.isVictory;      // ← reads the null it just created
  const wave = engine.arenaWave;     // …and four more reads
```

`stopLoop()` clears `engine` because the loop and the battle are torn down
together. `onGameOver()` then used `engine` as if it were still alive. Every
subsequent read was equally invalid.

**Fix.** Hoist the reads above `stopLoop()` and keep the values in locals.

**Class of bug to watch for.** Any function that tears down shared state and then
reads it. Grep for `stopLoop();` followed by `engine.` — the same pattern will
bite again wherever teardown ordering is not obvious.

**Regression guard.** `tools/ai-studio/qa/run-qa.mjs` now plays a battle to its
terminal state and asserts the `.overlay` appears with the right heading, then
clicks "Return" and asserts navigation back to the campaign screen. Any page
error fails the suite.

---

## B2 — QA clicked cards that did not exist (harness bug, not a game bug)

**Status:** FIXED (2026-10-02) · **Found by:** `npm run qa` timing out

**Symptom.** Playwright's `locator.click()` retried forever with
`element was detached from the DOM, retrying`.

**Root cause.** `ui.js` rebuilds the whole card bar every ~120 ms from the
animation loop:

```js
if (!engine.isPaused && Math.floor(ts / 120) !== …) buildCardBar();
```

`buildCardBar()` does `bar.innerHTML = ''` and rebuilds, so the node Playwright
resolved is stale before the click lands. This is normal app behaviour that
happens to be hostile to actionability checks — the button genuinely is being
replaced several times a second.

**Fix in the harness.** Dispatch the click in-page (`btn.click()` via
`page.evaluate`) and assert the resulting `.card.on` selection instead of relying
on actionability. The game needs no change.

**Lesson.** "Flaky" against a live-rebuilt DOM usually means the test is
fighting the design, not that the app is broken. Distinguish before patching
product code.

---

## B3 — Lane clicks missing the battlefield

**Status:** FIXED (2026-10-02) · **Found by:** QA reported "deploying may not work"

**Symptom.** Summon clicks produced no units; the enemy fort was never damaged.

**Root cause.** In the test, not the game. `render.js` hit-tests lanes with:

```js
laneAtClientY(y) → floor((y - LANE_START) / LANE_HEIGHT)   // LANE_START=110, LANE_HEIGHT=55
```

over a 450-unit virtual height. Lane *i* is centred at
`(110 + i*55 + 27.5) / 450 = 0.2444 + i*0.1222`. The test clicked at
`0.18 + lane*0.12`, which is half a lane off: the first click resolved to lane
`-1` and was discarded by the `< 0` guard.

**Lesson.** Any browser test that clicks a virtual-space game needs the lane
geometry from `render.js`, not eyeballed fractions.

---

## B4 — QA asserted the player must always take damage

**Status:** FIXED (2026-10-02) · **Found by:** `npm run qa` failing intermittently

**Symptom.** `webgl: no damage to the player fort in 40s — the battle loop looks
stalled`, on some runs but not others, while the same run went on to show
`battle resolved -> "Your fort has fallen"`. The battle was clearly not stalled;
the assertion was wrong.

**Root cause.** The check assumed `playerFort.currentHp < maxHp` was an invariant
for "combat is happening". It is not. The engine is seeded from a deck plus lane
clicks; when those clicks happen to build a defensive line that stops every
enemy, the player's fort legitimately sits at full HP for the whole engagement
and the battle is decided at the enemy fort instead.

**Fix.** Assert on the invariant that actually holds — the *sum* of both forts'
HP must fall:

```js
(Number(player) + Number(enemy)) < totalAtStart
```

That holds no matter who wins the lane war. The end-state wait was also raised
from 60 s to 120 s, because a fully-blocked battle legitimately runs longer.

**Lesson.** A flaky assertion against a stochastic system is usually a wrong
invariant, not a flaky system. Before loosening a timeout, ask what must be true
regardless of RNG.

---

## B5 — `decodePNG` only handled RGBA, so QA crashed on screenshots

**Status:** FIXED (2026-10-02) · **Found by:** `npm run qa` after adding tone analysis

**Symptom.** `Error: unsupported PNG: bitDepth=8 colorType=2` from
`analyseFrame()`, crashing the whole QA run.

**Root cause.** The decoder in `tools/ai-studio/scripts/lib/png.mjs` was written
against this repo's own encoder, which always writes colour type 6 (RGBA).
Playwright writes screenshots as colour type 2 (RGB, no alpha).

**Fix.** Generalised the decoder to accept both and always emit RGBA, so callers
never branch. It still rejects anything else loudly — a verifier that silently
skips a file it could not read is worse than one that fails.

**Lesson.** When a utility is reused by a second consumer, widen it to the union
of both callers' inputs rather than special-casing at the call site.
---

## B6 — `AssetStore` base path was `assets//`, and scene records dropped `file`

**Status:** FIXED (2026-10-02) · **Found by:** `npm run qa` console-error check

**Symptom.** Two `404 (Not Found)` console errors per page load, on both
renderers. The failing URL was `/assets//undefined`.

**Root cause.** Two independent defects that compounded:

1. `AssetStore`'s constructor built `this.base` as
   `(baseUrl || 'assets/') + (baseUrl ? ... : '/')`. With no explicit base this
   evaluated to `'assets/' + '/'` = `'assets//'`. Every asset URL in the game
   carried a doubled slash.
2. The `_loadScenes` record was `{ img, frameW, frameH, cover }` — it did not
   keep `file`. The new screen code reached `assets.url(s.file)` directly and
   got `undefined`.

The 404 said "missing file", which sent the investigation to the manifest. All
48 manifest references existed. The asset pipeline was fine; the code building
the URL was not.

**Fix.** Base is now built by normalising to exactly one separator. Scene records
keep `file`. And `AssetStore.sceneUrl(key)` is the single accessor, so no caller
open-codes `url(spec.file)` against a record shape it does not own.

**Lesson.** A 404 whose path contains `undefined` is a code bug wearing a
missing-file costume. Check the URL *construction* before auditing the manifest.
**Debugging note:** the console-error filter in `run-qa.mjs` drops
`/favicon/i`, but Playwright's resource-failure message carries no URL, so the
filter never fires for it. Trace 404s with `page.on('response')` and print
`r.url()` directly rather than relying on console text.

---

## B7 — `packCard` referenced an `out` that was not in scope

**Status:** FIXED (2026-10-02) · **Found by:** reading the armory rewrite

**Symptom.** Clicking "Open" on a summon pack would throw a `ReferenceError`
before painting the reveal. Latent since the feature was written.

**Root cause.** `packCard` is declared at IIFE scope but referenced `out`, a
`const` declared inside `armory()`. The reference never resolved. Nothing in QA
clicked a pack, so it was never caught.

**Fix.** `out` is now an explicit parameter of `packCard`.

**Lesson.** A closure over a sibling function's local is a compile-time-legal,
runtime-fatal mistake that no static check in this repo would have flagged.
Anything a card-builder needs to mutate must be passed in.

---

## B8 — `drawSprite` double-scaled position and size

**Status:** FIXED (2026-10-02) · **Found by:** reading the call sites against
the coordinate model, not by a test

**Symptom.** Not reproducible in the shipped configuration — the painted rig
path returns before the sprite path is reached, so it was masked. But the
generated-sprite path was doubly broken.

**Root cause.** `drawSprite(spec, x, y, w, h)` multiplied by `scaleX`/`scaleY`
while its callers passed values that were already scaled. `drawUnit` computed
`x = u.position * scaleX` and `y = laneY(...)` (already scaled), then passed
them in. At a 1202x540 canvas a unit at virtual x=300 drew at
`300 * 1.202 * 1.202` and its lane y was scaled by 1.2 twice.

One call site contained the giveaway: `drawFort` passed
`(LANE_START + 2.5 * LANE_HEIGHT) * this.scaleY / this.scaleY` — multiplying then
dividing by the same factor, a no-op that only existed to look plausible.

**Fix.** `sx()`/`sy()` are now the only virtual→screen conversion.
`drawSprite()` takes virtual coordinates; `drawSpriteGrounded()` additionally
pins the sprite's bottom edge to a ground line.

**Lesson.** A masked bug is still a bug. The rig path hid it, which means no
test would ever have found it — it was found by reading the arithmetic at every
call site and asking what the number physically means.

---

## B9 — Health bars were positioned from the wrong quantity

**Status:** FIXED (2026-10-02) · **Found by:** measuring bar vs head position

**Symptom.** Bars sat inside the beasts' bodies, and moved inconsistently
relative to unit size.

**Root cause.** `drawUnitBars(u, x, y, r, bob)` derived the bar's y from `r`,
a constant tied to the *procedural silhouette* path (`r = 15 * scaleY`). The
painted beasts drew at a completely different height (~40-50 virtual units), so
the bar landed about 20 units below their heads. The bar's width was a fixed
`26 * scaleX` regardless of the creature.

**Fix.** `drawUnitBars` takes the unit's actual drawn `drawW`/`drawH`, centres
on it, and hangs the bar `UNIT_BAR_GAP` above the real head top.

**Lesson.** If a UI element is positioned relative to something, it must be
positioned relative to the thing that is actually drawn — not to a constant that
describes a different rendering path.

---

## B10 — Damaged fortresses rendered *larger* than intact ones

**Status:** FIXED (2026-10-02) · **Found by:** reading the fort frames'

**Symptom.** The ruined enemy castle looked bigger and fatter than the intact
one, inverting the intended damage read.

**Root cause.** Each damage frame was scaled to a common target height
(`k = targetH / rh`). The frames are not the same size: `castle_2_3` is 291px
tall where `castle_2_2` is 480px. Equalising heights therefore scaled the ruin
up by 480/291 = 1.65x.

Measured by `measure-atlas-bounds.mjs`: every fort frame is 100% opaque (no
transparent padding), so padding was not the cause — the differing frame
heights were.

**Fix.** One scale per side, from the tallest frame, reused for all states, each
anchored at its base line.

**Lesson.** Normalising every frame of an animation to the same output size
assumes the frames were authored at the same size. Check the source dimensions
before normalising.

---

## B11 — Lane boundaries were invisible

**Status:** FIXED (2026-10-02) · **Found by:** measuring the rendered canvas

**Symptom.** Five lanes were present in the maths but unreadable on screen.

**Root cause.** `drawLanes` filled alternating translucent rectangles with 1px
`rgba(255,255,255,0.07)` strokes. Measured luminance step across each boundary:
**±3 out of 255** — effectively zero.

**Fix.** A playfield plate plus alternating fill plus an engraved groove (dark
0.52) with a warm upper lip (0.17). Measured edge strength is now 35-52 and the
closest adjacent-lane mean difference is 9.4.

**Measurement trap worth remembering:** the first boundary metric averaged
luminance in a ±3px window either side of the boundary and reported ~0 for
boundaries that were plainly visible. It was cancelling the dark groove against
the bright lip. The correct metric is the largest step between *adjacent rows*
near the boundary. A metric that disagrees with what the numbers obviously say
is usually the metric's fault — check it before "fixing" the renderer.

---

## B12 — `battle-config.js` top-level consts collided in global script scope

**Status:** FIXED (2026-10-02) · **Found by:** `PAGEERROR Identifier
'LANE_START' has already been declared`

**Symptom.** The entire battle renderer failed to load. Blank canvas, no further
errors, because `render.js` aborted mid-parse.

**Root cause.** Classic `<script>` tags share **one** global lexical scope. Two
files both declaring top-level `const LANE_START` is a redeclaration error, and
the second file never executes.

**Fix.** `battle-config.js` is IIFE-wrapped and exposes only
`globalThis.BeastForgeBattle` (plus `module.exports` from inside the IIFE, where
the constant is actually in scope).

**Lesson.** In a classic-script codebase, no file may declare top-level
`const`/`let` that another file might also declare. Wrap shared-constant
modules, or prefix them.
