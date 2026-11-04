// Store assets (e.g. itch.io): cover images and gameplay videos, rendered
// from the real game in headless Chrome (high effects quality, the Great
// Portal fully lit) with a fixed-step clock so video frames are smooth
// however slow the software renderer is.
//
//   npm run dev            (in another terminal; or set PLAYTEST_URL)
//   npm run promo          [-- --out <dir>] [-- --only covers|videos|<file name part>]
//   npm run promo -- --y8  Y8's media slots instead, into promo/y8/ (see Y8 below)
//
// Writes to promo/ by default:
//   cover-landscape.png 1920x1080 · cover-portrait.png 800x1200 · cover-square.png 800x800
//   video-landscape.mp4 1920x1080 · video-portrait.mp4 1080x1920 (30 fps, ~40 s, no audio)
//
// The videos are a montage: each clip rises in with the level intro and
// shows one mechanic (found automatically in the stored solution), ending
// with a win and a title card.
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import ffmpegPath from 'ffmpeg-static';
import { LEVELS, STAR_WORLDS } from '../src/core/levels.js';
import { Level } from '../src/core/Level.js';

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const url = process.env.PLAYTEST_URL ?? 'http://localhost:5173/';
const y8 = args.includes('--y8');
const out = opt('--out') ?? (y8 ? 'promo/y8' : 'promo');
const only = opt('--only');
const FPS = 30;
const SUPERSAMPLE = 2;
const NAMES = { U: 'up', D: 'down', L: 'left', R: 'right' };
const TAGLINE = 'A little crate-pushing adventure';

// A level by name, or a Star World by chapter index ({ world: n }).
const defOf = (ref) => (ref.world !== undefined ? STAR_WORLDS[ref.world] : LEVELS.find((l) => l.name === ref.level));

// Index of the first solution move where `event` happens.
function eventIndex(def, event) {
  const lvl = new Level(def);
  const sol = [...def.solution];
  for (let i = 0; i < sol.length; i++) {
    const before = lvl.player.x;
    const ev = lvl.move(NAMES[sol[i]]);
    if (ev?.type !== 'move') continue;
    const hit = {
      gate: ev.gateChanged && lvl.gateOpen,
      plate: ev.plateChange > 0,
      sink: ev.pushed?.sunk,
      crateSlide: ev.pushed?.steps > 1,
      teleport: ev.teleport || ev.pushed?.teleport,
      break: ev.broke,
      toggle: ev.toggled,
      wrap: def.wrap && Math.abs(lvl.player.x - before) > 1,
    }[event];
    if (hit) return i;
  }
  throw new Error(`${def.name}: no "${event}" in the solution`);
}

// Covers: a level partway through its solution, Pip turned to the camera,
// title logo on top. zoom < 1 moves the camera closer than the in-game
// framing; shiftX/shiftY move the island on screen (NDC, like Stage's AREAS).
const COVERS = [
  { file: 'cover-landscape.png', width: 1920, height: 1080, level: 'Moon Gate', at: 0.5,
    azimuth: 0.45, polar: 0.85, zoom: 1.28, shiftX: 0.34, shiftY: -0.1, logo: { size: 230, x: '20%', y: '40%' } },
  // A Star World seen low and from the side, so it reads as a little planet.
  { file: 'cover-portrait.png', width: 800, height: 1200, world: 2, at: 0.45,
    azimuth: 0.25, polar: 1.05, zoom: 1.15, shiftX: 0, shiftY: -0.3, logo: { size: 150, x: '50%', y: '12%' },
    portal: { x: 0.45, y: 0.42, scale: 0.55 } },
  { file: 'cover-square.png', width: 800, height: 800, level: 'Garden Gate', at: 0.65,
    azimuth: 0.35, polar: 0.82, zoom: 0.95, shiftX: 0, shiftY: -0.22, logo: { size: 140, x: '50%', y: '14%' },
    portal: { x: 0.68, y: 0.36, scale: 0.45 } },
];

// Videos: one clip per highlight. before/after: moves shown around the event;
// finish: play on to the win.
const CLIPS = [
  { level: 'Garden Gate', event: 'gate', before: 7, after: 2, logo: true },
  { level: 'Reed Bank', event: 'sink', before: 5, after: 3 },
  { level: 'Snowdrift', event: 'crateSlide', before: 5, after: 4 },
  { level: 'Moon Gate', event: 'teleport', before: 4, after: 4 },
  { level: 'Last Footing', event: 'break', before: 4, after: 5 },
  { level: 'Hot Plates', event: 'toggle', before: 3, after: 6 },
  { world: 2, event: 'wrap', before: 4, after: 5 },
  { level: 'Kite Run', finish: true, before: 7 },
];
const VIDEOS = [
  { file: 'video-landscape.mp4', width: 1920, height: 1080, zoom: 0.8, logo: { size: 200, x: '50%', y: '42%' } },
  { file: 'video-portrait.mp4', width: 1080, height: 1920, zoom: 0.8, logo: { size: 200, x: '50%', y: '30%' } },
];
const MAX_SECONDS = 45;

