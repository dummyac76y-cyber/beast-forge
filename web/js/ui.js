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

  // ---------- main menu ----------
  function menu(host) {
    const p = repo.profile;
    host.appendChild(panel('Fort Conquest', 'Forge beasts, hold five lanes, break the enemy citadel.'));
    const grid = el('div', 'grid');
    grid.appendChild(bigBtn('⚔', 'Campaign', `Stage ${p.currentStage}`, 'campaign'));
    grid.appendChild(bigBtn('∞', 'Titan Arena', p.highestArenaWave ? `Best wave ${p.highestArenaWave}` : 'Endless waves', 'arena'));
    grid.appendChild(bigBtn('⚒', 'Beast Forge', 'Evolve & level', 'forge'));
    grid.appendChild(bigBtn('🛡', 'Fort Armory', 'Upgrade defenses', 'armory'));
    grid.appendChild(bigBtn('📜', 'Roster', `${p.unlockedCards.length} beasts · deck of ${p.deckCardIds.length}`, 'roster'));
    host.appendChild(grid);
    host.appendChild(el('p', 'hint', 'Sound cues are synthesised — the Android build ships with no audio assets, so it runs silent.'));
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
  function campaign(host) {
    const p = repo.profile;
    host.appendChild(panel('Campaign Dominion', 'Conquer the enemy fortress across five lanes.'));
    const wrap = el('div', 'stages');
    for (let i = 1; i <= 12; i++) {
      const st = CAT.getStage(i);
      const unlocked = i <= p.currentStage;
      const b = el('button', 'stage' + (unlocked ? '' : ' locked'));
      b.appendChild(el('span', 'n', 'Stage ' + i));
      b.appendChild(el('span', 'nm', st.name));
      b.appendChild(el('span', 'meta', `${Math.round(st.enemyFortHp)} HP · ${st.enemySpawns.length} foes`));
      if (st.bossCard) b.appendChild(el('span', 'boss', '★ ' + st.bossCard.name));
      if (unlocked) b.addEventListener('click', () => { audio.unlock(); audio.play('button'); startBattle(i, false); });
      else b.disabled = true;
      wrap.appendChild(b);
    }
    host.appendChild(wrap);
  }

  // ---------- battle ----------
  function arena(host) {
    host.appendChild(panel('Titan Arena', 'Survive endless waves. Only your own beasts hold the line.'));
    const b = el('button', 'primary');
    b.textContent = 'Enter Arena';
    b.addEventListener('click', () => { audio.unlock(); audio.play('button'); startBattle(1, true); });
    host.appendChild(b);
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
   * Prefer the WebGL renderer; fall back to the 2D canvas renderer when WebGL
   * is unavailable or context creation fails (old devices, blocklists, headless
   * test environments). Both expose the same interface:
   * render(engine, selectedLane, hoveredLane), laneAtClientY(y), resize().
   */
  function makeRenderer(cv, assets) {
    const three = globalThis.__beastForge3D;
    if (three && typeof three.createRenderer3D === 'function' && !forceCanvas2D) {
      try {
        // Hand the shared AssetStore over so render3d.js can use the manifest's
        // painted backgrounds and tiling detail maps. It is optional: with no
        // store the 3D renderer falls back to its own procedural materials.
        return three.createRenderer3D(cv, { assets });
      } catch (e) {
        console.warn('Beast Forge: WebGL unavailable, using 2D renderer.', e);
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
    host.appendChild(panel('Beast Forge', 'Evolve through five tiers or invest coins in levels.'));
    const list = el('div', 'cards');
    for (const c of p.unlockedCards) {
      const card = el('div', 'bcard');
      card.style.setProperty('--el', ELEMENT[c.element].color);
      card.style.setProperty('--ti', TIER[c.tier].color);
      card.appendChild(el('div', 'bn', c.name));
      card.appendChild(el('div', 'bm', `${ELEMENT[c.element].displayName} · ${TIER[c.tier].displayName} · Lv${c.level}`));
      card.appendChild(el('div', 'bs', `HP ${cardHp(c)} · ATK ${cardAtk(c)} · ${c.manaCost} mana`));
      card.appendChild(el('div', 'bl', c.lore));
      const row = el('div', 'row');

      const ev = el('button', 'primary', 'Evolve');
      const xt = EVOLVE_CRYSTALS[c.tier], xc = EVOLVE_COINS[c.tier];
      if (xt === null) { ev.textContent = 'Max tier'; ev.disabled = true; }
      else {
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
    host.appendChild(list);
  }

  // ---------- armory ----------
  function armory(host) {
    const p = repo.profile;
    host.appendChild(panel('Fort Armory', 'Permanent upgrades that carry across every battle.'));
    const list = el('div', 'cards');
    list.appendChild(upgradeCard('Citadel Wall', p.fortLevel, `${profileFortMaxHp(p)} HP`, () => p.fortLevel * 250, repo.upgradeFort.bind(repo)));
    list.appendChild(upgradeCard('Arcane Ballista', p.turretLevel, `${profileTurretAtk(p)} atk / ${profileTurretCooldown(p).toFixed(2)}s`, () => p.turretLevel * 220, repo.upgradeTurret.bind(repo)));
    list.appendChild(upgradeCard('Mana Well', p.mineralLevel, `${profileMaxMana(p)} max · ${profileManaRegen(p).toFixed(1)}/s`, () => p.mineralLevel * 200, repo.upgradeMineral.bind(repo)));
    host.appendChild(list);

    const packs = el('div', 'packs');
    packs.appendChild(packCard('Silver Wyrm Pack', '400 coins', 'COMMON – EPIC chance', () => repo.summonBeastPack(false), p.coins >= 400));
    packs.appendChild(packCard('Golden Wyrm Pack', '35 crystals', 'RARE – LEGENDARY', () => repo.summonBeastPack(true), p.crystals >= 35));
    host.appendChild(packs);
    const out = el('div', 'out');
    out.id = 'packOut';
    host.appendChild(out);
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

  function packCard(title, cost, odds, fn, afford) {
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
      const c = el('div', 'bcard drawn');
      c.style.setProperty('--el', ELEMENT[drawn.element].color);
      c.style.setProperty('--ti', TIER[drawn.tier].color);
      c.appendChild(el('div', 'bn', drawn.name));
      c.appendChild(el('div', 'bm', `${ELEMENT[drawn.element].displayName} · ${TIER[drawn.tier].displayName}`));
      c.appendChild(el('div', 'bs', `HP ${cardHp(drawn)} · ATK ${cardAtk(drawn)}`));
      c.appendChild(el('div', 'bl', drawn.lore));
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
      host.replaceChild(fresh, host.querySelector('.cards'));
    });
    return card;
  }

  // ---------- roster ----------
  function roster(host) {
    const p = repo.profile;
    host.appendChild(panel('Roster & Loadout', 'Pick up to four beasts for your active battle deck.'));
    const deck = el('div', 'deck');
    deck.appendChild(el('h3', null, `Active deck (${p.deckCardIds.length}/4)`));
    const dwrap = el('div', 'deckrow');
    for (const id of p.deckCardIds) {
      const c = p.unlockedCards.find(x => x.id === id);
      if (!c) continue;
      const chip = el('button', 'chipcard on');
      chip.style.setProperty('--el', ELEMENT[c.element].color);
      chip.textContent = c.name;
      chip.addEventListener('click', () => { repo.setDeck(p.deckCardIds.filter(x => x !== id)); route('roster'); });
      dwrap.appendChild(chip);
    }
    if (!p.deckCardIds.length) dwrap.appendChild(el('span', 'hint', 'Empty — choose below.'));
    deck.appendChild(dwrap);
    host.appendChild(deck);

    const list = el('div', 'cards');
    for (const c of p.unlockedCards) {
      const inDeck = p.deckCardIds.includes(c.id);
      const card = el('div', 'bcard');
      card.style.setProperty('--el', ELEMENT[c.element].color);
      card.style.setProperty('--ti', TIER[c.tier].color);
      card.appendChild(el('div', 'bn', c.name));
      card.appendChild(el('div', 'bm', `${ELEMENT[c.element].displayName} · ${TIER[c.tier].displayName} · Lv${c.level}`));
      card.appendChild(el('div', 'bs', `HP ${cardHp(c)} · ATK ${cardAtk(c)} · cost ${c.manaCost}`));
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
    host.appendChild(list);
  }

  // ---------- aliases kept short for readability above ----------
  document.addEventListener('DOMContentLoaded', boot);
})();