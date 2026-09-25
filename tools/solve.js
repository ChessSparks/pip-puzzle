// Level checker / BFS solver.
//
//   npm run solve                 replay each level's stored `solution` (fast)
//   npm run solve -- --optimal    full BFS search for the shortest solution
//
// A level without a stored solution is always searched. Big levels may need
// more memory:  node --max-old-space-size=6000 tools/solve.js --optimal
import { Level } from '../src/core/Level.js';
import { LEVELS } from '../src/core/levels.js';

const NAMES = { U: 'up', D: 'down', L: 'left', R: 'right' };

// Breadth-first search. Returns { path, states, limitReached }.
export function solve(def, limit = 3000000) {
  const lvl = new Level(def);
  const seen = new Set([lvl.key()]);
  let frontier = [{ snap: lvl.snapshot(), path: '' }];
  while (frontier.length) {
    const next = [];
    for (const { snap, path } of frontier) {
      for (const dir of ['up', 'down', 'left', 'right']) {
        restore(lvl, snap);
        const ev = lvl.move(dir);
        if (!ev || ev.type !== 'move') continue;
        const p = path + dir[0].toUpperCase();
        if (ev.won) return { path: p, states: seen.size, limitReached: false };
        const k = lvl.key();
        if (seen.has(k)) continue;
        seen.add(k);
        if (seen.size >= limit) return { path: null, states: seen.size, limitReached: true };
        next.push({ snap: lvl.snapshot(), path: p });
      }
    }
    frontier = next;
  }
  return { path: null, states: seen.size, limitReached: false };
}

// Play a U/D/L/R move string; true if it ends with the level won.
export function replay(def, path) {
  const lvl = new Level(def);
  for (const c of path) lvl.move(NAMES[c]);
  return lvl.won;
}

function restore(lvl, s) {
  lvl.restore(s);
  lvl.history = [];
}

if (process.argv[1]?.endsWith('solve.js')) {
  const optimal = process.argv.includes('--optimal');
  let bad = 0;
  LEVELS.forEach((def, i) => {
    const label = `${i + 1}. ${def.name}`;
    if (def.solution && !optimal) {
      const ok = replay(def, def.solution);
      if (!ok) bad++;
      console.log(`${ok ? '✓' : '✗'} ${label}: stored solution ${def.solution.length} moves${ok ? '' : ' — DOES NOT WIN'}`);
      return;
    }
    const r = solve(def);
    if (!r.path) bad++;
    const verdict = r.path
      ? `${r.path.length} moves  ${r.path}`
      : r.limitReached ? 'search limit reached (try more memory / a smaller level)' : 'UNSOLVABLE';
    console.log(`${r.path ? '✓' : '✗'} ${label}: ${verdict}  (${r.states} states)`);
    if (r.path && def.solution && r.path.length < def.solution.length) {
      console.log(`   shorter than the stored solution (${def.solution.length}) — consider updating it`);
    }
  });
  process.exit(bad ? 1 : 0);
}
