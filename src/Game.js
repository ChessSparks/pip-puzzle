// Game flow: menu <-> playing, loading levels, turning input into moves,
// wins and progress. Rendering lives in render/, rules in core/, DOM in ui/.
import * as THREE from 'three';
import { Level } from './core/Level.js';
import { LEVELS, CHAPTERS, STAR_WORLDS, starsFor } from './core/levels.js';
import { progress } from './core/progress.js';
import { settings } from './core/settings.js';
import { STORY, FINALE, STAR_WORLD_INTRO, fill, storySeen } from './core/story.js';
import { Animator } from './core/anim.js';
import { Stage } from './render/Stage.js';
import { World } from './render/World.js';
import { Backdrop } from './render/Backdrop.js';
import { themeFor } from './render/themes.js';
import { sfx, playMoveSounds } from './audio/sfx.js';
import { music } from './audio/music.js';
import { platform } from '#platform';
import { bindKeyboard } from './ui/keyboard.js';
import { freeAreas } from './ui/ui.js';

const MAX_QUEUED_MOVES = 3;

export class Game {
  constructor(canvas, ui) {
    this.ui = ui;
    this.state = 'menu'; // 'menu' | 'playing'
    this.levelIndex = 0;
    this.level = null;
    this.moveQueue = [];

    this.stage = new Stage(canvas);
    this.backdrop = new Backdrop(this.stage.scene);
    this.anim = new Animator();
    this.world = new World(this.stage.scene, this.anim);
    this.clock = new THREE.Clock();
    this.stage.freeAreas = freeAreas;
    this.fps = { time: 0, frames: 0, slow: 0 };
    this.applyQuality(settings.quality);
    // Touch <-> mouse shows/hides the D-pad, which changes the free space.
    window.addEventListener('inputmodechange', () => this.level && this.stage.frame(this.level, { keepView: true }));

    this.stuck = false;
    this.starWorld = null; // chapter index while on its Star World
    this.hint = null; // { id, thinking } while Pip thinks, { id, dir } once he knows
    this.hintSeq = 0;
    this.bubbleText = null;
    this.story = null; // { lines, i } while Pip tells a chapter's intro
    this.pendingStory = null; // chapter whose intro starts once Pip has landed
    this.storyTimer = null;
    // Index of each chapter's last level (its spark).
    this.lastOfChapter = CHAPTERS.map((_, ci) => LEVELS.findLastIndex((l) => l.chapter === ci));
    this.deadCheck = this.startSolverWorker();

    this.paused = false; // true while a portal ad plays
    this.adPending = false;
    bindKeyboard(this);
    this.bindUi();
    this.bindPlatform();
    this.ui.setMuted(sfx.muted);
    this.ui.setMusic(music.enabled);

    this.openMenu();
    this.stage.renderer.setAnimationLoop(() => this.frame());
  }

  bindUi() {
    const ui = this.ui;
    ui.onMove = (dir) => this.requestMove(dir);
    ui.onUndo = () => this.undo();
    ui.onRestart = () => this.restart();
    ui.onNext = () => this.nextLevel();
    ui.onMute = () => this.toggleMute();
    ui.onMenu = () => this.openMenu();
    ui.onPlay = () => this.startLevel(this.continueIndex);
    ui.onLevels = () => this.showLevelSelect();
    ui.onPlayLevel = (i) => this.startLevel(i);
    ui.onPlayWorld = (ci) => this.playStarWorld(ci);
    ui.onHint = () => this.requestHint();
    ui.onMusic = () => {
      music.setEnabled(!music.enabled);
      this.ui.setMusic(music.enabled);
    };
    ui.onQuality = () => {
      const q = this.quality === 'high' ? 'low' : 'high';
      settings.setQuality(q);
      this.applyQuality(q);
      if (this.level) this.loadLevel(this.levelIndex); // rebuild with/without grass
    };
  }

