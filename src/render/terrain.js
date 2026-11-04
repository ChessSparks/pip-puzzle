// Static level geometry: grass/ice slabs, earth underneath, water, walls,
// plus the theme's rock caps and the bits hanging under the island edges.
// Everything is instanced, so big levels stay cheap. Cracked floor isn't
// static (it crumbles), so World builds it.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { TILE } from '../core/Level.js';
import { COLORS } from './colors.js';
import { mulberry32 } from './util.js';

export const WATER_TOP = -0.14;

/**
 * @param level  core Level
 * @param pos    (x, z, y) => Vector3, grid cell to world position
 * @param theme  entry from themes.js
 * @param opts   { grass, dangles } — false skips grass tufts (low quality) /
 *               things hanging under the edges
 * @returns { group, water } — water is the bobbing water mesh (or null)
 */
export function buildTerrain(level, pos, theme, { grass = true, dangles: hang = true } = {}) {
  const group = new THREE.Group();
  const cells = [];
  const walls = [];
  const waterCells = [];
  for (let z = 0; z < level.height; z++) {
    for (let x = 0; x < level.width; x++) {
      const t = level.tile(x, z);
      if (t === TILE.VOID || t === TILE.CRACKED) continue;
      cells.push({ x, z, water: t === TILE.WATER, ice: t === TILE.ICE });
      if (t === TILE.WALL) walls.push({ x, z });
      if (t === TILE.WATER) waterCells.push({ x, z });
    }
  }
  const land = cells.filter((c) => !c.water && !c.ice);
  const ice = cells.filter((c) => c.ice);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const c = new THREE.Color();
  const rand = mulberry32(level.width * 131 + level.height * 17);

  // Grass top slabs.
  const top = new THREE.InstancedMesh(
    new RoundedBoxGeometry(1, 0.3, 1, 2, 0.05),
    new THREE.MeshStandardMaterial({ roughness: 0.9 }),
    land.length,
  );
  land.forEach((cell, i) => {
    m.compose(pos(cell.x, cell.z, -0.15), q, s.set(1, 1, 1));
    top.setMatrixAt(i, m);
    c.setHex((cell.x + cell.z) % 2 ? theme.grassA : theme.grassB);
    c.offsetHSL(0, 0, (rand() - 0.5) * 0.03);
    top.setColorAt(i, c);
  });
  top.receiveShadow = true;

  // Earth underneath, random depths for a floating-island look.
  const earth = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.98, 1, 0.98),
    new THREE.MeshStandardMaterial({
      color: theme.earth,
      roughness: 1,
      emissive: theme.earthGlow?.[0] ?? 0x000000,
      emissiveIntensity: theme.earthGlow?.[1] ?? 0,
    }),
    cells.length,
  );
  cells.forEach((cell, i) => {
    // Water tiles are a pit: their earth starts lower down.
    const topY = cell.water ? -0.6 : -0.3;
    const depth = 0.8 + rand() * 0.9;
    cell.bottom = topY - depth;
    m.compose(pos(cell.x, cell.z, topY - depth / 2), q, s.set(1, depth, 1));
    earth.setMatrixAt(i, m);
  });
  earth.receiveShadow = true;
  group.add(top, earth);

  // Ice: glossy pale-blue slabs with little scratch marks.
  if (ice.length) {
    const [iceA, iceB] = theme.ice ?? [COLORS.iceA, COLORS.iceB];
    const iceMesh = new THREE.InstancedMesh(
      new RoundedBoxGeometry(1, 0.3, 1, 2, 0.05),
      new THREE.MeshStandardMaterial({ roughness: 0.08, metalness: 0.15 }),
      ice.length,
    );
    ice.forEach((cell, i) => {
      m.compose(pos(cell.x, cell.z, -0.15), q, s.set(1, 1, 1));
      iceMesh.setMatrixAt(i, m);
      c.setHex((cell.x + cell.z) % 2 ? iceA : iceB);
      iceMesh.setColorAt(i, c);
    });
    iceMesh.receiveShadow = true;
    group.add(iceMesh, makeIceMarks(ice, pos));
  }

  // Water: translucent blocks filling the pits.
  let water = null;
  if (waterCells.length) {
    const h = WATER_TOP + 0.6;
    water = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, h, 1),
      new THREE.MeshStandardMaterial({
        color: COLORS.water,
        transparent: true,
        opacity: 0.78,
        roughness: 0.12,
        metalness: 0.1,
      }),
      waterCells.length,
    );
    waterCells.forEach((w, i) => {
      m.compose(pos(w.x, w.z, -0.6 + h / 2), q, s.set(1, 1, 1));
      water.setMatrixAt(i, m);
    });
    water.receiveShadow = true;
    group.add(water);
  }

  // Stone walls, with the theme's cap on top: a slab of snow/moss, or (for
  // glowing themes) a pair of crystal shards, so it never reads as floor.
  if (walls.length) {
    const wallMesh = new THREE.InstancedMesh(
      new RoundedBoxGeometry(0.96, 0.6, 0.96, 2, 0.08),
      new THREE.MeshStandardMaterial({ roughness: 0.85 }),
      walls.length,
    );
    const shards = !!theme.capGlow;
    const perRock = shards ? 2 : 1;
    const caps = theme.rockCap == null ? null : new THREE.InstancedMesh(
      shards ? new THREE.OctahedronGeometry(0.13, 0) : new RoundedBoxGeometry(0.9, 0.14, 0.9, 2, 0.06),
      new THREE.MeshStandardMaterial({
        color: theme.rockCap,
        roughness: shards ? 0.3 : 0.8,
        flatShading: shards,
        emissive: shards ? theme.rockCap : 0x000000,
        emissiveIntensity: theme.capGlow ?? 0,
      }),
      walls.length * perRock,
    );
    const e = new THREE.Euler();
    walls.forEach((w, i) => {
      const h = 0.9 + rand() * 0.25;
      m.compose(pos(w.x, w.z, (0.6 * h) / 2), q, s.set(1, h, 1));
      wallMesh.setMatrixAt(i, m);
      c.setHex(theme.stone).offsetHSL(0, 0, (rand() - 0.5) * 0.08);
      wallMesh.setColorAt(i, c);
      if (!caps) return;
      if (shards) {
        for (let k = 0; k < perRock; k++) {
          const sq = new THREE.Quaternion().setFromEuler(e.set((rand() - 0.5) * 0.6, rand() * Math.PI, (rand() - 0.5) * 0.6));
          const size = 0.8 + rand() * 0.5;
          const p = pos(w.x + (rand() - 0.5) * 0.4, w.z + (rand() - 0.5) * 0.4, 0.6 * h + 0.12);
          m.compose(p, sq, s.set(size, size * 2.2, size));
          caps.setMatrixAt(i * perRock + k, m);
        }
      } else {
        const w2 = 0.85 + rand() * 0.2;
        m.compose(pos(w.x, w.z, 0.6 * h - 0.02), q, s.set(w2, 1, w2));
        caps.setMatrixAt(i, m);
      }
    });
    wallMesh.castShadow = true;
    wallMesh.receiveShadow = true;
    group.add(wallMesh, makeRockDetails(level, walls, pos, theme, rand));
    if (caps) {
      caps.castShadow = true;
      group.add(caps);
    }
  }

  if (theme.tufts && grass) group.add(makeGrass(level, pos, theme));

  const dangles = hang && makeDangles(level, cells, pos, theme, rand);
  if (dangles) group.add(dangles);

  return { group, water };
}

