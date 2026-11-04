// Browser playtest: plays every level's optimal solution (from the solver)
// in headless Chrome using real key presses, and checks each level is won.
//
//   npm run dev            (in another terminal; or set PLAYTEST_URL)
//   npm run playtest       [-- --shots <dir>] [-- --level <n>] [-- --from <n>] [-- --to <n>] [-- --high]
//
// Headless Chrome renders in software, which is slow, so by default it plays
// at 'low' effects quality in a smaller window (full size with --shots;
// --high keeps high quality).
//
// Env: CHROME_PATH (defaults to the standard Windows install),
//      PLAYTEST_URL (defaults to http://localhost:5173/).
import puppeteer from 'puppeteer-core';
import { LEVELS as MAIN, STAR_WORLDS } from '../src/core/levels.js';
import { solve } from './solve.js';

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const url = process.env.PLAYTEST_URL ?? 'http://localhost:5173/';
const shots = opt('--shots');
const only = opt('--level') ? Number(opt('--level')) - 1 : null;
const from = opt('--from') ? Number(opt('--from')) - 1 : 0;
const to = opt('--to') ? Number(opt('--to')) - 1 : Infinity;
const KEYS = { U: 'ArrowUp', D: 'ArrowDown', L: 'ArrowLeft', R: 'ArrowRight' };
// --worlds plays the Star Worlds instead (numbered by chapter).
const worlds = args.includes('--worlds');
const LEVELS = worlds ? STAR_WORLDS : MAIN;

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const high = args.includes('--high');
await page.setViewport(shots ? { width: 1280, height: 800 } : { width: 800, height: 500 });
await page.goto(url, { waitUntil: 'load' });
// Unlock everything so each level can be started directly.
await page.evaluate((n, quality) => {
  localStorage.setItem('crateKeeper.progress', JSON.stringify({ unlocked: n, best: {} }));
  localStorage.setItem('crateKeeper.quality', quality);
}, LEVELS.length, high ? 'high' : 'low');
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => window.game?.state === 'menu');

let failed = 0;
for (let i = 0; i < LEVELS.length; i++) {
  if ((only !== null && i !== only) || i < from || i > to) continue;
  const path = LEVELS[i].solution ?? solve(LEVELS[i]).path;
  if (!path) {
    console.log(`✗ ${i + 1}. ${LEVELS[i].name}: solver found no solution`);
    failed++;
    continue;
  }
  await page.evaluate((idx, w) => {
    const g = window.game;
    if (w) {
      g.starWorldOpen = () => true; // skip the 3-star requirement
      if (g.state !== 'menu') g.openMenu();
      g.playStarWorld(idx);
    } else g.play(idx);
  }, i, worlds);
  await new Promise((r) => setTimeout(r, 300));
  if (shots) await page.screenshot({ path: `${shots}/level${i + 1}-start.png` });
  for (let k = 0; k < path.length; k++) {
    await page.waitForFunction(() => !window.game.anim.busy && window.game.moveQueue.length === 0, { timeout: 60000 });
    await page.keyboard.press(KEYS[path[k]]);
    if (shots && k === Math.floor(path.length / 2)) {
      await new Promise((r) => setTimeout(r, 400));
      await page.screenshot({ path: `${shots}/level${i + 1}-mid.png` });
    }
  }
  const won = await page
    .waitForFunction(() => !document.getElementById('win').classList.contains('hidden'), { timeout: 30000 })
    .then(() => true, () => false);
  const moves = await page.evaluate(() => window.game.level.moves);
  if (shots) await page.screenshot({ path: `${shots}/level${i + 1}-win.png` });
  console.log(`${won ? '✓' : '✗'} ${i + 1}. ${LEVELS[i].name}: ${moves}/${path.length} moves${won ? '' : ' — NOT WON'}`);
  if (!won) failed++;
}

if (errors.length) console.log('Page errors:', errors);
await browser.close();
process.exit(failed || errors.length ? 1 : 0);
