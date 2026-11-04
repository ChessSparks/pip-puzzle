// Gate: a stone archway (two pillars with rune strips, a lintel with a
// floating gem) holding metal bars and a shimmering energy field. When the
// gate opens the bars (`bars`) sink, the field fades and the runes turn from
// orange to cyan. One indicator orb per plate floats above the arch (`lights`).
// Returns { group, bars, lights, update(time, open) }.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { COLORS } from '../colors.js';

const CLOSED = new THREE.Color(COLORS.portal); // orange while shut
const OPEN = new THREE.Color(COLORS.lightOn);
export const GATE_LIGHT_Y = 1.5;

export function makeGate(lightCount, alongZ) {
  const group = new THREE.Group();
  // Everything that spans the passage is turned to match it.
  const frame = new THREE.Group();
  if (alongZ) frame.rotation.y = Math.PI / 2;
  group.add(frame);

  const stone = new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 0.7, metalness: 0.1 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x4a2c1c, roughness: 0.5, metalness: 0.4 });
  const runeMat = new THREE.MeshStandardMaterial({ color: CLOSED.clone(), emissive: CLOSED.clone(), emissiveIntensity: 2 });

  // Pillars with a glowing rune strip on both faces.
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(new RoundedBoxGeometry(0.17, 1.2, 0.5, 2, 0.04), stone);
    pillar.position.set(side * 0.44, 0.6, 0);
    pillar.castShadow = pillar.receiveShadow = true;
    const foot = new THREE.Mesh(new RoundedBoxGeometry(0.23, 0.12, 0.56, 2, 0.03), trim);
    foot.position.set(side * 0.44, 0.06, 0);
    frame.add(pillar, foot);
    for (const face of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const rune = new THREE.Mesh(new THREE.BoxGeometry(0.05, k === 1 ? 0.2 : 0.1, 0.01), runeMat);
        rune.position.set(side * 0.44, 0.35 + k * 0.25, face * 0.252);
        frame.add(rune);
      }
    }
  }

  // Lintel with a floating, spinning gem.
  const lintel = new THREE.Mesh(new RoundedBoxGeometry(1.06, 0.15, 0.56, 2, 0.04), stone);
  lintel.position.y = 1.25;
  lintel.castShadow = true;
  const lintelTrim = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.03, 0.58), trim);
  lintelTrim.position.y = 1.16;
  frame.add(lintel, lintelTrim);
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.075, 0), runeMat);
  gem.position.y = 1.07;
  gem.scale.y = 1.4;
  frame.add(gem);

  // Bars + energy field: the part that sinks into the ground when open.
  const bars = new THREE.Group();
  frame.add(bars);
  const barMat = new THREE.MeshStandardMaterial({ color: 0xc07a3a, roughness: 0.3, metalness: 0.85 }); // bronze
  for (let i = 0; i < 5; i++) {
    const x = -0.28 + i * 0.14;
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 1.0, 10), barMat);
    bar.position.set(x, 0.5, 0);
    bar.castShadow = true;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.1, 10), runeMat);
    tip.position.set(x, 1.02, 0);
    bars.add(bar, tip);
  }
  for (const y of [0.25, 0.7]) {
    const rail = new THREE.Mesh(new RoundedBoxGeometry(0.72, 0.06, 0.08, 2, 0.02), barMat);
    rail.position.y = y;
    bars.add(rail);
  }
  const fieldTex = makeFieldTexture();
  const fieldMat = new THREE.MeshBasicMaterial({
    map: fieldTex, color: CLOSED.clone(), transparent: true, opacity: 0.6,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const field = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 1.0), fieldMat);
  field.position.y = 0.52;
  bars.add(field);

  // Floating indicator orbs, one per plate, in a row above the arch.
  const lights = [];
  for (let i = 0; i < lightCount; i++) {
    const l = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 16, 12),
      new THREE.MeshStandardMaterial({ color: COLORS.lightOff, emissive: COLORS.lightOff }),
    );
    l.position.set((i - (lightCount - 1) / 2) * 0.26, GATE_LIGHT_Y, 0);
    l.userData.plateIndex = i;
    group.add(l);
    lights.push(l);
  }

  const tint = new THREE.Color();
  return {
    group,
    bars,
    lights,
    // open: 0 (shut) .. 1 (fully open), already smoothed by World.
    update(time, open) {
      tint.copy(CLOSED).lerp(OPEN, open);
      runeMat.color.copy(tint);
      runeMat.emissive.copy(tint);
      runeMat.emissiveIntensity = 1.6 + Math.sin(time * 3) * 0.5;
      gem.rotation.y = time * 1.5;
      gem.position.y = 1.0 + Math.sin(time * 2) * 0.03;
      fieldMat.color.copy(tint);
      fieldMat.opacity = (1 - open) * (0.5 + Math.sin(time * 7) * 0.1);
      field.visible = open < 0.98;
      fieldTex.offset.y = -time * 0.6;
    },
  };
}

// Horizontal scan lines with a soft glow toward the edges, tiled vertically.
function makeFieldTexture() {
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 64;
  const g = cv.getContext('2d');
  const edge = g.createLinearGradient(0, 0, 64, 0);
  edge.addColorStop(0, 'rgba(255,255,255,0.55)');
  edge.addColorStop(0.5, 'rgba(255,255,255,0.12)');
  edge.addColorStop(1, 'rgba(255,255,255,0.55)');
  g.fillStyle = edge;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(255,255,255,0.75)';
  for (let y = 0; y < 64; y += 16) g.fillRect(0, y, 64, 3);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 2);
  return tex;
}