  // Portal (Y8) hooks; no-ops in the standalone build.
  bindPlatform() {
    sfx.setForcedMute('portal', platform.muteAudio);
    platform.onMuteSetting = (muted) => {
      sfx.setForcedMute('portal', muted);
      this.ui.setMuted(sfx.muted);
    };
    // During an ad: no input, no sound.
    platform.onAdPause = (on) => {
      this.paused = on;
      this.moveQueue = [];
      sfx.setForcedMute('ad', on);
    };
  }

  // ---- Flow -------------------------------------------------------------

  // First level the player hasn't solved yet (or the last one).
  get continueIndex() {
    return Math.min(progress.unlocked - 1, LEVELS.length - 1);
  }

  openMenu() {
    this.state = 'menu';
    platform.gameplayStop();
    this.ui.hideWin();
    this.setStuck(false);
    this.clearHint();
    this.endStory();
    this.pendingStory = null;
    // Menu first, so the level is framed around its actual layout.
    this.ui.showMenu({
      continueIndex: this.continueIndex,
      anyCompleted: progress.best(0) !== null,
      stars: this.totalStars(),
      maxStars: LEVELS.length * 3,
      sparks: this.sparks,
      maxSparks: CHAPTERS.length,
    });
    this.stage.setMode('menu');
    // Show the level the player would continue on, slowly turning behind the menu.
    if (!this.level || this.level.won || this.starWorld !== null || this.levelIndex !== this.continueIndex) {
      this.loadLevel(this.continueIndex);
    }
    this.world.setMenuMode(true, this.stage.camera.position);
  }

  play(index) {
    this.state = 'playing';
    this.ui.hideMenu();
    this.ui.hideWin();
    this.stage.setMode('play');
    this.world.setMenuMode(false);
    this.loadLevel(index);
    platform.gameplayStart();
    // First visit to a chapter: Pip introduces it once he has landed.
    const chapter = LEVELS[index].chapter;
    if (!storySeen.has(chapter)) this.pendingStory = chapter;
  }

  loadLevel(index) {
    this.levelIndex = index;
    this.starWorld = null;
    this.loadDef(LEVELS[index], `${CHAPTERS[LEVELS[index].chapter].name} · Level ${index + 1}`);
  }

  // A chapter's Star World (bonus round planet).
  playStarWorld(chapter) {
    if (this.state !== 'menu' || !this.starWorldOpen(chapter)) return;
    this.state = 'playing';
    this.ui.hideMenu();
    this.ui.hideWin();
    this.stage.setMode('play');
    this.world.setMenuMode(false);
    this.starWorld = chapter;
    this.loadDef(STAR_WORLDS[chapter], `${CHAPTERS[chapter].name} · Star World`);
    platform.gameplayStart();
    if (!storySeen.has('star')) this.pendingStory = 'star';
  }

  // Star World open = every level of the chapter has 3 stars.
  starWorldOpen(chapter) {
    return LEVELS.every((def, i) => def.chapter !== chapter || (progress.best(i) !== null && starsFor(def, progress.best(i)) === 3));
  }

  loadDef(def, label) {
    this.level = new Level(def);
    // Each chapter has its own island scenery, sky and weather.
    const theme = themeFor(CHAPTERS[this.level.def.chapter].theme);
    this.world.build(this.level, theme);
    this.stage.setTheme(theme);
    this.backdrop.setTheme(theme);
    this.ui.setSky(theme.sky);
    music.setMood(CHAPTERS[this.level.def.chapter].theme); // each chapter has its own tune
    this.moveQueue = [];
    this.cancelDeadCheck();
    this.setStuck(false);
    this.clearHint();
    this.endStory();
    this.pendingStory = null;
    this.ui.showLevel(label, this.level);
    this.backdrop.setSparks(this.sparks); // the Great Portal shows story progress
    this.stage.sun.castShadow = !this.level.wrap; // flat shadows would be wrong on a planet
    this.frameView(); // after the HUD text, which sets the HUD's size
    this.updateHud();
  }

  // Frame the camera on the level; a Star World as its round planet (a drum
  // of radius W/2π), seen a little more from above.
  frameView() {
    const R = this.level.width / (2 * Math.PI);
    this.stage.frame(this.level.wrap ? { width: 2 * R + 1, height: this.level.height, yMin: -R, polar: 0.55 } : this.level);
  }

