// Pure puzzle logic — no three.js here, so it can be tested/solved headlessly.

export const TILE = {
  VOID: 0,
  FLOOR: 1,
  WALL: 2,
  PLATE: 3,
  GATE: 4,
  EXIT: 5,
  WATER: 6,
  ICE: 7,
  ARROW: 8,
  PAD: 9,
  CRACKED: 10,
  SWITCH: 11,
  SPIKE: 12,
};

// Map legend:
//   ' ' void      '.' floor     '#' wall
//   'o' plate     'G' gate      'E' exit      '~' water     '_' ice
//   'P' player    'B' crate     'X' crate on plate
//   '>' '<' '^' 'v' one-way arrow     '1' '2' '3' teleport pad (same digit = a pair)
//   '%' cracked floor   'S' switch   'W' spikes (up at start)   'w' spikes (down at start)
//
// Water blocks the player. A crate pushed into water sinks and becomes a
// floating bridge: walkable floor that can't be moved again.
//
// Ice is slippery: anything that ends a step on ice keeps sliding the same
// way until something blocks it or it reaches a non-ice tile.
//
// Arrow tiles can only be entered moving the way the arrow points (by Pip or
// a pushed crate). Teleport pads are doorways: whatever moves onto one comes
// out one step past its twin, still moving the same way (if that spot is
// free; otherwise it just stands on the pad). Cracked floor crumbles into the void as soon as Pip
// steps off it (crates are light enough not to break it). Every time Pip or a
// crate enters a switch, all spikes flip; raised spikes block both.
//
// def.wrap (Star Worlds): the map wraps around left/right, like a little
// round planet: leaving column 0 to the left arrives in the last column.
const ARROW_DIRS = { '>': 'right', '<': 'left', '^': 'up', 'v': 'down' };

const LEGEND = {
  ' ': { tile: TILE.VOID },
  '.': { tile: TILE.FLOOR },
  '#': { tile: TILE.WALL },
  'o': { tile: TILE.PLATE },
  'G': { tile: TILE.GATE },
  'E': { tile: TILE.EXIT },
  '~': { tile: TILE.WATER },
  '_': { tile: TILE.ICE },
  'P': { tile: TILE.FLOOR, player: true },
  'B': { tile: TILE.FLOOR, box: true },
  'X': { tile: TILE.PLATE, box: true },
  '>': { tile: TILE.ARROW },
  '<': { tile: TILE.ARROW },
  '^': { tile: TILE.ARROW },
  'v': { tile: TILE.ARROW },
  '1': { tile: TILE.PAD },
  '2': { tile: TILE.PAD },
  '3': { tile: TILE.PAD },
  '%': { tile: TILE.CRACKED },
  'S': { tile: TILE.SWITCH },
  'W': { tile: TILE.SPIKE },
  'w': { tile: TILE.SPIKE },
};

export const DIRS = {
  up: { x: 0, z: -1 },
  down: { x: 0, z: 1 },
  left: { x: -1, z: 0 },
  right: { x: 1, z: 0 },
};

export class Level {
  constructor(def) {
    this.def = def;
    this.name = def.name;
    this.hint = def.hint ?? '';

    const rows = def.map;
    this.height = rows.length;
    this.width = Math.max(...rows.map((r) => r.length));
    this.wrap = !!def.wrap;
    this.tiles = [];
    this.plates = [];
    this.gates = [];
    this.exit = null;
    this.start = null;
    this.startBoxes = [];
    this.arrows = new Map(); // cell index -> direction name
    this.pads = []; // { x, z, pair, twin }
    this.switches = [];
    this.spikes = []; // { x, z, startUp }
    this.cracked = [];

    for (let z = 0; z < this.height; z++) {
      for (let x = 0; x < this.width; x++) {
        const ch = rows[z][x] ?? ' ';
        const entry = LEGEND[ch];
        if (!entry) throw new Error(`Unknown map char "${ch}" at ${x},${z}`);
        this.tiles.push(entry.tile);
        if (entry.tile === TILE.PLATE) this.plates.push({ x, z });
        if (entry.tile === TILE.GATE) this.gates.push({ x, z });
        if (entry.tile === TILE.EXIT) this.exit = { x, z };
        if (entry.player) this.start = { x, z };
        if (entry.box) this.startBoxes.push({ x, z });
        if (entry.tile === TILE.ARROW) this.arrows.set(z * this.width + x, ARROW_DIRS[ch]);
        if (entry.tile === TILE.PAD) this.pads.push({ x, z, pair: ch });
        if (entry.tile === TILE.SWITCH) this.switches.push({ x, z });
        if (entry.tile === TILE.SPIKE) this.spikes.push({ x, z, startUp: ch === 'W' });
        if (entry.tile === TILE.CRACKED) this.cracked.push({ x, z });
      }
    }
    if (!this.start) throw new Error('Level has no player start (P)');
    for (const pad of this.pads) {
      const twins = this.pads.filter((p) => p.pair === pad.pair && p !== pad);
      if (twins.length !== 1) throw new Error(`Teleport pad "${pad.pair}" needs exactly one twin`);
      pad.twin = twins[0];
    }
    this.reset();
  }