// Rock detail: a darker strata band around each rock and a few pebbles
// scattered at its foot (only beside solid ground), in the rock's colour.
function makeRockDetails(level, walls, pos, theme, rand) {
  const group = new THREE.Group();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  const c = new THREE.Color();

  const bands = new THREE.InstancedMesh(
    new RoundedBoxGeometry(1, 0.07, 1, 1, 0.03),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(theme.stone).offsetHSL(0, 0, -0.14), roughness: 0.9 }),
    walls.length,
  );
  walls.forEach((w, i) => {
    m.compose(pos(w.x, w.z, 0.2 + rand() * 0.12), q, s.set(0.985, 1, 0.985));
    bands.setMatrixAt(i, m);
  });
  bands.receiveShadow = true;

  const perRock = 3;
  const pebbles = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(0.06, 0),
    new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }),
    walls.length * perRock,
  );
  walls.forEach((w, i) => {
    for (let k = 0; k < perRock; k++) {
      // Hug one of the rock's sides, just outside it.
      const a = rand() * Math.PI * 2;
      const r = 0.52 + rand() * 0.06;
      const dx = Math.max(-0.56, Math.min(0.56, Math.cos(a) * r * 1.3));
      const dz = Math.max(-0.56, Math.min(0.56, Math.sin(a) * r * 1.3));
      q.setFromEuler(e.set(rand() * 3, rand() * 3, rand() * 3));
      const nx = Math.abs(dx) > Math.abs(dz) ? Math.sign(dx) : 0;
      const nz = nx ? 0 : Math.sign(dz);
      const ground = ![TILE.VOID, TILE.WALL, TILE.WATER, TILE.CRACKED].includes(level.tile(w.x + nx, w.z + nz));
      const size = ground ? 0.6 + rand() * 0.8 : 0.0001;
      m.compose(pos(w.x + dx, w.z + dz, 0.02), q, s.set(size, size * 0.7, size));
      pebbles.setMatrixAt(i * perRock + k, m);
      c.setHex(theme.stone).offsetHSL(0, 0, (rand() - 0.5) * 0.12);
      pebbles.setColorAt(i * perRock + k, c);
    }
  });
  pebbles.castShadow = true;
  q.identity();
  group.add(bands, pebbles);
  return group;
}

