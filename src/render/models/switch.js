// Spike switch: a round button whose colour shows the current spike pattern.
// Pip or a crate entering it flips every spike. Returns { group, cap, ring }.
import * as THREE from 'three';

// Switch colour before and after an odd number of presses.
export const SWITCH_COLORS = [0xff7a3d, 0x48e0c8];

export function makeSwitch() {
  const group = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.38, 0.42, 0.08, 24),
    new THREE.MeshStandardMaterial({ color: 0x3a3440, roughness: 0.5, metalness: 0.5 }),
  );
  base.position.y = 0.04;
  base.receiveShadow = true;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.3, 0.025, 8, 32),
    new THREE.MeshStandardMaterial({ color: SWITCH_COLORS[0], emissive: SWITCH_COLORS[0], emissiveIntensity: 1.2 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.085;
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.22, 0.1, 24),
    new THREE.MeshStandardMaterial({ color: SWITCH_COLORS[0], emissive: SWITCH_COLORS[0], emissiveIntensity: 0.5, roughness: 0.35 }),
  );
  cap.position.y = 0.12;
  cap.castShadow = true;
  group.add(base, ring, cap);
  return { group, cap, ring };
}
