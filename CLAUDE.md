# Pip — three.js puzzle game

Sokoban-style puzzle game: Pip (a little orange robot) pushes crates onto
plates to open a gate, then reaches the exit portal. Vite + three.js, no
framework, no build step beyond Vite. All models are procedural placeholders.

## Commands

- `npm run dev` — dev server (Vite)
- `npm run build` — production build to `dist/`
- `npm run solve` — replay every level's stored `solution`; `-- --optimal` runs a full BFS
  (big levels: `node --max-old-space-size=6000 tools/solve.js --optimal`)
- `npm run promo` — store covers + gameplay videos into `promo/` (dev server running).
- `npm run playtest` — plays every level in headless Chrome with real key presses and
  checks it is won. Needs the dev server running; set `PLAYTEST_URL` if not on :5173.
  Options: `-- --level 4`, `-- --shots <dir>` (start/mid/win screenshots).
- `node --max-old-space-size=6000 tools/generate.mjs <template> [tries] [seed]` — propose
  levels from a hand-drawn template (TEMPLATES in the file).
- `node tools/generate.mjs --chapter <name> --tries 600 --seed 1 --out x.jsonl` — procedural
  islands for a chapter theme (CHAPTERS in the file: meadow, river, frost, thaw, summit, summit2).
  Run several seeds in parallel; each writes JSON lines.
- `node tools/pick-levels.mjs --in a.jsonl,b.jsonl --count 10 --export NAME --title "..."   --names "A,B,..." --hint "..." --spare 1 --out src/core/levels/<file>.js` — dedupe, rank
  by difficulty (length × log(search states)), pick an easy→hard spread, write a chapter file.

## Layout

```
src/
  main.js            entry: creates UI + Game
  Game.js            flow only: menu <-> playing, load level, input -> move, win/progress
  platform.js        CrazyGames SDK v3 wrapper (gameplay events, midgame ads, mute, saves)
  core/              no three.js, no DOM (safe to import from Node tools)
    Level.js         rules: tiles, moving, pushing, water/bridges, ice sliding, undo
    levels.js        CHAPTERS (name + levels), flat LEVELS (each has `chapter`), starsFor()
    levels/*.js      one file per chapter (firstSteps is hand-made; the rest generated)
    storage.js       save backend: localStorage, or CrazyGames SDK.data (set by platform.js)
    progress.js      unlocked levels, best moves (via storage.js)
    anim.js          tween runner (`background` tweens don't block input)
  render/
    Stage.js         renderer, scene, lights, camera/orbit controls, framing, screen->grid dirs
    World.js         per-level scene: builds models, animates Level.move() events, idle anims
    terrain.js       instanced grass/ice/earth/water/walls
    effects.js       splash
    Backdrop.js      clouds + floating islets
    models/          one factory per model (player, crate, plate, gate, exit, guideArrow)
    colors.js, util.js
  ui/
    ui.js            HUD, menu, level select, win card (DOM only; Game sets on* callbacks)
    tutorial.js      level-1 tutorial (desktop card / touch bar + animated finger)
    keyboard.js      key bindings -> Game methods
  audio/sfx.js       WebAudio synth sounds + playMoveSounds(ev)
  style.css          imports styles/{base,tutorial,menu,actions}.css
tools/               solve.js, playtest.mjs, generate.mjs, pick-levels.mjs
```

Data flow: input -> `Game.requestMove(screenDir)` -> `Stage.toGridDir` ->
`Level.move(gridDir)` returns an event -> `World.applyEvent(ev)` animates it,
`playMoveSounds(ev)` plays audio, `ui.setStats` updates the HUD.

## Map legend (see core/Level.js)

`' '` void · `.` floor · `#` wall/rock · `o` plate · `G` gate · `E` exit ·
`~` water · `_` ice · `P` start · `B` crate · `X` crate on plate

Rules: only crates press plates; the gate opens when all plates are pressed.
A crate pushed into water sinks and becomes walkable floor. Anything ending a
step on ice keeps sliding until blocked or it reaches a non-ice tile. The
player can't push two crates in a row.

## Adding or changing a level

1. Draft the map (or generate candidates with `tools/generate.mjs`).
2. Add it to a chapter file in `src/core/levels/` with `name`, `hint`, `map`
   (new chapter: new file + an entry in `CHAPTERS` in `src/core/levels.js`).
3. `npm run solve -- --optimal` to get the shortest solution; store it as
   `solution` and set `par` ~10–15% above its length.
4. `npm run playtest -- --level N` (with the dev server running) and look at
   `--shots` screenshots, desktop and a phone-sized viewport.

## Conventions

- Keep `core/` free of three.js and DOM so the solver/tools run in Node.
- New visuals: add a factory in `render/models/`, export it from `models/index.js`.
  To swap in a real GLTF model later, keep the factory's return shape
  (e.g. the player returns `{ group, body, antennaTip, eyes }`).
- Effects that shouldn't delay the next move use `anim.add(..., { background: true })`.
- localStorage keys are `crateKeeper.*` (kept from the old name so saved progress survives).
- Saves go through `core/storage.js` (never localStorage directly) so they sync via
  CrazyGames `SDK.data` when hosted there; every access is wrapped in try/catch.
- CrazyGames SDK: all calls go through `platform.js` and are no-ops if the SDK is missing
  or disabled (`?nosdk` skips it). `gameplayStart` when a level is being played,
  `gameplayStop` on win/menu/ads; midgame ads only between levels (`Game.nextLevel`);
  ads pause input and mute audio. On localhost the SDK runs in `local` mode with fake ads.
- UI must work at phone width: touch mode (`body.touch`) shows the D-pad and stacks the
  undo/restart buttons; portrait views rotate wide levels so the long axis runs vertically.
