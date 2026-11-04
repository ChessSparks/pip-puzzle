// Procedural sound effects (WebAudio via engine.js) — no audio files.
// Each effect takes an optional delay in seconds so it can line up with its
// animation (e.g. a plate clicks when the crate lands, not when you press).
import { storage } from '../core/storage.js';
import { audioContext, onUnlock, setMasterVolume, bell, pluck, tone, noise } from './engine.js';
import { music } from './music.js';

const MUTE_KEY = 'crateKeeper.muted';
let muted = storage.get(MUTE_KEY) === '1';
const forced = new Set(); // platform mutes by reason ('portal', 'ad')
const silent = () => muted || forced.size > 0;
const applyVolume = () => onUnlock(() => setMasterVolume(silent() ? 0 : 1));
applyVolume();

// Start time for an effect, or null when muted / no audio yet.
function at(delay = 0) {
  if (silent()) return null;
  const ac = audioContext();
  return ac && ac.state === 'running' ? ac.currentTime + delay : null;
}
const vary = (f, cents = 60) => f * 2 ** (((Math.random() * 2 - 1) * cents) / 1200);

export const sfx = {
  // Footstep: a soft tap with a little body.
  step(d) {
    const t = at(d);
    if (t === null) return;
    tone(vary(240, 120), t, { vol: 0.05, dur: 0.07, type: 'triangle', slideTo: 170, wet: 0.05 });
    noise(t, { vol: 0.025, dur: 0.04, filter: 'bandpass', from: 1800, to: 1200, q: 2, wet: 0 });
  },
  // Wooden crate scraping along, with a thump when Pip shoves.
  push(d) {
    const t = at(d);
    if (t === null) return;
    tone(vary(95, 80), t + 0.05, { vol: 0.12, dur: 0.12, slideTo: 60, wet: 0.05 });
    noise(t + 0.05, { vol: 0.07, dur: 0.2, filter: 'bandpass', from: 650, to: 380, q: 3, wet: 0.08 });
  },
  bump(d) {
    const t = at(d);
    if (t === null) return;
    tone(85, t, { vol: 0.14, dur: 0.12, slideTo: 55, wet: 0.05 });
    noise(t, { vol: 0.04, dur: 0.06, from: 900, to: 300, wet: 0 });
  },
  // Ice glide.
  slide(d) {
    const t = at(d);
    if (t === null) return;
    noise(t, { vol: 0.05, dur: 0.45, filter: 'bandpass', from: 5500, to: 3000, q: 4, wet: 0.2, attack: 0.04 });
  },
  // Crate drops in the water: plunge, splash, a few bubbles.
  splash(d) {
    const t = at(d);
    if (t === null) return;
    tone(220, t, { vol: 0.09, dur: 0.18, slideTo: 80, wet: 0.1 });
    noise(t, { vol: 0.18, dur: 0.5, filter: 'lowpass', from: 3500, to: 300, wet: 0.25 });
    for (let i = 0; i < 4; i++) {
      tone(vary(500 + i * 180, 200), t + 0.15 + i * 0.07, { vol: 0.03, dur: 0.06, slideTo: 900 + i * 200, wet: 0.3 });
    }
  },
  crunch(d) {
    const t = at(d);
    if (t === null) return;
    noise(t, { vol: 0.08, dur: 0.14, filter: 'bandpass', from: 3200, to: 1600, q: 1.2, wet: 0.05 });
    noise(t + 0.05, { vol: 0.05, dur: 0.1, filter: 'bandpass', from: 2400, to: 1400, q: 1.2, wet: 0.05 });
  },
  undo(d) {
    const t = at(d);
    if (t === null) return;
    noise(t, { vol: 0.04, dur: 0.15, filter: 'bandpass', from: 3000, to: 900, q: 1.5, wet: 0.1 });
    tone(520, t + 0.03, { vol: 0.05, dur: 0.1, type: 'triangle', slideTo: 380, wet: 0.1 });
  },
  // Plate pressed: a bright two-note chime. Released: the reverse.
  plateOn(d) {
    const t = at(d);
    if (t === null) return;
    bell(784, t, { vol: 0.07, dur: 0.9 });
    bell(1175, t + 0.08, { vol: 0.06, dur: 1.1 });
  },
  plateOff(d) {
    const t = at(d);
    if (t === null) return;
    bell(1175, t, { vol: 0.05, dur: 0.6 });
    bell(784, t + 0.08, { vol: 0.05, dur: 0.7 });
  },
  // Gate: rising chime arpeggio over a stony rumble.
  gateOpen(d) {
    const t = at(d);
    if (t === null) return;
    noise(t, { vol: 0.08, dur: 0.7, filter: 'lowpass', from: 400, to: 120, wet: 0.2, attack: 0.05 });
    [523, 659, 784, 1047].forEach((f, i) => bell(f, t + 0.1 + i * 0.07, { vol: 0.05, dur: 1.4 }));
  },
  gateClose(d) {
    const t = at(d);
    if (t === null) return;
    noise(t, { vol: 0.07, dur: 0.4, filter: 'lowpass', from: 500, to: 120, wet: 0.15 });
    tone(330, t, { vol: 0.07, dur: 0.35, type: 'triangle', slideTo: 150, wet: 0.15 });
  },
  // Portal pad: whoosh up, shimmer down.
  teleport(d) {
    const t = at(d);
    if (t === null) return;
    noise(t, { vol: 0.07, dur: 0.35, filter: 'bandpass', from: 600, to: 5000, q: 3, wet: 0.4 });
    tone(330, t, { vol: 0.06, dur: 0.3, slideTo: 1320, wet: 0.4 });
    [1568, 1319, 1047].forEach((f, i) => bell(f, t + 0.2 + i * 0.05, { vol: 0.03, dur: 0.6, wet: 0.6 }));
  },
  // Cracked floor: rumble and falling pebbles.
  crumble(d) {
    const t = at(d);
    if (t === null) return;
    noise(t, { vol: 0.14, dur: 0.6, filter: 'lowpass', from: 700, to: 90, wet: 0.2 });
    for (let i = 0; i < 6; i++) {
      noise(t + 0.08 + Math.random() * 0.35, { vol: 0.04, dur: 0.03, filter: 'bandpass', from: 2500, to: 1800, q: 4, wet: 0.2 });
    }
  },
  // Switch clunk, then the spikes slide with a metallic shing.
  switch(d) {
    const t = at(d);
    if (t === null) return;
    tone(1200, t, { vol: 0.03, dur: 0.04, type: 'square', wet: 0.05 });
    tone(140, t, { vol: 0.08, dur: 0.1, slideTo: 90, wet: 0.05 });
    noise(t + 0.08, { vol: 0.06, dur: 0.25, filter: 'highpass', from: 4000, to: 7000, q: 2, wet: 0.3 });
    bell(2637, t + 0.1, { vol: 0.015, dur: 0.4, wet: 0.4 });
  },
  hint(d) {
    const t = at(d);
    if (t === null) return;
    [1047, 1319, 1568].forEach((f, i) => bell(f, t + i * 0.06, { vol: 0.04, dur: 0.8, wet: 0.5 }));
  },
  uhOh(d) {
    const t = at(d);
    if (t === null) return;
    pluck(523, t, { vol: 0.07, dur: 0.25, type: 'triangle', bright: 2000 });
    pluck(392, t + 0.18, { vol: 0.07, dur: 0.45, type: 'triangle', bright: 1500 });
  },
  // Win: a little bell fanfare with a plucked arpeggio; the music ducks.
  win(d) {
    const t = at(d);
    if (t === null) return;
    music.duck(2.6);
    [523, 659, 784, 1047, 1319].forEach((f, i) => {
      bell(f, t + i * 0.09, { vol: 0.06, dur: 1.6, wet: 0.45 });
      pluck(f / 2, t + i * 0.09, { vol: 0.04, dur: 0.4, type: 'triangle' });
    });
    bell(2093, t + 0.55, { vol: 0.04, dur: 2.2, wet: 0.6 });
  },
  click(d) {
    const t = at(d);
    if (t === null) return;
    tone(660, t, { vol: 0.04, dur: 0.05, type: 'triangle', wet: 0 });
  },
  toggleMute() {
    muted = !muted;
    storage.set(MUTE_KEY, muted ? '1' : '0');
    applyVolume();
    return silent();
  },
  get muted() {
    return silent();
  },
  // Platform mute (the portal's mute setting, or an ad playing): silences
  // music and sounds without touching the player's saved preference.
  setForcedMute(reason, on) {
    if (on) forced.add(reason);
    else forced.delete(reason);
    applyVolume();
  },
};

