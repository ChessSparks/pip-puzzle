// Pressure plate: metal ring with a pad that sinks and glows when pressed.
import * as THREE from 'three';
import { COLORS } from '../colors.js';

export function makePlate() {
  const group = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.4, 0.43, 0.06, 32),
    new THREE.MeshStandardMaterial({ color: COLORS.plateBase, roughness: 0.5, metalness: 0.4 }),
  );
  base.position.y = 0.03;
  base.receiveShadow = true;
  group.add(base);

  const offColor = new THREE.Color(COLORS.plateOff);
  const onColor = new THREE.Color(COLORS.plateOn);
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.32, 0.06, 32),
    new THREE.MeshStandardMaterial({ color: offColor.clone(), emissive: COLORS.plateOn, emissiveIntensity: 0.15 }),
  );
  pad.receiveShadow = true;
  group.add(pad);
  return { group, pad, offColor, onColor };
}
