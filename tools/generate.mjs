// Level generator. Two modes:
//
// 1. Template: fill a hand-drawn template with random crates/plates/rocks.
//      node --max-old-space-size=6000 tools/generate.mjs <template> [tries] [seed]
//    Template legend: '?' floor slot, '*' ice slot (see TEMPLATES below).
//
// 2. Chapter (procedural): random island shape + terrain + items, filtered so
//    the solution actually uses the chapter's mechanics. Writes JSON lines.
//      node tools/generate.mjs --chapter <name> --tries 600 --seed 1 --out out.jsonl
//
// Every candidate is solved by BFS; only solvable ones in the target length
// range are kept. The generator only proposes — pick, name and hand-check.
import fs from 'node:fs';
import { Level, TILE } from '../src/core/Level.js';
import { solve } from './solve.js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeRng(seed) {
  let s = seed >>> 0 || 1;
  const rand = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
  rand.int = (a, b) => a + Math.floor(rand() * (b - a + 1));
  rand.pick = (arr) => arr.splice(Math.floor(rand() * arr.length), 1)[0];
  return rand;
}

const NAMES = { U: 'up', D: 'down', L: 'left', R: 'right' };

// How the solution uses the mechanics (for filtering).
export function solutionStats(map, path) {
  const lvl = new Level({ name: 'stats', map });
  const st = { pushes: 0, sinks: 0, slides: 0, crateSlides: 0 };
  for (const c of path) {
    const ev = lvl.move(NAMES[c]);
    if (ev?.type !== 'move') continue;
    if (ev.slid) st.slides++;
    if (ev.pushed) {
      st.pushes++;
      if (ev.pushed.sunk) st.sinks++;
      if (Math.abs(ev.pushed.to.x - ev.pushed.from.x) + Math.abs(ev.pushed.to.z - ev.pushed.from.z) > 1) st.crateSlides++;
    }
  }
  return st;
}

// ---------------------------------------------------------------------------
// Template mode
// ---------------------------------------------------------------------------

const TEMPLATES = {
  rink: {
    crates: 1, plates: 1, rocks: [3, 5], len: [18, 40],
    map: [
      ' ???????   ',
      '?*******?  ',
      'P*******?.GE',
      '?*******?  ',
      ' ???????   ',
    ],
  },
  vault: {
    crates: 3, plates: 3, rocks: [2, 4], len: [40, 90],
    map: [
      ' ??????    ',
      '???????    ',
      'P??????.G.E',
      '???????    ',
      ' ??????    ',
    ],
  },
  moat: {
    crates: 3, plates: 2, rocks: [2, 4], len: [25, 60],
    map: [
      ' ??*****?.  ',
      '???*****?~. ',
      'P??*****?~GE',
      '???*****?~. ',
      ' ??*****?.  ',
    ],
  },
  finale: {
    crates: 4, plates: 2, rocks: [3, 5], len: [45, 110],
    map: [
      ' ???~****??  ',
      '????~****???#',
      'P???~****???GE',
      '????~****???#',
      ' ???~****??  ',
    ],
  },
  // Plates fixed on the far side: bridge the river, cross the ice, fill them.
  finale2: {
    crates: 4, plates: 0, rocks: [3, 6], len: [55, 130],
    map: [
      ' ????~*****.o.  ',
      '?????~*****..#  ',
      'P????~*****...G.E',
      '?????~*****..#  ',
      ' ????~*****.o.  ',
    ],
  },
};

function templateCandidate(tpl, rand) {
  const grid = tpl.map.map((r) => [...r]);
  const floor = [];
  const ice = [];
  grid.forEach((row, z) => row.forEach((ch, x) => {
    if (ch === '?') floor.push([x, z]);
    if (ch === '*') ice.push([x, z]);
  }));
  const set = ([x, z], ch) => (grid[z][x] = ch);
  for (let i = 0; i < tpl.plates; i++) set(rand.pick(floor), 'o');
  for (let i = 0; i < tpl.crates; i++) set(rand.pick(rand() < 0.6 || !ice.length ? floor : ice), 'B');
  const rocks = rand.int(tpl.rocks[0], tpl.rocks[1]);
  for (let i = 0; i < rocks; i++) set(rand.pick(rand() < 0.5 && ice.length ? ice : floor), '#');
  for (const p of floor) set(p, '.');
  for (const p of ice) set(p, '_');
  return grid.map((r) => r.join(''));
}

