const D = {
  tiles: [
    { n: '652', l: 'archive entries' },
    { n: '28.3', l: 'MiB extracted' },
    { n: '5,280', l: 'DEX classes' },
    { n: '519', l: 'AndEngine classes' },
    { n: '0', l: 'native .so files' },
    { n: '10', l: 'permissions' }
  ],
  top: [
    ['classes.dex', 5312428, 'compiled Dalvik bytecode — all app + SDK code'],
    ['assets/', 17286528, 'textures, audio, fonts, animation data'],
    ['res/', 5179394, 'compiled resources across density buckets'],
    ['bin/', 595900, 'andengine.jar loaded at runtime via DexClassLoader'],
    ['resources.arsc', 349376, 'compiled resource table'],
    ['META-INF/', 201940, 'JAR signature + AndroidX version markers'],
    ['AndroidManifest.xml', 6376, 'binary XML, decoded on the Manifest tab'],
    ['ext/img/', 448508, 'third-party hosting-portal branding (not original)'],
    ['uml/', 69776, 'AndEngine class diagram, shipped by accident'],
    ['*.properties', 736, 'Play Services + billing version manifests']
  ],
  gfx: [
    ['unit_select', 30], ['unit', 28], ['cover', 17], ['game_common', 16],
    ['bg', 13], ['unit_evolve', 12], ['common', 11], ['store', 10], ['xml', 1]
  ],
  perms: [
    'android.permission.INTERNET',
    'android.permission.ACCESS_NETWORK_STATE',
    'android.permission.ACCESS_WIFI_STATE',
    'android.permission.WAKE_LOCK',
    'android.permission.WRITE_EXTERNAL_STORAGE',
    'android.permission.READ_PHONE_STATE',
    'android.permission.FOREGROUND_SERVICE',
    'com.android.vending.BILLING',
    'com.google.android.gms.permission.AD_ID',
    'com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE'
  ],
  comps: [
    ['GameActivity', 'activity · LAUNCHER · launchMode=singleTop'],
    ['DroidhenGameActivity', 'activity'],
    ['ReferrerReceiver', 'broadcast receiver'],
    ['AssetPackExtractionService', 'service · Play Core'],
    ['ProxyBillingActivity', 'activity · Play Billing'],
    ['AdActivity', 'activity · AdMob'],
    ['PlayCoreDialogWrapperActivity', 'activity · disabled'],
    ['PlayCoreMissingSplitsActivity', 'activity · disabled']
  ],
  pkgs: [
    ['scenes/', 'GameScene, ArenaScene, ShopScene, UnitSelectScene, UnitEvolveScene, UpgradeScene, StartMenuScene'],
    ['units/', 'Unit, UnitPart, Fort, Lane, Mine, Enemy, TroopsCard, Vector2'],
    ['kits/', 'ObjectPool, ArenaAgent, DiscountManager, GreedPool, UnitFactory'],
    ['layer/', 'Dialogs, DragLayer, GiftPackageDlg'],
    ['component/', 'LoadingCircle, RoundRectangle, TripleBarEntity'],
    ['stages/', 'StageData, StageDataConstants'],
    ['sounds/', 'SoundPlayer'],
    ['root', 'GameActivity, AppContext, AdController, Calculator, EffectUtil, CCPrefs']
  ],
  firstUrls: ['http://fortconquer.droidhen.com/FortConquer/game/Main.php'],
  googleUrls: [
    'https://googleads.g.doubleclick.net/mads/static/mad/sdk/native/production/native_ads.js',
    'https://googleads.g.doubleclick.net/mads/static/mad/sdk/native/production/sdk-core-v40-impl.js',
    'https://imasdk.googleapis.com/admob/sdkloader/native_video.html',
    'https://pagead2.googlesyndication.com/pagead/gen_204',
    'https://play.google.com/store/apps/details?id=%1$s&rdid=%1$s&rdot=%2$d',
    'https://www.googleapis.com/auth/drive.apps',
    'https://csi.gstatic.com/csi'
  ]
};

const kb = b => b >= 1048576 ? (b / 1048576).toFixed(1) + ' MiB'
  : b >= 1024 ? (b / 1024).toFixed(0) + ' KiB' : b + ' B';
const esc = s => String(s).replace(/[&<>]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// tiles
document.getElementById('tiles').innerHTML = D.tiles.map(t =>
  `<div class="tile"><div class="n">${t.n}</div><div class="l">${esc(t.l)}</div></div>`).join('');

// top-level components
document.getElementById('tbl-comp').innerHTML =
  `<tr><th>Component</th><th>Size</th><th>Notes</th></tr>` +
  D.top.map(([n, b, d]) =>
    `<tr><td><code>${esc(n)}</code></td><td class="n">${kb(b)}</td><td>${esc(d)}</td></tr>`).join('');

// treemap cards
document.getElementById('treemap').innerHTML = D.top.slice(0, 9).map(([n, b]) =>
  `<div class="tm"><div class="nm">${esc(n)}</div><div class="sz">${kb(b)}</div></div>`).join('');

// gfx bars
const gmax = Math.max(...D.gfx.map(g => g[1]));
document.getElementById('gfx').innerHTML = D.gfx.map(([n, v]) =>
  `<div class="bar-row"><span class="name">${esc(n)}</span>` +
  `<span class="track"><span class="fill" style="width:${(v / gmax * 100).toFixed(1)}%"></span></span>` +
  `<span class="val">${v} files</span></div>`).join('');

document.getElementById('perms').innerHTML = D.perms.map(p => `<li>${esc(p)}</li>`).join('');
document.getElementById('comps').innerHTML = D.comps.map(([n, d]) =>
  `<li>${esc(n)} <span class="t">— ${esc(d)}</span></li>`).join('');
document.getElementById('pkgs').innerHTML = D.pkgs.map(([n, d]) =>
  `<div class="pkg"><div class="nm">${esc(n)}</div><div class="ds">${esc(d)}</div></div>`).join('');
document.getElementById('urls-first').innerHTML =
  D.firstUrls.map(u => `<li class="first">${esc(u)}</li>`).join('');
document.getElementById('urls-google').innerHTML =
  D.googleUrls.map(u => `<li>${esc(u)}</li>`).join('');

// tabs
document.getElementById('tabs').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  document.querySelectorAll('#tabs button').forEach(x => x.classList.remove('on'));
  document.querySelectorAll('.panel').forEach(x => x.classList.remove('on'));
  b.classList.add('on');
  document.getElementById(b.dataset.p).classList.add('on');
  history.replaceState(null, '', '#' + b.dataset.p);
});

if (location.hash) {
  const t = document.querySelector(`#tabs button[data-p="${location.hash.slice(1)}"]`);
  if (t) t.click();
}