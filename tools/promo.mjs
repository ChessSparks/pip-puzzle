// Store assets (e.g. CrazyGames): cover images and gameplay videos, rendered
// from the real game in headless Chrome with a fixed-step clock so video
// frames are smooth however slow the software renderer is.
//
//   npm run dev            (in another terminal; or set PLAYTEST_URL)
//   npm run promo          [-- --out <dir>] [-- --only covers|videos]
//
// Writes to promo/ by default:
//   cover-landscape.png 1920x1080 · cover-portrait.png 800x1200 · cover-square.png 800x800
//   video-landscape.mp4 1920x1080 · video-portrait.mp4 1080x1920 (30 fps, ~20 s, no audio)
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import ffmpegPath from 'ffmpeg-static';
import { LEVELS } from '../src/core/levels.js';

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const url = process.env.PLAYTEST_URL ?? 'http://localhost:5173/';
const out = opt('--out') ?? 'promo';
const only = opt('--only');
const FPS = 30;
const SUPERSAMPLE = 2;
const NAMES = { U: 'up', D: 'down', L: 'left', R: 'right' };
const levelNo = (name) => LEVELS.findIndex((l) => l.name === name);

// Cover shots: a level partway through its solution, Pip turned to the camera,
// title logo on top. zoom < 1 moves the camera closer than the in-game framing;
// shiftX/shiftY move the island on screen (NDC, like Stage's AREAS).
const COVERS = [
  { file: 'cover-landscape.png', width: 1920, height: 1080, level: 'Thin Ice', at: 0.45,
    azimuth: 0.35, polar: 0.8, zoom: 0.92, shiftX: 0.33, shiftY: -0.06, logo: { size: 250, x: '19%', y: '46%' } },
  { file: 'cover-portrait.png', width: 800, height: 1200, level: 'Thin Ice', at: 0.45,
    azimuth: -Math.PI / 2 + 0.3, polar: 0.8, zoom: 0.95, shiftX: 0, shiftY: -0.24, logo: { size: 170, x: '50%', y: '15%' } },
  { file: 'cover-square.png', width: 800, height: 800, level: 'Thin Ice', at: 0.45,
    azimuth: 0.35, polar: 0.8, zoom: 0.68, shiftX: 0, shiftY: -0.3, logo: { size: 150, x: '50%', y: '15%' } },
];

// Videos: whole levels solved back to back, hard cut between them.
const VIDEOS = [
  { file: 'video-landscape.mp4', width: 1920, height: 1080, zoom: 0.8, levels: ['Frosty Moat', 'Frozen Pond', 'The Crossing'] },
  { file: 'video-portrait.mp4', width: 1080, height: 1920, zoom: 0.8, levels: ['Frosty Moat', 'Frozen Pond', 'The Crossing'] },
];
const MAX_SECONDS = 20;

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
async function open(width, height, scale = 1) {
  await page.setViewport({ width, height, deviceScaleFactor: scale });
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(() => {
    localStorage.setItem('crateKeeper.tutorialDone', '1');
    localStorage.setItem('crateKeeper.muted', '1');
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.game?.state === 'menu' && document.fonts.status === 'loaded');
  await page.evaluate((fps) => {
    const game = window.game;
    game.stage.renderer.setAnimationLoop(null);
    const dt = 1 / fps;
    game.clock = { elapsedTime: 0, getDelta() { this.elapsedTime += dt; return dt; } };
    const style = document.createElement('style');
    style.textContent = `
      body > *:not(canvas):not(.promo-logo) { display: none !important; }
      .promo-logo { position: fixed; transform: translate(-50%, -50%); text-align: center; pointer-events: none; }
      .promo-logo .title, .promo-logo .title span, .promo-logo .title .i::after { animation: none !important; }`;
    document.head.append(style);

    // Everything below runs one fixed step per call, so capture speed never shows.
    window.promo = {
      step(n = 1) {
        for (let i = 0; i < n; i++) game.frame();
      },
      load(index) {
        game.state = 'playing';
        game.ui.hideMenu();
        game.stage.setMode('play');
        game.world.setMenuMode(false);
        game.loadLevel(index);
      },
      // Camera: in-game framing, then optional orbit/zoom/shift overrides.
      view({ azimuth = null, polar = null, zoom = 1, shiftX = 0, shiftY = 0 }) {
        const { stage } = game;
        stage.frame(game.level);
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
      // Replay moves instantly (no animation), e.g. to start a cover mid-level.
      skip(path) {
        for (const d of path) game.level.move(d);
        game.world.syncInstant();
      },
      move(dir) {
        const ev = game.level.move(dir);
        if (ev) game.world.applyEvent(ev, () => {});
        return !!ev;
      },
      busy: () => game.anim.busy,
      won: () => game.level.won,
      facePlayerToCamera() {
        const g = game.world.player.group;
        const c = game.stage.camera.position;
        g.rotation.y = Math.atan2(c.x - g.position.x, c.z - g.position.z);
      },
      logo({ size, x, y }) {
        document.querySelector('.promo-logo')?.remove();
        const div = document.createElement('div');
        div.className = 'promo-logo';
        div.style.left = x;
        div.style.top = y;
        div.innerHTML = `<h1 class="title" style="font-size:${size}px"><span>P</span><span class="i">ı</span><span>p</span></h1>`;
        document.body.append(div);
      },
    };
  }, FPS);
}

async function cover(c) {
  await open(c.width, c.height, SUPERSAMPLE);
  const index = levelNo(c.level);
  const path = [...LEVELS[index].solution].map((ch) => NAMES[ch]);
  await page.evaluate(
    (index, prefix, c) => {
      promo.load(index);
      promo.skip(prefix);
      promo.view(c);
      promo.facePlayerToCamera();
      promo.step(20); // settle water, portal, idle anims
      promo.facePlayerToCamera();
      promo.logo(c.logo);
      promo.step(1);
    },
    index,
    path.slice(0, Math.round(path.length * c.at)),
    c,
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

  for (const name of v.levels) {
    if (frames >= max) break;
    const index = levelNo(name);
    await page.evaluate((index, zoom) => {
      promo.load(index);
      promo.view({ zoom });
      promo.step(2);
    }, index, v.zoom);
    await shoot(12);
    for (const ch of LEVELS[index].solution) {
      if (frames >= max) break;
      await page.evaluate((d) => promo.move(d), NAMES[ch]);
      do await shoot(); while (frames < max && (await page.evaluate(() => promo.busy())));
      await shoot(1); // a beat between moves, like a quick human player
    }
    await shoot(10);
  }
  ffmpeg.stdin.end();
  await done;
  console.log(`✓ ${file} (${(frames / FPS).toFixed(1)} s)`);
}

if (only !== 'videos') for (const c of COVERS) await cover(c);
if (only !== 'covers') for (const v of VIDEOS) await video(v);

if (errors.length) console.log('Page errors:', errors);
await browser.close();
process.exit(errors.length ? 1 : 0);
