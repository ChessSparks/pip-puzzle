// Exit portal: a standing ring on a glowing rune base, with a swirling
// vortex inside, orbiting crystals, a soft light beam and rising sparkles.
// The ring faces +z; World turns `group` toward the way Pip arrives.
// Returns { group, update(dt, time) }.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { COLORS } from '../colors.js';

const RING_R = 0.36;
const RING_Y = 0.5; // ring centre height

export function makeExit() {
  const group = new THREE.Group();
  const glow = (color, intensity) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity });

  // Base: dark stone disc with a glowing inlaid circle.
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45, 0.48, 0.07, 6),
    new THREE.MeshStandardMaterial({ color: 0x3a2418, roughness: 0.6, metalness: 0.3 }),
  );
  base.position.y = 0.035;
  base.receiveShadow = true;
  const inlay = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.018, 8, 48), glow(COLORS.portal, 2));
  inlay.rotation.x = Math.PI / 2;
  inlay.position.y = 0.075;
  group.add(base, inlay);

  // Ring: a metal band with a glowing inner edge, held by two claws.
  const ring = new THREE.Group();
  ring.position.y = RING_Y;
  group.add(ring);
  const band = new THREE.Mesh(
    new THREE.TorusGeometry(RING_R, 0.055, 14, 64),
    new THREE.MeshStandardMaterial({ color: 0x9a5a2a, roughness: 0.3, metalness: 0.8 }),
  );
  band.castShadow = true;
  const edgeMat = glow(COLORS.portal, 2.4);
  const edge = new THREE.Mesh(new THREE.TorusGeometry(RING_R - 0.05, 0.016, 8, 64), edgeMat);
  ring.add(band, edge);
  // Studs around the band.
  const studMat = glow(0xffe0b0, 1.5);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const stud = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 6), studMat);
    stud.position.set(Math.cos(a) * RING_R, Math.sin(a) * RING_R, 0.05);
    ring.add(stud);
  }
  for (const side of [-1, 1]) {
    const claw = new THREE.Mesh(
      new RoundedBoxGeometry(0.1, 0.24, 0.16, 2, 0.03),
      new THREE.MeshStandardMaterial({ color: 0x5a3420, roughness: 0.5, metalness: 0.5 }),
    );
    claw.position.set(side * 0.27, 0.15, 0);
    claw.rotation.z = side * -0.5;
    claw.castShadow = true;
    group.add(claw);
  }

  // Vortex: two counter-rotating spiral discs inside the ring.
  const spiral = makeSpiralTexture();
  const vortexMats = [0.95, 0.6].map((opacity, i) => new THREE.MeshBasicMaterial({
    map: spiral, color: i ? 0xffffff : COLORS.portal, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }));
  const vortex = vortexMats.map((mat, i) => {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(RING_R - 0.04, 48), mat);
    disc.position.z = i * 0.005;
    disc.scale.setScalar(i ? 0.7 : 1);
    ring.add(disc);
    return disc;
  });

  // Crystals orbiting the ring.
  const crystalMat = glow(0xffd08a, 1.6);
  const crystals = Array.from({ length: 3 }, (_, i) => {
    const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.05, 0), crystalMat);
    c.scale.y = 1.6;
    c.userData.phase = (i / 3) * Math.PI * 2;
    group.add(c);
    return c;
  });

  // Soft beam rising from the ring.
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.32, 1.8, 32, 1, true),
    new THREE.MeshBasicMaterial({
      map: makeBeamTexture(), color: COLORS.portal, transparent: true, opacity: 0.7,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }),
  );
  beam.position.y = 1.45;
  group.add(beam);

  const light = new THREE.PointLight(COLORS.portal, 3, 4, 1.5);
  light.position.y = RING_Y;
  group.add(light);

  // Sparkles drifting up around the ring.
  const COUNT = 40;
  const positions = new Float32Array(COUNT * 3);
  const speeds = new Float32Array(COUNT);
  const respawn = (i, y = 0.05) => {
    const a = Math.random() * Math.PI * 2;
    const r = 0.15 + Math.random() * 0.3;
    positions.set([Math.cos(a) * r, y, Math.sin(a) * r], i * 3);
    speeds[i] = 0.4 + Math.random() * 0.7;
  };
  for (let i = 0; i < COUNT; i++) respawn(i, Math.random() * 2);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const sparkles = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xffd9a8, size: 0.06, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  group.add(sparkles);

  return {
    group,
    update(dt, time) {
      vortex[0].rotation.z = -time * 1.6;
      vortex[1].rotation.z = time * 2.4;
      const pulse = Math.sin(time * 3);
      vortex[1].scale.setScalar(0.65 + pulse * 0.06);
      edgeMat.emissiveIntensity = 2.2 + pulse * 0.6;
      ring.position.y = RING_Y + Math.sin(time * 1.5) * 0.02;
      inlay.rotation.z = time * 0.5;
      crystals.forEach((c) => {
        const a = time * 1.2 + c.userData.phase;
        c.position.set(Math.cos(a) * 0.5, RING_Y + Math.sin(a) * 0.5, Math.sin(a * 2) * 0.12);
        c.rotation.y = time * 3;
      });
      light.intensity = 2.5 + pulse * 0.7;
      for (let i = 0; i < COUNT; i++) {
        positions[i * 3 + 1] += speeds[i] * dt;
        if (positions[i * 3 + 1] > 2) respawn(i);
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}

// Spiral arms fading out from the centre, for the vortex discs.
function makeSpiralTexture() {
  const size = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  const c = size / 2;
  const core = g.createRadialGradient(c, c, 0, c, c, c);
  core.addColorStop(0, 'rgba(255,255,255,0.9)');
  core.addColorStop(0.35, 'rgba(255,255,255,0.25)');
  core.addColorStop(1, 'rgba(255,255,255,0.05)');
  g.fillStyle = core;
  g.fillRect(0, 0, size, size);
  g.strokeStyle = 'rgba(255,255,255,0.8)';
  g.lineCap = 'round';
  for (let arm = 0; arm < 4; arm++) {
    g.beginPath();
    for (let t = 0; t <= 1; t += 0.02) {
      const a = arm * (Math.PI / 2) + t * Math.PI * 2.2;
      const r = t * c * 0.95;
      const x = c + Math.cos(a) * r;
      const y = c + Math.sin(a) * r;
      if (t === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.lineWidth = 5;
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeBeamTexture() {
  const cv = document.createElement('canvas');
  cv.width = 4;
  cv.height = 128;
  const g = cv.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(1, 'rgba(255,255,255,0.45)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 128);
  return new THREE.CanvasTexture(cv);
}
