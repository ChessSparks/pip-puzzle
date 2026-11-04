// Breadth-first search over Level states — the one solver, shared by
// tools/solve.js (shortest solutions) and the in-game hints / dead-end check.
import { Level } from './Level.js';

const NAMES = { U: 'up', D: 'down', L: 'left', R: 'right' };

/**
 * Search from the level's current state (its history is cleared).
 * `goal(key)` optionally marks other states as good enough to stop at (e.g.
 * any state on a known solution, from which the win is certain).
 * @returns { path, states, limitReached } — path is a U/D/L/R string to a
 *   win (or goal state), or null if none was found: with limitReached false
 *   that means the level can no longer be won from here.
 */
export function bfs(lvl, limit = 3000000, goal = null) {
  lvl.history = [];
  if (lvl.won || goal?.(lvl.key())) return { path: '', states: 1, limitReached: false };
  const seen = new Set([lvl.key()]);
  let frontier = [{ snap: lvl.snapshot(), path: '' }];
  while (frontier.length) {
    const next = [];
    for (const { snap, path } of frontier) {
      for (const dir of ['up', 'down', 'left', 'right']) {
        lvl.restore(snap);
        lvl.history = [];
        const ev = lvl.move(dir);
        if (!ev || ev.type !== 'move') continue;
        const p = path + dir[0].toUpperCase();
        if (ev.won) return { path: p, states: seen.size, limitReached: false };
        const k = lvl.key();
        if (goal?.(k)) return { path: p, states: seen.size, limitReached: false };
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

/**
 * The states along a level's stored solution: Map key -> index of the next
 * move in `def.solution` (the final, won state isn't included).
 */
export function solutionPath(def) {
  const path = new Map();
  if (!def.solution) return path;
  const lvl = new Level(def);
  [...def.solution].forEach((c, i) => {
    if (!path.has(lvl.key())) path.set(lvl.key(), i);
    lvl.move(NAMES[c]);
  });
  return path;
}
