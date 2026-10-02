// Shared manifest merge used by every asset producer in the AI Studio.
//
// The manifest is the single wiring point between art and code, and it is
// edited in place by several independent scripts (procedural generation and the
// original-art importers). Merging rather than rewriting matters: the manifest
// also carries hand-written documentation and third-party font credits that are
// not ours to drop.
import fs from 'node:fs';
import path from 'node:path';
import { readPNGHeader } from './png.mjs';

const isPng = (buf) => buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50;

/**
 * Merge `entries` into manifest[section], refusing to repoint an existing key
 * at a different file unless `force`. Repointing is how art silently changes
 * under a key that code already looks up, so it needs to be deliberate.
 */
export function updateManifest(repo, section, entries, { force = false } = {}) {
  const manifestPath = path.join(repo, 'web/assets/manifest.json');
  const manifest = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    : {};

  const prev = manifest[section] || {};
  for (const [key, entry] of Object.entries(entries)) {
    if (prev[key] && prev[key].file !== entry.file && !force) {
      throw new Error(`manifest.${section}.${key} already points at ${prev[key].file}; `
        + `refusing to repoint it at ${entry.file} (pass --force if intentional)`);
    }
  }

  manifest[section] = { ...prev, ...entries };
  manifest.generatedBy = manifest.generatedBy
    ? manifest.generatedBy + ', tools/ai-studio/scripts/import-*-art.mjs'
    : 'tools/ai-studio/scripts/import-*-art.mjs';

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  return manifest[section];
}

/**
 * Build a manifest entry for an image file, reading real dimensions from the
 * file itself. PNGs are measured from the IHDR; JPEGs cannot be measured
 * without a decoder, so those dims are asserted by the caller instead.
 */
export function imageEntry(repo, rel, { dims } = {}) {
  const buf = fs.readFileSync(path.join(repo, 'web/assets', rel));
  if (isPng(buf)) {
    const h = readPNGHeader(buf);
    if (!h) throw new Error(`${rel} has a PNG signature but no readable IHDR`);
    return { file: rel, frameW: h.width, frameH: h.height };
  }
  if (!dims) throw new Error(`${rel} is not a PNG, so its dimensions must be declared`);
  return { file: rel, frameW: dims[0], frameH: dims[1] };
}