// Grass tufts (and flowers) on plain floor tiles. Each tuft is a few thin
// blades; they stay low so crates, plates and Pip remain easy to read.
const FLOWER_COLORS = [0xffffff, 0xffd34f, 0xff8fb8, 0xb48cff];
function makeGrass(level, pos, theme) {
  const rand = mulberry32(level.width * 977 + level.height * 31);
  const floor = [];
  for (let z = 0; z < level.height; z++) {
    for (let x = 0; x < level.width; x++) if (level.tile(x, z) === TILE.FLOOR) floor.push({ x, z });
  }
  const group = new THREE.Group();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  const c = new THREE.Color();

  const TUFTS = 5;
  const BLADES = 3;
  const bladeGeo = new THREE.ConeGeometry(0.022, 0.16, 3);
  bladeGeo.translate(0, 0.08, 0); // grows up from its base
  const blades = new THREE.InstancedMesh(
    bladeGeo,
    new THREE.MeshStandardMaterial({ roughness: 0.8, flatShading: true }),
    floor.length * TUFTS * BLADES,
  );
  let i = 0;
  for (const cell of floor) {
    for (let t = 0; t < TUFTS; t++) {
      const tx = cell.x + (rand() - 0.5) * 0.85;
      const tz = cell.z + (rand() - 0.5) * 0.85;
      const shade = (rand() - 0.5) * 0.12;
      for (let b = 0; b < BLADES; b++) {
        q.setFromEuler(e.set((rand() - 0.5) * 0.7, rand() * Math.PI, (rand() - 0.5) * 0.7));
        const h = 0.6 + rand() * 0.7;
        m.compose(pos(tx + (rand() - 0.5) * 0.06, tz + (rand() - 0.5) * 0.06, 0), q, s.set(1, h, 1));
        blades.setMatrixAt(i, m);
        c.setHex(theme.tufts).offsetHSL(0, 0, shade + (rand() - 0.5) * 0.05);
        blades.setColorAt(i++, c);
      }
    }
  }
  blades.receiveShadow = true;
  group.add(blades);

  if (theme.flowers) {
    const spots = floor.filter(() => rand() < 0.35);
    const heads = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.035, 0),
      new THREE.MeshStandardMaterial({ roughness: 0.6, emissive: 0xffffff, emissiveIntensity: 0.08 }),
      Math.max(1, spots.length),
    );
    heads.count = spots.length;
    spots.forEach((cell, k) => {
      const p = pos(cell.x + (rand() - 0.5) * 0.8, cell.z + (rand() - 0.5) * 0.8, 0.1);
      m.compose(p, q.identity(), s.set(1, 0.7, 1));
      heads.setMatrixAt(k, m);
      heads.setColorAt(k, c.setHex(FLOWER_COLORS[Math.floor(rand() * FLOWER_COLORS.length)]));
    });
    group.add(heads);
  }
  return group;
}

