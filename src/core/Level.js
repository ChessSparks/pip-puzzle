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
};

// Map legend:
//   ' ' void      '.' floor     '#' wall
//   'o' plate     'G' gate      'E' exit      '~' water     '_' ice
//   'P' player    'B' crate     'X' crate on plate
//
// Water blocks the player. A crate pushed into water sinks and becomes a
// floating bridge: walkable floor that can't be moved again.
//
// Ice is slippery: anything that ends a step on ice keeps sliding the same
// way until something blocks it or it reaches a non-ice tile.
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
    this.tiles = [];
    this.plates = [];
    this.gates = [];
    this.exit = null;
    this.start = null;
    this.startBoxes = [];

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
      }
    }
    if (!this.start) throw new Error('Level has no player start (P)');
    this.reset();
  }

  reset() {
    this.player = { ...this.start, facing: 'down' };
    this.boxes = this.startBoxes.map((b, id) => ({ id, x: b.x, z: b.z, sunk: false }));
    this.bridges = new Set(); // indices of water tiles filled by a sunk crate
    this.history = [];
    this.moves = 0;
    this.won = false;
    this.gateOpen = this.computeGateOpen();
  }

  tile(x, z) {
    if (x < 0 || z < 0 || x >= this.width || z >= this.height) return TILE.VOID;
    return this.tiles[z * this.width + x];
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

  // Can something occupy this tile (ignoring boxes)?
  isPassable(x, z, forBox = false) {
    const t = this.tile(x, z);
    if (t === TILE.VOID || t === TILE.WALL) return false;
    if (t === TILE.GATE) return this.gateOpen;
    if (t === TILE.EXIT && forBox) return false;
    // Crates may enter open water (they sink); the player needs a bridge.
    if (t === TILE.WATER) return forBox || this.isBridge(x, z);
    return true;
  }

  snapshot() {
    return {
      player: { ...this.player },
      boxes: this.boxes.map((b) => ({ ...b })),
      bridges: [...this.bridges],
      moves: this.moves,
      gateOpen: this.gateOpen,
    };
  }

  restore(s) {
    this.player = { ...s.player };
    this.boxes = s.boxes.map((b) => ({ ...b }));
    this.bridges = new Set(s.bridges);
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
    const tx = this.player.x + d.x;
    const tz = this.player.z + d.z;
    const turned = this.player.facing !== dirName;
    this.player.facing = dirName;

    if (!this.isPassable(tx, tz)) return turned ? { type: 'turn' } : { type: 'bump' };

    const box = this.boxAt(tx, tz);
    const before = this.snapshot();
    before.player.facing = dirName;
    let pushed = null;
    if (box) {
      const bx = tx + d.x;
      const bz = tz + d.z;
      if (!this.isPassable(bx, bz, true) || this.boxAt(bx, bz)) {
        return turned ? { type: 'turn' } : { type: 'bump' };
      }
      pushed = { id: box.id, from: { x: box.x, z: box.z }, sunk: false };
      box.x = bx;
      box.z = bz;
      // Slide across ice (the player is still behind, at the old spot).
      while (this.tile(box.x, box.z) === TILE.ICE) {
        const nx = box.x + d.x;
        const nz = box.z + d.z;
        if (!this.isPassable(nx, nz, true) || this.boxAt(nx, nz) || (nx === tx && nz === tz)) break;
        box.x = nx;
        box.z = nz;
      }
      pushed.to = { x: box.x, z: box.z };
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
    this.player.x = tx;
    this.player.z = tz;
    // The player slides too while standing on ice.
    let slid = 0;
    while (this.tile(this.player.x, this.player.z) === TILE.ICE) {
      const nx = this.player.x + d.x;
      const nz = this.player.z + d.z;
      if (!this.isPassable(nx, nz) || this.boxAt(nx, nz)) break;
      this.player.x = nx;
      this.player.z = nz;
      slid++;
    }
    this.moves++;

    this.gateOpen = this.computeGateOpen();
    this.won = !!this.exit && this.player.x === this.exit.x && this.player.z === this.exit.z;

    return {
      type: 'move',
      pushed,
      slid,
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
    return `${this.player.x},${this.player.z}|${bs.join(',')}|${br.join(',')}|${this.gateOpen ? 1 : 0}`;
  }
}
