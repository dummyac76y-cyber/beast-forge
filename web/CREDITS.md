# Credits & Licenses

This file records the origin and license of every third-party asset bundled in
`web/`. Keep it accurate — if you add art or audio, add a row.

## Bundled

| Asset | Author | License | File |
|---|---|---|---|
| Cinzel (Regular, SemiBold, Bold) | The Cinzel Project Authors — [github.com/NDISCOVER/Cinzel](https://github.com/NDISCOVER/Cinzel) | SIL Open Font License 1.1 | `assets/fonts/cinzel-latin-*.woff2` |

Full license text: [`assets/fonts/OFL.txt`](assets/fonts/OFL.txt).

The OFL requires the reserved font names not be reused for modified versions
and that the license travel with the font. Both hold here — the font files are
unmodified, and `OFL.txt` sits beside them.

## Not bundled — procedural instead

Everything else you see in the game is generated at runtime by the code in
`web/js/`. No third-party art or audio is redistributed.

- **All unit, fort, projectile, particle and background art** — drawn
  procedurally with Canvas 2D vector operations in `js/render.js`.
- **All sound effects** — synthesised with Web Audio oscillators in
  `js/audio.js`. (The original Android `SoundManager.kt` loads 19 clips from
  `assets/mfx/*.ogg`, but that directory does not exist in the project, so the
  Android build runs silent. See `web/README.md`.)
- **Beast roster, stage data, economy balance** — authored for this project in
  `js/catalog.js`.

## Adding your own

`assets/manifest.json` documents the schema inline. Three rules:

1. **Only add files you have the right to redistribute.** CC0, CC-BY and
   permissive OFL assets are all fine. Don't copy assets out of a commercial
   game, and don't strip license or copyright notices from a font or texture —
   that's infringement, not attribution.
2. **Add a row to the table above** with author, license and file path.
3. **Ship the license text** alongside the asset if it isn't a standard license
   name — e.g. `assets/fonts/OFL.txt`.

The game works with no asset files at all: delete `manifest.json` and every
sprite, sound and font lookup falls back to the procedural version.