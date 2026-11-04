# Pip

A 3D crate-pushing puzzle game built with three.js. Help Pip, a little orange
robot, push crates onto pressure plates to open the gate and reach the portal.

- 98 levels in 10 chapters: plates, water (crates become bridges), ice (everything slides),
  portal pads, crumbling floor, one-way arrows and switch-flipped spikes
- Every chapter has its own island scenery: spring meadow, blossom, river, snow, thaw,
  sunset summit, twilight portals, desert canyon, autumn wolds and a volcanic forge
- Undo, restart, stars and saved progress
- Works on desktop (keyboard + mouse) and mobile (touch D-pad, drag to rotate)

## Run it

```bash
npm install
npm run dev
```

## Controls




## Tools

- `npm run solve` — check every level's stored solution still wins
- `npm run playtest` — play every level in headless Chrome (dev server must be running)
- `tools/generate.mjs`, `tools/pick-levels.mjs` — generate and pick new levels

See `CLAUDE.md` for the code layout and how to add levels.
