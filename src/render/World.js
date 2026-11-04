// The 3D scene for one Level: places terrain and models, animates the events
// returned by Level.move(), and runs per-frame idle animation.
import * as THREE from 'three';
import { TILE, DIRS } from '../core/Level.js';
import { ease } from '../core/anim.js';
import { COLORS } from './colors.js';
import { disposeTree } from './util.js';
import { buildTerrain, WATER_TOP } from './terrain.js';
import { splash, crumble, snowPuff } from './effects.js';
import { SnowCover } from './snow.js';
import { GATE_LIGHT_Y } from './models/gate.js';
import { BEND, bendTree, bendPoint } from './bend.js';
import { themeFor } from './themes.js';
import {
  makePlayer, makeCrate, makeCrateTexture, makePlate, makeGate, makeExit,
  makePad, makeArrow, makeCracked, makeCrackTexture, makeSwitch, SWITCH_COLORS,
  makeSpikes, SPIKE_UP_Y, SPIKE_DOWN_Y,
} from './models/index.js';

const FACING_ANGLE = { down: 0, right: Math.PI / 2, up: Math.PI, left: -Math.PI / 2 };

const MOVE_TIME = 0.15; // seconds per tile step
const PUSH_TIME = 0.24; // a push is slower: wind-up, then shove
const WINDUP = 0.22; // share of PUSH_TIME spent winding up before the crate moves
const SLIDE_EXTRA = 0.55; // extra MOVE_TIME per additional tile slid on ice
const TELEPORT_TIME = 0.34; // extra time to vanish into a pad and pop out of its twin
const CRATE_Y = 0.41;
const SUNK_Y = -0.4; // sunk crate's top sits flush with the grass

export class World {
  constructor(scene, animator) {
    this.scene = scene;
    this.anim = animator;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.crateTexture = makeCrateTexture();
    this.crackTexture = makeCrackTexture();
    this.menuMode = false;
    this.quality = 'high'; // set by Game; 'low' skips grass
    this.mood = { kind: null, start: 0, until: 0 }; // Pip's current expression
    this.time = 0;
    this.idleTime = 0;
    this.spring = { x: 0, z: 0, vx: 0, vz: 0 }; // antenna wobble
    this.lastPipPos = null;
    this.lastYaw = 0;
  }

  build(level, theme = themeFor()) {
    this.level = level;
    this.theme = theme;
    this.anim.clear();
    disposeTree(this.root, [this.crateTexture, this.crackTexture]);
    this.root.clear();

    // Star Worlds (wrapping maps) are bent into a little round planet (bend.js).
    BEND.radius.value = level.wrap ? level.width / (2 * Math.PI) : 0;
    const terrain = buildTerrain(level, (x, z, y) => this.pos(x, z, y), theme, {
      grass: this.quality !== 'low',
      dangles: !level.wrap, // nothing hangs below a planet
    });
    this.root.add(terrain.group);
    this.water = terrain.water;
    this.snow = theme.snowCover ? new SnowCover(level, (x, z, y) => this.pos(x, z, y), theme.snowCover) : null;
    if (this.snow) this.root.add(this.snow.group);

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
      // Turn the ring to face the tile Pip arrives from.
      const { x, z } = level.exit;
      const from = [[-1, 0], [1, 0], [0, -1], [0, 1]]
        .find(([dx, dz]) => ![TILE.VOID, TILE.WALL].includes(level.tile(x + dx, z + dz)));
      if (from) this.exit.group.rotation.y = Math.atan2(from[0], from[1]);
      this.root.add(this.exit.group);
    }

    this.buildMechanics(level, theme);

    this.boxes = new Map();
    for (const b of level.boxes) {
      const mesh = makeCrate(this.crateTexture);
      this.root.add(mesh);
      this.boxes.set(b.id, { mesh, glow: 0 });
    }

    this.player = makePlayer();
    this.root.add(this.player.group);

