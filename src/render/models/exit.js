// Exit portal: glowing pad, spinning rings, light beam and rising sparkles.
// Returns { group, update(dt, time) }.
import * as THREE from 'three';
import { COLORS } from '../colors.js';

export function makeExit() {
  const group = new THREE.Group();

  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.45, 0.06, 40),
    new THREE.MeshStandardMaterial({ color: 0x2b1f3d, emissive: COLORS.portal, emissiveIntensity: 0.8 }),
  );
  pad.position.y = 0.03;
  group.add(pad);

  const ringMat = new THREE.MeshStandardMaterial({ color: COLORS.portal, emissive: COLORS.portal, emissiveIntensity: 2 });
  const rings = [0.34, 0.24].map((r, i) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.025, 10, 48), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.25 + i * 0.35;
    group.add(ring);
    return ring;
  });

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.38, 2.2, 32, 1, true),
    new THREE.MeshBasicMaterial({
      map: makeBeamTexture(),
      color: COLORS.portal,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  beam.position.y = 1.1;
  group.add(beam);

  const light = new THREE.PointLight(COLORS.portal, 3, 4, 1.5);
  light.position.y = 0.6;
  group.add(light);

  // Rising sparkles.
  const COUNT = 40;
  const positions = new Float32Array(COUNT * 3);
  const speeds = new Float32Array(COUNT);
  const respawn = (i, y = 0.05) => {
    const a = Math.random() * Math.PI * 2;
    const r = 0.1 + Math.random() * 0.25;
    positions.set([Math.cos(a) * r, y, Math.sin(a) * r], i * 3);
    speeds[i] = 0.4 + Math.random() * 0.7;
  };
  for (let i = 0; i < COUNT; i++) respawn(i, Math.random() * 2);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const sparkles = new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      color: 0xe6c8ff,
      size: 0.06,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  group.add(sparkles);

  return {
    group,
    update(dt, time) {
      rings[0].rotation.z = time * 0.8;
      rings[1].rotation.z = -time * 1.3;
      rings.forEach((r, i) => (r.position.y = 0.25 + i * 0.35 + Math.sin(time * 2 + i) * 0.05));
      light.intensity = 2.5 + Math.sin(time * 3) * 0.7;
      for (let i = 0; i < COUNT; i++) {
        positions[i * 3 + 1] += speeds[i] * dt;
        if (positions[i * 3 + 1] > 2) respawn(i);
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}

function makeBeamTexture() {
  const cv = document.createElement('canvas');
  cv.width = 4;
  cv.height = 128;
  const g = cv.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(1, 'rgba(255,255,255,0.55)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 128);
  return new THREE.CanvasTexture(cv);
}
