// Small render helpers.

// Deterministic PRNG so a level's terrain looks the same every time.
export function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Free GPU resources of everything under `obj` (except shared textures).
export function disposeTree(obj, keepTextures = []) {
  obj.traverse((o) => {
    o.geometry?.dispose();
    const mats = !o.material ? [] : Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (m.map && !keepTextures.includes(m.map)) m.map.dispose();
      m.dispose();
    }
  });
}
