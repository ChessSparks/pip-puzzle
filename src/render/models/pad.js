// Teleport pad: a hexagonal stone base with a glowing disc, a spinning swirl
// and rising sparks. Twin pads share a colour. Returns { group, update(time, boost) }.
import * as THREE from 'three';

// Kept clear of the plates' cyan so pads never look like plates.
export const PAD_COLORS = { 1: 0xffc94f, 2: 0xff5fd2, 3: 0x8cff6a };

export function makePad(pair) {
  const color = PAD_COLORS[pair] ?? PAD_COLORS[1];
  const group = new THREE.Group();

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.44, 0.46, 0.07, 6),
    new THREE.MeshStandardMaterial({ color: 0x3b3554, roughness: 0.6, metalness: 0.3 }),
  );
  base.position.y = 0.035;
  base.receiveShadow = true;
  group.add(base);

  const discMat = new THREE.MeshStandardMaterial({ color: 0x1a1830, emissive: color, emissiveIntensity: 0.9 });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.34, 32), discMat);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.072;
  group.add(disc);

  // Swirl: two thin arcs spinning just above the disc.
  const swirlMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
  const swirl = new THREE.Group();
  for (let i = 0; i < 2; i++) {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.2 + i * 0.07, 0.018, 6, 24, Math.PI * 1.1), swirlMat);
    arc.rotation.x = -Math.PI / 2;
    arc.rotation.z = i * Math.PI;
    swirl.add(arc);
  }
  swirl.position.y = 0.09;
  group.add(swirl);

  const sparkMat = new THREE.MeshBasicMaterial({ color });
  const sparkGeo = new THREE.SphereGeometry(0.035, 8, 6);
  const sparks = Array.from({ length: 3 }, (_, i) => {
    const s = new THREE.Mesh(sparkGeo, sparkMat);
    s.userData.phase = i / 3;
    group.add(s);
    return s;
  });

  return {
    group,
    // boost (0..1) flares the pad while something passes through it.
    update(time, boost = 0) {
      swirl.rotation.y = time * (2 + boost * 10);
      discMat.emissiveIntensity = 0.8 + Math.sin(time * 3) * 0.25 + boost * 2.5;
      for (const s of sparks) {
        const life = (time * 0.5 + s.userData.phase) % 1;
        const a = time * 1.6 + s.userData.phase * Math.PI * 2;
        s.position.set(Math.cos(a) * 0.34, 0.15 + life * 0.55, Math.sin(a) * 0.34);
        s.scale.setScalar(1 - life);
      }
    },
  };
}