  startLevel(index) {
    if (this.state === 'menu') this.play(index);
  }

  // "Next level" is the natural break for a portal midgame ad.
  async nextLevel() {
    if (this.adPending || this.starWorld !== null || this.levelIndex + 1 >= LEVELS.length) return;
    this.adPending = true;
    await platform.midgameAd();
    this.adPending = false;
    if (this.state === 'playing') this.play(this.levelIndex + 1);
  }

  showLevelSelect() {
    const levels = LEVELS.map((def, index) => {
      const best = progress.best(index);
      return { index, name: def.name, unlocked: index < progress.unlocked, best, stars: best === null ? 0 : starsFor(def, best) };
    });
    const chapters = CHAPTERS.map((c, ci) => {
      const best = progress.worldBest(ci);
      return {
        name: c.name,
        spark: progress.best(this.lastOfChapter[ci]) !== null,
        levels: levels.filter((l) => LEVELS[l.index].chapter === ci),
        world: {
          name: STAR_WORLDS[ci].name,
          open: this.starWorldOpen(ci),
          best,
          stars: best === null ? 0 : starsFor(STAR_WORLDS[ci], best),
        },
      };
    });
    this.ui.showLevelSelect(chapters, this.continueIndex);
  }

  totalStars() {
    return LEVELS.reduce((sum, def, i) => {
      const best = progress.best(i);
      return sum + (best === null ? 0 : starsFor(def, best));
    }, 0);
  }

  // Sparks found = chapters whose last level has been beaten.
  get sparks() {
    return this.lastOfChapter.filter((i) => progress.best(i) !== null).length;
  }

  onWin() {
    platform.gameplayStop();
    platform.happytime();
    if (this.starWorld !== null) {
      const moves = this.level.moves;
      const isBest = progress.completeWorld(this.starWorld, moves);
      this.ui.showWin({
        moves,
        isBest,
        best: progress.worldBest(this.starWorld),
        stars: starsFor(this.level.def, moves),
        par: this.level.def.par,
        hasNext: false,
        title: 'Star World cleared!',
      });
      return;
    }
    const moves = this.level.moves;
    const chapterWasOpen = this.starWorldOpen(this.level.def.chapter);
    const chapter = this.level.def.chapter;
    const firstWin = progress.best(this.levelIndex) === null;
    const isBest = progress.complete(this.levelIndex, moves);
    const isFinale = firstWin && this.levelIndex === LEVELS.length - 1;
    const spark = firstWin && this.levelIndex === this.lastOfChapter[chapter] && !isFinale
      ? { text: fill(STORY[chapter]?.spark ?? '', this.sparks, CHAPTERS.length), count: this.sparks, total: CHAPTERS.length }
      : null;
    this.ui.showWin({
      moves,
      isBest,
      best: progress.best(this.levelIndex),
      stars: starsFor(this.level.def, moves),
      par: this.level.def.par,
      hasNext: this.levelIndex + 1 < LEVELS.length,
      spark,
      finale: isFinale ? FINALE : null,
      worldUnlocked: !chapterWasOpen && this.starWorldOpen(chapter),
    });
  }

  // ---- Player actions ---------------------------------------------------

  // dirName is screen-relative ('up' = away from the camera).
  requestMove(dirName) {
    if (this.state !== 'playing' || this.paused || this.level.won) return;
    if (this.anim.busy) {
      if (this.moveQueue.length < MAX_QUEUED_MOVES) this.moveQueue.push(dirName);
      return;
    }
    const ev = this.level.move(this.stage.toGridDir(dirName));
    if (!ev) return;
    const fx = this.world.applyEvent(ev, () => this.onWin());
    playMoveSounds(ev, this.level);
    if (fx.snow > 0.1) sfx.crunch(0.05);
    if (ev.type === 'move') {
      this.clearHint();
      this.endStory(); // playing skips the chatter
    }
    if (ev.type === 'move' && !ev.won) this.checkDeadEnd();
    this.updateHud();
  }

