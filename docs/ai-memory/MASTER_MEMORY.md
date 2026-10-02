# Master Memory — Beast Forge

Durable project knowledge for AI agents and humans. **The repository source code
is authoritative.** If anything here contradicts the code, the code is right and
this file is stale — fix this file.

Authority order (highest first):

1. Current repository state
2. Current configuration (`web/assets/manifest.json`, `kilo.json`, `vercel.json`)
3. Human-readable documentation (`README.md`, `web/README.md`, this directory)
4. This memory
5. Previous conversation context

## Index

| File | Holds |
|---|---|
| [CODE_ARCHITECTURE.md](CODE_ARCHITECTURE.md) | How the web port is wired; renderer split; asset pipeline |
| [ASSET_REGISTRY.md](ASSET_REGISTRY.md) | Every asset, its key, its producer, its license |
| [DECISIONS.md](DECISIONS.md) | Decisions taken, with rationale |
| [BUG_MEMORY.md](BUG_MEMORY.md) | Bugs found, root causes, fixes |
| [TASK_STATE.md](TASK_STATE.md) | What is done, what is next |

Not yet created, because there is no settled content yet: `GAME_BIBLE.md`,
`ART_BIBLE.md`, `AUDIO_BIBLE.md`, `TECHNICAL_MEMORY.md`, `CHANGELOG.md`. Create a
file when there is durable knowledge worth keeping, not preemptively.

## Environment as verified (2026-10-02)

Measured with `npm run doctor`, not assumed:

- Ubuntu 22.04.5, Linux 6.18 microvm
- Node v22.23.2, npm 10.9.8, Python 3.10.12
- **No GPU** (no NVIDIA, no ROCm), 4 cores, ~11.9 GiB RAM, ~17 GiB free disk
- ComfyUI, ACE-Step, Kokoro, Piper, Mem0: none installed
- Playwright + Chromium: installed and working
- npm registry reachable

### Android toolchain: partially installed, build blocked by a 403 proxy

`doctor` reports no JDK and no Android SDK, so the Kotlin app cannot be built
here out of the box. Chased down on 2026-10-02; **the Android build still does
not complete**, for one specific reason:

**Working now:**
- `openjdk-17-jdk-headless` installed via apt.
- Gradle 8.13 runs (fetched via Node, see below).
- `sdkmanager` installed `platforms;android-36` and `build-tools;36.0.0`.

**The actual blocker — Maven Central is blocked by the proxy:**

```
> Could not GET 'https://repo.maven.apache.org/maven2/org/slf4j/slf4j-api/1.7.30/slf4j-api-1.7.30.pom'.
  Received status code 403 from server: Forbidden
```

AGP's own artifacts resolve fine from Google's Maven
(`dl.google.com/dl/android/maven2` returns 200), but AGP's third-party
transitive dependencies — `slf4j-api`, `jdom2`, `javawriter`, `jsr305` and ~26
more — only exist on Maven Central, which returns **403 for every request**
through this environment's proxy. `plugins.gradle.org/m2` is blocked the same
way. So the build fails at dependency resolution, before compiling a line of
Kotlin. This is an environment network policy, not something the repo can fix.

### TLS: the environment's CA is in a non-standard place

This tripped up the first attempt and is worth recording, because the fix is not
obvious:

- `curl` and `git` fail with `server certificate verification failed` /
  `self-signed certificate in certificate chain`, because the intercepting
  proxy's CA is absent from `/etc/ssl/certs/ca-certificates.crt`.
- The CA is present, but only at the path in **`NODE_EXTRA_CA_CERTS`**
  (`/etc/cloudflare/certs/cloudflare-containers-ca.crt`). Node honours that
  variable, which is why Node and npm work while curl and git do not.
- To make git work: concatenate that CA with Node's bundled roots and pass it as
  `GIT_SSL_CAINFO=/tmp/full-ca.pem`.
- To make the JVM work: import it into a copy of the JDK truststore with
  `keytool -importcert -keystore /tmp/ts.jks` and pass
  `-Djavax.net.ssl.trustStore=/tmp/ts.jks`. That is what let `sdkmanager`
  install the platform packages.

Fixing TLS is necessary but **not sufficient** — Maven Central remains 403.

## Golden rules for agents

1. Inspect before modifying. `npm run doctor` and `npm run verify` first.
2. The AI Studio in `tools/ai-studio/` is optional. The game must run without it.
3. Never overwrite an existing game asset. Generate to staging, promote
   deliberately; `--force` is a decision, not a default.
4. Never claim a component works without running it. This memory records what was
   *verified*, and says so when something was not.
5. Never commit model weights, `.env`, or tokens. `.gitignore` covers the common
   patterns; check `git status` before committing.
6. Keep `web/assets/manifest.json` honest. `npm run verify` re-derives the
   contract from the game source and will fail if it drifts.

## Security note — needs the repository owner

The `origin` remote URL embeds a GitHub access token in plaintext:

```
https://x-access-token:<TOKEN>@github.com/dummyac76y-cyber/beast-forge.git
```

Any command that reads the remote and writes a config file can copy that token
into a tracked file. It **did** happen during this session: `npm init -y` copied
it into `package.json`, which was rewritten before anything was committed, and
the repo is verified clean of the token.

The token is nonetheless exposed wherever that URL has been logged, echoed or
shared. Recommended fix, which needs a human:

1. Revoke the token in GitHub and issue a new one.
2. Replace the remote URL with a credential helper or an SSH remote:
   `git remote set-url origin git@github.com:dummyac76y-cyber/beast-forge.git`
3. Audit history for the token: `git log -p -S 'x-access-token' --all`

Agents must not attempt any of these. Rotate the token out of band.