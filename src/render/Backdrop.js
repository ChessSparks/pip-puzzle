// Scenery around the level: a sea of low-poly clouds below the island, a
// few far-off floating islets, the theme's weather (snow, petals, leaves,
// fireflies, dust or embers) and the Great Portal far off in the sky, lit
// one segment per spark found. Clouds sit below the island so they never come
// between the camera (which always looks down) and the level.
import * as THREE from 'three';
import { storage } from '../core/storage.js';
import { makeGreatPortal } from './models/greatPortal.js';

const PORTAL_SEEN_KEY = 'crateKeeper.portalSeen'; // sparks already shown lit
const PORTAL_SCREEN_Y = 0.7; // where it hangs on screen (NDC, top = 1)
const PORTAL_DISTANCE = 75;
const PORTAL_SCALE = 0.8;

// Weather particles: colour, size, fall speed (negative rises), sideways sway,
// additive glow and blinking.
const PARTICLES = {
  snow: { color: 0xffffff, size: 0.19, fall: 0.7, sway: 0.4, count: 260 },
  petals: { color: 0xffb7d5, size: 0.13, fall: 0.45, sway: 0.9, count: 120 },
  leaves: { color: 0xe8742c, size: 0.16, fall: 0.55, sway: 1.0, count: 130 },
  fireflies: { color: 0xd8ff7a, size: 0.14, fall: 0, sway: 0.5, count: 90, glow: true, blink: true },
  dust: { color: 0xf6dfb0, size: 0.09, fall: 0.08, sway: 1.4, count: 160 },
  embers: { color: 0xff8a3d, size: 0.12, fall: -0.6, sway: 0.5, count: 150, glow: true, blink: true },
};
const BOX = { x: 15, yMin: -5, yMax: 9, z: 15 };

