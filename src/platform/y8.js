// Y8 minimal SDK 2.0 wrapper. Everything here is optional: if the SDK script
// can't load (offline, ad blocker), every call is a no-op and the game plays
// exactly as before. Y8 has no loading/gameplay/happytime events, so those
// stay no-ops; only the "Next level" break ad is used. Saves stay in
// localStorage.

const SDK_URL = 'https://cdn.y8.com/minimal-sdk/2-0/y8.min.js';
const APP_ID = '6aba2d2cf1925a64d362edea';
const GAME_ID = '284895';
const LOAD_TIMEOUT = 5000;

let sdk = null; // y8.sdk() once initialised
let inAd = false;

// Load the script and wait for its `y8sdk.ready` event (or time out).
function loadSdk() {
  return new Promise((resolve, reject) => {
    window.addEventListener('y8sdk.ready', () => resolve(window.y8.sdk()), { once: true });
    const s = document.createElement('script');
    s.src = SDK_URL;
    s.async = true;
    s.onload = () => window.y8?.emitReadyEvent?.(); // in case it was ready before we listened
    s.onerror = reject;
    document.head.append(s);
    setTimeout(() => reject(new Error('Y8 SDK load timed out')), LOAD_TIMEOUT);
  });
}

export const platform = {
  // Called by the game while an ad plays: (true) = pause + mute, (false) = resume.
  onAdPause: null,
  // Y8 has no portal mute setting; kept for the shared interface.
  onMuteSetting: null,

  async init() {
    // ?nosdk skips the SDK (headless tools, debugging).
    if (new URLSearchParams(location.search).has('nosdk')) return;
    try {
      const s = await loadSdk();
      s.init(
        { appId: APP_ID, autoLogin: true },
        { gameId: GAME_ID, preloadAdBreaks: 'on', sound: 'on', onReady: () => {} },
      );
      s.onAuth?.(() => {});
      sdk = s;
    } catch (e) {
      console.warn('[Y8] SDK unavailable, running standalone.', e);
      sdk = null;
    }
  },

  get enabled() {
    return !!sdk;
  },
  get muteAudio() {
    return false;
  },

  loadingStart() {},
  loadingStop() {},
  gameplayStart() {},
  gameplayStop() {},
  happytime() {},

  // Break ad at a natural pause ("Next level"). Resolves when it's over,
  // was skipped, or failed; never rejects. The SDK decides whether an ad
  // actually shows (frequency capping).
  midgameAd() {
    if (!sdk || inAd) return Promise.resolve();
    return new Promise((resolve) => {
      let done = false;
      const end = () => {
        if (done) return;
        done = true;
        if (inAd) {
          inAd = false;
          this.onAdPause?.(false);
        }
        resolve();
      };
      try {
        Promise.resolve(
          sdk.showAd({
            type: 'next',
            name: 'level-complete',
            beforeAd: () => {
              inAd = true;
              this.onAdPause?.(true);
            },
            afterAd: end,
            adBreakDone: end,
          }),
        ).catch((e) => {
          console.warn('[Y8]', e);
          end();
        });
      } catch (e) {
        console.warn('[Y8]', e);
        end();
      }
    });
  },
};
