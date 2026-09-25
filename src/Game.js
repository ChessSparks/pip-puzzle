// Game flow: menu <-> playing, loading levels, turning input into moves,
// wins and progress. Rendering lives in render/, rules in core/, DOM in ui/.
import * as THREE from 'three';
import { Level } from './core/Level.js';
import { LEVELS, CHAPTERS, starsFor } from './core/levels.js';
import { progress } from './core/progress.js';
import { Animator } from './core/anim.js';
import { Stage } from './render/Stage.js';
import { World } from './render/World.js';
import { Backdrop } from './render/Backdrop.js';
import { sfx, playMoveSounds } from './audio/sfx.js';
import { Tutorial } from './ui/tutorial.js';
import { bindKeyboard } from './ui/keyboard.js';

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

    this.tutorial = new Tutorial(document.getElementById('tutorial'), {
      onStepChange: (id) => {
        this.world.setGuides(id === 'goal');
        this.ui.setHintVisible(!id);
      },
    });
    this.stage.onRotate = (delta) => this.tutorial.onRotate(delta);

    bindKeyboard(this);
    this.bindUi();
    this.ui.setMuted(sfx.muted);

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
    ui.onHelp = () => this.tutorial.start();
    ui.onMenu = () => this.openMenu();
    ui.onPlay = () => this.play(this.continueIndex);
    ui.onLevels = () => this.showLevelSelect();
    ui.onPlayLevel = (i) => this.play(i);
    ui.onHowTo = () => this.play(0, { tutorial: true });
  }

  // ---- Flow -------------------------------------------------------------

  // First level the player hasn't solved yet (or the last one).
  get continueIndex() {
    return Math.min(progress.unlocked - 1, LEVELS.length - 1);
  }

  openMenu() {
    this.state = 'menu';
    this.tutorial.stop();
    this.ui.hideWin();
    this.stage.setMode('menu');
    // Show the level the player would continue on, slowly turning behind the menu.
    if (!this.level || this.level.won || this.levelIndex !== this.continueIndex) {
      this.loadLevel(this.continueIndex, { preview: true });
    }
    this.world.setMenuMode(true, this.stage.camera.position);
    this.ui.showMenu({
      continueIndex: this.continueIndex,
      anyCompleted: progress.best(0) !== null,
      stars: this.totalStars(),
      maxStars: LEVELS.length * 3,
    });
  }

  play(index, { tutorial = false } = {}) {
    this.state = 'playing';
    this.ui.hideMenu();
    this.ui.hideWin();
    this.stage.setMode('play');
    this.world.setMenuMode(false);
    this.loadLevel(index);
    if (tutorial && !this.tutorial.active) this.tutorial.start();
  }

  loadLevel(index, { preview = false } = {}) {
    this.levelIndex = index;
    this.level = new Level(LEVELS[index]);
    this.world.build(this.level);
    this.moveQueue = [];
    this.stage.frame(this.level);
    this.ui.showLevel(this.levelIndex, CHAPTERS[this.level.def.chapter].name, this.level);
    this.updateHud();
    if (!preview && this.level.def.tutorial && !Tutorial.done) this.tutorial.start();
  }

  nextLevel() {
    if (this.levelIndex + 1 < LEVELS.length) this.play(this.levelIndex + 1);
  }

  showLevelSelect() {
    const levels = LEVELS.map((def, index) => {
      const best = progress.best(index);
      return { index, name: def.name, unlocked: index < progress.unlocked, best, stars: best === null ? 0 : starsFor(def, best) };
    });
    const chapters = CHAPTERS.map((c, ci) => ({ name: c.name, levels: levels.filter((l) => LEVELS[l.index].chapter === ci) }));
    this.ui.showLevelSelect(chapters, this.continueIndex);
  }

  totalStars() {
    return LEVELS.reduce((sum, def, i) => {
      const best = progress.best(i);
      return sum + (best === null ? 0 : starsFor(def, best));
    }, 0);
  }

  onWin() {
    if (this.tutorial.active) this.tutorial.finish();
    const moves = this.level.moves;
    const isBest = progress.complete(this.levelIndex, moves);
    this.ui.showWin({
      moves,
      isBest,
      best: progress.best(this.levelIndex),
      stars: starsFor(this.level.def, moves),
      par: this.level.def.par,
      hasNext: this.levelIndex + 1 < LEVELS.length,
    });
  }

  // ---- Player actions ---------------------------------------------------

  // dirName is screen-relative ('up' = away from the camera).
  requestMove(dirName) {
    if (this.state !== 'playing' || this.level.won) return;
    if (this.anim.busy) {
      if (this.moveQueue.length < MAX_QUEUED_MOVES) this.moveQueue.push(dirName);
      return;
    }
    const ev = this.level.move(this.stage.toGridDir(dirName));
    if (!ev) return;
    this.tutorial.onInput(dirName);
    this.world.applyEvent(ev, () => this.onWin());
    playMoveSounds(ev, this.level);
    this.updateHud();
  }

  undo() {
    if (this.state !== 'playing' || this.level.won) return;
    this.anim.finishAll();
    this.moveQueue = [];
    if (this.level.undo()) {
      sfx.undo();
      this.world.syncInstant();
      this.updateHud();
    }
  }

  restart() {
    if (this.state !== 'playing') return;
    this.anim.clear();
    this.level.reset();
    this.world.syncInstant();
    this.moveQueue = [];
    this.ui.hideWin();
    this.updateHud();
  }

  toggleMute() {
    this.ui.setMuted(sfx.toggleMute());
  }

  updateHud() {
    this.ui.setStats(this.level.moves, this.level.platesPressed, this.level.plates.length);
  }

  // ---- Loop -------------------------------------------------------------

  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;
    this.anim.tick(dt);
    if (!this.anim.busy && this.moveQueue.length) this.requestMove(this.moveQueue.shift());
    this.world.update(dt, t);
    this.backdrop.update(t);
    this.stage.render(dt);
  }
}
