// Island scenery per chapter: ground/earth/rock colours, sky gradient, light,
// backdrop tint, weather particles and decorations. CHAPTERS in
// core/levels.js names its theme by key.
//
//   grassA/B   checkered top colours     earth, stone   island body, rocks
//   sky        CSS gradient stops (top-centre -> edge)
//   hemi       [sky, ground, intensity]  sun   [colour, intensity]
//   cloud      cloud colour + glow       islet [top, earth]
//   particles  'petals' | 'snow' | 'fireflies' | 'dust' | 'leaves' | 'embers' | null
//   particleCount  optional override of how many
//   snowCover  optional fraction of floor tiles under snow Pip can plough (snow.js)
//   earthGlow  optional [colour, strength]: the island body glows (molten rock)
//   ice        optional [iceA, iceB] override
//   rockCap    colour of a cap on rocks (snow, moss...) or null
//   capGlow    set for glowing crystal shards instead of a cap (emissive strength)
//   tufts      optional colour of grass tufts growing on plain floor tiles
//   flowers    with tufts: little flowers dotted in the grass
//   dangle     what hangs under the island edges: 'roots' | 'icicles' | 'crystals' | 'lava' | null
export const THEMES = {
  meadow: {
    grassA: 0x8fd16a, grassB: 0x7fc25c, earth: 0x7a5236, stone: 0x9aa3b8,
    sky: ['#bfe6ff', '#8ec5f0', '#5d8fd6'],
    hemi: [0xcfe8ff, 0x5a4636, 1.4], sun: [0xfff1dc, 2.4],
    cloud: [0xffffff, 0xdfe9ff], islet: [0x86c962, 0x6d4a31],
    particles: null, rockCap: null, dangle: 'roots', tufts: 0x5fae3e, flowers: true,
  },
  blossom: {
    grassA: 0x9ad86c, grassB: 0x86c95c, earth: 0x7a5236, stone: 0xa7a3bc,
    sky: ['#d8f0ff', '#a6d4f5', '#6c9be0'],
    hemi: [0xe2f0ff, 0x5a4636, 1.45], sun: [0xfff4e0, 2.4],
    cloud: [0xffffff, 0xf3e6ff], islet: [0x95d36a, 0x6d4a31],
    particles: 'petals', rockCap: 0x6dbb4c, dangle: 'roots', tufts: 0x68b844, flowers: true,
  },
  river: {
    grassA: 0x7fd17a, grassB: 0x6fc26c, earth: 0x6e5038, stone: 0x93a6b4,
    sky: ['#c6f1ff', '#86cfee', '#4f93cc'],
    hemi: [0xc9f0ff, 0x4a5446, 1.45], sun: [0xf6fbff, 2.3],
    cloud: [0xffffff, 0xd8f2ff], islet: [0x7acb74, 0x5f4632],
    particles: null, rockCap: 0x5faa58, dangle: 'roots', tufts: 0x52a650,
  },
  frost: {
    grassA: 0xb9cfc6, grassB: 0xadc5bb, // frozen grass, showing where snow is ploughed earth: 0x5d6680, stone: 0x8794ad,
    sky: ['#eef6ff', '#bcd4f2', '#7f9bd0'],
    hemi: [0xeaf4ff, 0x5b6684, 1.55], sun: [0xe8f2ff, 2.1],
    cloud: [0xffffff, 0xe8f0ff], islet: [0xeef4fc, 0x5d6680],
    ice: [0xa9dcf6, 0x97d1f0], // bluer than usual so it stands out from snow
    particles: 'snow', particleCount: 600, snowCover: 1, rockCap: 0xffffff, dangle: 'icicles',
  },
  thaw: {
    grassA: 0xa8d98a, grassB: 0xc9e2bc, earth: 0x6b5442, stone: 0xa0aabb,
    sky: ['#e6f4f7', '#a9d0e2', '#6d98c4'],
    hemi: [0xe0f2ff, 0x5a5048, 1.45], sun: [0xfff6e6, 2.3],
    cloud: [0xffffff, 0xeef6ff], islet: [0xb7dca1, 0x6b5442],
    particles: 'snow', particleCount: 200, snowCover: 0.45, rockCap: 0xf4f8ff, dangle: 'roots',
  },
  summit: {
    grassA: 0x9cc96a, grassB: 0x8dba5e, earth: 0x6b4a3a, stone: 0xb0a3a8,
    sky: ['#ffe2b8', '#f6a98a', '#8c6bc4'],
    hemi: [0xffe4cc, 0x5a3f4a, 1.35], sun: [0xffc58a, 2.6],
    cloud: [0xfff3e6, 0xffc9b0], islet: [0x9cc96a, 0x6b4a3a],
    particles: null, rockCap: 0xf7efe8, dangle: 'roots', tufts: 0x7aa84c,
  },
  // ---- New chapters ----
  // Portal Isles: a night sky, deep teal moss, glowing crystals and fireflies.
  twilight: {
    grassA: 0x3f8f86, grassB: 0x367e78, earth: 0x3a2f55, stone: 0x6a6f9a,
    sky: ['#5a4fa8', '#2f2c78', '#14143d'],
    hemi: [0x9fb4ff, 0x2a2046, 1.15], sun: [0xc7c4ff, 1.7],
    cloud: [0x6c68b0, 0x2c2868], islet: [0x3f8f86, 0x3a2f55],
    particles: 'fireflies', rockCap: 0xb986ff, capGlow: 1.0, dangle: 'crystals',
  },
  // Crumbling Canyon: warm sandstone in a hazy desert afternoon.
  canyon: {
    grassA: 0xf0cf8e, grassB: 0xe6c07c, earth: 0xc0623a, stone: 0xd08a5c,
    sky: ['#fff1cc', '#ffcf8a', '#e58a5a'],
    hemi: [0xfff0d6, 0x7a3e26, 1.4], sun: [0xffe2b0, 2.6],
    cloud: [0xfff6ea, 0xffd9b0], islet: [0xf0cf8e, 0xc0623a],
    particles: 'dust', rockCap: 0x9bbf5a, dangle: 'roots',
  },
  // Windy Wolds: an autumn island with falling leaves.
  autumn: {
    grassA: 0xe0a24a, grassB: 0xd38f3e, earth: 0x6e4630, stone: 0xa59a92,
    sky: ['#fff0d0', '#f8c48c', '#c77a6a'],
    hemi: [0xffe8cc, 0x5a3a2a, 1.4], sun: [0xffd6a0, 2.5],
    cloud: [0xfff4e6, 0xffd8b8], islet: [0xd8963e, 0x6e4630],
    particles: 'leaves', rockCap: 0xc4572e, dangle: 'roots',
  },
  // Ember Forge: dark basalt, glowing lava seams and drifting embers.
  forge: {
    grassA: 0x4a4250, grassB: 0x3f3846, earth: 0x2a2026, stone: 0x7a6e78,
    sky: ['#ff9a5c', '#a03a3a', '#2a1020'],
    hemi: [0xffb08a, 0x2a1418, 1.2], sun: [0xffb070, 2.4],
    cloud: [0x5a4448, 0x5a2018], islet: [0x4a4250, 0x2a2026], earthGlow: [0xff3a10, 0.08],
    particles: 'embers', rockCap: 0xff6a1f, capGlow: 1.4, dangle: 'lava',
  },
};

export const themeFor = (name) => THEMES[name] ?? THEMES.meadow;
