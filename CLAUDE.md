# Pip — three.js puzzle game

Sokoban-style puzzle game: Pip (a little orange robot) pushes crates onto
plates to open a gate, then reaches the exit portal. Vite + three.js, no
framework, no build step beyond Vite. All models are procedural placeholders.

## Commands

- `npm run dev` — dev server (Vite)
- `npm run build` — production build to `dist/` (relative paths, font bundled; no outside assets)
- `npm run zip` — build + `pip-itchio.zip` (index.html at the root) for uploading to itch.io
  (project kind "HTML", tick "This file will be played in the browser")
- `npm run build:y8` — Y8 build in `build-y8/` (`npm run zip:y8` also makes `pip-y8.zip`).
  Same game plus the Y8 minimal SDK 2.0 via `#platform` (src/platform/y8.js; the normal
  build gets the no-op none.js): init with appId/gameId (autoLogin), a "next" break ad on
  "Next level" (game paused and muted meanwhile). Saves stay in localStorage.
- `npm run solve` — replay every level's stored `solution`; `-- --optimal` runs a full BFS
  (big levels: `node --max-old-space-size=6000 tools/solve.js --optimal`)
- `npm run promo` — store covers + gameplay videos into `promo/` (dev server running).
- `npm run playtest` — plays every level in headless Chrome with real key presses and
  checks it is won. Needs the dev server running; set `PLAYTEST_URL` if not on :5173.
  Options: `-- --level 4`, `-- --from 10 --to 20`, `-- --shots <dir>` (start/mid/win
  screenshots), `-- --high`. Headless Chrome renders in software (a few fps), so it plays
  at low effects quality in a small window; ~45 s per level. To keep editing meanwhile,
  run it against a `vite preview` of a build (file edits reload the dev server's page).
- `node --max-old-space-size=6000 tools/generate.mjs <template> [tries] [seed]` — propose
  levels from a hand-drawn template (TEMPLATES in the file).
- `node tools/generate.mjs --chapter <name> --tries 600 --seed 1 --out x.jsonl` — procedural
  islands for a chapter theme (CHAPTERS in the file: meadow, river, frost, thaw, summit, summit2,
  portal, crumble, arrows, spikes). `--world <name>` makes wrapping Star World rings
  (WORLDS in the file); `npm run playtest -- --worlds` plays the Star Worlds.
  Run several seeds in parallel; each writes JSON lines.
- `node tools/pick-levels.mjs --in a.jsonl,b.jsonl --count 10 --export NAME --title "..."   --names "A,B,..." --hint "..." --spare 1 --out src/core/levels/<file>.js` — dedupe, rank
  by difficulty (length × log(search states)), pick an easy→hard spread, write a chapter file.

## Layout

```
src/
  main.js            entry: inits the portal platform (#platform), creates UI + Game
  platform/          none.js (standalone) / y8.js (Y8 SDK), picked by vite.config.js
  Game.js            flow only: menu <-> playing, load level, input -> move, win/progress
  core/              no three.js, no DOM (safe to import from Node tools)
    Level.js         rules: tiles, moving, pushing, water/bridges, ice sliding, portal pads,
                     arrows, cracked floor, switches/spikes, undo
    levels.js        CHAPTERS (name + theme + levels), flat LEVELS (each has `chapter`), starsFor()
    levels/*.js      one file per chapter (firstSteps is hand-made; the rest generated,
                     chapters 7-10 open with a hand-made intro level)
    storage.js       save backend (localStorage, guarded)
    progress.js      unlocked levels, best moves (via storage.js)
    settings.js      effects quality ('high' / 'low'; auto-drops to low when slow)
    search.js        BFS over Level states (+ solutionPath: states along a stored solution)
    story.js         Pip's story: chapter intro lines (speech balloon, first visit), the line
                     when a chapter's spark is found (its last level), the finale; seen intros
    anim.js          tween runner (`background` tweens don't block input)
  workers/solver.js  BFS off the main thread: after each move "can it still be won?" (if not,
                     Game.setStuck(): "Uh-oh! Stuck!" balloon, worried Pip, wiggling undo) and
                     on request (H / bulb button) the next move for "Ask Pip" hints
  render/
    Stage.js         renderer, scene, lights, camera/orbit controls, framing, screen->grid dirs
    World.js         per-level scene: builds models, animates Level.move() events, idle anims
    themes.js        per-chapter scenery: colours, sky, light, weather, rock caps, dangles
    terrain.js       instanced grass/ice/earth/water/walls + theme decorations
    effects.js       splash, crumble, snowPuff
    snow.js          ploughable snow cover for snowy themes (visual only, follows undo)
    Backdrop.js      clouds + floating islets + weather particles (tinted per theme) + the
                     Great Portal in the sky (models/greatPortal.js): one lit segment per spark
    models/          one factory per model (player, crate, plate, gate, exit, pad, arrow,
                     cracked, switch, spikes, greatPortal)
    colors.js, util.js
  ui/
    ui.js            HUD, menu, level select, win card (DOM only; Game sets on* callbacks)
    keyboard.js      key bindings -> Game methods
  audio/
    engine.js        shared WebAudio context, music/sfx buses, reverb, limiter, synth voices
                     (bell, pluck, pad, bass, noise, drums); starts on the first key/tap
    music.js         generative music, one mood per chapter theme (MOODS); menu music toggle
    sfx.js           sound effects + playMoveSounds(ev), timed to World's animations
  style.css          imports styles/{base,menu,actions}.css
tools/               solve.js, playtest.mjs, generate.mjs, pick-levels.mjs, zip.mjs
```

Data flow: input -> `Game.requestMove(screenDir)` -> `Stage.toGridDir` ->
`Level.move(gridDir)` returns an event -> `World.applyEvent(ev)` animates it,
`playMoveSounds(ev)` plays audio, `ui.setStats` updates the HUD.

## Map legend (see core/Level.js)

`' '` void · `.` floor · `#` wall/rock · `o` plate · `G` gate · `E` exit ·
`~` water · `_` ice · `P` start · `B` crate · `X` crate on plate ·
`>` `<` `^` `v` one-way arrow · `1` `2` `3` portal pad (same digit = twins) ·
`%` cracked floor · `S` switch · `W` spikes up / `w` spikes down (at start)

Rules: only crates press plates; the gate opens when all plates are pressed.
A crate pushed into water sinks and becomes walkable floor. Anything ending a
step on ice keeps sliding until blocked or it reaches a non-ice tile. The
player can't push two crates in a row.
Arrows can only be entered moving their way (player and crates). A portal pad
is a doorway: whatever moves onto it comes out one step past its twin, same
direction, if that spot is free (else it just stands on the pad). Cracked floor
becomes void once the player steps off it (crates don't break it). Each time
the player or a crate enters a switch, every spike flips; raised spikes block.
Star Worlds (`wrap: true`, levels/starWorlds.js) wrap around left/right; they're drawn
bent into a round planet by render/bend.js (vertex-shader bend, flat coords everywhere
else) and unlock when every level of their chapter has 3 stars.

## Adding or changing a level

1. Draft the map (or generate candidates with `tools/generate.mjs`).
2. Add it to a chapter file in `src/core/levels/` with `name`, `hint`, `map`
   (new chapter: new file + an entry in `CHAPTERS` in `src/core/levels.js`, appended at the
   end since progress is saved by level index; pick or add a `theme` in `render/themes.js`).
3. `npm run solve -- --optimal` to get the shortest solution; store it as
   `solution` and set `par` ~10–15% above its length.
4. `npm run playtest -- --level N` (with the dev server running) and look at
   `--shots` screenshots, desktop and a phone-sized viewport.

## Conventions

- Keep `core/` free of three.js and DOM so the solver/tools run in Node.
- New visuals: add a factory in `render/models/`, export it from `models/index.js`.
  To swap in a real GLTF model later, keep the factory's return shape
  (e.g. the player returns `{ group, body, head, antenna, antennaTip, chestLight, earRings,
  eyes, smile, arms }`; World animates those parts).
- Effects that shouldn't delay the next move use `anim.add(..., { background: true })`.
- localStorage keys are `crateKeeper.*` (kept from the old name so saved progress survives).
- Saves go through `core/storage.js` (never localStorage directly); every access is
  wrapped in try/catch.
- UI must work at phone width: touch mode (`body.touch`) shows the D-pad and stacks the
  undo/restart buttons; portrait views rotate wide levels so the long axis runs vertically.
- Screen sizes: `--ui` (set in `ui.js`) zooms the HUD/controls/menus (bigger on large screens,
  smaller on short ones). The camera frames the level into the space the UI leaves free,
  measured by `freeAreas()` in `ui.js` — new on-screen controls should be added there.