// Y8 (developer portal, Media tab): every slot at its exact size. Screenshots
// are plain gameplay with the HUD, in-game framing, no logo; the promo images
// carry the logo; the video is one continuous play (no cuts, no title card):
// two levels from the intro through the win card and "Next level".
const Y8_PICKS = [
  { level: 'Garden Gate', at: 0.6 },
  { level: 'Reed Bank', at: 0.5 },
  { level: 'Snowdrift', at: 0.5 },
  { level: 'Moon Gate', at: 0.5 },
  { level: 'Hot Plates', at: 0.6 },
  { world: 2, at: 0.45 },
];
const Y8_COVERS = [
  ...Y8_PICKS.map((p, i) => ({ ...p, file: `screenshot-${i + 1}.png`, width: 760, height: 570, gameplay: true })),
  ...Y8_PICKS.map((p, i) => ({ ...p, file: `widescreen-${i + 1}.png`, width: 1280, height: 720, gameplay: true })),
  { ...COVERS[0], file: 'promo-landscape.png' },
  { ...COVERS[1], file: 'promo-portrait.png', width: 1080, height: 1920, zoom: 1.2, shiftY: -0.25,
    logo: { size: 210, x: '50%', y: '13%' }, portal: { x: 0.45, y: 0.4, scale: 0.6 } },
  { ...COVERS[2], file: 'card.png', width: 760, height: 570, zoom: 1, shiftY: -0.2, logo: { size: 115, x: '50%', y: '15%' },
    portal: { x: 0.74, y: 0.36, scale: 0.4 } },
];
const Y8_VIDEO = { file: 'gameplay.mp4', width: 1920, height: 1080, levels: ['Garden Gate', 'Hedge Row'], maxSeconds: 100 };

const run = (cmd, argv) =>
  new Promise((resolve, reject) =>
    spawn(cmd, argv, { stdio: 'inherit' }).on('close', (code) => (code ? reject(new Error(`${cmd} exited ${code}`)) : resolve())));

mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

