// The 3D scene for one Level: places terrain and models, animates the events
// returned by Level.move(), and runs per-frame idle animation.
import * as THREE from 'three';
import { TILE } from '../core/Level.js';
import { ease } from '../core/anim.js';
import { COLORS } from './colors.js';
import { disposeTree } from './util.js';
import { buildTerrain, WATER_TOP } from './terrain.js';
import { splash } from './effects.js';
import {
  makePlayer, makeCrate, makeCrateTexture, makePlate, makeGate, makeExit, makeGuideArrow,
} from './models/index.js';

const FACING_ANGLE = { down: 0, right: Math.PI / 2, up: Math.PI, left: -Math.PI / 2 };

const MOVE_TIME = 0.15; // seconds per tile step
const SLIDE_EXTRA = 0.55; // extra MOVE_TIME per additional tile slid on ice
const CRATE_Y = 0.41;
const SUNK_Y = -0.4; // sunk crate's top sits flush with the grass

export class World {
  constructor(scene, animator) {
    this.scene = scene;
    this.anim = animator;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.crateTexture = makeCrateTexture();
    this.menuMode = false;
  }

  build(level) {
    this.level = level;
    this.anim.clear();
    disposeTree(this.root, [this.crateTexture]);
    this.root.clear();

    const terrain = buildTerrain(level, (x, z, y) => this.pos(x, z, y));
    this.root.add(terrain.group);
    this.water = terrain.water;

    this.plates = level.plates.map((p) => {
      const plate = makePlate();
      plate.group.position.copy(this.pos(p.x, p.z));
      this.root.add(plate.group);
      return { ...plate, cell: p, pressed: 0 };
    });

    this.gates = level.gates.map((g) => {
      const solid = (x, z) => [TILE.WALL, TILE.VOID].includes(level.tile(x, z));
      const alongZ = solid(g.x, g.z - 1) && solid(g.x, g.z + 1);
      const gate = makeGate(level.plates.length, alongZ);
      gate.group.position.copy(this.pos(g.x, g.z));
      this.root.add(gate.group);
      return { ...gate, open: level.gateOpen ? 1 : 0 };
    });

    this.exit = null;
    if (level.exit) {
      this.exit = makeExit();
      this.exit.group.position.copy(this.pos(level.exit.x, level.exit.z));
      this.root.add(this.exit.group);
    }

    this.boxes = new Map();
    for (const b of level.boxes) {
      const mesh = makeCrate(this.crateTexture);
      this.root.add(mesh);
      this.boxes.set(b.id, { mesh, glow: 0 });
    }

    this.player = makePlayer();
    this.root.add(this.player.group);

    // Tutorial guide arrows above each plate and the exit (hidden by default).
    this.guidesOn = false;
    this.guides = [...level.plates, ...(level.exit ? [level.exit] : [])].map((cell, i) => {
      const isExit = i >= level.plates.length;
      const arrow = makeGuideArrow(isExit ? COLORS.portal : COLORS.plateOn);
      arrow.position.copy(this.pos(cell.x, cell.z, isExit ? 2.1 : 1.45));
      arrow.scale.setScalar(0);
      this.root.add(arrow);
      return { arrow, cell, isExit, baseY: arrow.position.y, s: 0 };
    });

    this.syncInstant();
  }

  // Grid cell -> world position (level centred on the origin).
  pos(x, z, y = 0) {
    return new THREE.Vector3(x - (this.level.width - 1) / 2, y, z - (this.level.height - 1) / 2);
  }

  setGuides(on) {
    this.guidesOn = on;
  }

  // Menu mode: Pip idles happily and turns to watch `lookAt` (the camera).
  setMenuMode(on, lookAt = null) {
    this.menuMode = on;
    this.lookAt = lookAt;
    if (!on && this.player) this.resetPose();
  }

  resetPose() {
    const { body, eyes } = this.player;
    body.position.set(0, 0, 0);
    body.rotation.set(0, 0, 0);
    body.scale.set(1, 1, 1);
    for (const e of eyes) e.scale.y = 1.4;
  }

