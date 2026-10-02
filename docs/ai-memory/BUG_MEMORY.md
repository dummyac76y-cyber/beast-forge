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