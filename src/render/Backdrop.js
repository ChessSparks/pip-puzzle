// Scenery around the level: a sea of low-poly clouds below the island and a
// few far-off floating islets. Clouds sit below the island so they never come
// between the camera (which always looks down) and the level.
import * as THREE from 'three';

export class Backdrop {
  constructor(scene) {
    this.clouds = makeClouds();
    this.islets = makeIslets();
    scene.add(this.clouds, ...this.islets);
  }

  update(time) {
    for (const g of this.islets) {
      g.position.y = g.userData.baseY + Math.sin(time * 0.5 + g.userData.phase) * 0.3;
    }
    this.clouds.rotation.y = time * 0.012;
  }
}

function makeClouds() {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, emissive: 0xdfe9ff, emissiveIntensity: 0.35, roughness: 1, flatShading: true,
  });
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const clouds = new THREE.Group();
  for (let i = 0; i < 16; i++) {
    const cloud = new THREE.Group();
    const puffs = 3 + Math.floor(Math.random() * 4);
    for (let j = 0; j < puffs; j++) {
      const puff = new THREE.Mesh(geo, mat);
      const s = 0.8 + Math.random() * 1.1;
      puff.scale.set(s, s * 0.7, s);
      puff.position.set((j - puffs / 2) * 1.1 + Math.random() * 0.4, Math.random() * 0.4, Math.random() * 0.8);
      cloud.add(puff);
    }
    const a = Math.random() * Math.PI * 2;
    const r = 10 + Math.random() * 20;
    cloud.position.set(Math.cos(a) * r, -6 - Math.random() * 5, Math.sin(a) * r);
    cloud.rotation.y = Math.random() * Math.PI;
    cloud.scale.setScalar(0.8 + Math.random() * 0.9);
    clouds.add(cloud);
  }
  return clouds;
}

function makeIslets() {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const top = new THREE.MeshStandardMaterial({ color: 0x86c962, roughness: 1 });
  const earth = new THREE.MeshStandardMaterial({ color: 0x6d4a31, roughness: 1 });
  const islets = [];
  for (let i = 0; i < 9; i++) {
    const g = new THREE.Group();
    const s = 0.6 + Math.random() * 1.4;
    const grass = new THREE.Mesh(geo, top);
    grass.scale.set(s, 0.25, s);
    const dirt = new THREE.Mesh(geo, earth);
    dirt.scale.set(s * 0.9, s * 0.9, s * 0.9);
    dirt.position.y = -0.125 - s * 0.45;
    g.add(grass, dirt);
    const a = (i / 9) * Math.PI * 2 + Math.random() * 0.4;
    const r = 16 + Math.random() * 8;
    g.position.set(Math.cos(a) * r, -5 - Math.random() * 5, Math.sin(a) * r);
    g.rotation.y = Math.random() * Math.PI;
    g.userData.phase = Math.random() * Math.PI * 2;
    g.userData.baseY = g.position.y;
    islets.push(g);
  }
  return islets;
}
