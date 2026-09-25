// Key/value save storage. Defaults to localStorage; the platform layer can
// swap in another backend (e.g. CrazyGames' cloud-synced SDK.data) before the
// game reads anything. Every access is guarded: blocked storage or Node just
// means nothing is remembered.
let backend = null;

function current() {
  if (backend) return backend;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function useStorage(b) {
  backend = b;
}

export const storage = {
  get(key) {
    try {
      return current()?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      current()?.setItem(key, value);
    } catch {
      /* not persisted */
    }
  },
};