// Load the game for a viewport and take over its clock and UI.
// ui: keep the game's own HUD (gameplay screenshots) instead of hiding it.
async function open(width, height, scale = 1, ui = false) {
  await page.setViewport({ width, height, deviceScaleFactor: scale });
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('crateKeeper.muted', '1');
    localStorage.setItem('crateKeeper.quality', 'high');
    // Every spark found: the Great Portal is fully lit in the sky.
    const best = {};
    for (let i = 0; i < 98; i++) best[i] = 999;
    localStorage.setItem('crateKeeper.progress', JSON.stringify({ unlocked: 99, best }));
    localStorage.setItem('crateKeeper.portalSeen', '10');
    localStorage.setItem('crateKeeper.storySeen', JSON.stringify([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 'star']));
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.game?.state === 'menu' && document.fonts.status === 'loaded');
  await page.evaluate((fps, ui) => {
    const game = window.game;
    game.stage.renderer.setAnimationLoop(null);
    const dt = 1 / fps;
    game.clock = { elapsedTime: 0, getDelta() { this.elapsedTime += dt; return dt; } };
    const style = document.createElement('style');
    style.textContent = `
      ${ui ? '' : 'body > *:not(canvas):not(.promo-logo) { display: none !important; }'}
      .promo-logo { position: fixed; transform: translate(-50%, -50%); text-align: center; pointer-events: none; }
      .promo-logo .title, .promo-logo .title span, .promo-logo .title .i::after { animation: none !important; }
      .promo-tag { color: #fff; font-weight: 700; letter-spacing: 0.02em; margin-top: 1.15em;
        text-shadow: 0 3px 0 rgba(60, 30, 120, 0.35), 0 6px 18px rgba(30, 20, 80, 0.45); white-space: nowrap; }`;
    document.head.append(style);

    // Everything below runs one fixed step per call, so capture speed never shows.
    window.promo = {
      step(n = 1) {
        for (let i = 0; i < n; i++) game.frame();
      },
      // Load a level (or a Star World) with `prefix` moves already made; the
      // island then rises in with its intro animation.
      load(index, world, prefix) {
        if (world) {
          game.starWorldOpen = () => true;
          game.state = 'menu';
          game.playStarWorld(index);
        } else {
          game.state = 'playing';
          game.ui.hideMenu();
          game.stage.setMode('play');
          game.world.setMenuMode(false);
          game.loadLevel(index);
        }
        for (const d of prefix) game.level.move(d);
        game.level.history = [];
        game.world.build(game.level, game.world.theme);
      },
      // Like load, but through the game's own flow, so the HUD shows the level.
      play(index, world, prefix) {
        game.state = 'menu';
        if (world) {
          game.starWorldOpen = () => true;
          game.playStarWorld(index);
        } else game.play(index);
        for (const d of prefix) game.level.move(d);
        game.world.build(game.level, game.world.theme);
        game.updateHud();
      },
      // A grid move as the player would make it (key press: sounds, HUD, win card).
      press(dir) {
        game.requestMove(game.stage.toScreenDir(dir));
      },
      won: () => !!game.level.won,
      next: () => game.nextLevel(),
      // Camera: in-game framing, then optional orbit/zoom/shift overrides.
      view({ azimuth = null, polar = null, zoom = 1, shiftX = 0, shiftY = 0 }) {
        const { stage } = game;
        game.frameView();
        const { camera, controls } = stage;
        const offset = camera.position.clone().sub(controls.target);
        const s = { radius: offset.length(), phi: Math.acos(offset.y / offset.length()), theta: Math.atan2(offset.x, offset.z) };
        if (azimuth !== null) s.theta = azimuth;
        if (polar !== null) s.phi = polar;
        const r = s.radius * zoom;
        camera.position.set(
          r * Math.sin(s.phi) * Math.sin(s.theta),
          r * Math.cos(s.phi),
          r * Math.sin(s.phi) * Math.cos(s.theta),
        ).add(controls.target);
        camera.lookAt(controls.target);
        const w = innerWidth;
        const h = innerHeight;
        camera.clearViewOffset();
        if (shiftX || shiftY) camera.setViewOffset(w, h, (-shiftX * w) / 2, (shiftY * h) / 2, w, h);
        camera.updateProjectionMatrix();
        controls.enabled = false;
        controls.enableDamping = false;
        controls.update();
      },
      finishIntro() {
        game.anim.finishAll();
        game.world.syncInstant();
      },
      move(dir) {
        const ev = game.level.move(dir);
        if (ev) game.world.applyEvent(ev, () => {});
        return !!ev;
      },
      busy: () => game.anim.busy,
      facePlayerToCamera() {
        const g = game.world.player.group;
        const c = game.stage.camera.position;
        g.rotation.y = Math.atan2(c.x - g.position.x, c.z - g.position.z);
      },
      // Title logo (+ tagline); null removes it.
      logo(spec, tagline) {
        document.querySelector('.promo-logo')?.remove();
        if (!spec) return;
        const div = document.createElement('div');
        div.className = 'promo-logo';
        div.style.left = spec.x;
        div.style.top = spec.y;
        div.innerHTML = `<h1 class="title" style="font-size:${spec.size}px"><span>P</span><span class="i">ı</span><span>p</span></h1>
          <div class="promo-tag" style="font-size:${Math.round(spec.size * 0.19)}px">${tagline}</div>`;
        document.body.append(div);
      },
    };
  }, FPS, ui);
}

const indexOf = (ref) => (ref.world !== undefined ? ref.world : LEVELS.indexOf(defOf(ref)));

async function cover(c) {
  await open(c.width, c.height, SUPERSAMPLE, c.gameplay);
  const def = defOf(c);
  const path = [...def.solution].map((ch) => NAMES[ch]);
  await page.evaluate(
    (index, world, prefix, c, tagline) => {
      if (c.gameplay) {
        promo.play(index, world, prefix);
        promo.finishIntro();
        promo.view({});
        promo.step(45);
        return;
      }
      promo.load(index, world, prefix);
      if (c.portal) window.game.backdrop.portalAt = c.portal;
      promo.view(c);
      promo.finishIntro();
      promo.view(c);
      promo.facePlayerToCamera();
      promo.step(45); // settle water, portals, weather, idle anims
      promo.facePlayerToCamera();
      promo.logo(c.logo, tagline);
      promo.step(1);
    },
    indexOf(c),
    c.world !== undefined,
    path.slice(0, Math.round(path.length * c.at)),
    c,
    TAGLINE,
  );
  // Rendered at SUPERSAMPLE x, then scaled down for smooth edges.
  const big = `${out}/.${c.file}`;
  await page.screenshot({ path: big });
  await run(ffmpegPath, ['-y', '-loglevel', 'error', '-i', big, '-vf', `scale=${c.width}:${c.height}:flags=lanczos`, `${out}/${c.file}`]);
  rmSync(big);
  console.log(`✓ ${out}/${c.file}`);
}

