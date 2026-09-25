// Interactive first-level tutorial. Each step waits for the player to actually
// perform the action. Desktop gets a full card with illustrations; touch gets
// a compact one-line bar plus an animated finger drawn over the real controls.
import { sfx } from '../audio/sfx.js';

const STORAGE_KEY = 'crateKeeper.tutorialDone';
const MOVES_NEEDED = 3;
const ROTATION_NEEDED = 1.0; // radians of camera orbit

const KEY_GRID = (labels) => `
  <div class="keygrid">
    <span class="key" data-dir="up">${labels[0]}</span>
    <span class="key" data-dir="left">${labels[1]}</span>
    <span class="key" data-dir="down">${labels[2]}</span>
    <span class="key" data-dir="right">${labels[3]}</span>
  </div>`;

// Desktop-only card illustrations.
const VISUALS = {
  keys: `
    <div class="tv-keys">
      ${KEY_GRID(['▲', '◀', '▼', '▶'])}
      <span class="tv-or">or</span>
      ${KEY_GRID(['W', 'A', 'S', 'D'])}
    </div>`,
  mouse: `
    <div class="tv-drag">
      <svg class="tv-arc" viewBox="0 0 120 30"><path d="M8 24 Q60 -6 112 24" /><path d="M8 24 l2 -9 M8 24 l9 -1 M112 24 l-2 -9 M112 24 l-9 -1" /></svg>
      <svg class="tv-mouse" viewBox="0 0 40 60">
        <rect x="2" y="2" width="36" height="56" rx="18" />
        <path class="btn" d="M20 2 A18 18 0 0 0 2 20 L20 20 Z" />
        <line x1="20" y1="2" x2="20" y2="20" />
      </svg>
    </div>`,
  goal: `
    <div class="tv-goal">
      <span class="tv-crate"></span>
      <span class="tv-plate"></span>
      <span class="tv-arrow">➜</span>
      <span class="tv-portal"></span>
    </div>`,
};

const HAND_SVG = `
  <span class="ripple"></span>
  <svg viewBox="0 0 48 64" aria-hidden="true">
    <ellipse cx="11" cy="40" rx="6" ry="10" />
    <rect x="18" y="2" width="12" height="36" rx="6" />
    <rect x="9" y="27" width="31" height="33" rx="11" />
    <path d="M30 30 v8 M35 31 v7" />
  </svg>`;

const STEPS = [
  {
    id: 'move',
    title: 'Move around',
    text: {
      desktop: 'Use the <kbd>arrow keys</kbd> or <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> to walk.',
      touch: 'Tap the <b>arrows</b> to walk',
    },
    visual: 'keys',
    hand: 'tap',
  },
  {
    id: 'rotate',
    title: 'Turn the island',
    text: {
      desktop: '<b>Click and drag</b> anywhere to rotate the view. Scroll to zoom. <br><em>Up always walks away from you.</em>',
      touch: '<b>Drag</b> to turn the island',
    },
    visual: 'mouse',
    hand: 'swipe',
  },
  {
    id: 'goal',
    title: 'Open the door',
    text: {
      desktop: 'Walk into a crate to <b>push</b> it. Put both crates on the <b>glowing plates</b> to open the door, then step into the portal.',
      touch: 'Push both crates onto the <b>glowing plates</b>',
    },
    visual: 'goal',
    button: { desktop: 'Got it!', touch: 'OK' },
  },
];

export class Tutorial {
  constructor(el, { onStepChange } = {}) {
    this.el = el;
    this.onStepChange = onStepChange;
    this.step = -1;
    this.busy = false;
    this.handMode = null;

    el.innerHTML = `
      <div class="tut-head">
        <span class="tut-count"></span>
        <button class="tut-skip" type="button"></button>
      </div>
      <div class="tut-visual"></div>
      <h2 class="tut-title"></h2>
      <p class="tut-text"></p>
      <div class="tut-progress"><span></span></div>
      <button class="tut-next primary" type="button"></button>
      <div class="tut-check">✓</div>`;
    this.$ = (sel) => el.querySelector(sel);
    this.$('.tut-skip').onclick = () => this.finish();
    this.$('.tut-next').onclick = () => this.complete();

    this.hand = document.createElement('div');
    this.hand.className = 'tut-hand hidden';
    this.hand.innerHTML = HAND_SVG;
    document.body.appendChild(this.hand);

    window.addEventListener('inputmodechange', () => this.active && this.render());
    window.addEventListener('resize', () => this.active && this.placeHand());
  }