  undo() {
    if (this.state !== 'playing' || this.paused || this.level.won) return;
    this.anim.finishAll();
    this.moveQueue = [];
    if (this.level.undo()) {
      this.clearHint();
      this.endStory();
      sfx.undo();
      this.world.syncInstant();
      this.updateHud();
      // Still stuck after one undo? The check says so (or clears it).
      if (this.stuck) this.checkDeadEnd();
    }
  }

  restart() {
    if (this.state !== 'playing' || this.paused) return;
    this.anim.clear();
    this.level.reset();
    this.world.syncInstant();
    this.moveQueue = [];
    this.cancelDeadCheck();
    this.setStuck(false);
    this.clearHint();
    this.endStory();
    this.ui.hideWin();
    this.updateHud();
    platform.gameplayStart(); // also "Replay" from the win card
  }

  // ---- "Oh no" moments and hints ------------------------------------------
  // A worker (workers/solver.js) searches positions off the main thread.
  // After each move it checks whether the level can still be won; if not,
  // Pip gets worried and glances at the undo button, which wiggles. On
  // request (H / the bulb button) it finds Pip's next move.

  startSolverWorker() {
    const dc = { worker: null, seq: 0, wanted: 0, sent: 0, busy: false };
    try {
      dc.worker = new Worker(new URL('./workers/solver.js', import.meta.url), { type: 'module' });
      dc.worker.onmessage = ({ data }) => (data.kind === 'hint' ? this.onHint(data) : this.onDeadCheck(data));
    } catch {
      dc.worker = null; // no workers: no stuck warnings or hints
    }
    return dc;
  }

  checkDeadEnd() {
    this.deadCheck.wanted = ++this.deadCheck.seq;
    this.sendDeadCheck();
  }

  cancelDeadCheck() {
    this.deadCheck.wanted = this.deadCheck.sent = ++this.deadCheck.seq;
  }

  // One search at a time; while one runs, only the latest position waits.
  sendDeadCheck() {
    const dc = this.deadCheck;
    if (!dc.worker || dc.busy || dc.wanted === dc.sent || this.level.won) return;
    dc.busy = true;
    dc.sent = dc.wanted;
    dc.worker.postMessage({ id: dc.sent, kind: 'dead', def: this.level.def, snapshot: this.level.snapshot() });
  }

  onDeadCheck({ id, dead }) {
    const dc = this.deadCheck;
    dc.busy = false;
    if (id === dc.wanted && this.state === 'playing' && !this.level.won) this.setStuck(dead);
    this.sendDeadCheck();
  }

  setStuck(on) {
    if (on === this.stuck) return;
    this.stuck = on;
    this.ui.setStuck(on);
    this.updateBubble();
    this.world.setWorried(on, {
      undo: () => this.stage.screenToWorld(this.ui.undoButtonCenter(), 0.4),
      camera: () => this.stage.camera.position,
    });
    if (on) sfx.uhOh();
  }

  // Ask Pip: he thinks for a moment, then points the way (an arrow on the
  // ground and "This way!"). A stuck position gets the undo advice instead.
  requestHint() {
    if (this.state !== 'playing' || this.paused || this.level.won || this.stuck || this.hint?.thinking) return;
    const worker = this.deadCheck.worker;
    if (!worker) return;
    this.endStory();
    this.clearHint();
    this.hint = { id: ++this.hintSeq, thinking: true };
    this.world.setThinking(true);
    this.updateBubble();
    worker.postMessage({ id: this.hint.id, kind: 'hint', def: this.level.def, snapshot: this.level.snapshot() });
  }

  onHint({ id, move, dead }) {
    if (this.hint?.id !== id) return; // Pip moved on meanwhile
    this.world.setThinking(false);
    if (dead) {
      this.hint = null;
      this.setStuck(true);
      return;
    }
    if (!move) {
      this.hint = { id, tricky: true };
      this.updateBubble();
      setTimeout(() => this.hint?.id === id && this.clearHint(), 3500);
      return;
    }
    const dir = { U: 'up', D: 'down', L: 'left', R: 'right' }[move];
    this.hint = { id, dir };
    this.world.showHint(dir);
    sfx.hint();
    this.updateBubble();
  }

