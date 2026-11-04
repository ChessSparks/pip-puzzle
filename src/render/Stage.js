// Renderer, scene, lights, camera and orbit controls, plus camera framing,
// screen-relative input mapping and post-processing (selective bloom).
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { bendMaterial } from './bend.js';
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

// Bloom is selective: only things that really glow (strong emissive, or
// additive effects like beams and sparkles) go into the bloom pass; the rest
// is drawn black there, so it hides glows behind it. Weather that isn't
// additive is left out of that pass.
const BLOOM = { strength: 0.32, radius: 0.35, threshold: 0 };
const BLACK = new THREE.MeshBasicMaterial({ color: 0x000000 });
bendMaterial(BLACK); // so the bloom pass matches bent Star Worlds
const BLACK_FLAT = new THREE.MeshBasicMaterial({ color: 0x000000 }); // for things never bent
function glows(m) {
  if (m.blending === THREE.AdditiveBlending) return true;
  return !!m.emissive && m.emissiveIntensity * Math.max(m.emissive.r, m.emissive.g, m.emissive.b) >= 1.2;
}

// Final composite: the scene plus the bloom on top. Bloom adds light without
// adding alpha, so it glows over the CSS sky behind the transparent canvas.
const MixShader = {
  uniforms: { baseTexture: { value: null }, bloomTexture: { value: null } },
  vertexShader: `varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D baseTexture; uniform sampler2D bloomTexture; varying vec2 vUv;
    void main() { gl_FragColor = texture2D(baseTexture, vUv) + vec4(texture2D(bloomTexture, vUv).rgb, 0.0); }`,
};

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
    this.setupEnvironment();
    this.setupPost();
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  setupLights() {
    this.hemi = new THREE.HemisphereLight(0xcfe8ff, 0x5a4636, 1.4);
    this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
    sun.position.set(6, 12, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    this.sun = sun;
    this.scene.add(sun, sun.target);
  }

  // Soft studio reflections, so glossy and metal surfaces (Pip's shell, the
  // bronze portal, gate bars) have something to reflect.
  setupEnvironment() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;
    pmrem.dispose();
  }

  setupPost() {
    if (!this.renderer.capabilities.isWebGL2) return; // plain rendering, no bloom
    this.bloomComposer = new EffectComposer(this.renderer);
    this.bloomComposer.renderToScreen = false;
    this.bloomComposer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), BLOOM.strength, BLOOM.radius, BLOOM.threshold);
    this.bloomComposer.addPass(this.bloomPass);

    this.composer = new EffectComposer(this.renderer);
    // Multisampled, since rendering to a target skips the canvas antialiasing.
    this.composer.renderTarget1.samples = this.composer.renderTarget2.samples = 4;
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    const mix = new ShaderPass(new THREE.ShaderMaterial(MixShader), 'baseTexture');
    mix.material.uniforms.bloomTexture.value = this.bloomComposer.renderTarget2.texture;
    this.composer.addPass(mix);
    this.composer.addPass(new OutputPass()); // tone mapping + sRGB
    this.darkened = new Map();
  }

  // Bloom pass: everything that doesn't glow is drawn black (or hidden).
  renderBloom() {
    this.scene.traverse((o) => {
      if (o.userData.hideInBloom && o.visible) {
        this.darkened.set(o, null);
        o.visible = false;
      } else if (o.isMesh && !glows(o.material)) {
        this.darkened.set(o, o.material);
        // Bent (Star World) things need a bent stand-in; everything else flat.
        o.material = o.material.userData?.bent ? BLACK : BLACK_FLAT;
      } else if (o.isPoints && o.visible && o.material.blending !== THREE.AdditiveBlending) {
        this.darkened.set(o, null);
        o.visible = false;
      }
    });
    this.renderer.shadowMap.autoUpdate = false; // shadows don't change between the two passes
    this.bloomComposer.render();
    this.renderer.shadowMap.autoUpdate = true;
    for (const [o, mat] of this.darkened) {
      if (mat) o.material = mat;
      else o.visible = true;
    }
    this.darkened.clear();
  }

  // 'high' or 'low' (see core/settings.js): low drops bloom, renders at a
  // lower resolution and uses a smaller shadow map.
  setQuality(q) {
    this.low = q === 'low';
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.low ? 1.25 : 2));
    const size = this.low ? 1024 : 2048;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.resize();
  }

  // Light colours from a theme (see themes.js).
  setTheme(theme) {
    this.hemi.color.setHex(theme.hemi[0]);
    this.hemi.groundColor.setHex(theme.hemi[1]);
    this.hemi.intensity = theme.hemi[2] * 0.85; // the environment adds some fill light
    this.sun.color.setHex(theme.sun[0]);
    this.sun.intensity = theme.sun[1];
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
      dir.setFromSphericalCoords(1, level.polar ?? CAMERA_POLAR, azimuth);
    }

    // In the menu the island spins, so fit a square that covers every angle.
    const r = Math.hypot(width, height) / 2;
    const hx = menu ? r : width / 2;
    const hz = menu ? r : height / 2;
    const corners = [];
    for (const x of [-hx, hx])
      for (const y of [level.yMin ?? -0.6, 1.2])
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

  // World point -> screen point { x, y } in px (null if behind the camera).
  worldToScreen(v) {
    const p = v.clone().project(this.camera);
    if (p.z > 1) return null;
    return { x: ((p.x + 1) / 2) * window.innerWidth, y: ((1 - p.y) / 2) * window.innerHeight };
  }

  // Where a screen point ({ x, y } in px) lands on the horizontal plane at
  // height y (e.g. so Pip can glance toward an on-screen button).
  screenToWorld(point, y = 0) {
    if (!point) return null;
    const ndc = new THREE.Vector2((point.x / window.innerWidth) * 2 - 1, 1 - (point.y / window.innerHeight) * 2);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), hit) ? hit : null;
  }

  // The screen direction ('up' = away from the camera) of a grid direction.
  toScreenDir(gridDir) {
    return Object.keys(DIRS).find((s) => this.toGridDir(s) === gridDir);
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
    if (this.composer) {
      const pr = this.renderer.getPixelRatio();
      this.composer.setPixelRatio(pr);
      this.composer.setSize(w, h);
      this.bloomComposer.setPixelRatio(pr * 0.5); // bloom is blurry anyway: half resolution
      this.bloomComposer.setSize(w, h);
    }
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.level) this.frame(this.level, { keepView: true });
  }

  render(dt) {
    this.controls.update(dt);
    if (!this.composer || this.low) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.renderBloom();
    this.composer.render(dt);
  }
}