  static get done() {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }

  get active() {
    return this.step >= 0;
  }

  get stepId() {
    return STEPS[this.step]?.id ?? null;
  }

  start() {
    this.goTo(0);
    this.el.classList.remove('hidden');
  }

  // Hide without marking the tutorial as done (e.g. player opened the menu).
  stop() {
    if (!this.active) return;
    this.step = -1;
    this.busy = false;
    this.el.classList.add('hidden');
    this.hand.classList.add('hidden');
    document.body.classList.remove('tut-dpad');
    this.onStepChange?.(null);
  }

  finish() {
    this.step = -1;
    this.busy = false;
    this.el.classList.add('hidden');
    this.hand.classList.add('hidden');
    document.body.classList.remove('tut-dpad');
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* private mode etc. — tutorial just shows again next time */
    }
    this.onStepChange?.(null);
  }

  goTo(i) {
    this.step = i;
    this.progress = 0;
    this.busy = false;
    this.el.classList.remove('complete');
    this.render();
    this.onStepChange?.(this.stepId);
  }

  render() {
    const s = STEPS[this.step];
    const touch = document.body.classList.contains('touch');
    const mode = touch ? 'touch' : 'desktop';
    this.el.classList.toggle('compact', touch);
    this.$('.tut-count').textContent = touch
      ? `${this.step + 1}/${STEPS.length}`
      : `Tutorial · ${this.step + 1} of ${STEPS.length}`;
    this.$('.tut-skip').textContent = touch ? 'Skip' : 'Skip tutorial';
    this.$('.tut-visual').innerHTML = touch ? '' : VISUALS[s.visual];
    this.$('.tut-title').textContent = s.title;
    this.$('.tut-text').innerHTML = s.text[mode];
    this.$('.tut-progress').style.display = s.button ? 'none' : '';
    this.$('.tut-next').style.display = s.button ? '' : 'none';
    this.$('.tut-next').textContent = s.button?.[mode] ?? '';
    document.body.classList.toggle('tut-dpad', s.id === 'move' && touch);
    this.handMode = touch ? s.hand ?? null : null;
    this.placeHand();
    this.setProgress(this.progress);
  }

  // Touch only: put the finger on the D-pad's up arrow (tap) or over the
  // island (swipe).
  placeHand() {
    const h = this.hand;
    h.classList.remove('tap', 'swipe', 'faded');
    if (!this.handMode) {
      h.classList.add('hidden');
      return;
    }
    let x = window.innerWidth / 2;
    let y = window.innerHeight * 0.55;
    if (this.handMode === 'tap') {
      const r = document.querySelector('#dpad [data-dir="up"]').getBoundingClientRect();
      x = r.left + r.width / 2;
      y = r.top + r.height / 2;
    }
    h.style.setProperty('--x', `${x}px`);
    h.style.setProperty('--y', `${y}px`);
    void h.offsetWidth; // restart the animation
    h.classList.remove('hidden');
    h.classList.add(this.handMode);
  }

  setProgress(p) {
    this.progress = Math.min(1, p);
    this.$('.tut-progress span').style.width = `${this.progress * 100}%`;
  }

  // Called by Game for every direction input (screen-relative name).
  onInput(dir) {
    if (!this.active) return;
    for (const k of this.el.querySelectorAll(`.key[data-dir="${dir}"]`)) {
      k.classList.remove('pressed');
      void k.offsetWidth; // restart the CSS animation
      k.classList.add('pressed');
    }
    if (this.stepId === 'move' && !this.busy) {
      this.setProgress(this.progress + 1 / MOVES_NEEDED);
      if (this.progress >= 1) this.complete();
    }
  }

  // Called by Game with the change in camera azimuth (radians).
  onRotate(delta) {
    if (this.stepId !== 'rotate' || this.busy) return;
    this.hand.classList.add('faded'); // get out of the way while they drag
    this.setProgress(this.progress + Math.abs(delta) / ROTATION_NEEDED);
    if (this.progress >= 1) this.complete();
  }

  complete() {
    if (!this.active || this.busy) return;
    this.busy = true;
    this.setProgress(1);
    this.el.classList.add('complete');
    this.hand.classList.add('hidden');
    sfx.plateOn();
    const last = this.step === STEPS.length - 1;
    setTimeout(() => {
      if (!this.active) return;
      if (last) this.finish();
      else this.goTo(this.step + 1);
    }, last ? 500 : 900);
  }
}
