// Screen shell, HUD and game loop. Replaces MainActivity.kt, BattleScreen.kt,
// BattleHUD.kt, MainMenuScreen.kt, ForgeScreen.kt, ArmoryScreen.kt, RosterScreen.kt.
'use strict';

(function () {
  const REPO = 'com.example.beastforge';
  const $ = s => document.querySelector(s);
  const el = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };
  const fmt = n => n.toLocaleString();
  const esc = s => String(s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let repo, audio, renderer, engine;
  let assets = null;
  let screen = 'menu';
  let selectedCardId = null;
  let hoveredLane = -1;
  let rafId = null, lastTs = 0;
  let battleMode = 'campaign';
  let st_num = 1;

  // Escape hatch: append ?2d to the URL to force the Canvas 2D renderer, which
  // is useful for comparing the two and for troubleshooting WebGL problems.
  const forceCanvas2D = /[?&]2d(?:[=&]|$)/.test(location.search);

  // ---------- boot ----------
  function boot() {
    repo = new GameRepository();
    // Defensive: the game is fully playable with no asset system at all.
    assets = (typeof globalThis !== 'undefined' && globalThis.__beastForgeAssets) ||
             (typeof AssetStore === 'function' ? new AssetStore() : null);
    audio = new AudioMan(assets);
    audio.enabled = repo.profile.soundEnabled;

    // Load optional assets first so fonts are ready before first paint. A missing
    // or broken manifest resolves silently -- the game does not depend on it.
    const ready = assets && typeof assets.load === 'function'
      ? assets.load().catch(() => assets)
      : Promise.resolve(assets);

    selectedCardId = repo.profile.deckCardIds[0] || null;
    wireGlobal();
    route('menu');
    window.addEventListener('resize', () => { if (renderer) renderer.resize(); });

    ready.then(() => {
      if (!assets) { console.info('[beast-forge] no asset system; using procedural art + synth audio'); return; }
      document.documentElement.setAttribute('data-assets', assets.summary());
      console.info('[beast-forge] assets:', assets.summary());
      applyFontFamily();
      renderCredits();
      if (assets.stats.errors.length) {
        console.warn('[beast-forge] asset load issues:', assets.stats.errors);
      }
      renderProfileChips();
    });
  }

  // The display face comes from the manifest when present; otherwise the CSS
  // stack below falls back to a serif.
  function applyFontFamily() {
    const hasDisplay = !!(assets && assets.hasFonts && assets.hasFonts());
    document.documentElement.classList.toggle('has-display-font', hasDisplay);
  }

  // Only shown when the manifest actually contributed third-party assets.
  // Attribution stays attached to the thing it credits.
  function renderCredits() {
    const host = $('#credits');
    if (!host) return;
    const src = (assets && assets.sources) || [];
    if (!src.length) { host.innerHTML = ''; host.style.display = 'none'; return; }
    const parts = src.map(c => {
      const who = c.author || c.name;
      const lic = c.license ? ' (' + c.license + ')' : '';
      return c.url
        ? '<a href="' + c.url + '" target="_blank" rel="noopener">' + esc(who) + '</a>' + esc(lic)
        : esc(who) + esc(lic);
    });
    host.style.display = 'block';
    host.innerHTML = 'Assets: ' + parts.join(' · ') +
      ' — see <a href="CREDITS.md">CREDITS.md</a>. Everything else is generated procedurally.';
  }

  function wireGlobal() {
    $('#nav').addEventListener('click', e => {
      const b = e.target.closest('button[data-screen]');
      if (!b) return;
      audio.unlock(); audio.play('button');
      if (b.dataset.screen === 'menu') route('menu');
      else route(b.dataset.screen);
    });
    $('#soundBtn').addEventListener('click', () => {
      audio.unlock();
      repo.toggleSound();
      audio.enabled = repo.profile.soundEnabled;
      $('#soundBtn').textContent = audio.enabled ? '🔊' : '🔇';
      if (audio.enabled) audio.play('button');
      renderProfileChips();
    });
  }

  // ---------- routing ----------
  const ROUTES = { menu, campaign, arena, forge, armory, roster };

  function route(name) {
    stopLoop();
    screen = name;
    document.querySelectorAll('#nav button[data-screen]').forEach(b =>
      b.classList.toggle('on', b.dataset.screen === name));
    const host = $('#screen');
    host.innerHTML = '';
    ROUTES[name](host);
    renderProfileChips();
  }

  function renderProfileChips() {
    const p = repo.profile;
    $('#chips').innerHTML =
      `<span class="chip gold">⬤ ${fmt(p.coins)}</span>` +
      `<span class="chip crystal">◆ ${fmt(p.crystals)}</span>` +
      `<span class="chip">Stage ${p.currentStage}</span>` +
      `<span class="chip">Best Arena ${p.highestArenaWave}</span>`;
  }

  // ---------- scene layers ----------
  // A .scene is the full-bleed backdrop for a screen. Layers are painted only
  // if the manifest supplied that scene key, so with every asset blocked the
  // screen still gets graded scrims rather than a flat void.
  //
// Backdrop URLs come from AssetStore, which owns the manifest base path and
  // returns null for any key that failed to decode -- so a screen with a
  // missing scene still renders its scrims instead of requesting a broken URL.
  function sceneUrl(key) {
    if (!key) return null;
    return assets && typeof assets.sceneUrl === 'function' ? assets.sceneUrl(key) : null;
  }

  /**
   * @param opts { back, mid, near, far } scene keys for the layers
   */
  function scene(opts, depth) {
    const o = opts || {};
    const root = el('div', 'scene');
    const add = (cls, url, d, dx, dy) => {
      if (!url) return;
      const l = el('div', 'layer ' + cls);
      l.style.backgroundImage = `url("${url}")`;
      if (d) {
        l.dataset.depth = d;
        l.style.setProperty('--dx', dx || 0);
        l.style.setProperty('--dy', dy || 0);
      }
      root.appendChild(l);
    };
    // BACKDROP -> MIDGROUND -> FOREGROUND, then atmosphere on top of all of it.
    add('lyr-back', sceneUrl(o.back), null);
    add('lyr-mid', sceneUrl(o.mid), 0.5, depth || 10, 4);
    add('lyr-near', sceneUrl(o.near), 1, (depth || 10) * 2, 7);
    root.appendChild(el('div', 'layer lyr-haze'));
    root.appendChild(el('div', 'layer lyr-fog'));
    root.appendChild(el('div', 'layer lyr-firelight'));
    root.appendChild(el('div', 'layer lyr-frame'));
    root.appendChild(el('div', 'scene-body'));
    return root;
  }

  function sceneBody(root) {
    return root.querySelector('.scene-body');
  }

  /** Pointer parallax. Small enough to feel like depth, not like a gimmick. */
  function wireParallax(root) {
    if (!root || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const move = (e) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const r = root.getBoundingClientRect();
        const px = ((e.clientX - r.left) / r.width - 0.5) * 2;
        const py = ((e.clientY - r.top) / r.height - 0.5) * 2;
        root.style.setProperty('--px', px.toFixed(3));
        root.style.setProperty('--py', py.toFixed(3));
      });
    };
    root.addEventListener('pointermove', move);
  }

  function sceneHead(title, sub) {
    const w = el('div');
    w.appendChild(el('h1', 'scene-title', title));
    if (sub) w.appendChild(el('p', 'scene-sub', sub));
    return w;
  }

  // A live portrait of the actual painted beast, drawn by the same rig the
  // battle renderer uses. This is the whole point of importing the original
  // art: the roster should show the creature you will actually field.
  //
  // One rig is shared across every portrait so the part cache is not rebuilt
  // per card; the canvases themselves are cheap and static.
  let portraitRig = null;
  function portrait(cardId, px) {
    const size = px || 104;
    const cv = el('canvas', 'portrait');
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    cv.width = size * dpr;
    cv.height = size * dpr;
    cv.style.width = size + 'px';
    cv.style.height = size + 'px';
    const Rig = globalThis.__beastForgeRig;
    if (!Rig) return cv;
    if (!portraitRig) portraitRig = new Rig.BeastRig(assets);
    const rig = portraitRig.get(cardId);
    const ctx = cv.getContext('2d');
    if (!rig || !ctx) return cv;
    // Fit the rig's own proportions into the tile, then centre it. draw()
    // takes the rig's LEFT edge and its ground line, not a centre point, so
    // the offsets have to be computed from the scaled bounds.
    const scale = (size * 0.86) / Math.max(rig.width, rig.height);
    const ground = size * 0.95;
    const left = (size - rig.width * scale) / 2;
    const t = 0; // idle at t=0 is a stable, non-animating pose for a static UI
    ctx.save();
    ctx.scale(dpr, dpr);
    const grounded = portraitRig.draw(ctx, cardId, left, ground, 'idle', t, {
      scale,
      facing: 1
    });
    ctx.restore();
    if (!grounded) {
      // No painted parts for this card: fall back to the element glyph so the
      // card is never an empty grey square.
      cv.replaceWith(el('div', 'portrait-fallback', '⬢'));
    }
    return cv;
  }

  // ---------- main menu ----------
  function menu(host) {
    const p = repo.profile;
    const root = scene({ back: 'scene_base' }, 8);
    const body = sceneBody(root);
    wireParallax(root);
    host.appendChild(root);

    const wrap = el('div', 'base');
    const left = el('div');

    const crest = el('div', 'base-crest');
    const sig = el('div', 'sigil', '⚒');
    crest.appendChild(sig);
    const crestText = el('div');
    crestText.appendChild(el('div', 'base-lore',
      'Five lanes stand between your citadel and the Dominion. Forge beasts from wild stock, bind them to the wheel of elements, and hold.'));
    crest.appendChild(crestText);
    left.appendChild(crest);
    left.appendChild(el('h1', 'base-title', 'Beast Forge'));

    const stats = el('div', 'base-stats');
    stats.appendChild(statBadge('Citadel', `Lv ${p.fortLevel}`));
    stats.appendChild(statBadge('Arena Best', p.highestArenaWave ? `Wave ${p.highestArenaWave}` : '—'));
    stats.appendChild(statBadge('Beasts', String(p.unlockedCards.length)));
    left.appendChild(stats);
    wrap.appendChild(left);

    // The one primary action. Everything else on this screen is secondary.
    const right = el('div');
    const nextStage = Math.min(12, Math.max(1, p.currentStage));
    const st = CAT.getStage(nextStage);
    const main = el('button', 'callout');
    main.appendChild(el('span', 'eyebrow', 'Main Action'));
    main.appendChild(el('span', 'ctitle', 'Fort Conquest'));
    main.appendChild(el('span', 'csub',
      `Stage ${nextStage} — ${st.name} · ${Math.round(st.enemyFortHp)} HP citadel`
      + (st.bossCard ? ` · ${st.bossCard.name} commands it` : '')));
    main.appendChild(el('span', 'cplay', '⚔ Play'));
    main.addEventListener('click', () => {
      audio.unlock(); audio.play('button'); startBattle(nextStage, false);
    });
    right.appendChild(main);

    const dest = el('div', 'dest');
    dest.appendChild(destTile('⚔', 'Campaign', `12 stages`, 'campaign'));
    dest.appendChild(destTile('∞', 'Titan Arena',
      p.highestArenaWave ? `Best wave ${p.highestArenaWave}` : 'Endless waves', 'arena'));
    dest.appendChild(destTile('⚒', 'Beast Forge', 'Evolve & train', 'forge'));
    dest.appendChild(destTile('🛡', 'Fort Armory', 'Upgrade defenses', 'armory'));
    dest.appendChild(destTile('📜', 'Roster', `Deck of ${p.deckCardIds.length}`, 'roster'));
    right.appendChild(dest);
    wrap.appendChild(right);
    body.appendChild(wrap);
  }

  function statBadge(label, value) {
    const b = el('div', 'tile');
    b.style.cssText = 'background:rgba(0,0,0,.34);border:1px solid var(--line);border-radius:10px;padding:9px 13px';
    const l = el('div');
    l.appendChild(el('div', 'ts', label));
    l.appendChild(el('div', 'tt', value));
    b.appendChild(l);
    return b;
  }

  function destTile(icon, title, sub, target) {
    const b = el('button', 'tile');
    b.appendChild(el('span', 'ic', icon));
    const t = el('span');
    t.appendChild(el('span', 'tt', title));
    t.appendChild(el('span', 'ts', sub));
    b.appendChild(t);
    b.addEventListener('click', () => { audio.unlock(); audio.play('button'); route(target); });
    return b;
  }

  function panel(title, sub) {
    const n = el('div', 'hero');
    n.appendChild(el('h2', null, title));
    if (sub) n.appendChild(el('p', 'sub', sub));
    return n;
  }
  function bigBtn(icon, title, sub, target) {
    const b = el('button', 'big');
    b.appendChild(el('span', 'ic', icon));
    b.appendChild(el('span', 't', title));
    b.appendChild(el('span', 's', sub));
    b.addEventListener('click', () => { audio.unlock(); audio.play('button'); route(target); });
    return b;
  }

  // ---------- campaign picker ----------
  // A journey up a map rather than a grid of cards. Nodes keep the `stage`
  // class and are real <button>s, because that is the contract the QA harness
  // drives -- the presentation changed, the contract did not.
  function campaign(host) {
    const p = repo.profile;
    const root = scene({ back: 'scene_citadel' }, 14);
    const body = sceneBody(root);
    wireParallax(root);
    host.appendChild(root);

    body.appendChild(sceneHead('Campaign Dominion',
      'Climb from the Verdant Outskirts to the Abyssal Spire.'));

    const wrap = el('div', 'map');
    wrap.style.height = 'clamp(420px, 58vh, 560px)';

    // Serpentine route: alternate column so the path reads as a trail up the
    // map rather than a straight ladder.
    const pos = i => {
      const t = (i - 1) / 11;
      const col = i % 2 ? 30 : 70;
      return { x: col, y: 92 - t * 78 };
    };

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'path');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('viewBox', '0 0 100 100');
    for (let i = 1; i < 12; i++) {
      const a = pos(i), b = pos(i + 1);
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
      line.setAttribute('x2', b.x); line.setAttribute('y2', b.y);
      line.setAttribute('vector-effect', 'non-scaling-stroke');
      if (i < p.currentStage) line.classList.add('done');
      svg.appendChild(line);
    }
    wrap.appendChild(svg);

    for (let i = 1; i <= 12; i++) {
      const st = CAT.getStage(i);
      const unlocked = i <= p.currentStage;
      const at = pos(i);
      const isNext = i === p.currentStage;
      // `stage` is kept as a stable hook: the QA harness selects
      // `button.stage:not([disabled])`, and that contract should not be
      // renegotiated every time the campaign presentation changes.
      let cls = 'node stage';
      if (i < p.currentStage) cls += ' done';
      else if (isNext) cls += ' next';
      if (st.bossCard) cls += ' boss';
      const b = el('button', cls + (unlocked ? '' : ' locked'), st.bossCard ? '★' : String(i));
      b.style.left = at.x + '%';
      b.style.top = at.y + '%';
      b.title = `Stage ${i} — ${st.name}${st.bossCard ? ' · ' + st.bossCard.name : ''}`;
      b.appendChild(el('span', 'cap', `${i}. ${st.name}`));
      if (unlocked) b.addEventListener('click', () => {
        audio.unlock(); audio.play('button'); startBattle(i, false);
      });
      else b.disabled = true;
      wrap.appendChild(b);
    }
    body.appendChild(wrap);

    const legend = el('div', 'legend');
    legend.appendChild(el('span', null, '★ Boss citadel · gold marks your next conquest · broken stone is locked'));
    body.appendChild(legend);
  }

  // ---------- battle ----------
  function arena(host) {
    const p = repo.profile;
    const root = scene({ back: 'scene_arena' }, 12);
    const body = sceneBody(root);
    wireParallax(root);
    host.appendChild(root);

    body.appendChild(sceneHead('Titan Arena',
      'An endless wave of Dominion beasts. Only your own beasts hold the line.'));
    const card = el('div', 'panel');
    card.style.maxWidth = '520px';
    card.style.marginTop = '22px';
    card.appendChild(el('p', 'scene-sub',
      p.highestArenaWave
        ? `Your best run reached wave ${p.highestArenaWave}.`
        : 'No run recorded. The arena does not forgive a thin deck.'));
    const b = el('button', 'callout');
    b.style.marginTop = '14px';
    b.appendChild(el('span', 'eyebrow', 'Endless'));
    b.appendChild(el('span', 'ctitle', 'Enter the Arena'));
    b.appendChild(el('span', 'csub', 'Score is kept as your highest wave.'));
    b.appendChild(el('span', 'cplay', '▶ Begin'));
    b.addEventListener('click', () => { audio.unlock(); audio.play('button'); startBattle(1, true); });
    card.appendChild(b);
    body.appendChild(card);
  }

  function startBattle(stageNumber, isArena) {
    stopLoop();
    battleMode = isArena ? 'arena' : 'campaign';
    st_num = isArena ? 1 : stageNumber;
    const stage = isArena
      ? { stageNumber: 1, name: 'Titan Arena', description: 'Endless survival', bgTheme: 'arena',
          enemyFortHp: 99999, enemySpawns: [], rewardCoins: 0, rewardCrystals: 0, bossCard: null }
      : CAT.getStage(stageNumber);
    engine = new BattleEngine(stage, repo.profile, audio, isArena);
    selectedCardId = repo.profile.deckCardIds[0] || null;

    screen = 'battle';
    document.querySelectorAll('#nav button[data-screen]').forEach(b => b.classList.remove('on'));
    $('#nav button[data-screen="menu"]').classList.add('on');
    renderBattle();
    lastTs = 0;
    rafId = requestAnimationFrame(loop);
  }

  function renderBattle() {
    const host = $('#screen');
    host.innerHTML = '';
    const isArena = battleMode === 'arena';

    const hud = el('div', 'hud');
    hud.id = 'hud';
    hud.appendChild(el('span', 'title', isArena ? 'Titan Arena' : 'Stage ' + engine.stageConfig.stageNumber + ' — ' + engine.stageConfig.name));
    hud.appendChild(el('span', 'stat', ''));
    hud.appendChild(el('span', 'wave', ''));
    host.appendChild(hud);

    const cv = el('canvas');
    cv.id = 'battleCanvas';
    cv.className = 'battlefield';
    host.appendChild(cv);

    const bar = el('div', 'cardbar');
    bar.id = 'cardbar';
    host.appendChild(bar);

    const ctrl = el('div', 'controls');
    const cat = el('button', 'cat');
    cat.id = 'catBtn';
    cat.addEventListener('click', () => { engine.triggerCatapultSuperweapon(); refreshHud(); });
    const pause = el('button');
    pause.id = 'pauseBtn';
    pause.addEventListener('click', () => { engine.isPaused = !engine.isPaused; pause.textContent = engine.isPaused ? '▶' : '❚❚'; });
    const speed = el('button');
    speed.id = 'speedBtn';
    speed.addEventListener('click', () => { engine.gameSpeed = engine.gameSpeed === 1 ? 2 : 1; speed.textContent = engine.gameSpeed + '×'; });
    const quit = el('button', 'ghost', 'Retreat');
    quit.addEventListener('click', () => { audio.play('button'); route(isArena ? 'arena' : 'campaign'); });
    ctrl.appendChild(cat); ctrl.appendChild(pause); ctrl.appendChild(speed); ctrl.appendChild(quit);
    host.appendChild(ctrl);

    const tip = el('div', 'tip');
    tip.id = 'tip';
    host.appendChild(tip);

    renderer = makeRenderer(cv, assets);
    cv.addEventListener('mousemove', e => { hoveredLane = renderer.laneAtClientY(e.clientY); });
    cv.addEventListener('mouseleave', () => { hoveredLane = -1; });
    cv.addEventListener('click', e => {
      const lane = renderer.laneAtClientY(e.clientY);
      if (lane >= 0 && summon(lane)) audio.play('select');
    });

    buildCardBar();
    refreshHud();
  }

  /**
   * Canvas 2D is the game's renderer. It is what the art direction is built
   * for: painted backdrops, composed creature rigs, layered atmosphere.
   *
   * render3d.js is still shipped and still works, behind `?3d`, because it is
   * a working system and removing it is not this change's call. It is simply
   * no longer the default: a 3D battle renderer contradicts this being a 2D
   * game, and it cannot show the painted beast art at all.
   *
   * Both expose the same interface:
   * render(engine, selectedLane, hoveredLane), laneAtClientY(y), resize().
   */
  function makeRenderer(cv, assets) {
    const force3D = /[?&]3d(?:[=&]|$)/.test(location.search);
    if (!forceCanvas2D && force3D) {
      const three = globalThis.__beastForge3D;
      if (three && typeof three.createRenderer3D === 'function') {
        try {
          return three.createRenderer3D(cv, { assets });
        } catch (e) {
          console.warn('Beast Forge: WebGL unavailable, using 2D renderer.', e);
        }
      }
    }
    return new Renderer(cv, assets);
  }

  function buildCardBar() {
    const bar = $('#cardbar');
    bar.innerHTML = '';
    const p = repo.profile;
    const deck = p.deckCardIds.map(id => p.unlockedCards.find(c => c.id === id)).filter(Boolean);
    if (!deck.length) { bar.appendChild(el('span', 'hint', 'No cards in deck — visit Roster.')); return; }
    for (const c of deck) {
      const b = el('button', 'card' + (c.id === selectedCardId ? ' on' : ''));
      b.dataset.cardId = c.id;
      b.style.setProperty('--el', ELEMENT[c.element].color);
      b.style.setProperty('--ti', TIER[c.tier].color);
      const top = el('span', 'ctop');
      top.appendChild(el('b', null, c.name));
      top.appendChild(el('i', null, `${ELEMENT[c.element].displayName} · ${TIER[c.tier].displayName}`));
      b.appendChild(top);
      const bar2 = el('span', 'cmana');
      bar2.appendChild(el('i'));
      bar2.firstChild.style.width = Math.max(0, Math.min(100, (engine.mana / c.manaCost) * 100)) + '%';
      b.appendChild(bar2);
      b.appendChild(el('span', 'ccost', c.manaCost + ' mana'));
      const cd = engine.cardCooldowns[c.id] || 0;
      if (cd > 0) { b.classList.add('cooling'); b.appendChild(el('span', 'ccd', cd.toFixed(1))); }
      b.addEventListener('click', () => { selectedCardId = c.id; buildCardBar(); });
      bar.appendChild(b);
    }
  }

  function summon(lane) {
    const c = repo.profile.unlockedCards.find(x => x.id === selectedCardId);
    if (!c) return false;
    return engine.summonUnit(c, lane);
  }

  function refreshHud() {
    const p = repo.profile;
    const forts = $('#hud .stat'), wave = $('#hud .wave');
    if (forts) forts.textContent =
      `Your fort ${Math.ceil(engine.playerFort.currentHp)}/${Math.round(engine.playerFort.maxHp)}  ·  ` +
      `Enemy ${Math.ceil(engine.enemyFort.currentHp)}/${Math.round(engine.enemyFort.maxHp)}`;
    if (wave) wave.textContent =
      battleMode === 'arena'
        ? `Wave ${engine.arenaWave} · ${engine.arenaScore} pts`
        : `${Math.floor(engine.battleTime)}s · mana ${Math.floor(engine.mana)}/${Math.round(engine.maxMana)}`;
    const cat = $('#catBtn');
    if (cat) {
      cat.disabled = engine.catapultCooldownTimer > 0 || engine.isGameOver;
      cat.textContent = engine.catapultCooldownTimer > 0
        ? `Catapult ${engine.catapultCooldownTimer.toFixed(0)}s` : '☄ Catapult';
    }
    const tip = $('#tip');
    if (tip) {
      const c = repo.profile.unlockedCards.find(x => x.id === selectedCardId);
      tip.textContent = c
        ? `Selected: ${c.name} — ${c.lore}  (click a lane to deploy)`
        : 'Select a beast, then click a lane.';
    }
  }

  function loop(ts) {
    if (!engine) return;
    if (!lastTs) lastTs = ts;
    const dt = Math.min((ts - lastTs) / 1000, 0.25);
    lastTs = ts;
    const wasOver = engine.isGameOver;
    engine.update(dt);
    renderer.render(engine, -1, hoveredLane);
    refreshHud();
    if (!wasOver && engine.isGameOver) { onGameOver(); return; }
    if (!engine.isPaused && Math.floor(ts / 120) !== Math.floor((ts - dt * 1000) / 120)) buildCardBar();
    rafId = requestAnimationFrame(loop);
  }

  function stopLoop() { if (rafId) cancelAnimationFrame(rafId); rafId = null; engine = null; }

  function onGameOver() {
    // stopLoop() nulls `engine`, so every value the summary needs has to be read
    // out first -- otherwise the victory/defeat screen throws and never renders.
    const won = engine.isVictory;
    const arenaRun = battleMode === 'arena';
    const wave = engine.arenaWave, score = engine.arenaScore;
    const st = engine.stageConfig;
    stopLoop();
    if (arenaRun) { repo.recordArenaScore(wave); }
    else if (won) {
      repo.addRewards(st.rewardCoins, st.rewardCrystals, true);
    }
    const host = $('#screen');
    const ov = el('div', 'overlay');
    const box = el('div', 'modal');
    box.appendChild(el('h2', won ? 'victory' : 'defeat', won ? 'Victory' : 'Your fort has fallen'));
    if (arenaRun) {
      box.appendChild(el('p', 'sub', `Reached wave ${wave} · ${score} points`));
    } else {
      box.appendChild(el('p', 'sub', won
        ? `+${st.rewardCoins} coins · +${st.rewardCrystals} crystals${st.bossCard ? ' · boss defeated' : ''}`
        : 'No rewards. Reinforce your armory and refine your deck.'));
    }
    const row = el('div', 'row');
    const again = el('button', 'primary', arenaRun ? 'Run again' : 'Replay stage');
    again.addEventListener('click', () => { audio.play('button'); startBattle(arenaRun ? 1 : st_num, arenaRun); });
    const back = el('button', 'ghost', 'Return');
    back.addEventListener('click', () => { audio.play('button'); route(arenaRun ? 'arena' : 'campaign'); });
    row.appendChild(again); row.appendChild(back);
    box.appendChild(row);
    ov.appendChild(box);
    host.appendChild(ov);
  }

  // ---------- forge ----------
  function forge(host) {
    const p = repo.profile;
    const root = scene({ back: 'scene_volcano' }, 10);
    const body = sceneBody(root);
    wireParallax(root);
    host.appendChild(root);
    body.appendChild(sceneHead('Beast Forge',
      'Push a beast through five tiers, or spend coins on levels. Both carry into every battle.'));

    const list = el('div', 'cards');
    for (const c of p.unlockedCards) {
      const card = el('div', 'bcard beast-card');
      card.style.setProperty('--el', ELEMENT[c.element].color);
      card.style.setProperty('--ti', TIER[c.tier].color);
      card.appendChild(portrait(c.id, 108));
      const info = el('div', 'beast-info');
      info.appendChild(el('div', 'bn', c.name));
      info.appendChild(el('div', 'bm', `${ELEMENT[c.element].displayName} · ${TIER[c.tier].displayName} · Lv${c.level}`));
      info.appendChild(el('div', 'bs', `HP ${cardHp(c)} · ATK ${cardAtk(c)} · ${c.manaCost} mana`));
      info.appendChild(el('div', 'bl', c.lore));
      card.appendChild(info);
      const row = el('div', 'row');

      const ev = el('button', 'primary');
      const xt = EVOLVE_CRYSTALS[c.tier], xc = EVOLVE_COINS[c.tier];
      if (xt === null) {
        ev.textContent = 'Max tier';
        ev.disabled = true;
      } else {
        ev.textContent = `Evolve ${xc}c/${xt}x`;
        ev.disabled = p.coins < xc || p.crystals < xt;
        ev.addEventListener('click', () => {
          if (repo.evolveBeast(c.id)) { audio.unlock(); audio.play('evolve'); route('forge'); }
        });
      }
      const lv = el('button', 'ghost', `Level up ${c.level * 180}c`);
      lv.disabled = p.coins < c.level * 180;
      lv.addEventListener('click', () => { if (repo.levelUpBeast(c.id)) { audio.unlock(); audio.play('coin'); route('forge'); } });
      row.appendChild(ev); row.appendChild(lv);
      card.appendChild(row);
      list.appendChild(card);
    }
    body.appendChild(list);
  }

  // ---------- armory ----------
  function armory(host) {
    const p = repo.profile;
    const root = scene({ back: 'scene_citadel' }, 12);
    const body = sceneBody(root);
    wireParallax(root);
    host.appendChild(root);
    body.appendChild(sceneHead('Fort Armory',
      'Permanent upgrades that carry across every battle. Spend coins on the citadel, crystals on beasts.'));
    const list = el('div', 'cards');
    list.appendChild(upgradeCard('Citadel Wall', p.fortLevel, `${profileFortMaxHp(p)} HP`, () => p.fortLevel * 250, repo.upgradeFort.bind(repo)));
    list.appendChild(upgradeCard('Arcane Ballista', p.turretLevel, `${profileTurretAtk(p)} atk / ${profileTurretCooldown(p).toFixed(2)}s`, () => p.turretLevel * 220, repo.upgradeTurret.bind(repo)));
    list.appendChild(upgradeCard('Mana Well', p.mineralLevel, `${profileMaxMana(p)} max · ${profileManaRegen(p).toFixed(1)}/s`, () => p.mineralLevel * 200, repo.upgradeMineral.bind(repo)));
    body.appendChild(list);

    body.appendChild(el('h3', 'section-h', 'Summon Packs'));
    const packs = el('div', 'packs');
    const out = el('div', 'out');
    out.id = 'packOut';
    packs.appendChild(packCard('Silver Wyrm Pack', '400 coins', 'COMMON – EPIC chance', () => repo.summonBeastPack(false), p.coins >= 400, out));
    packs.appendChild(packCard('Golden Wyrm Pack', '35 crystals', 'RARE – LEGENDARY', () => repo.summonBeastPack(true), p.crystals >= 35, out));
    body.appendChild(packs);
    body.appendChild(out);
  }

  function upgradeCard(title, level, stat, costFn, apply) {
    const p = repo.profile;
    const card = el('div', 'bcard');
    card.appendChild(el('div', 'bn', title));
    card.appendChild(el('div', 'bm', 'Level ' + level));
    card.appendChild(el('div', 'bs', stat));
    const b = el('button', 'primary', `Upgrade — ${fmt(costFn())} coins`);
    b.disabled = p.coins < costFn();
    b.addEventListener('click', () => {
      if (apply()) { audio.unlock(); audio.play('coin'); route('armory'); }
    });
    const row = el('div', 'row'); row.appendChild(b); card.appendChild(row);
    return card;
  }

  // `out` is passed in rather than closed over: this used to reference a `const
  // out` declared in armory(), which is not in scope here, so opening a pack
  // threw a ReferenceError before the reveal could paint.
  function packCard(title, cost, odds, fn, afford, out) {
    const card = el('div', 'pack');
    card.appendChild(el('div', 'bn', title));
    card.appendChild(el('div', 'bm', cost));
    card.appendChild(el('div', 'bs', odds));
    const b = el('button', 'primary', 'Open');
    b.disabled = !afford;
    b.addEventListener('click', () => {
      const drawn = fn();
      if (!drawn) return;
      audio.unlock(); audio.play('coin');
      const c = el('div', 'bcard beast-card drawn');
      c.style.setProperty('--el', ELEMENT[drawn.element].color);
      c.style.setProperty('--ti', TIER[drawn.tier].color);
      c.appendChild(portrait(drawn.id, 118));
      const info = el('div', 'beast-info');
      info.appendChild(el('div', 'bn', drawn.name));
      info.appendChild(el('div', 'bm', `${ELEMENT[drawn.element].displayName} · ${TIER[drawn.tier].displayName}`));
      info.appendChild(el('div', 'bs', `HP ${cardHp(drawn)} · ATK ${cardAtk(drawn)}`));
      info.appendChild(el('div', 'bl', drawn.lore));
      c.appendChild(info);
      out.innerHTML = '';
      out.appendChild(el('h3', null, 'Summoned'));
      out.appendChild(c);
      renderProfileChips();
      // Refresh costs without destroying the reveal.
      const host = $('#screen');
      const fresh = el('div', 'cards');
      fresh.appendChild(upgradeCard('Arcane Ballista', repo.profile.turretLevel,
        `${profileTurretAtk(repo.profile)} atk / ${profileTurretCooldown(repo.profile).toFixed(2)}s`,
        () => repo.profile.turretLevel * 220, repo.upgradeTurret.bind(repo)));
      const old = host.querySelector('.scene-body > .cards');
      if (old) host.replaceChild(fresh, old);
    });
    return card;
  }

  // ---------- roster ----------
  function roster(host) {
    const p = repo.profile;
    const root = scene({ back: 'scene_forest' }, 10);
    const body = sceneBody(root);
    wireParallax(root);
    host.appendChild(root);
    body.appendChild(sceneHead('Roster & Loadout',
      'Pick up to four beasts for your active battle deck. Mana decides how many you can afford at once.'));

    const deck = el('div', 'deck');
    deck.appendChild(el('h3', 'section-h', `Active deck (${p.deckCardIds.length}/4)`));
    const dwrap = el('div', 'deckrow');
    for (const id of p.deckCardIds) {
      const c = p.unlockedCards.find(x => x.id === id);
      if (!c) continue;
      const chip = el('button', 'chipcard on');
      chip.style.setProperty('--el', ELEMENT[c.element].color);
      chip.appendChild(portrait(c.id, 72));
      const t = el('span');
      t.appendChild(el('span', 'tt', c.name));
      t.appendChild(el('span', 'ts', `${c.manaCost} mana`));
      chip.appendChild(t);
      chip.addEventListener('click', () => { repo.setDeck(p.deckCardIds.filter(x => x !== id)); route('roster'); });
      dwrap.appendChild(chip);
    }
    if (!p.deckCardIds.length) dwrap.appendChild(el('span', 'hint', 'Empty — choose below.'));
    deck.appendChild(dwrap);
    body.appendChild(deck);

    const list = el('div', 'cards');
    for (const c of p.unlockedCards) {
      const inDeck = p.deckCardIds.includes(c.id);
      const card = el('div', 'bcard beast-card' + (inDeck ? ' in-deck' : ''));
      card.style.setProperty('--el', ELEMENT[c.element].color);
      card.style.setProperty('--ti', TIER[c.tier].color);
      card.appendChild(portrait(c.id, 96));
      const info = el('div', 'beast-info');
      info.appendChild(el('div', 'bn', c.name + (inDeck ? ' ✓' : '')));
      info.appendChild(el('div', 'bm', `${ELEMENT[c.element].displayName} · ${TIER[c.tier].displayName} · Lv${c.level}`));
      info.appendChild(el('div', 'bs', `HP ${cardHp(c)} · ATK ${cardAtk(c)} · cost ${c.manaCost}`));
      card.appendChild(info);
      const b = el('button', inDeck ? 'ghost' : 'primary', inDeck ? 'Remove' : 'Add to deck');
      b.disabled = !inDeck && p.deckCardIds.length >= 4;
      b.addEventListener('click', () => {
        const next = inDeck ? p.deckCardIds.filter(x => x !== c.id) : p.deckCardIds.concat([c.id]);
        repo.setDeck(next);
        selectedCardId = next[0] || null;
        route('roster');
      });
      const row = el('div', 'row'); row.appendChild(b); card.appendChild(row);
      list.appendChild(card);
    }
    body.appendChild(list);
  }

  // ---------- aliases kept short for readability above ----------
  document.addEventListener('DOMContentLoaded', boot);
})();