// ---------------------------------------------------------------------------
// Chapter (procedural) mode
// ---------------------------------------------------------------------------

// river: number of full-height water columns; ice: chance of an ice field.
export const CHAPTERS = {
  meadow: { w: [6, 9], h: [5, 7], plates: [2, 3], spare: [0, 0], rocks: [3, 7], river: 0, ice: 0, len: [30, 100], need: {} },
  river: { w: [8, 11], h: [5, 6], plates: [1, 2], spare: [1, 1], rocks: [1, 4], river: 1, ice: 0, len: [30, 100], need: { sinks: 1 } },
  frost: { w: [7, 10], h: [5, 6], plates: [1, 2], spare: [0, 1], rocks: [2, 6], river: 0, ice: 1, len: [20, 80], need: { slides: 3 } },
  thaw: { w: [9, 11], h: [5, 6], plates: [1, 2], spare: [1, 1], rocks: [2, 5], river: 1, ice: 1, len: [30, 100], need: { sinks: 1, slides: 2 } },
  summit: { w: [10, 12], h: [5, 7], plates: [2, 3], spare: [1, 2], rocks: [3, 6], river: [1, 2], ice: 1, len: [50, 150], need: { sinks: 1, slides: 2 } },
  // Leaner summit: fewer spare crates keeps the search space tractable.
  summit2: { w: [9, 12], h: [5, 6], plates: [2, 2], spare: [0, 1], rocks: [4, 7], river: [1, 2], ice: 1, len: [45, 150], need: { sinks: 1, slides: 2 } },
};

function chapterCandidate(cfg, rand) {
  const W = rand.int(cfg.w[0], cfg.w[1]); // island body columns 1..W
  const H = rand.int(cfg.h[0], cfg.h[1]);
  const mid = Math.floor(H / 2);
  const cols = W + 3; // start column + body + gate + exit
  const grid = Array.from({ length: H }, () => Array(cols).fill(' '));
  const inBody = (x) => x >= 1 && x <= W;

  // Body: a filled rectangle with nibbled corners and edges.
  for (let z = 0; z < H; z++) for (let x = 1; x <= W; x++) grid[z][x] = '.';
  for (const [cx, cz, dx, dz] of [[1, 0, 1, 1], [W, 0, -1, 1], [1, H - 1, 1, -1], [W, H - 1, -1, -1]]) {
    const n = rand.int(0, 2);
    for (let i = 0; i < n; i++) grid[cz][cx + dx * i] = ' ';
    if (n === 2 && rand() < 0.5) grid[cz + dz][cx] = ' ';
  }
  for (const z of [0, H - 1]) {
    for (let x = 3; x <= W - 2; x++) if (rand() < 0.15) grid[z][x] = ' ';
  }
  // Start, gate and exit on the middle row.
  grid[mid][0] = 'P';
  grid[mid][1] = '.';
  grid[mid][W + 1] = 'G';
  grid[mid][W + 2] = 'E';
  grid[mid][W] = '.';

  // Rivers: full-height water columns, away from start and gate.
  const rivers = Array.isArray(cfg.river) ? rand.int(cfg.river[0], cfg.river[1]) : cfg.river;
  const riverCols = [];
  for (let i = 0; i < rivers; i++) {
    const options = [];
    for (let x = 3; x <= W - 2; x++) if (!riverCols.some((r) => Math.abs(r - x) < 3)) options.push(x);
    if (!options.length) break;
    riverCols.push(rand.pick(options));
  }
  for (const x of riverCols) for (let z = 0; z < H; z++) if (grid[z][x] === '.') grid[z][x] = '~';

  // Ice field: a band of columns (skipping rivers), most rows.
  if (cfg.ice && rand() < cfg.ice) {
    const width = rand.int(3, Math.max(3, Math.min(6, W - 4)));
    const x0 = rand.int(2, Math.max(2, W - width));
    const z0 = rand.int(0, 1);
    const z1 = H - 1 - rand.int(0, 1);
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x < x0 + width && x < W; x++) if (grid[z][x] === '.') grid[z][x] = '_';
    }
  }

  // Items.
  const floorSlots = [];
  const anySlots = [];
  for (let z = 0; z < H; z++) {
    for (let x = 1; x <= W; x++) {
      if ((z === mid && (x === 1 || x === W))) continue; // keep entrance and gate approach clear
      if (grid[z][x] === '.') floorSlots.push([x, z]);
      if (grid[z][x] === '.' || grid[z][x] === '_') anySlots.push([x, z]);
    }
  }
  const take = ([x, z], ch) => {
    grid[z][x] = ch;
    const drop = (arr) => {
      const i = arr.findIndex(([ax, az]) => ax === x && az === z);
      if (i >= 0) arr.splice(i, 1);
    };
    drop(floorSlots);
    drop(anySlots);
  };
  const plates = rand.int(cfg.plates[0], cfg.plates[1]);
  const crates = plates + rivers + rand.int(cfg.spare[0], cfg.spare[1]);
  for (let i = 0; i < plates && floorSlots.length; i++) take(floorSlots[Math.floor(rand() * floorSlots.length)], 'o');
  for (let i = 0; i < crates && anySlots.length; i++) take(anySlots[Math.floor(rand() * anySlots.length)], 'B');
  const rocks = rand.int(cfg.rocks[0], cfg.rocks[1]);
  for (let i = 0; i < rocks && anySlots.length; i++) take(anySlots[Math.floor(rand() * anySlots.length)], '#');

  return grid.map((r) => r.join('').replace(/\s+$/, (m) => m));
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};

