// Wooden crate with a canvas-drawn plank texture (shared between crates).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { COLORS } from '../colors.js';

export function makeCrate(texture) {
  const mat = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.8,
    emissive: COLORS.plateOn,
    emissiveIntensity: 0,
  });
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(0.82, 0.82, 0.82, 2, 0.05), mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function makeCrateTexture() {
  const size = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  g.fillStyle = '#c98a4b';
  g.fillRect(0, 0, size, size);
  // plank lines
  g.strokeStyle = 'rgba(90,50,20,0.35)';
  g.lineWidth = 2;
  for (let y = 32; y < size; y += 32) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(size, y);
    g.stroke();
  }
  // frame + diagonal brace
  g.strokeStyle = '#7a4a22';
  g.lineWidth = 14;
  g.strokeRect(7, 7, size - 14, size - 14);
  g.lineWidth = 12;
  g.beginPath();
  g.moveTo(14, size - 14);
  g.lineTo(size - 14, 14);
  g.stroke();
  // nails
  g.fillStyle = '#4a2d14';
  for (const [x, y] of [[12, 12], [size - 12, 12], [12, size - 12], [size - 12, size - 12]]) {
    g.beginPath();
    g.arc(x, y, 3, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
