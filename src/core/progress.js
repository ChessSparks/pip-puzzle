// Saved progress (unlocked levels, best move counts) via core/storage.js.
// Loaded on first use.
import { storage } from './storage.js';

const KEY = 'crateKeeper.progress';

// Parses the saved JSON text; anything invalid gives null.
function parse(text) {
  try {
    const data = JSON.parse(text);
    if (data && typeof data === 'object') {
      return { unlocked: Number(data.unlocked) || 1, best: data.best ?? {}, worlds: data.worlds ?? {} };
    }
  } catch {
    /* fall through */
  }
  return null;
}

let loaded = null;
const state = () => (loaded ??= parse(storage.get(KEY)) ?? { unlocked: 1, best: {}, worlds: {} });

function save() {
  storage.set(KEY, JSON.stringify(state()));
}

export const progress = {
  // Number of levels the player may play (level index < unlocked).
  get unlocked() {
    return state().unlocked;
  },
  best(index) {
    return state().best[index] ?? null;
  },
  // Star Worlds (by chapter): best moves, or null.
  worldBest(chapter) {
    return state().worlds[chapter] ?? null;
  },
  completeWorld(chapter, moves) {
    const s = state();
    const prev = s.worlds[chapter];
    const isBest = prev == null || moves < prev;
    if (isBest) s.worlds[chapter] = moves;
    save();
    return isBest;
  },
  // Record a win; returns true if it's a new best.
  complete(index, moves) {
    const s = state();
    s.unlocked = Math.max(s.unlocked, index + 2);
    const prev = s.best[index];
    const isBest = prev == null || moves < prev;
    if (isBest) s.best[index] = moves;
    save();
    return isBest;
  },
};