async function video(v) {
  await open(v.width, v.height);
  const file = `${out}/${v.file}`;
  const ffmpeg = spawn(ffmpegPath, [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', '-an', file,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((resolve, reject) => ffmpeg.on('close', (code) => (code ? reject(new Error(`ffmpeg exited ${code}`)) : resolve())));

  const max = MAX_SECONDS * FPS;
  let frames = 0;
  const shoot = async (n = 1) => {
    for (let i = 0; i < n && frames < max; i++) {
      await page.evaluate(() => promo.step());
      ffmpeg.stdin.write(await page.screenshot({ type: 'jpeg', quality: 95 }));
      frames++;
    }
  };
  const shootWhileBusy = async () => {
    do await shoot(); while (frames < max && (await page.evaluate(() => promo.busy())));
  };

  for (const clip of CLIPS) {
    if (frames >= max) break;
    const def = defOf(clip);
    const path = [...def.solution].map((ch) => NAMES[ch]);
    const at = clip.finish ? path.length - 1 : eventIndex(def, clip.event);
    const start = Math.max(0, at - clip.before);
    const end = clip.finish ? path.length : Math.min(path.length, at + clip.after + 1);
    await page.evaluate((index, world, prefix, zoom) => {
      promo.load(index, world, prefix);
      promo.view({ zoom });
    }, indexOf(clip), clip.world !== undefined, path.slice(0, start), v.zoom);
    if (clip.logo) await page.evaluate((spec, tagline) => promo.logo(spec, tagline), v.logo, TAGLINE);
    await shootWhileBusy(); // the island rises in
    await shoot(clip.logo ? 30 : 6);
    if (clip.logo) await page.evaluate(() => promo.logo(null));
    for (const d of path.slice(start, end)) {
      if (frames >= max) break;
      await page.evaluate((d) => promo.move(d), d);
      await shootWhileBusy();
      await shoot(1); // a beat between moves, like a quick human player
    }
    await shoot(clip.finish ? 15 : 12);
  }
  // Title card over the finished island.
  await page.evaluate((spec, tagline) => promo.logo(spec, tagline), v.logo, TAGLINE);
  await shoot(Math.min(75, max - frames));
  ffmpeg.stdin.end();
  await done;
  console.log(`✓ ${file} (${(frames / FPS).toFixed(1)} s)`);
}

// One unbroken play with the HUD: each level rises in, is solved by its
// stored solution at a quick human pace, the win card shows, "Next level".
async function gameplayVideo(v) {
  await open(v.width, v.height, 1, true);
  const file = `${out}/${v.file}`;
  const ffmpeg = spawn(ffmpegPath, [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', '-an', file,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((resolve, reject) => ffmpeg.on('close', (code) => (code ? reject(new Error(`ffmpeg exited ${code}`)) : resolve())));
  const max = v.maxSeconds * FPS;
  let frames = 0;
  const shoot = async (n = 1) => {
    for (let i = 0; i < n && frames < max; i++) {
      await page.evaluate(() => promo.step());
      ffmpeg.stdin.write(await page.screenshot({ type: 'jpeg', quality: 95 }));
      frames++;
    }
  };
  const shootWhileBusy = async () => {
    do await shoot(); while (frames < max && (await page.evaluate(() => promo.busy())));
  };

  const first = LEVELS.findIndex((l) => l.name === v.levels[0]);
  await page.evaluate((index) => promo.play(index, false, []), first);
  for (const [n, name] of v.levels.entries()) {
    const def = LEVELS.find((l) => l.name === name);
    if (n > 0) {
      if (LEVELS.indexOf(def) !== first + n) throw new Error(`${name} doesn't follow ${v.levels[n - 1]}`);
      await page.evaluate(() => promo.next());
    }
    await shootWhileBusy(); // the island rises in
    await shoot(10);
    for (const d of [...def.solution].map((ch) => NAMES[ch])) {
      await page.evaluate((d) => promo.press(d), d);
      await shootWhileBusy();
      await shoot(1);
    }
    if (!(await page.evaluate(() => promo.won()))) throw new Error(`${name}: not won`);
    await shoot(60); // the win card
  }
  ffmpeg.stdin.end();
  await done;
  console.log(`✓ ${file} (${(frames / FPS).toFixed(1)} s)`);
}

const wanted = (file, kind) => !only || only === kind || file.includes(only);
if (y8) {
  for (const c of Y8_COVERS) if (wanted(c.file, 'covers')) await cover(c);
  if (wanted(Y8_VIDEO.file, 'videos')) await gameplayVideo(Y8_VIDEO);
} else {
  for (const c of COVERS) if (wanted(c.file, 'covers')) await cover(c);
  for (const v of VIDEOS) if (wanted(v.file, 'videos')) await video(v);
}

if (errors.length) console.log('Page errors:', errors);
await browser.close();
process.exit(errors.length ? 1 : 0);
