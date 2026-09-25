// Saved progress (unlocked levels, best move counts) via core/storage.js
// (localStorage, or CrazyGames cloud saves). Loaded on first use so the
// platform can pick the storage backend first.
import { storage } from './storage.js';

const KEY = 'crateKeeper.progress';

function load() {
  try {
    const data = JSON.parse(storage.get(KEY));
    if (data && typeof data === 'object') return { unlocked: data.unlocked ?? 1, best: data.best ?? {} };
  } catch {
    /* fall through */
  }
  return { unlocked: 1, best: {} };
}

let loaded = null;
const state = () => (loaded ??= load());

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