  // Snap everything to the level state (after reset/undo).
  syncInstant() {
    const lvl = this.level;
    const p = this.player;
    p.group.position.copy(this.pos(lvl.player.x, lvl.player.z));
    p.group.rotation.y = FACING_ANGLE[lvl.player.facing];
    p.group.scale.setScalar(1);
    this.resetPose();
    for (const b of lvl.boxes) {
      const { mesh } = this.boxes.get(b.id);
      mesh.position.copy(this.pos(b.x, b.z, b.sunk ? SUNK_Y : CRATE_Y));
      mesh.rotation.set(0, 0, 0);
      mesh.material.color.setHex(b.sunk ? COLORS.wetCrate : 0xffffff);
    }
  }

  // Animate the result of Level.move().
  applyEvent(ev, onWinAnimDone) {
    const lvl = this.level;
    const p = this.player;
    const facing = FACING_ANGLE[lvl.player.facing];
    this.turnTo(facing);

    if (ev.type === 'bump') {
      const dir = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing));
      const base = p.group.position.clone();
      this.anim.add(0.14, (k) => {
        p.group.position.copy(base).addScaledVector(dir, Math.sin(Math.PI * k) * 0.12);
      });
      return;
    }
    if (ev.type !== 'move') return;

    const from = p.group.position.clone();
    const to = this.pos(lvl.player.x, lvl.player.z);
    const pushing = !!ev.pushed;
    const sliding = ev.slid > 0;
    this.anim.add(MOVE_TIME * (1 + ev.slid * SLIDE_EXTRA), (k) => {
      p.group.position.lerpVectors(from, to, sliding ? ease.outCubic(k) : ease.outQuad(k));
      if (sliding) {
        // Glide: lean back a little, arms-out wobble.
        p.body.rotation.x = -Math.sin(Math.PI * k) * 0.18;
        p.body.rotation.z = Math.sin(k * Math.PI * 4) * 0.08 * (1 - k);
      } else if (pushing) {
        p.body.rotation.x = Math.sin(Math.PI * k) * 0.25; // lean into the crate
      } else {
        p.body.position.y = Math.sin(Math.PI * k) * 0.16; // little hop
        const squash = 1 + Math.sin(Math.PI * k) * 0.08;
        p.body.scale.set(1 / squash, squash, 1 / squash);
      }
    }, () => {
      if (ev.won) this.playWin(onWinAnimDone);
    });

    if (pushing) {
      const box = this.boxes.get(ev.pushed.id);
      const bFrom = box.mesh.position.clone();
      const bTo = this.pos(ev.pushed.to.x, ev.pushed.to.z, CRATE_Y);
      const tiles = Math.abs(ev.pushed.to.x - ev.pushed.from.x) + Math.abs(ev.pushed.to.z - ev.pushed.from.z);
      this.anim.add(
        MOVE_TIME * (1 + (tiles - 1) * SLIDE_EXTRA),
        (k) => box.mesh.position.lerpVectors(bFrom, bTo, ease.outQuad(k)),
        ev.pushed.sunk ? () => this.sinkCrate(box.mesh) : undefined,
      );
    }
  }

  // Crate drops into the water and bobs up to rest as a bridge, with a splash.
  sinkCrate(mesh) {
    const x = mesh.position.x;
    const z = mesh.position.z;
    let splashed = false;
    this.anim.add(0.38, (k) => {
      const low = SUNK_Y - 0.12;
      const y = k < 0.45
        ? CRATE_Y + (low - CRATE_Y) * (k / 0.45) ** 2
        : low + (SUNK_Y - low) * ease.outBack((k - 0.45) / 0.55);
      mesh.position.set(x, y, z);
      mesh.rotation.z = Math.sin(Math.PI * k) * 0.12;
      if (!splashed && y < WATER_TOP + 0.3) {
        splashed = true;
        mesh.material.color.setHex(COLORS.wetCrate);
        splash(this.root, this.anim, new THREE.Vector3(x, WATER_TOP, z));
      }
    }, () => mesh.rotation.set(0, 0, 0), { background: true });
  }

  turnTo(target) {
    const g = this.player.group;
    let delta = target - g.rotation.y;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    if (Math.abs(delta) < 1e-3) return;
    const start = g.rotation.y;
    this.anim.add(0.1, (k) => {
      g.rotation.y = start + delta * ease.outQuad(k);
    });
  }

  playWin(done) {
    const g = this.player.group;
    const base = g.position.clone();
    const rot = g.rotation.y;
    this.anim.add(1.1, (k) => {
      const e = ease.inOutQuad(k);
      g.position.set(base.x, base.y + e * 1.4, base.z);
      g.rotation.y = rot + e * Math.PI * 6;
      g.scale.setScalar(Math.max(0.001, 1 - e));
    }, done);
  }

  // Menu idle: watch the camera, sway, blink, double-hop every 3 s and do a
  // happy spin on every third hop.
  updateMenuPip(dt, time) {
    const { group, body, eyes } = this.player;
    if (this.lookAt) {
      const target = Math.atan2(this.lookAt.x - group.position.x, this.lookAt.z - group.position.z);
      const delta = Math.atan2(Math.sin(target - group.rotation.y), Math.cos(target - group.rotation.y));
      group.rotation.y += delta * Math.min(1, dt * 4);
    }
    const phase = time % 3;
    const hopping = phase < 0.7;
    const hop = hopping ? Math.abs(Math.sin((phase / 0.35) * Math.PI)) : 0;
    body.position.y = hop * 0.32;
    const squash = 1 + hop * 0.12;
    body.scale.set(1 / squash, squash, 1 / squash);
    body.rotation.y = hopping && time % 9 < 3 ? ease.inOutQuad(phase / 0.7) * Math.PI * 2 : 0;
    body.rotation.z = hopping ? 0 : Math.sin(time * 2.2) * 0.07;
    const blink = time % 2.7 < 0.12 || (time % 2.7 > 0.24 && time % 2.7 < 0.34);
    for (const e of eyes) e.scale.y = blink ? 0.2 : 1.4;
  }

  // Per-frame idle animation + smooth state-driven visuals.
  update(dt, time) {
    if (!this.level) return;
    const lvl = this.level;
    const smooth = (cur, target, speed) => cur + (target - cur) * Math.min(1, dt * speed);

    this.player.antennaTip.material.emissiveIntensity = 1.5 + Math.sin(time * 4) * 0.8;
    if (this.menuMode && !this.anim.busy) this.updateMenuPip(dt, time);

    for (const pl of this.plates) {
      pl.pressed = smooth(pl.pressed, lvl.isPlatePressed(pl.cell) ? 1 : 0, 12);
      pl.pad.position.y = 0.075 - pl.pressed * 0.045;
      pl.pad.material.color.lerpColors(pl.offColor, pl.onColor, pl.pressed);
      pl.pad.material.emissiveIntensity = 0.3 + Math.sin(time * 2.5) * 0.15 + pl.pressed * 1.5;
    }

    for (const [id, box] of this.boxes) {
      const b = lvl.boxes.find((bb) => bb.id === id);
      const onPlate = b && !b.sunk && lvl.tile(b.x, b.z) === TILE.PLATE;
      box.glow = smooth(box.glow, onPlate ? 1 : 0, 6);
      box.mesh.material.emissiveIntensity = box.glow * (0.12 + Math.sin(time * 3) * 0.04);
    }

    const lit = lvl.platesPressed;
    for (const gate of this.gates) {
      gate.open = smooth(gate.open, lvl.gateOpen ? 1 : 0, 5);
      gate.bars.position.y = -gate.open * 0.92;
      gate.lights.forEach((l, i) => {
        l.position.y = 1.2 + Math.sin(time * 2 + i) * 0.05;
        const on = l.userData.plateIndex < lit || lvl.gateOpen;
        l.material.color.setHex(on ? COLORS.lightOn : COLORS.lightOff);
        l.material.emissive.setHex(on ? COLORS.lightOn : COLORS.lightOff);
        l.material.emissiveIntensity = on ? 2 : 0.4;
      });
    }

    if (this.exit) this.exit.update(dt, time);
    if (this.water) this.water.position.y = Math.sin(time * 1.6) * 0.015;

    for (const g of this.guides) {
      const wanted = this.guidesOn && (g.isExit ? lvl.gateOpen : !lvl.isPlatePressed(g.cell));
      g.s = smooth(g.s, wanted ? 1 : 0, 8);
      g.arrow.visible = g.s > 0.01;
      g.arrow.scale.setScalar(g.s);
      g.arrow.position.y = g.baseY + Math.sin(time * 4) * 0.12;
      g.arrow.rotation.y = time * 1.5;
    }
  }
}