export class Backdrop {
  constructor(scene) {
    this.scene = scene;
    this.cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: 0xdfe9ff, emissiveIntensity: 0.35, roughness: 1, flatShading: true,
    });
    this.isletTop = new THREE.MeshStandardMaterial({ color: 0x86c962, roughness: 1 });
    this.isletEarth = new THREE.MeshStandardMaterial({ color: 0x6d4a31, roughness: 1 });
    this.clouds = makeClouds(this.cloudMat);
    this.islets = makeIslets(this.isletTop, this.isletEarth);
    scene.add(this.clouds, ...this.islets);
    // Draw order makes the portal part of the sky: clouds first (without
    // writing depth), then the portal over them, then everything else,
    // which still passes in front of it.
    this.clouds.traverse((o) => {
      o.renderOrder = -2;
      o.userData.hideInBloom = true; // they'd cut into the portal's glow
    });
    this.cloudMat.depthWrite = false;
    this.portal = makeGreatPortal();
    this.portal.group.scale.setScalar(PORTAL_SCALE);
    this.portal.group.traverse((o) => (o.renderOrder = -1));
    scene.add(this.portal.group);
    this.portalSparks = null;
    this.portalAt = null; // optional { x, y, scale } screen override (promo shots)
    this.tmp = new THREE.Vector3();
    this.particles = null;
    this.particleKey = null;
    this.theme = null;
    this.particleScale = 1; // 0.5 on low quality
    this.lastTime = null;
  }

  // Light the Great Portal for `n` sparks. Sparks found since it was last
  // shown flare up (remembered across visits).
  setSparks(n) {
    if (n === this.portalSparks) return;
    const seen = Number(storage.get(PORTAL_SEEN_KEY) ?? n);
    this.portal.setSparks(n, Math.min(seen, n));
    this.portalSparks = n;
    storage.set(PORTAL_SEEN_KEY, String(n));
  }

  setQuality(q) {
    this.particleScale = q === 'low' ? 0.5 : 1;
    if (this.theme) this.setTheme(this.theme);
  }

  setTheme(theme) {
    this.theme = theme;
    this.cloudMat.color.setHex(theme.cloud[0]);
    this.cloudMat.emissive.setHex(theme.cloud[1]);
    this.isletTop.color.setHex(theme.islet[0]);
    this.isletEarth.color.setHex(theme.islet[1]);
    const key = `${theme.particles}:${theme.particleCount ?? ''}:${this.particleScale}`;
    if (key !== this.particleKey) this.setParticles(theme.particles, theme.particleCount);
    this.particleKey = key;
  }

  setParticles(kind, count) {
    if (this.particles) {
      this.scene.remove(this.particles);
      this.particles.geometry.dispose();
      this.particles.material.dispose();
      this.particles = null;
    }
    const cfg = PARTICLES[kind] && {
      ...PARTICLES[kind],
      count: Math.round((count ?? PARTICLES[kind].count) * this.particleScale),
    };
    if (!cfg) return;
    const pos = new Float32Array(cfg.count * 3);
    const seed = new Float32Array(cfg.count);
    for (let i = 0; i < cfg.count; i++) {
      pos[i * 3] = (Math.random() * 2 - 1) * BOX.x;
      pos[i * 3 + 1] = BOX.yMin + Math.random() * (BOX.yMax - BOX.yMin);
      pos[i * 3 + 2] = (Math.random() * 2 - 1) * BOX.z;
      seed[i] = Math.random() * 100;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: cfg.color,
      size: cfg.size,
      map: dotTexture(),
      transparent: true,
      depthWrite: false,
      blending: cfg.glow ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.particles = new THREE.Points(geo, mat);
    this.particles.userData = { cfg, seed };
    this.scene.add(this.particles);
  }

  update(time, camera) {
    const dt = this.lastTime === null ? 0 : Math.min(0.05, time - this.lastTime);
    this.lastTime = time;
    // Like the moon: always far off near the top of the view, facing you.
    if (camera) {
      // Narrow (portrait) screens: smaller and higher, clear of the island.
      const portrait = camera.aspect < 0.8;
      const at = this.portalAt ?? { x: 0, y: portrait ? 0.8 : PORTAL_SCREEN_Y, scale: portrait ? Math.max(0.45, camera.aspect / 0.9) : 1 };
      this.portal.group.scale.setScalar(PORTAL_SCALE * at.scale);
      const p = this.tmp.set(at.x, at.y, 0.5).unproject(camera).sub(camera.position).normalize();
      this.portal.group.position.copy(camera.position).addScaledVector(p, PORTAL_DISTANCE);
      this.portal.group.quaternion.copy(camera.quaternion);
      this.portal.update(dt, time);
    }
    for (const g of this.islets) {
      g.position.y = g.userData.baseY + Math.sin(time * 0.5 + g.userData.phase) * 0.3;
    }
    this.clouds.rotation.y = time * 0.012;

    if (!this.particles) return;
    const { cfg, seed } = this.particles.userData;
    const attr = this.particles.geometry.attributes.position;
    const p = attr.array;
    const span = BOX.yMax - BOX.yMin;
    for (let i = 0; i < seed.length; i++) {
      const s = seed[i];
      p[i * 3] += Math.sin(time * 0.8 + s) * cfg.sway * dt;
      p[i * 3 + 2] += Math.cos(time * 0.6 + s * 1.3) * cfg.sway * dt;
      p[i * 3 + 1] -= cfg.fall * (0.7 + (s % 1) * 0.6) * dt;
      if (cfg.fall === 0) p[i * 3 + 1] += Math.sin(time * 0.9 + s) * 0.25 * dt;
      // Wrap around the box so the weather never runs out.
      if (p[i * 3 + 1] < BOX.yMin) p[i * 3 + 1] += span;
      if (p[i * 3 + 1] > BOX.yMax) p[i * 3 + 1] -= span;
    }
    attr.needsUpdate = true;
    if (cfg.blink) this.particles.material.opacity = 0.75 + Math.sin(time * 2.3) * 0.25;
  }
}

let dot = null;
function dotTexture() {
  if (dot) return dot;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.85)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  dot = new THREE.CanvasTexture(c);
  return dot;
}

function makeClouds(mat) {
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

function makeIslets(top, earth) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
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
