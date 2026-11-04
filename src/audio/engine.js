// Shared WebAudio engine: one context, a master volume, separate buses for
// music and sound effects, a generated reverb, and small synth "instruments"
// used by both music.js and sfx.js. No audio files.
//
// Browsers only allow audio after a user gesture, so the context is created
// (or resumed) on the first key press / tap; until then nothing plays.
//
// Every instrument takes a start time `t` (context seconds) and a `dest`
// bus, so music can be scheduled ahead precisely.

let ctx = null;
let master = null;
const OUTPUT = 2.5; // overall loudness (the limiter after it keeps peaks safe)
export const bus = { music: null, sfx: null, reverb: null };
const unlockListeners = [];

export function audioContext() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    // buses -> master (volume, mute) -> limiter -> speakers. The limiter is
    // last, so nothing after it can push peaks into clipping.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 4;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.2;
    limiter.connect(ctx.destination);
    master = ctx.createGain();
    master.gain.value = OUTPUT;
    master.connect(limiter);
    bus.reverb = makeReverb(2.4);
    bus.reverb.output.connect(master);
    bus.music = ctx.createGain();
    bus.sfx = ctx.createGain();
    for (const b of [bus.music, bus.sfx]) b.connect(master);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export const now = () => (ctx ? ctx.currentTime : 0);
export const ready = () => !!ctx && ctx.state === 'running';

export function setMasterVolume(v) {
  if (audioContext()) master.gain.setTargetAtTime(v * OUTPUT, ctx.currentTime, 0.05);
}

// Run `fn` once audio is allowed (immediately if it already is).
export function onUnlock(fn) {
  if (ready()) fn();
  else unlockListeners.push(fn);
}

function unlock() {
  const ac = audioContext();
  if (!ac) return;
  const fire = () => {
    while (unlockListeners.length) unlockListeners.shift()();
  };
  if (ac.state === 'running') fire();
  else ac.resume().then(fire, () => {});
}
for (const type of ['pointerdown', 'keydown', 'touchstart']) {
  window.addEventListener(type, unlock, { capture: true, passive: true });
}
// Pause all audio while the tab is hidden.
document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  if (document.hidden) ctx.suspend();
  else ctx.resume();
});

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

export const midiToFreq = (m) => 440 * 2 ** ((m - 69) / 12);

// Route a voice to `dest` plus a reverb send.
function out(node, dest, wet) {
  node.connect(dest);
  if (wet > 0) {
    const send = ctx.createGain();
    send.gain.value = wet;
    node.connect(send).connect(bus.reverb.input);
  }
}

// Attack/decay envelope on a fresh gain node.
function envelope(t, attack, hold, release, peak) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  if (hold > 0) g.gain.setValueAtTime(peak, t + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
  return g;
}

function osc(type, freq, t, end, detune = 0) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.detune.value = detune;
  o.start(t);
  o.stop(end + 0.05);
  return o;
}

let noiseBuf = null;
function noiseBuffer() {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

// Reverb: a convolver with a generated, exponentially decaying noise tail.
function makeReverb(seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  }
  const input = ctx.createGain();
  const conv = ctx.createConvolver();
  conv.buffer = ir;
  const output = ctx.createGain();
  output.gain.value = 0.5;
  input.connect(conv).connect(output);
  return { input, output };
}

// ---------------------------------------------------------------------------
// Instruments
// ---------------------------------------------------------------------------

// Bell / chime: sine partials with fast-decaying overtones.
export function bell(freq, t, { vol = 0.1, dur = 1.2, dest = bus.sfx, wet = 0.35 } = {}) {
  for (const [ratio, amp, decay] of [[1, 1, 1], [2.01, 0.45, 0.55], [3.98, 0.2, 0.3], [5.43, 0.08, 0.18]]) {
    const g = envelope(t, 0.005, 0, dur * decay, vol * amp);
    osc('sine', freq * ratio, t, t + dur * decay).connect(g);
    out(g, dest, wet);
  }
}

// Plucked string: bright saw/triangle through a closing low-pass.
export function pluck(freq, t, { vol = 0.08, dur = 0.5, dest = bus.sfx, wet = 0.25, bright = 3500, type = 'sawtooth' } = {}) {
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.Q.value = 2;
  f.frequency.setValueAtTime(bright, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(200, freq * 1.5), t + dur * 0.6);
  const g = envelope(t, 0.004, 0, dur, vol);
  osc(type, freq, t, t + dur).connect(f).connect(g);
  out(g, dest, wet);
}

// Soft pad: detuned saws through a low-pass, slow attack and release.
export function pad(freqs, t, { vol = 0.03, dur = 2, dest = bus.music, wet = 0.5, cutoff = 1100, attack = 0.5 } = {}) {
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = cutoff;
  const g = envelope(t, attack, Math.max(0, dur - attack - 0.6), 0.9, vol);
  f.connect(g);
  for (const freq of freqs) {
    for (const d of [-8, 7]) osc('sawtooth', freq, t, t + dur + 0.4, d).connect(f);
  }
  out(g, dest, wet);
}

// Round bass note.
export function bass(freq, t, { vol = 0.12, dur = 0.5, dest = bus.music, type = 'triangle' } = {}) {
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 600;
  const g = envelope(t, 0.01, dur * 0.4, dur * 0.6, vol);
  osc(type, freq, t, t + dur).connect(f).connect(g);
  out(g, dest, 0.05);
}

// Simple tone with an optional pitch glide.
export function tone(freq, t, { vol = 0.08, dur = 0.2, type = 'sine', slideTo = null, dest = bus.sfx, wet = 0.15, attack = 0.005 } = {}) {
  const o = osc(type, freq, t, t + dur);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = envelope(t, attack, 0, dur, vol);
  o.connect(g);
  out(g, dest, wet);
}

// Filtered noise burst: `filter` sweeps from `from` to `to` Hz.
export function noise(t, { vol = 0.1, dur = 0.3, filter = 'lowpass', from = 2000, to = 400, q = 1, dest = bus.sfx, wet = 0.1, attack = 0.005 } = {}) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer();
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.Q.value = q;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = envelope(t, attack, 0, dur, vol);
  src.connect(f).connect(g);
  out(g, dest, wet);
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur + 0.05);
}

// Drums.
export function kick(t, { vol = 0.25, dest = bus.music } = {}) {
  tone(120, t, { vol, dur: 0.22, slideTo: 45, dest, wet: 0 });
}
export function hat(t, { vol = 0.03, dest = bus.music } = {}) {
  noise(t, { vol, dur: 0.05, filter: 'highpass', from: 7000, to: 9000, dest, wet: 0.05 });
}
export function shaker(t, { vol = 0.025, dest = bus.music } = {}) {
  noise(t, { vol, dur: 0.09, filter: 'bandpass', from: 5000, to: 6500, q: 1.5, dest, wet: 0.05, attack: 0.02 });
}
export function snare(t, { vol = 0.06, dest = bus.music } = {}) {
  noise(t, { vol, dur: 0.16, filter: 'bandpass', from: 2200, to: 1500, q: 0.8, dest, wet: 0.2 });
  tone(190, t, { vol: vol * 0.8, dur: 0.1, slideTo: 140, dest, wet: 0 });
}
