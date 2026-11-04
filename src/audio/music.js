// Generative background music, one mood per chapter theme (render/themes.js
// names). A look-ahead scheduler plays eighth-note steps: a looping chord
// progression with bass, pad, a plucked melody (phrases A A B A, generated
// once per mood so they repeat like a real tune), sparkling bells and light
// percussion. Switching mood crossfades.
import { storage } from '../core/storage.js';
import { audioContext, bus, onUnlock, midiToFreq, pluck, pad, bass, bell, kick, hat, shaker, snare } from './engine.js';

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];
const MIXO = [0, 2, 4, 5, 7, 9, 10];

// root: MIDI note of the key · prog: chord roots as scale degrees (one per bar)
// lead: melody voice · density: chance of a melody note per step
// bells: chance of a bell per beat · drums: pattern name
const MOODS = {
  meadow: { root: 60, scale: MAJOR, bpm: 96, prog: [0, 4, 5, 3], lead: 'pluck', density: 0.5, bells: 0.08, drums: 'soft', vol: 1 },
  blossom: { root: 65, scale: LYDIAN, bpm: 100, prog: [0, 1, 4, 0], lead: 'pluck', density: 0.55, bells: 0.15, drums: 'soft', vol: 1 },
  river: { root: 62, scale: MAJOR, bpm: 90, prog: [0, 5, 3, 4], lead: 'harp', density: 0.65, bells: 0.08, drums: 'shaker', vol: 1 },
  frost: { root: 57, scale: MINOR, bpm: 72, prog: [0, 5, 2, 6], lead: 'bell', density: 0.3, bells: 0.25, drums: null, vol: 1 },
  thaw: { root: 55, scale: MAJOR, bpm: 84, prog: [0, 2, 5, 4], lead: 'harp', density: 0.45, bells: 0.15, drums: 'shaker', vol: 1 },
  summit: { root: 63, scale: MAJOR, bpm: 88, prog: [0, 3, 5, 4], lead: 'pluck', density: 0.45, bells: 0.12, drums: 'soft', vol: 1 },
  twilight: { root: 52, scale: MINOR, bpm: 70, prog: [0, 5, 3, 6], lead: 'bell', density: 0.35, bells: 0.3, drums: null, vol: 1.1 },
  canyon: { root: 62, scale: DORIAN, bpm: 104, prog: [0, 3, 0, 6], lead: 'pluck', density: 0.5, bells: 0.04, drums: 'hand', vol: 1 },
  autumn: { root: 55, scale: MIXO, bpm: 100, prog: [0, 6, 3, 0], lead: 'harp', density: 0.55, bells: 0.08, drums: 'soft', vol: 1 },
  forge: { root: 48, scale: MINOR, bpm: 108, prog: [0, 5, 6, 4], lead: 'pluck', density: 0.45, bells: 0.04, drums: 'forge', vol: 0.95 },
};

const MUSIC_KEY = 'crateKeeper.music';
const VOLUME = 0.55; // music bus level relative to sound effects
const LOOKAHEAD = 0.15; // seconds scheduled ahead
const STEPS = 8; // eighth notes per bar

// Small seeded RNG so a mood's phrases are the same every time.
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// MIDI note of scale degree `d` (any integer; wraps into octaves).
const degree = (m, d) => m.root + m.scale[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);

// One phrase: per bar, per step, a scale degree or null (rest). Mostly chord
// tones on strong beats, stepwise motion in between.
function makePhrase(m, rand) {
  let cur = m.prog[0] + 7;
  return m.prog.map((root) => Array.from({ length: STEPS }, (_, s) => {
    const strong = s % 2 === 0;
    if (rand() > m.density * (strong ? 1.2 : 0.7)) return null;
    if (strong && rand() < 0.6) {
      const tones = [root, root + 2, root + 4].map((d) => d + 7);
      cur = tones.reduce((a, b) => (Math.abs(b - cur) < Math.abs(a - cur) ? b : a));
      if (rand() < 0.3) cur = tones[Math.floor(rand() * 3)];
    } else {
      cur += rand() < 0.5 ? 1 : -1;
    }
    cur = Math.max(m.prog[0] + 4, Math.min(m.prog[0] + 13, cur));
    return cur;
  }));
}

class Music {
  constructor() {
    this.enabled = storage.get(MUSIC_KEY) !== '0';
    this.mood = null;
    this.name = null;
    this.timer = null;
    this.gain = null; // per-mood fader inside the music bus
  }

  // Choose the music for a theme name (themes.js). Crossfades if playing.
  setMood(name) {
    const next = MOODS[name] ? name : 'meadow';
    if (next === this.name) return;
    this.name = next;
    onUnlock(() => this.restart());
  }

  setEnabled(on) {
    this.enabled = on;
    storage.set(MUSIC_KEY, on ? '1' : '0');
    if (on) onUnlock(() => this.restart());
    else this.fadeOut();
  }

