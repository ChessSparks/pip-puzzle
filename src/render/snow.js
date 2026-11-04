// Snow lying on the island (themes with `snowCover`). Purely visual: Pip and
// crates plough it, so it piles up on the tile ahead of them and drifts form
// where it's pushed against rocks. Depth per cell: 1 = fresh snow, up to
// MAX_DEPTH for drifts. Undo/restart roll the snow back with the level.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { TILE } from '../core/Level.js';
import { mulberry32 } from './util.js';

const SLAB_H = 0.13; // height of fresh snow
const MAX_DEPTH = 1.9;
const LUMPS = 3; // soft lumps per cell on top of the slab
const PLAYER_PLOUGH = 0.8; // share of a cell's snow Pip pushes ahead
const CRATE_PLOUGH = 1; // crates clear their path completely

export class SnowCover {
  /**
   * @param level  core Level   @param pos  (x, z, y) => Vector3
   * @param cover  fraction of floor cells under snow (1 = all)
   */
  constructor(level, pos, cover) {
    this.level = level;
    this.pos = pos;
    this.group = new THREE.Group();
    const rand = mulberry32(level.width * 71 + level.height * 13 + 5);

    // Which cells can hold snow: plain floor only, so plates, the gate and
    // the exit stay easy to read.
    this.index = new Map(); // cell index -> slot
    this.cells = [];
    for (let z = 0; z < level.height; z++) {
      for (let x = 0; x < level.width; x++) {
        if (level.tile(x, z) !== TILE.FLOOR) continue;
        if (cover < 1 && rand() > cover) continue;
        this.index.set(z * level.width + x, this.cells.length);
        this.cells.push({ x, z, jitter: rand() });
      }
    }
    const n = this.cells.length;
    this.depth = new Float32Array(n);
    this.shown = new Float32Array(n);
    this.cells.forEach((c, i) => {
      const crate = level.boxAt(c.x, c.z);
      const start = level.player.x === c.x && level.player.z === c.z;
      this.depth[i] = start ? 0.2 : crate ? 0.35 : 0.8 + c.jitter * 0.4;
    });
    this.shown.set(this.depth);
    this.history = [];

    const snowMat = new THREE.MeshStandardMaterial({
      color: 0xf8fbff, roughness: 0.95, emissive: 0xdde9ff, emissiveIntensity: 0.18,
    });
    const slabGeo = new RoundedBoxGeometry(0.97, SLAB_H, 0.97, 2, 0.05);
    slabGeo.translate(0, SLAB_H / 2, 0); // grows up from the ground
    this.slabs = new THREE.InstancedMesh(slabGeo, snowMat, Math.max(1, n));
    this.slabs.count = n;
    this.slabs.receiveShadow = true;
    const lumpGeo = new THREE.SphereGeometry(0.17, 10, 7);
    this.lumps = new THREE.InstancedMesh(lumpGeo, snowMat, Math.max(1, n * LUMPS));
    this.lumps.count = n * LUMPS;
    this.lumps.receiveShadow = true;
    this.lumps.castShadow = true;
    this.lumpSpots = this.cells.flatMap(() =>
      Array.from({ length: LUMPS }, () => ({ dx: (rand() - 0.5) * 0.55, dz: (rand() - 0.5) * 0.55, s: 0.7 + rand() * 0.6 })));
    this.group.add(this.slabs, this.lumps);
    this.writeAll();
  }

  slot(x, z) {
    if (x < 0 || z < 0 || x >= this.level.width || z >= this.level.height) return -1;
    return this.index.get(z * this.level.width + x) ?? -1;
  }

  /**
   * Plough along `path` (list of cells entered, in order) moving `dir`
   * ({x, z}). Returns how much snow was moved (0 = none, for the crunch sound).
   */
  plough(path, dir, strength, onPuff) {
    let moved = 0;
    for (const { x, z } of path) {
      const i = this.slot(x, z);
      if (i < 0 || this.depth[i] < 0.02) continue;
      const amount = this.depth[i] * strength;
      this.depth[i] -= amount;
      moved += amount;
      onPuff?.(x, z, amount);
      // Pushed ahead; whatever can't go anywhere flies off in the puff.
      const j = this.slot(x + dir.x, z + dir.z);
      if (j >= 0) this.depth[j] = Math.min(MAX_DEPTH, this.depth[j] + amount * 0.85);
    }
    return moved;
  }

  // Ploughing for one Level.move() event: the crate first (it's in front),
  // then Pip's path. Cells are listed from the start, excluding it.
  ploughMove(ev, lvl, from, dir, onPuff) {
    this.history.push(this.depth.slice());
    let moved = 0;
    if (ev.pushed) {
      const p = ev.pushed; // p.to is the pad when the crate teleports
      moved += this.plough(line(p.from, p.to, dir), dir, CRATE_PLOUGH, onPuff);
      if (p.teleport) moved += this.plough([p.teleport.to], dir, CRATE_PLOUGH, onPuff);
    }
    const to = ev.teleport ? ev.teleport.from : { x: lvl.player.x, z: lvl.player.z };
    moved += this.plough(line(from, to, dir), dir, PLAYER_PLOUGH, onPuff);
    if (ev.teleport) moved += this.plough([ev.teleport.to], dir, PLAYER_PLOUGH, onPuff);
    return moved;
  }

  // Roll back to match the level's undo history (restart empties it).
  syncTo(historyLength) {
    if (this.history.length <= historyLength) return;
    while (this.history.length > historyLength + 1) this.history.pop();
    this.depth.set(this.history.pop());
    this.shown.set(this.depth);
    this.writeAll();
  }

  update(dt) {
    let changed = false;
    const k = Math.min(1, dt * 9);
    for (let i = 0; i < this.depth.length; i++) {
      const d = this.depth[i] - this.shown[i];
      if (Math.abs(d) < 1e-3) continue;
      this.shown[i] += d * k;
      changed = true;
    }
    if (changed) this.writeAll();
  }

  writeAll() {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    this.cells.forEach((c, i) => {
      const d = this.shown[i];
      m.compose(this.pos(c.x, c.z, 0), q, s.set(1, Math.max(0.001, d), 1));
      this.slabs.setMatrixAt(i, m);
      for (let l = 0; l < LUMPS; l++) {
        const spot = this.lumpSpots[i * LUMPS + l];
        const r = Math.max(0.001, Math.min(1, d) * spot.s);
        m.compose(
          this.pos(c.x + spot.dx, c.z + spot.dz, SLAB_H * d * 0.9),
          q,
          s.set(r, r * 0.45 * Math.max(0.6, d), r),
        );
        this.lumps.setMatrixAt(i * LUMPS + l, m);
      }
    });
    this.slabs.instanceMatrix.needsUpdate = true;
    this.lumps.instanceMatrix.needsUpdate = true;
  }
}

// Cells entered walking straight from `a` (exclusive) to `b` (inclusive).
function line(a, b, dir) {
  const cells = [];
  let { x, z } = a;
  for (let guard = 0; guard < 64 && (x !== b.x || z !== b.z); guard++) {
    x += dir.x;
    z += dir.z;
    cells.push({ x, z });
  }
  return cells;
}
