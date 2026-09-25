// Gate: a door slab (`bars`) that sinks into the ground when open, plus one
// floating indicator orb per plate.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { COLORS } from '../colors.js';

export function makeGate(lightCount, alongZ) {
  const group = new THREE.Group();

  const bars = new THREE.Group();
  if (alongZ) bars.rotation.y = Math.PI / 2;
  const slabMat = new THREE.MeshStandardMaterial({
    color: 0x9a86c8,
    roughness: 0.45,
    metalness: 0.2,
    emissive: 0xff3050,
    emissiveIntensity: 0.12,
  });
  const slab = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.9, 0.55, 2, 0.06), slabMat);
  slab.position.y = 0.45;
  slab.castShadow = true;
  slab.receiveShadow = true;
  bars.add(slab);
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0xff3050, emissive: 0xff3050, emissiveIntensity: 2 });
  for (const y of [0.28, 0.62]) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.06, 0.57), stripeMat);
    stripe.position.y = y;
    bars.add(stripe);
  }
  group.add(bars);

  // Floating indicator orbs, one per plate, always in a camera-facing row.
  const lights = [];
  for (let i = 0; i < lightCount; i++) {
    const l = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 16, 12),
      new THREE.MeshStandardMaterial({ color: COLORS.lightOff, emissive: COLORS.lightOff }),
    );
    l.position.set((i - (lightCount - 1) / 2) * 0.26, 1.2, 0);
    l.userData.plateIndex = i;
    group.add(l);
    lights.push(l);
  }
  return { group, bars, lights };
}
