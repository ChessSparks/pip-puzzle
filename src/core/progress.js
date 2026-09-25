// Saved progress (unlocked levels, best move counts) in localStorage.
// Every access is guarded: private mode or blocked storage just means
// progress isn't remembered between visits.
const KEY = 'crateKeeper.progress';

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY));
    if (data && typeof data === 'object') return { unlocked: data.unlocked ?? 1, best: data.best ?? {} };
  } catch {
    /* fall through */
  }
  return { unlocked: 1, best: {} };
}

const state = load();

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* not persisted */
  }
}

export const progress = {
  // Number of levels the player may play (level index < unlocked).
  get unlocked() {
    return state.unlocked;
  },
  best(index) {
    return state.best[index] ?? null;
  },
  // Record a win; returns true if it's a new best.
  complete(index, moves) {
    state.unlocked = Math.max(state.unlocked, index + 2);
    const prev = state.best[index];
    const isBest = prev == null || moves < prev;
    if (isBest) state.best[index] = moves;
    save();
    return isBest;
  },
};