  // Duck under a sound (e.g. the win fanfare) for `seconds`.
  duck(seconds) {
    const ac = audioContext();
    if (!ac || !bus.music) return;
    const t = ac.currentTime;
    bus.music.gain.cancelScheduledValues(t);
    bus.music.gain.setTargetAtTime(VOLUME * 0.25, t, 0.08);
    bus.music.gain.setTargetAtTime(VOLUME, t + seconds, 0.6);
  }

  fadeOut() {
    clearInterval(this.timer);
    this.timer = null;
    if (this.gain) {
      const ac = audioContext();
      const g = this.gain;
      g.gain.setTargetAtTime(0.0001, ac.currentTime, 0.4);
      setTimeout(() => g.disconnect(), 2500);
      this.gain = null;
    }
  }

  restart() {
    this.fadeOut();
    if (!this.enabled || !this.name) return;
    const ac = audioContext();
    if (!ac) return;
    bus.music.gain.cancelScheduledValues(ac.currentTime);
    bus.music.gain.setValueAtTime(VOLUME, ac.currentTime);
    const m = MOODS[this.name];
    this.mood = m;
    const rand = rng(this.name.length * 977 + m.root * 31);
    this.phrases = [makePhrase(m, rand), makePhrase(m, rand)];
    this.rand = rng(m.bpm * 13 + 7);
    this.gain = ac.createGain();
    this.gain.gain.setValueAtTime(0.0001, ac.currentTime);
    this.gain.gain.setTargetAtTime(m.vol, ac.currentTime + 0.6, 0.8);
    this.gain.connect(bus.music);
    this.step = 0;
    this.next = ac.currentTime + 0.7; // start after the old mood fades
    this.timer = setInterval(() => this.schedule(), 40);
  }

  schedule() {
    const ac = audioContext();
    while (this.next < ac.currentTime + LOOKAHEAD) {
      this.playStep(this.step, this.next);
      this.step++;
      this.next += 60 / this.mood.bpm / 2;
    }
  }

  playStep(step, t) {
    const m = this.mood;
    const dest = this.gain;
    const beat = 60 / m.bpm;
    const bar = Math.floor(step / STEPS);
    const s = step % STEPS;
    const ci = bar % m.prog.length;
    const root = m.prog[ci];
    const loop = Math.floor(bar / m.prog.length);
    const r = this.rand;

    // Pad + bass at the start of each bar.
    if (s === 0) {
      const chord = [root, root + 2, root + 4].map((d) => midiToFreq(degree(m, d)));
      pad(chord, t, { dur: beat * 4.2, dest, vol: 0.022, cutoff: this.name === 'forge' ? 700 : 1200 });
    }
    if (s === 0 || s === 4 || (s === 6 && r() < 0.4)) {
      const note = degree(m, root) - 24 + (s === 6 ? 7 : 0);
      bass(midiToFreq(note), t, { dur: beat * (s === 6 ? 0.9 : 1.6), dest, vol: 0.1, type: this.name === 'forge' ? 'sawtooth' : 'triangle' });
    }

    // Melody: phrases A A B A, then a quiet loop every fourth time round.
    const phrase = this.phrases[loop % 4 === 2 ? 1 : 0];
    const d = loop % 8 === 7 ? null : phrase[ci][s];
    if (d !== null) {
      const f = midiToFreq(degree(m, d));
      if (m.lead === 'bell') bell(f, t, { dest, vol: 0.05, dur: beat * 3, wet: 0.5 });
      else if (m.lead === 'harp') pluck(f, t, { dest, vol: 0.06, dur: beat * 2, type: 'triangle', bright: 2500, wet: 0.4 });
      else pluck(f, t, { dest, vol: 0.05, dur: beat * 1.4, bright: 3000, wet: 0.3 });
    }

    // Sparkles high above.
    if (s % 2 === 0 && r() < m.bells) {
      const tones = [root, root + 2, root + 4];
      bell(midiToFreq(degree(m, tones[Math.floor(r() * 3)] + 14)), t, { dest, vol: 0.025, dur: 2, wet: 0.7 });
    }

    // Percussion.
    switch (m.drums) {
      case 'soft':
        if (s === 0 || s === 4) kick(t, { dest, vol: 0.12 });
        if (s % 2 === 1) hat(t, { dest, vol: 0.018 });
        break;
      case 'shaker':
        if (s % 2 === 1 || r() < 0.2) shaker(t, { dest, vol: 0.02 });
        break;
      case 'hand':
        if (s === 0 || s === 3 || s === 6) kick(t, { dest, vol: 0.1 });
        if (s === 4) snare(t, { dest, vol: 0.035 });
        if (s % 2 === 1) shaker(t, { dest, vol: 0.02 });
        break;
      case 'forge':
        if (s === 0 || s === 3 || s === 5) kick(t, { dest, vol: 0.16 });
        if (s === 4) snare(t, { dest, vol: 0.06 });
        hat(t, { dest, vol: s % 2 ? 0.02 : 0.01 });
        break;
      default:
    }
  }
}

export const music = new Music();
