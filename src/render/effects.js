// One-shot visual effects. They run as background tweens so they never
// delay the player's next move.
import * as THREE from 'three';

// Expanding ring + flying droplets at `at` (world position on the water).
export function splash(root, anim, at) {
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.45, 32), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.copy(at).setY(at.y + 0.02);
  root.add(ring);

  const dropMat = new THREE.MeshStandardMaterial({ color: 0xbfe9ff, transparent: true });
  const dropGeo = new THREE.SphereGeometry(0.045, 8, 6);
  const drops = Array.from({ length: 14 }, () => {
    const d = new THREE.Mesh(dropGeo, dropMat);
    const a = Math.random() * Math.PI * 2;
    const sp = 0.8 + Math.random() * 1.2;
    d.userData.v = new THREE.Vector3(Math.cos(a) * sp, 2 + Math.random() * 1.5, Math.sin(a) * sp);
    d.position.copy(at);
    root.add(d);
    return d;
  });

  anim.add(0.6, (k) => {
    ring.scale.setScalar(0.5 + k * 1.6);
    ringMat.opacity = 1 - k;
    dropMat.opacity = 1 - k * k;
    const t = k * 0.6;
    for (const d of drops) {
      const v = d.userData.v;
      d.position.set(at.x + v.x * t, at.y + v.y * t - 6 * t * t, at.z + v.z * t);
    }
  }, () => {
    root.remove(ring, ...drops);
    ring.geometry.dispose();
    ringMat.dispose();
    dropGeo.dispose();
    dropMat.dispose();
  }, { background: true });
}

// Chunks of earth bursting off a crumbling tile at `at` and tumbling down.
export function crumble(root, anim, at, color) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true, transparent: true });
  const geo = new THREE.DodecahedronGeometry(0.07, 0);
  const bits = Array.from({ length: 10 }, () => {
    const b = new THREE.Mesh(geo, mat);
    const a = Math.random() * Math.PI * 2;
    const sp = 0.5 + Math.random() * 1.2;
    b.userData.v = new THREE.Vector3(Math.cos(a) * sp, 1 + Math.random() * 1.5, Math.sin(a) * sp);
    b.scale.setScalar(0.6 + Math.random() * 1.2);
    root.add(b);
    return b;
  });
  anim.add(0.9, (k) => {
    const t = k * 0.9;
    mat.opacity = 1 - k * k;
    for (const b of bits) {
      const v = b.userData.v;
      b.position.set(at.x + v.x * t, at.y + v.y * t - 5 * t * t, at.z + v.z * t);
      b.rotation.set(t * 6, t * 4, 0);
    }
  }, () => {
    root.remove(...bits);
    geo.dispose();
    mat.dispose();
  }, { background: true });
}

// Snow (or, with another colour, dust) kicked up along `dir`.
export function snowPuff(root, anim, at, dir, amount = 1, color = 0xffffff) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 1, transparent: true, depthWrite: false });
  const geo = new THREE.SphereGeometry(0.05, 6, 5);
  const count = 4 + Math.round(Math.min(1.5, amount) * 6);
  const bits = Array.from({ length: count }, () => {
    const b = new THREE.Mesh(geo, mat);
    const side = (Math.random() - 0.5) * 1.6;
    const fwd = 0.6 + Math.random() * 1.2;
    b.userData.v = new THREE.Vector3(dir.x * fwd + dir.z * side, 0.8 + Math.random() * 1.2, dir.z * fwd + dir.x * side);
    b.scale.setScalar(0.6 + Math.random() * 0.9);
    root.add(b);
    return b;
  });
  anim.add(0.55, (k) => {
    const t = k * 0.55;
    mat.opacity = 1 - k;
    for (const b of bits) {
      const v = b.userData.v;
      b.position.set(at.x + v.x * t, at.y + v.y * t - 3 * t * t, at.z + v.z * t);
    }
  }, () => {
    root.remove(...bits);
    geo.dispose();
    mat.dispose();
  }, { background: true });
}
