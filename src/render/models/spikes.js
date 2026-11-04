// Spike trap: a dark metal grate with five spikes (`spikes`) that rise out of
// it. World moves spikes.position.y between SPIKE_DOWN_Y and SPIKE_UP_Y.
import * as THREE from 'three';

export const SPIKE_UP_Y = 0;
export const SPIKE_DOWN_Y = -0.5;

export function makeSpikes() {
  const group = new THREE.Group();
  const grate = new THREE.Mesh(
    new THREE.BoxGeometry(0.86, 0.03, 0.86),
    new THREE.MeshStandardMaterial({ color: 0x2c2830, roughness: 0.6, metalness: 0.6 }),
  );
  grate.position.y = 0.012;
  grate.receiveShadow = true;
  group.add(grate);

  const holeMat = new THREE.MeshBasicMaterial({ color: 0x0c0a0e });
  const holeGeo = new THREE.CircleGeometry(0.09, 12);
  const spikeMat = new THREE.MeshStandardMaterial({ color: 0xd8d4dc, roughness: 0.25, metalness: 0.85 });
  const tipMat = new THREE.MeshStandardMaterial({ color: 0xff7a3d, emissive: 0xff5a1f, emissiveIntensity: 0.8 });
  const coneGeo = new THREE.ConeGeometry(0.075, 0.42, 8);
  const tipGeo = new THREE.ConeGeometry(0.03, 0.08, 8);
  const spikes = new THREE.Group();
  for (const [x, z] of [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22], [0, 0]]) {
    const hole = new THREE.Mesh(holeGeo, holeMat);
    hole.rotation.x = -Math.PI / 2;
    hole.position.set(x, 0.029, z);
    group.add(hole);
    const cone = new THREE.Mesh(coneGeo, spikeMat);
    cone.position.set(x, 0.21, z);
    cone.castShadow = true;
    const tip = new THREE.Mesh(tipGeo, tipMat);
    tip.position.set(x, 0.39, z);
    spikes.add(cone, tip);
  }
  group.add(spikes);
  return { group, spikes, tipMat };
}