if (process.argv[1]?.endsWith('generate.mjs')) {
  const chapterName = flag('--chapter', null);
  if (chapterName) {
    const cfg = CHAPTERS[chapterName];
    if (!cfg) throw new Error(`Chapters: ${Object.keys(CHAPTERS).join(', ')}`);
    const tries = Number(flag('--tries', 300));
    const seed = Number(flag('--seed', 1));
    const out = flag('--out', null);
    const limit = Number(flag('--limit', 250000));
    const rand = makeRng(seed * 7919 + 17);
    const seen = new Set();
    let kept = 0;
    for (let i = 0; i < tries; i++) {
      const map = chapterCandidate(cfg, rand);
      const key = map.join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      const r = solve({ name: 'gen', map }, limit);
      if (!r.path || r.path.length < cfg.len[0] || r.path.length > cfg.len[1]) continue;
      const st = solutionStats(map, r.path);
      if (st.pushes < 4) continue;
      if (Object.entries(cfg.need).some(([k, v]) => st[k] < v)) continue;
      const rec = { chapter: chapterName, map, len: r.path.length, states: r.states, path: r.path, stats: st };
      kept++;
      if (out) fs.appendFileSync(out, JSON.stringify(rec) + '\n');
      else console.log(JSON.stringify(rec));
    }
    console.error(`${chapterName} seed ${seed}: kept ${kept} of ${tries}`);
  } else {
    const [name, triesArg, seedArg] = args;
    const tpl = TEMPLATES[name];
    if (!tpl) {
      console.log(`Templates: ${Object.keys(TEMPLATES).join(', ')}\nChapters (--chapter): ${Object.keys(CHAPTERS).join(', ')}`);
      process.exit(1);
    }
    const rand = makeRng(Number(seedArg ?? Date.now() % 100000));
    const found = [];
    const seen = new Set();
    for (let i = 0; i < Number(triesArg ?? 300); i++) {
      const map = templateCandidate(tpl, rand);
      const key = map.join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      const r = solve({ name, map }, 400000);
      if (!r.path || r.path.length < tpl.len[0] || r.path.length > tpl.len[1]) continue;
      found.push({ map, len: r.path.length, states: r.states, path: r.path });
    }
    // Longer solutions through bigger search spaces tend to be more interesting.
    found.sort((a, b) => b.len * Math.log(b.states) - a.len * Math.log(a.states));
    console.log(`${found.length} usable\n`);
    for (const f of found.slice(0, 5)) {
      console.log(`len ${f.len}  states ${f.states}\n${f.map.map((r) => `  '${r}',`).join('\n')}\n  ${f.path}\n`);
    }
  }
}
