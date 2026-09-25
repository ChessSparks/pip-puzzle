// Pip: capsule body, visor with glowing eyes, antenna, two feet.
// `group` is positioned/rotated on the grid; `body` is for hops, leans, squash.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { COLORS } from '../colors.js';

export function makePlayer() {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  const bodyMat = new THREE.MeshStandardMaterial({ color: COLORS.player, roughness: 0.45 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.27, 0.26, 8, 20), bodyMat);
  torso.position.y = 0.42;
  torso.castShadow = true;
  body.add(torso);

  const visor = new THREE.Mesh(
    new RoundedBoxGeometry(0.42, 0.2, 0.2, 2, 0.07),
    new THREE.MeshStandardMaterial({ color: COLORS.visor, roughness: 0.2, metalness: 0.3 }),
  );
  visor.position.set(0, 0.55, 0.17);
  body.add(visor);

  const eyeMat = new THREE.MeshStandardMaterial({ color: COLORS.eye, emissive: COLORS.eye, emissiveIntensity: 2 });
  const eyes = [-0.09, 0.09].map((sx) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), eyeMat);
    eye.position.set(sx, 0.56, 0.275);
    eye.scale.set(1, 1.4, 0.5);
    body.add(eye);
    return eye;
  });

  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.015, 0.015, 0.16),
    new THREE.MeshStandardMaterial({ color: 0x333a4d }),
  );
  antenna.position.y = 0.88;
  body.add(antenna);
  const antennaTip = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 12, 8),
    new THREE.MeshStandardMaterial({ color: COLORS.eye, emissive: COLORS.eye, emissiveIntensity: 2 }),
  );
  antennaTip.position.y = 0.98;
  body.add(antennaTip);

  for (const sx of [-0.13, 0.13]) {
    const foot = new THREE.Mesh(
      new RoundedBoxGeometry(0.14, 0.08, 0.2, 2, 0.03),
      new THREE.MeshStandardMaterial({ color: 0x333a4d, roughness: 0.6 }),
    );
    foot.position.set(sx, 0.04, 0.03);
    foot.castShadow = true;
    body.add(foot);
  }

  return { group, body, antennaTip, eyes };
}