// Play the right sounds for an event returned by Level.move(), timed to the
// animations in World (a push winds up first; the crate lands ~0.2 s later).
export function playMoveSounds(ev, level) {
  if (ev.type === 'bump') sfx.bump();
  if (ev.type !== 'move') return;
  const land = ev.pushed ? 0.2 : 0.1;
  ev.pushed ? sfx.push() : sfx.step();
  if (ev.pushed?.sunk) sfx.splash(ev.pushed.teleport ? 0.65 : 0.25);
  if (ev.teleport || ev.pushed?.teleport) sfx.teleport(0.12);
  if (ev.broke) sfx.crumble(0.12);
  if (ev.toggled) sfx.switch(land);
  const crateTiles = ev.pushed
    ? Math.abs(ev.pushed.to.x - ev.pushed.from.x) + Math.abs(ev.pushed.to.z - ev.pushed.from.z)
    : 0;
  if (ev.slid > 0 || crateTiles > 1) sfx.slide(0.05);
  if (ev.plateChange > 0) sfx.plateOn(land);
  if (ev.plateChange < 0) sfx.plateOff(land);
  if (ev.gateChanged) (level.gateOpen ? sfx.gateOpen : sfx.gateClose)(land + 0.1);
  if (ev.won) sfx.win(0.15);
}