    this.introUpdate = null;
    this.hintArrow = null;
    this.syncInstant();
    if (level.wrap) {
      bendTree(this.root);
      this.root.add(this.makePlanetCore(level, theme));
    }
    this.playIntro();
  }

  // Level intro: the island assembles in a wave rising from below (starting
  // at Pip's spot), crates drop in with a bounce, then Pip lands. Runs as a
  // normal tween, so moves wait (and queue) until it's done.
  playIntro() {
    const lvl = this.level;
    const start = this.pos(lvl.player.x, lvl.player.z);
    const RISE = 0.5; // seconds for one piece to rise
    // How far the pieces start below (on a planet: above, falling in, since
    // below would be inside it).
    const LIFT = this.level.wrap ? -2.5 : 3.5;
    const WAVE = 0.05; // delay per unit of distance from Pip's start
    const delay = (x, z) => Math.hypot(x - start.x, z - start.z) * WAVE;
    const rise = (t, x, z) => {
      const k = Math.min(1, Math.max(0, (t - delay(x, z)) / RISE));
      return -LIFT * (1 - ease.outBack(k));
    };

    // Instanced pieces (terrain, grass, snow...) move instance by instance;
    // other models (plates, gate, exit, pads...) as a whole.
    const crates = new Set([...this.boxes.values()].map((b) => b.mesh));
    const instanced = [];
    const models = [];
    for (const child of this.root.children) {
      if (crates.has(child) || child === this.player.group) continue;
      let hasInstances = false;
      child.traverse((o) => {
        if (!o.isInstancedMesh) return;
        hasInstances = true;
        instanced.push({ mesh: o, base: o.instanceMatrix.array.slice() });
      });
      if (!hasInstances) models.push({ obj: child, y: child.position.y });
    }
    let far = 0;
    for (const { mesh, base } of instanced) {
      for (let i = 0; i < mesh.count; i++) far = Math.max(far, delay(base[i * 16 + 12], base[i * 16 + 14]));
    }
    const islandTime = far + RISE;
    const crateList = [...this.boxes.values()].map((b) => ({ mesh: b.mesh, y: b.mesh.position.y }));
    const crateStart = islandTime * 0.6;
    const CRATE_DROP = 0.4;
    const pipStart = Math.max(islandTime, crateStart + crateList.length * 0.07 + CRATE_DROP * 0.5);
    const PIP_DROP = 0.55;
    const total = pipStart + PIP_DROP;
    const pip = this.player;
    const pipBase = pip.group.position.clone();

    const update = (k) => {
      const t = k * total;
      for (const { mesh, base } of instanced) {
        const a = mesh.instanceMatrix.array;
        for (let i = 0; i < mesh.count; i++) {
          const j = i * 16;
          a[j + 13] = base[j + 13] + rise(t, base[j + 12], base[j + 14]);
        }
        mesh.instanceMatrix.needsUpdate = true;
      }
      for (const { obj, y } of models) obj.position.y = y + rise(t, obj.position.x, obj.position.z);
      crateList.forEach(({ mesh, y }, i) => {
        const c = Math.min(1, Math.max(0, (t - crateStart - i * 0.07) / CRATE_DROP));
        mesh.visible = c > 0;
        mesh.position.y = y + 4 * (1 - ease.outBounce(c));
      });
      // Pip drops in last and squashes on landing.
      const p = Math.min(1, Math.max(0, (t - pipStart) / PIP_DROP));
      pip.group.visible = p > 0;
      const fall = Math.min(1, p / 0.7);
      pip.group.position.y = pipBase.y + 5 * (1 - fall * fall);
      const land = p > 0.7 ? Math.sin(((p - 0.7) / 0.3) * Math.PI) : 0;
      pip.body.scale.set(1 + land * 0.18, 1 - land * 0.25, 1 + land * 0.18);
    };
    const finish = () => {
      if (!this.introUpdate) return;
      this.introUpdate = null;
      update(1);
      for (const { mesh } of crateList) mesh.visible = true;
      pip.group.visible = true;
      pip.body.scale.set(1, 1, 1);
    };
    this.introUpdate = finish;
    this.anim.add(total, update, finish);
  }

  // Teleport pads, one-way arrows, cracked floor, switches and spikes.
  buildMechanics(level, theme) {
    const place = (obj, x, z) => {
      obj.group.position.copy(this.pos(x, z));
      this.root.add(obj.group);
      return obj;
    };
    this.pads = level.pads.map((p) => ({ ...place(makePad(p.pair), p.x, p.z), cell: p, boost: 0 }));
    this.arrows = [...level.arrows].map(([i, dir]) => place(makeArrow(dir), i % level.width, Math.floor(i / level.width)));
    this.cracked = level.cracked.map((c) => {
      const color = (c.x + c.z) % 2 ? theme.grassA : theme.grassB;
      const obj = place(makeCracked(color, theme.earth, this.crackTexture), c.x, c.z);
      return { ...obj, cell: c, base: obj.group.position.clone() };
    });
    this.switches = level.switches.map((s) => ({ ...place(makeSwitch(), s.x, s.z), cell: s, press: 0 }));
    this.spikes = level.spikes.map((s) => ({ ...place(makeSpikes(), s.x, s.z), cell: s, up: 0 }));
    this.switchColor = 0;
  }

  // Grid cell -> world position (level centred on the origin).
  pos(x, z, y = 0) {
    return new THREE.Vector3(x - (this.level.width - 1) / 2, y, z - (this.level.height - 1) / 2);
  }

  // Menu mode: Pip idles happily and turns to watch `lookAt` (the camera).
  setMenuMode(on, lookAt = null) {
    this.menuMode = on;
    this.lookAt = lookAt;
    if (!on && this.player) this.resetPose();
  }

  resetPose() {
    const { body, head, eyes, smile } = this.player;
    body.position.set(0, 0, 0);
    body.rotation.set(0, 0, 0);
    body.scale.set(1, 1, 1);
    head.rotation.set(0, 0, 0);
    smile.rotation.z = Math.PI;
    smile.scale.setScalar(1);
    for (const e of eyes) e.scale.y = 1.4;
    this.wake();
    this.setArms(0, 0);
    this.mood.until = 0;
    this.lastPipPos = null;
  }

  // Input ends any idle pose (the head eases back to centre in update).
  wake() {
    const { body, arms } = this.player;
    body.position.y = 0;
    body.scale.set(1, 1, 1);
    for (const a of arms) a.rotation.z = a.userData.baseZ;
    this.idleTime = 0;
  }

  // Stuck: Pip sweats, frowns, fidgets and glances between the player and
  // the undo button. targets: { undo: () => Vector3|null, camera: () => Vector3 }.
  setWorried(on, targets) {
    this.worried = on ? { since: this.time, targets } : null;
    if (on) this.setMood('oops', 0.5); // a startled moment first
  }

  // Hints: Pip thinks (looks up, hand to chin), then turns and points while
  // a glowing arrow bobs on the tile to step onto (or on the crate to push).
  setThinking(on) {
    this.thinking = on;
  }

  // Story: Pip's mouth moves and his head bobs while he talks.
  setTalking(on) {
    this.talking = on;
  }

  showHint(dir) {
    this.clearHint();
    const lvl = this.level;
    const x = lvl.player.x + DIRS[dir].x;
    const z = lvl.player.z + DIRS[dir].z;
    const arrow = makeArrow(dir, 0xffe066);
    const y = lvl.boxAt(x, z) ? 0.84 : 0.03;
    arrow.group.position.copy(this.pos(x, z, y));
    this.root.add(arrow.group);
    this.hintArrow = { ...arrow, y };
    this.turnTo(FACING_ANGLE[dir]);
  }

  clearHint() {
    if (!this.hintArrow) return;
    this.root.remove(this.hintArrow.group);
    disposeTree(this.hintArrow.group);
    this.hintArrow = null;
  }

  // A Star World's solid core: a cylinder just under the bent ground, so the
  // planet's ends are clean round faces (built round, so not bent again).
  makePlanetCore(level, theme) {
    const rows = [];
    for (let z = 0; z < level.height; z++) {
      let n = 0;
      for (let x = 0; x < level.width; x++) if (level.tile(x, z) !== TILE.VOID) n++;
      if (n > 2) rows.push(z); // skip the exit's narrow stub
    }
    const R = level.width / (2 * Math.PI);
    const z0 = this.pos(0, rows[0] - 0.5).z;
    const z1 = this.pos(0, rows[rows.length - 1] + 0.5).z;
    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(R - 0.34, R - 0.34, z1 - z0, 48),
      new THREE.MeshStandardMaterial({ color: theme.earth, roughness: 1 }),
    );
    core.rotation.x = Math.PI / 2;
    core.position.set(0, -R, (z0 + z1) / 2);
    core.userData.noBend = true;
    return core;
  }

  // Point just above Pip's antenna, for the speech balloon.
  bubbleAnchor() {
    return bendPoint(this.player.group.position.clone().setY(this.player.group.position.y + 1.25));
  }

  // Show an expression for `duration` seconds: 'happy' | 'effort' | 'oops'.
  setMood(kind, duration) {
    this.mood = { kind, start: this.time, until: this.time + duration };
  }

  // Shoulder swing in radians (negative = forward).
  setArms(left, right = left) {
    const [l, r] = this.player.arms;
    l.rotation.x = left;
    r.rotation.x = right;
  }

  // Snap everything to the level state (after reset/undo).
  syncInstant() {
    this.introUpdate?.(); // restart mid-intro: snap the island into place
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
      mesh.scale.setScalar(1);
      mesh.material.color.setHex(b.sunk ? COLORS.wetCrate : 0xffffff);
    }
    for (const c of this.cracked) {
      c.group.position.copy(c.base);
      c.group.rotation.set(0, 0, 0);
      c.group.visible = !lvl.isBroken(c.cell.x, c.cell.z);
    }
    for (const s of this.spikes) {
      s.up = lvl.spikeUp(s.cell) ? 1 : 0;
      s.spikes.position.y = s.up ? SPIKE_UP_Y : SPIKE_DOWN_Y;
    }
    this.switchColor = lvl.flipped ? 1 : 0;
    this.snow?.syncTo(lvl.history.length);
    if (lvl.wrap) BEND.offset.value = p.group.position.x; // planet turned to Pip at once
  }

  // Animate the result of Level.move(). Returns { snow } (amount of snow
  // ploughed, for the crunch sound).
  applyEvent(ev, onWinAnimDone) {
    const lvl = this.level;
    const p = this.player;
    const facing = FACING_ANGLE[lvl.player.facing];
    this.turnTo(facing);
    this.wake();

    if (ev.type === 'bump') {
      this.setMood('oops', 0.7); // wide eyes, frown, head shake
      const dir = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing));
      const base = p.group.position.clone();
      this.anim.add(0.14, (k) => {
        p.group.position.copy(base).addScaledVector(dir, Math.sin(Math.PI * k) * 0.12);
      });
      return { snow: 0 };
    }
    if (ev.type !== 'move') return { snow: 0 };

    const from = p.group.position.clone();
    const to = this.pos(lvl.player.x, lvl.player.z);
    const dir = DIRS[lvl.player.facing];
    // On a wrapping planet, step on past the edge instead of jumping back
    // across the map (the bend is periodic, so it lands in the same place).
    if (lvl.wrap && !ev.teleport) to.set(from.x + dir.x * (1 + ev.slid), 0, from.z + dir.z * (1 + ev.slid));
    const pushing = !!ev.pushed;
    const sliding = ev.slid > 0;
    this.stepSide = -(this.stepSide ?? 1); // alternate which arm swings forward
    if (pushing) this.setMood('effort', PUSH_TIME + 0.1);
    if (ev.plateChange > 0 || (ev.gateChanged && lvl.gateOpen)) this.setMood('happy', 1.1);
    if (ev.won) this.setMood('happy', 3);
    const onWin = () => {
      if (ev.won) this.playWin(onWinAnimDone);
    };
    if (ev.teleport) {
      this.teleport(p.group, from, ev.teleport, 0, onWin, facing);
    } else if (pushing && !sliding) {
      this.anim.add(PUSH_TIME, (k) => {
        p.group.position.lerpVectors(from, to, pushEase(k));
        this.pushPose(k);
      }, onWin);
    } else {
      this.anim.add(MOVE_TIME * (1 + ev.slid * SLIDE_EXTRA), (k) => {
        p.group.position.lerpVectors(from, to, sliding ? ease.outCubic(k) : ease.outQuad(k));
        if (sliding) {
          // Glide: lean back a little, arms-out wobble.
          p.body.rotation.x = -Math.sin(Math.PI * k) * 0.18;
          p.body.rotation.z = Math.sin(k * Math.PI * 4) * 0.08 * (1 - k);
          this.setArms(-Math.sin(Math.PI * k) * 1.1 + Math.sin(k * Math.PI * 6) * 0.3); // arms out, flapping
        } else {
          p.body.position.y = Math.sin(Math.PI * k) * 0.16; // little hop
          const squash = 1 + Math.sin(Math.PI * k) * 0.08;
          p.body.scale.set(1 / squash, squash, 1 / squash);
          const swing = Math.sin(Math.PI * k) * 0.5 * this.stepSide;
          this.setArms(swing, -swing);
        }
      }, onWin);
    }

    if (pushing) {
      const box = this.boxes.get(ev.pushed.id);
      const bFrom = box.mesh.position.clone();
      const sink = ev.pushed.sunk ? () => this.sinkCrate(box.mesh) : undefined;
      if (ev.pushed.teleport) {
        const tp = { from: ev.pushed.to, ...ev.pushed.teleport };
        this.teleport(box.mesh, bFrom, tp, CRATE_Y, sink, 0);
      } else {
        const tiles = ev.pushed.steps;
        const bTo = lvl.wrap
          ? bFrom.clone().set(bFrom.x + dir.x * tiles, CRATE_Y, bFrom.z + dir.z * tiles)
          : this.pos(ev.pushed.to.x, ev.pushed.to.z, CRATE_Y);
        this.shoveCrate(box.mesh, bFrom, bTo, tiles, DIRS[lvl.player.facing], sink);
      }
    }

    let snow = 0;
    if (this.snow) {
      const before = lvl.history[lvl.history.length - 1].player;
      const dir = DIRS[lvl.player.facing];
      snow = this.snow.ploughMove(ev, lvl, before, dir, (x, z, amount) => {
        if (amount > 0.15) snowPuff(this.root, this.anim, this.pos(x, z, 0.1), dir, amount);
      });
    }

    if (ev.broke) this.crumbleTile(ev.broke);
    if (ev.toggled) {
      for (const s of this.switches) {
        if ((s.cell.x === lvl.player.x && s.cell.z === lvl.player.z) || lvl.boxAt(s.cell.x, s.cell.z)) s.press = 1;
      }
    }
    return { snow };
  }

  // Pip's push: crouch and reach out (wind-up), then lunge into the crate with
  // arms locked forward and little stepping bobs, then straighten up.
  pushPose(k) {
    const { body } = this.player;
    if (k < WINDUP) {
      const u = ease.outQuad(k / WINDUP);
      body.scale.set(1 + 0.06 * u, 1 - 0.08 * u, 1 + 0.06 * u);
      body.rotation.x = -0.12 * u;
      body.position.set(0, 0, -0.03 * u);
      this.setArms(-1.45 * u);
      return;
    }
    const v = (k - WINDUP) / (1 - WINDUP);
    const squash = 0.08 * (1 - v) ** 2;
    body.scale.set(1 + squash * 0.75, 1 - squash, 1 + squash * 0.75);
    body.rotation.x = 0.4 * (1 - v * v);
    body.position.set(0, Math.abs(Math.sin(v * Math.PI * 2)) * 0.03, 0.07 * Math.sin(Math.PI * v));
    this.setArms(-1.45 * (v < 0.75 ? 1 : (1 - v) / 0.25));
  }

  // The crate waits for the shove, squashes on contact, tips forward a touch
  // and settles; a puff of dust kicks up behind it.
  shoveCrate(mesh, from, to, tiles, dir, done) {
    const windup = PUSH_TIME * WINDUP;
    const travel = (PUSH_TIME - windup) * (1 + (tiles - 1) * SLIDE_EXTRA * 1.6);
    const total = windup + travel;
    let puffed = false;
    this.anim.add(total, (k) => {
      const t = k * total;
      if (t < windup) {
        mesh.position.copy(from);
        return;
      }
      const v = (t - windup) / travel;
      if (!puffed && !this.snow) {
        puffed = true;
        snowPuff(this.root, this.anim, from.clone().setY(0.05), dir, 0.5, this.theme.dust ?? 0xe8dcc4);
      }
      mesh.position.lerpVectors(from, to, ease.outQuad(v));
      const squash = 0.1 * Math.max(0, 1 - v * 3);
      const along = 1 - squash;
      const across = 1 + squash * 0.5;
      mesh.scale.set(dir.x ? along : across, 1 + squash * 0.3, dir.z ? along : across);
      const tip = Math.sin(Math.PI * v) * 0.12;
      mesh.rotation.set(dir.z * tip, 0, -dir.x * tip);
    }, () => {
      mesh.scale.setScalar(1);
      mesh.rotation.set(0, 0, 0);
      done?.();
    });
  }

  // Move `obj` from `start` onto the pad at tp.from, shrink into it, pop out
  // of the twin pad (tp.twin) and step off onto tp.to, ending turned to `spin`.
  teleport(obj, start, tp, y, done, spin) {
    const padPos = this.pos(tp.from.x, tp.from.z, y);
    const twinPos = this.pos(tp.twin.x, tp.twin.z, y);
    const end = this.pos(tp.to.x, tp.to.z, y);
    const total = MOVE_TIME * 2 + TELEPORT_TIME;
    const a = MOVE_TIME / total;
    const mid = (MOVE_TIME + TELEPORT_TIME / 2) / total;
    const b = (MOVE_TIME + TELEPORT_TIME) / total;
    for (const pad of this.pads) {
      if ((pad.cell.x === tp.from.x && pad.cell.z === tp.from.z) || (pad.cell.x === tp.twin.x && pad.cell.z === tp.twin.z)) pad.boost = 1;
    }
    this.anim.add(total, (k) => {
      if (k < a) {
        obj.position.lerpVectors(start, padPos, ease.outQuad(k / a));
        obj.scale.setScalar(1);
      } else if (k < mid) {
        const e = ease.inOutQuad((k - a) / (mid - a));
        obj.position.copy(padPos).setY(y + e * 0.35);
        obj.scale.setScalar(Math.max(0.001, 1 - e));
        obj.rotation.y = spin + e * Math.PI * 2;
      } else if (k < b) {
        const e = ease.outBack((k - mid) / (b - mid));
        obj.position.copy(twinPos).setY(y + (1 - Math.min(1, e)) * 0.35);
        obj.scale.setScalar(Math.max(0.001, e));
        obj.rotation.y = spin;
      } else {
        obj.scale.setScalar(1);
        obj.position.lerpVectors(twinPos, end, ease.outQuad((k - b) / (1 - b)));
      }
    }, done);
  }

  // A cracked tile Pip just left shakes, then falls away into the clouds.
  crumbleTile(cell) {
    const c = this.cracked.find((t) => t.cell.x === cell.x && t.cell.z === cell.z);
    if (!c) return;
    const g = c.group;
    const spinX = (Math.random() - 0.5) * 2;
    const spinZ = (Math.random() - 0.5) * 2;
    crumble(this.root, this.anim, c.base.clone(), this.theme.earth);
    this.anim.add(0.9, (k) => {
      if (k < 0.18) {
        g.position.copy(c.base);
        g.position.x += Math.sin(k * 120) * 0.03;
        return;
      }
      const t = (k - 0.18) / 0.82;
      g.position.set(c.base.x, c.base.y - 9 * t * t, c.base.z);
      g.rotation.set(spinX * t, 0, spinZ * t);
    }, () => {
      g.visible = !this.level.isBroken(cell.x, cell.z);
      g.position.copy(c.base);
      g.rotation.set(0, 0, 0);
    }, { background: true });
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
      this.setArms(-Math.min(1, k * 4) * 2.7); // arms up, hooray!
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
    // Cheer on each hop, otherwise a slow sway.
    if (hopping) this.setArms(-hop * 2.4);
    else this.setArms(Math.sin(time * 2.2) * 0.12, -Math.sin(time * 2.2) * 0.12);
    const blink = time % 2.7 < 0.12 || (time % 2.7 > 0.24 && time % 2.7 < 0.34);
    for (const e of eyes) e.scale.y = blink ? 0.2 : 1.4;
  }

  // Pip's always-on life: springy antenna, glowing pulses, blinking and
  // expressions, and (in play, after a few seconds without input) breathing,
  // looking around and waving at the player.
  animatePip(dt, time) {
    const p = this.player;
    const step = Math.max(dt, 1e-3);
    const mood = time < this.mood.until ? this.mood.kind : null;
    const moodT = time - this.mood.start;

    // Antenna: a damped spring pulled by Pip's motion in his own frame, so it
    // lags behind when he sets off and wobbles when he stops or turns.
    const pos = p.group.position;
    const yaw = p.group.rotation.y;
    let fwd = 0;
    let side = 0;
    if (this.lastPipPos) {
      const vx = (pos.x - this.lastPipPos.x) / step;
      const vz = (pos.z - this.lastPipPos.z) / step;
      fwd = vx * Math.sin(yaw) + vz * Math.cos(yaw);
      side = vx * Math.cos(yaw) - vz * Math.sin(yaw);
    }
    const turn = Math.atan2(Math.sin(yaw - this.lastYaw), Math.cos(yaw - this.lastYaw)) / step;
    this.lastPipPos = pos.clone();
    this.lastYaw = yaw;
    const clamp = (v) => Math.max(-0.5, Math.min(0.5, v));
    const sp = this.spring;
    const tx = clamp(-fwd * 0.07) + Math.sin(time * 1.7) * 0.04;
    const tz = clamp(side * 0.07 + turn * 0.03);
    const h = Math.min(dt, 1 / 30);
    sp.vx += ((tx - sp.x) * 90 - sp.vx * 6) * h;
    sp.vz += ((tz - sp.z) * 90 - sp.vz * 6) * h;
    sp.x += sp.vx * h;
    sp.z += sp.vz * h;
    p.antenna.rotation.set(sp.x, 0, sp.z);

    // Glowing bits pulse (brighter when happy).
    const joy = mood === 'happy' ? 1 : 0;
    p.antennaTip.material.emissiveIntensity = 1.5 + Math.sin(time * 4) * 0.8 + joy * 1.5;
    p.chestLight.material.emissiveIntensity = 1.2 + Math.sin(time * 3) * 0.6 + joy;
    p.earRings.emissiveIntensity = 1 + Math.sin(time * 2 + 1) * 0.5 + joy;

    // Head: look around when idle, shake after a bump, bop when happy.
    const playing = !this.menuMode;
    const idle = playing && !this.anim.busy && !this.level.won;
    this.idleTime = idle ? this.idleTime + dt : 0;
    let headYaw = 0;
    let headTilt = 0;
    let headPitch = 0;
    if (this.worried && playing) {
      // Glance at the undo button, then back at the player, and again...
      const atUndo = ((time - this.worried.since) % 2.6) < 1.3;
      const target = atUndo ? this.worried.targets.undo() : this.worried.targets.camera();
      if (target) {
        const look = Math.atan2(target.x - pos.x, target.z - pos.z) - yaw;
        headYaw = Math.max(-1.25, Math.min(1.25, Math.atan2(Math.sin(look), Math.cos(look))));
      }
      headPitch = atUndo ? 0.18 : -0.08;
      headTilt = atUndo ? 0.1 : 0;
    } else if (this.thinking) {
      headPitch = -0.22; // looks up, pondering
      headTilt = 0.16 + Math.sin(time * 3) * 0.04;
    } else if (this.hintArrow) {
      headPitch = 0.12; // looks at the arrow
    } else if (this.idleTime > 3) {
      const t = this.idleTime - 3;
      headYaw = Math.sin(t * 0.8) * 0.55;
      headTilt = Math.sin(t * 0.5) * 0.08;
    }
    if (mood === 'oops') headYaw += Math.sin(moodT * 22) * 0.32 * Math.max(0, 1 - moodT / 0.6);
    if (mood === 'happy') headTilt += Math.sin(time * 10) * 0.1;
    if (this.talking) headTilt += Math.sin(time * 6) * 0.07;
    p.head.rotation.y += (headYaw - p.head.rotation.y) * Math.min(1, dt * (mood === 'oops' ? 40 : 5));
    p.head.rotation.z += (headTilt - p.head.rotation.z) * Math.min(1, dt * 8);
    p.head.rotation.x += (headPitch - p.head.rotation.x) * Math.min(1, dt * 8);

    if (!playing) return; // the menu has its own blinking and hopping

    // Eyes: blink every few seconds; squint with effort, beam when happy,
    // pop wide after a bump. The smile flips to a frown on a bump.
    if (time > (this.nextBlink ?? 0)) {
      this.blinkStart = time;
      this.nextBlink = time + 2.2 + Math.random() * 2.5;
    }
    const blinking = time - (this.blinkStart ?? -9) < 0.13;
    const worried = this.worried && !mood;
    let eyeY = { happy: 0.5, effort: 0.75, oops: 1.8 }[mood] ?? (worried ? 1.15 : 1.4);
    if (blinking && mood !== 'happy') eyeY = 0.15;
    for (const e of p.eyes) e.scale.y += (eyeY - e.scale.y) * Math.min(1, dt * 30);
    p.smile.rotation.z = mood === 'oops' || worried ? 0 : Math.PI;
    p.smile.scale.setScalar(mood === 'happy' ? 1.5 : worried ? 0.75 : 1);
    if (this.talking && !mood && !worried) p.smile.scale.y = 1 + Math.abs(Math.sin(time * 15)) * 1.1; // chatting

    // Sweat drop: forms by the head, slides down and fades, again and again.
    p.sweat.visible = !!this.worried;
    if (this.worried) {
      const c = ((time - this.worried.since) % 1.1) / 1.1;
      p.sweat.position.y = 0.33 - c * 0.2;
      p.sweat.scale.setScalar(Math.min(1, c * 5));
      p.sweat.children[0].material.opacity = c < 0.75 ? 1 : (1 - c) / 0.25;
    }

    if (!idle) return;
    // Breathing.
    const b = Math.sin(time * 2.4) * 0.018;
    p.body.scale.set(1 - b * 0.5, 1 + b, 1 - b * 0.5);
    const [left, right] = p.arms;
    if (this.worried) {
      // Nervous fidget: hands together in front, wringing; a slight tremble.
      for (const [arm, s] of [[left, 1], [right, -1]]) {
        arm.rotation.x = -0.75 + Math.sin(time * 11 + s) * 0.12;
        arm.rotation.z = arm.userData.baseZ * -0.9;
      }
      p.body.position.x = Math.sin(time * 38) * 0.004;
      return;
    }
    if (this.thinking || this.hintArrow) {
      // Thinking: hand to chin. Hint shown: pointing the way.
      right.rotation.x = this.thinking ? -2.3 : -1.55;
      right.rotation.z = right.userData.baseZ * (this.thinking ? -1.2 : 1);
      left.rotation.x = Math.sin(time * 2.4) * 0.06;
      return;
    }
    // Every 8 s of idling, wave at the player with the right hand.
    const phase = this.idleTime > 5 ? (this.idleTime - 5) % 8 : 99;
    const wave = phase < 1.8 ? Math.sin((Math.PI * phase) / 1.8) : 0;
    right.rotation.x = -2.6 * Math.min(1, wave * 1.8);
    right.rotation.z = right.userData.baseZ + Math.sin(phase * 12) * 0.45 * wave;
    left.rotation.x = Math.sin(time * 2.4) * 0.06;
  }

  // Per-frame idle animation + smooth state-driven visuals.
  update(dt, time) {
    if (!this.level) return;
    const lvl = this.level;
    const smooth = (cur, target, speed) => cur + (target - cur) * Math.min(1, dt * speed);

    this.time = time;
    if (this.menuMode && !this.anim.busy) this.updateMenuPip(dt, time);
    this.animatePip(dt, time);

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
      gate.bars.position.y = -gate.open * 1.12;
      gate.update(time, gate.open);
      gate.lights.forEach((l, i) => {
        l.position.y = GATE_LIGHT_Y + Math.sin(time * 2 + i) * 0.05;
        const on = l.userData.plateIndex < lit || lvl.gateOpen;
        l.material.color.setHex(on ? COLORS.lightOn : COLORS.lightOff);
        l.material.emissive.setHex(on ? COLORS.lightOn : COLORS.lightOff);
        l.material.emissiveIntensity = on ? 2 : 0.4;
      });
    }

    for (const pad of this.pads) {
      pad.boost = smooth(pad.boost, 0, 3);
      pad.update(time, pad.boost);
    }
    for (const a of this.arrows) a.update(time);
    if (this.hintArrow) {
      this.hintArrow.update(time * 2);
      this.hintArrow.group.position.y = this.hintArrow.y + Math.abs(Math.sin(time * 5)) * 0.08;
    }

    // Spikes shoot up fast and sink a little slower; switches show the state.
    for (const s of this.spikes) {
      const target = lvl.spikeUp(s.cell) ? 1 : 0;
      s.up = smooth(s.up, target, target ? 22 : 10);
      s.spikes.position.y = SPIKE_DOWN_Y + (SPIKE_UP_Y - SPIKE_DOWN_Y) * s.up;
      s.tipMat.emissiveIntensity = 0.5 + s.up * (0.6 + Math.sin(time * 5) * 0.3);
    }
    this.switchColor = smooth(this.switchColor, lvl.flipped ? 1 : 0, 10);
    for (const s of this.switches) {
      s.press = smooth(s.press, 0, 6);
      s.cap.position.y = 0.12 - s.press * 0.06;
      s.cap.material.color.lerpColors(SWITCH_A, SWITCH_B, this.switchColor);
      s.cap.material.emissive.copy(s.cap.material.color);
      s.ring.material.color.copy(s.cap.material.color);
      s.ring.material.emissive.copy(s.cap.material.color);
      s.ring.material.emissiveIntensity = 1 + Math.sin(time * 3) * 0.3 + s.press * 2;
    }

    if (this.exit) this.exit.update(dt, time);
    this.snow?.update(dt);
    if (lvl.wrap) {
      // Turn the planet so Pip stays on top (the nearest equivalent column,
      // so it never spins the long way round), and bend anything new.
      const W = lvl.width;
      let target = this.player.group.position.x;
      while (target - BEND.offset.value > W / 2) target -= W;
      while (target - BEND.offset.value < -W / 2) target += W;
      BEND.offset.value += (target - BEND.offset.value) * Math.min(1, dt * 6);
      bendTree(this.root);
    }
    if (this.water) this.water.position.y = Math.sin(time * 1.6) * 0.015;
  }
}

// Pip and the crate hold still during the wind-up, then move together.
const pushEase = (k) => (k < WINDUP ? 0 : ease.outQuad((k - WINDUP) / (1 - WINDUP)));

const SWITCH_A = new THREE.Color(SWITCH_COLORS[0]);
const SWITCH_B = new THREE.Color(SWITCH_COLORS[1]);
