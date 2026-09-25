// Static level geometry: grass/ice slabs, earth underneath, water, walls.
// Everything is instanced, so big levels stay cheap.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { TILE } from '../core/Level.js';
import { COLORS } from './colors.js';
import { mulberry32 } from './util.js';

export const WATER_TOP = -0.14;

/**
 * @param level  core Level
 * @param pos    (x, z, y) => Vector3, grid cell to world position
 * @returns { group, water } — water is the bobbing water mesh (or null)
 */
export function buildTerrain(level, pos) {
  const group = new THREE.Group();
  const cells = [];
  const walls = [];
  const waterCells = [];
  for (let z = 0; z < level.height; z++) {
    for (let x = 0; x < level.width; x++) {
      const t = level.tile(x, z);
      if (t === TILE.VOID) continue;
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
    c.setHex((cell.x + cell.z) % 2 ? COLORS.grassA : COLORS.grassB);
    c.offsetHSL(0, 0, (rand() - 0.5) * 0.03);
    top.setColorAt(i, c);
  });
  top.receiveShadow = true;

  // Earth underneath, random depths for a floating-island look.
  const earth = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.98, 1, 0.98),
    new THREE.MeshStandardMaterial({ color: COLORS.earth, roughness: 1 }),
    cells.length,
  );
  cells.forEach((cell, i) => {
    // Water tiles are a pit: their earth starts lower down.
    const topY = cell.water ? -0.6 : -0.3;
    const depth = 0.8 + rand() * 0.9;
    m.compose(pos(cell.x, cell.z, topY - depth / 2), q, s.set(1, depth, 1));
    earth.setMatrixAt(i, m);
  });
  earth.receiveShadow = true;
  group.add(top, earth);

  // Ice: glossy pale-blue slabs with little scratch marks.
  if (ice.length) {
    const iceMesh = new THREE.InstancedMesh(
      new RoundedBoxGeometry(1, 0.3, 1, 2, 0.05),
      new THREE.MeshStandardMaterial({ roughness: 0.08, metalness: 0.15 }),
      ice.length,
    );
    ice.forEach((cell, i) => {
      m.compose(pos(cell.x, cell.z, -0.15), q, s.set(1, 1, 1));
      iceMesh.setMatrixAt(i, m);
      c.setHex((cell.x + cell.z) % 2 ? COLORS.iceA : COLORS.iceB);
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

  // Stone walls.
  if (walls.length) {
    const wallMesh = new THREE.InstancedMesh(
      new RoundedBoxGeometry(0.96, 0.6, 0.96, 2, 0.08),
      new THREE.MeshStandardMaterial({ roughness: 0.85 }),
      walls.length,
    );
    walls.forEach((w, i) => {
      const h = 0.9 + rand() * 0.25;
      m.compose(pos(w.x, w.z, (0.6 * h) / 2), q, s.set(1, h, 1));
      wallMesh.setMatrixAt(i, m);
      c.setHex(COLORS.stone).offsetHSL(0, 0, (rand() - 0.5) * 0.08);
      wallMesh.setColorAt(i, c);
    });
    wallMesh.castShadow = true;
    wallMesh.receiveShadow = true;
    group.add(wallMesh);
  }

  return { group, water };
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
