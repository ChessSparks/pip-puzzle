// Bobbing down-pointing arrow used by the tutorial to mark plates/exit.
import * as THREE from 'three';

export function makeGuideArrow(color) {
  const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.4 });
  const group = new THREE.Group();
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.34, 4), mat);
  head.rotation.x = Math.PI; // point down
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.28, 0.13), mat);
  shaft.position.y = 0.3;
  group.add(head, shaft);
  return group;
}
