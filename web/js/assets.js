// Manifest-driven asset loader.
//
// Design contract: the game MUST run identically with zero asset files present.
// Everything here is optional. If assets/manifest.json is missing, malformed, or
// every entry 404s, each lookup returns null and the caller falls back to the
// built-in procedural rendering / synthesised audio. Nothing throws.
//
// Layout:   assets/manifest.json
//           assets/<file>            (paths in the manifest are relative to assets/)
//
// Manifest schema (every key optional):
//
//   {
//     "version": 1,
//     "sprites": {
//       "unit_biped":      { "file": "sprites/units/biped.png",
//                            "frameW": 96, "frameH": 96,
//                            "anchorX": 0.5, "anchorY": 0.72,   // fraction of frame
//                            "flipOnEnemy": true },
//       "fort_player":     { "file": "sprites/fort.png" },
//       "bg_volcano":      { "file": "sprites/bg_volcano.jpg", "cover": true }
//     },
//     "audio": {
//       "fire": { "file": "audio/fire.ogg", "volume": 0.7 }
//     },
//     "fonts": [
//       { "family": "Cinzel", "file": "fonts/cinzel-latin-600-normal.woff2", "weight": 600 }
//     ]
//   }
'use strict';

// Naming convention the renderer uses to look sprites up. Kept here as data so
// render.js never has to share a global binding (const/var across classic
// scripts is a redeclaration SyntaxError).
//
//   unit_<race lowercased>   e.g. unit_biped, unit_dragon
//   fort_player | fort_enemy
//   bg_<themekey>            e.g. bg_volcano
const SPRITE_KEYS = {
  unit: race => 'unit_' + String(race).toLowerCase(),   // unit_biped / unit_quadruped / unit_dragon
  fort: side => 'fort_' + side,                          // fort_player / fort_enemy
  bg:   theme => 'bg_' + theme                           // bg_forest / bg_volcano ...
};

const DEFAULT_MANIFEST_PATH = 'assets/manifest.json';

class AssetStore {
  constructor(baseUrl) {
    this.base = (baseUrl || 'assets/') + (baseUrl && baseUrl.slice(-1) === '/' ? '' : '/');
    this.manifest = null;
    this.sprites = {};      // key -> { img, frameW, frameH, anchorX, anchorY, flipOnEnemy, cover }
    this.audio = {};        // key -> { buffer, volume }
    this._rawAudio = {};    // key -> { bytes, volume }; decoded lazily after a gesture
    this.fonts = [];        // { family, weight }
    this.sources = [];      // human-readable attribution, surfaced in the UI
    this.loaded = false;
    this.failed = false;
    this.stats = { spriteHits: 0, spriteMisses: 0, audioHits: 0, audioMisses: 0, fontsLoaded: 0, errors: [] };
  }

  url(rel) {
    // Normalise "sprites/x.png" and "/sprites/x.png" identically.
    return this.base + String(rel).replace(/^\/+/, '');
  }

  // Never rejects. Always resolves, with `this` populated as far as possible.
  load(manifestPath) {
    const path = manifestPath || DEFAULT_MANIFEST_PATH;
    // Guard the fetch itself: no fetch (very old browser, or a locked-down
    // context) must degrade to procedural assets, not kill boot.
    if (typeof fetch !== 'function') {
      this.failed = true;
      this.loaded = true;
      this.stats.errors.push('fetch unavailable');
      return Promise.resolve(this);
    }
    let req;
    try {
      req = fetch(path, { cache: 'no-cache' });
    } catch (e) {
      this.failed = true;
      this.loaded = true;
      this.stats.errors.push(String(e && e.message || e));
      return Promise.resolve(this);
    }
    return req
      .then(r => {
        if (!r.ok) throw new Error('manifest HTTP ' + r.status);
        return r.json();
      })
      .then(m => {
        this.manifest = m;
        // Attribution travels with the manifest so the UI can surface it.
        if (Array.isArray(m.credits)) m.credits.forEach(c => this.credit(c));
        return Promise.all([
          this._loadSprites(m.sprites),
          this._loadAudio(m.audio),
          this._loadFonts(m.fonts)
        ]);
      })
      .catch(e => {
        // No manifest is the normal case. Not an error.
        this.failed = true;
        this.stats.errors.push(String(e && e.message || e));
      })
      .then(() => { this.loaded = true; return this; });
  }

