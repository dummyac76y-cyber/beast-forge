# Task State

## Done — 2026-10-02: first AI Studio asset pass

Shipped to `main`:

- `tools/ai-studio/` — asset generator, `doctor`, `verify`, Playwright QA, and a
  zero-dependency static server
- `web/assets/` — 10 sprites + 18 audio cues + merged manifest (≈689 KiB)
- `web/js/ui.js` — fixed the `onGameOver` null dereference ([BUG_MEMORY B1](BUG_MEMORY.md))
- `.gitignore` — model weights, caches, env files, node_modules
- `package.json` — dev-only Playwright plus `doctor` / `verify` / `qa` / `check` scripts
- `docs/ai-memory/` — this directory

### Verified (actually executed, not assumed)

| Check | Result |
|---|---|
| `npm run verify` | PASS — 10 sprite keys + 18 audio keys match the game source; all files decode; stage 1 VICTORY, stage 6 DEFEAT, arena VICTORY |
| `npm run qa` (WebGL via SwiftShader) | PASS — 18 checks |
| `npm run qa` (Canvas 2D, `?2d`) | PASS — 19 checks, incl. 994 manifest sprite draws |
| `npm run qa` (assets blocked) | PASS — game boots and plays with 0 sprites |
| `npm run doctor` | 4/18 READY; every AI engine correctly reported NOT INSTALLED |

### Explicitly NOT verified

- **The Android build.** No JDK and no Android SDK in this environment. Nothing
  about `app/` was compiled or run.
- **Any AI provider.** ComfyUI, ACE-Step, Kokoro, Piper and Mem0 are absent. No
  art or audio was model-generated.
- **Long-session stability.** QA plays one stage per renderer, not a full 12-stage
  campaign run.
- **Mobile/touch input.** QA drives mouse and keyboard only.

## Next, in priority order

1. **Wire the manifest into `render3d.js`.** The default WebGL renderer ignores
   every sprite; today the generated art only shows on `?2d`. This is the single
   highest-value follow-up. See [DECISIONS D6](DECISIONS.md).
2. **Add a real AI art provider** behind the existing manifest contract, behind
   the same optional/staged/promote gating. No game changes needed.
3. **Port assets to Android.** Copy the PNG/WAV files into
   `app/src/main/assets/gfx/`, add an equivalent manifest lookup to the Android
   asset loader.
4. **`docs/ai-memory` coverage.** `GAME_BIBLE.md`, `ART_BIBLE.md`,
   `AUDIO_BIBLE.md` and `TECHNICAL_MEMORY.md` are absent because there is no
   settled content yet. Write them when art/audio/gameplay direction actually
   gets decided.
5. **Untrack the committed `.gradle/` cache** — 7 `.bin` files, in its own
   reviewed commit. See [DECISIONS D8](DECISIONS.md).
6. **Repository hygiene (needs the repo owner, not an agent):** the `origin` remote
   URL embeds a GitHub access token in plaintext. `npm init -y` copied it into a
   `package.json` during this session and it was removed before committing, but
   the remote URL itself should be rotated and moved to a credential helper or
   SSH. See the note at the end of `MASTER_MEMORY.md`.

## Blocked

Nothing is blocked. Items 1–3 need decisions that are the owner's to make
(renderer architecture, model downloads, Android scope).