// One-way arrow tile: two glowing chevrons on a dark inlay, pointing the only
// way the tile can be entered. Returns { group, update(time) }.
import * as THREE from 'three';

const ANGLE = { right: 0, up: Math.PI / 2, left: Math.PI, down: -Math.PI / 2 };

function chevronGeometry() {
  const s = new THREE.Shape();
  s.moveTo(-0.1, 0.2);
  s.lineTo(0.08, 0);
  s.lineTo(-0.1, -0.2);
  s.lineTo(-0.02, -0.2);
  s.lineTo(0.16, 0);
  s.lineTo(-0.02, 0.2);
  s.closePath();
  const geo = new THREE.ShapeGeometry(s);
  geo.rotateX(-Math.PI / 2);
  return geo;
}

export function makeArrow(dir, color = 0xfff3c4) {
  const group = new THREE.Group();
  group.rotation.y = ANGLE[dir];

  const inlay = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.02, 0.8),
    new THREE.MeshStandardMaterial({ color: 0x000000, transparent: true, opacity: 0.18, roughness: 1 }),
  );
  inlay.position.y = 0.006;
  group.add(inlay);

  const geo = chevronGeometry();
  const chevrons = [-0.14, 0.12].map((x) => {
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, side: THREE.DoubleSide });
    const c = new THREE.Mesh(geo, mat);
    c.position.set(x, 0.02, 0);
    group.add(c);
    return c;
  });

  return {
    group,
    // A glow runs along the chevrons in the arrow's direction.
    update(time) {
      chevrons.forEach((c, i) => {
        c.material.emissiveIntensity = 0.35 + Math.max(0, Math.sin(time * 4 - i * 1.2)) * 1.3;
      });
    },
  };
}
