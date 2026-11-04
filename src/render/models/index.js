// Procedural placeholder models. To use a real model later, replace one of
// these factories with a GLTF loader that returns the same shape of object.
export { makePlayer } from './player.js';
export { makeCrate, makeCrateTexture } from './crate.js';
export { makePlate } from './plate.js';
export { makeGate } from './gate.js';
export { makeExit } from './exit.js';
export { makePad } from './pad.js';
export { makeArrow } from './arrow.js';
export { makeCracked, makeCrackTexture } from './cracked.js';
export { makeSwitch, SWITCH_COLORS } from './switch.js';
export { makeSpikes, SPIKE_UP_Y, SPIKE_DOWN_Y } from './spikes.js';
