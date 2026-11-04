// Standalone platform (itch.io, local): no portal SDK, every call is a no-op.
// The Y8 build swaps in ./y8.js instead (see vite.config.js,
// alias `#platform`); both export the same `platform` object.
export const platform = {
  onAdPause: null,
  onMuteSetting: null,
  async init() {},
  get enabled() {
    return false;
  },
  get muteAudio() {
    return false;
  },
  loadingStart() {},
  loadingStop() {},
  gameplayStart() {},
  gameplayStop() {},
  happytime() {},
  midgameAd() {
    return Promise.resolve();
  },
};
