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
//     "textures": {
//       "tex_stone": { "file": "textures/stone.png", "repeat": 3 }
//     },
//     "fonts": [
//       { "family": "Cinzel", "file": "fonts/cinzel-latin-600-normal.woff2", "weight": 600 }
//     ]
//   }
//
// The "textures" section is for seamless tiling maps consumed by the WebGL
// renderer (render3d.js). Those are different from sprites on purpose: the 3D
// renderer builds geometry from primitives and wants tileable surface detail,
// not character art. Every section is optional and independently degradable.
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
    // Exactly one separator, whichever form the caller passes. The previous
    // version appended '/' to a default that already ended in '/', which made
    // every URL "assets//x" -- harmless-looking, but it produced 404s that
    // looked like missing files when a caller passed an undefined path.
    const raw = baseUrl || 'assets/';
    this.base = raw.slice(-1) === '/' ? raw : raw + '/';
    this.manifest = null;
    this.sprites = {};      // key -> { img, frameW, frameH, anchorX, anchorY, flipOnEnemy, cover }
    this.scenes = {};       // key -> { img, frameW, frameH, cover }; painted backdrops (may be JPEG)
    this.beasts = {};       // key -> { img, parts }; painted part atlases + frame rects
    this.forts = {};        // key -> { img, frames }; fortress atlas + damage-state rects
    this.audio = {};        // key -> { buffer, volume }
    this._rawAudio = {};    // key -> { bytes, volume }; decoded lazily after a gesture
    this.textures = {};     // key -> { img, repeat }; tiling maps for the WebGL renderer
    this.fonts = [];        // { family, weight }
    this.sources = [];      // human-readable attribution, surfaced in the UI
    this.loaded = false;
    this.failed = false;
    this.stats = { spriteHits: 0, spriteMisses: 0, sceneHits: 0, sceneMisses: 0, beastHits: 0, beastMisses: 0, audioHits: 0, audioMisses: 0, textureHits: 0, textureMisses: 0, fontsLoaded: 0, errors: [] };
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
          this._loadScenes(m.scenes),
          this._loadBeasts(m.beasts, m.forts),
          this._loadAudio(m.audio),
          this._loadTextures(m.textures),
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

  // Painted backdrops. Kept apart from `sprites` because they are JPEG: the
  // verifier checks sprite dimensions against a PNG header, and there is no
  // JPEG decoder in the asset pipeline to measure one with.
  _loadScenes(map) {
    if (!map) return Promise.resolve();
    return Promise.all(Object.keys(map).map(key => {
      const spec = map[key] || {};
      if (!spec.file) return Promise.resolve();
      return new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
          this.scenes[key] = {
            img,
            // Kept so sceneUrl() can rebuild the URL for CSS layer painting;
            // without it a backdrop loads fine and then 404s when the DOM
            // tries to reference it.
            file: spec.file,
            frameW: spec.frameW || img.naturalWidth || 0,
            frameH: spec.frameH || img.naturalHeight || 0,
            cover: spec.cover !== false
          };
          resolve();
        };
        img.onerror = () => { this.stats.errors.push('scene ' + key + ': ' + spec.file); resolve(); };
        img.src = this.url(spec.file);
      });
    }));
  }

  // Painted part atlases (beasts) and the fortress atlas. Each carries a JSON
  // sidecar of frame rects; both are optional, so a half-loaded atlas simply
  // falls back to procedural art rather than drawing garbage.
  _loadBeasts(beastMap, fortMap) {
    const jobs = [];
    const loadAtlas = (key, spec, bucket, sidecarKey) => {
      if (!spec || !spec.file) return Promise.resolve();
      const rects = spec[sidecarKey]
        ? fetch(this.url(spec[sidecarKey]), { cache: 'no-cache' })
          .then(r => (r.ok ? r.json() : null))
          .catch(() => null)
        : Promise.resolve(null);
      jobs.push(rects.then(meta => new Promise(resolve => {
        const img = new Image();
        img.onload = () => { this[bucket][key] = { img, meta }; resolve(); };
        img.onerror = () => { this.stats.errors.push(bucket + ' ' + key + ': ' + spec.file); resolve(); };
        img.src = this.url(spec.file);
      })));
    };
    for (const [key, spec] of Object.entries(beastMap || {})) loadAtlas(key, spec, 'beasts', 'parts');
    for (const [key, spec] of Object.entries(fortMap || {})) loadAtlas(key, spec, 'forts', 'frames');
    return Promise.all(jobs);
  }

  _loadTextures(map) {
    if (!map) return Promise.resolve();
    const jobs = Object.keys(map).map(key => {
      const spec = map[key] || {};
      if (!spec.file) return Promise.resolve();
      return new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
          this.textures[key] = { img, repeat: spec.repeat || 1 };
          resolve();
        };
        img.onerror = () => { this.stats.errors.push('texture ' + key + ': ' + spec.file); resolve(); };
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

  /** Tiling map for the WebGL renderer, or null -> caller keeps its own. */
  texture(key) {
    const t = this.textures[key];
    if (t) this.stats.textureHits++;
    else this.stats.textureMisses++;
    return t || null;
  }

  /** Painted backdrop, or null -> caller keeps its procedural gradient. */
  scene(key) {
    const s = this.scenes[key];
    if (s) this.stats.sceneHits++;
    else this.stats.sceneMisses++;
    return s || null;
  }

  /**
   * URL for a painted backdrop, or null when the key is unknown or the scene
   * failed to decode. The loader records deliberately do not carry `file`, so
   * URL construction stays here rather than being open-coded in the UI.
   */
  sceneUrl(key) {
    const s = this.scene(key);
    return s ? this.url(s.file) : null;
  }

  /**
   * Frame rects for one beast, plus the atlas that holds them.
   * The three atlases each ship the same sidecar, so we pick the entry whose
   * `sheet` matches this atlas rather than duplicating the metadata per atlas.
   */
  beastParts(cardId) {
    for (const [key, atlas] of Object.entries(this.beasts)) {
      const b = atlas && atlas.meta && atlas.meta.beasts && atlas.meta.beasts[cardId];
      // Manifest keys are `beasts_<sheet>`; the sidecar tags each beast with
      // its sheet, so the key tells us which atlas actually holds the pixels.
      if (b && b.sheet === key.replace(/^beasts_/, '')) {
        this.stats.beastHits++;
        return { img: atlas.img, parts: b.parts, race: b.race, species: b.species };
      }
    }
    this.stats.beastMisses++;
    return null;
  }

  /** Fortress frame rects by name, e.g. castle_1_1. */
  fortFrames(name) {
    const atlas = this.forts.fort_atlas;
    if (atlas && atlas.meta && atlas.meta.frames && atlas.meta.frames[name]) {
      this.stats.beastHits++;
      return { img: atlas.img, rect: atlas.meta.frames[name] };
    }
    this.stats.beastMisses++;
    return null;
  }

  hasAnySprites()   { return Object.keys(this.sprites).length > 0; }
  hasAnyScenes()    { return Object.keys(this.scenes).length > 0; }
  hasAnyBeasts()    { return Object.keys(this.beasts).length > 0; }
  hasAnyAudio()     { return Object.keys(this.audio).length > 0; }
  hasAnyTextures()  { return Object.keys(this.textures).length > 0; }
  hasFonts()        { return this.fonts.length > 0; }

  /** Short human summary for the debug overlay / console. */
  summary() {
    return (this.loaded ? 'loaded' : 'pending') +
      ' sprites=' + Object.keys(this.sprites).length +
      ' scenes=' + Object.keys(this.scenes).length +
      ' beasts=' + Object.keys(this.beasts).length +
      ' audio=' + Object.keys(this.audio).length +
      ' textures=' + Object.keys(this.textures).length +
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