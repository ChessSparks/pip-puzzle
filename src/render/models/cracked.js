// Cracked floor: a slab with dark cracks over a small chunk of earth. When Pip
// steps off it, World drops the whole `group` into the sky.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mulberry32 } from '../util.js';

// Shared crack overlay: transparent canvas with jagged, branching lines.
export function makeCrackTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  const rand = mulberry32(7);
  g.strokeStyle = 'rgba(40, 22, 10, 0.85)';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const crack = (x, y, a, len, w) => {
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(x, y);
    const branches = [];
    for (let i = 0; i < 5; i++) {
      a += (rand() - 0.5) * 1.1;
      x += (Math.cos(a) * len) / 5;
      y += (Math.sin(a) * len) / 5;
      g.lineTo(x, y);
      if (w > 2 && rand() < 0.4) branches.push([x, y, a + (rand() < 0.5 ? 1 : -1)]);
    }
    g.stroke();
    for (const [bx, by, ba] of branches) crack(bx, by, ba, len * 0.45, w * 0.55);
  };
  for (let i = 0; i < 4; i++) crack(64, 64, (i / 4) * Math.PI * 2 + rand() * 0.6, 62, 4.5);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeCracked(topColor, earthColor, crackTexture) {
  const group = new THREE.Group();
  const top = new THREE.Mesh(
    new RoundedBoxGeometry(0.96, 0.3, 0.96, 2, 0.06),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(topColor).offsetHSL(0, -0.08, -0.07), roughness: 0.95 }),
  );
  top.position.y = -0.15;
  top.receiveShadow = true;
  top.castShadow = true;
  const cracks = new THREE.Mesh(
    new THREE.PlaneGeometry(0.94, 0.94),
    new THREE.MeshBasicMaterial({ map: crackTexture, transparent: true, depthWrite: false }),
  );
  cracks.rotation.x = -Math.PI / 2;
  cracks.position.y = 0.004;
  const earth = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.1, 0.8, 6),
    new THREE.MeshStandardMaterial({ color: earthColor, roughness: 1, flatShading: true }),
  );
  earth.position.y = -0.7;
  group.add(top, cracks, earth);
  return { group };
}
