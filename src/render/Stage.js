// Renderer, scene, lights, camera and orbit controls, plus camera framing
// and screen-relative input mapping.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DIRS } from '../core/Level.js';

// Fallback screen regions (in NDC, -1..1) the level may occupy, per mode and
// shape, used when `freeAreas` gives nothing. Normally the UI measures the
// space left free by the HUD, controls and menu (see Stage.freeAreas).
const AREAS = {
  play: {
    landscape: { xMin: -0.62, xMax: 0.62, yMin: -0.6, yMax: 0.6 },
    portrait: { xMin: -0.96, xMax: 0.96, yMin: -0.5, yMax: 0.74 },
  },
  menu: {
    landscape: { xMin: 0.0, xMax: 0.92, yMin: -0.72, yMax: 0.72 },
    portrait: { xMin: -0.92, xMax: 0.92, yMin: -0.3, yMax: 0.48 },
  },
};
const CAMERA_POLAR = 0.72; // radians from straight down

export class Stage {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minPolarAngle = 0.25;
    this.controls.maxPolarAngle = 1.15;

    this.mode = 'menu';
    this.level = null;
    // (mode) => [{ left, top, right, bottom }] in px, or null. Set by Game.
    this.freeAreas = null;

    this.setupLights();
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  setupLights() {
    this.scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x5a4636, 1.4));
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
    sun.position.set(6, 12, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    this.sun = sun;
    this.scene.add(sun, sun.target);
  }

  // 'menu': view auto-rotates and can't be dragged. 'play': player controls it.
  setMode(mode) {
    this.mode = mode;
    this.controls.enabled = mode === 'play';
    this.controls.autoRotate = mode === 'menu';
    if (this.level) this.frame(this.level, { keepView: true });
  }

  get portrait() {
    return this.camera.aspect < 0.8;
  }

  /**
   * Frame `level` for the current screen shape and mode. On portrait screens
   * a wide level is viewed from the side so its long axis runs up the screen.
   * With keepView the current rotation is kept and only the distance changes.
   */
  frame(level, { keepView = false } = {}) {
    this.level = level;
    const { width, height } = level;
    const menu = this.mode === 'menu';
    const target = new THREE.Vector3(0, 0, 0);
    const dir = new THREE.Vector3();
    if (keepView) {
      dir.subVectors(this.camera.position, this.controls.target).normalize();
    } else {
      // Camera on the -x side: the start is nearest you, the exit furthest away.
      const azimuth = this.portrait && width > height ? -Math.PI / 2 : 0;
      dir.setFromSphericalCoords(1, CAMERA_POLAR, azimuth);
    }

    // In the menu the island spins, so fit a square that covers every angle.
    const r = Math.hypot(width, height) / 2;
    const hx = menu ? r : width / 2;
    const hz = menu ? r : height / 2;
    const corners = [];
    for (const x of [-hx, hx])
      for (const y of [-0.6, 1.2])
        for (const z of [-hz, hz]) corners.push(new THREE.Vector3(x, y, z));

    const w = window.innerWidth;
    const h = window.innerHeight;
    const toNdc = (r) => ({ xMin: (r.left / w) * 2 - 1, xMax: (r.right / w) * 2 - 1, yMin: 1 - (r.bottom / h) * 2, yMax: 1 - (r.top / h) * 2 });
    let areas = (this.freeAreas?.(this.mode) ?? [])
      .filter((r) => r.right - r.left > 60 && r.bottom - r.top > 60)
      .map(toNdc);
    if (!areas.length) areas = [AREAS[menu ? 'menu' : 'play'][this.portrait ? 'portrait' : 'landscape']];

    // Binary-search the closest distance at which every corner stays inside
    // an area; use whichever area lets the level be biggest.
    this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    const p = new THREE.Vector3();
    const fitDistance = (maxX, maxY) => {
      const fits = (dist) => {
        this.camera.position.copy(target).addScaledVector(dir, dist);
        this.camera.lookAt(target);
        this.camera.updateMatrixWorld();
        return corners.every((c) => {
          p.copy(c).project(this.camera);
          return Math.abs(p.x) <= maxX && Math.abs(p.y) <= maxY;
        });
      };
      let lo = 2;
      let hi = 200;
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        if (fits(mid)) hi = mid;
        else lo = mid;
      }
      return hi;
    };
    let dist = Infinity;
    let centerX = 0;
    let centerY = 0;
    for (const a of areas) {
      const d = fitDistance((a.xMax - a.xMin) / 2, (a.yMax - a.yMin) / 2);
      if (d < dist) {
        dist = d;
        centerX = (a.xMax + a.xMin) / 2;
        centerY = (a.yMax + a.yMin) / 2;
      }
    }

    // Shift the rendered image so the level is centred in the allowed region.
    if (centerX || centerY) this.camera.setViewOffset(w, h, (-centerX * w) / 2, (centerY * h) / 2, w, h);
    this.camera.updateProjectionMatrix();

    this.controls.target.copy(target);
    this.camera.position.copy(target).addScaledVector(dir, dist);
    this.controls.minDistance = dist * 0.5;
    this.controls.maxDistance = dist * 1.8;
    this.controls.update();

    const cam = this.sun.shadow.camera;
    const sr = Math.max(width, height) * 0.75 + 1;
    cam.left = cam.bottom = -sr;
    cam.right = cam.top = sr;
    cam.updateProjectionMatrix();
  }

  // Map a screen-relative direction to a grid direction based on camera yaw,
  // so "up" always means "away from the camera".
  toGridDir(dirName) {
    const az = this.controls.getAzimuthalAngle();
    const quarter = ((Math.round(az / (Math.PI / 2)) % 4) + 4) % 4;
    const a = quarter * (Math.PI / 2);
    const d = DIRS[dirName];
    const x = Math.round(d.x * Math.cos(a) + d.z * Math.sin(a));
    const z = Math.round(-d.x * Math.sin(a) + d.z * Math.cos(a));
    return Object.keys(DIRS).find((k) => DIRS[k].x === x && DIRS[k].z === z);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.level) this.frame(this.level, { keepView: true });
  }

  render(dt) {
    this.controls.update(dt);
    this.renderer.render(this.scene, this.camera);
  }
}
