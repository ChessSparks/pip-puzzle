// Tiny tween runner. Each tween gets k in [0,1] each frame.

export const ease = {
  linear: (k) => k,
  outQuad: (k) => 1 - (1 - k) * (1 - k),
  outCubic: (k) => 1 - Math.pow(1 - k, 3),
  inOutQuad: (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2),
  outBounce: (k) => {
    const n = 7.5625;
    const d = 2.75;
    if (k < 1 / d) return n * k * k;
    if (k < 2 / d) return n * (k -= 1.5 / d) * k + 0.75;
    if (k < 2.5 / d) return n * (k -= 2.25 / d) * k + 0.9375;
    return n * (k -= 2.625 / d) * k + 0.984375;
  },
  outBack: (k) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
  },
};

export class Animator {
  constructor() {
    this.list = [];
  }

  // Background tweens (effects) don't count as busy, so they never delay input.
  add(duration, update, onDone, { background = false } = {}) {
    const a = { t: 0, duration, update, onDone, background };
    this.list.push(a);
    update(0);
    return a;
  }

  get busy() {
    return this.list.some((a) => !a.background);
  }

  tick(dt) {
    const current = this.list.slice();
    for (const a of current) {
      a.t += dt;
      const k = Math.min(1, a.t / a.duration);
      a.update(k);
      if (k >= 1) this.#complete(a);
    }
  }

  // Jump every running tween to its end state (keeps input snappy).
  finishAll() {
    let guard = 0;
    while (this.list.length && guard++ < 100) {
      for (const a of this.list.slice()) {
        a.update(1);
        this.#complete(a);
      }
    }
  }

  clear() {
    this.list.length = 0;
  }

  #complete(a) {
    const i = this.list.indexOf(a);
    if (i === -1) return;
    this.list.splice(i, 1);
    a.onDone?.();
  }
}