  _loadSprites(map) {
    if (!map) return Promise.resolve();
    const jobs = Object.keys(map).map(key => {
      const spec = map[key] || {};
      if (!spec.file) return Promise.resolve();
      return new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
          this.sprites[key] = {
            img,
            frameW: spec.frameW || img.naturalWidth || 0,
            frameH: spec.frameH || img.naturalHeight || 0,
            anchorX: spec.anchorX !== undefined ? spec.anchorX : 0.5,
            anchorY: spec.anchorY !== undefined ? spec.anchorY : 0.5,
            flipOnEnemy: spec.flipOnEnemy !== false,
            cover: !!spec.cover
          };
          resolve();
        };
        img.onerror = () => { this.stats.errors.push('sprite ' + key + ': ' + spec.file); resolve(); };
        img.src = this.url(spec.file);
      });
    });
    return Promise.all(jobs);
  }

  _loadAudio(map) {
    if (!map) return Promise.resolve();
    // Deliberately no AudioContext here. Constructing one during page load
    // (before any user gesture) makes Chrome log "The AudioContext was not
    // allowed to start", and the context starts suspended anyway. We only
    // pull the raw bytes now; decodeAudioData runs later from unlock().
    const keys = Object.keys(map);
    if (!keys.length) return Promise.resolve();
    const jobs = keys.map(key => this._fetchAudio(key, map[key]).then(() => key));
    return Promise.all(jobs);
  }

  _fetchAudio(key, spec) {
    if (!spec || !spec.file) return Promise.resolve();
    return fetch(this.url(spec.file))
      .then(r => r.ok ? r.arrayBuffer() : Promise.reject(new Error('HTTP ' + r.status)))
      .then(bytes => {
        this._rawAudio[key] = { bytes, volume: spec.volume !== undefined ? spec.volume : 0.8 };
      })
      .catch(() => { this.stats.errors.push('audio ' + key + ': ' + spec.file); });
  }

  /**
   * Decode any fetched-but-undecoded clips using an already-unlocked context.
   * Called from AudioMan.unlock(), i.e. after a real user gesture, so the
   * context is allowed to run. Safe to call repeatedly; idempotent.
   */
  decodePending(ctx) {
    if (!ctx || typeof ctx.decodeAudioData !== 'function') return;
    const keys = Object.keys(this._rawAudio);
    for (const key of keys) {
      const entry = this._rawAudio[key];
      if (!entry || entry.pending || this.audio[key]) continue;
      entry.pending = true;
      new Promise((res, rej) => {
        const p = ctx.decodeAudioData(entry.bytes, res, rej);
        if (p && p.then) p.then(res, rej);   // older Safari callback-only form
      })
        .then(audio => { this.audio[key] = { buffer: audio, volume: entry.volume }; })
        .catch(() => { this.stats.errors.push('audio decode ' + key); });
    }
  }

  _loadFonts(list) {
    if (!list || !list.length) return Promise.resolve();
    const jobs = list.filter(f => f && f.file && f.family).map(f => {
      const src = this.url(f.file);
      const desc = [this.base, src];
      // FontFace is the reliable way to preload + inject without a stylesheet.
      if (typeof FontFace === 'function') {
        const ff = new FontFace(f.family, 'url(' + src + ')', { weight: f.weight || '400' });
        return ff.load()
          .then(loaded => {
            (document.fonts || {}).add ? document.fonts.add(loaded) : null;
            this.fonts.push({ family: f.family, weight: f.weight || '400', file: f.file });
            this.stats.fontsLoaded++;
          })
          .catch(() => { this.stats.errors.push('font ' + f.family + ': ' + f.file); });
      }
      // Fallback: plain @font-face injection.
      return this._injectFontFace(f, src).then(() => {
        this.fonts.push({ family: f.family, weight: f.weight || '400', file: f.file });
        this.stats.fontsLoaded++;
      });
    });
    return Promise.all(jobs);
  }

  _injectFontFace(f, src) {
    const css = '@font-face{font-family:"' + f.family + '";font-style:normal;' +
                'font-weight:' + (f.weight || 400) + ';font-display:swap;' +
                'src:url("' + src + '") format("woff2");}';
    const style = document.createElement('style');
    style.setAttribute('data-asset-font', f.family);
    style.textContent = css;
    document.head.appendChild(style);
    return Promise.resolve();
  }

  /** Register attribution so the UI can show a credits line. */
  credit(entry) {
    if (!entry || !entry.name) return;
    const key = entry.name + '|' + (entry.license || '');
    if (!this.sources.some(s => (s.name + '|' + (s.license || '')) === key)) {
      this.sources.push(entry);
    }
  }

  // ---- lookups used by the renderer / audio ----
  sprite(kind, arg) {
    const key = typeof kind === 'function' ? kind(arg) : kind;
    const s = this.sprites[key];
    if (s) this.stats.spriteHits++;
    else this.stats.spriteMisses++;
    return s || null;
  }

  audioClip(key) {
    const a = this.audio[key];
    if (a) this.stats.audioHits++;
    else this.stats.audioMisses++;
    return a || null;
  }

  hasAnySprites() { return Object.keys(this.sprites).length > 0; }
  hasAnyAudio()   { return Object.keys(this.audio).length > 0; }
  hasFonts()      { return this.fonts.length > 0; }

  /** Short human summary for the debug overlay / console. */
  summary() {
    return (this.loaded ? 'loaded' : 'pending') +
      ' sprites=' + Object.keys(this.sprites).length +
      ' audio=' + Object.keys(this.audio).length +
      ' fonts=' + this.fonts.length +
      (this.stats.errors.length ? ' errors=' + this.stats.errors.length : '');
  }
}

// Shared instance for the app; tests construct their own.
if (typeof module !== 'undefined') {
  module.exports = { AssetStore, SPRITE_KEYS, DEFAULT_MANIFEST_PATH };
}
if (typeof globalThis !== 'undefined' && !globalThis.__beastForgeAssets) {
  globalThis.__beastForgeAssets = new AssetStore();
}