// Procedural sound effects via WebAudio — no audio files needed.
import { storage } from '../core/storage.js';

let ctx = null;
const MUTE_KEY = 'crateKeeper.muted';
let muted = null; // player's own toggle, read from storage on first use
const forced = new Set(); // platform mutes by reason ('portal', 'ad')
const playerMuted = () => (muted ??= storage.get(MUTE_KEY) === '1');
const isMuted = () => forced.size > 0 || playerMuted();

function audio() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, dur, { type = 'sine', vol = 0.12, slideTo = null, delay = 0 } = {}) {
  if (isMuted()) return;
  const ac = audio();
  const t0 = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

// Short burst of filtered noise (splashes).
function noise(dur, { vol = 0.2, from = 1800, to = 300 } = {}) {
  if (isMuted()) return;
  const ac = audio();
  const t0 = ac.currentTime;
  const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * dur), ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(from, t0);
  filter.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter).connect(gain).connect(ac.destination);
  src.start(t0);
}

export const sfx = {
  splash: () => {
    noise(0.45, { vol: 0.25 });
    tone(180, 0.2, { vol: 0.08, slideTo: 90 });
  },
  slide: () => noise(0.35, { vol: 0.08, from: 6000, to: 2500 }),
  click: () => tone(520, 0.05, { type: 'triangle', vol: 0.06 }),
  step: () => tone(260, 0.07, { type: 'triangle', vol: 0.06, slideTo: 200 }),
  push: () => tone(120, 0.14, { type: 'sawtooth', vol: 0.04, slideTo: 80 }),
  bump: () => tone(90, 0.09, { vol: 0.12, slideTo: 60 }),
  undo: () => tone(380, 0.07, { vol: 0.06, slideTo: 280 }),
  plateOn: () => tone(660, 0.18, { vol: 0.1, slideTo: 990 }),
  plateOff: () => tone(520, 0.18, { vol: 0.08, slideTo: 340 }),
  gateOpen: () => {
    tone(196, 0.5, { type: 'triangle', vol: 0.12, slideTo: 392 });
    tone(294, 0.5, { type: 'sine', vol: 0.08, slideTo: 587, delay: 0.08 });
  },
  gateClose: () => tone(300, 0.35, { type: 'triangle', vol: 0.1, slideTo: 140 }),
  win: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.35, { type: 'triangle', vol: 0.1, delay: i * 0.11 }));
  },
  toggleMute() {
    muted = !playerMuted();
    storage.set(MUTE_KEY, muted ? '1' : '0');
    return isMuted();
  },
  get muted() {
    return isMuted();
  },
  // Platform mute (portal setting or an ad playing): silences sounds already
  // playing too, without touching the player's saved preference.
  setForcedMute(reason, on) {
    if (on) forced.add(reason);
    else forced.delete(reason);
    if (ctx) (forced.size ? ctx.suspend() : ctx.resume()).catch(() => {});
  },
};

// Play the right sounds for an event returned by Level.move().
export function playMoveSounds(ev, level) {
  if (ev.type === 'bump') sfx.bump();
  if (ev.type !== 'move') return;
  ev.pushed ? sfx.push() : sfx.step();
  if (ev.pushed?.sunk) setTimeout(sfx.splash, 170);
  const crateTiles = ev.pushed
    ? Math.abs(ev.pushed.to.x - ev.pushed.from.x) + Math.abs(ev.pushed.to.z - ev.pushed.from.z)
    : 0;
  if (ev.slid > 0 || crateTiles > 1) sfx.slide();
  if (ev.plateChange > 0) sfx.plateOn();
  if (ev.plateChange < 0) sfx.plateOff();
  if (ev.gateChanged) (level.gateOpen ? sfx.gateOpen : sfx.gateClose)();
  if (ev.won) sfx.win();
}
