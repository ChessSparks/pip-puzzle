// Web worker: runs the BFS (core/search.js) off the main thread so moves
// stay smooth. Two kinds of question about a position:
//   { id, kind: 'dead', def, snapshot } -> { id, kind, dead }
//       Can the level still be won? `dead` only when the search ran out of
//       positions without a win (hitting the limit means "don't know").
//   { id, kind: 'hint', def, snapshot } -> { id, kind, move, dead }
//       The next move ('U'/'D'/'L'/'R') toward a win — along the level's
//       stored solution, or the shortest way back onto it — or null
//       (dead: true if no win exists; otherwise the search was too big).
import { Level } from '../core/Level.js';
import { bfs, solutionPath } from '../core/search.js';

const LIMITS = { dead: 80000, hint: 250000 };

// The stored solution's states, per level map.
const paths = new Map();
function pathFor(def) {
  const id = def.map.join('|');
  if (!paths.has(id)) paths.set(id, solutionPath(def));
  return paths.get(id);
}

self.onmessage = ({ data: { id, kind, def, snapshot } }) => {
  const lvl = new Level(def);
  lvl.restore(snapshot);
  // Any state on the stored solution can still be won, so the search stops
  // there: hints lead back onto the known solution, and on it they just
  // follow it. That keeps even the biggest levels quick.
  const onPath = pathFor(def);
  const here = onPath.get(lvl.key());
  if (here !== undefined) {
    self.postMessage(kind === 'hint' ? { id, kind, move: def.solution[here], dead: false } : { id, kind, dead: false });
    return;
  }
  const r = bfs(lvl, LIMITS[kind], (k) => onPath.has(k));
  const dead = !r.path && !r.limitReached;
  self.postMessage(kind === 'hint' ? { id, kind, move: r.path?.[0] ?? null, dead } : { id, kind, dead });
};