  reset() {
    this.player = { ...this.start, facing: 'down' };
    this.boxes = this.startBoxes.map((b, id) => ({ id, x: b.x, z: b.z, sunk: false }));
    this.bridges = new Set(); // indices of water tiles filled by a sunk crate
    this.broken = new Set(); // indices of cracked tiles that have crumbled away
    this.flipped = false; // switches entered an odd number of times
    this.history = [];
    this.moves = 0;
    this.won = false;
    this.gateOpen = this.computeGateOpen();
  }

  // Crumbled cracked floor reads as void.
  // Column x on a wrapping map (unchanged otherwise).
  wx(x) {
    return this.wrap ? ((x % this.width) + this.width) % this.width : x;
  }

  tile(x, z) {
    x = this.wx(x);
    if (x < 0 || z < 0 || x >= this.width || z >= this.height) return TILE.VOID;
    const i = z * this.width + x;
    return this.broken.has(i) ? TILE.VOID : this.tiles[i];
  }

  isBroken(x, z) {
    return this.broken.has(z * this.width + x);
  }

  arrowAt(x, z) {
    return this.arrows.get(z * this.width + x) ?? null;
  }

  spikeUp(s) {
    return s.startUp !== this.flipped;
  }

  padAt(x, z) {
    return this.pads.find((p) => p.x === x && p.z === z) ?? null;
  }

  // Only crates still on the surface; sunk crates are part of the floor.
  boxAt(x, z) {
    return this.boxes.find((b) => !b.sunk && b.x === x && b.z === z) ?? null;
  }

  isBridge(x, z) {
    return this.bridges.has(z * this.width + x);
  }

  isPlatePressed(p) {
    return !!this.boxAt(p.x, p.z);
  }

  get platesPressed() {
    return this.plates.filter((p) => this.isPlatePressed(p)).length;
  }

  computeGateOpen() {
    if (this.platesPressed === this.plates.length) return true;
    // A gate never slams shut on something standing in it.
    return this.gates.some(
      (g) => this.boxAt(g.x, g.z) || (this.player.x === g.x && this.player.z === g.z),
    ) && !!this.gateOpen;
  }

  // Can something occupy this tile (ignoring boxes)? `dir` is the direction
  // of travel: arrow tiles only accept their own.
  isPassable(x, z, forBox = false, dir = null) {
    const t = this.tile(x, z);
    if (t === TILE.VOID || t === TILE.WALL) return false;
    if (t === TILE.GATE) return this.gateOpen;
    if (t === TILE.EXIT && forBox) return false;
    if (t === TILE.ARROW) return !dir || this.arrowAt(x, z) === dir;
    if (t === TILE.SPIKE) return !this.spikeUp(this.spikes.find((s) => s.x === x && s.z === z));
    // Crates may enter open water (they sink); the player needs a bridge.
    if (t === TILE.WATER) return forBox || this.isBridge(x, z);
    return true;
  }

  // Where something entering `pad` moving `dir` comes out: one step past the
  // twin pad, if that spot is free (Pip stands at px, pz). Otherwise null.
  padExit(pad, dir, forBox, px = this.player.x, pz = this.player.z) {
    const d = DIRS[dir];
    const x = this.wx(pad.twin.x + d.x);
    const z = pad.twin.z + d.z;
    if (!this.isPassable(x, z, forBox, dir) || this.boxAt(x, z) || (x === px && z === pz)) return null;
    if (this.tile(x, z) === TILE.PAD) return null; // no chaining through pads
    return { x, z };
  }

  snapshot() {
    return {
      player: { ...this.player },
      boxes: this.boxes.map((b) => ({ ...b })),
      bridges: [...this.bridges],
      broken: [...this.broken],
      flipped: this.flipped,
      moves: this.moves,
      gateOpen: this.gateOpen,
    };
  }

  restore(s) {
    this.player = { ...s.player };
    this.boxes = s.boxes.map((b) => ({ ...b }));
    this.bridges = new Set(s.bridges);
    this.broken = new Set(s.broken);
    this.flipped = s.flipped;
    this.moves = s.moves;
    this.gateOpen = s.gateOpen;
    this.won = false;
  }

