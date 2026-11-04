// Player settings (via storage.js). Effects quality:
//   'high'  bloom, full resolution, grass, full weather
//   'low'   for slower devices: no bloom, lower resolution, no grass, less weather
// Saved as 'high' / 'low' when the player picks, or 'auto-low' when the game
// switched itself down because it ran slowly (the player can switch back).
import { storage } from './storage.js';

const QUALITY_KEY = 'crateKeeper.quality';

export const settings = {
  get quality() {
    return storage.get(QUALITY_KEY) === 'high' || !storage.get(QUALITY_KEY)
      ? 'high'
      : 'low';
  },
  // Did the player choose the quality themselves? (Then never auto-switch.)
  get qualityChosen() {
    const v = storage.get(QUALITY_KEY);
    return v === 'high' || v === 'low';
  },
  setQuality(q, { auto = false } = {}) {
    storage.set(QUALITY_KEY, auto ? `auto-${q}` : q);
  },
};
