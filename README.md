# Pip

A 3D crate-pushing puzzle game built with three.js. Help Pip, a little orange
robot, push crates onto pressure plates to open the gate and reach the portal.

- 58 levels in 6 chapters: plates, water (crates become bridges) and ice (everything slides)
- Undo, restart, stars and saved progress
- Works on desktop (keyboard + mouse) and mobile (touch D-pad, drag to rotate)

## Run it

```bash
npm install
npm run dev
```

## Controls

| Action | Desktop | Mobile |
|---|---|---|
| Move | Arrow keys / WASD | On-screen arrows |
| Rotate view | Drag | Drag |
| Undo / Restart | Z / R | Big buttons, bottom-left |
| Menu | Esc | ☰ |

## Tools

- `npm run solve` — check every level's stored solution still wins
- `npm run playtest` — play every level in headless Chrome (dev server must be running)
- `tools/generate.mjs`, `tools/pick-levels.mjs` — generate and pick new levels

See `CLAUDE.md` for the code layout and how to add levels.