  /**
   * Attempt a move. Returns null if nothing happened (other than turning),
   * otherwise an event describing what changed, for the renderer.
   */
  move(dirName) {
    if (this.won) return null;
    const d = DIRS[dirName];
    const tx = this.wx(this.player.x + d.x);
    const tz = this.player.z + d.z;
    const turned = this.player.facing !== dirName;
    this.player.facing = dirName;

    if (!this.isPassable(tx, tz, false, dirName)) return turned ? { type: 'turn' } : { type: 'bump' };

    const box = this.boxAt(tx, tz);
    const before = this.snapshot();
    before.player.facing = dirName;
    let pushed = null;
    let toggles = 0;
    if (box) {
      const bx = this.wx(tx + d.x);
      const bz = tz + d.z;
      if (!this.isPassable(bx, bz, true, dirName) || this.boxAt(bx, bz)) {
        return turned ? { type: 'turn' } : { type: 'bump' };
      }
      pushed = { id: box.id, from: { x: box.x, z: box.z }, sunk: false, teleport: null, steps: 1 };
      box.x = bx;
      box.z = bz;
      // Slide across ice (the player is still behind, at the old spot). The
      // guard stops endless laps around a wrapping ring of ice.
      while (this.tile(box.x, box.z) === TILE.ICE && pushed.steps <= this.width + this.height) {
        const nx = this.wx(box.x + d.x);
        const nz = box.z + d.z;
        if (!this.isPassable(nx, nz, true, dirName) || this.boxAt(nx, nz) || (nx === tx && nz === tz)) break;
        box.x = nx;
        box.z = nz;
        pushed.steps++;
      }
      pushed.to = { x: box.x, z: box.z };
      const pad = this.padAt(box.x, box.z);
      const out = pad && this.padExit(pad, dirName, true, tx, tz);
      if (out) {
        box.x = out.x;
        box.z = out.z;
        pushed.teleport = { twin: { x: pad.twin.x, z: pad.twin.z }, to: out };
      }
      if (this.tile(box.x, box.z) === TILE.SWITCH) toggles++;
      if (this.tile(box.x, box.z) === TILE.WATER && !this.isBridge(box.x, box.z)) {
        box.sunk = true;
        this.bridges.add(box.z * this.width + box.x);
        pushed.sunk = true;
      }
    }

    this.history.push(before);
    const platesBefore = this.platesPressed;
    const wasOpen = this.gateOpen;
    this.gateOpen = this.computeGateOpen();
    const left = { x: this.player.x, z: this.player.z };
    this.player.x = tx;
    this.player.z = tz;
    // The player slides too while standing on ice.
    let slid = 0;
    while (this.tile(this.player.x, this.player.z) === TILE.ICE && slid <= this.width + this.height) {
      const nx = this.wx(this.player.x + d.x);
      const nz = this.player.z + d.z;
      if (!this.isPassable(nx, nz, false, dirName) || this.boxAt(nx, nz)) break;
      this.player.x = nx;
      this.player.z = nz;
      slid++;
    }
    // The cracked tile Pip just stepped off crumbles away.
    let broke = null;
    if (this.tile(left.x, left.z) === TILE.CRACKED) {
      this.broken.add(left.z * this.width + left.x);
      broke = left;
    }
    let teleport = null;
    const pad = this.padAt(this.player.x, this.player.z);
    const out = pad && this.padExit(pad, dirName, false);
    if (out) {
      teleport = { from: { x: pad.x, z: pad.z }, twin: { x: pad.twin.x, z: pad.twin.z }, to: out };
      this.player.x = out.x;
      this.player.z = out.z;
    }
    if (this.tile(this.player.x, this.player.z) === TILE.SWITCH) toggles++;
    if (toggles % 2) this.flipped = !this.flipped;
    this.moves++;

    this.gateOpen = this.computeGateOpen();
    this.won = !!this.exit && this.player.x === this.exit.x && this.player.z === this.exit.z;

    return {
      type: 'move',
      pushed,
      slid,
      teleport,
      broke,
      toggled: toggles > 0,
      plateChange: this.platesPressed - platesBefore,
      gateChanged: wasOpen !== this.gateOpen,
      won: this.won,
    };
  }

  undo() {
    const s = this.history.pop();
    if (!s) return false;
    this.restore(s);
    return true;
  }

  // Compact state key for solvers.
  key() {
    const bs = this.boxes
      .filter((b) => !b.sunk)
      .map((b) => b.z * this.width + b.x)
      .sort((a, b) => a - b);
    const br = [...this.bridges].sort((a, b) => a - b);
    const bk = [...this.broken].sort((a, b) => a - b);
    return `${this.player.x},${this.player.z}|${bs.join(',')}|${br.join(',')}|${bk.join(',')}|${this.flipped ? 1 : 0}|${this.gateOpen ? 1 : 0}`;
  }
}
