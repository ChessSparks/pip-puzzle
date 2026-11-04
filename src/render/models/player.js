// Pip: a chibi robot — big rounded head with a glossy face screen (glowing
// eyes, smile, blush), ear pods and a bent antenna; a small body with a cream
// belly panel, chest light and backpack; posable arms; stubby legs.
//
// Returned parts (animated by World):
//   group       positioned/rotated on the grid
//   body        hops, leans, squash
//   head        pivot at the neck (look around, shake)
//   antenna     pivot at the antenna base (springy wobble)
//   antennaTip, chestLight, earRings   glowing bits (pulse)
//   eyes        rest at scale.y = 1.4 (squashed to blink / squint)
//   smile       rotation.z = PI smiles, 0 frowns
//   arms        shoulder pivots (rotation.x swings forward/back; userData.baseZ)
//   sweat       a sweat drop by the head (hidden unless Pip is worried)
// Faces +z.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { COLORS } from '../colors.js';

const NECK_Y = 0.44;

export function makePlayer() {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  const shell = new THREE.MeshPhysicalMaterial({
    color: COLORS.player, roughness: 0.38, metalness: 0.05, clearcoat: 0.6, clearcoatRoughness: 0.3,
  });
  const cream = new THREE.MeshStandardMaterial({ color: 0xfff0dc, roughness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2d3344, roughness: 0.55, metalness: 0.3 });
  const glow = (color, intensity = 2) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity });
  const add = (mesh, x, y, z, parent = body, shadow = true) => {
    mesh.position.set(x, y, z);
    mesh.castShadow = shadow;
    parent.add(mesh);
    return mesh;
  };

  // ---- Legs and feet ----
  for (const sx of [-0.1, 0.1]) {
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.048, 0.1, 10), dark), sx, 0.11, 0);
    add(new THREE.Mesh(new RoundedBoxGeometry(0.15, 0.08, 0.21, 2, 0.035), dark), sx, 0.04, 0.025);
  }

  // ---- Body ----
  add(new THREE.Mesh(new RoundedBoxGeometry(0.38, 0.28, 0.32, 3, 0.11), shell), 0, 0.28, 0);
  add(new THREE.Mesh(new RoundedBoxGeometry(0.24, 0.17, 0.03, 2, 0.012), cream), 0, 0.27, 0.152);
  const chestLight = add(new THREE.Mesh(new THREE.SphereGeometry(0.03, 14, 10), glow(COLORS.eye, 1.6)), 0, 0.3, 0.172);
  // Backpack battery with a little power stripe.
  add(new THREE.Mesh(new RoundedBoxGeometry(0.26, 0.2, 0.08, 2, 0.03), dark), 0, 0.29, -0.18);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.025, 0.012), glow(0x9dff6a, 1.2)), 0, 0.31, -0.222);
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.05, 14), dark), 0, NECK_Y, 0);

  // ---- Arms: shoulder pivots so they can swing ----
  const arms = [-1, 1].map((side) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.215, 0.36, 0);
    shoulder.rotation.z = shoulder.userData.baseZ = side * 0.22; // hang a little away from the body
    body.add(shoulder);
    add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), dark), 0, 0, 0, shoulder);
    add(new THREE.Mesh(new THREE.CapsuleGeometry(0.042, 0.1, 6, 12), shell), 0, -0.08, 0, shoulder);
    add(new THREE.Mesh(new THREE.SphereGeometry(0.052, 12, 10), cream), 0, -0.165, 0, shoulder);
    return shoulder;
  });

  // ---- Head (pivots at the neck) ----
  const head = new THREE.Group();
  head.position.y = NECK_Y;
  body.add(head);
  const hy = 0.21; // head centre above the neck
  add(new THREE.Mesh(new RoundedBoxGeometry(0.56, 0.43, 0.46, 4, 0.15), shell), 0, hy, 0, head);
  add(
    new THREE.Mesh(
      new RoundedBoxGeometry(0.43, 0.28, 0.04, 3, 0.07),
      new THREE.MeshPhysicalMaterial({ color: COLORS.visor, roughness: 0.12, metalness: 0.3, clearcoat: 1 }),
    ),
    0, hy - 0.005, 0.222, head, false,
  );

  // Eyes, each with a tiny highlight (a child, so it blinks with the eye).
  const eyeMat = glow(COLORS.eye, 2.2);
  const shine = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const eyes = [-0.095, 0.095].map((sx) => {
    const eye = add(new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), eyeMat), sx, hy + 0.025, 0.247, head, false);
    eye.scale.set(1, 1.4, 0.45);
    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), shine);
    hl.position.set(0.016, 0.018, 0.035);
    eye.add(hl);
    return eye;
  });

  // Smile and blush.
  const smile = add(new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.008, 6, 18, Math.PI), glow(COLORS.eye, 1.6)), 0, hy - 0.06, 0.244, head, false);
  smile.rotation.z = Math.PI;
  const blushMat = new THREE.MeshBasicMaterial({ color: 0xff7aa8, transparent: true, opacity: 0.75 });
  for (const sx of [-0.16, 0.16]) {
    const blush = add(new THREE.Mesh(new THREE.CircleGeometry(0.03, 16), blushMat), sx, hy - 0.045, 0.2425, head, false);
    blush.scale.y = 0.6;
  }

  // Ear pods with a glowing ring (shared material, so one pulse drives both).
  const ringMat = glow(COLORS.eye, 1.4);
  for (const side of [-1, 1]) {
    const pod = add(new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.06, 20), dark), side * 0.29, hy, 0, head);
    pod.rotation.z = Math.PI / 2;
    const ring = add(new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 8, 20), ringMat), side * 0.322, hy, 0, head, false);
    ring.rotation.y = Math.PI / 2;
  }

  // Bent antenna on a pivot (World springs it around) with a glowing tip.
  add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), dark), 0.06, hy + 0.205, -0.03, head);
  const antenna = new THREE.Group();
  antenna.position.set(0.06, hy + 0.205, -0.03);
  head.add(antenna);
  const stalk = add(new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.016, 0.17, 8), dark), 0.02, 0.085, 0, antenna);
  stalk.rotation.z = -0.25;
  const antennaTip = add(new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 10), glow(COLORS.eye)), 0.043, 0.175, 0, antenna);

  // Sweat drop (World slides it down the side of the head when worried).
  const sweat = new THREE.Group();
  const sweatMat = new THREE.MeshStandardMaterial({
    color: 0x9fdcff, emissive: 0x4fb8ff, emissiveIntensity: 0.4, roughness: 0.1, transparent: true,
  });
  const drop = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 10), sweatMat);
  drop.scale.y = 1.15;
  const point = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.05, 12), sweatMat);
  point.position.y = 0.04;
  sweat.add(drop, point);
  sweat.position.set(0.27, hy + 0.12, 0.14);
  sweat.visible = false;
  head.add(sweat);

  return { group, body, head, antenna, antennaTip, chestLight, earRings: ringMat, eyes, smile, arms, sweat };
}
