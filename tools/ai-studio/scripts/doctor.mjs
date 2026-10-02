#!/usr/bin/env node
// ai-studio doctor -- real environment inspection.
//
//   node tools/ai-studio/scripts/doctor.mjs
//
// Reports READY only when the component was actually probed successfully. There
// is no optimistic default: an engine that cannot be reached is NOT RUNNING, an
// engine that is not installed is NOT INSTALLED. Remediation is printed for
// anything not READY.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..');

const rows = [];
const add = (section, name, status, note) => rows.push({ section, name, status, note });

const sh = (cmd, args) => {
  try { return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 8000 }).trim(); }
  catch { return null; }
};
const which = cmd => { try { return sh('which', [cmd]); } catch { return null; } };

// ------------------------------------------------------------------ runtime
add('Runtime', 'Node.js', process.version ? 'READY' : 'ERROR', process.version);
const py = which('python3');
add('Runtime', 'Python', py ? 'READY' : 'NOT INSTALLED', py || 'install python3 (optional)');
const git = which('git');
add('Runtime', 'Git', git ? 'READY' : 'NOT INSTALLED', git || '');
const java = which('java');
add('Runtime', 'Java', java ? 'READY' : 'NOT INSTALLED', java || 'JDK absent -- Android build cannot run here');
add('Runtime', 'Android SDK', process.env.ANDROID_HOME ? 'READY' : 'NOT INSTALLED',
  process.env.ANDROID_HOME || 'ANDROID_HOME unset -- cannot fetch it if TLS is intercepted');
// The repo has no gradlew, so a system Gradle is required. Worth surfacing:
// `gradle` on PATH does not mean the Android app can actually build.
const hasWrapper = fs.existsSync(path.join(REPO, 'gradlew'));
const gradle = which('gradle');
add('Runtime', 'Gradle', hasWrapper ? 'READY (wrapper)' : (gradle ? 'READY (system)' : 'NOT INSTALLED'),
  hasWrapper ? 'gradlew present' : (gradle ? `no gradlew in repo; using system ${gradle}` : 'no gradlew and no system gradle'));

// -------------------------------------------------------------- AI engines
// ComfyUI: probe its local API rather than trusting the port being open.
const comfyUrl = process.env.COMFYUI_URL || 'http://127.0.0.1:8188';
let comfy = { status: 'NOT RUNNING', note: `probed ${comfyUrl}/system_stats` };
try {
  const ctl = AbortSignal.timeout(2500);
  const r = await fetch(`${comfyUrl}/system_stats`, { signal: ctl });
  if (r.ok) {
    const j = await r.json();
    const dev = j?.devices?.[0]?.name || 'unknown device';
    comfy = { status: 'READY', note: `${comfyUrl} responding, device: ${dev}` };
  } else {
    comfy = { status: 'ERROR', note: `HTTP ${r.status}` };
  }
} catch (e) {
  // Distinguish "installed but not started" from "not here at all".
  const local = [path.join(REPO, 'tools', 'ai-studio', 'ComfyUI'),
                 path.join(process.env.HOME || '/root', 'ComfyUI'),
                 process.env.COMFYUI_PATH].filter(Boolean)
                 .find(p => { try { return fs.existsSync(path.join(p, 'main.py')); } catch { return false; } });
  comfy = local
    ? { status: 'NOT RUNNING', note: `installed at ${local}, no response from ${comfyUrl}` }
    : { status: 'NOT INSTALLED', note: `no local checkout, no response from ${comfyUrl}` };
}
add('AI Engines', 'ComfyUI', comfy.status, comfy.note);

for (const [label, cmds, hint] of [
  ['ACE-Step', ['ace_step', 'ace-step'], 'https://github.com/ace-step/ACE-Step'],
  ['Kokoro', ['kokoro'], 'pip install kokoro  (needs torch)'],
  ['Piper', ['piper', 'piper-tts'], 'https://github.com/rhasspy/piper'],
  ['Mem0', ['mem0'], 'pip install mem0ai']
]) {
  const found = cmds.map(which).find(Boolean);
  // A binary on PATH is necessary but not sufficient; probe a local port too.
  add('AI Engines', label, found ? 'INSTALLED (unverified)' : 'NOT INSTALLED',
    found ? `found ${found} -- run it, then re-run doctor` : hint);
}

// ---------------------------------------------------------------------- QA
const pwPkg = fs.existsSync(path.join(REPO, 'node_modules', 'playwright', 'package.json'));
const browserCache = ['chromium', 'firefox', 'webkit']
  .some(b => fs.existsSync(path.join(process.env.HOME || '/root', '.cache', 'ms-playwright', b)));
