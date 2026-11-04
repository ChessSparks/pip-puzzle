// The Great Portal: a giant stone ring far off in the sky, the goal of Pip's
// story. Ten segments, one per spark (core/story.js); found sparks glow
// orange and brighten the swirl inside. Built facing +z (Backdrop turns it
// to the camera). Returns { group, setSparks(n, flareFrom), update(dt, time) }.
import * as THREE from 'three';
import { COLORS } from '../colors.js';

const SEGMENTS = 10;
const R = 7; // ring radius
const DARK = new THREE.Color(0x2c2638);
const LIT = new THREE.Color(0xffa040);

export function makeGreatPortal() {
  const group = new THREE.Group();

  // Stone ring with a darker inner lip.
  const stone = new THREE.MeshStandardMaterial({ color: 0x4a4260, roughness: 0.8, metalness: 0.1 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 0.95, 16, 96), stone);
  const lip = new THREE.Mesh(
    new THREE.TorusGeometry(R - 0.75, 0.3, 10, 96),
    new THREE.MeshStandardMaterial({ color: 0x2a2438, roughness: 0.6 }),
  );
  group.add(ring, lip);

  // One glowing segment + gem per spark.
  const gap = 0.12;
  const arc = (Math.PI * 2) / SEGMENTS - gap;
  const segGeo = new THREE.TorusGeometry(R, 0.55, 10, 24, arc);
  const gemGeo = new THREE.OctahedronGeometry(0.55, 0);
  const segments = Array.from({ length: SEGMENTS }, (_, i) => {
    // Clockwise from the top, so they fill like a clock.
    const start = Math.PI / 2 - (i + 1) * ((Math.PI * 2) / SEGMENTS) + gap / 2;
    const mat = new THREE.MeshStandardMaterial({ color: 0x2c2638, emissive: COLORS.portal, emissiveIntensity: 0, roughness: 0.5 });
    const seg = new THREE.Mesh(segGeo, mat);
    seg.rotation.z = start;
    seg.position.z = 0.55;
    const gemMat = new THREE.MeshStandardMaterial({ color: 0x3a3048, emissive: 0xffd08a, emissiveIntensity: 0, flatShading: true });
    const gem = new THREE.Mesh(gemGeo, gemMat);
    const a = start + arc / 2;
    gem.position.set(Math.cos(a) * (R + 1.35), Math.sin(a) * (R + 1.35), 0.3);
    group.add(seg, gem);
    return { mat, gemMat, gem, lit: 0, target: 0, flare: 0 };
  });

  // Swirl inside: two counter-rotating spiral discs. Normal (not additive)
  // blending, so they stay orange on bright daytime skies too.
  const spiral = makeSpiralTexture();
  const swirlMats = [0, 1].map((i) => new THREE.MeshBasicMaterial({
    map: spiral, color: i ? 0xffc070 : COLORS.portal, transparent: true, opacity: 0, depthWrite: false,
  }));
  const swirls = swirlMats.map((m, i) => {
    const d = new THREE.Mesh(new THREE.CircleGeometry(R - 0.9, 64), m);
    d.position.z = -0.2 + i * 0.05;
    d.scale.setScalar(i ? 0.7 : 1);
    group.add(d);
    return d;
  });

  // Soft glow behind it, and light rays once it's whole again.
  const glowMat = new THREE.MeshBasicMaterial({
    map: makeGlowTexture(), color: 0xffa040, transparent: true, opacity: 0, depthWrite: false,
  });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(R * 5, R * 5), glowMat);
  glow.position.z = -1;
  const raysMat = new THREE.MeshBasicMaterial({
    map: makeRaysTexture(), color: 0xffb860, transparent: true, opacity: 0, depthWrite: false,
  });
  const rays = new THREE.Mesh(new THREE.PlaneGeometry(R * 4.5, R * 4.5), raysMat);
  rays.position.z = -0.8;
  group.add(glow, rays);

  // Never part of a bent Star World. The soft glow, rays and swirl are glow
  // already: kept out of the bloom pass so they don't wash out to white.
  group.traverse((o) => (o.userData.noBend = true));
  for (const o of [glow, rays, ...swirls]) o.userData.hideInBloom = true;

  let sparks = 0;
  return {
    group,
    // Light `n` segments; ones above `flareFrom` flare up as newly found.
    setSparks(n, flareFrom = n) {
      sparks = n;
      segments.forEach((s, i) => {
        s.target = i < n ? 1 : 0;
        if (i >= flareFrom && i < n) {
          s.flare = 1;
          s.lit = 0;
        }
      });
    },
    update(dt, time) {
      const k = Math.min(1, dt * 1.5);
      const whole = sparks >= SEGMENTS;
      segments.forEach((s, i) => {
        s.lit += (s.target - s.lit) * k;
        s.flare = Math.max(0, s.flare - dt * 0.35);
        const pulse = s.flare > 0 ? Math.sin(time * 9) * 0.5 + 0.5 : 0;
        s.mat.color.lerpColors(DARK, LIT, s.lit); // lit segments are orange even without bloom
        s.mat.emissiveIntensity = s.lit * (1.6 + Math.sin(time * 2 + i * 0.6) * 0.25) + s.flare * (2 + pulse * 2);
        s.gemMat.emissiveIntensity = s.lit * 1.4 + s.flare * 3;
        s.gem.rotation.y = time * (0.6 + s.flare * 6);
        s.gem.scale.setScalar(1 + s.flare * 0.6 * pulse);
      });
      const f = sparks / SEGMENTS;
      swirlMats[0].opacity = 0.12 + f * 0.6;
      swirlMats[1].opacity = 0.06 + f * 0.4;
      swirls[0].rotation.z = -time * (0.15 + f * 0.5);
      swirls[1].rotation.z = time * (0.25 + f * 0.7);
      // Kept soft: with bloom on, more would wash out to white.
      glowMat.opacity = f * 0.28 + (whole ? 0.08 + Math.sin(time * 1.5) * 0.03 : 0);
      raysMat.opacity = whole ? 0.22 + Math.sin(time * 0.8) * 0.05 : 0;
      rays.rotation.z = time * 0.05;
    },
  };
}

function canvasTexture(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSpiralTexture() {
  return canvasTexture(256, (g, s) => {
    const c = s / 2;
    const core = g.createRadialGradient(c, c, 0, c, c, c);
    core.addColorStop(0, 'rgba(255,255,255,0.9)');
    core.addColorStop(0.4, 'rgba(255,255,255,0.2)');
    core.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = core;
    g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(255,255,255,0.7)';
    g.lineCap = 'round';
    for (let arm = 0; arm < 5; arm++) {
      g.beginPath();
      for (let t = 0; t <= 1; t += 0.01) {
        const a = arm * ((Math.PI * 2) / 5) + t * Math.PI * 2.4;
        const r = t * c * 0.95;
        if (t === 0) g.moveTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
        else g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
      }
      g.lineWidth = 7;
      g.stroke();
    }
  });
}

function makeGlowTexture() {
  return canvasTexture(128, (g, s) => {
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.3, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  });
}

function makeRaysTexture() {
  return canvasTexture(256, (g, s) => {
    const c = s / 2;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const grad = g.createLinearGradient(c, c, c + Math.cos(a) * c, c + Math.sin(a) * c);
      grad.addColorStop(0, 'rgba(255,255,255,0.8)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(c, c);
      g.arc(c, c, c, a - 0.07, a + 0.07);
      g.closePath();
      g.fill();
    }
  });
}