  clearHint() {
    if (!this.hint) return;
    this.hint = null;
    this.world.setThinking(false);
    this.world.clearHint();
    this.updateBubble();
  }

  // ---- Story ---------------------------------------------------------------

  // Pip says a chapter's intro lines one after another (core/story.js).
  tellStory(chapter) {
    storySeen.add(chapter);
    const intro = chapter === 'star' ? STAR_WORLD_INTRO : STORY[chapter]?.intro ?? [];
    const lines = intro.map((l) => fill(l, this.sparks, CHAPTERS.length));
    if (!lines.length) return;
    this.story = { lines, i: 0 };
    this.world.setTalking(true);
    this.updateBubble();
    this.scheduleStoryLine();
  }

  scheduleStoryLine() {
    const line = this.story.lines[this.story.i];
    clearTimeout(this.storyTimer);
    this.storyTimer = setTimeout(() => {
      this.story.i++;
      if (this.story.i >= this.story.lines.length) this.endStory();
      else {
        this.updateBubble();
        this.scheduleStoryLine();
      }
    }, 1400 + line.length * 45); // long enough to read
  }

  endStory() {
    clearTimeout(this.storyTimer);
    if (!this.story) return;
    this.story = null;
    this.world.setTalking(false);
    this.updateBubble();
  }

  // Pip's speech balloon: being stuck wins over a hint, a hint over the story.
  updateBubble() {
    const arrows = { up: '\u2191', down: '\u2193', left: '\u2190', right: '\u2192' };
    let text = null;
    if (this.stuck) text = 'Uh-oh! Stuck!';
    else if (this.hint?.thinking) text = 'Hmm\u2026';
    else if (this.hint?.tricky) text = 'Too tricky\u2026 try a restart?';
    else if (this.hint?.dir) text = `This way! ${arrows[this.stage.toScreenDir(this.hint.dir)]}`;
    else if (this.story) text = this.story.lines[this.story.i];
    this.bubbleText = text;
    this.ui.say(text);
  }

  // ---- Effects quality ----------------------------------------------------

  applyQuality(q) {
    this.quality = q;
    this.stage.setQuality(q);
    this.backdrop.setQuality(q);
    this.world.quality = q;
    this.ui.setQuality(q);
  }

  // Unless the player picked a quality, drop to 'low' (and remember it) if
  // the game runs below ~40 fps for two 3-second stretches in a row.
  watchFrameRate(dt) {
    if (this.quality === 'low' || settings.qualityChosen || document.hidden) return;
    const f = this.fps;
    f.time += dt;
    f.frames++;
    if (f.time < 3) return;
    const fps = f.frames / f.time;
    f.time = f.frames = 0;
    f.slow = fps < 40 ? f.slow + 1 : 0;
    if (f.slow >= 2) {
      settings.setQuality('low', { auto: true });
      this.applyQuality('low');
    }
  }

  toggleMute() {
    this.ui.setMuted(sfx.toggleMute());
  }

  updateHud() {
    this.ui.setStats(this.level.moves, this.level.platesPressed, this.level.plates.length);
  }

  // ---- Loop -------------------------------------------------------------

  frame() {
    const raw = this.clock.getDelta();
    const dt = Math.min(raw, 0.1); // slow devices: choppier, but animations keep real time
    if (raw < 0.5) this.watchFrameRate(raw); // skip stalls (tab switches, loading)
    const t = this.clock.elapsedTime;
    this.anim.tick(dt);
    if (!this.anim.busy && this.moveQueue.length) this.requestMove(this.moveQueue.shift());
    if (this.pendingStory !== null && this.state === 'playing' && !this.anim.busy && !this.level.won) {
      this.tellStory(this.pendingStory);
      this.pendingStory = null;
    }
    this.world.update(dt, t);
    this.backdrop.update(t, this.stage.camera);
    this.stage.render(dt);
    if (this.bubbleText) this.ui.placeBubble(this.stage.worldToScreen(this.world.bubbleAnchor()));
  }
}
