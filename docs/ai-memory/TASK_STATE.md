# Task State

Live status for the Beast Forge AI Studio work. Written for whoever picks this
up next — including an agent with no context.

**Last updated:** 2026-10-02

## Current status: work complete and validated

All scope from the 2026-10-02 request ("fix the caveats, improve the graphics")
is implemented, verified, and pushed. Nothing is mid-edit.

## What was delivered

### 1. Fixes for the reported caveats

| Caveat reported | Resolution |
| --- | --- |
| Generation not reproducible | Seeded PRNG; two full runs produce byte-identical output for all 31 files |
| Re-running clobbered hand-tuned assets | Promotion is idempotent — byte-identical files are accepted silently, only *changed* files need `--force` |
| No verification of the assets themselves | `verify` decodes every PNG/WAV, checks real dimensions, and now proves textures tile seamlessly |
| QA could pass on a black screen | Added frame luma + backdrop checks so an all-black render fails loudly |
| QA could pass on a stalled battle | Asserts the *sum* of both forts' HP falls, which holds regardless of who wins |
| Games could break when assets 404 | QA now runs both renderers with **all** assets blocked |
| Android build unverified | **Still unverified — and now provably not fixable here** (see below) |
| WebGL reused Canvas 2D sprites | Resolved properly: WebGL gets its own manifest backgrounds + tiling detail maps |

### 2. Graphics improvements

Three new seamless tiling textures (`tex_fur`, `tex_scale`, `tex_stone`) and
backgrounds for every scene, wired into `render3d.js` via the manifest.

Detail maps are assigned to `roughnessMap` and `bumpMap` — deliberately **not**
`map`. Assigning them to `map` would have multiplied the base colour and made
elements look wrong. See D6 in `DECISIONS.md`.

## Validation status

| Check | Command | Result |
| --- | --- | --- |
| Asset contract + battle sim | `npm run verify` | **VERIFY OK** — 10 sprites, 18 clips, 3 fonts, 3 seamless textures, 767.2 KiB |
| Browser QA | `npm run qa` | **QA OK** — WebGL/SwiftShader, Canvas 2D, and both-assets-blocked |
| Determinism | 2× `npm run generate` | byte-identical |
| Environment | `npm run doctor` | 7/19 READY; all non-READY items are optional AI engines |
| Android build | `./gradlew assembleDebug` | **NOT RUN — blocked, see below** |

## Open blocker: Android build cannot be verified here

Do not read this as "nobody checked". It was investigated on 2026-10-02:

- JDK 17 installs fine via apt, and Gradle 8.13 runs.
- But `curl` fails against `dl.google.com` with `self-signed certificate in
  certificate chain`. Node succeeds because it uses its own bundled CA roots.
- The system CA bundle — which the **JVM** uses — does not contain the
  intercepting proxy's CA. So `sdkmanager` cannot fetch
  `platforms;android-36` or `build-tools;36.0.0`.
- Gradle's own dependency resolution against Maven for AndroidX/Compose would
  fail for the same reason.

**This is an environment provisioning problem, not a repo problem.** The fix is to
add the proxy CA to `/etc/ssl/certs/java/cacerts`.

Two further facts worth knowing:

- **No `gradlew` exists** in the repo — only `gradle/libs.versions.toml`. The
  build needs a system Gradle of a matching version, and the root `README.md`
  documents no build command at all (it is feature copy for the Android app, with
  no build/run instructions). So the Android app is currently not reproducible
  outside a machine that happens to have the right Gradle. Adding a wrapper plus a
  real build section would be a genuine improvement, but both are decisions for
  the repo owner rather than tooling fixes, so they are flagged rather than done.
- Nothing in this session's changes touches `app/`. The Android sources are
  exactly as they were, so there is no *new* Android risk — only the pre-existing
  unverified state.

## Suggested next steps

1. **Add the Gradle wrapper.** Currently the Android app is not reproducible
   outside one machine. `gradle wrapper --gradle-version 8.13` plus committing
   `gradle-wrapper.jar` would fix it, and would let CI build the app.
2. **Provision the proxy CA into the JVM truststore** in any environment that must
   build the Android app, then run a real `assembleDebug` and a Compose UI test.
3. **Rotate the GitHub token embedded in the remote URL.** The origin is
   `https://<token>@github.com/dummyac76y-cyber/beast-forge.git`. Anyone with read
   access to this clone has the token. Set the remote to a clean URL and revoke
   the old token.
4. **Optional graphics work.** Real AI-generated art needs a GPU or a hosted
   generator; neither is available here. The pipeline is ready — `spec.mjs` is the
   single place to add or replace assets.

## Conventions to follow when extending

- Never hand-edit files in `web/assets/`. They are generated and
  `npm run verify` will reject drift from the spec.
- Add new assets to `spec.mjs` first; `manifest.json` and the registry docs are
  regenerated from it.
- Any browser test that clicks the game must derive lane geometry from
  `render.js` (see B3 in `BUG_MEMORY.md`).
- Assertion on a stochastic battle: assert on the sum of both forts' HP, never on
  one side taking damage (see B4).