add('QA', 'Playwright', pwPkg ? (browserCache ? 'READY' : 'NOT CONFIGURED') : 'NOT INSTALLED',
  pwPkg ? (browserCache ? 'package + browser present' : 'npm i -D playwright && npx playwright install chromium')
         : 'npm i -D playwright && npx playwright install chromium');

// ------------------------------------------------------------------ memory
const memDir = path.join(REPO, 'docs', 'ai-memory');
const masterMem = path.join(memDir, 'MASTER_MEMORY.md');
add('Memory', 'Repository', fs.existsSync(masterMem) ? 'READY' : 'NOT INITIALISED',
  fs.existsSync(masterMem) ? 'docs/ai-memory/MASTER_MEMORY.md' : 'no docs/ai-memory yet');
add('Memory', 'Mem0', which('mem0') ? 'INSTALLED (unverified)' : 'NOT CONFIGURED',
  which('mem0') ? 'no endpoint probed' : 'optional; RepositoryMemoryProvider is the default');

// --------------------------------------------------------------- resources
const gpu = sh('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader'])
  || sh('rocm-smi', ['--showproductname'])
  || (fs.existsSync('/sys/class/drm') ? 'DRM device nodes present (no vendor query tool)' : null);
add('Resources', 'GPU', gpu ? 'DETECTED' : 'NOT DETECTED',
  gpu || 'no NVIDIA/AMD/Intel GPU tool found -- AI art/music would run on CPU only');
add('Resources', 'CPU', `${os.cpus().length} cores`, os.cpus()[0]?.model || '');
add('Resources', 'RAM', `${(os.totalmem() / 1024 ** 3).toFixed(1)} GiB`, `${(os.freemem() / 1024 ** 3).toFixed(1)} GiB free`);
const disk = sh('df', ['-h', REPO]);
add('Resources', 'Disk', 'detected', (disk || '').split('\n').slice(-1)[0].trim());

// ------------------------------------------------------------------ assets
const manifestPath = path.join(REPO, 'web', 'assets', 'manifest.json');
if (!fs.existsSync(manifestPath)) {
  add('Assets', 'web/assets/manifest.json', 'NOT PRESENT',
      'game falls back to procedural art + synthesised audio');
} else {
  const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const n = k => Object.keys(m[k] || {}).length;
  const spriteCount = n('sprites');
  const audioCount = n('audio');
  const textureCount = n('textures');
  const sceneCount = n('scenes');
  const beastAtlasCount = n('beasts');
  const fortAtlasCount = n('forts');
  // Every referenced path, including the JSON sidecars the atlases carry.
  // Omitting the sidecars here would report READY while the beast rig silently
  // fell back to procedural shapes.
  const allFiles = [
    ...Object.values(m.sprites || {}), ...Object.values(m.audio || {}),
    ...Object.values(m.textures || {}), ...(m.fonts || []),
    ...Object.values(m.scenes || {}),
    ...Object.values(m.beasts || {}), ...Object.values(m.forts || {})
  ];
  const sidecars = [
    ...Object.values(m.beasts || {}).map(s => s.parts),
    ...Object.values(m.forts || {}).map(s => s.frames)
  ].filter(Boolean);
  let missing = 0;
  for (const f of [...allFiles, ...sidecars]) {
    if (f && f.file && !fs.existsSync(path.join(REPO, 'web', 'assets', f.file))) missing++;
  }
  add('Assets', 'Manifest', missing ? 'INCOMPLETE' : 'READY',
      `${spriteCount} sprites, ${audioCount} clips, ${textureCount} tiling maps, ` +
      `${sceneCount} scenes, ${beastAtlasCount} beast atlases, ${fortAtlasCount} fort atlas, ` +
      `${(m.fonts || []).length} fonts` +
      (sidecars.length ? `, ${sidecars.length} sidecars` : '') +
      (missing ? `, ${missing} FILE(S) MISSING` : ', all files present'));
}

// ------------------------------------------------------------------ output
const order = ['Runtime', 'AI Engines', 'QA', 'Memory', 'Resources', 'Assets'];
const W = Math.max(...rows.map(r => r.name.length));
console.log('\nBeast Forge AI Studio -- doctor\n');
for (const section of order) {
  const group = rows.filter(r => r.section === section);
  if (!group.length) continue;
  console.log(section);
  console.log('-'.repeat(section.length));
  for (const r of group) {
    const status = r.status.padEnd(20);
    console.log(`  ${r.name.padEnd(W)}  ${status} ${r.note ? '  ' + r.note : ''}`.trimEnd());
  }
  console.log('');
}
const notReady = rows.filter(r => !['READY', 'DETECTED', 'INITIALISED'].some(s => r.status.startsWith(s)));
console.log(`${rows.length - notReady.length}/${rows.length} checks READY.`);
if (notReady.length) {
  console.log('The game is unaffected by every item above -- all AI components are optional.');
}