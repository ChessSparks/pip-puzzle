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
