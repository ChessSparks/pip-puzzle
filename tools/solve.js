// Level checker / BFS solver.
//
//   npm run solve                 replay each level's stored `solution` (fast)
//   npm run solve -- --optimal    full BFS search for the shortest solution
//
// A level without a stored solution is always searched. Big levels may need
// more memory:  node --max-old-space-size=6000 tools/solve.js --optimal
import { Level } from '../src/core/Level.js';
import { LEVELS, STAR_WORLDS } from '../src/core/levels.js';
import { bfs } from '../src/core/search.js';

const NAMES = { U: 'up', D: 'down', L: 'left', R: 'right' };

// Breadth-first search for the shortest solution (see src/core/search.js).
// Returns { path, states, limitReached }.
export function solve(def, limit = 3000000) {
  return bfs(new Level(def), limit);
}

// Play a U/D/L/R move string; true if it ends with the level won.
export function replay(def, path) {
  const lvl = new Level(def);
  for (const c of path) lvl.move(NAMES[c]);
  return lvl.won;
}

if (process.argv[1]?.endsWith('solve.js')) {
  const optimal = process.argv.includes('--optimal');
  let bad = 0;
  const all = [...LEVELS, ...STAR_WORLDS];
  all.forEach((def, i) => {
    const label = def.starWorld ? `Star World ${def.chapter + 1}. ${def.name}` : `${i + 1}. ${def.name}`;
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