// Things hanging under the island's outer cells: roots, icicles, crystals or
// glowing lava drips, depending on the theme.
function makeDangles(level, cells, pos, theme, rand) {
  const kind = theme.dangle;
  if (!kind) return null;
  const edge = cells.filter(({ x, z }) =>
    [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => level.tile(x + dx, z + dz) === TILE.VOID));
  if (!edge.length) return null;

  const glow = kind === 'crystals' || kind === 'lava';
  const color = { roots: 0x5a3a24, icicles: 0xd8f2ff, crystals: 0xb986ff, lava: 0xff6a1f }[kind];
  const geo = kind === 'roots'
    ? new THREE.CylinderGeometry(0.03, 0.012, 1, 5)
    : new THREE.ConeGeometry(kind === 'crystals' ? 0.09 : 0.07, 1, kind === 'crystals' ? 5 : 6);
  if (kind !== 'roots') geo.rotateX(Math.PI); // point down
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: kind === 'icicles' ? 0.15 : 0.8,
    transparent: kind === 'icicles',
    opacity: kind === 'icicles' ? 0.85 : 1,
    emissive: glow ? color : 0x000000,
    emissiveIntensity: glow ? (kind === 'lava' ? 1.8 : 1.1) : 0,
    flatShading: kind === 'crystals',
  });
  const perCell = 2;
  const mesh = new THREE.InstancedMesh(geo, mat, edge.length * perCell);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  let i = 0;
  for (const cell of edge) {
    for (let k = 0; k < perCell; k++) {
      const len = (kind === 'roots' ? 0.5 : 0.25) + rand() * 0.45;
      const p = pos(cell.x + (rand() - 0.5) * 0.7, cell.z + (rand() - 0.5) * 0.7, cell.bottom - len / 2 + 0.02);
      q.setFromEuler(e.set((rand() - 0.5) * 0.25, rand() * Math.PI, (rand() - 0.5) * 0.25));
      m.compose(p, q, s.set(1, len, 1));
      mesh.setMatrixAt(i++, m);
    }
  }
  return mesh;
}

// Little crack/glint marks so ice reads as ice, not glass.
function makeIceMarks(cells, pos) {
  const rand = mulberry32(cells.length * 977);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 });
  const geo = new THREE.PlaneGeometry(0.34, 0.035);
  const count = cells.length * 2;
  const marks = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const scale = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const cell = cells[i % cells.length];
    const p = pos(cell.x + (rand() - 0.5) * 0.6, cell.z + (rand() - 0.5) * 0.6, 0.004);
    q.setFromEuler(e.set(-Math.PI / 2, 0, rand() * Math.PI));
    m.compose(p, q, scale.set(0.6 + rand() * 0.8, 1, 1));
    marks.setMatrixAt(i, m);
  }
  return marks;
}
